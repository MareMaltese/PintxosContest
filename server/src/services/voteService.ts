import { randomUUID } from 'node:crypto';
import type { Db } from '../db/connection';
import { AppError } from '../middleware/errors';
import { getContest } from './contestService';
import { getEntryUnchecked } from './entryService';

const MAX_FAVORITES = 3;

export async function getVotableCount(db: Db, userId: string, allowSelfVote: boolean): Promise<number> {
  const total = ((await db.prepare('SELECT COUNT(*) as c FROM Entry').get()) as unknown as { c: number }).c;
  if (allowSelfVote) return total;
  const own = ((await db.prepare('SELECT COUNT(*) as c FROM Entry WHERE creatorId = ?').get(userId)) as unknown as {
    c: number;
  }).c;
  return total - own;
}

export async function getFavoriteLimit(db: Db, userId: string): Promise<number> {
  const contest = await getContest(db);
  const votable = await getVotableCount(db, userId, contest.allowSelfVote);
  return Math.min(MAX_FAVORITES, Math.max(votable, 0));
}

export async function listMyVotes(db: Db, userId: string): Promise<string[]> {
  const rows = (await db.prepare('SELECT entryId FROM Vote WHERE userId = ?').all(userId)) as unknown as {
    entryId: string;
  }[];
  return rows.map((r) => r.entryId);
}

export async function addVote(db: Db, userId: string, entryId: string): Promise<void> {
  const contest = await getContest(db);
  if (contest.phase !== 'VOTING') {
    throw new AppError(409, 'NOT_VOTING_PHASE', 'La votación no está abierta ahora mismo.');
  }
  const entry = await getEntryUnchecked(db, entryId);
  if (!entry) {
    throw new AppError(400, 'ENTRY_NOT_FOUND', 'Esa tapa no existe.');
  }
  if (!contest.allowSelfVote && entry.creatorId === userId) {
    throw new AppError(403, 'SELF_VOTE_FORBIDDEN', 'No puedes votar tu propio pincho.');
  }
  const tx = db.transaction(async () => {
    const existing = await db.prepare('SELECT 1 FROM Vote WHERE userId = ? AND entryId = ?').get(userId, entryId);
    if (existing) {
      throw new AppError(409, 'ALREADY_VOTED', 'Ya has marcado esta tapa como favorita.');
    }
    const current = ((await db
      .prepare('SELECT COUNT(*) as c FROM Vote WHERE userId = ?')
      .get(userId)) as unknown as { c: number }).c;
    const limit = await getFavoriteLimit(db, userId);
    if (current >= limit) {
      throw new AppError(
        409,
        'FAVORITES_LIMIT_REACHED',
        `Ya has elegido tus ${limit} pinchos favoritos. Si quieres cambiar uno, primero quita el "Me encanta" de otro pincho.`
      );
    }
    await db
      .prepare('INSERT INTO Vote (id, userId, entryId, createdAt) VALUES (?, ?, ?, ?)')
      .run(randomUUID(), userId, entryId, new Date().toISOString());
  });
  await tx();
}

export async function removeVote(db: Db, userId: string, entryId: string): Promise<void> {
  const contest = await getContest(db);
  if (contest.phase !== 'VOTING') {
    throw new AppError(409, 'NOT_VOTING_PHASE', 'La votación no está abierta ahora mismo.');
  }
  const result = await db.prepare('DELETE FROM Vote WHERE userId = ? AND entryId = ?').run(userId, entryId);
  if (result.changes === 0) {
    throw new AppError(404, 'VOTE_NOT_FOUND', 'No tenías esa tapa marcada como favorita.');
  }
}
