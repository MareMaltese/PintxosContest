import { randomUUID } from 'node:crypto';
import type { Db } from '../db/connection';
import { AppError } from '../middleware/errors';
import { getContest, setPhase } from './contestService';
import { computeStandings, podiumTieGroups, computeMedalStandings, type MedalStanding } from './rankingService';

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

export async function openRound(
  db: Db,
  targetRank: number,
  candidateEntryIds: string[],
  kind: TiebreakKind = 'MAIN'
): Promise<TiebreakRound> {
  const now = new Date().toISOString();
  const prevMax = (await db.prepare('SELECT MAX(roundNumber) as m FROM TiebreakRound').get()) as unknown as {
    m: number | null;
  };
  const roundNumber = (prevMax.m ?? 0) + 1;
  const id = randomUUID();
  const tx = db.transaction(async () => {
    await db
      .prepare(
        `INSERT INTO TiebreakRound (id, roundNumber, targetRank, kind, status, createdAt, closedAt)
         VALUES (?, ?, ?, ?, 'OPEN', ?, NULL)`
      )
      .run(id, roundNumber, targetRank, kind, now);
    const insertCandidate = db.prepare('INSERT INTO TiebreakCandidate (roundId, entryId) VALUES (?, ?)');
    for (const entryId of candidateEntryIds) {
      await insertCandidate.run(id, entryId);
    }
    await setPhase(db, 'TIEBREAK');
  });
  await tx();
  return (await getRoundById(db, id))!;
}

export async function getRoundById(db: Db, id: string): Promise<TiebreakRound | undefined> {
  return (await db.prepare('SELECT * FROM TiebreakRound WHERE id = ?').get(id)) as unknown as
    | TiebreakRound
    | undefined;
}

export async function getOpenRoundId(db: Db): Promise<string | null> {
  const row = (await db
    .prepare("SELECT id FROM TiebreakRound WHERE status = 'OPEN' ORDER BY roundNumber DESC LIMIT 1")
    .get()) as unknown as { id: string } | undefined;
  return row?.id ?? null;
}

export async function getCandidateIds(db: Db, roundId: string): Promise<string[]> {
  const rows = (await db
    .prepare('SELECT entryId FROM TiebreakCandidate WHERE roundId = ?')
    .all(roundId)) as unknown as { entryId: string }[];
  return rows.map((r) => r.entryId);
}

export async function getCurrentOpenRound(
  db: Db
): Promise<{ round: TiebreakRound; candidates: EntrySummary[] } | null> {
  const roundId = await getOpenRoundId(db);
  if (!roundId) return null;
  const round = (await getRoundById(db, roundId))!;
  const candidates = (await db
    .prepare(
      `SELECT e.id, e.number, e.name, e.imagePath FROM TiebreakCandidate tc
       JOIN Entry e ON e.id = tc.entryId WHERE tc.roundId = ?`
    )
    .all(roundId)) as unknown as EntrySummary[];
  return { round, candidates };
}

export async function castVote(db: Db, roundId: string, userId: string, entryId: string): Promise<void> {
  const contest = await getContest(db);
  if (contest.phase !== 'TIEBREAK') {
    throw new AppError(409, 'NOT_TIEBREAK_PHASE', 'El concurso no está en fase de desempate.');
  }
  const round = await getRoundById(db, roundId);
  if (!round || round.status !== 'OPEN') {
    throw new AppError(409, 'ROUND_NOT_OPEN', 'Esta ronda de desempate ya no está abierta.');
  }
  const isCandidate = await db
    .prepare('SELECT 1 FROM TiebreakCandidate WHERE roundId = ? AND entryId = ?')
    .get(roundId, entryId);
  if (!isCandidate) {
    throw new AppError(400, 'NOT_A_CANDIDATE', 'Esa tapa no participa en esta ronda de desempate.');
  }
  const tx = db.transaction(async () => {
    const already = await db
      .prepare('SELECT 1 FROM TiebreakVote WHERE roundId = ? AND userId = ?')
      .get(roundId, userId);
    if (already) {
      throw new AppError(409, 'ALREADY_VOTED_ROUND', 'Ya has votado en esta ronda de desempate.');
    }
    await db
      .prepare('INSERT INTO TiebreakVote (id, roundId, userId, entryId, createdAt) VALUES (?, ?, ?, ?, ?)')
      .run(randomUUID(), roundId, userId, entryId, new Date().toISOString());
  });
  await tx();
}

