import { describe, it, expect, beforeEach } from 'vitest';
import type { Db } from '../db/connection';
import { createDb } from '../db/connection';
import { createUser } from './userService';
import { createEntry } from './entryService';
import { startContest, setAllowSelfVote, setWorstPrizeEnabled, getContest } from './contestService';
import { addVote } from './voteService';
import {
  advance,
  castVote,
  closeRound,
  deleteTiebreakHistory,
  getCurrentOpenRound,
  getOpenRoundId,
  getResolvedWinner,
  getPendingWorstTie,
  getTiebreakHistory,
  openRound,
} from './tiebreakService';
import { setMedal } from './medalVoteService';
import { AppError } from '../middleware/errors';

let db: Db;

async function makeEntry(name: string) {
  const owner = await createUser(db, `owner-${name}`);
  return createEntry(db, { creatorId: owner.id, name, description: null, imagePath: 'a.webp' });
}

beforeEach(async () => {
  db = await createDb(':memory:');
  await setAllowSelfVote(db, true);
});

describe('tiebreakService', () => {
  it('advance() moves straight to RESULTS when the podium has no ties', async () => {
    const a = await makeEntry('A');
    await makeEntry('B');
    await startContest(db);
    const voter = await createUser(db, 'voter');
    await addVote(db, voter.id, a.id);
    const result = await advance(db);
    expect(result.phase).toBe('RESULTS');
    expect((await getContest(db)).phase).toBe('RESULTS');
  });

  it('advance() opens a TIEBREAK round when rank 1 is tied', async () => {
    const a = await makeEntry('A');
    const b = await makeEntry('B');
    await startContest(db);
    const [v1, v2] = [await createUser(db, 'v1'), await createUser(db, 'v2')];
    await addVote(db, v1.id, a.id);
    await addVote(db, v2.id, b.id);

    const result = await advance(db);
    expect(result.phase).toBe('TIEBREAK');
    expect(result.openedRound?.targetRank).toBe(1);
    const current = (await getCurrentOpenRound(db))!;
    expect(current.candidates.map((c) => c.id).sort()).toEqual([a.id, b.id].sort());
  });

  it('self-heals the phase back to TIEBREAK if it was left at VOTING while a round is already open', async () => {
    const a = await makeEntry('A');
    const b = await makeEntry('B');
    await startContest(db);
    const [v1, v2] = [await createUser(db, 'v1'), await createUser(db, 'v2')];
    await addVote(db, v1.id, a.id);
    await addVote(db, v2.id, b.id);
    await advance(db);
    expect((await getContest(db)).phase).toBe('TIEBREAK');

    // Simulate the historical bug: a round is open, but the phase never actually
    // persisted as TIEBREAK (e.g. a prior advance() call took the "already open round"
    // shortcut without re-affirming the phase).
    await db.prepare("UPDATE Contest SET phase = 'VOTING' WHERE id = 1").run();
    expect((await getContest(db)).phase).toBe('VOTING');

    const result = await advance(db);
    expect(result.phase).toBe('TIEBREAK');
    expect((await getContest(db)).phase).toBe('TIEBREAK');
  });

  it('a tiebreak round resolves once a unique winner emerges', async () => {
    const a = await makeEntry('A');
    const b = await makeEntry('B');
    await startContest(db);
    const [v1, v2, v3] = [await createUser(db, 'v1'), await createUser(db, 'v2'), await createUser(db, 'v3')];
    await addVote(db, v1.id, a.id);
    await addVote(db, v2.id, b.id);
    await advance(db);

    const roundId = (await getOpenRoundId(db))!;
    await castVote(db, roundId, v1.id, a.id);
    await castVote(db, roundId, v2.id, a.id);
    await castVote(db, roundId, v3.id, b.id);

    const closeResult = await closeRound(db, roundId);
    expect(closeResult.status).toBe('RESOLVED');
    expect(closeResult.winnerEntryId).toBe(a.id);
  });

  it('a still-tied round automatically reopens with the same target rank', async () => {
    const a = await makeEntry('A');
    const b = await makeEntry('B');
    await startContest(db);
    const [v1, v2] = [await createUser(db, 'v1'), await createUser(db, 'v2')];
    await addVote(db, v1.id, a.id);
    await addVote(db, v2.id, b.id);
    await advance(db);

    const roundId = (await getOpenRoundId(db))!;
    await castVote(db, roundId, v1.id, a.id);
    await castVote(db, roundId, v2.id, b.id);

    const closeResult = await closeRound(db, roundId);
    expect(closeResult.status).toBe('STILL_TIED');
    const newOpenId = await getOpenRoundId(db);
    expect(newOpenId).not.toBeNull();
    expect(newOpenId).not.toBe(roundId);
  });

  it('rejects a vote for an entry that is not a candidate in the round', async () => {
    const a = await makeEntry('A');
    const b = await makeEntry('B');
    const c = await makeEntry('C');
    await startContest(db);
    const [v1, v2] = [await createUser(db, 'v1'), await createUser(db, 'v2')];
    await addVote(db, v1.id, a.id);
    await addVote(db, v2.id, b.id);
    await advance(db);
    const roundId = (await getOpenRoundId(db))!;
    await expect(castVote(db, roundId, v1.id, c.id)).rejects.toThrow(AppError);
  });

  it('rejects a second vote from the same user in the same round', async () => {
    const a = await makeEntry('A');
    const b = await makeEntry('B');
    await startContest(db);
    const [v1, v2] = [await createUser(db, 'v1'), await createUser(db, 'v2')];
    await addVote(db, v1.id, a.id);
    await addVote(db, v2.id, b.id);
    await advance(db);
    const roundId = (await getOpenRoundId(db))!;
    await castVote(db, roundId, v1.id, a.id);
    await expect(castVote(db, roundId, v1.id, b.id)).rejects.toThrow(AppError);
  });

  it('rejects voting when there is no open round', async () => {
    const a = await makeEntry('A');
    await startContest(db);
    const voter = await createUser(db, 'voter');
    await expect(castVote(db, 'nonexistent-round', voter.id, a.id)).rejects.toThrow(AppError);
  });

  it('does not open a tiebreak round for ties below the podium', async () => {
    const a = await makeEntry('A');
    const b = await makeEntry('B');
    const c = await makeEntry('C');
    await makeEntry('D');
    await makeEntry('E');
    await startContest(db);
    const [v1, v2, v3] = [await createUser(db, 'v1'), await createUser(db, 'v2'), await createUser(db, 'v3')];
    await addVote(db, v1.id, a.id);
    await addVote(db, v2.id, a.id);
    await addVote(db, v3.id, a.id); // a: 3 votes -> rank 1, unambiguous
    await addVote(db, v1.id, b.id);
    await addVote(db, v2.id, b.id); // b: 2 votes -> rank 2, unambiguous
    await addVote(db, v1.id, c.id); // c: 1 vote -> rank 3, unambiguous
    // d and e: 0 votes each, tied for rank 4 -- below the podium cutoff, must be ignored

    const result = await advance(db);
    expect(result.phase).toBe('RESULTS');
  });

  it('does not open a MAIN tiebreak round when nobody has cast any favorite votes', async () => {
    await makeEntry('A');
    await makeEntry('B');
    await startContest(db);
    // every entry is tied at 0 favorite votes -- this is not a real dispute
    const result = await advance(db);
    expect(result.phase).toBe('RESULTS');
  });
});

