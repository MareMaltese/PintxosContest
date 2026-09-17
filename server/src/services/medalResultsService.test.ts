import { describe, it, expect, beforeEach } from 'vitest';
import type Database from 'better-sqlite3';
import { createDb } from '../db/connection';
import { createUser } from './userService';
import { createEntry } from './entryService';
import { startContest } from './contestService';
import { setMedal } from './medalVoteService';
import { advance, castVote, closeRound, getOpenRoundId } from './tiebreakService';
import { addVote } from './voteService';
import { computeMedalPodium } from './medalResultsService';

let db: Database.Database;

function makeEntry(name: string) {
  const owner = createUser(db, `creator-of-${name}`);
  return createEntry(db, { creatorId: owner.id, name, description: null, imagePath: 'a.webp' });
}

beforeEach(() => {
  db = createDb(':memory:');
});

describe('computeMedalPodium', () => {
  it('returns the top 3 by total score, ranked GOLD/SILVER/BRONZE, when there is no tie', () => {
    const a = makeEntry('A');
    const b = makeEntry('B');
    const c = makeEntry('C');
    makeEntry('D');
    startContest(db);
    const v1 = createUser(db, 'v1');
    setMedal(db, v1.id, a.id, 'GOLD');
    setMedal(db, v1.id, b.id, 'SILVER');
    setMedal(db, v1.id, c.id, 'BRONZE');

    const podium = computeMedalPodium(db);
    expect(podium).toHaveLength(3);
    expect(podium[0]).toMatchObject({ rank: 1, entryId: a.id, medal: 'GOLD', total: 5 });
    expect(podium[1]).toMatchObject({ rank: 2, entryId: b.id, medal: 'SILVER', total: 3 });
    expect(podium[2]).toMatchObject({ rank: 3, entryId: c.id, medal: 'BRONZE', total: 1 });
    expect(podium[0].creatorName).toBe('creator-of-A');
  });

  it('places the resolved tiebreak winner ahead of the entry that lost that round', () => {
    const a = makeEntry('A');
    const b = makeEntry('B');
    startContest(db);
    const mainVoter = createUser(db, 'main-voter');
    addVote(db, mainVoter.id, a.id); // keeps the MAIN podium unambiguous so advance() reaches the MEDAL tie
    const [v1, v2, v3] = [createUser(db, 'v1'), createUser(db, 'v2'), createUser(db, 'v3')];
    setMedal(db, v1.id, a.id, 'GOLD');
    setMedal(db, v2.id, b.id, 'GOLD'); // tied at rank 1 on the medal podium

    advance(db);
    const roundId = getOpenRoundId(db)!;
    castVote(db, roundId, v1.id, a.id);
    castVote(db, roundId, v2.id, a.id);
    castVote(db, roundId, v3.id, b.id);
    closeRound(db, roundId);

    const podium = computeMedalPodium(db);
    expect(podium[0].entryId).toBe(a.id);
    expect(podium[0].medal).toBe('GOLD');
    expect(podium[1].entryId).toBe(b.id);
    expect(podium[1].medal).toBe('SILVER');
  });

  it('shows a still-unresolved tie in its original order without crashing', () => {
    const a = makeEntry('A');
    const b = makeEntry('B');
    startContest(db);
    const [v1, v2] = [createUser(db, 'v1'), createUser(db, 'v2')];
    setMedal(db, v1.id, a.id, 'GOLD');
    setMedal(db, v2.id, b.id, 'GOLD');

    const podium = computeMedalPodium(db);
    expect(podium.map((p) => p.entryId).sort()).toEqual([a.id, b.id].sort());
  });
});
