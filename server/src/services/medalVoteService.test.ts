import { describe, it, expect, beforeEach } from 'vitest';
import type Database from 'better-sqlite3';
import { createDb } from '../db/connection';
import { createUser } from './userService';
import { createEntry } from './entryService';
import { startContest, setAllowSelfVote } from './contestService';
import { getMyMedals, setMedal } from './medalVoteService';
import { AppError } from '../middleware/errors';

let db: Database.Database;
let voterId: string;
let entryIds: string[];

function setupEntriesFor(database: Database.Database, count: number, ownerName = 'owner') {
  const owner = createUser(database, ownerName);
  return Array.from({ length: count }, (_, i) =>
    createEntry(database, { creatorId: owner.id, name: `Entry ${i}`, description: null, imagePath: 'a.webp' }).id
  );
}

beforeEach(() => {
  db = createDb(':memory:');
  entryIds = setupEntriesFor(db, 5);
  voterId = createUser(db, 'Voter').id;
  startContest(db);
});

describe('medalVoteService', () => {
  it('starts with no medals assigned', () => {
    expect(getMyMedals(db, voterId)).toEqual({ gold: null, silver: null, bronze: null });
  });

  it('assigns one medal of each kind to different entries', () => {
    setMedal(db, voterId, entryIds[0], 'GOLD');
    setMedal(db, voterId, entryIds[1], 'SILVER');
    setMedal(db, voterId, entryIds[2], 'BRONZE');
    expect(getMyMedals(db, voterId)).toEqual({ gold: entryIds[0], silver: entryIds[1], bronze: entryIds[2] });
  });

  it('moves a medal from one entry to another', () => {
    setMedal(db, voterId, entryIds[0], 'GOLD');
    setMedal(db, voterId, entryIds[1], 'GOLD');
    expect(getMyMedals(db, voterId).gold).toBe(entryIds[1]);
  });

  it('replaces the medal already on an entry when a different one is chosen', () => {
    setMedal(db, voterId, entryIds[0], 'GOLD');
    setMedal(db, voterId, entryIds[0], 'SILVER');
    const medals = getMyMedals(db, voterId);
    expect(medals.gold).toBeNull();
    expect(medals.silver).toBe(entryIds[0]);
  });

  it('clears a medal when set to null', () => {
    setMedal(db, voterId, entryIds[0], 'GOLD');
    setMedal(db, voterId, entryIds[0], null);
    expect(getMyMedals(db, voterId)).toEqual({ gold: null, silver: null, bronze: null });
  });

  it('blocks self-vote by default', () => {
    const freshDb = createDb(':memory:');
    const [selfEntryId] = setupEntriesFor(freshDb, 1, 'self');
    const entry = freshDb.prepare('SELECT creatorId FROM Entry WHERE id = ?').get(selfEntryId) as {
      creatorId: string;
    };
    startContest(freshDb);
    expect(() => setMedal(freshDb, entry.creatorId, selfEntryId, 'GOLD')).toThrow(AppError);
  });

  it('allows self-vote when allowSelfVote is true', () => {
    const freshDb = createDb(':memory:');
    const [selfEntryId] = setupEntriesFor(freshDb, 1, 'self2');
    const entry = freshDb.prepare('SELECT creatorId FROM Entry WHERE id = ?').get(selfEntryId) as {
      creatorId: string;
    };
    setAllowSelfVote(freshDb, true);
    startContest(freshDb);
    expect(() => setMedal(freshDb, entry.creatorId, selfEntryId, 'GOLD')).not.toThrow();
  });

  it('blocks assigning a medal outside the VOTING phase', () => {
    db.prepare("UPDATE Contest SET phase = 'REGISTRATION' WHERE id = 1").run();
    expect(() => setMedal(db, voterId, entryIds[0], 'GOLD')).toThrow(AppError);
  });

  it('rejects a medal for an entry that does not exist', () => {
    expect(() => setMedal(db, voterId, 'nonexistent', 'GOLD')).toThrow(AppError);
  });
});
