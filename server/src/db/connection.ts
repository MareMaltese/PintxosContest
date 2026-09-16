import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';

export function createDb(dbPath: string): Database.Database {
  const isMemory = dbPath === ':memory:';
  if (!isMemory) {
    fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  }
  const db = new Database(dbPath);
  if (!isMemory) {
    db.pragma('journal_mode = WAL');
  }
  db.pragma('foreign_keys = ON');

  const schema = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf-8');
  db.exec(schema);

  const existing = db.prepare('SELECT id FROM Contest WHERE id = 1').get();
  if (!existing) {
    db.prepare(
      `INSERT INTO Contest (id, phase, allowSelfVote, resultsRevealedAt, createdAt)
       VALUES (1, 'REGISTRATION', 0, NULL, ?)`
    ).run(new Date().toISOString());
  }
  return db;
}
