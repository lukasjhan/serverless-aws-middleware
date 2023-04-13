import { basename } from 'path';
import { envDefault as currentStage, StagingLevel } from 'simple-staging';
import { $enum } from 'ts-enum-util';
import { stringifyError } from './misc';

export enum LogLevel {
  Error = 'error',
  Warn = 'warn',
  Info = 'info',
  Debug = 'debug',
  Verbose = 'verbose',
  Silly = 'silly',
  Stupid = 'stupid',
}

const severity = (level: LogLevel) => {
  switch (level) {
    case LogLevel.Error:
      return 100;
    case LogLevel.Warn:
      return 200;
    case LogLevel.Info:
      return 300;
    case LogLevel.Debug:
      return 400;
    case LogLevel.Verbose:
      return 500;
    case LogLevel.Silly:
      return 600;
    case LogLevel.Stupid:
      return 700;
    default:
      return 1000;
  }
};

export const currentLogLevel = $enum(LogLevel).asValueOrDefault(
  process.env.LOG_LEVEL,
  currentStage.level !== StagingLevel.Release
    ? LogLevel.Verbose
    : LogLevel.Debug,
);

type LogMessage = string | Error;

export class Logger {
  private name: string;
  private severity: number;

  constructor(name: string, level: LogLevel = currentLogLevel) {
    this.name = name;
    this.severity = severity(level);
  }

  public log = (level: LogLevel, message: LogMessage) => {
    if (this.severity >= severity(level)) {
      console.log(
        `[${new Date().toISOString()}][${level.toUpperCase()}][${this.name}] ${
          message instanceof Error ? stringifyError(message) : message
        }`,
      );
    }
    return message;
  };

  public error = (message: LogMessage) => this.log(LogLevel.Error, message);
  public warn = (message: LogMessage) => this.log(LogLevel.Warn, message);
  public info = (message: LogMessage) => this.log(LogLevel.Info, message);
  public debug = (message: LogMessage) => this.log(LogLevel.Debug, message);
  public verbose = (message: LogMessage) => this.log(LogLevel.Verbose, message);
  public silly = (message: LogMessage) => this.log(LogLevel.Silly, message);

  public stupid = <T>(
    message: string,
    object: T,
    replacer?: (key: string, value: T) => T,
  ) => {
    this.log(
      LogLevel.Stupid,
      `${message}: ${JSON.stringify(object, replacer)}`,
    );
    return object;
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
