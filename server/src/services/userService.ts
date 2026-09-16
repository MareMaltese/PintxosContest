import { randomUUID } from 'node:crypto';
import type Database from 'better-sqlite3';

export interface User {
  id: string;
  name: string;
  createdAt: string;
  lastSeen: string;
}

export function createUser(db: Database.Database, name: string): User {
  const id = randomUUID();
  const now = new Date().toISOString();
  db.prepare('INSERT INTO User (id, name, createdAt, lastSeen) VALUES (?, ?, ?, ?)').run(id, name, now, now);
  return { id, name, createdAt: now, lastSeen: now };
}

export function touchHeartbeat(db: Database.Database, id: string): void {
  const now = new Date().toISOString();
  const result = db.prepare('UPDATE User SET lastSeen = ? WHERE id = ?').run(now, id);
  if (result.changes === 0) {
    throw new Error('USER_NOT_FOUND');
  }
}

export function getUser(db: Database.Database, id: string): User | undefined {
  return db.prepare('SELECT * FROM User WHERE id = ?').get(id) as User | undefined;
}

export function listUsers(db: Database.Database): User[] {
  return db.prepare('SELECT * FROM User ORDER BY createdAt ASC').all() as User[];
}
