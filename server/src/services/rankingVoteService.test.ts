import { describe, it, expect, beforeEach } from 'vitest';
import type { Db } from '../db/connection';
import { createDb } from '../db/connection';
import { createUser } from './userService';
import { createEntry, type Entry } from './entryService';
import { startContest, setAllowSelfVote, setVotingMode, setWorstPrizeEnabled } from './contestService';
import { getMyRanking, setMyRanking, countMyRanked, getRankingLimit } from './rankingVoteService';
import { computeRankingStandings, computeScoreStandings } from './rankingService';
import { computeMedalPodium, getWorstPrizeWinner } from './medalResultsService';
import { AppError } from '../middleware/errors';

let db: Db;
let entries: Entry[];

async function makeEntry(name: string): Promise<Entry> {
  const creator = await createUser(db, `creator-of-${name}`);
  return createEntry(db, { creatorId: creator.id, name, description: null, imagePath: 'a.webp' });
}

beforeEach(async () => {
  db = await createDb(':memory:');
  entries = [await makeEntry('A'), await makeEntry('B'), await makeEntry('C'), await makeEntry('D')];
  await setVotingMode(db, 'RANKING');
});

describe('rankingVoteService', () => {
  it('stores and returns the full ordering, best first', async () => {
    await startContest(db);
    const voter = await createUser(db, 'Voter');
    const order = [entries[2].id, entries[0].id, entries[3].id, entries[1].id];
    await setMyRanking(db, voter.id, order);
    expect(await getMyRanking(db, voter.id)).toEqual(order);
    expect(await countMyRanked(db, voter.id)).toBe(4);
    expect(await getRankingLimit(db, voter.id)).toBe(4);
  });

  it('replaces a previous ordering', async () => {
    await startContest(db);
    const voter = await createUser(db, 'Voter');
    await setMyRanking(
      db,
      voter.id,
      entries.map((e) => e.id)
    );
    const reversed = entries.map((e) => e.id).reverse();
    await setMyRanking(db, voter.id, reversed);
    expect(await getMyRanking(db, voter.id)).toEqual(reversed);
  });

  it('rejects saving outside the voting phase', async () => {
    const voter = await createUser(db, 'Voter');
    await expect(
      setMyRanking(
        db,
        voter.id,
        entries.map((e) => e.id)
      )
    ).rejects.toMatchObject({ code: 'NOT_VOTING_PHASE' });
  });

  it('rejects an incomplete or duplicated ordering', async () => {
    await startContest(db);
    const voter = await createUser(db, 'Voter');
    await expect(setMyRanking(db, voter.id, [entries[0].id])).rejects.toMatchObject({ code: 'INCOMPLETE_RANKING' });
    await expect(
      setMyRanking(db, voter.id, [entries[0].id, entries[0].id, entries[1].id, entries[2].id])
    ).rejects.toBeInstanceOf(AppError);
  });

  it('excludes the voter own entry unless self-voting is allowed', async () => {
    await startContest(db);
    const author = entries[0].creatorId;
    const others = entries.slice(1).map((e) => e.id);
    expect(await getRankingLimit(db, author)).toBe(3);
    await expect(setMyRanking(db, author, [entries[0].id, ...others])).rejects.toMatchObject({
      code: 'SELF_VOTE_FORBIDDEN',
    });
    await setMyRanking(db, author, others);
    expect(await getMyRanking(db, author)).toEqual(others);

    await setAllowSelfVote(db, true);
    await expect(setMyRanking(db, author, others)).rejects.toMatchObject({ code: 'INCOMPLETE_RANKING' });
  });
});

describe('computeRankingStandings', () => {
  it('awards N - position points per voter and counts 1st/2nd/3rd placements', async () => {
    await startContest(db);
    const [a, b, c, d] = entries.map((e) => e.id);
    const v1 = await createUser(db, 'v1');
    const v2 = await createUser(db, 'v2');
    await setMyRanking(db, v1.id, [a, b, c, d]);
    await setMyRanking(db, v2.id, [b, a, d, c]);

    const standings = await computeRankingStandings(db);
    const byId = Object.fromEntries(standings.map((s) => [s.entryId, s]));
    // a: 3 + 2, b: 2 + 3, c: 1 + 0, d: 0 + 1
    expect(byId[a]).toMatchObject({ total: 5, gold: 1, silver: 1, bronze: 0, rank: 1 });
    expect(byId[b]).toMatchObject({ total: 5, gold: 1, silver: 1, bronze: 0, rank: 1 });
    expect(byId[c]).toMatchObject({ total: 1, bronze: 1, rank: 3 });
    expect(byId[d]).toMatchObject({ total: 1, bronze: 1, rank: 3 });
  });

  it('is what computeScoreStandings uses in RANKING mode, feeding the podium and worst prize', async () => {
    await setWorstPrizeEnabled(db, true);
    await startContest(db);
    const [a, b, c, d] = entries.map((e) => e.id);
    const v1 = await createUser(db, 'v1');
    await setMyRanking(db, v1.id, [c, a, b, d]);

    expect((await computeScoreStandings(db)).map((s) => s.entryId)).toEqual([c, a, b, d]);
    expect((await computeMedalPodium(db)).map((p) => [p.entryId, p.medal])).toEqual([
      [c, 'GOLD'],
      [a, 'SILVER'],
      [b, 'BRONZE'],
    ]);
    expect(await getWorstPrizeWinner(db)).toBe(d);
  });
});
