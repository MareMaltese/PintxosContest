import { describe, it, expect, beforeEach } from 'vitest';
import type Database from 'better-sqlite3';
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

let db: Database.Database;
let creatorId: string;

beforeEach(() => {
  db = createDb(':memory:');
  creatorId = createUser(db, 'Laura').id;
});

describe('entryService', () => {
  it('assigns sequential numbers starting at 1', () => {
    const e1 = createEntry(db, { creatorId, name: null, description: null, imagePath: 'a.webp' });
    const e2 = createEntry(db, { creatorId, name: 'Croqueta', description: null, imagePath: 'b.webp' });
    expect(e1.number).toBe(1);
    expect(e2.number).toBe(2);
  });

  it('refuses to create an entry once the contest has left REGISTRATION', () => {
    startContest(db);
    expect(() =>
      createEntry(db, { creatorId, name: null, description: null, imagePath: 'a.webp' })
    ).toThrow(AppError);
  });

  it('listEntries and getEntry are already available during REGISTRATION', () => {
    const entry = createEntry(db, { creatorId, name: 'Croqueta', description: null, imagePath: 'a.webp' });
    expect(listEntries(db)).toHaveLength(1);
    expect(getEntry(db, entry.id).name).toBe('Croqueta');
  });

  it('listEntries and getEntry work once voting has started', () => {
    const entry = createEntry(db, { creatorId, name: 'Croqueta', description: null, imagePath: 'a.webp' });
    startContest(db);
    expect(listEntries(db)).toHaveLength(1);
    expect(getEntry(db, entry.id).name).toBe('Croqueta');
  });

  it('getEntry throws 404 for an unknown id once unlocked', () => {
    startContest(db);
    expect(() => getEntry(db, 'missing')).toThrow(AppError);
  });

  it('getEntryUnchecked never throws and ignores phase', () => {
    expect(getEntryUnchecked(db, 'missing')).toBeUndefined();
  });

  it('getEntry includes the creator name', () => {
    const entry = createEntry(db, { creatorId, name: 'Croqueta', description: null, imagePath: 'a.webp' });
    startContest(db);
    const detail = getEntry(db, entry.id);
    expect(detail.creatorName).toBe('Laura');
  });

  it('listEntriesForAdmin returns every entry with creator name, even during REGISTRATION', () => {
    const entry = createEntry(db, { creatorId, name: 'Croqueta', description: null, imagePath: 'a.webp' });
    const list = listEntriesForAdmin(db);
    expect(list).toHaveLength(1);
    expect(list[0].number).toBe(entry.number);
    expect(list[0].creatorName).toBe('Laura');
  });

  it('listMyEntries returns only the caller\'s own entries, even during REGISTRATION', () => {
    const other = createUser(db, 'Miguel').id;
    const mine = createEntry(db, { creatorId, name: 'Croqueta', description: null, imagePath: 'a.webp' });
    createEntry(db, { creatorId: other, name: 'Tortilla', description: null, imagePath: 'b.webp' });

    const list = listMyEntries(db, creatorId);
    expect(list).toHaveLength(1);
    expect(list[0].id).toBe(mine.id);
  });

  it('updateOwnEntry lets the creator edit name and description during REGISTRATION', () => {
    const entry = createEntry(db, { creatorId, name: 'Croqueta', description: null, imagePath: 'a.webp' });
    const updated = updateOwnEntry(db, creatorId, entry.id, { name: 'Croqueta de jamón', description: 'Con jamón.' });
    expect(updated.name).toBe('Croqueta de jamón');
    expect(updated.description).toBe('Con jamón.');
  });

  it('updateOwnEntry refuses to edit an entry that belongs to someone else', () => {
    const other = createUser(db, 'Miguel').id;
    const entry = createEntry(db, { creatorId: other, name: 'Tortilla', description: null, imagePath: 'a.webp' });
    expect(() => updateOwnEntry(db, creatorId, entry.id, { name: 'Hackeada' })).toThrow(AppError);
  });

  it('updateOwnEntry refuses to edit once the contest has left REGISTRATION', () => {
    const entry = createEntry(db, { creatorId, name: 'Croqueta', description: null, imagePath: 'a.webp' });
    startContest(db);
    expect(() => updateOwnEntry(db, creatorId, entry.id, { name: 'Nueva' })).toThrow(AppError);
  });

  it('updateOwnEntry throws for an unknown entry id', () => {
    expect(() => updateOwnEntry(db, creatorId, 'missing', { name: 'Nueva' })).toThrow(AppError);
  });

  it('updateOwnEntry lets the creator replace the photo', () => {
    const entry = createEntry(db, { creatorId, name: 'Croqueta', description: null, imagePath: 'a.webp' });
    const updated = updateOwnEntry(db, creatorId, entry.id, { imagePath: 'b.webp' });
    expect(updated.imagePath).toBe('b.webp');
  });

  it('deleteOwnEntry lets the creator delete their own entry during REGISTRATION and returns its imagePath', () => {
    const entry = createEntry(db, { creatorId, name: 'Croqueta', description: null, imagePath: 'a.webp' });
    const imagePath = deleteOwnEntry(db, creatorId, entry.id);
    expect(imagePath).toBe('a.webp');
    expect(getEntryUnchecked(db, entry.id)).toBeUndefined();
  });

  it('deleteOwnEntry refuses to delete an entry that belongs to someone else', () => {
    const other = createUser(db, 'Miguel').id;
    const entry = createEntry(db, { creatorId: other, name: 'Tortilla', description: null, imagePath: 'a.webp' });
    expect(() => deleteOwnEntry(db, creatorId, entry.id)).toThrow(AppError);
    expect(getEntryUnchecked(db, entry.id)).toBeDefined();
  });

  it('deleteOwnEntry refuses to delete once the contest has left REGISTRATION', () => {
    const entry = createEntry(db, { creatorId, name: 'Croqueta', description: null, imagePath: 'a.webp' });
    startContest(db);
    expect(() => deleteOwnEntry(db, creatorId, entry.id)).toThrow(AppError);
  });

  it('deleteOwnEntry throws for an unknown entry id', () => {
    expect(() => deleteOwnEntry(db, creatorId, 'missing')).toThrow(AppError);
  });
});