describe('tiebreakService — medal podium (kind = MEDAL)', () => {
  it('advance() opens a MEDAL round when the medal podium is tied, after the main podium is clear', async () => {
    const a = await makeEntry('A');
    const b = await makeEntry('B');
    await startContest(db);
    const mainVoter = await createUser(db, 'main-voter');
    await addVote(db, mainVoter.id, a.id); // main podium: a=1 vote, unambiguous rank 1; b=0 -> rank 2, unambiguous
    const [v1, v2] = [await createUser(db, 'v1'), await createUser(db, 'v2')];
    await setMedal(db, v1.id, a.id, 'GOLD');
    await setMedal(db, v2.id, b.id, 'GOLD'); // medal podium: a and b tied at rank 1 (5 points each)

    const result = await advance(db);
    expect(result.phase).toBe('TIEBREAK');
    expect(result.openedRound?.kind).toBe('MEDAL');
    expect(result.openedRound?.targetRank).toBe(1);
  });

  it('still tiebreaks a 3rd-tier medal tie even when the gold tier is also tied (regression)', async () => {
    // Reproduces a live bug: with gold tied AND the next tier also tied, competition
    // ranking pushes the 3rd-place tier to rank 5 -- a naive "rank <= 3" cutoff
    // silently ignored it, so results got revealed with an unresolved bronze tie.
    const a = await makeEntry('A');
    const b = await makeEntry('B');
    const c = await makeEntry('C');
    const d = await makeEntry('D');
    const e = await makeEntry('E');
    const f = await makeEntry('F');
    await startContest(db);
    const [v1, v2, v3, v4, v5, v6] = await Promise.all(
      ['v1', 'v2', 'v3', 'v4', 'v5', 'v6'].map((n) => createUser(db, n))
    );
    await setMedal(db, v1.id, a.id, 'GOLD');
    await setMedal(db, v2.id, b.id, 'GOLD'); // a, b tied at rank 1
    await setMedal(db, v3.id, c.id, 'SILVER');
    await setMedal(db, v4.id, d.id, 'SILVER'); // c, d tied at rank 3
    await setMedal(db, v5.id, e.id, 'BRONZE');
    await setMedal(db, v6.id, f.id, 'BRONZE'); // e, f tied at rank 5, the true 3rd podium tier (total > 0)

    const goldResult = await advance(db);
    expect(goldResult.phase).toBe('TIEBREAK');
    expect(goldResult.openedRound?.targetRank).toBe(1);

    const goldRoundId = (await getOpenRoundId(db))!;
    await castVote(db, goldRoundId, v3.id, a.id);
    await castVote(db, goldRoundId, v4.id, a.id);
    await closeRound(db, goldRoundId);

    const silverResult = await advance(db);
    expect(silverResult.phase).toBe('TIEBREAK');
    expect(silverResult.openedRound?.targetRank).toBe(3);

    const silverRoundId = (await getOpenRoundId(db))!;
    await castVote(db, silverRoundId, v1.id, c.id);
    await castVote(db, silverRoundId, v2.id, c.id);
    await closeRound(db, silverRoundId);

    const bronzeResult = await advance(db);
    expect(bronzeResult.phase).toBe('TIEBREAK');
    expect(bronzeResult.openedRound?.targetRank).toBe(5);
    const current = (await getCurrentOpenRound(db))!;
    expect(current.candidates.map((cand) => cand.id).sort()).toEqual([e.id, f.id].sort());
  });

  it('does not touch the medal podium while a MAIN tie is still open', async () => {
    const a = await makeEntry('A');
    const b = await makeEntry('B');
    await startContest(db);
    const [v1, v2] = [await createUser(db, 'v1'), await createUser(db, 'v2')];
    await addVote(db, v1.id, a.id);
    await addVote(db, v2.id, b.id); // main podium tied at rank 1
    await setMedal(db, v1.id, a.id, 'GOLD');
    await setMedal(db, v2.id, b.id, 'GOLD'); // medal podium also tied at rank 1

    const result = await advance(db);
    expect(result.openedRound?.kind).toBe('MAIN');
  });

  it('a resolved MEDAL round lets advance() reach RESULTS once nothing else is tied', async () => {
    const a = await makeEntry('A');
    const b = await makeEntry('B');
    await startContest(db);
    const mainVoter = await createUser(db, 'main-voter');
    await addVote(db, mainVoter.id, a.id);
    const [v1, v2, v3] = [await createUser(db, 'v1'), await createUser(db, 'v2'), await createUser(db, 'v3')];
    await setMedal(db, v1.id, a.id, 'GOLD');
    await setMedal(db, v2.id, b.id, 'GOLD');
    await advance(db); // opens the MEDAL round for rank 1

    const roundId = (await getOpenRoundId(db))!;
    await castVote(db, roundId, v1.id, a.id);
    await castVote(db, roundId, v2.id, a.id);
    await castVote(db, roundId, v3.id, b.id);
    const closeResult = await closeRound(db, roundId);
    expect(closeResult.status).toBe('RESOLVED');

    const finalResult = await advance(db);
    expect(finalResult.phase).toBe('RESULTS');
  });

  it('getResolvedWinner returns the winner of a closed round, or null if unresolved/absent', async () => {
    const a = await makeEntry('A');
    const b = await makeEntry('B');
    await startContest(db);
    const mainVoter = await createUser(db, 'main-voter');
    await addVote(db, mainVoter.id, a.id);
    const [v1, v2, v3] = [await createUser(db, 'v1'), await createUser(db, 'v2'), await createUser(db, 'v3')];
    await setMedal(db, v1.id, a.id, 'GOLD');
    await setMedal(db, v2.id, b.id, 'GOLD');
    await advance(db);
    expect(await getResolvedWinner(db, 'MEDAL', 1)).toBeNull();

    const roundId = (await getOpenRoundId(db))!;
    await castVote(db, roundId, v1.id, a.id);
    await castVote(db, roundId, v2.id, a.id);
    await castVote(db, roundId, v3.id, b.id);
    await closeRound(db, roundId);
    expect(await getResolvedWinner(db, 'MEDAL', 1)).toBe(a.id);
    expect(await getResolvedWinner(db, 'MAIN', 1)).toBeNull();
  });
});

