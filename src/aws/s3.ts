import {
  CreateBucketCommand,
  GetObjectCommand,
  ListBucketsCommand,
  PutBucketCorsCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { SimpleAWSConfig } from './config';
import { AWSComponent, S3CorsRules, S3SignedUrlResult } from './types';
import { getLogger } from '../utils';
import * as path from 'path';
import * as fs from 'fs';
import { Readable } from 'stream';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

const logger = getLogger(__filename);

export class S3 {
  public s3: S3Client;
  constructor(config: SimpleAWSConfig) {
    this.s3 = new S3Client({
      region: config.get(AWSComponent.s3)?.region?.toString() ?? 'us-west-2',
    });
  }

  public download = async (
    bucketName: string,
    key: string,
    filename: string,
  ): Promise<string | null> => {
    logger.debug(`Get a stream of item[${key}] from bucket[${bucketName}]`);
    const filePath = path.join('/tmp', filename);
    const command = new GetObjectCommand({
      Bucket: bucketName,
      Key: key,
    });
    const { Body } = await this.s3.send(command);
    if (!Body) {
      return null;
    }

    const readableStream = new Readable({
      read() {
        this.push(Body);
        this.push(null);
      },
    });

    return new Promise<string>((resolve, reject) =>
      readableStream
        .pipe(fs.createWriteStream(filePath))
        .on('finish', () => resolve(filePath))
        .on('error', (error: any) => reject(error)),
    );
  };

  public upload = async (
    bucketName: string,
    localPath: string,
    key: string,
  ): Promise<string> => {
    logger.debug(`Upload item[${key}] into bucket[${bucketName}]`);
    const command = new PutObjectCommand({
      Bucket: bucketName,
      Key: key,
      Body: fs.createReadStream(localPath),
    });
    await this.s3.send(command);
    return key;
  };

  public getSignedUrl = async (
    bucketName: string,
    key: string,
    operation: 'getObject' | 'putObject' = 'getObject',
    expires: number = 15 * 60,
  ): Promise<S3SignedUrlResult> => {
    const param = {
      Bucket: bucketName,
      Key: key,
    };
    const command =
      operation === 'getObject'
        ? new GetObjectCommand(param)
        : new PutObjectCommand(param);
    const url = await getSignedUrl(this.s3, command, { expiresIn: expires });
    return { key, url };
  };

  public checkS3BucketExists = async (bucketName: string) => {
    const command = new ListBucketsCommand({});
    const response = await this.s3.send(command);
    const buckets = response.Buckets ?? [];
    const bucketExists = buckets.some(bucket => bucket.Name === bucketName);
    return bucketExists;
  };

  public setupS3 = async (bucketName: string) => {
    if (await this.checkS3BucketExists(bucketName)) {
      logger.debug(`Bucket[${bucketName}] already exists.`);
      return true;
    }

    logger.debug(`Create a bucket[${bucketName}] newly.`);
    const command = new CreateBucketCommand({ Bucket: bucketName });
    await this.s3.send(command);
    return bucketName;
  };

  public setS3Cors = async (bucketName: string, corsRules: S3CorsRules) => {
    const command = new PutBucketCorsCommand({
      Bucket: bucketName,
      CORSConfiguration: {
        CORSRules: [corsRules],
      },
    });
    await this.s3.send(command);
  };
}
