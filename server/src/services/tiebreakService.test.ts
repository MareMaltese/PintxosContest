import { describe, it, expect, beforeEach } from 'vitest';
import type Database from 'better-sqlite3';
import { createDb } from '../db/connection';
import { createUser } from './userService';
import { createEntry } from './entryService';
import { startContest, setAllowSelfVote, getContest } from './contestService';
import { addVote } from './voteService';
import { advance, castVote, closeRound, getCurrentOpenRound, getOpenRoundId, getResolvedWinner } from './tiebreakService';
import { setMedal } from './medalVoteService';
import { AppError } from '../middleware/errors';

let db: Database.Database;

function makeEntry(name: string) {
  const owner = createUser(db, `owner-${name}`);
  return createEntry(db, { creatorId: owner.id, name, description: null, imagePath: 'a.webp' });
}

beforeEach(() => {
  db = createDb(':memory:');
  setAllowSelfVote(db, true);
});

describe('tiebreakService', () => {
  it('advance() moves straight to RESULTS when the podium has no ties', () => {
    const a = makeEntry('A');
    makeEntry('B');
    startContest(db);
    const voter = createUser(db, 'voter');
    addVote(db, voter.id, a.id);
    const result = advance(db);
    expect(result.phase).toBe('RESULTS');
    expect(getContest(db).phase).toBe('RESULTS');
  });

  it('advance() opens a TIEBREAK round when rank 1 is tied', () => {
    const a = makeEntry('A');
    const b = makeEntry('B');
    startContest(db);
    const [v1, v2] = [createUser(db, 'v1'), createUser(db, 'v2')];
    addVote(db, v1.id, a.id);
    addVote(db, v2.id, b.id);

    const result = advance(db);
    expect(result.phase).toBe('TIEBREAK');
    expect(result.openedRound?.targetRank).toBe(1);
    const current = getCurrentOpenRound(db)!;
    expect(current.candidates.map((c) => c.id).sort()).toEqual([a.id, b.id].sort());
  });

  it('a tiebreak round resolves once a unique winner emerges', () => {
    const a = makeEntry('A');
    const b = makeEntry('B');
    startContest(db);
    const [v1, v2, v3] = [createUser(db, 'v1'), createUser(db, 'v2'), createUser(db, 'v3')];
    addVote(db, v1.id, a.id);
    addVote(db, v2.id, b.id);
    advance(db);

    const roundId = getOpenRoundId(db)!;
    castVote(db, roundId, v1.id, a.id);
    castVote(db, roundId, v2.id, a.id);
    castVote(db, roundId, v3.id, b.id);

    const closeResult = closeRound(db, roundId);
    expect(closeResult.status).toBe('RESOLVED');
    expect(closeResult.winnerEntryId).toBe(a.id);
  });

  it('a still-tied round automatically reopens with the same target rank', () => {
    const a = makeEntry('A');
    const b = makeEntry('B');
    startContest(db);
    const [v1, v2] = [createUser(db, 'v1'), createUser(db, 'v2')];
    addVote(db, v1.id, a.id);
    addVote(db, v2.id, b.id);
    advance(db);

    const roundId = getOpenRoundId(db)!;
    castVote(db, roundId, v1.id, a.id);
    castVote(db, roundId, v2.id, b.id);

    const closeResult = closeRound(db, roundId);
    expect(closeResult.status).toBe('STILL_TIED');
    const newOpenId = getOpenRoundId(db);
    expect(newOpenId).not.toBeNull();
    expect(newOpenId).not.toBe(roundId);
  });

  it('rejects a vote for an entry that is not a candidate in the round', () => {
    const a = makeEntry('A');
    const b = makeEntry('B');
    const c = makeEntry('C');
    startContest(db);
    const [v1, v2] = [createUser(db, 'v1'), createUser(db, 'v2')];
    addVote(db, v1.id, a.id);
    addVote(db, v2.id, b.id);
    advance(db);
    const roundId = getOpenRoundId(db)!;
    expect(() => castVote(db, roundId, v1.id, c.id)).toThrow(AppError);
  });

  it('rejects a second vote from the same user in the same round', () => {
    const a = makeEntry('A');
    const b = makeEntry('B');
    startContest(db);
    const [v1, v2] = [createUser(db, 'v1'), createUser(db, 'v2')];
    addVote(db, v1.id, a.id);
    addVote(db, v2.id, b.id);
    advance(db);
    const roundId = getOpenRoundId(db)!;
    castVote(db, roundId, v1.id, a.id);
    expect(() => castVote(db, roundId, v1.id, b.id)).toThrow(AppError);
  });

  it('rejects voting when there is no open round', () => {
    const a = makeEntry('A');
    startContest(db);
    const voter = createUser(db, 'voter');
    expect(() => castVote(db, 'nonexistent-round', voter.id, a.id)).toThrow(AppError);
  });

  it('does not open a tiebreak round for ties below the podium', () => {
    const a = makeEntry('A');
    const b = makeEntry('B');
    const c = makeEntry('C');
    makeEntry('D');
    makeEntry('E');
    startContest(db);
    const [v1, v2, v3] = [createUser(db, 'v1'), createUser(db, 'v2'), createUser(db, 'v3')];
    addVote(db, v1.id, a.id);
    addVote(db, v2.id, a.id);
    addVote(db, v3.id, a.id); // a: 3 votes -> rank 1, unambiguous
    addVote(db, v1.id, b.id);
    addVote(db, v2.id, b.id); // b: 2 votes -> rank 2, unambiguous
    addVote(db, v1.id, c.id); // c: 1 vote -> rank 3, unambiguous
    // d and e: 0 votes each, tied for rank 4 -- below the podium cutoff, must be ignored

    const result = advance(db);
    expect(result.phase).toBe('RESULTS');
  });
});

