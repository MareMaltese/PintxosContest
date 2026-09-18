import { randomUUID } from 'node:crypto';
import type { Db } from '../db/connection';
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

// NOTE: this "transaction" is not atomic against concurrent writers (see
// db/connection.ts) — acceptable for this app's scale, but a real race
// between two simultaneous registrations could in theory produce the same
// number. Not observed in practice for a LAN party's pace of registrations.
export async function createEntry(db: Db, input: CreateEntryInput): Promise<Entry> {
  const contest = await getContest(db);
  if (contest.phase !== 'REGISTRATION') {
    throw new AppError(409, 'REGISTRATION_CLOSED', 'Ya no se pueden registrar tapas: el concurso ha empezado.');
  }
  const id = randomUUID();
  const createdAt = new Date().toISOString();
  const tx = db.transaction(async () => {
    const row = (await db.prepare('SELECT COALESCE(MAX(number), 0) as maxNumber FROM Entry').get()) as unknown as {
      maxNumber: number;
    };
    const number = row.maxNumber + 1;
    await db
      .prepare(
        `INSERT INTO Entry (id, number, creatorId, name, description, imagePath, createdAt)
         VALUES (?, ?, ?, ?, ?, ?, ?)`
      )
      .run(id, number, input.creatorId, input.name, input.description, input.imagePath, createdAt);
    return number;
  });
  const number = await tx();
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

export async function listEntries(db: Db): Promise<Entry[]> {
  return (await db.prepare('SELECT * FROM Entry ORDER BY number ASC').all()) as unknown as Entry[];
}

export interface EntryDetail extends Entry {
  creatorName: string;
}

export async function getEntry(db: Db, id: string): Promise<EntryDetail> {
  const entry = (await db
    .prepare(
      `SELECT e.*, u.name as creatorName
       FROM Entry e
       JOIN User u ON u.id = e.creatorId
       WHERE e.id = ?`
    )
    .get(id)) as EntryDetail | undefined;
  if (!entry) {
    throw new AppError(404, 'ENTRY_NOT_FOUND', 'No existe esa tapa.');
  }
  return entry;
}

export async function getEntryUnchecked(db: Db, id: string): Promise<Entry | undefined> {
  return (await db.prepare('SELECT * FROM Entry WHERE id = ?').get(id)) as Entry | undefined;
}

export async function listEntriesForAdmin(db: Db): Promise<EntryDetail[]> {
  return (await db
    .prepare(
      `SELECT e.*, u.name as creatorName
       FROM Entry e
       JOIN User u ON u.id = e.creatorId
       ORDER BY e.number ASC`
    )
    .all()) as unknown as EntryDetail[];
}

export async function listMyEntries(db: Db, userId: string): Promise<Entry[]> {
  return (await db.prepare('SELECT * FROM Entry WHERE creatorId = ? ORDER BY number ASC').all(userId)) as unknown as Entry[];
}

export interface UpdateOwnEntryInput {
  name?: string | null;
  description?: string | null;
  imagePath?: string;
}

export async function updateOwnEntry(
  db: Db,
  userId: string,
  entryId: string,
  fields: UpdateOwnEntryInput
): Promise<Entry> {
  const contest = await getContest(db);
  if (contest.phase !== 'REGISTRATION') {
    throw new AppError(409, 'REGISTRATION_CLOSED', 'Ya no se pueden editar tapas: el concurso ha empezado.');
  }
  const entry = await getEntryUnchecked(db, entryId);
  if (!entry) {
    throw new AppError(404, 'ENTRY_NOT_FOUND', 'No existe esa tapa.');
  }
  if (entry.creatorId !== userId) {
    throw new AppError(403, 'NOT_YOUR_ENTRY', 'Esta tapa no es tuya.');
  }
  if (fields.name !== undefined) {
    await db.prepare('UPDATE Entry SET name = ? WHERE id = ?').run(fields.name, entryId);
  }
  if (fields.description !== undefined) {
    await db.prepare('UPDATE Entry SET description = ? WHERE id = ?').run(fields.description, entryId);
  }
  if (fields.imagePath !== undefined) {
    await db.prepare('UPDATE Entry SET imagePath = ? WHERE id = ?').run(fields.imagePath, entryId);
  }
  return (await getEntryUnchecked(db, entryId))!;
}

export async function deleteOwnEntry(db: Db, userId: string, entryId: string): Promise<string> {
  const contest = await getContest(db);
  if (contest.phase !== 'REGISTRATION') {
    throw new AppError(409, 'REGISTRATION_CLOSED', 'Ya no se pueden borrar tapas: el concurso ha empezado.');
  }
  const entry = await getEntryUnchecked(db, entryId);
  if (!entry) {
    throw new AppError(404, 'ENTRY_NOT_FOUND', 'No existe esa tapa.');
  }
  if (entry.creatorId !== userId) {
    throw new AppError(403, 'NOT_YOUR_ENTRY', 'Esta tapa no es tuya.');
  }
  await db.prepare('DELETE FROM Entry WHERE id = ?').run(entryId);
  return entry.imagePath;
}