export interface CloseRoundResult {
  status: 'RESOLVED' | 'STILL_TIED';
  winnerEntryId?: string;
  tiedEntryIds?: string[];
}

async function tallyRound(db: Db, roundId: string): Promise<{ entryId: string; votes: number }[]> {
  return (await db
    .prepare(
      'SELECT entryId, COUNT(*) as votes FROM TiebreakVote WHERE roundId = ? GROUP BY entryId ORDER BY votes DESC'
    )
    .all(roundId)) as unknown as { entryId: string; votes: number }[];
}

export async function closeRound(db: Db, roundId: string): Promise<CloseRoundResult> {
  const round = await getRoundById(db, roundId);
  if (!round || round.status !== 'OPEN') {
    throw new AppError(409, 'ROUND_NOT_OPEN', 'Esta ronda ya está cerrada.');
  }
  const tally = await tallyRound(db, roundId);

  const now = new Date().toISOString();
  await db.prepare("UPDATE TiebreakRound SET status = 'CLOSED', closedAt = ? WHERE id = ?").run(now, roundId);

  if (tally.length === 0) {
    const candidates = await getCandidateIds(db, roundId);
    await openRound(db, round.targetRank, candidates, round.kind);
    return { status: 'STILL_TIED', tiedEntryIds: candidates };
  }

  const topVotes = tally[0].votes;
  const winners = tally.filter((t) => t.votes === topVotes).map((t) => t.entryId);

  if (winners.length > 1) {
    await openRound(db, round.targetRank, winners, round.kind);
    return { status: 'STILL_TIED', tiedEntryIds: winners };
  }

  return { status: 'RESOLVED', winnerEntryId: winners[0] };
}

async function isRankResolved(db: Db, kind: TiebreakKind, targetRank: number): Promise<boolean> {
  const lastRound = (await db
    .prepare('SELECT id, status FROM TiebreakRound WHERE targetRank = ? AND kind = ? ORDER BY roundNumber DESC LIMIT 1')
    .get(targetRank, kind)) as unknown as { id: string; status: string } | undefined;
  if (!lastRound || lastRound.status !== 'CLOSED') return false;
  const tally = await tallyRound(db, lastRound.id);
  if (tally.length === 0) return false;
  const top = tally[0].votes;
  return tally.filter((t) => t.votes === top).length === 1;
}

export async function getResolvedWinner(db: Db, kind: TiebreakKind, targetRank: number): Promise<string | null> {
  const lastRound = (await db
    .prepare(
      "SELECT id FROM TiebreakRound WHERE targetRank = ? AND kind = ? AND status = 'CLOSED' ORDER BY roundNumber DESC LIMIT 1"
    )
    .get(targetRank, kind)) as unknown as { id: string } | undefined;
  if (!lastRound) return null;
  const tally = await tallyRound(db, lastRound.id);
  if (tally.length === 0) return null;
  const top = tally[0].votes;
  const winners = tally.filter((t) => t.votes === top);
  return winners.length === 1 ? winners[0].entryId : null;
}

export interface AdvanceResult {
  phase: 'TIEBREAK' | 'RESULTS';
  openedRound?: TiebreakRound;
  pendingWorstTie?: PendingWorstTie;
}

export interface PendingWorstTie {
  targetRank: number;
  candidateEntryIds: string[];
}

// The "worst prize" tiebreak reuses kind 'MEDAL' rather than adding a new kind value,
// which would require an unsafe SQLite CHECK-constraint migration on the already-live
// production TiebreakRound table. It's safely distinguishable from the top-3 podium's
// MEDAL rounds because its targetRank is always the *last* rank (necessarily > 3 for
// any contest with more than 3 entries), never 1/2/3.
function worstTieGroup(standings: MedalStanding[]): MedalStanding[] | null {
  if (standings.length === 0) return null;
  const maxRank = Math.max(...standings.map((s) => s.rank));
  const group = standings.filter((s) => s.rank === maxRank);
  return group.length > 1 ? group : null;
}

