import { describe, it, expect, beforeEach } from 'vitest';
import type Database from 'better-sqlite3';
import { createDb } from '../db/connection';
import { createUser } from './userService';
import { createEntry } from './entryService';
import { startContest, setAllowSelfVote } from './contestService';
import { addVote, removeVote, listMyVotes, getFavoriteLimit } from './voteService';
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

describe('voteService', () => {
  it('allows adding up to 3 favorites', () => {
    addVote(db, voterId, entryIds[0]);
    addVote(db, voterId, entryIds[1]);
    addVote(db, voterId, entryIds[2]);
    expect(listMyVotes(db, voterId).sort()).toEqual([entryIds[0], entryIds[1], entryIds[2]].sort());
  });

  it('refuses a 4th favorite with a clear error', () => {
    addVote(db, voterId, entryIds[0]);
    addVote(db, voterId, entryIds[1]);
    addVote(db, voterId, entryIds[2]);
    expect(() => addVote(db, voterId, entryIds[3])).toThrow(AppError);
    expect(listMyVotes(db, voterId)).toHaveLength(3);
  });

  it('refuses voting the same entry twice', () => {
    addVote(db, voterId, entryIds[0]);
    expect(() => addVote(db, voterId, entryIds[0])).toThrow(AppError);
  });

  it('removeVote frees up a slot that can be reused', () => {
    addVote(db, voterId, entryIds[0]);
    addVote(db, voterId, entryIds[1]);
    addVote(db, voterId, entryIds[2]);
    removeVote(db, voterId, entryIds[1]);
    expect(listMyVotes(db, voterId)).toHaveLength(2);
    addVote(db, voterId, entryIds[3]);
    expect(listMyVotes(db, voterId)).toHaveLength(3);
  });

  it('removeVote throws if the entry was not a favorite', () => {
    expect(() => removeVote(db, voterId, entryIds[0])).toThrow(AppError);
  });

  it('blocks self-vote by default', () => {
    const freshDb = createDb(':memory:');
    const [selfEntryId] = setupEntriesFor(freshDb, 1, 'self');
    const entry = freshDb.prepare('SELECT creatorId FROM Entry WHERE id = ?').get(selfEntryId) as {
      creatorId: string;
    };
    startContest(freshDb);
    expect(() => addVote(freshDb, entry.creatorId, selfEntryId)).toThrow(AppError);
  });

  it('allows self-vote when allowSelfVote is true', () => {
    const freshDb = createDb(':memory:');
    const [selfEntryId] = setupEntriesFor(freshDb, 1, 'self2');
    const entry = freshDb.prepare('SELECT creatorId FROM Entry WHERE id = ?').get(selfEntryId) as {
      creatorId: string;
    };
    setAllowSelfVote(freshDb, true);
    startContest(freshDb);
    expect(() => addVote(freshDb, entry.creatorId, selfEntryId)).not.toThrow();
  });

  it('blocks voting outside the VOTING phase', () => {
    db.prepare("UPDATE Contest SET phase = 'REGISTRATION' WHERE id = 1").run();
    expect(() => addVote(db, voterId, entryIds[0])).toThrow(AppError);
  });

  it('adapts the favorite limit downward when self-vote is disallowed and the user owns entries', () => {
    const freshDb = createDb(':memory:');
    setupEntriesFor(freshDb, 5, 'other-owner');
    const owner = createUser(freshDb, 'prolific');
    createEntry(freshDb, { creatorId: owner.id, name: null, description: null, imagePath: 'a.webp' });
    // total entries = 5 + 1 = 6, owner has 1 of their own, votable = 5, limit = min(3,5) = 3
    expect(getFavoriteLimit(freshDb, owner.id)).toBe(3);
  });

  it('caps the favorite limit to the number of votable entries when fewer than 3 exist', () => {
    const freshDb = createDb(':memory:');
    setupEntriesFor(freshDb, 2, 'owner2');
    const user = createUser(freshDb, 'lonely-voter');
    startContest(freshDb);
    expect(getFavoriteLimit(freshDb, user.id)).toBe(2);
  });
});
