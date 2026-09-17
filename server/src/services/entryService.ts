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
  console.log(`[registro] Nueva tapa #${number}${input.name ? ` "${input.name}"` : ''} (creador ${input.creatorId})`);
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

export interface EntryDetail extends Entry {
  creatorName: string;
}

export function getEntry(db: Database.Database, id: string): EntryDetail {
  assertGalleryUnlocked(db);
  const entry = db
    .prepare(
      `SELECT e.*, u.name as creatorName
       FROM Entry e
       JOIN User u ON u.id = e.creatorId
       WHERE e.id = ?`
    )
    .get(id) as EntryDetail | undefined;
  if (!entry) {
    throw new AppError(404, 'ENTRY_NOT_FOUND', 'No existe esa tapa.');
  }
  return entry;
}

export function getEntryUnchecked(db: Database.Database, id: string): Entry | undefined {
  return db.prepare('SELECT * FROM Entry WHERE id = ?').get(id) as Entry | undefined;
}

export function listEntriesForAdmin(db: Database.Database): EntryDetail[] {
  return db
    .prepare(
      `SELECT e.*, u.name as creatorName
       FROM Entry e
       JOIN User u ON u.id = e.creatorId
       ORDER BY e.number ASC`
    )
    .all() as EntryDetail[];
}

export function listMyEntries(db: Database.Database, userId: string): Entry[] {
  return db.prepare('SELECT * FROM Entry WHERE creatorId = ? ORDER BY number ASC').all(userId) as Entry[];
}

export interface UpdateOwnEntryInput {
  name?: string | null;
  description?: string | null;
}

export function updateOwnEntry(
  db: Database.Database,
  userId: string,
  entryId: string,
  fields: UpdateOwnEntryInput
): Entry {
  const contest = getContest(db);
  if (contest.phase !== 'REGISTRATION') {
    throw new AppError(409, 'REGISTRATION_CLOSED', 'Ya no se pueden editar tapas: el concurso ha empezado.');
  }
  const entry = getEntryUnchecked(db, entryId);
  if (!entry) {
    throw new AppError(404, 'ENTRY_NOT_FOUND', 'No existe esa tapa.');
  }
  if (entry.creatorId !== userId) {
    throw new AppError(403, 'NOT_YOUR_ENTRY', 'Esta tapa no es tuya.');
  }
  if (fields.name !== undefined) {
    db.prepare('UPDATE Entry SET name = ? WHERE id = ?').run(fields.name, entryId);
  }
  if (fields.description !== undefined) {
    db.prepare('UPDATE Entry SET description = ? WHERE id = ?').run(fields.description, entryId);
  }
  return getEntryUnchecked(db, entryId)!;
}
