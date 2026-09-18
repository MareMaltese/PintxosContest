import { describe, it, expect, beforeEach } from 'vitest';
import type Database from 'better-sqlite3';
import { createDb } from '../db/connection';
import { createUser, touchHeartbeat, getUser, listUsers, recoverUser } from './userService';
import { createEntry } from './entryService';
import { AppError } from '../middleware/errors';

let db: Database.Database;

beforeEach(() => {
  db = createDb(':memory:');
});

describe('userService', () => {
  it('creates a user with a uuid id', () => {
    const user = createUser(db, 'Laura');
    expect(user.name).toBe('Laura');
    expect(user.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(getUser(db, user.id)?.name).toBe('Laura');
  });

  it('touchHeartbeat updates lastSeen', async () => {
    const user = createUser(db, 'Miguel');
    await new Promise((r) => setTimeout(r, 5));
    touchHeartbeat(db, user.id);
    const refreshed = getUser(db, user.id)!;
    expect(new Date(refreshed.lastSeen).getTime()).toBeGreaterThan(new Date(user.createdAt).getTime());
  });

  it('touchHeartbeat throws for an unknown user', () => {
    expect(() => touchHeartbeat(db, 'does-not-exist')).toThrow();
  });

  it('listUsers returns everyone in creation order', () => {
    createUser(db, 'Ana');
    createUser(db, 'Carlos');
    expect(listUsers(db).map((u) => u.name)).toEqual(['Ana', 'Carlos']);
  });

  it('recoverUser finds the user by name and their pincho number', () => {
    const user = createUser(db, 'Laura');
    const entry = createEntry(db, { creatorId: user.id, name: 'Croqueta', description: null, imagePath: 'a.webp' });

    const recovered = recoverUser(db, 'Laura', entry.number);

    expect(recovered.id).toBe(user.id);
  });

  it('recoverUser matches the name case-insensitively and trims whitespace', () => {
    const user = createUser(db, 'Laura');
    const entry = createEntry(db, { creatorId: user.id, name: 'Croqueta', description: null, imagePath: 'a.webp' });

    const recovered = recoverUser(db, '  LAURA  ', entry.number);

    expect(recovered.id).toBe(user.id);
  });

  it('recoverUser throws when the pincho number does not exist', () => {
    createUser(db, 'Laura');
    expect(() => recoverUser(db, 'Laura', 99)).toThrow(AppError);
  });

  it('recoverUser throws when the name does not match the entry\'s creator', () => {
    const owner = createUser(db, 'Laura');
    createUser(db, 'Miguel');
    const entry = createEntry(db, { creatorId: owner.id, name: 'Croqueta', description: null, imagePath: 'a.webp' });

    expect(() => recoverUser(db, 'Miguel', entry.number)).toThrow(AppError);
  });
});
