import build from './build';

import aws from './aws';
import logger from './logger';
import trace from './trace';
import tempFile from './tempFile';
import db from './db';

export const middleware = {
  build,
  aws,
  trace,
  logger,
  tempFile,
  db,
};

export * from './base';
export * from './aws';
export * from './trace';
export * from './logger';
export * from './tempFile';
export * from './db';
