import * as AWS from 'aws-sdk'; // tslint:disable-line
import * as fs from 'fs';

import { getLogger } from '../utils';
import { SimpleAWSConfig } from './config';

import {
  AWSComponent,
  S3SignedUrlParams,
  S3SignedUrlResult,
  SQSMessageBody,
} from './define';

const logger = getLogger(__filename);

export class SimpleAWS {
  private queueUrls: { [queueName: string]: string };
  private config: SimpleAWSConfig;
  private lazyS3: AWS.S3 | undefined;
  private lazySqs: AWS.SQS | undefined;
  private lazyDynamodb: AWS.DynamoDB.DocumentClient | undefined;
  private lazyDynamodbAdmin: AWS.DynamoDB | undefined;

  constructor(config?: SimpleAWSConfig) {
    this.config = config || new SimpleAWSConfig();
    /**
     * The simple cache for { queueName: queueUrl }.
     * It can help in the only case of launching this project as offline.
     * @type { { [queueName: string]: string } }
     */
    this.queueUrls = {};
  }

  get s3() {
    if (this.lazyS3 === undefined) {
      this.lazyS3 = new AWS.S3(this.config.get(AWSComponent.s3));
    }
    return this.lazyS3;
  }
  get sqs() {
    if (this.lazySqs === undefined) {
      this.lazySqs = new AWS.SQS(this.config.get(AWSComponent.sqs));
    }
    return this.lazySqs;
  }
  get dynamodb() {
    if (this.lazyDynamodb === undefined) {
      this.lazyDynamodb = new AWS.DynamoDB.DocumentClient(
        this.config.get(AWSComponent.dynamodb),
      );
    }
    return this.lazyDynamodb;
  }
  get dynamodbAdmin() {
    if (this.lazyDynamodbAdmin === undefined) {
      this.lazyDynamodbAdmin = new AWS.DynamoDB(
        this.config.get(AWSComponent.dynamodb),
      );
    }
    return this.lazyDynamodbAdmin;
  }

  public getQueueUrl = async (queueName: string): Promise<string> => {
    if (this.queueUrls[queueName] !== undefined) {
      return this.queueUrls[queueName];
    }
    const urlResult = await this.sqs
      .getQueueUrl({
        QueueName: queueName,
      })
      .promise();
    logger.stupid(`urlResult`, urlResult);
    if (!urlResult.QueueUrl) {
      throw new Error(`No queue url with name[${queueName}]`);
    }
    return (this.queueUrls[queueName] = urlResult.QueueUrl);
  };

  public enqueue = async (queueName: string, data: any): Promise<number> => {
    logger.debug(`Send message[${data.key}] to queue.`);
    logger.stupid(`data`, data);
    const queueUrl = await this.getQueueUrl(queueName);
    const sendResult = await this.sqs
      .sendMessage({
        QueueUrl: queueUrl,
        MessageBody: JSON.stringify(data),
        DelaySeconds: 0,
      })
      .promise();
    logger.stupid(`sendResult`, sendResult);

    const attrResult = await this.sqs
      .getQueueAttributes({
        QueueUrl: queueUrl,
        AttributeNames: ['ApproximateNumberOfMessages'],
      })
      .promise();
    logger.stupid(`attrResult`, attrResult);
    if (!attrResult.Attributes) {
      return 0;
    }
    return +attrResult.Attributes.ApproximateNumberOfMessages;
  };

