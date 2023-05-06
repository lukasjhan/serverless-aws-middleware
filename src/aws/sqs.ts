import {
  ChangeMessageVisibilityBatchCommand,
  CreateQueueCommand,
  DeleteMessageBatchCommand,
  GetQueueAttributesCommand,
  GetQueueUrlCommand,
  ListQueuesCommand,
  ReceiveMessageCommand,
  SQSClient,
  SendMessageBatchCommand,
  SendMessageCommand,
} from '@aws-sdk/client-sqs';
import { SimpleAWSConfig } from './config';
import { AWSComponent, SQSMessageBody } from './types';
import { getLogger } from '../utils';

const logger = getLogger(__filename);

export class SQS {
  public sqs: SQSClient;
  private queueUrls: { [queueName: string]: string } = {};

  constructor(config: SimpleAWSConfig) {
    this.sqs = new SQSClient({
      region: config.get(AWSComponent.sqs)?.region?.toString() ?? 'us-west-2',
    });
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

  public enqueueBatch = async <T>(
    queueName: string,
    data: Array<{ id: string; data: T }>,
  ): Promise<void> => {
    logger.debug(`Send message[${data.map(each => each.id)}] to queue.`);
    logger.all(`data`, data);
    const queueUrl = await this.getQueueUrl(queueName);
    const command = new SendMessageBatchCommand({
      QueueUrl: queueUrl,
      Entries: data.map(each => ({
        Id: each.id,
        MessageBody: JSON.stringify(each.data),
      })),
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
}
