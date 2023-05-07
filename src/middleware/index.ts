import build from './build';

import aws from './aws';
import logger from './logger';
import trace from './trace';
import tempFile from './tempFile';
import db from './db';
import mongo from './mongo';
import redis from './redis';

export const middleware = {
  build,
  aws,
  trace,
  logger,
  tempFile,
  db,
  mongo,
  redis,
};

export * from './base';
export * from './aws';
export * from './trace';
export * from './logger';
export * from './tempFile';
export * from './db';
export * from './mongo';
export * from './redis';
