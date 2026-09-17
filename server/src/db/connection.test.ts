import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { createDb } from './connection';

describe('createDb', () => {
  it('creates all tables and a default REGISTRATION contest row', () => {
    const db = createDb(':memory:');
    const tables = (
      db.prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name").all() as { name: string }[]
    ).map((r) => r.name);
    expect(tables).toEqual([
      'Contest',
      'Entry',
      'MedalVote',
      'TiebreakCandidate',
      'TiebreakRound',
      'TiebreakVote',
      'User',
      'Vote',
    ]);
    const contest = db.prepare('SELECT * FROM Contest WHERE id = 1').get() as {
      phase: string;
      allowSelfVote: number;
      resultsRevealedAt: string | null;
    };
    expect(contest.phase).toBe('REGISTRATION');
    expect(contest.allowSelfVote).toBe(0);
    expect(contest.resultsRevealedAt).toBeNull();
  });

  it('is idempotent: calling twice on the same file does not duplicate the Contest row', () => {
    const db = createDb(':memory:');
    db.exec(fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf-8'));
    const count = (db.prepare('SELECT COUNT(*) as c FROM Contest').get() as { c: number }).c;
    expect(count).toBe(1);
  });

  it('creates the MedalVote table and a kind column on TiebreakRound', () => {
    const db = createDb(':memory:');
    expect(() => db.prepare('SELECT id, userId, entryId, medal, createdAt FROM MedalVote').all()).not.toThrow();
    const columns = db.prepare('PRAGMA table_info(TiebreakRound)').all() as { name: string }[];
    expect(columns.some((c) => c.name === 'kind')).toBe(true);
  });
});
