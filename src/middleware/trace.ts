import * as AWS from 'aws-sdk'; // tslint:disable-line
import { v4 as uuid4 } from 'uuid';
import {
  AWSComponent,
  loadAWSConfig,
  SimpleAWS,
  SimpleAWSConfigLoadParam,
} from '../aws';
import { getLogger, stringifyError } from '../utils';

import { $enum } from 'ts-enum-util';
import { HandlerAuxBase, HandlerContext, HandlerPluginBase } from './base';

const logger = getLogger(__filename);

interface ITracerLog {
  uuid: string;
  timestamp: number;
  route: string;
  key: string;
  system: string;
  action: string;
  attribute: string;
  body: string;
  error: boolean;
  client: string;
  version: string;
}

interface ITracerLogInput {
  route?: string;
  key?: string;
  system?: string;
  action?: string;
  attribute: string;
  body: string;
  error?: boolean;
  client?: string;
  version?: string;
}

export class TracerLog implements ITracerLog {
  public readonly uuid: string;
  public readonly timestamp: number;

  constructor(
    public readonly route: string,
    public readonly key: string,
    public readonly system: string,
    public readonly action: string,
    public readonly attribute: string,
    public readonly body: string,
    public readonly error: boolean,
    public readonly client: string,
    public readonly version: string,
  ) {
    this.uuid = uuid4();
    this.timestamp = Date.now();
  }
}

export class Tracer {
  private queueName: string;
  private sqs: AWS.SQS;
  private buffer: TracerLog[];

  constructor(queueName: string, sqs: AWS.SQS) {
    this.queueName = queueName;
    this.sqs = sqs;
    this.buffer = [];
  }

  public push = (log: TracerLog) => this.buffer.push(log);

  public flush = async () => {
    if (this.buffer.length === 0) {
      return;
    }
    try {
      const urlResult = await this.sqs
        .getQueueUrl({
          QueueName: this.queueName,
        })
        .promise();
      logger.stupid(`urlResult`, urlResult);
      if (!urlResult.QueueUrl) {
        throw new Error(`No queue url with name[${this.queueName}]`);
      }
      const eventQueueUrl = urlResult.QueueUrl;

      const chunkSize = 10;
      for (let begin = 0; begin < this.buffer.length; begin += chunkSize) {
        const end = Math.min(this.buffer.length, begin + chunkSize);
        const subset = this.buffer.slice(begin, end);
        const sendBatchResult = await this.sqs
          .sendMessageBatch({
            QueueUrl: eventQueueUrl,
            Entries: subset.map(each => ({
              Id: `${each.key}_${each.uuid}`,
              MessageBody: JSON.stringify(each),
            })),
          })
          .promise();
        logger.stupid(`sendBatchResult`, sendBatchResult);
      }

      this.buffer = [];
    } catch (error) {
      logger.warn(`Error in eventSource: ${error}`);
    }
  };
}

export class TracerWrapper {
  constructor(
    private tracer: Tracer,
    private route: string,
    private system: string,
    private key: string,
    private action: string,
    private client: string,
    private version: string,
  ) {}

  public push = (attribute: string, body: string, error: boolean = false) => {
    this.tracer.push(
      new TracerLog(
        this.route,
        this.key,
        this.system,
        this.action,
        attribute,
        body,
        error,
        this.client,
        this.version,
      ),
    );
  };

  public send = (log: ITracerLogInput) => {
    this.tracer.push(
      new TracerLog(
        log.route || this.route,
        log.key || this.key,
        log.system || this.system,
        log.action || this.action,
        log.attribute,
        log.body,
        log.error || false,
        log.client || this.client,
        log.version || this.version,
      ),
    );
  };
}

export interface TracerPluginOptions {
  route: string;
  queueName: string;
  system: string;

  awsConfig?: SimpleAWSConfigLoadParam;
  region?: string;
}

export interface TracerPluginAux extends HandlerAuxBase {
  tracer: (key: string, action: string) => TracerWrapper;
}

export class TracerPlugin extends HandlerPluginBase<TracerPluginAux> {
  private tracer: Tracer;
  private options: TracerPluginOptions;
  private last: { key: string; action: string };
  private client: { agent: string; version: string };

  constructor(options: TracerPluginOptions) {
    super();
    this.options = options;
    this.last = {
      key: 'nothing',
      action: 'unknown',
    };
    this.client = {
      agent: '',
      version: '',
    };
  }

  public create = async () => {
    const awsConfig = this.options.awsConfig
      ? await loadAWSConfig(this.options.awsConfig)
      : undefined;

    const sqs = (() => {
      if (!awsConfig) {
        return new AWS.SQS({
          region: this.options.region,
        });
      }
      $enum(AWSComponent).forEach(eachComponent => {
        const config = awsConfig.get(eachComponent);
        if (config) {
          config.region = this.options.region;
        }
      });
      return new SimpleAWS(awsConfig).sqs;
    })();

    this.tracer = new Tracer(this.options.queueName, sqs);
    const tracer = (key: string, action: string) => {
      this.last = { key, action };
      return new TracerWrapper(
        this.tracer,
        this.options.route,
        this.options.system,
        key,
        action,
        this.client.agent,
        this.client.version,
      );
    };
    return { tracer };
  };

  public begin = ({ request }: HandlerContext<TracerPluginAux>) => {
    this.client.version = request.header('X-Version') || '0.0.0';
    this.client.agent = (() => {
      const fromHeader = request.header('User-Agent');
      if (fromHeader) {
        return fromHeader;
      }
      if (
        request.context &&
        request.context.identity &&
        request.context.identity.userAgent
      ) {
        return request.context.identity.userAgent;
      }
      return '';
    })();
  };

  public end = () => this.tracer.flush();

  public error = ({ request, aux }: HandlerContext<TracerPluginAux>) => {
    if (!aux) {
      console.warn('Aux is not initialized');
      return;
    }
    if (!request.lastError) {
      return;
    }

    const { key, action } = this.last;
    aux
      .tracer(key, action)
      .push(
        'error',
        typeof request.lastError === 'string'
          ? request.lastError
          : stringifyError(request.lastError),
        true,
      );
  };
}

const build = (options: TracerPluginOptions) => new TracerPlugin(options);
export default build;
