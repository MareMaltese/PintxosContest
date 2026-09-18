import type { Db } from '../db/connection';
import { computeMedalStandings, topPodiumRanks, type MedalStanding } from './rankingService';
import { getResolvedWinner } from './tiebreakService';

export interface MedalPodiumEntry {
  rank: number;
  entryId: string;
  number: number;
  entryName: string | null;
  creatorName: string;
  imagePath: string;
  medal: 'GOLD' | 'SILVER' | 'BRONZE';
  total: number;
}

const RANK_MEDAL: Record<number, 'GOLD' | 'SILVER' | 'BRONZE'> = { 1: 'GOLD', 2: 'SILVER', 3: 'BRONZE' };

export async function computeMedalPodium(db: Db): Promise<MedalPodiumEntry[]> {
  const standings = await computeMedalStandings(db);
  const topRanks = topPodiumRanks(standings);
  const top = standings.filter((s) => topRanks.has(s.rank));

  const byRank = new Map<number, MedalStanding[]>();
  for (const s of top) {
    if (!byRank.has(s.rank)) byRank.set(s.rank, []);
    byRank.get(s.rank)!.push(s);
  }

  const ordered: MedalStanding[] = [];
  for (const rank of [...byRank.keys()].sort((a, b) => a - b)) {
    const group = byRank.get(rank)!;
    if (group.length === 1) {
      ordered.push(group[0]);
      continue;
    }
    const winnerId = await getResolvedWinner(db, 'MEDAL', rank);
    const winner = winnerId ? group.find((g) => g.entryId === winnerId) : undefined;
    if (winner) {
      ordered.push(winner, ...group.filter((g) => g.entryId !== winnerId));
    } else {
      ordered.push(...group);
    }
  }

  return ordered.slice(0, 3).map((s, i) => ({
    rank: i + 1,
    entryId: s.entryId,
    number: s.number,
    entryName: s.name,
    creatorName: s.creatorName,
    imagePath: s.imagePath,
    medal: RANK_MEDAL[i + 1],
    total: s.total,
  }));
}
