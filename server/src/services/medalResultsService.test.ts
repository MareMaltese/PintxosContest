import { describe, it, expect, beforeEach } from 'vitest';
import type { Db } from '../db/connection';
import { createDb } from '../db/connection';
import { createUser } from './userService';
import { createEntry } from './entryService';
import { startContest } from './contestService';
import { setMedal } from './medalVoteService';
import { advance, castVote, closeRound, getOpenRoundId } from './tiebreakService';
import { addVote } from './voteService';
import { computeMedalPodium } from './medalResultsService';

let db: Db;

async function makeEntry(name: string) {
  const owner = await createUser(db, `creator-of-${name}`);
  return createEntry(db, { creatorId: owner.id, name, description: null, imagePath: 'a.webp' });
}

beforeEach(async () => {
  db = await createDb(':memory:');
});

describe('computeMedalPodium', () => {
  it('returns the top 3 by total score, ranked GOLD/SILVER/BRONZE, when there is no tie', async () => {
    const a = await makeEntry('A');
    const b = await makeEntry('B');
    const c = await makeEntry('C');
    await makeEntry('D');
    await startContest(db);
    const v1 = await createUser(db, 'v1');
    await setMedal(db, v1.id, a.id, 'GOLD');
    await setMedal(db, v1.id, b.id, 'SILVER');
    await setMedal(db, v1.id, c.id, 'BRONZE');

    const podium = await computeMedalPodium(db);
    expect(podium).toHaveLength(3);
    expect(podium[0]).toMatchObject({ rank: 1, entryId: a.id, medal: 'GOLD', total: 5 });
    expect(podium[1]).toMatchObject({ rank: 2, entryId: b.id, medal: 'SILVER', total: 3 });
    expect(podium[2]).toMatchObject({ rank: 3, entryId: c.id, medal: 'BRONZE', total: 1 });
    expect(podium[0].creatorName).toBe('creator-of-A');
    expect(podium[0].imagePath).toBe('a.webp');
  });

  it('places the resolved tiebreak winner ahead of the entry that lost that round', async () => {
    const a = await makeEntry('A');
    const b = await makeEntry('B');
    await startContest(db);
    const mainVoter = await createUser(db, 'main-voter');
    await addVote(db, mainVoter.id, a.id); // keeps the MAIN podium unambiguous so advance() reaches the MEDAL tie
    const [v1, v2, v3] = [await createUser(db, 'v1'), await createUser(db, 'v2'), await createUser(db, 'v3')];
    await setMedal(db, v1.id, a.id, 'GOLD');
    await setMedal(db, v2.id, b.id, 'GOLD'); // tied at rank 1 on the medal podium

    await advance(db);
    const roundId = (await getOpenRoundId(db))!;
    await castVote(db, roundId, v1.id, a.id);
    await castVote(db, roundId, v2.id, a.id);
    await castVote(db, roundId, v3.id, b.id);
    await closeRound(db, roundId);

    const podium = await computeMedalPodium(db);
    expect(podium[0].entryId).toBe(a.id);
    expect(podium[0].medal).toBe('GOLD');
    expect(podium[1].entryId).toBe(b.id);
    expect(podium[1].medal).toBe('SILVER');
  });

  it('resolves a 3rd-tier tie for bronze even when gold is also tied (regression)', async () => {
    // Same scenario that broke in production: gold tied pushes the bronze tier to
    // rank 5 under competition ranking; the podium must still surface and resolve it,
    // not silently drop it from the top 3.
    const a = await makeEntry('A');
    const b = await makeEntry('B');
    const c = await makeEntry('C');
    const d = await makeEntry('D');
    await startContest(db);
    const [v1, v2, v3, v4] = [
      await createUser(db, 'v1'),
      await createUser(db, 'v2'),
      await createUser(db, 'v3'),
      await createUser(db, 'v4'),
    ];
    await setMedal(db, v1.id, a.id, 'GOLD');
    await setMedal(db, v2.id, b.id, 'GOLD'); // a, b tied at rank 1
    await setMedal(db, v3.id, c.id, 'BRONZE');
    await setMedal(db, v4.id, d.id, 'BRONZE'); // c, d tied at rank 3 (the true 3rd tier)

    const goldResult = await advance(db);
    expect(goldResult.openedRound?.targetRank).toBe(1);
    const goldRoundId = (await getOpenRoundId(db))!;
    await castVote(db, goldRoundId, v3.id, a.id);
    await castVote(db, goldRoundId, v4.id, a.id);
    await closeRound(db, goldRoundId);

    const bronzeResult = await advance(db);
    expect(bronzeResult.openedRound?.targetRank).toBe(3);
    const bronzeRoundId = (await getOpenRoundId(db))!;
    await castVote(db, bronzeRoundId, v1.id, c.id);
    await castVote(db, bronzeRoundId, v2.id, c.id);
    await closeRound(db, bronzeRoundId);

    await advance(db);
    const podium = await computeMedalPodium(db);
    expect(podium).toHaveLength(3);
    expect(podium[0]).toMatchObject({ entryId: a.id, medal: 'GOLD' });
    expect(podium[1]).toMatchObject({ entryId: b.id, medal: 'SILVER' });
    expect(podium[2]).toMatchObject({ entryId: c.id, medal: 'BRONZE' });
  });

  it('shows a still-unresolved tie in its original order without crashing', async () => {
    const a = await makeEntry('A');
    const b = await makeEntry('B');
    await startContest(db);
    const [v1, v2] = [await createUser(db, 'v1'), await createUser(db, 'v2')];
    await setMedal(db, v1.id, a.id, 'GOLD');
    await setMedal(db, v2.id, b.id, 'GOLD');

    const podium = await computeMedalPodium(db);
    expect(podium.map((p) => p.entryId).sort()).toEqual([a.id, b.id].sort());
  });
});
