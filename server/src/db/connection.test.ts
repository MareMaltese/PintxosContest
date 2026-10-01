import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { createClient } from '@libsql/client';
import { createDb } from './connection';

describe('createDb', () => {
  it('creates all tables and a default REGISTRATION contest row', async () => {
    const db = await createDb(':memory:');
    const tables = (
      (await db.prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name").all()) as unknown as {
        name: string;
      }[]
    ).map((r) => r.name);
    expect(tables).toEqual([
      'Contest',
      'Entry',
      'Image',
      'MedalVote',
      'RankingVote',
      'TiebreakCandidate',
      'TiebreakRound',
      'TiebreakVote',
      'User',
      'Vote',
    ]);
    const contest = (await db.prepare('SELECT * FROM Contest WHERE id = 1').get()) as unknown as {
      phase: string;
      allowSelfVote: number;
      resultsRevealedAt: string | null;
    };
    expect(contest.phase).toBe('REGISTRATION');
    expect(contest.allowSelfVote).toBe(0);
    expect(contest.resultsRevealedAt).toBeNull();
  });

  it('is idempotent: calling twice on the same file does not duplicate the Contest row', async () => {
    const db = await createDb(':memory:');
    await db.exec(fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf-8'));
    const count = ((await db.prepare('SELECT COUNT(*) as c FROM Contest').get()) as unknown as { c: number }).c;
    expect(count).toBe(1);
  });

  it('creates the MedalVote table and a kind column on TiebreakRound', async () => {
    const db = await createDb(':memory:');
    await db.prepare('SELECT id, userId, entryId, medal, createdAt FROM MedalVote').all();
    const columns = (await db.prepare('PRAGMA table_info(TiebreakRound)').all()) as unknown as { name: string }[];
    expect(columns.some((c) => c.name === 'kind')).toBe(true);
  });

  it('adds worstPrizeEnabled to a pre-existing Contest table without touching its data', async () => {
    const dbPath = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'pincho-migration-')), 'old.db');
    const legacyClient = createClient({ url: `file:${dbPath}` });
    await legacyClient.executeMultiple(`
      CREATE TABLE IF NOT EXISTS Contest (
        id INTEGER PRIMARY KEY CHECK (id = 1),
        phase TEXT NOT NULL,
        allowSelfVote INTEGER NOT NULL DEFAULT 0,
        votingMode TEXT NOT NULL DEFAULT 'FAVORITES',
        resultsRevealedAt TEXT NULL,
        createdAt TEXT NOT NULL
      );
    `);
    await legacyClient.execute({
      sql: `INSERT INTO Contest (id, phase, allowSelfVote, resultsRevealedAt, createdAt) VALUES (1, 'VOTING', 1, NULL, ?)`,
      args: ['2020-01-01T00:00:00.000Z'],
    });
    legacyClient.close();

    const db = await createDb(`file:${dbPath}`);
    const contest = (await db.prepare('SELECT * FROM Contest WHERE id = 1').get()) as unknown as {
      phase: string;
      allowSelfVote: number;
      worstPrizeEnabled: number;
    };
    expect(contest.phase).toBe('VOTING');
    expect(contest.allowSelfVote).toBe(1);
    expect(contest.worstPrizeEnabled).toBe(0);
  });

  it('rebuilds a Contest table whose votingMode CHECK predates RANKING, keeping its data', async () => {
    const dbPath = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'pincho-migration-')), 'old.db');
    const legacyClient = createClient({ url: `file:${dbPath}` });
    await legacyClient.executeMultiple(`
      CREATE TABLE IF NOT EXISTS Contest (
        id INTEGER PRIMARY KEY CHECK (id = 1),
        phase TEXT NOT NULL CHECK (phase IN ('REGISTRATION','VOTING','TIEBREAK','RESULTS')),
        allowSelfVote INTEGER NOT NULL DEFAULT 0,
        votingMode TEXT NOT NULL DEFAULT 'FAVORITES' CHECK (votingMode IN ('FAVORITES','MEDALS')),
        resultsRevealedAt TEXT NULL,
        worstPrizeEnabled INTEGER NOT NULL DEFAULT 0,
        createdAt TEXT NOT NULL
      );
    `);
    await legacyClient.execute({
      sql: `INSERT INTO Contest (id, phase, allowSelfVote, votingMode, resultsRevealedAt, worstPrizeEnabled, createdAt)
            VALUES (1, 'VOTING', 1, 'MEDALS', NULL, 1, ?)`,
      args: ['2020-01-01T00:00:00.000Z'],
    });
    legacyClient.close();

    const db = await createDb(`file:${dbPath}`);
    expect(await db.prepare('SELECT phase, allowSelfVote, votingMode, worstPrizeEnabled FROM Contest').get()).toMatchObject({
      phase: 'VOTING',
      allowSelfVote: 1,
      votingMode: 'MEDALS',
      worstPrizeEnabled: 1,
    });
    await db.prepare("UPDATE Contest SET votingMode = 'RANKING' WHERE id = 1").run();
    expect(await db.prepare('SELECT votingMode FROM Contest').get()).toMatchObject({ votingMode: 'RANKING' });
  });
});
