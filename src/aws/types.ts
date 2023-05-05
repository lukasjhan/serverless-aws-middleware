export enum AWSComponent {
  s3 = 's3',
  sqs = 'sqs',
  dynamodb = 'dynamodb',
}

export interface SQSMessageBody<T> {
  handle: string;
  body?: T;
}

export interface S3SignedUrlParams {
  Key?: string;
  Expires?: number;
  ContentType?: string;
  ACL?:
    | 'private'
    | 'public-read'
    | 'public-read-write'
    | 'authenticated-read'
    | string;
  ResponseContentDisposition?: string;
  ResponseContentType?: string;
}

export interface S3SignedUrlResult {
  key: string;
  url: string;
}
