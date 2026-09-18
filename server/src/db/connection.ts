import fs from 'node:fs';
import path from 'node:path';
import { createClient, type Client, type InValue } from '@libsql/client';

export interface PreparedStatement {
  get(...args: InValue[]): Promise<Record<string, unknown> | undefined>;
  all(...args: InValue[]): Promise<Record<string, unknown>[]>;
  run(...args: InValue[]): Promise<{ changes: number }>;
}

export interface Db {
  prepare(sql: string): PreparedStatement;
  // NOTE: not a real atomic transaction. libsql's Client#execute runs every
  // statement on its own logical connection, so this just runs the callback
  // sequentially. Good enough for this app's scale (single process, low
  // concurrency LAN party); a real multi-statement transaction would need
  // the callback to route through client.transaction() instead.
  transaction<Args extends unknown[], T>(fn: (...args: Args) => T | Promise<T>): (...args: Args) => Promise<T>;
  exec(sql: string): Promise<void>;
}

function wrapClient(client: Client): Db {
  return {
    prepare(sql: string): PreparedStatement {
      return {
        async get(...args: InValue[]) {
          const result = await client.execute({ sql, args });
          return result.rows[0] as unknown as Record<string, unknown> | undefined;
        },
        async all(...args: InValue[]) {
          const result = await client.execute({ sql, args });
          return result.rows as unknown as Record<string, unknown>[];
        },
        async run(...args: InValue[]) {
          const result = await client.execute({ sql, args });
          return { changes: result.rowsAffected };
        },
      };
    },
    transaction<Args extends unknown[], T>(fn: (...args: Args) => T | Promise<T>) {
      return async (...args: Args) => fn(...args);
    },
    async exec(sql: string) {
      await client.executeMultiple(sql);
    },
  };
}

export async function createDb(url: string, authToken?: string): Promise<Db> {
  const client = createClient({ url, authToken, intMode: 'number' });
  const db = wrapClient(client);

  const schema = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf-8');
  await db.exec(schema);

  const existing = await db.prepare('SELECT id FROM Contest WHERE id = 1').get();
  if (!existing) {
    await db
      .prepare(
        `INSERT INTO Contest (id, phase, allowSelfVote, resultsRevealedAt, createdAt)
         VALUES (1, 'REGISTRATION', 0, NULL, ?)`
      )
      .run(new Date().toISOString());
  }
  return db;
}
