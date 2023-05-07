import { getLogger } from '../utils';
import { createClient } from 'redis';
import { HandlerAuxBase, HandlerPluginBase } from './base';

const logger = getLogger(__filename);

export interface RedisConfig {
  url: string;
  name?: string;
}

export class Redis {
  private client: ReturnType<typeof createClient>;
  constructor(config: RedisConfig) {
    logger.debug(`Redis config ${JSON.stringify(config)}}`);
    this.client = createClient(config);
  }

  get redis() {
    return this.client;
  }
}

export interface RedisPluginAux extends HandlerAuxBase {
  redis: Redis;
}

export class RedisPlugin extends HandlerPluginBase<RedisPluginAux> {
  private redis: Redis;

  constructor(config: RedisConfig) {
    super();
    this.redis = new Redis(config);
  }

  public create = async () => {
    return { redis: this.redis };
  };

  public destroy = async () => {
    await this.redis.redis.quit();
  };
}

const build = (config: RedisConfig) => new RedisPlugin(config);
export default build;
