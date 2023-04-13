import { middleware, MySQLPluginAux } from '../src';

test('basic', async () => {
  type Aux = MySQLPluginAux;
  const handler = middleware.build<Aux>([
    middleware.mysql({
      config: {
        host: 'localhost',
        user: 'test',
        password: 'test***',
        database: 'test123',
      },
      schema: {
        database: `CREATE DATABASE IF NOT EXISTS test123`,
        eager: true,
        tables: {
          simple: `CREATE TABLE IF NOT EXISTS simple (id INT PRIMARY KEY);`,
        },
      },
    }),
  ]);

  handler(async ({ request, response, aux }) => {
    const { db } = aux;
    expect(request).toBeDefined();
    expect(response).toBeDefined();
    expect(db).toBeDefined();

    const result1 = await db.fetchOne<{ '1': number }>('SELECT 1');
    expect(result1['1']).toBe(1);

    const result2 = await db.fetchOne<{ '1': number }>('SELECT 1');
    expect(result2['1']).toBe(1);
  })({}, {}, () => 0);
});
