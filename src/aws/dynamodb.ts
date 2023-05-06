import {
  AttributeValue,
  CreateTableCommand,
  DynamoDBClient,
  GetItemCommand,
  ListTablesCommand,
  UpdateItemCommand,
} from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import { SimpleAWSConfig } from './config';
import { AWSComponent } from './types';
import { getLogger } from '../utils';

const logger = getLogger(__filename);

export class DynamoDB {
  private dynamodb: DynamoDBDocumentClient;
  private dynamodbAdmin: DynamoDBClient;

  constructor(config: SimpleAWSConfig) {
    this.dynamodbAdmin = new DynamoDBClient({
      region:
        config.get(AWSComponent.dynamodb)?.region?.toString() ?? 'us-west-2',
    });
    this.dynamodb = DynamoDBDocumentClient.from(this.dynamodbAdmin);
  }

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
