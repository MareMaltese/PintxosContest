import { randomUUID } from 'node:crypto';
import type Database from 'better-sqlite3';
import { AppError } from '../middleware/errors';
import { getContest } from './contestService';

export interface Entry {
  id: string;
  number: number;
  creatorId: string;
  name: string | null;
  description: string | null;
  imagePath: string;
  createdAt: string;
}

export interface CreateEntryInput {
  creatorId: string;
  name: string | null;
  description: string | null;
  imagePath: string;
}

// better-sqlite3 runs synchronously, so the whole Node process is blocked for the
// duration of this transaction: no other request handler can interleave between
// the MAX(number) read and the INSERT, even without relying on SQLite's own locking.
export function createEntry(db: Database.Database, input: CreateEntryInput): Entry {
  const contest = getContest(db);
  if (contest.phase !== 'REGISTRATION') {
    throw new AppError(409, 'REGISTRATION_CLOSED', 'Ya no se pueden registrar tapas: el concurso ha empezado.');
  }
  const id = randomUUID();
  const createdAt = new Date().toISOString();
  const tx = db.transaction(() => {
    const row = db.prepare('SELECT COALESCE(MAX(number), 0) as maxNumber FROM Entry').get() as {
      maxNumber: number;
    };
    const number = row.maxNumber + 1;
    db.prepare(
      `INSERT INTO Entry (id, number, creatorId, name, description, imagePath, createdAt)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    ).run(id, number, input.creatorId, input.name, input.description, input.imagePath, createdAt);
    return number;
  });
  const number = tx();
  return {
    id,
    number,
    creatorId: input.creatorId,
    name: input.name,
    description: input.description,
    imagePath: input.imagePath,
    createdAt,
  };
}

function assertGalleryUnlocked(db: Database.Database): void {
  const contest = getContest(db);
  if (contest.phase === 'REGISTRATION') {
    throw new AppError(409, 'GALLERY_LOCKED', 'La galería todavía no está disponible.');
  }
}

export function listEntries(db: Database.Database): Entry[] {
  assertGalleryUnlocked(db);
  return db.prepare('SELECT * FROM Entry ORDER BY number ASC').all() as Entry[];
}

export function getEntry(db: Database.Database, id: string): Entry {
  assertGalleryUnlocked(db);
  const entry = db.prepare('SELECT * FROM Entry WHERE id = ?').get(id) as Entry | undefined;
  if (!entry) {
    throw new AppError(404, 'ENTRY_NOT_FOUND', 'No existe esa tapa.');
  }
  return entry;
}

export function getEntryUnchecked(db: Database.Database, id: string): Entry | undefined {
  return db.prepare('SELECT * FROM Entry WHERE id = ?').get(id) as Entry | undefined;
}
