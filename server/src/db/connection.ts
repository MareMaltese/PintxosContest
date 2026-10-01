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

// schema.sql only uses CREATE TABLE IF NOT EXISTS, so it never adds columns to a
// table that already existed before this column was introduced (e.g. the live
// production database). New columns must be added here, guarded so re-running
// it against a database that already has the column is a harmless no-op.
async function ensureColumn(db: Db, table: string, column: string, ddl: string): Promise<void> {
  const columns = (await db.prepare(`PRAGMA table_info(${table})`).all()) as unknown as { name: string }[];
  if (!columns.some((c) => c.name === column)) {
    await db.exec(`ALTER TABLE ${table} ADD COLUMN ${ddl}`);
  }
}

// The live Contest table was created with CHECK (votingMode IN ('FAVORITES','MEDALS')),
// and SQLite can't alter a CHECK constraint in place. Rebuild the table (a single row,
// nothing references it) so 'RANKING' is accepted. Must run after ensureColumn has
// added worstPrizeEnabled, since the copy below names that column.
async function allowRankingVotingMode(db: Db): Promise<void> {
  const row = (await db.prepare("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'Contest'").get()) as
    | { sql: string }
    | undefined;
  if (!row || !row.sql.includes('votingMode IN') || row.sql.includes("'RANKING'")) return;
  await db.exec(`
    BEGIN;
    CREATE TABLE Contest_new (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      phase TEXT NOT NULL CHECK (phase IN ('REGISTRATION','VOTING','TIEBREAK','RESULTS')),
      allowSelfVote INTEGER NOT NULL DEFAULT 0,
      votingMode TEXT NOT NULL DEFAULT 'FAVORITES' CHECK (votingMode IN ('FAVORITES','MEDALS','RANKING')),
      resultsRevealedAt TEXT NULL,
      worstPrizeEnabled INTEGER NOT NULL DEFAULT 0,
      createdAt TEXT NOT NULL
    );
    INSERT INTO Contest_new (id, phase, allowSelfVote, votingMode, resultsRevealedAt, worstPrizeEnabled, createdAt)
      SELECT id, phase, allowSelfVote, votingMode, resultsRevealedAt, worstPrizeEnabled, createdAt FROM Contest;
    DROP TABLE Contest;
    ALTER TABLE Contest_new RENAME TO Contest;
    COMMIT;
  `);
}

export async function createDb(url: string, authToken?: string): Promise<Db> {
  const client = createClient({ url, authToken, intMode: 'number' });
  const db = wrapClient(client);

  const schema = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf-8');
  await db.exec(schema);
  await ensureColumn(db, 'Contest', 'worstPrizeEnabled', 'worstPrizeEnabled INTEGER NOT NULL DEFAULT 0');
  await allowRankingVotingMode(db);

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
