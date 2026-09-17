import { randomUUID } from 'node:crypto';
import type Database from 'better-sqlite3';
import { AppError } from '../middleware/errors';
import { getContest, setPhase } from './contestService';
import { computeStandings, podiumTieGroups, computeMedalStandings } from './rankingService';

export type TiebreakKind = 'MAIN' | 'MEDAL';

export interface TiebreakRound {
  id: string;
  roundNumber: number;
  targetRank: number;
  kind: TiebreakKind;
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

export function openRound(
  db: Database.Database,
  targetRank: number,
  candidateEntryIds: string[],
  kind: TiebreakKind = 'MAIN'
): TiebreakRound {
  const now = new Date().toISOString();
  const prevMax = db.prepare('SELECT MAX(roundNumber) as m FROM TiebreakRound').get() as { m: number | null };
  const roundNumber = (prevMax.m ?? 0) + 1;
  const id = randomUUID();
  const tx = db.transaction(() => {
    db.prepare(
      `INSERT INTO TiebreakRound (id, roundNumber, targetRank, kind, status, createdAt, closedAt)
       VALUES (?, ?, ?, ?, 'OPEN', ?, NULL)`
    ).run(id, roundNumber, targetRank, kind, now);
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

function tallyRound(db: Database.Database, roundId: string): { entryId: string; votes: number }[] {
  return db
    .prepare(
      'SELECT entryId, COUNT(*) as votes FROM TiebreakVote WHERE roundId = ? GROUP BY entryId ORDER BY votes DESC'
    )
    .all(roundId) as { entryId: string; votes: number }[];
}

export function closeRound(db: Database.Database, roundId: string): CloseRoundResult {
  const round = getRoundById(db, roundId);
  if (!round || round.status !== 'OPEN') {
    throw new AppError(409, 'ROUND_NOT_OPEN', 'Esta ronda ya está cerrada.');
  }
  const tally = tallyRound(db, roundId);

  const now = new Date().toISOString();
  db.prepare("UPDATE TiebreakRound SET status = 'CLOSED', closedAt = ? WHERE id = ?").run(now, roundId);

  if (tally.length === 0) {
    const candidates = getCandidateIds(db, roundId);
    openRound(db, round.targetRank, candidates, round.kind);
    return { status: 'STILL_TIED', tiedEntryIds: candidates };
  }

  const topVotes = tally[0].votes;
  const winners = tally.filter((t) => t.votes === topVotes).map((t) => t.entryId);

  if (winners.length > 1) {
    openRound(db, round.targetRank, winners, round.kind);
    return { status: 'STILL_TIED', tiedEntryIds: winners };
  }

  return { status: 'RESOLVED', winnerEntryId: winners[0] };
}

function isRankResolved(db: Database.Database, kind: TiebreakKind, targetRank: number): boolean {
  const lastRound = db
    .prepare('SELECT id, status FROM TiebreakRound WHERE targetRank = ? AND kind = ? ORDER BY roundNumber DESC LIMIT 1')
    .get(targetRank, kind) as { id: string; status: string } | undefined;
  if (!lastRound || lastRound.status !== 'CLOSED') return false;
  const tally = tallyRound(db, lastRound.id);
  if (tally.length === 0) return false;
  const top = tally[0].votes;
  return tally.filter((t) => t.votes === top).length === 1;
}

export function getResolvedWinner(db: Database.Database, kind: TiebreakKind, targetRank: number): string | null {
  const lastRound = db
    .prepare(
      "SELECT id FROM TiebreakRound WHERE targetRank = ? AND kind = ? AND status = 'CLOSED' ORDER BY roundNumber DESC LIMIT 1"
    )
    .get(targetRank, kind) as { id: string } | undefined;
  if (!lastRound) return null;
  const tally = tallyRound(db, lastRound.id);
  if (tally.length === 0) return null;
  const top = tally[0].votes;
  const winners = tally.filter((t) => t.votes === top);
  return winners.length === 1 ? winners[0].entryId : null;
}

export interface AdvanceResult {
  phase: 'TIEBREAK' | 'RESULTS';
  openedRound?: TiebreakRound;
}

function resolveGroups(
  db: Database.Database,
  kind: TiebreakKind,
  groups: { entryId: string; rank: number }[][]
): AdvanceResult | null {
  for (const group of groups) {
    const rank = group[0].rank;
    if (isRankResolved(db, kind, rank)) continue;
    if (getOpenRoundId(db)) {
      return { phase: 'TIEBREAK' };
    }
    const round = openRound(
      db,
      rank,
      group.map((g) => g.entryId),
      kind
    );
    return { phase: 'TIEBREAK', openedRound: round };
  }
  return null;
}

export function advance(db: Database.Database): AdvanceResult {
  // A group tied at 0 total means nobody voted with that system at all -- there
  // is no real podium dispute to resolve, so it must not trigger a tiebreak round.
  const mainGroups = podiumTieGroups(computeStandings(db)).filter((group) => group[0].voteCount > 0);
  const mainResult = resolveGroups(db, 'MAIN', mainGroups);
  if (mainResult) return mainResult;

  const medalGroups = podiumTieGroups(computeMedalStandings(db)).filter((group) => group[0].total > 0);
  const medalResult = resolveGroups(db, 'MEDAL', medalGroups);
  if (medalResult) return medalResult;

  setPhase(db, 'RESULTS');
  return { phase: 'RESULTS' };
}
