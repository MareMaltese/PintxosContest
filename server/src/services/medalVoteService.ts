import { randomUUID } from 'node:crypto';
import type { Db } from '../db/connection';
import { AppError } from '../middleware/errors';
import { getContest } from './contestService';
import { getEntryUnchecked } from './entryService';

export type Medal = 'GOLD' | 'SILVER' | 'BRONZE';

export interface MyMedals {
  gold: string | null;
  silver: string | null;
  bronze: string | null;
}

export async function getMyMedals(db: Db, userId: string): Promise<MyMedals> {
  const rows = (await db.prepare('SELECT entryId, medal FROM MedalVote WHERE userId = ?').all(userId)) as unknown as {
    entryId: string;
    medal: Medal;
  }[];
  const result: MyMedals = { gold: null, silver: null, bronze: null };
  for (const row of rows) {
    if (row.medal === 'GOLD') result.gold = row.entryId;
    if (row.medal === 'SILVER') result.silver = row.entryId;
    if (row.medal === 'BRONZE') result.bronze = row.entryId;
  }
  return result;
}

export async function setMedal(db: Db, userId: string, entryId: string, medal: Medal | null): Promise<void> {
  const contest = await getContest(db);
  if (contest.phase !== 'VOTING') {
    throw new AppError(409, 'NOT_VOTING_PHASE', 'La votación no está abierta ahora mismo.');
  }
  if (medal !== null) {
    const entry = await getEntryUnchecked(db, entryId);
    if (!entry) {
      throw new AppError(400, 'ENTRY_NOT_FOUND', 'Esa tapa no existe.');
    }
    if (!contest.allowSelfVote && entry.creatorId === userId) {
      throw new AppError(403, 'SELF_VOTE_FORBIDDEN', 'No puedes votar tu propio pincho.');
    }
  }
  const tx = db.transaction(async () => {
    await db.prepare('DELETE FROM MedalVote WHERE userId = ? AND entryId = ?').run(userId, entryId);
    if (medal !== null) {
      await db.prepare('DELETE FROM MedalVote WHERE userId = ? AND medal = ?').run(userId, medal);
      await db
        .prepare('INSERT INTO MedalVote (id, userId, entryId, medal, createdAt) VALUES (?, ?, ?, ?, ?)')
        .run(randomUUID(), userId, entryId, medal, new Date().toISOString());
    }
  });
  await tx();
}
