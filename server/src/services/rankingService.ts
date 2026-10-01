import type { Db } from '../db/connection';
import { getContest } from './contestService';

export interface StandingEntry {
  entryId: string;
  number: number;
  name: string | null;
  creatorId: string;
  voteCount: number;
}

export interface Standing extends StandingEntry {
  rank: number;
}

interface RankedEntry {
  entryId: string;
  rank: number;
}

function assignCompetitionRank<T>(rows: T[], scoreOf: (row: T) => number): (T & { rank: number })[] {
  let rank = 0;
  let lastScore = -1;
  let seen = 0;
  const result: (T & { rank: number })[] = [];
  for (const row of rows) {
    seen += 1;
    const score = scoreOf(row);
    if (score !== lastScore) {
      rank = seen;
      lastScore = score;
    }
    result.push({ ...row, rank });
  }
  return result;
}

export async function computeStandings(db: Db): Promise<Standing[]> {
  const rows = (await db
    .prepare(
      `SELECT e.id as entryId, e.number, e.name, e.creatorId, COUNT(v.id) as voteCount
       FROM Entry e
       LEFT JOIN Vote v ON v.entryId = e.id
       GROUP BY e.id
       ORDER BY voteCount DESC, e.number ASC`
    )
    .all()) as unknown as StandingEntry[];

  return assignCompetitionRank(rows, (r) => r.voteCount);
}

// The top 3 *podium slots* are the first 3 distinct rank tiers, not "rank <= 3":
// competition ranking leaves gaps after a tie (e.g. two entries tied at rank 1 push
// the next tier to rank 3, and a further tie there pushes the next one to rank 5), so
// checking the raw rank number against 3 would silently miss -- and never tiebreak,
// or wrongly drop from the final podium -- a genuine dispute sitting at rank 5
// whenever an earlier tier is also tied.
export function topPodiumRanks<T extends RankedEntry>(standings: T[]): Set<number> {
  return new Set([...new Set(standings.map((s) => s.rank))].sort((a, b) => a - b).slice(0, 3));
}

export function podiumTieGroups<T extends RankedEntry>(standings: T[]): T[][] {
  const topRanks = topPodiumRanks(standings);
  const groups = new Map<number, T[]>();
  for (const s of standings) {
    if (!topRanks.has(s.rank)) continue;
    if (!groups.has(s.rank)) groups.set(s.rank, []);
    groups.get(s.rank)!.push(s);
  }
  return [...groups.entries()]
    .filter(([, members]) => members.length > 1)
    .sort(([rankA], [rankB]) => rankA - rankB)
    .map(([, members]) => members);
}

export interface MedalStandingEntry {
  entryId: string;
  number: number;
  name: string | null;
  creatorId: string;
  creatorName: string;
  imagePath: string;
  gold: number;
  silver: number;
  bronze: number;
  total: number;
}

export interface MedalStanding extends MedalStandingEntry {
  rank: number;
}

export async function computeMedalStandings(db: Db): Promise<MedalStanding[]> {
  const rows = (await db
    .prepare(
      `SELECT e.id as entryId, e.number, e.name, e.creatorId, e.imagePath, u.name as creatorName,
         COALESCE(SUM(CASE WHEN mv.medal = 'GOLD' THEN 1 ELSE 0 END), 0) as gold,
         COALESCE(SUM(CASE WHEN mv.medal = 'SILVER' THEN 1 ELSE 0 END), 0) as silver,
         COALESCE(SUM(CASE WHEN mv.medal = 'BRONZE' THEN 1 ELSE 0 END), 0) as bronze,
         COALESCE(SUM(CASE mv.medal WHEN 'GOLD' THEN 5 WHEN 'SILVER' THEN 3 WHEN 'BRONZE' THEN 1 ELSE 0 END), 0) as total
       FROM Entry e
       JOIN User u ON u.id = e.creatorId
       LEFT JOIN MedalVote mv ON mv.entryId = e.id
       GROUP BY e.id
       ORDER BY total DESC, e.number ASC`
    )
    .all()) as unknown as MedalStandingEntry[];

  return assignCompetitionRank(rows, (r) => r.total);
}

// Ranking mode scores each voter's ordering Borda-style: with N entries in the contest,
// the entry a voter puts in position p (1 = best) earns N - p points, so everyone's
// favourite is worth the same and an entry they didn't rank (their own, when self-voting
// is off) earns 0, like their last place would. gold/silver/bronze count how many voters
// put the entry 1st/2nd/3rd, so the shape matches medal standings and the podium,
// tiebreak and worst-prize logic work unchanged on top of it.
export async function computeRankingStandings(db: Db): Promise<MedalStanding[]> {
  const entries = (await db
    .prepare(
      `SELECT e.id as entryId, e.number, e.name, e.creatorId, e.imagePath, u.name as creatorName
       FROM Entry e
       JOIN User u ON u.id = e.creatorId`
    )
    .all()) as unknown as Omit<MedalStandingEntry, 'gold' | 'silver' | 'bronze' | 'total'>[];
  const votes = (await db
    .prepare('SELECT userId, entryId FROM RankingVote ORDER BY userId ASC, position ASC')
    .all()) as unknown as { userId: string; entryId: string }[];

  const byId = new Map<string, MedalStandingEntry>(
    entries.map((e) => [e.entryId, { ...e, gold: 0, silver: 0, bronze: 0, total: 0 }])
  );
  let currentUser: string | null = null;
  let position = 0;
  for (const vote of votes) {
    if (vote.userId !== currentUser) {
      currentUser = vote.userId;
      position = 0;
    }
    const standing = byId.get(vote.entryId);
    if (!standing) continue;
    position += 1;
    standing.total += entries.length - position;
    if (position === 1) standing.gold += 1;
    if (position === 2) standing.silver += 1;
    if (position === 3) standing.bronze += 1;
  }

  const rows = [...byId.values()].sort((a, b) => b.total - a.total || a.number - b.number);
  return assignCompetitionRank(rows, (r) => r.total);
}

// The points-based standings for whichever points system is active: per-voter
// orderings in RANKING mode, medals otherwise.
export async function computeScoreStandings(db: Db): Promise<MedalStanding[]> {
  const contest = await getContest(db);
  return contest.votingMode === 'RANKING' ? computeRankingStandings(db) : computeMedalStandings(db);
}
