import { HttpException } from './httpException';
import { HttpStatus } from './statusCode';

declare class CustomExceptionProtoType extends HttpException {
  constructor();
}

export function createException(
  status: HttpStatus,
  errorCode: string,
  message: string,
) {
  class CustomException extends HttpException {
    constructor() {
      super({ status, errorCode, message }, status);
      Object.setPrototypeOf(this, Object.getPrototypeOf(HttpException));
    }
  }
  return (CustomException as unknown) as typeof CustomExceptionProtoType;
}
