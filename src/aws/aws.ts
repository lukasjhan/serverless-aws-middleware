import { SimpleAWSConfig } from './config';
import { S3 } from './s3';
import { SQS } from './sqs';
import { DynamoDB } from './dynamodb';
import { cloudfront } from './cloudfront';

export class SimpleAWS {
  private config: SimpleAWSConfig;
  private lazyS3: S3 | undefined;
  private lazySqs: SQS | undefined;
  private lazyDynamodb: DynamoDB | undefined;
  private lazyCloudfront: cloudfront | undefined;

  constructor(config?: SimpleAWSConfig) {
    this.config = config || new SimpleAWSConfig();
  }

  get s3() {
    if (this.lazyS3 === undefined) {
      this.lazyS3 = new S3(this.config);
    }
    return this.lazyS3;
  }

  get sqs() {
    if (this.lazySqs === undefined) {
      this.lazySqs = new SQS(this.config);
    }
    return this.lazySqs;
  }

  get dynamodb() {
    if (this.lazyDynamodb === undefined) {
      this.lazyDynamodb = new DynamoDB(this.config);
    }
    return this.lazyDynamodb;
  }

  get cloudfront() {
    if (this.lazyCloudfront === undefined) {
      this.lazyCloudfront = new cloudfront(this.config);
    }
    return this.lazyCloudfront;
  }
}
