import type Database from 'better-sqlite3';

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

export function computeStandings(db: Database.Database): Standing[] {
  const rows = db
    .prepare(
      `SELECT e.id as entryId, e.number, e.name, e.creatorId, COUNT(v.id) as voteCount
       FROM Entry e
       LEFT JOIN Vote v ON v.entryId = e.id
       GROUP BY e.id
       ORDER BY voteCount DESC, e.number ASC`
    )
    .all() as StandingEntry[];

  return assignCompetitionRank(rows, (r) => r.voteCount);
}

export function podiumTieGroups<T extends RankedEntry>(standings: T[]): T[][] {
  const groups = new Map<number, T[]>();
  for (const s of standings) {
    if (s.rank > 3) continue;
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
  gold: number;
  silver: number;
  bronze: number;
  total: number;
}

export interface MedalStanding extends MedalStandingEntry {
  rank: number;
}

export function computeMedalStandings(db: Database.Database): MedalStanding[] {
  const rows = db
    .prepare(
      `SELECT e.id as entryId, e.number, e.name, e.creatorId, u.name as creatorName,
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
    .all() as MedalStandingEntry[];

  return assignCompetitionRank(rows, (r) => r.total);
}
