import { randomUUID } from 'node:crypto';
import type Database from 'better-sqlite3';
import { AppError } from '../middleware/errors';
import { getContest, setPhase } from './contestService';
import { computeStandings, podiumTieGroups } from './rankingService';

export interface TiebreakRound {
  id: string;
  roundNumber: number;
  targetRank: number;
  status: 'OPEN' | 'CLOSED';
  createdAt: string;
  closedAt: string | null;
}

export interface EntrySummary {
  id: string;
  number: number;
  name: string | null;
  imagePath: string;
}

export function openRound(db: Database.Database, targetRank: number, candidateEntryIds: string[]): TiebreakRound {
  const now = new Date().toISOString();
  const prevMax = db.prepare('SELECT MAX(roundNumber) as m FROM TiebreakRound').get() as { m: number | null };
  const roundNumber = (prevMax.m ?? 0) + 1;
  const id = randomUUID();
  const tx = db.transaction(() => {
    db.prepare(
      `INSERT INTO TiebreakRound (id, roundNumber, targetRank, status, createdAt, closedAt)
       VALUES (?, ?, ?, 'OPEN', ?, NULL)`
    ).run(id, roundNumber, targetRank, now);
    const insertCandidate = db.prepare('INSERT INTO TiebreakCandidate (roundId, entryId) VALUES (?, ?)');
    for (const entryId of candidateEntryIds) {
      insertCandidate.run(id, entryId);
    }
    setPhase(db, 'TIEBREAK');
  });
  tx();
  return getRoundById(db, id)!;
}

export function getRoundById(db: Database.Database, id: string): TiebreakRound | undefined {
  return db.prepare('SELECT * FROM TiebreakRound WHERE id = ?').get(id) as TiebreakRound | undefined;
}

export function getOpenRoundId(db: Database.Database): string | null {
  const row = db
    .prepare("SELECT id FROM TiebreakRound WHERE status = 'OPEN' ORDER BY roundNumber DESC LIMIT 1")
    .get() as { id: string } | undefined;
  return row?.id ?? null;
}

export function getCandidateIds(db: Database.Database, roundId: string): string[] {
  const rows = db.prepare('SELECT entryId FROM TiebreakCandidate WHERE roundId = ?').all(roundId) as {
    entryId: string;
  }[];
  return rows.map((r) => r.entryId);
}

export function getCurrentOpenRound(
  db: Database.Database
): { round: TiebreakRound; candidates: EntrySummary[] } | null {
  const roundId = getOpenRoundId(db);
  if (!roundId) return null;
  const round = getRoundById(db, roundId)!;
  const candidates = db
    .prepare(
      `SELECT e.id, e.number, e.name, e.imagePath FROM TiebreakCandidate tc
       JOIN Entry e ON e.id = tc.entryId WHERE tc.roundId = ?`
    )
    .all(roundId) as EntrySummary[];
  return { round, candidates };
}

export function castVote(db: Database.Database, roundId: string, userId: string, entryId: string): void {
  const contest = getContest(db);
  if (contest.phase !== 'TIEBREAK') {
    throw new AppError(409, 'NOT_TIEBREAK_PHASE', 'El concurso no está en fase de desempate.');
  }
  const round = getRoundById(db, roundId);
  if (!round || round.status !== 'OPEN') {
    throw new AppError(409, 'ROUND_NOT_OPEN', 'Esta ronda de desempate ya no está abierta.');
  }
  const isCandidate = db
    .prepare('SELECT 1 FROM TiebreakCandidate WHERE roundId = ? AND entryId = ?')
    .get(roundId, entryId);
  if (!isCandidate) {
    throw new AppError(400, 'NOT_A_CANDIDATE', 'Esa tapa no participa en esta ronda de desempate.');
  }
  const tx = db.transaction(() => {
    const already = db.prepare('SELECT 1 FROM TiebreakVote WHERE roundId = ? AND userId = ?').get(roundId, userId);
    if (already) {
      throw new AppError(409, 'ALREADY_VOTED_ROUND', 'Ya has votado en esta ronda de desempate.');
    }
    db.prepare('INSERT INTO TiebreakVote (id, roundId, userId, entryId, createdAt) VALUES (?, ?, ?, ?, ?)').run(
      randomUUID(),
      roundId,
      userId,
      entryId,
      new Date().toISOString()
    );
  });
  tx();
}

export interface CloseRoundResult {
  status: 'RESOLVED' | 'STILL_TIED';
  winnerEntryId?: string;
  tiedEntryIds?: string[];
}

export function closeRound(db: Database.Database, roundId: string): CloseRoundResult {
  const round = getRoundById(db, roundId);
  if (!round || round.status !== 'OPEN') {
    throw new AppError(409, 'ROUND_NOT_OPEN', 'Esta ronda ya está cerrada.');
  }
  const tally = db
    .prepare('SELECT entryId, COUNT(*) as votes FROM TiebreakVote WHERE roundId = ? GROUP BY entryId ORDER BY votes DESC')
    .all(roundId) as { entryId: string; votes: number }[];

  const now = new Date().toISOString();
  db.prepare("UPDATE TiebreakRound SET status = 'CLOSED', closedAt = ? WHERE id = ?").run(now, roundId);

  if (tally.length === 0) {
    const candidates = getCandidateIds(db, roundId);
    openRound(db, round.targetRank, candidates);
    return { status: 'STILL_TIED', tiedEntryIds: candidates };
  }

  const topVotes = tally[0].votes;
  const winners = tally.filter((t) => t.votes === topVotes).map((t) => t.entryId);

  if (winners.length > 1) {
    openRound(db, round.targetRank, winners);
    return { status: 'STILL_TIED', tiedEntryIds: winners };
  }

  return { status: 'RESOLVED', winnerEntryId: winners[0] };
}

function isRankResolved(db: Database.Database, targetRank: number): boolean {
  const lastRound = db
    .prepare('SELECT id, status FROM TiebreakRound WHERE targetRank = ? ORDER BY roundNumber DESC LIMIT 1')
    .get(targetRank) as { id: string; status: string } | undefined;
  if (!lastRound || lastRound.status !== 'CLOSED') return false;
  const tally = db
    .prepare('SELECT entryId, COUNT(*) as votes FROM TiebreakVote WHERE roundId = ? GROUP BY entryId ORDER BY votes DESC')
    .all(lastRound.id) as { entryId: string; votes: number }[];
  if (tally.length === 0) return false;
  const top = tally[0].votes;
  return tally.filter((t) => t.votes === top).length === 1;
}

export interface AdvanceResult {
  phase: 'TIEBREAK' | 'RESULTS';
  openedRound?: TiebreakRound;
}

export function advance(db: Database.Database): AdvanceResult {
  const standings = computeStandings(db);
  const groups = podiumTieGroups(standings);
  for (const group of groups) {
    const rank = group[0].rank;
    if (isRankResolved(db, rank)) continue;
    if (getOpenRoundId(db)) {
      return { phase: 'TIEBREAK' };
    }
    const round = openRound(
      db,
      rank,
      group.map((g) => g.entryId)
    );
    return { phase: 'TIEBREAK', openedRound: round };
  }
  setPhase(db, 'RESULTS');
  return { phase: 'RESULTS' };
}
