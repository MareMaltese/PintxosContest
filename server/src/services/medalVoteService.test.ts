import { describe, it, expect, beforeEach } from 'vitest';
import type { Db } from '../db/connection';
import { createDb } from '../db/connection';
import { createUser } from './userService';
import { createEntry } from './entryService';
import { startContest, setAllowSelfVote } from './contestService';
import { getMyMedals, setMedal } from './medalVoteService';
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

describe('medalVoteService', () => {
  it('starts with no medals assigned', async () => {
    expect(await getMyMedals(db, voterId)).toEqual({ gold: null, silver: null, bronze: null });
  });

  it('assigns one medal of each kind to different entries', async () => {
    await setMedal(db, voterId, entryIds[0], 'GOLD');
    await setMedal(db, voterId, entryIds[1], 'SILVER');
    await setMedal(db, voterId, entryIds[2], 'BRONZE');
    expect(await getMyMedals(db, voterId)).toEqual({ gold: entryIds[0], silver: entryIds[1], bronze: entryIds[2] });
  });

  it('moves a medal from one entry to another', async () => {
    await setMedal(db, voterId, entryIds[0], 'GOLD');
    await setMedal(db, voterId, entryIds[1], 'GOLD');
    expect((await getMyMedals(db, voterId)).gold).toBe(entryIds[1]);
  });

  it('replaces the medal already on an entry when a different one is chosen', async () => {
    await setMedal(db, voterId, entryIds[0], 'GOLD');
    await setMedal(db, voterId, entryIds[0], 'SILVER');
    const medals = await getMyMedals(db, voterId);
    expect(medals.gold).toBeNull();
    expect(medals.silver).toBe(entryIds[0]);
  });

  it('clears a medal when set to null', async () => {
    await setMedal(db, voterId, entryIds[0], 'GOLD');
    await setMedal(db, voterId, entryIds[0], null);
    expect(await getMyMedals(db, voterId)).toEqual({ gold: null, silver: null, bronze: null });
  });

  it('blocks self-vote by default', async () => {
    const freshDb = await createDb(':memory:');
    const [selfEntryId] = await setupEntriesFor(freshDb, 1, 'self');
    const entry = (await freshDb.prepare('SELECT creatorId FROM Entry WHERE id = ?').get(selfEntryId)) as unknown as {
      creatorId: string;
    };
    await startContest(freshDb);
    await expect(setMedal(freshDb, entry.creatorId, selfEntryId, 'GOLD')).rejects.toThrow(AppError);
  });

  it('allows self-vote when allowSelfVote is true', async () => {
    const freshDb = await createDb(':memory:');
    const [selfEntryId] = await setupEntriesFor(freshDb, 1, 'self2');
    const entry = (await freshDb.prepare('SELECT creatorId FROM Entry WHERE id = ?').get(selfEntryId)) as unknown as {
      creatorId: string;
    };
    await setAllowSelfVote(freshDb, true);
    await startContest(freshDb);
    await expect(setMedal(freshDb, entry.creatorId, selfEntryId, 'GOLD')).resolves.not.toThrow();
  });

  it('blocks assigning a medal outside the VOTING phase', async () => {
    await db.prepare("UPDATE Contest SET phase = 'REGISTRATION' WHERE id = 1").run();
    await expect(setMedal(db, voterId, entryIds[0], 'GOLD')).rejects.toThrow(AppError);
  });

  it('rejects a medal for an entry that does not exist', async () => {
    await expect(setMedal(db, voterId, 'nonexistent', 'GOLD')).rejects.toThrow(AppError);
  });
});
