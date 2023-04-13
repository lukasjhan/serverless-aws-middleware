import {
  loadAWSConfig,
  SimpleAWS,
  SimpleAWSConfig,
  SimpleAWSConfigLoadParam,
} from '../aws';
import { getLogger } from '../utils';
import { HandlerAuxBase, HandlerPluginBase } from './base';

const logger = getLogger(__filename);

type InitializerMapper = (
  aws: SimpleAWS,
  env: {},
) => { [name: string]: () => Promise<boolean> };

const initialize = async (aws: SimpleAWS, mapper: InitializerMapper) => {
  const env = process.env;
  const mapping = mapper(aws, env);
  const successes = await Promise.all(
    Object.keys(mapping).map(name => mapping[name]()),
  );
  return Object.keys(mapping).reduce(
    (result, name, index) => ({ ...result, [name]: successes[index] }),
    {},
  );
};

export interface AWSPluginOptions {
  config?: SimpleAWSConfigLoadParam;
  mapper?: InitializerMapper;
}

export interface AWSPluginAux extends HandlerAuxBase {
  aws: SimpleAWS;
  awsConfig: SimpleAWSConfig;
}

export class AWSPlugin extends HandlerPluginBase<AWSPluginAux> {
  private options?: AWSPluginOptions;
  private aws?: SimpleAWS;
  private config: SimpleAWSConfig;

  constructor(options?: AWSPluginOptions) {
    super();
    this.options = options;
    this.config = new SimpleAWSConfig();
  }

  public create = async () => {
    // Setup only once.
    if (!this.aws) {
      const { config, mapper } = this.options || {
        config: undefined,
        mapper: undefined,
      };

      if (config) {
        logger.debug(`Load aws config from ${config}`);
        this.config = await loadAWSConfig(config);
      }

      this.aws = new SimpleAWS(this.config);

      if (mapper) {
        logger.debug(`Initialize aws components with mapper.`);
        await initialize(this.aws, mapper);
      }
    }
    return {
      aws: this.aws,
      awsConfig: this.config,
    };
  };
}

const build = (options?: AWSPluginOptions) => new AWSPlugin(options);
export default build;
