import { v4 as uuid4 } from 'uuid';
import {
  loadAWSConfig,
  SimpleAWSConfig,
  SimpleAWSConfigLoadParam,
} from '../aws';
import { getLogger, stringifyError } from '../utils';

import { HandlerAuxBase, HandlerContext, HandlerPluginBase } from './base';
import { SQS } from '../aws/sqs';

const logger = getLogger(__filename);

interface ITracerLog {
  uuid: string;
  timestamp: number;
  key: string;
  system: string;
  body: string;
  error: boolean;
  client: string;
  version: string;
}

interface ITracerLogInput {
  route?: string;
  key?: string;
  system?: string;
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
    public readonly key: string,
    public readonly system: string,
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
  private sqs: SQS;
  private buffer: TracerLog[];

  constructor(queueName: string, sqs: SQS) {
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
      const eventQueueUrl = await this.sqs.getQueueUrl(this.queueName);

      const chunkSize = 10;
      for (let begin = 0; begin < this.buffer.length; begin += chunkSize) {
        const end = Math.min(this.buffer.length, begin + chunkSize);
        const subset = this.buffer.slice(begin, end);
        const sendBatchResult = await this.sqs.enqueueBatch(
          eventQueueUrl,
          subset.map(each => ({
            id: `${each.key}_${each.uuid}`,
            data: JSON.stringify(each),
          })),
        );
        logger.all(`sendBatchResult`, sendBatchResult);
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
    private system: string,
    private key: string,
    private client: string,
    private version: string,
  ) {}

  public push = (body: string, error: boolean = false) => {
    this.tracer.push(
      new TracerLog(
        this.key,
        this.system,
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
        log.key || this.key,
        log.system || this.system,
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
    this.client = {
      agent: '',
      version: '',
    };
  }

  public create = async () => {
    const awsConfig = this.options.awsConfig
      ? await loadAWSConfig(this.options.awsConfig)
      : undefined;

    const sqs = new SQS(
      awsConfig ??
        new SimpleAWSConfig({
          sqs: { region: this.options.region ?? 'us-west-2' },
        }),
    );

    this.tracer = new Tracer(this.options.queueName, sqs);
    const tracer = (key: string, action: string) => {
      this.last = { key, action };
      return new TracerWrapper(
        this.tracer,
        this.options.system,
        key,
        this.client.agent,
        this.client.version,
      );
    };
    return { tracer };
  };

  public begin = ({ request }: HandlerContext<TracerPluginAux>) => {
    this.client.version = request.header('Version') || '0.0.0';
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
        typeof request.lastError === 'string'
          ? request.lastError
          : stringifyError(request.lastError),
        true,
      );
  };
}

const build = (options: TracerPluginOptions) => new TracerPlugin(options);
export default build;
