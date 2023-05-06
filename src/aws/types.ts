export enum AWSComponent {
  s3 = 's3',
  sqs = 'sqs',
  dynamodb = 'dynamodb',
  cloudfront = 'cloudfront',
}

export interface SQSMessageBody<T> {
  handle: string;
  body?: T;
}

export interface S3SignedUrlResult {
  key: string;
  url: string;
}

export interface S3CorsRules {
  AllowedHeaders: string[];
  AllowedMethods: Array<'GET' | 'POST' | 'PUT' | 'DELETE' | 'HEAD'>;
  AllowedOrigins: string[];
  MaxAgeSeconds: number;
}
