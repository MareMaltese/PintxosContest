import { randomUUID } from 'node:crypto';
import type Database from 'better-sqlite3';
import { AppError } from '../middleware/errors';

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
  console.log(`[registro] Nuevo participante: ${name} (${id})`);
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

export function recoverUser(db: Database.Database, name: string, entryNumber: number): User {
  const entry = db.prepare('SELECT creatorId FROM Entry WHERE number = ?').get(entryNumber) as
    | { creatorId: string }
    | undefined;
  const notFound = () =>
    new AppError(404, 'RECOVERY_NOT_FOUND', 'No hemos encontrado esa combinación de nombre y número de pincho.');
  if (!entry) {
    throw notFound();
  }
  const user = db
    .prepare('SELECT * FROM User WHERE id = ? AND LOWER(name) = LOWER(?)')
    .get(entry.creatorId, name.trim()) as User | undefined;
  if (!user) {
    throw notFound();
  }
  return user;
}
