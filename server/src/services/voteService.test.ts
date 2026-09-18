import { describe, it, expect, beforeEach } from 'vitest';
import type { Db } from '../db/connection';
import { createDb } from '../db/connection';
import { createUser } from './userService';
import { createEntry } from './entryService';
import { startContest, setAllowSelfVote } from './contestService';
import { addVote, removeVote, listMyVotes, getFavoriteLimit } from './voteService';
import { AppError } from '../middleware/errors';

let db: Db;
let voterId: string;
let entryIds: string[];

async function setupEntriesFor(database: Db, count: number, ownerName = 'owner'): Promise<string[]> {
  const owner = await createUser(database, ownerName);
  const ids: string[] = [];
  for (let i = 0; i < count; i++) {
    const entry = await createEntry(database, {
      creatorId: owner.id,
      name: `Entry ${i}`,
      description: null,
      imagePath: 'a.webp',
    });
    ids.push(entry.id);
  }
  return ids;
}

beforeEach(async () => {
  db = await createDb(':memory:');
  entryIds = await setupEntriesFor(db, 5);
  voterId = (await createUser(db, 'Voter')).id;
  await startContest(db);
});

describe('voteService', () => {
  it('allows adding up to 3 favorites', async () => {
    await addVote(db, voterId, entryIds[0]);
    await addVote(db, voterId, entryIds[1]);
    await addVote(db, voterId, entryIds[2]);
    expect((await listMyVotes(db, voterId)).sort()).toEqual([entryIds[0], entryIds[1], entryIds[2]].sort());
  });

  it('refuses a 4th favorite with a clear error', async () => {
    await addVote(db, voterId, entryIds[0]);
    await addVote(db, voterId, entryIds[1]);
    await addVote(db, voterId, entryIds[2]);
    await expect(addVote(db, voterId, entryIds[3])).rejects.toThrow(AppError);
    expect(await listMyVotes(db, voterId)).toHaveLength(3);
  });

  it('refuses voting the same entry twice', async () => {
    await addVote(db, voterId, entryIds[0]);
    await expect(addVote(db, voterId, entryIds[0])).rejects.toThrow(AppError);
  });

  it('removeVote frees up a slot that can be reused', async () => {
    await addVote(db, voterId, entryIds[0]);
    await addVote(db, voterId, entryIds[1]);
    await addVote(db, voterId, entryIds[2]);
    await removeVote(db, voterId, entryIds[1]);
    expect(await listMyVotes(db, voterId)).toHaveLength(2);
    await addVote(db, voterId, entryIds[3]);
    expect(await listMyVotes(db, voterId)).toHaveLength(3);
  });

  it('removeVote throws if the entry was not a favorite', async () => {
    await expect(removeVote(db, voterId, entryIds[0])).rejects.toThrow(AppError);
  });

  it('blocks self-vote by default', async () => {
    const freshDb = await createDb(':memory:');
    const [selfEntryId] = await setupEntriesFor(freshDb, 1, 'self');
    const entry = (await freshDb.prepare('SELECT creatorId FROM Entry WHERE id = ?').get(selfEntryId)) as unknown as {
      creatorId: string;
    };
    await startContest(freshDb);
    await expect(addVote(freshDb, entry.creatorId, selfEntryId)).rejects.toThrow(AppError);
  });

  it('allows self-vote when allowSelfVote is true', async () => {
    const freshDb = await createDb(':memory:');
    const [selfEntryId] = await setupEntriesFor(freshDb, 1, 'self2');
    const entry = (await freshDb.prepare('SELECT creatorId FROM Entry WHERE id = ?').get(selfEntryId)) as unknown as {
      creatorId: string;
    };
    await setAllowSelfVote(freshDb, true);
    await startContest(freshDb);
    await expect(addVote(freshDb, entry.creatorId, selfEntryId)).resolves.not.toThrow();
  });

  it('blocks voting outside the VOTING phase', async () => {
    await db.prepare("UPDATE Contest SET phase = 'REGISTRATION' WHERE id = 1").run();
    await expect(addVote(db, voterId, entryIds[0])).rejects.toThrow(AppError);
  });

  it('adapts the favorite limit downward when self-vote is disallowed and the user owns entries', async () => {
    const freshDb = await createDb(':memory:');
    await setupEntriesFor(freshDb, 5, 'other-owner');
    const owner = await createUser(freshDb, 'prolific');
    await createEntry(freshDb, { creatorId: owner.id, name: null, description: null, imagePath: 'a.webp' });
    // total entries = 5 + 1 = 6, owner has 1 of their own, votable = 5, limit = min(3,5) = 3
    expect(await getFavoriteLimit(freshDb, owner.id)).toBe(3);
  });

  it('caps the favorite limit to the number of votable entries when fewer than 3 exist', async () => {
    const freshDb = await createDb(':memory:');
    await setupEntriesFor(freshDb, 2, 'owner2');
    const user = await createUser(freshDb, 'lonely-voter');
    await startContest(freshDb);
    expect(await getFavoriteLimit(freshDb, user.id)).toBe(2);
  });
});