describe('tiebreakService — premio al último (worst prize)', () => {
  it('does nothing when worstPrizeEnabled is false, even with a tie for last place', async () => {
    const a = await makeEntry('A');
    const b = await makeEntry('B');
    const c = await makeEntry('C');
    await makeEntry('D');
    await makeEntry('E');
    await startContest(db);
    const voter = await createUser(db, 'voter');
    await setMedal(db, voter.id, a.id, 'GOLD');
    await setMedal(db, voter.id, b.id, 'SILVER');
    await setMedal(db, voter.id, c.id, 'BRONZE');
    // D and E: 0 medals each, tied for last -- but the setting is off by default

    const result = await advance(db);
    expect(result.phase).toBe('RESULTS');
    expect(await getPendingWorstTie(db)).toBeNull();
  });

  it('detects a tie for last place and waits for the admin to start it, without auto-opening a round', async () => {
    const a = await makeEntry('A');
    const b = await makeEntry('B');
    const c = await makeEntry('C');
    const d = await makeEntry('D');
    const e = await makeEntry('E');
    await startContest(db);
    await setWorstPrizeEnabled(db, true);
    const voter = await createUser(db, 'voter');
    await setMedal(db, voter.id, a.id, 'GOLD');
    await setMedal(db, voter.id, b.id, 'SILVER');
    await setMedal(db, voter.id, c.id, 'BRONZE');

    const result = await advance(db);
    expect(result.phase).toBe('TIEBREAK');
    expect(result.pendingWorstTie?.candidateEntryIds.slice().sort()).toEqual([d.id, e.id].sort());
    expect((await getContest(db)).phase).toBe('TIEBREAK');
    expect(await getOpenRoundId(db)).toBeNull();

    const pending = await getPendingWorstTie(db);
    expect(pending?.candidateEntryIds.slice().sort()).toEqual([d.id, e.id].sort());
  });

  it('once the admin manually opens the round, resolves and reaches RESULTS like any other tiebreak', async () => {
    const a = await makeEntry('A');
    const b = await makeEntry('B');
    const c = await makeEntry('C');
    const d = await makeEntry('D');
    await makeEntry('E');
    await startContest(db);
    await setWorstPrizeEnabled(db, true);
    const [voter, v1, v2] = [await createUser(db, 'voter'), await createUser(db, 'v1'), await createUser(db, 'v2')];
    await setMedal(db, voter.id, a.id, 'GOLD');
    await setMedal(db, voter.id, b.id, 'SILVER');
    await setMedal(db, voter.id, c.id, 'BRONZE');

    const pendingResult = await advance(db);
    const pending = pendingResult.pendingWorstTie!;
    expect(await getPendingWorstTie(db)).not.toBeNull();

    const round = await openRound(db, pending.targetRank, pending.candidateEntryIds, 'MEDAL');
    expect(await getPendingWorstTie(db)).toBeNull();

    await castVote(db, round.id, v1.id, d.id);
    await castVote(db, round.id, v2.id, d.id);
    const closeResult = await closeRound(db, round.id);
    expect(closeResult.status).toBe('RESOLVED');
    expect(closeResult.winnerEntryId).toBe(d.id);

    const finalResult = await advance(db);
    expect(finalResult.phase).toBe('RESULTS');
  });

  it('reopens automatically if the manually-started round is still tied, without needing the admin again', async () => {
    const a = await makeEntry('A');
    const b = await makeEntry('B');
    const c = await makeEntry('C');
    const d = await makeEntry('D');
    const e = await makeEntry('E');
    await startContest(db);
    await setWorstPrizeEnabled(db, true);
    const [voter, v1, v2] = [await createUser(db, 'voter'), await createUser(db, 'v1'), await createUser(db, 'v2')];
    await setMedal(db, voter.id, a.id, 'GOLD');
    await setMedal(db, voter.id, b.id, 'SILVER');
    await setMedal(db, voter.id, c.id, 'BRONZE');

    const pendingResult = await advance(db);
    const pending = pendingResult.pendingWorstTie!;
    const round = await openRound(db, pending.targetRank, pending.candidateEntryIds, 'MEDAL');

    await castVote(db, round.id, v1.id, d.id);
    await castVote(db, round.id, v2.id, e.id); // still tied 1-1
    const closeResult = await closeRound(db, round.id);
    expect(closeResult.status).toBe('STILL_TIED');

    const newRoundId = await getOpenRoundId(db);
    expect(newRoundId).not.toBeNull();
    expect(newRoundId).not.toBe(round.id);

    const result = await advance(db);
    expect(result.phase).toBe('TIEBREAK');
    expect(result.pendingWorstTie).toBeUndefined();
  });

  it('getPendingWorstTie returns null when there is no tie for last place', async () => {
    const a = await makeEntry('A');
    await makeEntry('B');
    await startContest(db);
    await setWorstPrizeEnabled(db, true);
    const voter = await createUser(db, 'voter');
    await setMedal(db, voter.id, a.id, 'GOLD');
    // b has 0 medals but is alone in last place -- no dispute
    expect(await getPendingWorstTie(db)).toBeNull();
  });
});

