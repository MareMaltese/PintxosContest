import { describe, it, expect, beforeEach } from 'vitest';
import type { Db } from '../db/connection';
import { createDb } from '../db/connection';
import { createUser } from './userService';
import { createEntry, type Entry } from './entryService';
import { addVote } from './voteService';
import { setAllowSelfVote, startContest } from './contestService';
import { computeStandings, podiumTieGroups, computeMedalStandings } from './rankingService';

let db: Db;

async function makeEntry(name: string): Promise<Entry> {
  const creator = await createUser(db, `creator-of-${name}`);
  return createEntry(db, { creatorId: creator.id, name, description: null, imagePath: 'a.webp' });
}

beforeEach(async () => {
  db = await createDb(':memory:');
  await setAllowSelfVote(db, true);
});

describe('rankingService', () => {
  it('ranks entries by vote count, using competition ranking for ties', async () => {
    const a = await makeEntry('A');
    const b = await makeEntry('B');
    const c = await makeEntry('C');
    const d = await makeEntry('D');
    await startContest(db);
    const voters = [await createUser(db, 'v1'), await createUser(db, 'v2'), await createUser(db, 'v3')];
    await addVote(db, voters[0].id, a.id);
    await addVote(db, voters[1].id, a.id);
    await addVote(db, voters[0].id, b.id);
    await addVote(db, voters[1].id, b.id);
    await addVote(db, voters[0].id, c.id);

    const standings = await computeStandings(db);
    const byId = Object.fromEntries(standings.map((s) => [s.entryId, s]));
    expect(byId[a.id].rank).toBe(1);
    expect(byId[b.id].rank).toBe(1);
    expect(byId[c.id].rank).toBe(3);
    expect(byId[d.id].rank).toBe(4);
  });

  it('podiumTieGroups only returns groups within the top 3 with more than one member', async () => {
    const a = await makeEntry('A');
    const b = await makeEntry('B');
    const c = await makeEntry('C');
    const d = await makeEntry('D');
    const e = await makeEntry('E');
    await startContest(db);
    const [v1, v2, v3] = [await createUser(db, 'v1'), await createUser(db, 'v2'), await createUser(db, 'v3')];
    await addVote(db, v1.id, a.id);
    await addVote(db, v2.id, a.id);
    await addVote(db, v1.id, b.id);
    await addVote(db, v2.id, b.id);
    await addVote(db, v3.id, c.id);
    await addVote(db, v1.id, d.id);

    const standings = await computeStandings(db);
    const groups = podiumTieGroups(standings);
    expect(groups).toHaveLength(2);
    expect(groups[0].map((s) => s.entryId).sort()).toEqual([a.id, b.id].sort());
    expect(groups[1].map((s) => s.entryId).sort()).toEqual([c.id, d.id].sort());
    expect(groups.some((g) => g.some((s) => s.entryId === e.id))).toBe(false);
  });

  it('still detects a tie in the 3rd podium slot even when an earlier tie pushed its rank number past 3', async () => {
    // Competition ranking with a 2-way tie at rank 1 pushes the next tier to rank 3; a
    // further 2-way tie there pushes the true "3rd place" tier to rank 5. A naive
    // "rank <= 3" cutoff would silently miss this genuine 3rd-place dispute.
    const a = await makeEntry('A');
    const b = await makeEntry('B');
    const c = await makeEntry('C');
    const d = await makeEntry('D');
    const e = await makeEntry('E');
    const f = await makeEntry('F');
    await startContest(db);
    const voters = await Promise.all(['v1', 'v2', 'v3'].map((n) => createUser(db, n)));
    const [v1, v2, v3] = voters;
    await addVote(db, v1.id, a.id);
    await addVote(db, v2.id, a.id);
    await addVote(db, v1.id, b.id);
    await addVote(db, v2.id, b.id); // a, b: 2 votes each -> rank 1
    await addVote(db, v1.id, c.id);
    await addVote(db, v3.id, d.id); // c, d: 1 vote each -> rank 3
    // e, f: 0 votes each -> rank 5 (the true 3rd tier)

    const standings = await computeStandings(db);
    const byId = Object.fromEntries(standings.map((s) => [s.entryId, s]));
    expect(byId[e.id].rank).toBe(5);
    expect(byId[f.id].rank).toBe(5);

    const groups = podiumTieGroups(standings);
    expect(groups).toHaveLength(3);
    expect(groups[2].map((s) => s.entryId).sort()).toEqual([e.id, f.id].sort());
  });

  it('returns no groups when the podium is unambiguous', async () => {
    const a = await makeEntry('A');
    await makeEntry('B');
    await startContest(db);
    const v1 = await createUser(db, 'v1');
    await addVote(db, v1.id, a.id);
    const standings = await computeStandings(db);
    expect(podiumTieGroups(standings)).toHaveLength(0);
  });
});

describe('computeMedalStandings', () => {
  it('ranks entries by total medal score, using competition ranking for ties', async () => {
    const a = await makeEntry('A');
    const b = await makeEntry('B');
    const c = await makeEntry('C');
    await startContest(db);
    const voter = await createUser(db, 'voter');
    const insert = db.prepare(
      "INSERT INTO MedalVote (id, userId, entryId, medal, createdAt) VALUES (?, ?, ?, ?, datetime('now'))"
    );
    await insert.run('m1', voter.id, a.id, 'GOLD'); // 5 points
    await insert.run('m2', (await createUser(db, 'v2')).id, b.id, 'SILVER'); // 3 points
    // c has no medals: 0 points

    const standings = await computeMedalStandings(db);
    const byId = Object.fromEntries(standings.map((s) => [s.entryId, s]));
    expect(byId[a.id].total).toBe(5);
    expect(byId[a.id].rank).toBe(1);
    expect(byId[b.id].total).toBe(3);
    expect(byId[b.id].rank).toBe(2);
    expect(byId[c.id].total).toBe(0);
    expect(byId[c.id].rank).toBe(3);
    expect(byId[a.id].gold).toBe(1);
    expect(byId[b.id].silver).toBe(1);
    expect(byId[a.id].creatorName).toBe('creator-of-A');
    expect(byId[a.id].imagePath).toBe('a.webp');
  });

  it('podiumTieGroups also works with medal standings', async () => {
    const a = await makeEntry('A');
    const b = await makeEntry('B');
    await startContest(db);
    const voter = await createUser(db, 'voter');
    await db
      .prepare("INSERT INTO MedalVote (id, userId, entryId, medal, createdAt) VALUES (?, ?, ?, ?, datetime('now'))")
      .run('m1', voter.id, a.id, 'BRONZE');
    await db
      .prepare("INSERT INTO MedalVote (id, userId, entryId, medal, createdAt) VALUES (?, ?, ?, ?, datetime('now'))")
      .run('m2', (await createUser(db, 'v2')).id, b.id, 'BRONZE');

    const groups = podiumTieGroups(await computeMedalStandings(db));
    expect(groups).toHaveLength(1);
    expect(groups[0].map((s) => s.entryId).sort()).toEqual([a.id, b.id].sort());
  });
});
