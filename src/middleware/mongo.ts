import mongoose from 'mongoose';
import { getLogger } from '../utils';
import { HandlerAuxBase, HandlerPluginBase } from './base';

const logger = getLogger(__filename);

export interface MongoDBConfig {
  url: string;
  options?: mongoose.ConnectOptions;
}

export class MongoDB {
  constructor(private config: MongoDBConfig) {}

  public connect = async () => {
    logger.debug(`Connect to MongoDB ${this.config.url}`);
    await mongoose.connect(this.config.url, this.config.options);
  };

  public disconnect = async () => {
    logger.debug(`Disconnect from MongoDB ${this.config.url}`);
    await mongoose.disconnect();
  };

  public get = () => mongoose;

  public getModel = <T>(name: string, schema: mongoose.Schema) => {
    const model = mongoose.model<T>(name, schema);
    return model;
  };
}

export interface MongoDBPluginAux extends HandlerAuxBase {
  mongo: MongoDB;
}

export class MongoDBPlugin extends HandlerPluginBase<MongoDBPluginAux> {
  private mongo: MongoDB;

  constructor(config: MongoDBConfig) {
    super();
    this.mongo = new MongoDB(config);
  }

  public create = async () => {
    await this.mongo.connect();
    return { mongo: this.mongo };
  };

  public destroy = async () => {
    await this.mongo.disconnect();
  };
}

const build = (config: MongoDBConfig) => new MongoDBPlugin(config);
export default build;