describe('tiebreakService — medal podium (kind = MEDAL)', () => {
  it('advance() opens a MEDAL round when the medal podium is tied, after the main podium is clear', () => {
    const a = makeEntry('A');
    const b = makeEntry('B');
    startContest(db);
    const mainVoter = createUser(db, 'main-voter');
    addVote(db, mainVoter.id, a.id); // main podium: a=1 vote, unambiguous rank 1; b=0 -> rank 2, unambiguous
    const [v1, v2] = [createUser(db, 'v1'), createUser(db, 'v2')];
    setMedal(db, v1.id, a.id, 'GOLD');
    setMedal(db, v2.id, b.id, 'GOLD'); // medal podium: a and b tied at rank 1 (5 points each)

    const result = advance(db);
    expect(result.phase).toBe('TIEBREAK');
    expect(result.openedRound?.kind).toBe('MEDAL');
    expect(result.openedRound?.targetRank).toBe(1);
  });

  it('does not touch the medal podium while a MAIN tie is still open', () => {
    const a = makeEntry('A');
    const b = makeEntry('B');
    startContest(db);
    const [v1, v2] = [createUser(db, 'v1'), createUser(db, 'v2')];
    addVote(db, v1.id, a.id);
    addVote(db, v2.id, b.id); // main podium tied at rank 1
    setMedal(db, v1.id, a.id, 'GOLD');
    setMedal(db, v2.id, b.id, 'GOLD'); // medal podium also tied at rank 1

    const result = advance(db);
    expect(result.openedRound?.kind).toBe('MAIN');
  });

  it('a resolved MEDAL round lets advance() reach RESULTS once nothing else is tied', () => {
    const a = makeEntry('A');
    const b = makeEntry('B');
    startContest(db);
    const mainVoter = createUser(db, 'main-voter');
    addVote(db, mainVoter.id, a.id);
    const [v1, v2, v3] = [createUser(db, 'v1'), createUser(db, 'v2'), createUser(db, 'v3')];
    setMedal(db, v1.id, a.id, 'GOLD');
    setMedal(db, v2.id, b.id, 'GOLD');
    advance(db); // opens the MEDAL round for rank 1

    const roundId = getOpenRoundId(db)!;
    castVote(db, roundId, v1.id, a.id);
    castVote(db, roundId, v2.id, a.id);
    castVote(db, roundId, v3.id, b.id);
    const closeResult = closeRound(db, roundId);
    expect(closeResult.status).toBe('RESOLVED');

    const finalResult = advance(db);
    expect(finalResult.phase).toBe('RESULTS');
  });

  it('getResolvedWinner returns the winner of a closed round, or null if unresolved/absent', () => {
    const a = makeEntry('A');
    const b = makeEntry('B');
    startContest(db);
    const mainVoter = createUser(db, 'main-voter');
    addVote(db, mainVoter.id, a.id);
    const [v1, v2, v3] = [createUser(db, 'v1'), createUser(db, 'v2'), createUser(db, 'v3')];
    setMedal(db, v1.id, a.id, 'GOLD');
    setMedal(db, v2.id, b.id, 'GOLD');
    advance(db);
    expect(getResolvedWinner(db, 'MEDAL', 1)).toBeNull();

    const roundId = getOpenRoundId(db)!;
    castVote(db, roundId, v1.id, a.id);
    castVote(db, roundId, v2.id, a.id);
    castVote(db, roundId, v3.id, b.id);
    closeRound(db, roundId);
    expect(getResolvedWinner(db, 'MEDAL', 1)).toBe(a.id);
    expect(getResolvedWinner(db, 'MAIN', 1)).toBeNull();
  });
});
