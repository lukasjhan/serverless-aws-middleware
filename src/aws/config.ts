import fetch from 'cross-fetch';
import * as fs from 'fs';

import { AWSComponent } from './define';

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

export const loadAWSConfig = (
  newConfigsOrUrl: SimpleAWSConfigLoadParam,
): Promise<SimpleAWSConfig> => {
  if (typeof newConfigsOrUrl === 'string') {
    if (/^http.*json$/.test(newConfigsOrUrl)) {
      return fetch(newConfigsOrUrl)
        .then(r => r.json())
        .then(loadAWSConfig);
    } else if (/json$/.test(newConfigsOrUrl)) {
      return loadAWSConfig(
        JSON.parse(fs.readFileSync(newConfigsOrUrl, 'utf-8')),
      );
    }
    return loadAWSConfig(JSON.parse(newConfigsOrUrl));
  }
  return Promise.resolve(new SimpleAWSConfig(newConfigsOrUrl));
};
