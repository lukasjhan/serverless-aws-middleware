import { getLogger } from '../utils/logger';

import { stringifyError } from '../utils';
import {
  Handler,
  HandlerAuxBase,
  HandlerPluginBase,
  HandlerRequest,
  HandlerResponse,
} from './base';

const logger = getLogger(__filename);

type Delegator = (okResponsible: boolean) => Promise<any>;

class HandlerMiddleware<A extends HandlerAuxBase> {
  public auxPromise: Promise<A>;
  public plugins: Array<HandlerPluginBase<any>>;

  constructor(plugins: Array<HandlerPluginBase<any>>) {
    this.plugins = plugins;
    this.auxPromise = this.createAuxPromise();
  }

  private createAuxPromise = (): Promise<A> => {
    return !this.plugins || this.plugins.length === 0
      ? Promise.resolve({} as A) // tslint:disable-line
      : Promise.all(
          this.plugins.map(plugin => {
            const maybePromise = plugin.create();
            return maybePromise instanceof Promise
              ? maybePromise
              : Promise.resolve(maybePromise);
          }),
        ).then(
          auxes => auxes.reduce((all, each) => ({ ...all, ...each }), {}) as A,
        );
  };
}

class HandlerProxy<A extends HandlerAuxBase> {
  private request: HandlerRequest;
  private response: HandlerResponse;
  private aux: A;

  public constructor(event: any, context: any, callback: any) {
    logger.stupid(`event`, event);
    this.request = new HandlerRequest(event, context);
    this.response = new HandlerResponse(callback);
    this.aux = {} as A; // tslint:disable-line
  }

  public call = async (
    middleware: HandlerMiddleware<A>,
    handler: Handler<A>,
  ) => {
    try {
      this.aux = await middleware.auxPromise;
    } catch (error) {
      logger.error(
        `Error while initializing plugins' aux: ${stringifyError(error)}`,
      );
      this.response.fail(
        error instanceof Error ? { error: error.message } : error,
      );
      return [error];
    }

    const actualHandler = [this.generateDelegator(handler)];
    const beginHandlers = middleware.plugins.map(plugin =>
      this.generateDelegator(plugin.begin),
    );
    const endHandlers = middleware.plugins.map(plugin =>
      this.generateDelegator(plugin.end),
    );
    const errorHandlers = middleware.plugins.map(plugin =>
      this.generateDelegator(plugin.error),
    );

    const iterate = async (
      handlers: Delegator[],
      okResponsible: boolean = false,
    ) =>
      Promise.all(
        handlers.map(each => this.safeCall(each, okResponsible, errorHandlers)),
      );

    const results = [
      ...(await iterate(beginHandlers)),
      ...(await iterate(actualHandler, true)),
      ...(await iterate(endHandlers)),
    ].filter(x => x);
    // In test phase, throws any exception if there was.
    if (process.env.NODE_ENV === 'test') {
      for (const each of results) {
        if (each instanceof Error) {
          logger.error(`Error occurred: ${stringifyError(each)}`);
          throw each;
        }
      }
    }
    results.forEach(result =>
      logger.silly(`middleware result : ${JSON.stringify(result)}`),
    );
  };

  private safeCall = async (
    delegator: Delegator,
    okResponsible: boolean,
    errorHandlers: Delegator[],
  ) => {
    try {
      const result = await delegator(okResponsible);
      return result;
    } catch (error) {
      const handled = await this.handleError(error, errorHandlers);
      return handled;
    }
  };

  private generateDelegator = (handler: Handler<A>): Delegator => async (
    okResponsible: boolean,
  ) => {
    const maybePromise = handler({
      request: this.request,
      response: this.response,
      aux: this.aux,
    });
    const result =
      maybePromise instanceof Promise ? await maybePromise : maybePromise;
    logger.stupid(`result`, result);
    if (!this.response.completed && okResponsible) {
      this.response.ok(result);
    }
    return result;
  };

  private handleError = async (error: Error, errorHandlers?: Delegator[]) => {
    logger.error(error);
    this.request.lastError = error;

    if (errorHandlers) {
      for (const handler of errorHandlers) {
        try {
          await handler(false);
        } catch (ignorable) {
          logger.error(ignorable);
        }
      }
    }
    if (!this.response.completed) {
      this.response.fail(
        error instanceof Error ? { error: error.message } : error,
      );
    }
    return error;
  };
}

// It will break type safety because there is no relation between Aux and Plugin.
const build = <Aux extends HandlerAuxBase>(
  plugins: Array<HandlerPluginBase<any>>,
) => {
  const middleware = new HandlerMiddleware<Aux>(plugins);
  return (handler: Handler<Aux>) => (
    event: any,
    context: any,
    callback: any,
  ) => {
    new HandlerProxy<Aux>(event, context, callback).call(middleware, handler);
  };
};
export default build;
