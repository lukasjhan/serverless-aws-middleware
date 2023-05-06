import { getSignedCookies, getSignedUrl } from '@aws-sdk/cloudfront-signer';
import { getLogger } from '../utils';
import { SimpleAWSConfig } from './config';
import { AWSComponent } from './types';

const logger = getLogger(__filename);

export class cloudfront {
  private keyPairId: string;
  private privateKey: string;
  constructor(config: SimpleAWSConfig) {
    this.keyPairId =
      config.get(AWSComponent.cloudfront)?.keyPairId?.toString() ?? '';
    this.privateKey =
      config.get(AWSComponent.cloudfront)?.privateKey?.toString() ?? '';
  }

  public getSignedUrlCF = async (url: string, expires: number) => {
    logger.debug(`Get signed url for ${url}`);
    const policy = {
      Statement: [
        {
          Resource: url,
          Condition: {
            DateLessThan: { 'AWS:EpochTime': expires },
          },
        },
      ],
    };

    const signedUrl = getSignedUrl({
      url,
      keyPairId: this.keyPairId,
      policy: JSON.stringify(policy),
      privateKey: this.privateKey,
    });
    return signedUrl;
  };

  public getSignedCookie = (url: string, expires: number) => {
    logger.debug(`Get signed cookie for ${url}`);
    const policy = {
      Statement: [
        {
          Resource: url,
          Condition: {
            DateLessThan: { 'AWS:EpochTime': expires },
          },
        },
      ],
    };

    const getSignedCookie = getSignedCookies({
      url,
      keyPairId: this.keyPairId,
      policy: JSON.stringify(policy),
      privateKey: this.privateKey,
    });
    return getSignedCookie;
  };
}
