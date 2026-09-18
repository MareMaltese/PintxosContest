import { randomUUID } from 'node:crypto';
import type { Db } from '../db/connection';
import { AppError } from '../middleware/errors';

export interface User {
  id: string;
  name: string;
  createdAt: string;
  lastSeen: string;
}

export async function createUser(db: Db, name: string): Promise<User> {
  const id = randomUUID();
  const now = new Date().toISOString();
  await db.prepare('INSERT INTO User (id, name, createdAt, lastSeen) VALUES (?, ?, ?, ?)').run(id, name, now, now);
  console.log(`[registro] Nuevo participante: ${name} (${id})`);
  return { id, name, createdAt: now, lastSeen: now };
}

export async function touchHeartbeat(db: Db, id: string): Promise<void> {
  const now = new Date().toISOString();
  const result = await db.prepare('UPDATE User SET lastSeen = ? WHERE id = ?').run(now, id);
  if (result.changes === 0) {
    throw new Error('USER_NOT_FOUND');
  }
}

export async function getUser(db: Db, id: string): Promise<User | undefined> {
  return (await db.prepare('SELECT * FROM User WHERE id = ?').get(id)) as User | undefined;
}

export async function listUsers(db: Db): Promise<User[]> {
  return (await db.prepare('SELECT * FROM User ORDER BY createdAt ASC').all()) as unknown as User[];
}

export async function recoverUser(db: Db, name: string, entryNumber: number): Promise<User> {
  const entry = (await db.prepare('SELECT creatorId FROM Entry WHERE number = ?').get(entryNumber)) as
    | { creatorId: string }
    | undefined;
  const notFound = () =>
    new AppError(404, 'RECOVERY_NOT_FOUND', 'No hemos encontrado esa combinación de nombre y número de pincho.');
  if (!entry) {
    throw notFound();
  }
  const user = (await db
    .prepare('SELECT * FROM User WHERE id = ? AND LOWER(name) = LOWER(?)')
    .get(entry.creatorId, name.trim())) as User | undefined;
  if (!user) {
    throw notFound();
  }
  return user;
}
