import * as fs from 'fs';

import { AWSComponent } from './types';

export interface AWSConfig {
  [key: string]: string | boolean | number | undefined;
}

export interface AWSConfigs {
  [service: string]: AWSConfig;
}

export type AWSConfigResolver = (service: string) => AWSConfig;

export type SimpleAWSConfigLoadParam = AWSConfigs | string;

export class SimpleAWSConfig {
  private configs: AWSConfigs | undefined;

  public constructor(configs?: AWSConfigs) {
    this.configs = configs;
  }

  public get = (service: AWSComponent): AWSConfig | undefined => {
    return this.configs ? this.configs[service] : undefined;
  };
}

const loadAWSConfigFromFile = (filename: string): AWSConfigs => {
  const config: AWSConfigs = JSON.parse(fs.readFileSync(filename, 'utf-8'));
  return config;
};

export const loadAWSConfig = (
  configOrFilename: SimpleAWSConfigLoadParam,
): Promise<SimpleAWSConfig> => {
  const config =
    typeof configOrFilename === 'string'
      ? loadAWSConfigFromFile(configOrFilename)
      : configOrFilename;

  return Promise.resolve(new SimpleAWSConfig(config));
};
