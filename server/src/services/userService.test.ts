import { describe, it, expect, beforeEach } from 'vitest';
import type Database from 'better-sqlite3';
import { createDb } from '../db/connection';
import { createUser, touchHeartbeat, getUser, listUsers } from './userService';

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
});
