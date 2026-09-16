import { describe, it, expect, beforeEach } from 'vitest';
import type Database from 'better-sqlite3';
import { createDb } from '../db/connection';
import { createUser } from './userService';
import { createEntry } from './entryService';
import { addVote } from './voteService';
import { setAllowSelfVote, startContest } from './contestService';
import { computeStandings, podiumTieGroups } from './rankingService';

let db: Database.Database;

function makeEntry(name: string) {
  const creator = createUser(db, `creator-of-${name}`);
  return createEntry(db, { creatorId: creator.id, name, description: null, imagePath: 'a.webp' });
}

beforeEach(() => {
  db = createDb(':memory:');
  setAllowSelfVote(db, true);
});

describe('rankingService', () => {
  it('ranks entries by vote count, using competition ranking for ties', () => {
    const a = makeEntry('A');
    const b = makeEntry('B');
    const c = makeEntry('C');
    const d = makeEntry('D');
    startContest(db);
    const voters = [createUser(db, 'v1'), createUser(db, 'v2'), createUser(db, 'v3')];
    addVote(db, voters[0].id, a.id);
    addVote(db, voters[1].id, a.id);
    addVote(db, voters[0].id, b.id);
    addVote(db, voters[1].id, b.id);
    addVote(db, voters[0].id, c.id);

    const standings = computeStandings(db);
    const byId = Object.fromEntries(standings.map((s) => [s.entryId, s]));
    expect(byId[a.id].rank).toBe(1);
    expect(byId[b.id].rank).toBe(1);
    expect(byId[c.id].rank).toBe(3);
    expect(byId[d.id].rank).toBe(4);
  });

  it('podiumTieGroups only returns groups within the top 3 with more than one member', () => {
    const a = makeEntry('A');
    const b = makeEntry('B');
    const c = makeEntry('C');
    const d = makeEntry('D');
    const e = makeEntry('E');
    startContest(db);
    const [v1, v2, v3] = [createUser(db, 'v1'), createUser(db, 'v2'), createUser(db, 'v3')];
    addVote(db, v1.id, a.id);
    addVote(db, v2.id, a.id);
    addVote(db, v1.id, b.id);
    addVote(db, v2.id, b.id);
    addVote(db, v3.id, c.id);
    addVote(db, v1.id, d.id);

    const standings = computeStandings(db);
    const groups = podiumTieGroups(standings);
    expect(groups).toHaveLength(2);
    expect(groups[0].map((s) => s.entryId).sort()).toEqual([a.id, b.id].sort());
    expect(groups[1].map((s) => s.entryId).sort()).toEqual([c.id, d.id].sort());
    expect(groups.some((g) => g.some((s) => s.entryId === e.id))).toBe(false);
  });

  it('returns no groups when the podium is unambiguous', () => {
    const a = makeEntry('A');
    makeEntry('B');
    startContest(db);
    const v1 = createUser(db, 'v1');
    addVote(db, v1.id, a.id);
    const standings = computeStandings(db);
    expect(podiumTieGroups(standings)).toHaveLength(0);
  });
});
