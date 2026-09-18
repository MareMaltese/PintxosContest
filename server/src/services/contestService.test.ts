import { describe, it, expect, beforeEach } from 'vitest';
import type Database from 'better-sqlite3';
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

let db: Database.Database;

beforeEach(() => {
  db = createDb(':memory:');
});

describe('contestService', () => {
  it('starts in REGISTRATION with allowSelfVote false and votingMode FAVORITES', () => {
    const contest = getContest(db);
    expect(contest.phase).toBe('REGISTRATION');
    expect(contest.allowSelfVote).toBe(false);
    expect(contest.resultsRevealedAt).toBeNull();
    expect(contest.votingMode).toBe('FAVORITES');
  });

  it('setVotingMode switches between FAVORITES and MEDALS', () => {
    expect(setVotingMode(db, 'MEDALS').votingMode).toBe('MEDALS');
    expect(setVotingMode(db, 'FAVORITES').votingMode).toBe('FAVORITES');
  });

  it('startContest moves REGISTRATION -> VOTING', () => {
    const contest = startContest(db);
    expect(contest.phase).toBe('VOTING');
  });

  it('startContest throws if the contest already started', () => {
    startContest(db);
    expect(() => startContest(db)).toThrow(AppError);
  });

  it('setAllowSelfVote toggles the flag', () => {
    expect(setAllowSelfVote(db, true).allowSelfVote).toBe(true);
    expect(setAllowSelfVote(db, false).allowSelfVote).toBe(false);
  });

  it('revealResults requires phase RESULTS and sets resultsRevealedAt once', () => {
    expect(() => revealResults(db)).toThrow(AppError);
    setPhase(db, 'RESULTS');
    const revealed = revealResults(db);
    expect(revealed.resultsRevealedAt).not.toBeNull();
    expect(() => revealResults(db)).toThrow(AppError);
  });

  it('reopenVoting moves RESULTS back to VOTING and clears resultsRevealedAt', () => {
    setPhase(db, 'RESULTS');
    revealResults(db);
    const reopened = reopenVoting(db);
    expect(reopened.phase).toBe('VOTING');
    expect(reopened.resultsRevealedAt).toBeNull();
  });

  it('reopenVoting throws when the contest is not in RESULTS', () => {
    expect(() => reopenVoting(db)).toThrow(AppError);
  });

  it('backToRegistration moves any phase back to REGISTRATION and clears resultsRevealedAt', () => {
    setPhase(db, 'RESULTS');
    revealResults(db);
    const reset = backToRegistration(db);
    expect(reset.phase).toBe('REGISTRATION');
    expect(reset.resultsRevealedAt).toBeNull();
  });

  it('backToRegistration also works directly from VOTING or TIEBREAK', () => {
    startContest(db);
    expect(backToRegistration(db).phase).toBe('REGISTRATION');
    setPhase(db, 'TIEBREAK');
    expect(backToRegistration(db).phase).toBe('REGISTRATION');
  });

  it('backToRegistration throws when the contest is already in REGISTRATION', () => {
    expect(() => backToRegistration(db)).toThrow(AppError);
  });
});
