import { basename } from 'path';
import { currentStage, StagingLevel } from '../stage';
import { $enum } from 'ts-enum-util';

export enum LogLevel {
  OFF = 'off',
  FATAL = 'fatal',
  ERROR = 'error',
  WARN = 'warn',
  INFO = 'info',
  DEBUG = 'debug',
  TRACE = 'trace',
  ALL = 'all',
}

const severity = (level: LogLevel) => {
  const severityMap = {
    [LogLevel.OFF]: 0,
    [LogLevel.FATAL]: 100,
    [LogLevel.ERROR]: 200,
    [LogLevel.WARN]: 300,
    [LogLevel.INFO]: 400,
    [LogLevel.DEBUG]: 500,
    [LogLevel.TRACE]: 600,
    [LogLevel.ALL]: 1000,
  };
  return severityMap[level];
};

export const currentLogLevel = $enum(LogLevel).asValueOrDefault(
  process.env.LOG_LEVEL,
  currentStage.level !== StagingLevel.Release ? LogLevel.DEBUG : LogLevel.INFO,
);

type LogMessage = string | Error;

export class Logger {
  private name: string;
  private severity: number;

  constructor(name: string, level: LogLevel = currentLogLevel) {
    this.name = name;
    this.severity = severity(level);
  }

  private log = (level: LogLevel, message: LogMessage) => {
    if (this.severity >= severity(level)) {
      console.log(
        `[${new Date().toISOString()}][${level.toUpperCase()}][${this.name}] ${
          message instanceof Error ? stringifyError(message) : message
        }`,
      );
    }
    return message;
  };

  public error = (message: LogMessage) => this.log(LogLevel.ERROR, message);
  public warn = (message: LogMessage) => this.log(LogLevel.WARN, message);
  public info = (message: LogMessage) => this.log(LogLevel.INFO, message);
  public debug = (message: LogMessage) => this.log(LogLevel.DEBUG, message);
  public trace = (message: LogMessage) => this.log(LogLevel.TRACE, message);

  public all = <T>(message: LogMessage, object: T) => {
    this.log(LogLevel.ALL, `${message}: ${JSON.stringify(object)}`);
  };
}

const loggers: { [name: string]: Logger } = {};

export const getLogger = (fileName: string, level?: LogLevel): Logger => {
  const name = basename(fileName);
  if (loggers[name] === undefined) {
    loggers[name] = new Logger(name, level);
  }
  return loggers[name];
};

export const stringifyError = (
  err: any,
  replacer?: (key: string, value: any) => any,
  space?: string | number,
) => {
  const plainObject = {} as any;
  Object.getOwnPropertyNames(err).forEach(key => {
    plainObject[key] = err[key];
  });
  return JSON.stringify(plainObject, replacer, space);
};
