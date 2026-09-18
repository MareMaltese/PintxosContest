import { describe, it, expect, beforeEach } from 'vitest';
import type { Db } from '../db/connection';
import { createDb } from '../db/connection';
import {
  getContest,
  startContest,
  setAllowSelfVote,
  setVotingMode,
  revealResults,
  reopenVoting,
  backToRegistration,
  setPhase,
} from './contestService';
import { AppError } from '../middleware/errors';

let db: Db;

beforeEach(async () => {
  db = await createDb(':memory:');
});

describe('contestService', () => {
  it('starts in REGISTRATION with allowSelfVote false and votingMode FAVORITES', async () => {
    const contest = await getContest(db);
    expect(contest.phase).toBe('REGISTRATION');
    expect(contest.allowSelfVote).toBe(false);
    expect(contest.resultsRevealedAt).toBeNull();
    expect(contest.votingMode).toBe('FAVORITES');
  });

  it('setVotingMode switches between FAVORITES and MEDALS', async () => {
    expect((await setVotingMode(db, 'MEDALS')).votingMode).toBe('MEDALS');
    expect((await setVotingMode(db, 'FAVORITES')).votingMode).toBe('FAVORITES');
  });

  it('startContest moves REGISTRATION -> VOTING', async () => {
    const contest = await startContest(db);
    expect(contest.phase).toBe('VOTING');
  });

  it('startContest throws if the contest already started', async () => {
    await startContest(db);
    await expect(startContest(db)).rejects.toThrow(AppError);
  });

  it('setAllowSelfVote toggles the flag', async () => {
    expect((await setAllowSelfVote(db, true)).allowSelfVote).toBe(true);
    expect((await setAllowSelfVote(db, false)).allowSelfVote).toBe(false);
  });

  it('revealResults requires phase RESULTS and sets resultsRevealedAt once', async () => {
    await expect(revealResults(db)).rejects.toThrow(AppError);
    await setPhase(db, 'RESULTS');
    const revealed = await revealResults(db);
    expect(revealed.resultsRevealedAt).not.toBeNull();
    await expect(revealResults(db)).rejects.toThrow(AppError);
  });

  it('reopenVoting moves RESULTS back to VOTING and clears resultsRevealedAt', async () => {
    await setPhase(db, 'RESULTS');
    await revealResults(db);
    const reopened = await reopenVoting(db);
    expect(reopened.phase).toBe('VOTING');
    expect(reopened.resultsRevealedAt).toBeNull();
  });

  it('reopenVoting throws when the contest is not in RESULTS', async () => {
    await expect(reopenVoting(db)).rejects.toThrow(AppError);
  });

  it('backToRegistration moves any phase back to REGISTRATION and clears resultsRevealedAt', async () => {
    await setPhase(db, 'RESULTS');
    await revealResults(db);
    const reset = await backToRegistration(db);
    expect(reset.phase).toBe('REGISTRATION');
    expect(reset.resultsRevealedAt).toBeNull();
  });

  it('backToRegistration also works directly from VOTING or TIEBREAK', async () => {
    await startContest(db);
    expect((await backToRegistration(db)).phase).toBe('REGISTRATION');
    await setPhase(db, 'TIEBREAK');
    expect((await backToRegistration(db)).phase).toBe('REGISTRATION');
  });

  it('backToRegistration throws when the contest is already in REGISTRATION', async () => {
    await expect(backToRegistration(db)).rejects.toThrow(AppError);
  });
});
