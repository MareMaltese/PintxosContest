import type { Db } from '../db/connection';

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
