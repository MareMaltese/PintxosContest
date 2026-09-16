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

  let rank = 0;
  let lastCount = -1;
  let seen = 0;
  const standings: Standing[] = [];
  for (const row of rows) {
    seen += 1;
    if (row.voteCount !== lastCount) {
      rank = seen;
      lastCount = row.voteCount;
    }
    standings.push({ ...row, rank });
  }
  return standings;
}

export function podiumTieGroups(standings: Standing[]): Standing[][] {
  const groups = new Map<number, Standing[]>();
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
