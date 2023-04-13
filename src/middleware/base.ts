import * as awsTypes from 'aws-lambda'; // tslint:disable-line:no-implicit-dependencies
import { getLogger } from '../utils/logger';

const logger = getLogger(__filename);

export interface RequestAuxBase {
  [pluginName: string]: any;
}

export class HandlerRequest {
  public event: awsTypes.APIGatewayEvent;
  public context: awsTypes.APIGatewayEventRequestContext;
  public lastError: Error | string | undefined;

  private lazyBody?: any;

  constructor(event: any, context: any) {
    this.event = event;
    this.context = context;
    this.lastError = undefined;
  }

  get body() {
    if (!this.event.body) {
      return {};
    }
    if (this.lazyBody === undefined) {
      this.lazyBody = JSON.parse(this.event.body);
    }
    return this.lazyBody || {};
  }

  get path(): { [key: string]: string } {
    return this.event.pathParameters || {};
  }

  get query(): { [key: string]: string } {
    return this.event.queryStringParameters || {};
  }

  public header(key: string) {
    return this.event.headers
      ? this.event.headers[key] || this.event.headers[key.toLowerCase()]
      : undefined;
  }

  public records<T, U>(selector?: (each: T) => U) {
    const target = ((this.event as any).Records || []) as T[];
    return selector === undefined ? target : target.map(selector);
  }
}

export class HandlerResponse {
  public callback: any;
  public completed: boolean;
  public result: any | Promise<any> | undefined;

  private corsHeaders: { [header: string]: any };
  private cookies: string[];
  private crossOrigin?: string;

  constructor(callback: any) {
    this.callback = callback;
    this.completed = false;
    this.corsHeaders = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'X-Version',
      'Access-Control-Allow-Credentials': true,
    };
    this.cookies = [];
  }

  public ok(body = {}, code = 200) {
    logger.stupid(`ok`, body);
    const headers = {
      ...this.corsHeaders,
    };
    if (this.crossOrigin) {
      headers['Access-Control-Allow-Origin'] = this.crossOrigin;
    }
    let multiValueHeaders = undefined;
    if (this.cookies.length > 0) {
      multiValueHeaders = { 'Set-Cookie': this.cookies };
    }
    const result = this.callback(null, {
      statusCode: code,
      headers,
      multiValueHeaders,
      body: JSON.stringify(body),
    });
    this.completed = true;
    return result;
  }

  public fail(body = {}, code = 500) {
    logger.stupid(`fail`, body);
    const result = this.callback(null, {
      statusCode: code,
      headers: this.corsHeaders,
      body: JSON.stringify(body),
    });
    this.completed = true;
    return result;
  }

  public addCookie(
    key: string,
    value: string,
    domain?: string,
    specifyCrossOrigin?: true,
    path?: string,
  ) {
    const keyValueStr = `${key}=${value}`;
    const domainStr = domain ? `Domain=${domain}` : '';
    const sameSiteStr = specifyCrossOrigin ? 'SameSite=None' : '';
    const secureStr = specifyCrossOrigin ? 'Secure' : '';
    const pathStr = path !== undefined ? `Path=${path}` : '';
    const cookieStr = [keyValueStr, domainStr, sameSiteStr, secureStr, pathStr]
      .filter(x => x)
      .join('; ');
    this.cookies.push(cookieStr);
  }

  public setCrossOrigin = (origin?: string) => {
    this.crossOrigin = origin;
  };
}

export interface HandlerAuxBase {
  [key: string]: any;
}

export interface HandlerContext<A extends HandlerAuxBase> {
  request: HandlerRequest;
  response: HandlerResponse;
  aux: A;
}

export type Handler<A extends HandlerAuxBase> = (
  context: HandlerContext<A>,
) => any | Promise<any> | undefined;

export interface HandlerPlugin<A extends HandlerAuxBase> {
  create: () => Promise<A> | A;
  begin: Handler<A>;
  end: Handler<A>;
  error: Handler<A>;
}

export class HandlerPluginBase<A extends HandlerAuxBase>
  implements HandlerPlugin<A> {
  public create = (): Promise<A> | A => {
    throw new Error('Not yet implemented');
  };
  public begin = (_: HandlerContext<A>) => {
    // do nothing
  };
  public end = (_: HandlerContext<A>) => {
    // do nothing
  };
  public error = (_: HandlerContext<A>) => {
    // do nothing
  };
}
