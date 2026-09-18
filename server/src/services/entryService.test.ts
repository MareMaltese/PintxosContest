import { describe, it, expect, beforeEach } from 'vitest';
import type { Db } from '../db/connection';
import { createDb } from '../db/connection';
import { createUser } from './userService';
import { startContest } from './contestService';
import {
  createEntry,
  listEntries,
  getEntry,
  getEntryUnchecked,
  listEntriesForAdmin,
  listMyEntries,
  updateOwnEntry,
  deleteOwnEntry,
} from './entryService';
import { AppError } from '../middleware/errors';

let db: Db;
let creatorId: string;

beforeEach(async () => {
  db = await createDb(':memory:');
  creatorId = (await createUser(db, 'Laura')).id;
});

describe('entryService', () => {
  it('assigns sequential numbers starting at 1', async () => {
    const e1 = await createEntry(db, { creatorId, name: null, description: null, imagePath: 'a.webp' });
    const e2 = await createEntry(db, { creatorId, name: 'Croqueta', description: null, imagePath: 'b.webp' });
    expect(e1.number).toBe(1);
    expect(e2.number).toBe(2);
  });

  it('refuses to create an entry once the contest has left REGISTRATION', async () => {
    await startContest(db);
    await expect(
      createEntry(db, { creatorId, name: null, description: null, imagePath: 'a.webp' })
    ).rejects.toThrow(AppError);
  });

  it('listEntries and getEntry are already available during REGISTRATION', async () => {
    const entry = await createEntry(db, { creatorId, name: 'Croqueta', description: null, imagePath: 'a.webp' });
    expect(await listEntries(db)).toHaveLength(1);
    expect((await getEntry(db, entry.id)).name).toBe('Croqueta');
  });

  it('listEntries and getEntry work once voting has started', async () => {
    const entry = await createEntry(db, { creatorId, name: 'Croqueta', description: null, imagePath: 'a.webp' });
    await startContest(db);
    expect(await listEntries(db)).toHaveLength(1);
    expect((await getEntry(db, entry.id)).name).toBe('Croqueta');
  });

  it('getEntry throws 404 for an unknown id once unlocked', async () => {
    await startContest(db);
    await expect(getEntry(db, 'missing')).rejects.toThrow(AppError);
  });

  it('getEntryUnchecked never throws and ignores phase', async () => {
    expect(await getEntryUnchecked(db, 'missing')).toBeUndefined();
  });

  it('getEntry includes the creator name', async () => {
    const entry = await createEntry(db, { creatorId, name: 'Croqueta', description: null, imagePath: 'a.webp' });
    await startContest(db);
    const detail = await getEntry(db, entry.id);
    expect(detail.creatorName).toBe('Laura');
  });

  it('listEntriesForAdmin returns every entry with creator name, even during REGISTRATION', async () => {
    const entry = await createEntry(db, { creatorId, name: 'Croqueta', description: null, imagePath: 'a.webp' });
    const list = await listEntriesForAdmin(db);
    expect(list).toHaveLength(1);
    expect(list[0].number).toBe(entry.number);
    expect(list[0].creatorName).toBe('Laura');
  });

  it('listMyEntries returns only the caller\'s own entries, even during REGISTRATION', async () => {
    const other = (await createUser(db, 'Miguel')).id;
    const mine = await createEntry(db, { creatorId, name: 'Croqueta', description: null, imagePath: 'a.webp' });
    await createEntry(db, { creatorId: other, name: 'Tortilla', description: null, imagePath: 'b.webp' });

    const list = await listMyEntries(db, creatorId);
    expect(list).toHaveLength(1);
    expect(list[0].id).toBe(mine.id);
  });

  it('updateOwnEntry lets the creator edit name and description during REGISTRATION', async () => {
    const entry = await createEntry(db, { creatorId, name: 'Croqueta', description: null, imagePath: 'a.webp' });
    const updated = await updateOwnEntry(db, creatorId, entry.id, {
      name: 'Croqueta de jamón',
      description: 'Con jamón.',
    });
    expect(updated.name).toBe('Croqueta de jamón');
    expect(updated.description).toBe('Con jamón.');
  });

  it('updateOwnEntry refuses to edit an entry that belongs to someone else', async () => {
    const other = (await createUser(db, 'Miguel')).id;
    const entry = await createEntry(db, { creatorId: other, name: 'Tortilla', description: null, imagePath: 'a.webp' });
    await expect(updateOwnEntry(db, creatorId, entry.id, { name: 'Hackeada' })).rejects.toThrow(AppError);
  });

  it('updateOwnEntry refuses to edit once the contest has left REGISTRATION', async () => {
    const entry = await createEntry(db, { creatorId, name: 'Croqueta', description: null, imagePath: 'a.webp' });
    await startContest(db);
    await expect(updateOwnEntry(db, creatorId, entry.id, { name: 'Nueva' })).rejects.toThrow(AppError);
  });

  it('updateOwnEntry throws for an unknown entry id', async () => {
    await expect(updateOwnEntry(db, creatorId, 'missing', { name: 'Nueva' })).rejects.toThrow(AppError);
  });

  it('updateOwnEntry lets the creator replace the photo', async () => {
    const entry = await createEntry(db, { creatorId, name: 'Croqueta', description: null, imagePath: 'a.webp' });
    const updated = await updateOwnEntry(db, creatorId, entry.id, { imagePath: 'b.webp' });
    expect(updated.imagePath).toBe('b.webp');
  });

  it('deleteOwnEntry lets the creator delete their own entry during REGISTRATION and returns its imagePath', async () => {
    const entry = await createEntry(db, { creatorId, name: 'Croqueta', description: null, imagePath: 'a.webp' });
    const imagePath = await deleteOwnEntry(db, creatorId, entry.id);
    expect(imagePath).toBe('a.webp');
    expect(await getEntryUnchecked(db, entry.id)).toBeUndefined();
  });

  it('deleteOwnEntry refuses to delete an entry that belongs to someone else', async () => {
    const other = (await createUser(db, 'Miguel')).id;
    const entry = await createEntry(db, { creatorId: other, name: 'Tortilla', description: null, imagePath: 'a.webp' });
    await expect(deleteOwnEntry(db, creatorId, entry.id)).rejects.toThrow(AppError);
    expect(await getEntryUnchecked(db, entry.id)).toBeDefined();
  });

  it('deleteOwnEntry refuses to delete once the contest has left REGISTRATION', async () => {
    const entry = await createEntry(db, { creatorId, name: 'Croqueta', description: null, imagePath: 'a.webp' });
    await startContest(db);
    await expect(deleteOwnEntry(db, creatorId, entry.id)).rejects.toThrow(AppError);
  });

  it('deleteOwnEntry throws for an unknown entry id', async () => {
    await expect(deleteOwnEntry(db, creatorId, 'missing')).rejects.toThrow(AppError);
  });
});
