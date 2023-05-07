import { HttpException } from './httpException';
import { HttpStatus } from './statusCode';

export class BadRequestException extends HttpException {
  constructor(message: string, errorCode?: string) {
    super({ message, errorCode }, HttpStatus.BAD_REQUEST);
  }
}

export class UnauthorizedException extends HttpException {
  constructor(message: string, errorCode?: string) {
    super({ message, errorCode }, HttpStatus.UNAUTHORIZED);
  }
}

export class ForbiddenException extends HttpException {
  constructor(message: string, errorCode?: string) {
    super({ message, errorCode }, HttpStatus.FORBIDDEN);
  }
}

export class NotFoundException extends HttpException {
  constructor(message: string, errorCode?: string) {
    super({ message, errorCode }, HttpStatus.NOT_FOUND);
  }
}

export class MethodNotAllowedException extends HttpException {
  constructor(message: string, errorCode?: string) {
    super({ message, errorCode }, HttpStatus.METHOD_NOT_ALLOWED);
  }
}

export class NotAcceptableException extends HttpException {
  constructor(message: string, errorCode?: string) {
    super({ message, errorCode }, HttpStatus.NOT_ACCEPTABLE);
  }
}

export class RequestTimeoutException extends HttpException {
  constructor(message: string, errorCode?: string) {
    super({ message, errorCode }, HttpStatus.REQUEST_TIMEOUT);
  }
}

export class ConflictException extends HttpException {
  constructor(message: string, errorCode?: string) {
    super({ message, errorCode }, HttpStatus.CONFLICT);
  }
}

export class GoneException extends HttpException {
  constructor(message: string, errorCode?: string) {
    super({ message, errorCode }, HttpStatus.GONE);
  }
}

export class HttpVersionNotSupportedException extends HttpException {
  constructor(message: string, errorCode?: string) {
    super({ message, errorCode }, HttpStatus.HTTP_VERSION_NOT_SUPPORTED);
  }
}

export class PayloadTooLargeException extends HttpException {
  constructor(message: string, errorCode?: string) {
    super({ message, errorCode }, HttpStatus.PAYLOAD_TOO_LARGE);
  }
}

export class UnsupportedMediaTypeException extends HttpException {
  constructor(message: string, errorCode?: string) {
    super({ message, errorCode }, HttpStatus.UNSUPPORTED_MEDIA_TYPE);
  }
}

export class UnprocessableEntityException extends HttpException {
  constructor(message: string, errorCode?: string) {
    super({ message, errorCode }, HttpStatus.UNPROCESSABLE_ENTITY);
  }
}

export class InternalServerErrorException extends HttpException {
  constructor(message: string, errorCode?: string) {
    super({ message, errorCode }, HttpStatus.INTERNAL_SERVER_ERROR);
  }
}

export class NotImplementedException extends HttpException {
  constructor(message: string, errorCode?: string) {
    super({ message, errorCode }, HttpStatus.NOT_IMPLEMENTED);
  }
}

export class BadGatewayException extends HttpException {
  constructor(message: string, errorCode?: string) {
    super({ message, errorCode }, HttpStatus.BAD_GATEWAY);
  }
}

export class ServiceUnavailableException extends HttpException {
  constructor(message: string, errorCode?: string) {
    super({ message, errorCode }, HttpStatus.SERVICE_UNAVAILABLE);
  }
}

export class GatewayTimeoutException extends HttpException {
  constructor(message: string, errorCode?: string) {
    super({ message, errorCode }, HttpStatus.GATEWAY_TIMEOUT);
  }
}

export class PreconditionFailedException extends HttpException {
  constructor(message: string, errorCode?: string) {
    super({ message, errorCode }, HttpStatus.PRECONDITION_FAILED);
  }
}