async function hasAnyRoundForTarget(db: Db, kind: TiebreakKind, targetRank: number): Promise<boolean> {
  const row = await db.prepare('SELECT 1 FROM TiebreakRound WHERE kind = ? AND targetRank = ? LIMIT 1').get(
    kind,
    targetRank
  );
  return !!row;
}

// Live-computed, not persisted: true whenever there's currently an unresolved tie for
// the worst-prize position that has never had a tiebreak round started for it. Once a
// round has been started (by resolveWorstTie/advance, after the admin's first manual
// approval), this permanently returns null for that target -- reopens after a
// still-tied close happen automatically from then on, no repeated admin approval.
// Used by the admin dashboard to show/hide the "start" button.
export async function getPendingWorstTie(db: Db): Promise<PendingWorstTie | null> {
  const contest = await getContest(db);
  if (!contest.worstPrizeEnabled) return null;
  const standings = await computeMedalStandings(db);
  const group = worstTieGroup(standings);
  if (!group) return null;
  const targetRank = group[0].rank;
  if (await isRankResolved(db, 'MEDAL', targetRank)) return null;
  if (await hasAnyRoundForTarget(db, 'MEDAL', targetRank)) return null;
  return { targetRank, candidateEntryIds: group.map((g) => g.entryId) };
}

async function resolveWorstTie(db: Db): Promise<AdvanceResult | null> {
  const contest = await getContest(db);
  if (!contest.worstPrizeEnabled) return null;
  const standings = await computeMedalStandings(db);
  const group = worstTieGroup(standings);
  if (!group) return null;
  const targetRank = group[0].rank;
  if (await isRankResolved(db, 'MEDAL', targetRank)) return null;
  // Mirrors resolveGroups(): if a round (of any kind) is already open, just wait for
  // it to close -- don't start a second one, and don't fall through to RESULTS. Always
  // re-affirm the phase here too: if a caller only ever reaches this branch (never the
  // fresh-open one below), the phase must still end up persisted as TIEBREAK.
  if (await getOpenRoundId(db)) {
    await setPhase(db, 'TIEBREAK');
    return { phase: 'TIEBREAK' };
  }
  const candidateEntryIds = group.map((g) => g.entryId);
  const alreadyStarted = await hasAnyRoundForTarget(db, 'MEDAL', targetRank);
  if (!alreadyStarted) {
    await setPhase(db, 'TIEBREAK');
    return { phase: 'TIEBREAK', pendingWorstTie: { targetRank, candidateEntryIds } };
  }
  const round = await openRound(db, targetRank, candidateEntryIds, 'MEDAL');
  return { phase: 'TIEBREAK', openedRound: round };
}

async function resolveGroups(
  db: Db,
  kind: TiebreakKind,
  groups: { entryId: string; rank: number }[][]
): Promise<AdvanceResult | null> {
  for (const group of groups) {
    const rank = group[0].rank;
    if (await isRankResolved(db, kind, rank)) continue;
    if (await getOpenRoundId(db)) {
      // Re-affirm the phase rather than assume it's already TIEBREAK: if a prior call's
      // openRound() failed partway through (or its own re-affirmation was skipped by an
      // even earlier bug), this is what actually recovers a stuck phase on the next
      // advance() instead of perpetuating a wrong "VOTING" forever.
      await setPhase(db, 'TIEBREAK');
      return { phase: 'TIEBREAK' };
    }
    const round = await openRound(
      db,
      rank,
      group.map((g) => g.entryId),
      kind
    );
    return { phase: 'TIEBREAK', openedRound: round };
  }
  return null;
}

export async function advance(db: Db): Promise<AdvanceResult> {
  // A group tied at 0 total means nobody voted with that system at all -- there
  // is no real podium dispute to resolve, so it must not trigger a tiebreak round.
  const mainGroups = podiumTieGroups(await computeStandings(db)).filter((group) => group[0].voteCount > 0);
  const mainResult = await resolveGroups(db, 'MAIN', mainGroups);
  if (mainResult) return mainResult;

  const medalGroups = podiumTieGroups(await computeMedalStandings(db)).filter((group) => group[0].total > 0);
  const medalResult = await resolveGroups(db, 'MEDAL', medalGroups);
  if (medalResult) return medalResult;

  const worstResult = await resolveWorstTie(db);
  if (worstResult) return worstResult;

  await setPhase(db, 'RESULTS');
  return { phase: 'RESULTS' };
}
