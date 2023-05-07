import { HttpStatus } from './statusCode';

export class HttpException extends Error {
  constructor(private responseBody: Object, private statusCode: HttpStatus) {
    super();
  }

  public getResponse() {
    return this.responseBody;
  }

  get code() {
    return this.statusCode;
  }

  get body() {
    return {
      statusCode: this.statusCode,
      ...this.responseBody,
    };
  }
}
