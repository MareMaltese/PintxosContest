import { describe, it, expect, beforeEach } from 'vitest';
import type Database from 'better-sqlite3';
import { createDb } from '../db/connection';
import { createUser } from './userService';
import { startContest } from './contestService';
import { createEntry, listEntries, getEntry, getEntryUnchecked } from './entryService';
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

  it('listEntries and getEntry are locked during REGISTRATION', () => {
    createEntry(db, { creatorId, name: null, description: null, imagePath: 'a.webp' });
    expect(() => listEntries(db)).toThrow(AppError);
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
});
