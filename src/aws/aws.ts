import {
  CreateBucketCommand,
  GetObjectCommand,
  ListBucketsCommand,
  PutBucketCorsCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import * as fs from 'fs';

import { getLogger } from '../utils';
import { SimpleAWSConfig } from './config';

import {
  AWSComponent,
  S3CorsRules,
  S3SignedUrlResult,
  SQSMessageBody,
} from './types';
import {
  ChangeMessageVisibilityBatchCommand,
  CreateQueueCommand,
  DeleteMessageBatchCommand,
  GetQueueAttributesCommand,
  GetQueueUrlCommand,
  ListQueuesCommand,
  ReceiveMessageCommand,
  SQSClient,
  SendMessageCommand,
} from '@aws-sdk/client-sqs';
import {
  AttributeValue,
  CreateTableCommand,
  DynamoDBClient,
  GetItemCommand,
  ListTablesCommand,
  UpdateItemCommand,
} from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import * as path from 'path';
import { Readable } from 'stream';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import {
  getSignedCookies,
  getSignedUrl as getSignedUrlCF,
} from '@aws-sdk/cloudfront-signer';

const logger = getLogger(__filename);

// TODO: Make class separated by each component.
// S3, SQS,
export class SimpleAWS {
  private queueUrls: { [queueName: string]: string } = {};
  private config: SimpleAWSConfig;
  private lazyS3: S3Client | undefined;
  private lazySqs: SQSClient | undefined;
  private lazyDynamodb: DynamoDBDocumentClient | undefined;
  private lazyDynamodbAdmin: DynamoDBClient | undefined;

  constructor(config?: SimpleAWSConfig) {
    this.config = config || new SimpleAWSConfig();
  }

  get s3() {
    if (this.lazyS3 === undefined) {
      this.lazyS3 = new S3Client({
        region:
          this.config.get(AWSComponent.s3)?.region?.toString() ?? 'us-west-2',
      });
    }
    return this.lazyS3;
  }

  get sqs() {
    if (this.lazySqs === undefined) {
      this.lazySqs = new SQSClient({
        region:
          this.config.get(AWSComponent.sqs)?.region?.toString() ?? 'us-west-2',
      });
    }
    return this.lazySqs;
  }

  get dynamodb() {
    if (this.lazyDynamodb === undefined) {
      this.lazyDynamodb = DynamoDBDocumentClient.from(this.dynamodbAdmin);
    }
    return this.lazyDynamodb;
  }

  get dynamodbAdmin() {
    if (this.lazyDynamodbAdmin === undefined) {
      this.lazyDynamodbAdmin = new DynamoDBClient({
        region:
          this.config.get(AWSComponent.dynamodb)?.region?.toString() ??
          'us-west-2',
      });
    }
    return this.lazyDynamodbAdmin;
  }

  public getQueueUrl = async (queueName: string): Promise<string> => {
    if (this.queueUrls[queueName] !== undefined) {
      return this.queueUrls[queueName];
    }
    const command = new GetQueueUrlCommand({ QueueName: queueName });
    const { QueueUrl } = await this.sqs.send(command);

    if (!QueueUrl) {
      throw new Error(`No queue url with name[${queueName}]`);
    }
    return (this.queueUrls[queueName] = QueueUrl);
  };

  public getApproximateNumberOfMessages = async (
    queueName: string,
  ): Promise<number | null> => {
    const queueUrl = await this.getQueueUrl(queueName);
    const command = new GetQueueAttributesCommand({
      QueueUrl: queueUrl,
      AttributeNames: ['ApproximateNumberOfMessages'],
    });
    const response = await this.sqs.send(command);

    const attribute = response.Attributes?.ApproximateNumberOfMessages;
    if (attribute) {
      return parseInt(attribute, 10);
    }
    return null;
  };

  public enqueue = async (queueName: string, data: any): Promise<void> => {
    logger.debug(`Send message[${data.key}] to queue.`);
    logger.all(`data`, data);
    const queueUrl = await this.getQueueUrl(queueName);
    const command = new SendMessageCommand({
      QueueUrl: queueUrl,
      MessageBody: JSON.stringify(data),
    });
    await this.sqs.send(command);
  };

  public dequeue = async <T>(
    queueName: string,
    fetchSize: number = 1,
    waitSeconds: number = 1,
    visibilityTimeout: number = 15,
  ): Promise<Array<SQSMessageBody<T>>> => {
    logger.debug(`Receive message from queue[${queueName}].`);
    const queueUrl = await this.getQueueUrl(queueName);

    const command = new ReceiveMessageCommand({
      QueueUrl: queueUrl,
      MaxNumberOfMessages: fetchSize,
      WaitTimeSeconds: waitSeconds,
      VisibilityTimeout: visibilityTimeout,
    });
    const { Messages } = await this.sqs.send(command);
    if (!Messages || Messages.length === 0) {
      return [];
    }

    const data = [];
    for (const each of Messages) {
      if (!each.ReceiptHandle) {
        logger.warn(`No receipt handler: ${JSON.stringify(each)}`);
        continue;
      }
      const message: SQSMessageBody<T> = {
        handle: each.ReceiptHandle,
        body: each.Body ? (JSON.parse(each.Body) as T) : undefined,
      };
      data.push(message);
    }
    logger.all(`Receive a message`, data);
    await this.completeMessage(
      queueUrl,
      data.map(each => each.handle),
    );
    return data;
  };

  private completeMessage = async (
    queueUrl: string,
    receiptHandles: string[],
  ) => {
    logger.debug(`Delete message[${receiptHandles}] from queue.`);
    const command = new DeleteMessageBatchCommand({
      QueueUrl: queueUrl,
      Entries: receiptHandles.map(handle => ({
        Id: handle,
        ReceiptHandle: handle,
      })),
    });
    await this.sqs.send(command);
  };

  public retainMessage = async (
    queueName: string,
    handles: string[],
    seconds: number,
  ): Promise<void> => {
    const queueUrl = await this.getQueueUrl(queueName);
    const command = new ChangeMessageVisibilityBatchCommand({
      QueueUrl: queueUrl,
      Entries: handles.map(handle => ({
        Id: handle,
        ReceiptHandle: handle,
        VisibilityTimeout: seconds,
      })),
    });
    await this.sqs.send(command);
  };

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

  public getSignedUrlCF = async (
    url: string,
    keyPairId: string,
    privateKey: string,
    expires: number,
  ) => {
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

    const signedUrl = getSignedUrlCF({
      url,
      keyPairId,
      policy: JSON.stringify(policy),
      privateKey,
    });
    return signedUrl;
  };

  public getSignedCookie = (
    keyPairId: string,
    privateKey: string,
    url: string,
    expires: number,
  ) => {
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
      keyPairId,
      policy: JSON.stringify(policy),
      privateKey,
    });
    return getSignedCookie;
  };

  public getDynamoDbItem = async <T>(
    tableName: string,
    key: Record<string, AttributeValue>,
  ): Promise<T | undefined> => {
    logger.debug(
      `Read an item with key[${JSON.stringify(key)}] from ${tableName}.`,
    );
    const command = new GetItemCommand({
      TableName: tableName,
      Key: key,
    });
    const getResult = await this.dynamodb.send(command);
    logger.all(`getResult`, getResult);
    const item: T | undefined = (getResult.Item as unknown) as T | undefined;
    logger.all(`item`, item);
    return item;
  };

  public updateDynamoDbItem = async (
    tableName: string,
    key: Record<string, AttributeValue>,
    columnValues: { [column: string]: any },
  ) => {
    logger.debug(
      `Update an item with key[${JSON.stringify(key)}] to ${tableName}`,
    );
    logger.all(`keyValues`, columnValues);
    const expressions = Object.keys(columnValues)
      .map(column => `${column} = :${column}`)
      .join(', ');
    const attributeValues = Object.keys(columnValues)
      .map(column => [`:${column}`, columnValues[column]])
      .reduce((obj, pair) => ({ ...obj, [pair[0]]: pair[1] }), {});
    logger.all(`expressions`, expressions);
    logger.all(`attributeValues`, attributeValues);

    const command = new UpdateItemCommand({
      TableName: tableName,
      Key: key,
      UpdateExpression: `set ${expressions}`,
      ExpressionAttributeValues: attributeValues,
    });
    await this.dynamodb.send(command);
  };

  // Setup
  public checkQueueExists = async (queueName: string) => {
    const command = new ListQueuesCommand({});
    const response = await this.sqs.send(command);
    const urls = response.QueueUrls ?? [];
    const queueExists = urls.some(url => url.endsWith(`/${queueName}`));
    return queueExists;
  };

  public setupQueue = async (queueName: string) => {
    if (await this.checkQueueExists(queueName)) {
      logger.debug(`Queue[${queueName}] already exists.`);
      return true;
    }

    logger.debug(`Create a queue[${queueName}] newly.`);
    const command = new CreateQueueCommand({ QueueName: queueName });
    const createResult = await this.sqs.send(command);
    return createResult.QueueUrl;
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

  public checkdynamoDBTableExist = async (tableName: string) => {
    const command = new ListTablesCommand({});
    const response = await this.dynamodbAdmin.send(command);
    const tables = response.TableNames ?? [];
    const tableExists = tables.some(table => table === tableName);
    return tableExists;
  };

  public setupDynamoDb = async (tableName: string, keyColumn: string) => {
    if (await this.checkdynamoDBTableExist(tableName)) {
      logger.debug(`Table[${tableName}] already exists.`);
      return true;
    }
    logger.debug(`Create a table[${tableName}] newly.`);
    const command = new CreateTableCommand({
      TableName: tableName,
      KeySchema: [{ AttributeName: keyColumn, KeyType: 'HASH' }],
      AttributeDefinitions: [{ AttributeName: keyColumn, AttributeType: 'S' }],
      ProvisionedThroughput: {
        ReadCapacityUnits: 30,
        WriteCapacityUnits: 10,
      },
    });
    await this.dynamodbAdmin.send(command);
  };
}
