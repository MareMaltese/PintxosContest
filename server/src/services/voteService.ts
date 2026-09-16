import { randomUUID } from 'node:crypto';
import type Database from 'better-sqlite3';
import { AppError } from '../middleware/errors';
import { getContest } from './contestService';
import { getEntryUnchecked } from './entryService';

const MAX_FAVORITES = 3;

export function getVotableCount(db: Database.Database, userId: string, allowSelfVote: boolean): number {
  const total = (db.prepare('SELECT COUNT(*) as c FROM Entry').get() as { c: number }).c;
  if (allowSelfVote) return total;
  const own = (db.prepare('SELECT COUNT(*) as c FROM Entry WHERE creatorId = ?').get(userId) as { c: number }).c;
  return total - own;
}

export function getFavoriteLimit(db: Database.Database, userId: string): number {
  const contest = getContest(db);
  const votable = getVotableCount(db, userId, contest.allowSelfVote);
  return Math.min(MAX_FAVORITES, Math.max(votable, 0));
}

export function listMyVotes(db: Database.Database, userId: string): string[] {
  const rows = db.prepare('SELECT entryId FROM Vote WHERE userId = ?').all(userId) as { entryId: string }[];
  return rows.map((r) => r.entryId);
}

export function addVote(db: Database.Database, userId: string, entryId: string): void {
  const contest = getContest(db);
  if (contest.phase !== 'VOTING') {
    throw new AppError(409, 'NOT_VOTING_PHASE', 'La votación no está abierta ahora mismo.');
  }
  const entry = getEntryUnchecked(db, entryId);
  if (!entry) {
    throw new AppError(400, 'ENTRY_NOT_FOUND', 'Esa tapa no existe.');
  }
  if (!contest.allowSelfVote && entry.creatorId === userId) {
    throw new AppError(403, 'SELF_VOTE_FORBIDDEN', 'No puedes votar tu propio pincho.');
  }
  const tx = db.transaction(() => {
    const existing = db.prepare('SELECT 1 FROM Vote WHERE userId = ? AND entryId = ?').get(userId, entryId);
    if (existing) {
      throw new AppError(409, 'ALREADY_VOTED', 'Ya has marcado esta tapa como favorita.');
    }
    const current = (db.prepare('SELECT COUNT(*) as c FROM Vote WHERE userId = ?').get(userId) as { c: number }).c;
    const limit = getFavoriteLimit(db, userId);
    if (current >= limit) {
      throw new AppError(
        409,
        'FAVORITES_LIMIT_REACHED',
        `Ya has elegido tus ${limit} pinchos favoritos. Si quieres cambiar uno, primero quita el "Me encanta" de otro pincho.`
      );
    }
    db.prepare('INSERT INTO Vote (id, userId, entryId, createdAt) VALUES (?, ?, ?, ?)').run(
      randomUUID(),
      userId,
      entryId,
      new Date().toISOString()
    );
  });
  tx();
}

export function removeVote(db: Database.Database, userId: string, entryId: string): void {
  const contest = getContest(db);
  if (contest.phase !== 'VOTING') {
    throw new AppError(409, 'NOT_VOTING_PHASE', 'La votación no está abierta ahora mismo.');
  }
  const result = db.prepare('DELETE FROM Vote WHERE userId = ? AND entryId = ?').run(userId, entryId);
  if (result.changes === 0) {
    throw new AppError(404, 'VOTE_NOT_FOUND', 'No tenías esa tapa marcada como favorita.');
  }
}
