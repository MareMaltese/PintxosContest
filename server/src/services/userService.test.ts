import { describe, it, expect, beforeEach } from 'vitest';
import type { Db } from '../db/connection';
import { createDb } from '../db/connection';
import { createUser, touchHeartbeat, getUser, listUsers, recoverUser } from './userService';
import { createEntry } from './entryService';
import { AppError } from '../middleware/errors';

let db: Db;

beforeEach(async () => {
  db = await createDb(':memory:');
});

describe('userService', () => {
  it('creates a user with a uuid id', async () => {
    const user = await createUser(db, 'Laura');
    expect(user.name).toBe('Laura');
    expect(user.id).toMatch(/^[0-9a-f-]{36}$/);
    expect((await getUser(db, user.id))?.name).toBe('Laura');
  });

  it('touchHeartbeat updates lastSeen', async () => {
    const user = await createUser(db, 'Miguel');
    await new Promise((r) => setTimeout(r, 5));
    await touchHeartbeat(db, user.id);
    const refreshed = (await getUser(db, user.id))!;
    expect(new Date(refreshed.lastSeen).getTime()).toBeGreaterThan(new Date(user.createdAt).getTime());
  });

  it('touchHeartbeat throws for an unknown user', async () => {
    await expect(touchHeartbeat(db, 'does-not-exist')).rejects.toThrow();
  });

  it('listUsers returns everyone in creation order', async () => {
    await createUser(db, 'Ana');
    await createUser(db, 'Carlos');
    expect((await listUsers(db)).map((u) => u.name)).toEqual(['Ana', 'Carlos']);
  });

  it('recoverUser finds the user by name and their pincho number', async () => {
    const user = await createUser(db, 'Laura');
    const entry = await createEntry(db, {
      creatorId: user.id,
      name: 'Croqueta',
      description: null,
      imagePath: 'a.webp',
    });

    const recovered = await recoverUser(db, 'Laura', entry.number);

    expect(recovered.id).toBe(user.id);
  });

  it('recoverUser matches the name case-insensitively and trims whitespace', async () => {
    const user = await createUser(db, 'Laura');
    const entry = await createEntry(db, {
      creatorId: user.id,
      name: 'Croqueta',
      description: null,
      imagePath: 'a.webp',
    });

    const recovered = await recoverUser(db, '  LAURA  ', entry.number);

    expect(recovered.id).toBe(user.id);
  });

  it('recoverUser throws when the pincho number does not exist', async () => {
    await createUser(db, 'Laura');
    await expect(recoverUser(db, 'Laura', 99)).rejects.toThrow(AppError);
  });

  it('recoverUser throws when the name does not match the entry\'s creator', async () => {
    const owner = await createUser(db, 'Laura');
    await createUser(db, 'Miguel');
    const entry = await createEntry(db, {
      creatorId: owner.id,
      name: 'Croqueta',
      description: null,
      imagePath: 'a.webp',
    });

    await expect(recoverUser(db, 'Miguel', entry.number)).rejects.toThrow(AppError);
  });
});
