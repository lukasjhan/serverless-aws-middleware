import { AWSPluginAux, middleware, TracerPluginAux } from '../src';

test('basic', async () => {
  type Aux = AWSPluginAux & TracerPluginAux;
  const handler = middleware.build<Aux>([
    middleware.aws(),
    middleware.trace({
      route: 'index/type',
      queueName: 'trace-queue',
      system: 'hello-world',
    }),
  ]);

  await handler(async ({ request, response, aux }) => {
    const { aws, tracer } = aux;
    expect(request).toBeDefined();
    expect(response).toBeDefined();
    expect(aws).toBeDefined();
    expect(tracer).toBeDefined();
  })({}, {}, () => 0);
});