  public dequeue = async <T>(
    queueName: string,
    fetchSize: number = 1,
    waitSeconds: number = 1,
    visibilityTimeout: number = 15,
  ): Promise<Array<SQSMessageBody<T>>> => {
    logger.debug(`Receive message from queue[${queueName}].`);
    const queueUrl = await this.getQueueUrl(queueName);
    const receiveResult = await this.sqs
      .receiveMessage({
        QueueUrl: queueUrl,
        MaxNumberOfMessages: fetchSize,
        WaitTimeSeconds: waitSeconds,
        VisibilityTimeout: visibilityTimeout,
      })
      .promise();
    logger.stupid(`receiveResult`, receiveResult);
    if (
      receiveResult.Messages === undefined ||
      receiveResult.Messages.length === 0
    ) {
      return [];
    }
    const data = [];
    for (const each of receiveResult.Messages) {
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
    logger.verbose(`Receive a message[${JSON.stringify(data)}] from queue`);
    return data;
  };

  public dequeueAll = async <T>(
    queueName: string,
    limitSize: number = Number.MAX_VALUE,
    visibilityTimeout: number = 15,
  ): Promise<Array<SQSMessageBody<T>>> => {
    const messages = [];
    const maxFetchSize = 10; // This is max-value for fetching in each time.
    while (messages.length < limitSize) {
      const eachOfMessages: Array<SQSMessageBody<T>> = await this.dequeue<T>(
        queueName,
        Math.min(limitSize - messages.length, maxFetchSize),
        0,
        visibilityTimeout,
      );
      if (!eachOfMessages || eachOfMessages.length === 0) {
        break;
      }
      for (const each of eachOfMessages) {
        messages.push(each);
      }
    }
    logger.stupid(`messages`, messages);
    return messages;
  };

  public retainMessage = async (
    queueName: string,
    handle: string,
    seconds: number,
  ): Promise<string> =>
    new Promise<string>(async (resolve, reject) => {
      logger.debug(`Change visibilityTimeout of ${handle} to ${seconds}secs.`);
      this.getQueueUrl(queueName)
        .then(queueUrl => {
          this.sqs.changeMessageVisibility(
            {
              QueueUrl: queueUrl,
              ReceiptHandle: handle,
              VisibilityTimeout: seconds,
            },
            (err, changeResult) => {
              if (err) {
                reject(err);
              } else {
                logger.stupid(`changeResult`, changeResult);
                resolve(handle);
              }
            },
          );
        })
        .catch(reject);
    });

  public completeMessage = async (
    queueName: string,
    handle: string,
  ): Promise<string> => {
    logger.debug(`Complete a message with handle[${handle}]`);
    const queueUrl = await this.getQueueUrl(queueName);
    const deleteResult = await this.sqs
      .deleteMessage({
        QueueUrl: queueUrl,
        ReceiptHandle: handle,
      })
      .promise();
    logger.stupid(`deleteResult`, deleteResult);
    return handle;
  };

  public completeMessages = async (queueName: string, handles: string[]) => {
    logger.debug(`Complete a message with handle[${handles}]`);
    if (!handles) {
      return handles;
    }

    const chunkSize = 10;
    let index = 0;
    for (let start = 0; start < handles.length; start += chunkSize) {
      const end = Math.min(start + chunkSize, handles.length);
      const sublist = handles.slice(start, end);
      const queueUrl = await this.getQueueUrl(queueName);
      const deletesResult = await this.sqs
        .deleteMessageBatch({
          QueueUrl: queueUrl,
          Entries: sublist.map(handle => ({
            Id: (++index).toString(),
            ReceiptHandle: handle,
          })),
        })
        .promise();
      logger.stupid(`deleteResult`, deletesResult);
    }
    return handles;
  };

  public download = async (
    bucketName: string,
    key: string,
    localPath: string,
  ): Promise<string> => {
    logger.debug(`Get a stream of item[${key}] from bucket[${bucketName}]`);
    const stream = this.s3
      .getObject({
        Bucket: bucketName,
        Key: key,
      })
      .createReadStream();
    return new Promise<string>((resolve, reject) =>
      stream
        .pipe(fs.createWriteStream(localPath))
        .on('finish', () => resolve(localPath))
        .on('error', error => reject(error)),
    );
  };

  public upload = async (
    bucketName: string,
    localPath: string,
    key: string,
  ): Promise<string> => {
    logger.debug(`Upload item[${key}] into bucket[${bucketName}]`);
    const putResult = await this.s3
      .upload({
        Bucket: bucketName,
        Key: key,
        Body: fs.createReadStream(localPath),
      })
      .promise();
    logger.stupid(`putResult`, putResult);
    return key;
  };

  public getSignedUrl = (
    bucketName: string,
    key: string,
    operation: 'getObject' | 'putObject' = 'getObject',
    params?: S3SignedUrlParams,
  ): S3SignedUrlResult => {
    return {
      key,
      url: this.s3.getSignedUrl(operation, {
        Bucket: bucketName,
        Key: key,
        Expires: 60 * 10,
        ...(params || {}),
      }),
    };
  };

  public getSignedCookie = (
    keyPairId: string,
    privateKey: string,
    url: string,
    expires: number,
  ): AWS.CloudFront.Signer.CustomPolicy => {
    const signer = new AWS.CloudFront.Signer(keyPairId, privateKey);
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
    const ret = signer.getSignedCookie({ policy: JSON.stringify(policy) });
    return ret;
  };

  public getAttachmentUrl = (
    bucketName: string,
    key: string,
    fileName: string,
    params?: S3SignedUrlParams,
  ): S3SignedUrlResult => {
    return this.getSignedUrl(bucketName, key, 'getObject', {
      ...params,
      ResponseContentDisposition: `attachment; filename="${fileName}"`,
    });
  };

  public getDynamoDbItem = async <T>(
    tableName: string,
    key: { [keyColumn: string]: string },
    defaultValue?: T,
  ): Promise<T | undefined> => {
    logger.debug(
      `Read an item with key[${JSON.stringify(key)}] from ${tableName}.`,
    );
    const getResult = await this.dynamodb
      .get({
        TableName: tableName,
        Key: key,
      })
      .promise();
    logger.stupid(`getResult`, getResult);
    const item: T | undefined =
      getResult !== undefined && getResult.Item !== undefined
        ? ((getResult.Item as any) as T) // Casts forcefully.
        : defaultValue;
    logger.stupid(`item`, item);
    return item;
  };

  public updateDynamoDbItem = async (
    tableName: string,
    key: { [keyColumn: string]: string },
    columnValues: { [column: string]: any },
  ) => {
    logger.debug(
      `Update an item with key[${JSON.stringify(key)}] to ${tableName}`,
    );
    logger.stupid(`keyValues`, columnValues);
    const expressions = Object.keys(columnValues)
      .map(column => `${column} = :${column}`)
      .join(', ');
    const attributeValues = Object.keys(columnValues)
      .map(column => [`:${column}`, columnValues[column]])
      .reduce((obj, pair) => ({ ...obj, [pair[0]]: pair[1] }), {});
    logger.stupid(`expressions`, expressions);
    logger.stupid(`attributeValues`, attributeValues);
    const updateResult = await this.dynamodb
      .update({
        TableName: tableName,
        Key: key,
        UpdateExpression: `set ${expressions}`,
        ExpressionAttributeValues: attributeValues,
      })
      .promise();
    logger.stupid(`updateResult`, updateResult);
    return updateResult;
  };

  // Setup

  public setupQueue = async (queueName: string) => {
    try {
      const listResult = await this.sqs
        .listQueues({
          QueueNamePrefix: queueName,
        })
        .promise();
      if (listResult.QueueUrls) {
        for (const queueUrl of listResult.QueueUrls) {
          if (queueUrl.endsWith(queueName)) {
            logger.debug(`Queue[${queueName} => ${queueUrl}] already exists.`);
            return true;
          }
        }
      }
    } catch (error) {
      logger.debug(`No Queue[${queueName}] exists due to ${error}`);
    }
    logger.debug(`Create a queue[${queueName}] newly.`);
    const createResult = await this.sqs
      .createQueue({
        QueueName: queueName,
      })
      .promise();
    logger.stupid(`createResult`, createResult);
    return true;
  };

  public setupStorage = async (
    bucketName: string,
    cors: {
      methods: Array<'GET' | 'POST' | 'PUT' | 'DELETE' | 'HEAD'>;
      origins: string[];
    },
  ) => {
    try {
      const listResult = await this.s3.listBuckets().promise();
      if (
        listResult.Buckets &&
        listResult.Buckets.map(each => each.Name).includes(bucketName)
      ) {
        logger.debug(`Bucket[${bucketName}] already exists.`);
        return true;
      }
    } catch (error) {
      logger.debug(`No bucket[${bucketName}] exists due to ${error}`);
    }
    logger.debug(`Create a bucket[${bucketName}] newly.`);
    const createResult = await this.s3
      .createBucket({
        Bucket: bucketName,
      })
      .promise();
    logger.stupid(`createResult`, createResult);
    if (cors) {
      const corsResult = await this.s3
        .putBucketCors({
          Bucket: bucketName,
          CORSConfiguration: {
            CORSRules: [
              {
                AllowedHeaders: ['*'],
                AllowedMethods: cors.methods,
                AllowedOrigins: cors.origins,
              },
            ],
          },
        })
        .promise();
      logger.stupid(`corsResult`, corsResult);
    }
    return true;
  };

  public setupDynamoDb = async (tableName: string, keyColumn: string) => {
    try {
      const listResult = await this.dynamodbAdmin.listTables().promise();
      if (listResult.TableNames && listResult.TableNames.includes(tableName)) {
        logger.debug(`Table[${tableName}] already exists.`);
        return true;
      }
    } catch (error) {
      logger.debug(`No table[${tableName}] exists due to ${error}`);
    }
    logger.debug(`Create a table[${tableName}] newly.`);
    const createResult = await this.dynamodbAdmin
      .createTable({
        TableName: tableName,
        KeySchema: [{ AttributeName: keyColumn, KeyType: 'HASH' }],
        AttributeDefinitions: [
          { AttributeName: keyColumn, AttributeType: 'S' },
        ],
        ProvisionedThroughput: {
          ReadCapacityUnits: 30,
          WriteCapacityUnits: 10,
        },
      })
      .promise();
    logger.stupid(`createResult`, createResult);
    return true;
  };
}
