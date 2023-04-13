# Serverless simple middleware

This is a middleware of the interface of lambda's handler to use `request => response`.

## Additional explanation

A wrapping function is provided from middleware

```ts
export const spam = handler(
  async ({ request, aux }): Promise<ResponseType> => {
    const { logger, db } = aux;
    const body: ReqestBody = request.body;
    logger.info('requset log');

    const response = await logic(db, body);
    return response;
  },
);
```

## Include features

* mysql
* event queue (AWS SQS)
* S3
* logging
* organize request object
* setting response object 