describe('getTiebreakHistory', () => {
  it('reports the vote log and per-candidate tally for a resolved round', async () => {
    const a = await makeEntry('A');
    const b = await makeEntry('B');
    await startContest(db);
    const voter1 = await createUser(db, 'Ana');
    const voter2 = await createUser(db, 'Bruno');
    await addVote(db, voter1.id, a.id);
    await addVote(db, voter2.id, b.id);
    await advance(db);

    const roundId = (await getOpenRoundId(db))!;
    await castVote(db, roundId, voter1.id, a.id);
    await castVote(db, roundId, voter2.id, a.id);
    await closeRound(db, roundId);

    const history = await getTiebreakHistory(db);
    expect(history).toHaveLength(1);
    const round = history[0];
    expect(round.status).toBe('CLOSED');
    expect(round.result).toBe('RESOLVED');
    expect(round.winnerEntryId).toBe(a.id);
    expect(round.candidates.map((c) => ({ number: c.number, votes: c.votes })).sort((x, y) => x.number - y.number))
      .toEqual([
        { number: 1, votes: 2 },
        { number: 2, votes: 0 },
      ]);
    // Both votes can land in the same millisecond, so the log's chronological order
    // between them isn't guaranteed -- only that both are present, for the right entry.
    expect(
      round.votes
        .map((v) => ({ userName: v.userName, entryNumber: v.entryNumber }))
        .sort((x, y) => x.userName.localeCompare(y.userName))
    ).toEqual([
      { userName: 'Ana', entryNumber: 1 },
      { userName: 'Bruno', entryNumber: 1 },
    ]);
  });

  it('keeps a separate history entry for each reopened round when a tie repeats', async () => {
    const a = await makeEntry('A');
    const b = await makeEntry('B');
    await startContest(db);
    const [v1, v2] = [await createUser(db, 'v1'), await createUser(db, 'v2')];
    await addVote(db, v1.id, a.id);
    await addVote(db, v2.id, b.id);
    await advance(db);

    const firstRoundId = (await getOpenRoundId(db))!;
    await castVote(db, firstRoundId, v1.id, a.id);
    await castVote(db, firstRoundId, v2.id, b.id); // ties again 1-1
    await closeRound(db, firstRoundId);

    const history = await getTiebreakHistory(db);
    expect(history).toHaveLength(2); // the closed, still-tied round + the new reopened one
    const [reopened, closed] = history; // ordered newest first
    expect(reopened.status).toBe('OPEN');
    expect(reopened.result).toBeNull();
    expect(closed.status).toBe('CLOSED');
    expect(closed.result).toBe('STILL_TIED');
    expect(closed.winnerEntryId).toBeUndefined();
  });
});

describe('deleteTiebreakHistory', () => {
  it('wipes all rounds, candidates, and votes without touching the contest phase', async () => {
    const a = await makeEntry('A');
    const b = await makeEntry('B');
    await startContest(db);
    const [v1, v2] = [await createUser(db, 'v1'), await createUser(db, 'v2')];
    await addVote(db, v1.id, a.id);
    await addVote(db, v2.id, b.id);
    await advance(db);

    const roundId = (await getOpenRoundId(db))!;
    await castVote(db, roundId, v1.id, a.id);

    expect(await getTiebreakHistory(db)).toHaveLength(1);
    expect((await getContest(db)).phase).toBe('TIEBREAK');

    await deleteTiebreakHistory(db);

    expect(await getTiebreakHistory(db)).toHaveLength(0);
    expect((await getContest(db)).phase).toBe('TIEBREAK');
  });
});
