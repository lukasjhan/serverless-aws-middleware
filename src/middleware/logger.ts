import { getLogger, Logger, LogLevel } from '../utils';
import { HandlerAuxBase, HandlerPluginBase } from './base';

export interface LoggerPluginOptions {
  name: string;
  level?: LogLevel;
}

export interface LoggerPluginAux extends HandlerAuxBase {
  logger: Logger;
}

export class LoggerPlugin extends HandlerPluginBase<LoggerPluginAux> {
  private options: LoggerPluginOptions;

  constructor(options: LoggerPluginOptions) {
    super();
    this.options = options;
  }

  public create = async () => {
    const { name, level } = this.options;
    return { logger: getLogger(name, level) };
  };
}

const build = (options: LoggerPluginOptions) => new LoggerPlugin(options);
export default build;
