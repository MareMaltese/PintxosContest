import type { Db } from '../db/connection';
import { AppError } from '../middleware/errors';
import { getContest } from './contestService';
import { getVotableCount } from './voteService';

// The voter's saved ordering, best first. Empty until they save it for the first time.
export async function getMyRanking(db: Db, userId: string): Promise<string[]> {
  const rows = (await db
    .prepare('SELECT entryId FROM RankingVote WHERE userId = ? ORDER BY position ASC')
    .all(userId)) as unknown as { entryId: string }[];
  return rows.map((r) => r.entryId);
}

export async function countMyRanked(db: Db, userId: string): Promise<number> {
  return (
    (await db.prepare('SELECT COUNT(*) as c FROM RankingVote WHERE userId = ?').get(userId)) as unknown as { c: number }
  ).c;
}

// A ranking is "complete" once it orders every entry the voter is allowed to vote for.
export async function getRankingLimit(db: Db, userId: string): Promise<number> {
  const contest = await getContest(db);
  return Math.max(await getVotableCount(db, userId, contest.allowSelfVote), 0);
}

// Replaces the voter's whole ordering. It must list every votable entry exactly once
// (and never their own unless self-voting is allowed), so a saved ranking is always
// complete and positions are comparable across voters.
export async function setMyRanking(db: Db, userId: string, entryIds: string[]): Promise<void> {
  const contest = await getContest(db);
  if (contest.phase !== 'VOTING') {
    throw new AppError(409, 'NOT_VOTING_PHASE', 'La votación no está abierta ahora mismo.');
  }
  if (new Set(entryIds).size !== entryIds.length) {
    throw new AppError(400, 'DUPLICATE_ENTRY', 'Hay un pincho repetido en tu clasificación.');
  }
  const entries = (await db.prepare('SELECT id, creatorId FROM Entry').all()) as unknown as {
    id: string;
    creatorId: string;
  }[];
  const votableIds = new Set(
    entries.filter((e) => contest.allowSelfVote || e.creatorId !== userId).map((e) => e.id)
  );
  const ownIds = new Set(entries.filter((e) => e.creatorId === userId).map((e) => e.id));
  if (entryIds.some((id) => ownIds.has(id) && !votableIds.has(id))) {
    throw new AppError(403, 'SELF_VOTE_FORBIDDEN', 'No puedes votar tu propio pincho.');
  }
  if (entryIds.length !== votableIds.size || entryIds.some((id) => !votableIds.has(id))) {
    throw new AppError(400, 'INCOMPLETE_RANKING', 'Tu clasificación tiene que incluir todos los pinchos.');
  }

  const now = new Date().toISOString();
  const tx = db.transaction(async () => {
    await db.prepare('DELETE FROM RankingVote WHERE userId = ?').run(userId);
    const insert = db.prepare('INSERT INTO RankingVote (userId, entryId, position, createdAt) VALUES (?, ?, ?, ?)');
    for (const [index, entryId] of entryIds.entries()) {
      await insert.run(userId, entryId, index + 1, now);
    }
  });
  await tx();
}
