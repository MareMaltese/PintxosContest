# Pinch-o-visión Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A second, Eurovisión-style scoring system that coexists with the
existing favorites voting: each guest hands out at most one GOLD, one
SILVER and one BRONZE medal (never two medals to the same tapa). Admin
sees the live tally at any time; guests only see the top-3 podium once the
admin reveals results (same button as the main contest's results).

**Architecture:** A new `MedalVote` table (two `UNIQUE` constraints do all
the rule enforcement) plus a `kind` discriminator column added to the
existing `TiebreakRound` table, so medal-podium ties reuse the exact same
tiebreak machinery already built and tested for the main ranking — no new
tiebreak tables, no new admin buttons for tiebreak. Frontend mirrors the
already-built favorites pattern (store + button component) for the medal
buttons, and adds two new guest-facing screens that don't exist yet for
the main contest either: a generic (kind-aware) tiebreak voting screen and
a medal podium screen.

**Tech Stack:** Same as the rest of the project — Express + TypeScript +
`better-sqlite3` + `zod` (backend), Vue 3 `<script setup>` + TypeScript +
Pinia + `@lucide/vue` + Vitest (frontend).

**Spec:** `docs/superpowers/specs/2026-09-17-pinch-o-vision-design.md`
(depends on `docs/superpowers/specs/2026-09-16-pincho-party-design.md` for
the base schema/phase machine/auth conventions).

## Global Constraints

- Scoring: GOLD = 5, SILVER = 3, BRONZE = 1.
- One medal max per tapa per voter, one GOLD/SILVER/BRONZE max per voter
  in total (both enforced by `UNIQUE` constraints, not application code).
- Assigning a medal you already hold elsewhere **moves** it (no error);
  pressing the same medal on the same tapa again clears it. This is a
  delete-then-insert upsert inside one transaction — never a plain INSERT
  that could throw on the `UNIQUE` constraint.
- Medal voting only allowed during `VOTING`, same self-vote rule as
  favorites (`Contest.allowSelfVote`).
- Admin's live medal tally (`GET /api/admin/medal-votes`) has **no** phase
  restriction. Guests get the podium only once `resultsRevealedAt` is set
  — same field, same "Mostrar resultados" button as the main contest, no
  separate reveal action.
- Podium ties are resolved with the existing `TiebreakRound` /
  `TiebreakCandidate` / `TiebreakVote` tables, discriminated by a new
  `kind` column (`'MAIN'` default, or `'MEDAL'`). No new tables for this.
- Every existing test in `server/` and `frontend/` must still pass
  unchanged after each task — the changes to `rankingService.ts` and
  `tiebreakService.ts` are additive/generalizing, not behavior changes to
  the main ranking.
- Placeholder icon: use `@lucide/vue`'s `Medal` icon everywhere a medal
  icon is needed. The user will eventually hand over a custom `medal.svg`
  — swapping it in later is a one-line import change in `MedalButtons.vue`
  and `MedalPodiumView.vue`, not part of this plan.

---

## Existing contracts this plan relies on (read, do not modify their behavior)

- `server/src/db/connection.ts::createDb` runs `schema.sql` via
  `CREATE TABLE IF NOT EXISTS` on every start — there is no ALTER-based
  migration runner in this codebase. New columns on an existing table only
  take effect on a fresh database. For `:memory:` test databases this is
  automatic; for the shared dev SQLite file, `npm run db:reset` (already
  documented in the base spec) recreates it from the updated schema.
- `server/src/services/contestService.ts`: `getContest`, `setPhase`.
- `server/src/services/entryService.ts`: `getEntryUnchecked`.
- `server/src/middleware/errors.ts`: `AppError(status, code, message)`.
- `server/src/middleware/userAuth.ts` / `adminAuth.ts`: set `req.userId` /
  gate `X-Admin-Pin`, already applied by existing routers.
- `frontend/src/services/api.ts`: `api.get/post/postForm/patch/delete`
  return parsed JSON or throw `ApiError` (`.status`, `.code`, `.message`).
- `frontend/src/stores/votes.ts` (Fase E): the closest analogous frontend
  store — same optimistic-toggle-then-confirm shape, referenced for
  pattern consistency in Task 9.

---

### Task 1: Schema — `MedalVote` table and `TiebreakRound.kind`

**Files:**
- Modify: `server/src/db/schema.sql`

- [ ] **Step 1: Write the failing test**

```ts
// server/src/db/connection.test.ts — add this test to the existing file
it('creates the MedalVote table and a kind column on TiebreakRound', () => {
  const db = createDb(':memory:');
  expect(() => db.prepare('SELECT id, userId, entryId, medal, createdAt FROM MedalVote').all()).not.toThrow();
  const columns = db.prepare('PRAGMA table_info(TiebreakRound)').all() as { name: string }[];
  expect(columns.some((c) => c.name === 'kind')).toBe(true);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/db/connection.test.ts`
Expected: FAIL — `no such table: MedalVote` (or the `kind` column missing).

- [ ] **Step 3: Update the schema**

In `server/src/db/schema.sql`, change the `TiebreakRound` table to add
`kind`, and append the new `MedalVote` table at the end of the file:

```sql
CREATE TABLE IF NOT EXISTS TiebreakRound (
  id TEXT PRIMARY KEY,
  roundNumber INTEGER NOT NULL,
  targetRank INTEGER NOT NULL,
  kind TEXT NOT NULL DEFAULT 'MAIN' CHECK (kind IN ('MAIN','MEDAL')),
  status TEXT NOT NULL CHECK (status IN ('OPEN','CLOSED')),
  createdAt TEXT NOT NULL,
  closedAt TEXT NULL
);
```

(This replaces the existing `TiebreakRound` table definition — same
table, just with the `kind` column inserted.)

```sql
CREATE TABLE IF NOT EXISTS MedalVote (
  id TEXT PRIMARY KEY,
  userId TEXT NOT NULL REFERENCES User(id),
  entryId TEXT NOT NULL REFERENCES Entry(id),
  medal TEXT NOT NULL CHECK (medal IN ('GOLD','SILVER','BRONZE')),
  createdAt TEXT NOT NULL,
  UNIQUE (userId, entryId),
  UNIQUE (userId, medal)
);
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/db/connection.test.ts`
Expected: PASS.

- [ ] **Step 5: Run the full backend suite to confirm no regression**

Run: `npm test`
Expected: PASS (all 45 existing tests + the new one) — `:memory:`
databases are created fresh per test, so the new column/table are present
everywhere immediately.

- [ ] **Step 6: Commit**

```bash
git add src/db/schema.sql src/db/connection.test.ts
git commit -m "Add MedalVote table and TiebreakRound.kind column"
```

---

### Task 2: `rankingService` — generalize tie-grouping, add medal standings

**Files:**
- Modify: `server/src/services/rankingService.ts`
- Modify test: `server/src/services/rankingService.test.ts`

**Interfaces:**
- Produces: `MedalStandingEntry`, `MedalStanding`, `computeMedalStandings(db)`.
  `podiumTieGroups` becomes generic (`<T extends { entryId: string; rank: number }>`)
  — same behavior, same call signature for existing callers, but now also
  usable with `MedalStanding[]`. Later tasks (3, 5) depend on these exact
  names.

- [ ] **Step 1: Write the failing tests**

Add to `server/src/services/rankingService.test.ts` (keep the existing
three tests untouched — they must keep passing unmodified):

```ts
import { setMedal } from './medalVoteService';
// (add this import alongside the existing ones once Task 4 exists; for
// this task, seed MedalVote rows directly via SQL instead, so Task 2 has
// no dependency on Task 4 — see the test body below)

describe('computeMedalStandings', () => {
  it('ranks entries by total medal score, using competition ranking for ties', () => {
    const a = makeEntry('A');
    const b = makeEntry('B');
    const c = makeEntry('C');
    startContest(db);
    const voter = createUser(db, 'voter');
    const insert = db.prepare(
      "INSERT INTO MedalVote (id, userId, entryId, medal, createdAt) VALUES (?, ?, ?, ?, datetime('now'))"
    );
    insert.run('m1', voter.id, a.id, 'GOLD'); // 5 points
    insert.run('m2', createUser(db, 'v2').id, b.id, 'SILVER'); // 3 points
    // c has no medals: 0 points

    const standings = computeMedalStandings(db);
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
  });

  it('podiumTieGroups also works with medal standings', () => {
    const a = makeEntry('A');
    const b = makeEntry('B');
    startContest(db);
    const voter = createUser(db, 'voter');
    db.prepare("INSERT INTO MedalVote (id, userId, entryId, medal, createdAt) VALUES (?, ?, ?, ?, datetime('now'))").run(
      'm1',
      voter.id,
      a.id,
      'BRONZE'
    );
    db.prepare("INSERT INTO MedalVote (id, userId, entryId, medal, createdAt) VALUES (?, ?, ?, ?, datetime('now'))").run(
      'm2',
      createUser(db, 'v2').id,
      b.id,
      'BRONZE'
    );

    const groups = podiumTieGroups(computeMedalStandings(db));
    expect(groups).toHaveLength(1);
    expect(groups[0].map((s) => s.entryId).sort()).toEqual([a.id, b.id].sort());
  });
});
```

(Add `computeMedalStandings` to the existing `import { computeStandings, podiumTieGroups } from './rankingService';` line at the top of the test file.)

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/services/rankingService.test.ts`
Expected: FAIL — `computeMedalStandings is not a function` / not exported.

- [ ] **Step 3: Write the implementation**

Replace the whole file with:

```ts
// server/src/services/rankingService.ts
import type Database from 'better-sqlite3';

export interface StandingEntry {
  entryId: string;
  number: number;
  name: string | null;
  creatorId: string;
  voteCount: number;
}

export interface Standing extends StandingEntry {
  rank: number;
}

interface RankedEntry {
  entryId: string;
  rank: number;
}

function assignCompetitionRank<T>(rows: T[], scoreOf: (row: T) => number): (T & { rank: number })[] {
  let rank = 0;
  let lastScore = -1;
  let seen = 0;
  const result: (T & { rank: number })[] = [];
  for (const row of rows) {
    seen += 1;
    const score = scoreOf(row);
    if (score !== lastScore) {
      rank = seen;
      lastScore = score;
    }
    result.push({ ...row, rank });
  }
  return result;
}

export function computeStandings(db: Database.Database): Standing[] {
  const rows = db
    .prepare(
      `SELECT e.id as entryId, e.number, e.name, e.creatorId, COUNT(v.id) as voteCount
       FROM Entry e
       LEFT JOIN Vote v ON v.entryId = e.id
       GROUP BY e.id
       ORDER BY voteCount DESC, e.number ASC`
    )
    .all() as StandingEntry[];

  return assignCompetitionRank(rows, (r) => r.voteCount);
}

export function podiumTieGroups<T extends RankedEntry>(standings: T[]): T[][] {
  const groups = new Map<number, T[]>();
  for (const s of standings) {
    if (s.rank > 3) continue;
    if (!groups.has(s.rank)) groups.set(s.rank, []);
    groups.get(s.rank)!.push(s);
  }
  return [...groups.entries()]
    .filter(([, members]) => members.length > 1)
    .sort(([rankA], [rankB]) => rankA - rankB)
    .map(([, members]) => members);
}

export interface MedalStandingEntry {
  entryId: string;
  number: number;
  name: string | null;
  creatorId: string;
  creatorName: string;
  gold: number;
  silver: number;
  bronze: number;
  total: number;
}

export interface MedalStanding extends MedalStandingEntry {
  rank: number;
}

export function computeMedalStandings(db: Database.Database): MedalStanding[] {
  const rows = db
    .prepare(
      `SELECT e.id as entryId, e.number, e.name, e.creatorId, u.name as creatorName,
         COALESCE(SUM(CASE WHEN mv.medal = 'GOLD' THEN 1 ELSE 0 END), 0) as gold,
         COALESCE(SUM(CASE WHEN mv.medal = 'SILVER' THEN 1 ELSE 0 END), 0) as silver,
         COALESCE(SUM(CASE WHEN mv.medal = 'BRONZE' THEN 1 ELSE 0 END), 0) as bronze,
         COALESCE(SUM(CASE mv.medal WHEN 'GOLD' THEN 5 WHEN 'SILVER' THEN 3 WHEN 'BRONZE' THEN 1 ELSE 0 END), 0) as total
       FROM Entry e
       JOIN User u ON u.id = e.creatorId
       LEFT JOIN MedalVote mv ON mv.entryId = e.id
       GROUP BY e.id
       ORDER BY total DESC, e.number ASC`
    )
    .all() as MedalStandingEntry[];

  return assignCompetitionRank(rows, (r) => r.total);
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/services/rankingService.test.ts`
Expected: PASS (5 tests: 3 existing + 2 new).

- [ ] **Step 5: Commit**

```bash
git add src/services/rankingService.ts src/services/rankingService.test.ts
git commit -m "Add computeMedalStandings and generalize podiumTieGroups"
```

---

### Task 3: `medalVoteService` — set/get a voter's medals

**Files:**
- Create: `server/src/services/medalVoteService.ts`
- Test: `server/src/services/medalVoteService.test.ts`

**Interfaces:**
- Consumes: `getContest` (`contestService`), `getEntryUnchecked` (`entryService`), `AppError`.
- Produces: `Medal` type, `MyMedals` interface, `getMyMedals(db, userId)`, `setMedal(db, userId, entryId, medal: Medal | null)`.

- [ ] **Step 1: Write the failing tests**

```ts
// server/src/services/medalVoteService.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import type Database from 'better-sqlite3';
import { createDb } from '../db/connection';
import { createUser } from './userService';
import { createEntry } from './entryService';
import { startContest, setAllowSelfVote } from './contestService';
import { getMyMedals, setMedal } from './medalVoteService';
import { AppError } from '../middleware/errors';

let db: Database.Database;
let voterId: string;
let entryIds: string[];

function setupEntriesFor(database: Database.Database, count: number, ownerName = 'owner') {
  const owner = createUser(database, ownerName);
  return Array.from({ length: count }, (_, i) =>
    createEntry(database, { creatorId: owner.id, name: `Entry ${i}`, description: null, imagePath: 'a.webp' }).id
  );
}

beforeEach(() => {
  db = createDb(':memory:');
  entryIds = setupEntriesFor(db, 5);
  voterId = createUser(db, 'Voter').id;
  startContest(db);
});

describe('medalVoteService', () => {
  it('starts with no medals assigned', () => {
    expect(getMyMedals(db, voterId)).toEqual({ gold: null, silver: null, bronze: null });
  });

  it('assigns one medal of each kind to different entries', () => {
    setMedal(db, voterId, entryIds[0], 'GOLD');
    setMedal(db, voterId, entryIds[1], 'SILVER');
    setMedal(db, voterId, entryIds[2], 'BRONZE');
    expect(getMyMedals(db, voterId)).toEqual({ gold: entryIds[0], silver: entryIds[1], bronze: entryIds[2] });
  });

  it('moves a medal from one entry to another', () => {
    setMedal(db, voterId, entryIds[0], 'GOLD');
    setMedal(db, voterId, entryIds[1], 'GOLD');
    expect(getMyMedals(db, voterId).gold).toBe(entryIds[1]);
  });

  it('replaces the medal already on an entry when a different one is chosen', () => {
    setMedal(db, voterId, entryIds[0], 'GOLD');
    setMedal(db, voterId, entryIds[0], 'SILVER');
    const medals = getMyMedals(db, voterId);
    expect(medals.gold).toBeNull();
    expect(medals.silver).toBe(entryIds[0]);
  });

  it('clears a medal when set to null', () => {
    setMedal(db, voterId, entryIds[0], 'GOLD');
    setMedal(db, voterId, entryIds[0], null);
    expect(getMyMedals(db, voterId)).toEqual({ gold: null, silver: null, bronze: null });
  });

  it('blocks self-vote by default', () => {
    const freshDb = createDb(':memory:');
    const [selfEntryId] = setupEntriesFor(freshDb, 1, 'self');
    const entry = freshDb.prepare('SELECT creatorId FROM Entry WHERE id = ?').get(selfEntryId) as {
      creatorId: string;
    };
    startContest(freshDb);
    expect(() => setMedal(freshDb, entry.creatorId, selfEntryId, 'GOLD')).toThrow(AppError);
  });

  it('allows self-vote when allowSelfVote is true', () => {
    const freshDb = createDb(':memory:');
    const [selfEntryId] = setupEntriesFor(freshDb, 1, 'self2');
    const entry = freshDb.prepare('SELECT creatorId FROM Entry WHERE id = ?').get(selfEntryId) as {
      creatorId: string;
    };
    setAllowSelfVote(freshDb, true);
    startContest(freshDb);
    expect(() => setMedal(freshDb, entry.creatorId, selfEntryId, 'GOLD')).not.toThrow();
  });

  it('blocks assigning a medal outside the VOTING phase', () => {
    db.prepare("UPDATE Contest SET phase = 'REGISTRATION' WHERE id = 1").run();
    expect(() => setMedal(db, voterId, entryIds[0], 'GOLD')).toThrow(AppError);
  });

  it('rejects a medal for an entry that does not exist', () => {
    expect(() => setMedal(db, voterId, 'nonexistent', 'GOLD')).toThrow(AppError);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/services/medalVoteService.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the implementation**

```ts
// server/src/services/medalVoteService.ts
import { randomUUID } from 'node:crypto';
import type Database from 'better-sqlite3';
import { AppError } from '../middleware/errors';
import { getContest } from './contestService';
import { getEntryUnchecked } from './entryService';

export type Medal = 'GOLD' | 'SILVER' | 'BRONZE';

export interface MyMedals {
  gold: string | null;
  silver: string | null;
  bronze: string | null;
}

export function getMyMedals(db: Database.Database, userId: string): MyMedals {
  const rows = db.prepare('SELECT entryId, medal FROM MedalVote WHERE userId = ?').all(userId) as {
    entryId: string;
    medal: Medal;
  }[];
  const result: MyMedals = { gold: null, silver: null, bronze: null };
  for (const row of rows) {
    if (row.medal === 'GOLD') result.gold = row.entryId;
    if (row.medal === 'SILVER') result.silver = row.entryId;
    if (row.medal === 'BRONZE') result.bronze = row.entryId;
  }
  return result;
}

export function setMedal(db: Database.Database, userId: string, entryId: string, medal: Medal | null): void {
  const contest = getContest(db);
  if (contest.phase !== 'VOTING') {
    throw new AppError(409, 'NOT_VOTING_PHASE', 'La votación no está abierta ahora mismo.');
  }
  if (medal !== null) {
    const entry = getEntryUnchecked(db, entryId);
    if (!entry) {
      throw new AppError(400, 'ENTRY_NOT_FOUND', 'Esa tapa no existe.');
    }
    if (!contest.allowSelfVote && entry.creatorId === userId) {
      throw new AppError(403, 'SELF_VOTE_FORBIDDEN', 'No puedes votar tu propio pincho.');
    }
  }
  const tx = db.transaction(() => {
    db.prepare('DELETE FROM MedalVote WHERE userId = ? AND entryId = ?').run(userId, entryId);
    if (medal !== null) {
      db.prepare('DELETE FROM MedalVote WHERE userId = ? AND medal = ?').run(userId, medal);
      db.prepare('INSERT INTO MedalVote (id, userId, entryId, medal, createdAt) VALUES (?, ?, ?, ?, ?)').run(
        randomUUID(),
        userId,
        entryId,
        medal,
        new Date().toISOString()
      );
    }
  });
  tx();
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/services/medalVoteService.test.ts`
Expected: PASS (9 tests).

- [ ] **Step 5: Commit**

```bash
git add src/services/medalVoteService.ts src/services/medalVoteService.test.ts
git commit -m "Add medalVoteService: set/get a voter's gold/silver/bronze picks"
```

---

### Task 4: `tiebreakService` — `kind`-aware rounds, `advance()` resolves both podiums

**Files:**
- Modify: `server/src/services/tiebreakService.ts`
- Modify test: `server/src/services/tiebreakService.test.ts` (add new tests; existing tests must keep passing unmodified since no existing call site's signature changes in a breaking way)

**Interfaces:**
- Consumes: `computeStandings`, `computeMedalStandings`, `podiumTieGroups` (`rankingService`, Task 2).
- Produces: `TiebreakKind` type, `TiebreakRound.kind` field, `openRound(db, targetRank, candidateEntryIds, kind = 'MAIN')`, `getResolvedWinner(db, kind, targetRank)`. `advance()` now resolves all `MAIN` podium ties before considering `MEDAL` ones. Task 5 depends on `getResolvedWinner`.

- [ ] **Step 1: Write the failing tests**

Add to `server/src/services/tiebreakService.test.ts` (keep every existing
test as-is; add these, plus the necessary new imports
`setMedal` from `./medalVoteService` and `computeMedalStandings` is not
needed directly here):

```ts
import { setMedal } from './medalVoteService';
// add alongside existing imports at the top of the file

describe('tiebreakService — medal podium (kind = MEDAL)', () => {
  it('advance() opens a MEDAL round when the medal podium is tied, after the main podium is clear', () => {
    const a = makeEntry('A');
    const b = makeEntry('B');
    startContest(db);
    const mainVoter = createUser(db, 'main-voter');
    addVote(db, mainVoter.id, a.id); // main podium: a=1 vote, unambiguous rank 1; b=0 -> rank 2, unambiguous
    const [v1, v2] = [createUser(db, 'v1'), createUser(db, 'v2')];
    setMedal(db, v1.id, a.id, 'GOLD');
    setMedal(db, v2.id, b.id, 'GOLD'); // medal podium: a and b tied at rank 1 (5 points each)

    const result = advance(db);
    expect(result.phase).toBe('TIEBREAK');
    expect(result.openedRound?.kind).toBe('MEDAL');
    expect(result.openedRound?.targetRank).toBe(1);
  });

  it('does not touch the medal podium while a MAIN tie is still open', () => {
    const a = makeEntry('A');
    const b = makeEntry('B');
    startContest(db);
    const [v1, v2] = [createUser(db, 'v1'), createUser(db, 'v2')];
    addVote(db, v1.id, a.id);
    addVote(db, v2.id, b.id); // main podium tied at rank 1
    setMedal(db, v1.id, a.id, 'GOLD');
    setMedal(db, v2.id, b.id, 'GOLD'); // medal podium also tied at rank 1

    const result = advance(db);
    expect(result.openedRound?.kind).toBe('MAIN');
  });

  it('a resolved MEDAL round lets advance() reach RESULTS once nothing else is tied', () => {
    const a = makeEntry('A');
    const b = makeEntry('B');
    startContest(db);
    const mainVoter = createUser(db, 'main-voter');
    addVote(db, mainVoter.id, a.id);
    const [v1, v2, v3] = [createUser(db, 'v1'), createUser(db, 'v2'), createUser(db, 'v3')];
    setMedal(db, v1.id, a.id, 'GOLD');
    setMedal(db, v2.id, b.id, 'GOLD');
    advance(db); // opens the MEDAL round for rank 1

    const roundId = getOpenRoundId(db)!;
    castVote(db, roundId, v1.id, a.id);
    castVote(db, roundId, v2.id, a.id);
    castVote(db, roundId, v3.id, b.id);
    const closeResult = closeRound(db, roundId);
    expect(closeResult.status).toBe('RESOLVED');

    const finalResult = advance(db);
    expect(finalResult.phase).toBe('RESULTS');
  });

  it('getResolvedWinner returns the winner of a closed round, or null if unresolved/absent', () => {
    const a = makeEntry('A');
    const b = makeEntry('B');
    startContest(db);
    const mainVoter = createUser(db, 'main-voter');
    addVote(db, mainVoter.id, a.id);
    const [v1, v2, v3] = [createUser(db, 'v1'), createUser(db, 'v2'), createUser(db, 'v3')];
    setMedal(db, v1.id, a.id, 'GOLD');
    setMedal(db, v2.id, b.id, 'GOLD');
    advance(db);
    expect(getResolvedWinner(db, 'MEDAL', 1)).toBeNull();

    const roundId = getOpenRoundId(db)!;
    castVote(db, roundId, v1.id, a.id);
    castVote(db, roundId, v2.id, a.id);
    castVote(db, roundId, v3.id, b.id);
    closeRound(db, roundId);
    expect(getResolvedWinner(db, 'MEDAL', 1)).toBe(a.id);
    expect(getResolvedWinner(db, 'MAIN', 1)).toBeNull();
  });
});
```

Also add `getResolvedWinner` to the existing
`import { advance, castVote, closeRound, getCurrentOpenRound, getOpenRoundId } from './tiebreakService';`
line at the top of the file.

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/services/tiebreakService.test.ts`
Expected: FAIL — `result.openedRound?.kind` is `undefined` /
`getResolvedWinner` not exported.

- [ ] **Step 3: Write the implementation**

Replace the whole file with:

```ts
// server/src/services/tiebreakService.ts
import { randomUUID } from 'node:crypto';
import type Database from 'better-sqlite3';
import { AppError } from '../middleware/errors';
import { getContest, setPhase } from './contestService';
import { computeStandings, podiumTieGroups, computeMedalStandings } from './rankingService';

export type TiebreakKind = 'MAIN' | 'MEDAL';

export interface TiebreakRound {
  id: string;
  roundNumber: number;
  targetRank: number;
  kind: TiebreakKind;
  status: 'OPEN' | 'CLOSED';
  createdAt: string;
  closedAt: string | null;
}

export interface EntrySummary {
  id: string;
  number: number;
  name: string | null;
  imagePath: string;
}

export function openRound(
  db: Database.Database,
  targetRank: number,
  candidateEntryIds: string[],
  kind: TiebreakKind = 'MAIN'
): TiebreakRound {
  const now = new Date().toISOString();
  const prevMax = db.prepare('SELECT MAX(roundNumber) as m FROM TiebreakRound').get() as { m: number | null };
  const roundNumber = (prevMax.m ?? 0) + 1;
  const id = randomUUID();
  const tx = db.transaction(() => {
    db.prepare(
      `INSERT INTO TiebreakRound (id, roundNumber, targetRank, kind, status, createdAt, closedAt)
       VALUES (?, ?, ?, ?, 'OPEN', ?, NULL)`
    ).run(id, roundNumber, targetRank, kind, now);
    const insertCandidate = db.prepare('INSERT INTO TiebreakCandidate (roundId, entryId) VALUES (?, ?)');
    for (const entryId of candidateEntryIds) {
      insertCandidate.run(id, entryId);
    }
    setPhase(db, 'TIEBREAK');
  });
  tx();
  return getRoundById(db, id)!;
}

export function getRoundById(db: Database.Database, id: string): TiebreakRound | undefined {
  return db.prepare('SELECT * FROM TiebreakRound WHERE id = ?').get(id) as TiebreakRound | undefined;
}

export function getOpenRoundId(db: Database.Database): string | null {
  const row = db
    .prepare("SELECT id FROM TiebreakRound WHERE status = 'OPEN' ORDER BY roundNumber DESC LIMIT 1")
    .get() as { id: string } | undefined;
  return row?.id ?? null;
}

export function getCandidateIds(db: Database.Database, roundId: string): string[] {
  const rows = db.prepare('SELECT entryId FROM TiebreakCandidate WHERE roundId = ?').all(roundId) as {
    entryId: string;
  }[];
  return rows.map((r) => r.entryId);
}

export function getCurrentOpenRound(
  db: Database.Database
): { round: TiebreakRound; candidates: EntrySummary[] } | null {
  const roundId = getOpenRoundId(db);
  if (!roundId) return null;
  const round = getRoundById(db, roundId)!;
  const candidates = db
    .prepare(
      `SELECT e.id, e.number, e.name, e.imagePath FROM TiebreakCandidate tc
       JOIN Entry e ON e.id = tc.entryId WHERE tc.roundId = ?`
    )
    .all(roundId) as EntrySummary[];
  return { round, candidates };
}

export function castVote(db: Database.Database, roundId: string, userId: string, entryId: string): void {
  const contest = getContest(db);
  if (contest.phase !== 'TIEBREAK') {
    throw new AppError(409, 'NOT_TIEBREAK_PHASE', 'El concurso no está en fase de desempate.');
  }
  const round = getRoundById(db, roundId);
  if (!round || round.status !== 'OPEN') {
    throw new AppError(409, 'ROUND_NOT_OPEN', 'Esta ronda de desempate ya no está abierta.');
  }
  const isCandidate = db
    .prepare('SELECT 1 FROM TiebreakCandidate WHERE roundId = ? AND entryId = ?')
    .get(roundId, entryId);
  if (!isCandidate) {
    throw new AppError(400, 'NOT_A_CANDIDATE', 'Esa tapa no participa en esta ronda de desempate.');
  }
  const tx = db.transaction(() => {
    const already = db.prepare('SELECT 1 FROM TiebreakVote WHERE roundId = ? AND userId = ?').get(roundId, userId);
    if (already) {
      throw new AppError(409, 'ALREADY_VOTED_ROUND', 'Ya has votado en esta ronda de desempate.');
    }
    db.prepare('INSERT INTO TiebreakVote (id, roundId, userId, entryId, createdAt) VALUES (?, ?, ?, ?, ?)').run(
      randomUUID(),
      roundId,
      userId,
      entryId,
      new Date().toISOString()
    );
  });
  tx();
}

export interface CloseRoundResult {
  status: 'RESOLVED' | 'STILL_TIED';
  winnerEntryId?: string;
  tiedEntryIds?: string[];
}

function tallyRound(db: Database.Database, roundId: string): { entryId: string; votes: number }[] {
  return db
    .prepare(
      'SELECT entryId, COUNT(*) as votes FROM TiebreakVote WHERE roundId = ? GROUP BY entryId ORDER BY votes DESC'
    )
    .all(roundId) as { entryId: string; votes: number }[];
}

export function closeRound(db: Database.Database, roundId: string): CloseRoundResult {
  const round = getRoundById(db, roundId);
  if (!round || round.status !== 'OPEN') {
    throw new AppError(409, 'ROUND_NOT_OPEN', 'Esta ronda ya está cerrada.');
  }
  const tally = tallyRound(db, roundId);

  const now = new Date().toISOString();
  db.prepare("UPDATE TiebreakRound SET status = 'CLOSED', closedAt = ? WHERE id = ?").run(now, roundId);

  if (tally.length === 0) {
    const candidates = getCandidateIds(db, roundId);
    openRound(db, round.targetRank, candidates, round.kind);
    return { status: 'STILL_TIED', tiedEntryIds: candidates };
  }

  const topVotes = tally[0].votes;
  const winners = tally.filter((t) => t.votes === topVotes).map((t) => t.entryId);

  if (winners.length > 1) {
    openRound(db, round.targetRank, winners, round.kind);
    return { status: 'STILL_TIED', tiedEntryIds: winners };
  }

  return { status: 'RESOLVED', winnerEntryId: winners[0] };
}

function isRankResolved(db: Database.Database, kind: TiebreakKind, targetRank: number): boolean {
  const lastRound = db
    .prepare('SELECT id, status FROM TiebreakRound WHERE targetRank = ? AND kind = ? ORDER BY roundNumber DESC LIMIT 1')
    .get(targetRank, kind) as { id: string; status: string } | undefined;
  if (!lastRound || lastRound.status !== 'CLOSED') return false;
  const tally = tallyRound(db, lastRound.id);
  if (tally.length === 0) return false;
  const top = tally[0].votes;
  return tally.filter((t) => t.votes === top).length === 1;
}

export function getResolvedWinner(db: Database.Database, kind: TiebreakKind, targetRank: number): string | null {
  const lastRound = db
    .prepare(
      "SELECT id FROM TiebreakRound WHERE targetRank = ? AND kind = ? AND status = 'CLOSED' ORDER BY roundNumber DESC LIMIT 1"
    )
    .get(targetRank, kind) as { id: string } | undefined;
  if (!lastRound) return null;
  const tally = tallyRound(db, lastRound.id);
  if (tally.length === 0) return null;
  const top = tally[0].votes;
  const winners = tally.filter((t) => t.votes === top);
  return winners.length === 1 ? winners[0].entryId : null;
}

export interface AdvanceResult {
  phase: 'TIEBREAK' | 'RESULTS';
  openedRound?: TiebreakRound;
}

function resolveGroups(
  db: Database.Database,
  kind: TiebreakKind,
  groups: { entryId: string; rank: number }[][]
): AdvanceResult | null {
  for (const group of groups) {
    const rank = group[0].rank;
    if (isRankResolved(db, kind, rank)) continue;
    if (getOpenRoundId(db)) {
      return { phase: 'TIEBREAK' };
    }
    const round = openRound(
      db,
      rank,
      group.map((g) => g.entryId),
      kind
    );
    return { phase: 'TIEBREAK', openedRound: round };
  }
  return null;
}

export function advance(db: Database.Database): AdvanceResult {
  const mainResult = resolveGroups(db, 'MAIN', podiumTieGroups(computeStandings(db)));
  if (mainResult) return mainResult;

  const medalResult = resolveGroups(db, 'MEDAL', podiumTieGroups(computeMedalStandings(db)));
  if (medalResult) return medalResult;

  setPhase(db, 'RESULTS');
  return { phase: 'RESULTS' };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/services/tiebreakService.test.ts`
Expected: PASS (all 8 existing tests + 4 new = 12).

- [ ] **Step 5: Run the full backend suite**

Run: `npm test`
Expected: PASS — this file is imported by `admin.routes.ts`; nothing else
changes shape for existing callers.

- [ ] **Step 6: Commit**

```bash
git add src/services/tiebreakService.ts src/services/tiebreakService.test.ts
git commit -m "Generalize tiebreakService to resolve both MAIN and MEDAL podium ties"
```

---

### Task 5: `medalResultsService` — final top-3 podium with tiebreak-aware ordering

**Files:**
- Create: `server/src/services/medalResultsService.ts`
- Test: `server/src/services/medalResultsService.test.ts`

**Interfaces:**
- Consumes: `computeMedalStandings` (Task 2), `getResolvedWinner` (Task 4).
- Produces: `MedalPodiumEntry` interface, `computeMedalPodium(db)`.

- [ ] **Step 1: Write the failing tests**

```ts
// server/src/services/medalResultsService.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import type Database from 'better-sqlite3';
import { createDb } from '../db/connection';
import { createUser } from './userService';
import { createEntry } from './entryService';
import { startContest } from './contestService';
import { setMedal } from './medalVoteService';
import { advance, castVote, closeRound, getOpenRoundId } from './tiebreakService';
import { addVote } from './voteService';
import { computeMedalPodium } from './medalResultsService';

let db: Database.Database;

function makeEntry(name: string) {
  const owner = createUser(db, `creator-of-${name}`);
  return createEntry(db, { creatorId: owner.id, name, description: null, imagePath: 'a.webp' });
}

beforeEach(() => {
  db = createDb(':memory:');
});

describe('computeMedalPodium', () => {
  it('returns the top 3 by total score, ranked GOLD/SILVER/BRONZE, when there is no tie', () => {
    const a = makeEntry('A');
    const b = makeEntry('B');
    const c = makeEntry('C');
    makeEntry('D');
    startContest(db);
    const v1 = createUser(db, 'v1');
    setMedal(db, v1.id, a.id, 'GOLD');
    setMedal(db, v1.id, b.id, 'SILVER');
    setMedal(db, v1.id, c.id, 'BRONZE');

    const podium = computeMedalPodium(db);
    expect(podium).toHaveLength(3);
    expect(podium[0]).toMatchObject({ rank: 1, entryId: a.id, medal: 'GOLD', total: 5 });
    expect(podium[1]).toMatchObject({ rank: 2, entryId: b.id, medal: 'SILVER', total: 3 });
    expect(podium[2]).toMatchObject({ rank: 3, entryId: c.id, medal: 'BRONZE', total: 1 });
    expect(podium[0].creatorName).toBe('creator-of-A');
  });

  it('places the resolved tiebreak winner ahead of the entry that lost that round', () => {
    const a = makeEntry('A');
    const b = makeEntry('B');
    startContest(db);
    const mainVoter = createUser(db, 'main-voter');
    addVote(db, mainVoter.id, a.id); // keeps the MAIN podium unambiguous so advance() reaches the MEDAL tie
    const [v1, v2, v3] = [createUser(db, 'v1'), createUser(db, 'v2'), createUser(db, 'v3')];
    setMedal(db, v1.id, a.id, 'GOLD');
    setMedal(db, v2.id, b.id, 'GOLD'); // tied at rank 1 on the medal podium

    advance(db);
    const roundId = getOpenRoundId(db)!;
    castVote(db, roundId, v1.id, a.id);
    castVote(db, roundId, v2.id, a.id);
    castVote(db, roundId, v3.id, b.id);
    closeRound(db, roundId);

    const podium = computeMedalPodium(db);
    expect(podium[0].entryId).toBe(a.id);
    expect(podium[0].medal).toBe('GOLD');
    expect(podium[1].entryId).toBe(b.id);
    expect(podium[1].medal).toBe('SILVER');
  });

  it('shows a still-unresolved tie in its original order without crashing', () => {
    const a = makeEntry('A');
    const b = makeEntry('B');
    startContest(db);
    const [v1, v2] = [createUser(db, 'v1'), createUser(db, 'v2')];
    setMedal(db, v1.id, a.id, 'GOLD');
    setMedal(db, v2.id, b.id, 'GOLD');

    const podium = computeMedalPodium(db);
    expect(podium.map((p) => p.entryId).sort()).toEqual([a.id, b.id].sort());
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/services/medalResultsService.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the implementation**

```ts
// server/src/services/medalResultsService.ts
import type Database from 'better-sqlite3';
import { computeMedalStandings, type MedalStanding } from './rankingService';
import { getResolvedWinner } from './tiebreakService';

export interface MedalPodiumEntry {
  rank: number;
  entryId: string;
  number: number;
  entryName: string | null;
  creatorName: string;
  medal: 'GOLD' | 'SILVER' | 'BRONZE';
  total: number;
}

const RANK_MEDAL: Record<number, 'GOLD' | 'SILVER' | 'BRONZE'> = { 1: 'GOLD', 2: 'SILVER', 3: 'BRONZE' };

export function computeMedalPodium(db: Database.Database): MedalPodiumEntry[] {
  const standings = computeMedalStandings(db);
  const top = standings.filter((s) => s.rank <= 3);

  const byRank = new Map<number, MedalStanding[]>();
  for (const s of top) {
    if (!byRank.has(s.rank)) byRank.set(s.rank, []);
    byRank.get(s.rank)!.push(s);
  }

  const ordered: MedalStanding[] = [];
  for (const rank of [...byRank.keys()].sort((a, b) => a - b)) {
    const group = byRank.get(rank)!;
    if (group.length === 1) {
      ordered.push(group[0]);
      continue;
    }
    const winnerId = getResolvedWinner(db, 'MEDAL', rank);
    const winner = winnerId ? group.find((g) => g.entryId === winnerId) : undefined;
    if (winner) {
      ordered.push(winner, ...group.filter((g) => g.entryId !== winnerId));
    } else {
      ordered.push(...group);
    }
  }

  return ordered.slice(0, 3).map((s, i) => ({
    rank: i + 1,
    entryId: s.entryId,
    number: s.number,
    entryName: s.name,
    creatorName: s.creatorName,
    medal: RANK_MEDAL[i + 1],
    total: s.total,
  }));
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/services/medalResultsService.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/services/medalResultsService.ts src/services/medalResultsService.test.ts
git commit -m "Add computeMedalPodium: tiebreak-aware top-3 medal ordering"
```

---

### Task 6: Routes — `/api/medal-votes`, admin scoreboard, cascade deletes

**Files:**
- Create: `server/src/routes/medalVotes.routes.ts`
- Modify: `server/src/index.ts` (mount the new router)
- Modify: `server/src/routes/admin.routes.ts` (add `GET /medal-votes`; add
  `MedalVote` cleanup to the existing entry/user delete transactions)

**Interfaces:**
- Consumes: `getMyMedals`, `setMedal` (Task 3), `computeMedalPodium` (Task 5), `computeMedalStandings` (Task 2), `getContest` (`contestService`).

- [ ] **Step 1: Write the failing test**

```ts
// server/src/routes/medalVotes.routes.test.ts
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import express from 'express';
import type { Server } from 'node:http';
import request from 'supertest';
import { createDb } from '../db/connection';
import * as dbModule from '../db';
import { medalVotesRouter } from './medalVotes.routes';
import { errorHandler } from '../middleware/errorHandler';
import { createUser } from '../services/userService';
import { createEntry } from '../services/entryService';
import { startContest } from '../services/contestService';

// This project's other route-level tests exercise services directly against
// :memory: (see server/src/services/*.test.ts) rather than HTTP — follow
// that same pattern here to avoid introducing `supertest` as a new
// dependency. Replace this file's approach with a direct service-level
// check instead:
```

Given this project's established testing convention (service-layer tests
against `:memory:`, no HTTP-level tests anywhere in the codebase — confirm
this by checking `server/package.json` has no `supertest` dependency and
no existing `*.routes.test.ts` file exists), **do not add `supertest`**.
Instead, write the actual test as a thin service-level check that the
route handlers exist and are wired correctly, verified via Task 8's E2E
curl smoke test at the end of this plan. Replace Step 1 above with:

- [ ] **Step 1 (revised): No new automated test for this task**

This task only wires already-tested service functions
(`getMyMedals`/`setMedal`/`computeMedalPodium`/`computeMedalStandings`)
into Express routes — the same pattern `votes.routes.ts` and
`admin.routes.ts` already use with zero dedicated route tests (the
service layer underneath is what's unit-tested). Verification for this
task happens via the manual E2E curl check in Task 18.

- [ ] **Step 2: Write the implementation**

```ts
// server/src/routes/medalVotes.routes.ts
import { Router } from 'express';
import { z } from 'zod';
import { db } from '../db';
import { userAuth } from '../middleware/userAuth';
import { asyncHandler } from '../middleware/asyncHandler';
import { AppError } from '../middleware/errors';
import { getContest } from '../services/contestService';
import { getMyMedals, setMedal } from '../services/medalVoteService';
import { computeMedalPodium } from '../services/medalResultsService';

const medalSchema = z.object({ medal: z.enum(['GOLD', 'SILVER', 'BRONZE']).nullable() });

export const medalVotesRouter = Router();

medalVotesRouter.get(
  '/me',
  userAuth,
  asyncHandler(async (req, res) => {
    res.json(getMyMedals(db, req.userId!));
  })
);

medalVotesRouter.put(
  '/:entryId',
  userAuth,
  asyncHandler(async (req, res) => {
    const { medal } = medalSchema.parse(req.body);
    setMedal(db, req.userId!, req.params.entryId, medal);
    res.json({ ok: true });
  })
);

medalVotesRouter.get(
  '/results',
  userAuth,
  asyncHandler(async (_req, res) => {
    const contest = getContest(db);
    if (contest.phase !== 'RESULTS' || !contest.resultsRevealedAt) {
      throw new AppError(409, 'RESULTS_NOT_READY', 'Los resultados todavía no se han mostrado.');
    }
    res.json({ revealedAt: contest.resultsRevealedAt, podium: computeMedalPodium(db) });
  })
);
```

In `server/src/index.ts`, add the import and mount line alongside the
existing routers:

```ts
import { medalVotesRouter } from './routes/medalVotes.routes';
// ...
app.use('/api/medal-votes', medalVotesRouter);
```

In `server/src/routes/admin.routes.ts`:

1. Add to the imports: `computeMedalStandings` from `'../services/rankingService'`.
2. Add a new route (near the other admin GETs):

```ts
adminRouter.get(
  '/medal-votes',
  asyncHandler(async (_req, res) => {
    const standings = computeMedalStandings(db);
    res.json(
      standings.map((s) => ({
        entryId: s.entryId,
        number: s.number,
        name: s.name,
        gold: s.gold,
        silver: s.silver,
        bronze: s.bronze,
        total: s.total,
      }))
    );
  })
);
```

3. In the existing `adminRouter.delete('/entries/:id', ...)` transaction,
   add one line so medal votes for a deleted entry don't dangle:

```ts
const tx = db.transaction((id: string) => {
  db.prepare('DELETE FROM TiebreakVote WHERE entryId = ?').run(id);
  db.prepare('DELETE FROM TiebreakCandidate WHERE entryId = ?').run(id);
  db.prepare('DELETE FROM Vote WHERE entryId = ?').run(id);
  db.prepare('DELETE FROM MedalVote WHERE entryId = ?').run(id); // new line
  db.prepare('DELETE FROM Entry WHERE id = ?').run(id);
});
```

4. In the existing `adminRouter.delete('/users/:id', ...)` transaction,
   add two lines (one for medals the user cast, mirroring the existing
   per-entry loop; one for medals the user's own entries received):

```ts
const tx = db.transaction((id: string) => {
  for (const entry of ownEntries) {
    db.prepare('DELETE FROM TiebreakVote WHERE entryId = ?').run(entry.id);
    db.prepare('DELETE FROM TiebreakCandidate WHERE entryId = ?').run(entry.id);
    db.prepare('DELETE FROM Vote WHERE entryId = ?').run(entry.id);
    db.prepare('DELETE FROM MedalVote WHERE entryId = ?').run(entry.id); // new line
  }
  db.prepare('DELETE FROM Entry WHERE creatorId = ?').run(id);
  db.prepare('DELETE FROM Vote WHERE userId = ?').run(id);
  db.prepare('DELETE FROM TiebreakVote WHERE userId = ?').run(id);
  db.prepare('DELETE FROM MedalVote WHERE userId = ?').run(id); // new line
  const result = db.prepare('DELETE FROM User WHERE id = ?').run(id);
  if (result.changes === 0) {
    throw new AppError(404, 'USER_NOT_FOUND', 'No existe ese participante.');
  }
});
```

- [ ] **Step 3: Run the full backend suite**

Run: `npm test`
Expected: PASS (still all previous tests — this task adds no new test
file, per Step 1's revision).

- [ ] **Step 4: Run typecheck and lint**

Run: `npm run build && npm run lint`
Expected: both clean.

- [ ] **Step 5: Commit**

```bash
git add src/routes/medalVotes.routes.ts src/index.ts src/routes/admin.routes.ts
git commit -m "Add medal-votes routes, admin scoreboard endpoint, cascade deletes"
```

---

### Task 7: Frontend `api.ts` — add `put()`

**Files:**
- Modify: `frontend/src/services/api.ts`
- Modify test: `frontend/src/services/api.test.ts`

- [ ] **Step 1: Write the failing test**

Add to `frontend/src/services/api.test.ts`:

```ts
it('sends a JSON body and Content-Type on put()', async () => {
  const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({ ok: true }) });
  vi.stubGlobal('fetch', fetchMock);

  await api.put('/api/medal-votes/e1', { medal: 'GOLD' });

  const [url, options] = fetchMock.mock.calls[0];
  expect(url).toBe('/api/medal-votes/e1');
  expect(options.method).toBe('PUT');
  expect((options.headers as Headers).get('Content-Type')).toBe('application/json');
  expect(options.body).toBe(JSON.stringify({ medal: 'GOLD' }));
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/services/api.test.ts`
Expected: FAIL — `api.put is not a function`.

- [ ] **Step 3: Write the implementation**

In `frontend/src/services/api.ts`, add `put` to the exported `api` object:

```ts
export const api = {
  get: <T>(path: string) => request<T>(path),
  post: <T>(path: string, json?: unknown) => request<T>(path, { method: 'POST', json }),
  put: <T>(path: string, json?: unknown) => request<T>(path, { method: 'PUT', json }),
  postForm: <T>(path: string, form: FormData) => requestForm<T>(path, form),
  patch: <T>(path: string, json?: unknown) => request<T>(path, { method: 'PATCH', json }),
  delete: <T>(path: string) => request<T>(path, { method: 'DELETE' }),
};
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/services/api.test.ts`
Expected: PASS (all existing + 1 new).

- [ ] **Step 5: Commit**

```bash
git add src/services/api.ts src/services/api.test.ts
git commit -m "Add api.put()"
```

---

### Task 8: Design tokens — silver and bronze colors

**Files:**
- Modify: `frontend/src/styles/tokens.css`

No test — this is a pure CSS token addition, same category as the
existing `--color-gold`/`--color-danger` tokens (no dedicated test exists
for those either).

- [ ] **Step 1: Add the tokens**

In `frontend/src/styles/tokens.css`, add two lines next to the existing
`--color-gold` in the `:root` block:

```css
--color-silver: #9aa0a6;
--color-bronze: #b06a35;
```

And in the `@media (prefers-color-scheme: dark)` block, add slightly
brighter variants for dark-mode contrast (matching how `--color-border`
etc. get dark overrides there):

```css
--color-silver: #c2c7cc;
--color-bronze: #cd8a52;
```

- [ ] **Step 2: Commit**

```bash
git add src/styles/tokens.css
git commit -m "Add --color-silver and --color-bronze design tokens"
```

---

### Task 9: `medalVotes` store

**Files:**
- Create: `frontend/src/stores/medalVotes.ts`
- Test: `frontend/src/stores/medalVotes.test.ts`

**Interfaces:**
- Consumes: `api.get/put` (Task 7), `ApiError`.
- Produces: `Medal` type, `useMedalVotesStore()` returning
  `{ gold, silver, bronze, loaded, error, medalFor(entryId), init(), setMedal(entryId, medal) }`.
  Task 10 depends on these exact names.

- [ ] **Step 1: Write the failing tests**

```ts
// frontend/src/stores/medalVotes.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { setActivePinia, createPinia } from 'pinia';

vi.mock('../services/api', async () => {
  const actual = await vi.importActual<typeof import('../services/api')>('../services/api');
  return { ...actual, api: { ...actual.api, get: vi.fn(), put: vi.fn() } };
});

import { api, ApiError } from '../services/api';
import { useMedalVotesStore } from './medalVotes';

beforeEach(() => {
  setActivePinia(createPinia());
  vi.clearAllMocks();
});

describe('useMedalVotesStore', () => {
  it('starts unloaded with no medals assigned', () => {
    const store = useMedalVotesStore();
    expect(store.loaded).toBe(false);
    expect(store.gold).toBeNull();
    expect(store.medalFor('e1')).toBeNull();
  });

  it('init loads the current medals from the server', async () => {
    vi.mocked(api.get).mockResolvedValue({ gold: 'e1', silver: null, bronze: 'e2' });
    const store = useMedalVotesStore();

    await store.init();

    expect(api.get).toHaveBeenCalledWith('/api/medal-votes/me');
    expect(store.loaded).toBe(true);
    expect(store.medalFor('e1')).toBe('GOLD');
    expect(store.medalFor('e2')).toBe('BRONZE');
    expect(store.medalFor('e3')).toBeNull();
  });

  it('init only fetches once even if called twice', async () => {
    vi.mocked(api.get).mockResolvedValue({ gold: null, silver: null, bronze: null });
    const store = useMedalVotesStore();
    await store.init();
    await store.init();
    expect(api.get).toHaveBeenCalledTimes(1);
  });

  it('setMedal assigns a medal optimistically and confirms via PUT', async () => {
    vi.mocked(api.get).mockResolvedValue({ gold: null, silver: null, bronze: null });
    vi.mocked(api.put).mockResolvedValue({ ok: true });
    const store = useMedalVotesStore();
    await store.init();

    await store.setMedal('e1', 'GOLD');

    expect(api.put).toHaveBeenCalledWith('/api/medal-votes/e1', { medal: 'GOLD' });
    expect(store.medalFor('e1')).toBe('GOLD');
    expect(store.error).toBeNull();
  });

  it('setMedal moves a medal away from its previous entry', async () => {
    vi.mocked(api.get).mockResolvedValue({ gold: 'e1', silver: null, bronze: null });
    vi.mocked(api.put).mockResolvedValue({ ok: true });
    const store = useMedalVotesStore();
    await store.init();

    await store.setMedal('e2', 'GOLD');

    expect(store.medalFor('e1')).toBeNull();
    expect(store.medalFor('e2')).toBe('GOLD');
  });

  it('setMedal(entryId, null) clears the medal', async () => {
    vi.mocked(api.get).mockResolvedValue({ gold: 'e1', silver: null, bronze: null });
    vi.mocked(api.put).mockResolvedValue({ ok: true });
    const store = useMedalVotesStore();
    await store.init();

    await store.setMedal('e1', null);

    expect(store.medalFor('e1')).toBeNull();
  });

  it('reverts the optimistic change and surfaces the error on failure', async () => {
    vi.mocked(api.get).mockResolvedValue({ gold: null, silver: null, bronze: null });
    vi.mocked(api.put).mockRejectedValue(new ApiError(409, 'NOT_VOTING_PHASE', 'La votación no está abierta ahora mismo.'));
    const store = useMedalVotesStore();
    await store.init();

    await store.setMedal('e1', 'GOLD');

    expect(store.medalFor('e1')).toBeNull();
    expect(store.error).toBe('La votación no está abierta ahora mismo.');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/stores/medalVotes.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the implementation**

```ts
// frontend/src/stores/medalVotes.ts
import { ref } from 'vue';
import { defineStore } from 'pinia';
import { api, ApiError } from '../services/api';

export type Medal = 'GOLD' | 'SILVER' | 'BRONZE';

interface MyMedalsResponse {
  gold: string | null;
  silver: string | null;
  bronze: string | null;
}

export const useMedalVotesStore = defineStore('medalVotes', () => {
  const gold = ref<string | null>(null);
  const silver = ref<string | null>(null);
  const bronze = ref<string | null>(null);
  const loaded = ref(false);
  const error = ref<string | null>(null);

  function medalFor(entryId: string): Medal | null {
    if (gold.value === entryId) return 'GOLD';
    if (silver.value === entryId) return 'SILVER';
    if (bronze.value === entryId) return 'BRONZE';
    return null;
  }

  async function init(): Promise<void> {
    if (loaded.value) return;
    const data = await api.get<MyMedalsResponse>('/api/medal-votes/me');
    gold.value = data.gold;
    silver.value = data.silver;
    bronze.value = data.bronze;
    loaded.value = true;
  }

  async function setMedal(entryId: string, medal: Medal | null): Promise<void> {
    error.value = null;
    const prev = { gold: gold.value, silver: silver.value, bronze: bronze.value };

    if (gold.value === entryId) gold.value = null;
    if (silver.value === entryId) silver.value = null;
    if (bronze.value === entryId) bronze.value = null;
    if (medal === 'GOLD') gold.value = entryId;
    if (medal === 'SILVER') silver.value = entryId;
    if (medal === 'BRONZE') bronze.value = entryId;

    try {
      await api.put(`/api/medal-votes/${entryId}`, { medal });
    } catch (err) {
      gold.value = prev.gold;
      silver.value = prev.silver;
      bronze.value = prev.bronze;
      error.value = err instanceof ApiError ? err.message : 'No hemos podido guardar tu voto.';
    }
  }

  return { gold, silver, bronze, loaded, error, medalFor, init, setMedal };
});
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/stores/medalVotes.test.ts`
Expected: PASS (7 tests).

- [ ] **Step 5: Commit**

```bash
git add src/stores/medalVotes.ts src/stores/medalVotes.test.ts
git commit -m "Add medalVotes store"
```

---

### Task 10: `MedalButtons` component

**Files:**
- Create: `frontend/src/components/entries/MedalButtons.vue`
- Test: `frontend/src/components/entries/MedalButtons.test.ts`

**Interfaces:**
- Consumes: `useMedalVotesStore()` (Task 9).
- Props: `entryId: string` (required), `disabled?: boolean`, `disabledReason?: string` — same shape as `FavoriteButton.vue` (Fase E) for consistency.

- [ ] **Step 1: Write the failing tests**

```ts
// frontend/src/components/entries/MedalButtons.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import { setActivePinia, createPinia } from 'pinia';
import MedalButtons from './MedalButtons.vue';

vi.mock('../../services/api', async () => {
  const actual = await vi.importActual<typeof import('../../services/api')>('../../services/api');
  return { ...actual, api: { ...actual.api, get: vi.fn(), put: vi.fn() } };
});

import { api } from '../../services/api';

beforeEach(() => {
  setActivePinia(createPinia());
  vi.clearAllMocks();
  vi.mocked(api.get).mockResolvedValue({ gold: null, silver: null, bronze: null });
});

describe('MedalButtons', () => {
  it('shows the three medal buttons, none active', () => {
    const wrapper = mount(MedalButtons, { props: { entryId: 'e1' } });
    const buttons = wrapper.findAll('button');
    expect(buttons).toHaveLength(3);
    expect(wrapper.text()).toContain('Oro');
    expect(wrapper.text()).toContain('Plata');
    expect(wrapper.text()).toContain('Bronce');
    expect(wrapper.find('.medal-buttons__button--active').exists()).toBe(false);
  });

  it('assigns GOLD when the gold button is clicked', async () => {
    vi.mocked(api.put).mockResolvedValue({ ok: true });
    const wrapper = mount(MedalButtons, { props: { entryId: 'e1' } });

    await wrapper.findAll('button')[0].trigger('click');
    await flushPromises();

    expect(api.put).toHaveBeenCalledWith('/api/medal-votes/e1', { medal: 'GOLD' });
    expect(wrapper.find('.medal-buttons__button--gold.medal-buttons__button--active').exists()).toBe(true);
  });

  it('clears the medal when its active button is clicked again', async () => {
    vi.mocked(api.put).mockResolvedValue({ ok: true });
    const wrapper = mount(MedalButtons, { props: { entryId: 'e1' } });
    await wrapper.findAll('button')[0].trigger('click');
    await flushPromises();

    await wrapper.findAll('button')[0].trigger('click');
    await flushPromises();

    expect(api.put).toHaveBeenLastCalledWith('/api/medal-votes/e1', { medal: null });
    expect(wrapper.find('.medal-buttons__button--active').exists()).toBe(false);
  });

  it('shows the disabled reason instead of buttons when disabled', () => {
    const wrapper = mount(MedalButtons, {
      props: { entryId: 'e1', disabled: true, disabledReason: 'No puedes puntuar tu propio pincho.' },
    });
    expect(wrapper.find('button').exists()).toBe(false);
    expect(wrapper.text()).toContain('No puedes puntuar tu propio pincho.');
  });

  it('shows the store error message after a failed choice', async () => {
    vi.mocked(api.put).mockRejectedValue(new Error('boom'));
    const wrapper = mount(MedalButtons, { props: { entryId: 'e1' } });

    await wrapper.findAll('button')[0].trigger('click');
    await flushPromises();

    expect(wrapper.text()).toContain('No hemos podido guardar tu voto.');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/components/entries/MedalButtons.test.ts`
Expected: FAIL — component file doesn't exist.

- [ ] **Step 3: Write the implementation**

```vue
<!-- frontend/src/components/entries/MedalButtons.vue -->
<script setup lang="ts">
import { computed } from 'vue';
import { Medal as MedalIcon } from '@lucide/vue';
import { useMedalVotesStore, type Medal } from '../../stores/medalVotes';

const props = withDefaults(
  defineProps<{ entryId: string; disabled?: boolean; disabledReason?: string }>(),
  { disabled: false, disabledReason: '' }
);

const medals = useMedalVotesStore();
const current = computed(() => medals.medalFor(props.entryId));

const OPTIONS: { medal: Medal; label: string }[] = [
  { medal: 'GOLD', label: 'Oro' },
  { medal: 'SILVER', label: 'Plata' },
  { medal: 'BRONZE', label: 'Bronce' },
];

async function choose(medal: Medal): Promise<void> {
  const next = current.value === medal ? null : medal;
  await medals.setMedal(props.entryId, next);
}
</script>

<template>
  <div class="medal-buttons">
    <p
      v-if="disabled"
      class="medal-buttons__reason"
    >
      {{ disabledReason }}
    </p>
    <div
      v-else
      class="medal-buttons__group"
    >
      <button
        v-for="option in OPTIONS"
        :key="option.medal"
        type="button"
        class="medal-buttons__button"
        :class="[
          `medal-buttons__button--${option.medal.toLowerCase()}`,
          { 'medal-buttons__button--active': current === option.medal },
        ]"
        @click="choose(option.medal)"
      >
        <MedalIcon
          :size="18"
          aria-hidden="true"
        />
        {{ option.label }}
      </button>
    </div>
    <p
      v-if="medals.error"
      class="medal-buttons__error"
    >
      {{ medals.error }}
    </p>
  </div>
</template>

<style scoped>
.medal-buttons__group {
  display: flex;
  gap: var(--space-2);
  flex-wrap: wrap;
}

.medal-buttons__button {
  display: inline-flex;
  align-items: center;
  gap: var(--space-2);
  min-height: 44px;
  padding: 0 var(--space-3);
  border-radius: var(--radius-md);
  background: var(--color-surface);
  font-weight: 600;
  cursor: pointer;
  border: 2px solid transparent;
}

.medal-buttons__button--gold {
  border-color: var(--color-gold);
  color: var(--color-gold);
}

.medal-buttons__button--silver {
  border-color: var(--color-silver);
  color: var(--color-silver);
}

.medal-buttons__button--bronze {
  border-color: var(--color-bronze);
  color: var(--color-bronze);
}

.medal-buttons__button--active {
  color: var(--color-primary-contrast);
}

.medal-buttons__button--gold.medal-buttons__button--active {
  background: var(--color-gold);
}

.medal-buttons__button--silver.medal-buttons__button--active {
  background: var(--color-silver);
}

.medal-buttons__button--bronze.medal-buttons__button--active {
  background: var(--color-bronze);
}

.medal-buttons__reason {
  color: var(--color-text-muted);
  font-size: 0.9rem;
}

.medal-buttons__error {
  color: var(--color-danger);
  font-size: 0.9rem;
  margin-top: var(--space-2);
}
</style>
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/components/entries/MedalButtons.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add src/components/entries/MedalButtons.vue src/components/entries/MedalButtons.test.ts
git commit -m "Add MedalButtons component"
```

---

### Task 11: Wire `MedalButtons` into `EntryDetailView`

**Files:**
- Modify: `frontend/src/views/EntryDetailView.vue`
- Modify test: `frontend/src/views/EntryDetailView.test.ts`

**Behavior added:** on mount, also call `medals.init()` (caught silently,
same as `votes.init()`). Inside the existing `v-if="canVote"` block (which
already gates the favorites UI to the `VOTING` phase), render
`<MedalButtons>` right after `<FavoriteButton>`, with the same
`selfVoteBlocked` / `disabledReason` props already computed for the
favorite button.

- [ ] **Step 1: Write the failing test**

Add to `frontend/src/views/EntryDetailView.test.ts`. Extend the existing
`vi.mock('../services/api', ...)` factory to also stub `put: vi.fn()`, and
extend the `mockImplementation` branches used by the VOTING-phase tests to
also answer `/api/medal-votes/me`:

```ts
// Update the api mock factory to include put:
vi.mock('../services/api', async () => {
  const actual = await vi.importActual<typeof import('../services/api')>('../services/api');
  return { ...actual, api: { ...actual.api, get: vi.fn(), post: vi.fn(), put: vi.fn(), delete: vi.fn() } };
});

// Update the existing mockImplementation calls in the VOTING-phase tests
// ('shows the favorite button and counter during VOTING',
// 'disables voting on your own entry...') to also branch on medal-votes:
vi.mocked(api.get).mockImplementation((path: string) => {
  if (path === '/api/votes/me') return Promise.resolve({ entryIds: [], limit: 3 });
  if (path === '/api/medal-votes/me') return Promise.resolve({ gold: null, silver: null, bronze: null });
  return Promise.resolve(mockEntry());
});

// New test:
it('shows the medal buttons during VOTING', async () => {
  vi.mocked(api.get).mockImplementation((path: string) => {
    if (path === '/api/votes/me') return Promise.resolve({ entryIds: [], limit: 3 });
    if (path === '/api/medal-votes/me') return Promise.resolve({ gold: null, silver: null, bronze: null });
    return Promise.resolve(mockEntry());
  });
  useContestStore().phase = 'VOTING';
  useSessionStore().user = { id: 'me', name: 'Yo' };
  const wrapper = mount(EntryDetailView);
  await flushPromises();

  expect(wrapper.text()).toContain('Oro');
  expect(wrapper.text()).toContain('Plata');
  expect(wrapper.text()).toContain('Bronce');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/views/EntryDetailView.test.ts`
Expected: FAIL — "Oro"/"Plata"/"Bronce" not found in the rendered output.

- [ ] **Step 3: Write the implementation**

In `frontend/src/views/EntryDetailView.vue`:

```ts
// add these two lines near the other store imports
import { useMedalVotesStore } from '../stores/medalVotes';
import MedalButtons from '../components/entries/MedalButtons.vue';

// add alongside the existing `const votes = useVotesStore();`
const medals = useMedalVotesStore();
```

```ts
// change the existing onMounted to also init medals:
onMounted(() => {
  load();
  votes.init().catch(() => {
    // un fallo al cargar los favoritos no debe bloquear la vista de la tapa
  });
  medals.init().catch(() => {
    // un fallo al cargar las medallas no debe bloquear la vista de la tapa
  });
});
```

```html
<!-- inside the existing <div v-if="canVote" class="entry-detail__voting">, right after <FavoriteButton ... /> -->
<MedalButtons
  :entry-id="entry.id"
  :disabled="selfVoteBlocked"
  disabled-reason="No puedes puntuar tu propio pincho."
/>
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/views/EntryDetailView.test.ts`
Expected: PASS (all previous + 1 new).

- [ ] **Step 5: Commit**

```bash
git add src/views/EntryDetailView.vue src/views/EntryDetailView.test.ts
git commit -m "Wire MedalButtons into EntryDetailView"
```

---

### Task 12: Router — tiebreak, medal podium and admin-medal-votes routes

**Files:**
- Modify: `frontend/src/router/index.ts`
- Modify test: `frontend/src/router/index.test.ts`

**Interfaces:**
- Produces routes named `tiebreak` (`/desempate`), `medal-results`
  (`/pinch-o-vision`), `admin-medal-votes` (`/admin/pinch-o-vision`).
  Tasks 13, 14 and 17 point their `component:` imports at these exact
  names.

- [ ] **Step 1: Write the failing tests**

Add to `frontend/src/router/index.test.ts`:

```ts
it('lets a registered visitor reach /pinch-o-vision once voting has started', async () => {
  useSessionStore().user = { id: 'u1', name: 'Laura' };
  useContestStore().phase = 'VOTING';
  await router.push('/pinch-o-vision');
  expect(router.currentRoute.value.name).toBe('medal-results');
});

it('blocks an anonymous visitor from /pinch-o-vision and /desempate', async () => {
  for (const path of ['/pinch-o-vision', '/desempate']) {
    await router.push(path);
    expect(router.currentRoute.value.name).toBe('welcome');
  }
});

it('redirects a registered visitor from the gallery to /desempate when a tiebreak round opens', async () => {
  useSessionStore().user = { id: 'u1', name: 'Laura' };
  useContestStore().phase = 'VOTING';
  await router.push('/galeria');
  useContestStore().phase = 'TIEBREAK';
  await router.push('/galeria');
  expect(router.currentRoute.value.name).toBe('tiebreak');
});

it('redirects away from /desempate back to the gallery once the tiebreak is over', async () => {
  useSessionStore().user = { id: 'u1', name: 'Laura' };
  useContestStore().phase = 'TIEBREAK';
  await router.push('/desempate');
  expect(router.currentRoute.value.name).toBe('tiebreak');
  useContestStore().phase = 'RESULTS';
  await router.push('/desempate');
  expect(router.currentRoute.value.name).toBe('gallery');
});

it('blocks an unauthenticated visitor from /admin/pinch-o-vision', async () => {
  await router.push('/admin/pinch-o-vision');
  expect(router.currentRoute.value.name).toBe('admin-login');
});

it('lets an authenticated admin reach /admin/pinch-o-vision', async () => {
  useAdminAuthStore().pin = '1234';
  await router.push('/admin/pinch-o-vision');
  expect(router.currentRoute.value.name).toBe('admin-medal-votes');
});
```

Also update the existing
`'blocks an unauthenticated visitor from every admin route except /admin'`
and `'lets an authenticated admin reach every admin route'` tests' path
lists to include `/admin/pinch-o-vision` / `'admin-medal-votes'` — read
the current test bodies (Task 12 Step 1 above shows the exact current
lines) before editing them, since editing must preserve every other path
in those two loops unchanged.

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/router/index.test.ts`
Expected: FAIL — new routes don't exist yet.

- [ ] **Step 3: Write the implementation**

```ts
// frontend/src/router/index.ts
import { createRouter, createWebHistory } from 'vue-router';
import { useSessionStore } from '../stores/session';
import { useContestStore } from '../stores/contest';
import { useAdminAuthStore } from '../stores/adminAuth';

const SESSION_REQUIRED_ROUTES = [
  'has-entry',
  'new-entry',
  'entry-confirmation',
  'waiting-room',
  'gallery',
  'entry-detail',
  'tiebreak',
  'medal-results',
];
const REGISTRATION_ONLY_ROUTES = ['has-entry', 'new-entry'];
const GALLERY_ROUTES = ['gallery', 'entry-detail'];
const ADMIN_ROUTES = [
  'admin-dashboard',
  'admin-participants',
  'admin-entries',
  'admin-phases',
  'admin-medal-votes',
];

export const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/', name: 'welcome', component: () => import('../views/WelcomeView.vue') },
    { path: '/registro', name: 'register', component: () => import('../views/RegisterUserView.vue') },
    { path: '/pincho', name: 'has-entry', component: () => import('../views/HasEntryQuestionView.vue') },
    { path: '/pincho/nuevo', name: 'new-entry', component: () => import('../views/NewEntryView.vue') },
    {
      path: '/pincho/confirmacion/:number',
      name: 'entry-confirmation',
      component: () => import('../views/EntryConfirmationView.vue'),
    },
    { path: '/esperando', name: 'waiting-room', component: () => import('../views/WaitingRoomView.vue') },
    { path: '/galeria', name: 'gallery', component: () => import('../views/GalleryView.vue') },
    { path: '/galeria/:id', name: 'entry-detail', component: () => import('../views/EntryDetailView.vue') },
    { path: '/desempate', name: 'tiebreak', component: () => import('../views/TiebreakVoteView.vue') },
    { path: '/pinch-o-vision', name: 'medal-results', component: () => import('../views/MedalPodiumView.vue') },
    { path: '/admin', name: 'admin-login', component: () => import('../views/admin/AdminLoginView.vue') },
    {
      path: '/admin/dashboard',
      name: 'admin-dashboard',
      component: () => import('../views/admin/AdminDashboardView.vue'),
    },
    {
      path: '/admin/participantes',
      name: 'admin-participants',
      component: () => import('../views/admin/AdminParticipantsView.vue'),
    },
    { path: '/admin/tapas', name: 'admin-entries', component: () => import('../views/admin/AdminEntriesView.vue') },
    { path: '/admin/fases', name: 'admin-phases', component: () => import('../views/admin/AdminPhasesView.vue') },
    {
      path: '/admin/pinch-o-vision',
      name: 'admin-medal-votes',
      component: () => import('../views/admin/AdminMedalVotesView.vue'),
    },
  ],
});

router.beforeEach((to) => {
  const session = useSessionStore();
  const contest = useContestStore();
  const name = to.name as string;

  if (SESSION_REQUIRED_ROUTES.includes(name) && !session.user) {
    return { name: 'welcome' };
  }

  const registrationOpen = contest.phase === 'REGISTRATION';

  if ((name === 'welcome' || name === 'register') && session.user) {
    return registrationOpen ? { name: 'has-entry' } : { name: 'gallery' };
  }

  if (REGISTRATION_ONLY_ROUTES.includes(name) && !registrationOpen) {
    return { name: 'gallery' };
  }

  if (name === 'waiting-room' && !registrationOpen) {
    return { name: 'gallery' };
  }

  if (GALLERY_ROUTES.includes(name) && registrationOpen) {
    return { name: 'waiting-room' };
  }

  const isTiebreak = contest.phase === 'TIEBREAK';
  if (GALLERY_ROUTES.includes(name) && isTiebreak) {
    return { name: 'tiebreak' };
  }
  if (name === 'tiebreak' && !isTiebreak) {
    return { name: 'gallery' };
  }

  const adminAuth = useAdminAuthStore();
  if (ADMIN_ROUTES.includes(name) && !adminAuth.pin) {
    return { name: 'admin-login' };
  }
  if (name === 'admin-login' && adminAuth.pin) {
    return { name: 'admin-dashboard' };
  }
});
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/router/index.test.ts`
Expected: FAIL at this point — `TiebreakVoteView.vue`,
`MedalPodiumView.vue` and `AdminMedalVotesView.vue` don't exist yet, so
Vite's import-analysis will refuse to resolve the dynamic imports (the
exact same constraint hit during the Fase F admin panel work). **Do not
try to fix this by editing the router further** — proceed to Tasks 13, 14
and 17 to create those three view files, then return here and re-run this
command. Only commit this task once the view files exist and this
command passes.

- [ ] **Step 5: Commit** (after Tasks 13, 14 and 17 are done)

```bash
git add src/router/index.ts src/router/index.test.ts
git commit -m "Add tiebreak, medal-results and admin-medal-votes routes"
```

---

### Task 13: `TiebreakVoteView` (generic, kind-aware)

**Files:**
- Create: `frontend/src/views/TiebreakVoteView.vue`
- Test: `frontend/src/views/TiebreakVoteView.test.ts`

**Interfaces:**
- Consumes: `GET /api/tiebreak/current` (existing backend endpoint —
  response now includes `round.kind` thanks to Task 4's schema/service
  change), `POST /api/tiebreak/vote` (existing, unchanged).

- [ ] **Step 1: Write the failing tests**

```ts
// frontend/src/views/TiebreakVoteView.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';

vi.mock('../services/api', async () => {
  const actual = await vi.importActual<typeof import('../services/api')>('../services/api');
  return { ...actual, api: { ...actual.api, get: vi.fn(), post: vi.fn() } };
});

import { api } from '../services/api';
import TiebreakVoteView from './TiebreakVoteView.vue';

beforeEach(() => {
  vi.clearAllMocks();
});

describe('TiebreakVoteView', () => {
  it('shows a loading state initially', async () => {
    vi.mocked(api.get).mockReturnValue(new Promise(() => {}));
    const wrapper = mount(TiebreakVoteView);
    await flushPromises();
    expect(wrapper.text()).toContain('Cargando');
  });

  it('shows the main-contest label and candidates for a MAIN round', async () => {
    vi.mocked(api.get).mockResolvedValue({
      round: { id: 'r1', targetRank: 2, kind: 'MAIN', status: 'OPEN' },
      candidates: [
        { id: 'e1', number: 3, name: 'Croqueta', imagePath: 'a.webp' },
        { id: 'e2', number: 5, name: null, imagePath: 'b.webp' },
      ],
    });
    const wrapper = mount(TiebreakVoteView);
    await flushPromises();

    expect(wrapper.text()).toContain('Desempate del concurso');
    expect(wrapper.text()).toContain('#03');
    expect(wrapper.text()).toContain('#05');
  });

  it('shows the Pinch-o-visión label for a MEDAL round', async () => {
    vi.mocked(api.get).mockResolvedValue({
      round: { id: 'r1', targetRank: 1, kind: 'MEDAL', status: 'OPEN' },
      candidates: [{ id: 'e1', number: 1, name: null, imagePath: 'a.webp' }],
    });
    const wrapper = mount(TiebreakVoteView);
    await flushPromises();

    expect(wrapper.text()).toContain('Desempate de Pinch-o-visión');
  });

  it('casts a vote and shows a thank-you message', async () => {
    vi.mocked(api.get).mockResolvedValue({
      round: { id: 'r1', targetRank: 1, kind: 'MAIN', status: 'OPEN' },
      candidates: [{ id: 'e1', number: 1, name: null, imagePath: 'a.webp' }],
    });
    vi.mocked(api.post).mockResolvedValue({ ok: true });
    const wrapper = mount(TiebreakVoteView);
    await flushPromises();

    await wrapper.find('.tiebreak__card').trigger('click');
    await flushPromises();

    expect(api.post).toHaveBeenCalledWith('/api/tiebreak/vote', { entryId: 'e1' });
    expect(wrapper.text()).toContain('registrado');
  });

  it('shows a retryable error when loading fails', async () => {
    vi.mocked(api.get).mockRejectedValue(new Error('network down'));
    const wrapper = mount(TiebreakVoteView);
    await flushPromises();
    expect(wrapper.text()).toContain('No hemos podido cargar el desempate.');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/views/TiebreakVoteView.test.ts`
Expected: FAIL — component file doesn't exist.

- [ ] **Step 3: Write the implementation**

```vue
<!-- frontend/src/views/TiebreakVoteView.vue -->
<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { api, ApiError } from '../services/api';

interface TiebreakCandidate {
  id: string;
  number: number;
  name: string | null;
  imagePath: string;
}

interface TiebreakRoundInfo {
  id: string;
  targetRank: number;
  kind: 'MAIN' | 'MEDAL';
  status: string;
}

interface CurrentRound {
  round: TiebreakRoundInfo;
  candidates: TiebreakCandidate[];
}

const KIND_LABELS: Record<string, string> = {
  MAIN: 'Desempate del concurso',
  MEDAL: 'Desempate de Pinch-o-visión',
};

const current = ref<CurrentRound | null>(null);
const isLoading = ref(true);
const loadError = ref<string | null>(null);
const hasVoted = ref(false);
const voteError = ref<string | null>(null);

async function load(): Promise<void> {
  isLoading.value = true;
  loadError.value = null;
  try {
    current.value = await api.get<CurrentRound>('/api/tiebreak/current');
  } catch (err) {
    loadError.value = err instanceof ApiError ? err.message : 'No hemos podido cargar el desempate.';
  } finally {
    isLoading.value = false;
  }
}

async function vote(entryId: string): Promise<void> {
  voteError.value = null;
  try {
    await api.post('/api/tiebreak/vote', { entryId });
    hasVoted.value = true;
  } catch (err) {
    voteError.value = err instanceof ApiError ? err.message : 'No hemos podido guardar tu voto.';
  }
}

onMounted(load);
</script>

<template>
  <main class="tiebreak">
    <p
      v-if="isLoading"
      class="tiebreak__status"
    >
      Cargando…
    </p>
    <template v-else-if="loadError">
      <p class="tiebreak__status tiebreak__status--error">
        {{ loadError }}
      </p>
      <button
        class="button button--secondary"
        type="button"
        @click="load"
      >
        Reintentar
      </button>
    </template>
    <template v-else-if="current">
      <h1 class="tiebreak__title">
        {{ KIND_LABELS[current.round.kind] }}
      </h1>
      <p
        v-if="hasVoted"
        class="tiebreak__status"
      >
        ¡Voto registrado! Espera a que el resto termine.
      </p>
      <template v-else>
        <p class="tiebreak__subtitle">
          Elige tu favorita entre las tapas empatadas:
        </p>
        <div class="tiebreak__grid">
          <button
            v-for="candidate in current.candidates"
            :key="candidate.id"
            class="tiebreak__card"
            type="button"
            @click="vote(candidate.id)"
          >
            <img
              :src="`/uploads/${candidate.imagePath}`"
              :alt="`Tapa número ${candidate.number}`"
              class="tiebreak__photo"
            >
            <span class="tiebreak__number">#{{ String(candidate.number).padStart(2, '0') }}</span>
          </button>
        </div>
        <p
          v-if="voteError"
          class="tiebreak__status tiebreak__status--error"
        >
          {{ voteError }}
        </p>
      </template>
    </template>
  </main>
</template>

<style scoped>
.tiebreak {
  padding: var(--space-5);
  max-width: 960px;
  margin: 0 auto;
}

.tiebreak__title {
  font-size: 1.4rem;
  margin: 0 0 var(--space-2);
}

.tiebreak__subtitle {
  color: var(--color-text-muted);
  margin: 0 0 var(--space-4);
}

.tiebreak__status {
  color: var(--color-text-muted);
  text-align: center;
  padding: var(--space-6) 0 var(--space-3);
}

.tiebreak__status--error {
  color: var(--color-danger);
}

.tiebreak__grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: var(--space-3);
}

@media (min-width: 640px) {
  .tiebreak__grid {
    grid-template-columns: repeat(3, 1fr);
  }
}

.tiebreak__card {
  position: relative;
  aspect-ratio: 1;
  border-radius: var(--radius-md);
  overflow: hidden;
  border: none;
  padding: 0;
  cursor: pointer;
  background: var(--color-surface);
  box-shadow: var(--shadow-sm);
}

.tiebreak__photo {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}

.tiebreak__number {
  position: absolute;
  bottom: var(--space-2);
  left: var(--space-2);
  background: rgba(31, 27, 22, 0.65);
  color: #fff;
  font-weight: 700;
  font-size: 0.85rem;
  padding: 2px 8px;
  border-radius: 999px;
  letter-spacing: 0.02em;
}
</style>
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/views/TiebreakVoteView.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add src/views/TiebreakVoteView.vue src/views/TiebreakVoteView.test.ts
git commit -m "Add TiebreakVoteView (kind-aware, used by both MAIN and MEDAL rounds)"
```

---

### Task 14: `MedalPodiumView`

**Files:**
- Create: `frontend/src/views/MedalPodiumView.vue`
- Test: `frontend/src/views/MedalPodiumView.test.ts`

**Interfaces:**
- Consumes: `GET /api/medal-votes/results` (Task 6).

- [ ] **Step 1: Write the failing tests**

```ts
// frontend/src/views/MedalPodiumView.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';

vi.mock('../services/api', async () => {
  const actual = await vi.importActual<typeof import('../services/api')>('../services/api');
  return { ...actual, api: { ...actual.api, get: vi.fn() } };
});

import { api, ApiError } from '../services/api';
import MedalPodiumView from './MedalPodiumView.vue';

beforeEach(() => {
  vi.clearAllMocks();
});

describe('MedalPodiumView', () => {
  it('shows a waiting message before the reveal', async () => {
    vi.mocked(api.get).mockRejectedValue(
      new ApiError(409, 'RESULTS_NOT_READY', 'Los resultados todavía no se han mostrado.')
    );
    const wrapper = mount(MedalPodiumView);
    await flushPromises();
    expect(wrapper.text()).toContain('Todavía no se ha revelado');
  });

  it('shows the podium once revealed', async () => {
    vi.mocked(api.get).mockResolvedValue({
      revealedAt: '2026-09-17T20:00:00.000Z',
      podium: [
        { rank: 1, entryId: 'e1', number: 3, entryName: 'Croqueta', creatorName: 'Laura', medal: 'GOLD', total: 15 },
        { rank: 2, entryId: 'e2', number: 7, entryName: null, creatorName: 'Miguel', medal: 'SILVER', total: 9 },
        { rank: 3, entryId: 'e3', number: 1, entryName: null, creatorName: 'Ana', medal: 'BRONZE', total: 4 },
      ],
    });
    const wrapper = mount(MedalPodiumView);
    await flushPromises();

    expect(wrapper.text()).toContain('#03');
    expect(wrapper.text()).toContain('Laura');
    expect(wrapper.findAll('.medal-podium__item')).toHaveLength(3);
    expect(wrapper.find('.medal-podium__circle--gold').exists()).toBe(true);
    expect(wrapper.find('.medal-podium__circle--silver').exists()).toBe(true);
    expect(wrapper.find('.medal-podium__circle--bronze').exists()).toBe(true);
  });

  it('shows a retryable error for other failures', async () => {
    vi.mocked(api.get).mockRejectedValue(new Error('network down'));
    const wrapper = mount(MedalPodiumView);
    await flushPromises();
    expect(wrapper.text()).toContain('No hemos podido cargar el podio.');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/views/MedalPodiumView.test.ts`
Expected: FAIL — component file doesn't exist.

- [ ] **Step 3: Write the implementation**

```vue
<!-- frontend/src/views/MedalPodiumView.vue -->
<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { Medal } from '@lucide/vue';
import { api, ApiError } from '../services/api';

interface PodiumEntry {
  rank: number;
  entryId: string;
  number: number;
  entryName: string | null;
  creatorName: string;
  medal: 'GOLD' | 'SILVER' | 'BRONZE';
  total: number;
}

const podium = ref<PodiumEntry[] | null>(null);
const isLoading = ref(true);
const notReady = ref(false);
const loadError = ref<string | null>(null);

async function load(): Promise<void> {
  isLoading.value = true;
  loadError.value = null;
  notReady.value = false;
  try {
    const data = await api.get<{ revealedAt: string; podium: PodiumEntry[] }>('/api/medal-votes/results');
    podium.value = data.podium;
  } catch (err) {
    if (err instanceof ApiError && err.code === 'RESULTS_NOT_READY') {
      notReady.value = true;
    } else {
      loadError.value = err instanceof ApiError ? err.message : 'No hemos podido cargar el podio.';
    }
  } finally {
    isLoading.value = false;
  }
}

onMounted(load);
</script>

<template>
  <main class="medal-podium">
    <h1 class="medal-podium__title">
      Pinch-o-visión
    </h1>
    <p
      v-if="isLoading"
      class="medal-podium__status"
    >
      Cargando…
    </p>
    <p
      v-else-if="notReady"
      class="medal-podium__status"
    >
      Todavía no se ha revelado el podium de Pinch-o-visión.
    </p>
    <template v-else-if="loadError">
      <p class="medal-podium__status medal-podium__status--error">
        {{ loadError }}
      </p>
      <button
        class="button button--secondary"
        type="button"
        @click="load"
      >
        Reintentar
      </button>
    </template>
    <ol
      v-else-if="podium"
      class="medal-podium__list"
    >
      <li
        v-for="entry in podium"
        :key="entry.entryId"
        class="medal-podium__item"
      >
        <span
          class="medal-podium__circle"
          :class="`medal-podium__circle--${entry.medal.toLowerCase()}`"
        >
          <Medal
            :size="24"
            aria-hidden="true"
          />
        </span>
        <span class="medal-podium__number">#{{ String(entry.number).padStart(2, '0') }}</span>
        <span class="medal-podium__creator">{{ entry.creatorName }}</span>
      </li>
    </ol>
  </main>
</template>

<style scoped>
.medal-podium {
  padding: var(--space-5);
  max-width: 480px;
  margin: 0 auto;
}

.medal-podium__title {
  font-size: 1.5rem;
  margin: 0 0 var(--space-5);
  text-align: center;
}

.medal-podium__status {
  color: var(--color-text-muted);
  text-align: center;
  padding: var(--space-6) 0 var(--space-3);
}

.medal-podium__status--error {
  color: var(--color-danger);
}

.medal-podium__list {
  list-style: none;
  padding: 0;
  margin: 0;
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
}

.medal-podium__item {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  background: var(--color-surface);
  border-radius: var(--radius-md);
  box-shadow: var(--shadow-sm);
  padding: var(--space-3) var(--space-4);
}

.medal-podium__circle {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 44px;
  height: 44px;
  border-radius: 50%;
  color: #fff;
  flex-shrink: 0;
}

.medal-podium__circle--gold {
  background: var(--color-gold);
}

.medal-podium__circle--silver {
  background: var(--color-silver);
}

.medal-podium__circle--bronze {
  background: var(--color-bronze);
}

.medal-podium__number {
  font-weight: 700;
  color: var(--color-primary);
}

.medal-podium__creator {
  color: var(--color-text-muted);
}
</style>
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/views/MedalPodiumView.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/views/MedalPodiumView.vue src/views/MedalPodiumView.test.ts
git commit -m "Add MedalPodiumView"
```

---

### Task 15: Router — finish Task 12

**Files:**
- Same as Task 12 (already written).

- [ ] **Step 1: Re-run the router test suite now that Tasks 13, 14 and 17's view files exist**

Run: `npx vitest run src/router/index.test.ts`
Expected: PASS (all previous + 6 new tests, per Task 12's Step 1). If it
still fails because `AdminMedalVotesView.vue` doesn't exist yet, do Task
17 first, then return here.

- [ ] **Step 2: Commit** (this finalizes Task 12's commit — if Task 12
was already committed with `--allow-empty` reasoning, skip; otherwise
this is where that commit actually happens)

```bash
git add src/router/index.ts src/router/index.test.ts
git commit -m "Add tiebreak, medal-results and admin-medal-votes routes"
```

---

### Task 16: `AdminNav` — add the Pinch-o-visión tab

**Files:**
- Modify: `frontend/src/components/admin/AdminNav.vue`
- Modify test: `frontend/src/components/admin/AdminNav.test.ts`

- [ ] **Step 1: Write the failing test**

Update the existing test in `AdminNav.test.ts`:

```ts
it('navigates to each admin route by name when its button is clicked', async () => {
  const wrapper = mount(AdminNav);
  const buttons = wrapper.findAll('button');
  expect(buttons).toHaveLength(5);

  await buttons[0].trigger('click');
  expect(pushMock).toHaveBeenLastCalledWith({ name: 'admin-dashboard' });
  await buttons[1].trigger('click');
  expect(pushMock).toHaveBeenLastCalledWith({ name: 'admin-participants' });
  await buttons[2].trigger('click');
  expect(pushMock).toHaveBeenLastCalledWith({ name: 'admin-entries' });
  await buttons[3].trigger('click');
  expect(pushMock).toHaveBeenLastCalledWith({ name: 'admin-phases' });
  await buttons[4].trigger('click');
  expect(pushMock).toHaveBeenLastCalledWith({ name: 'admin-medal-votes' });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/components/admin/AdminNav.test.ts`
Expected: FAIL — only 4 buttons exist, 5th click assertion fails.

- [ ] **Step 3: Write the implementation**

Add a 5th button to `AdminNav.vue`, right after the "Fases" button:

```html
<button
  type="button"
  @click="goTo('admin-medal-votes')"
>
  Pinch-o-visión
</button>
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/components/admin/AdminNav.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/admin/AdminNav.vue src/components/admin/AdminNav.test.ts
git commit -m "Add Pinch-o-visión tab to AdminNav"
```

---

### Task 17: `useAdminMedalVotes` composable + `AdminMedalVotesView`

**Files:**
- Create: `frontend/src/composables/useAdminMedalVotes.ts`
- Test: `frontend/src/composables/useAdminMedalVotes.test.ts`
- Create: `frontend/src/views/admin/AdminMedalVotesView.vue`
- Test: `frontend/src/views/admin/AdminMedalVotesView.test.ts`

**Interfaces:**
- Produces: `AdminMedalStanding` interface, `useAdminMedalVotes()`
  returning `{ data, isLoading, error, refetch }` — same shape as
  `useAdminDashboard` (Fase F), polling every 7s.

- [ ] **Step 1: Write the failing tests (composable)**

```ts
// frontend/src/composables/useAdminMedalVotes.test.ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { defineComponent } from 'vue';
import { mount } from '@vue/test-utils';

vi.mock('../services/api', async () => {
  const actual = await vi.importActual<typeof import('../services/api')>('../services/api');
  return { ...actual, api: { ...actual.api, get: vi.fn() } };
});

import { api, ApiError } from '../services/api';
import { useAdminMedalVotes } from './useAdminMedalVotes';

const sampleData = [{ entryId: 'e1', number: 1, name: 'Croqueta', gold: 2, silver: 1, bronze: 0, total: 13 }];

let captured: ReturnType<typeof useAdminMedalVotes>;
const HostComponent = defineComponent({
  setup() {
    captured = useAdminMedalVotes();
    return () => null;
  },
});

beforeEach(() => {
  vi.useFakeTimers();
  vi.clearAllMocks();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('useAdminMedalVotes', () => {
  it('fetches on mount and polls every 7s', async () => {
    vi.mocked(api.get).mockResolvedValue(sampleData);
    mount(HostComponent);
    await vi.advanceTimersByTimeAsync(0);

    expect(captured.data.value).toEqual(sampleData);
    expect(api.get).toHaveBeenCalledWith('/api/admin/medal-votes');
    expect(api.get).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(7000);
    expect(api.get).toHaveBeenCalledTimes(2);
  });

  it('stops polling after unmount', async () => {
    vi.mocked(api.get).mockResolvedValue(sampleData);
    const wrapper = mount(HostComponent);
    await vi.advanceTimersByTimeAsync(0);
    wrapper.unmount();
    await vi.advanceTimersByTimeAsync(21000);
    expect(api.get).toHaveBeenCalledTimes(1);
  });

  it('surfaces a friendly error on failure', async () => {
    vi.mocked(api.get).mockRejectedValue(new ApiError(500, 'INTERNAL_ERROR', 'Ha ocurrido un error inesperado.'));
    mount(HostComponent);
    await vi.advanceTimersByTimeAsync(0);
    expect(captured.error.value).toBe('Ha ocurrido un error inesperado.');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/composables/useAdminMedalVotes.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the composable**

```ts
// frontend/src/composables/useAdminMedalVotes.ts
import { ref, onMounted, onUnmounted } from 'vue';
import { api, ApiError } from '../services/api';

export interface AdminMedalStanding {
  entryId: string;
  number: number;
  name: string | null;
  gold: number;
  silver: number;
  bronze: number;
  total: number;
}

const POLL_INTERVAL_MS = 7000;

export function useAdminMedalVotes() {
  const data = ref<AdminMedalStanding[] | null>(null);
  const isLoading = ref(true);
  const error = ref<string | null>(null);
  let timer: ReturnType<typeof setInterval> | undefined;

  async function refetch(): Promise<void> {
    try {
      data.value = await api.get<AdminMedalStanding[]>('/api/admin/medal-votes');
      error.value = null;
    } catch (err) {
      error.value = err instanceof ApiError ? err.message : 'No hemos podido cargar el recuento.';
    } finally {
      isLoading.value = false;
    }
  }

  onMounted(() => {
    refetch();
    timer = setInterval(refetch, POLL_INTERVAL_MS);
  });

  onUnmounted(() => {
    if (timer) clearInterval(timer);
  });

  return { data, isLoading, error, refetch };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/composables/useAdminMedalVotes.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Write the failing tests (view)**

```ts
// frontend/src/views/admin/AdminMedalVotesView.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import AdminMedalVotesView from './AdminMedalVotesView.vue';

vi.mock('vue-router', () => ({
  useRouter: () => ({ push: vi.fn() }),
}));

vi.mock('../../services/api', async () => {
  const actual = await vi.importActual<typeof import('../../services/api')>('../../services/api');
  return { ...actual, api: { ...actual.api, get: vi.fn() } };
});

import { api } from '../../services/api';

beforeEach(() => {
  vi.clearAllMocks();
});

describe('AdminMedalVotesView', () => {
  it('shows a loading state while fetching', async () => {
    vi.mocked(api.get).mockReturnValue(new Promise(() => {}));
    const wrapper = mount(AdminMedalVotesView);
    await flushPromises();
    expect(wrapper.text()).toContain('Cargando');
  });

  it('shows the scoreboard once loaded', async () => {
    vi.mocked(api.get).mockResolvedValue([
      { entryId: 'e1', number: 3, name: 'Croqueta', gold: 2, silver: 1, bronze: 0, total: 13 },
      { entryId: 'e2', number: 1, name: null, gold: 0, silver: 0, bronze: 1, total: 1 },
    ]);
    const wrapper = mount(AdminMedalVotesView);
    await flushPromises();

    expect(wrapper.text()).toContain('#03');
    expect(wrapper.text()).toContain('Croqueta');
    expect(wrapper.text()).toContain('13');
  });

  it('shows a retryable error message when loading fails', async () => {
    vi.mocked(api.get).mockRejectedValue(new Error('network down'));
    const wrapper = mount(AdminMedalVotesView);
    await flushPromises();
    expect(wrapper.text()).toContain('No hemos podido cargar el recuento.');
  });
});
```

- [ ] **Step 6: Run test to verify it fails**

Run: `npx vitest run src/views/admin/AdminMedalVotesView.test.ts`
Expected: FAIL — component file doesn't exist.

- [ ] **Step 7: Write the view**

```vue
<!-- frontend/src/views/admin/AdminMedalVotesView.vue -->
<script setup lang="ts">
import AdminNav from '../../components/admin/AdminNav.vue';
import { useAdminMedalVotes } from '../../composables/useAdminMedalVotes';

const { data, isLoading, error, refetch } = useAdminMedalVotes();
</script>

<template>
  <div>
    <AdminNav />
    <main class="admin-medal-votes">
      <h1 class="admin-medal-votes__title">
        Pinch-o-visión
      </h1>

      <p
        v-if="isLoading"
        class="admin-medal-votes__status"
      >
        Cargando…
      </p>
      <template v-else-if="error">
        <p class="admin-medal-votes__status admin-medal-votes__status--error">
          {{ error }}
        </p>
        <button
          class="button button--secondary"
          type="button"
          @click="refetch"
        >
          Reintentar
        </button>
      </template>
      <table
        v-else-if="data"
        class="admin-table"
      >
        <thead>
          <tr>
            <th>Nº</th>
            <th>Nombre</th>
            <th>Oro</th>
            <th>Plata</th>
            <th>Bronce</th>
            <th>Total</th>
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="entry in data"
            :key="entry.entryId"
          >
            <td>#{{ String(entry.number).padStart(2, '0') }}</td>
            <td>{{ entry.name ?? '—' }}</td>
            <td>{{ entry.gold }}</td>
            <td>{{ entry.silver }}</td>
            <td>{{ entry.bronze }}</td>
            <td>{{ entry.total }}</td>
          </tr>
        </tbody>
      </table>
    </main>
  </div>
</template>

<style scoped>
.admin-medal-votes {
  padding: var(--space-5);
  max-width: 720px;
  margin: 0 auto;
}

.admin-medal-votes__title {
  font-size: 1.4rem;
  margin: 0 0 var(--space-4);
}

.admin-medal-votes__status {
  color: var(--color-text-muted);
  text-align: center;
  padding: var(--space-6) 0 var(--space-3);
}

.admin-medal-votes__status--error {
  color: var(--color-danger);
}
</style>
```

(`.admin-table` styles already exist globally-scoped-per-component in
`AdminEntriesView.vue` and are duplicated per-component throughout the
admin panel — follow that same existing convention rather than extracting
a shared stylesheet, to stay consistent with the rest of the codebase.)

Add the same `.admin-table` rules used in `AdminEntriesView.vue` to this
file's `<style scoped>` block:

```css
.admin-table {
  width: 100%;
  border-collapse: collapse;
  background: var(--color-surface);
  border-radius: var(--radius-md);
  overflow: hidden;
  box-shadow: var(--shadow-sm);
}

.admin-table th,
.admin-table td {
  text-align: left;
  padding: var(--space-3);
  border-bottom: 1px solid var(--color-border);
  font-size: 0.9rem;
}
```

- [ ] **Step 8: Run test to verify it passes**

Run: `npx vitest run src/views/admin/AdminMedalVotesView.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 9: Commit**

```bash
git add src/composables/useAdminMedalVotes.ts src/composables/useAdminMedalVotes.test.ts src/views/admin/AdminMedalVotesView.vue src/views/admin/AdminMedalVotesView.test.ts
git commit -m "Add admin Pinch-o-visión scoreboard view"
```

---

### Task 18: Final verification and README update

**Files:**
- Modify: `README.md` (repo root)

- [ ] **Step 1: Run the full backend suite**

Run: `cd server && npm test`
Expected: PASS — should now be around 45 + ~1 (connection) + ~9
(medalVoteService) + ~4 (tiebreakService additions) + ~2 (rankingService
additions) + ~3 (medalResultsService) ≈ 65+ tests.

- [ ] **Step 2: Run the full frontend suite**

Run: `cd frontend && npx vitest run`
Expected: PASS — should now be around 143 (post Fase E) + new tests from
Tasks 7, 9, 10, 11, 12, 13, 14, 16, 17 ≈ 180+ tests.

- [ ] **Step 3: Run lint and typecheck on both packages**

Run: `cd server && npm run lint && npm run build`
Run: `cd frontend && npm run lint && npm run typecheck`
Expected: all clean. If `eslint --fix` is needed for attribute-wrapping
style (as happened for the admin panel and favorites plans), run it and
re-verify both lint and the full test suite afterward.

- [ ] **Step 4: Reset the dev database to pick up the new schema**

Run: `cd server && npm run db:reset`
This is required — the shared dev SQLite file was created before the
`MedalVote` table and `TiebreakRound.kind` column existed, and this
project has no ALTER-based migration runner (see this plan's "Existing
contracts" section).

- [ ] **Step 5: Manual smoke check against a running backend**

With the backend running and the contest in `VOTING` phase, using `curl`:
create two users, have each assign a GOLD medal to a different entry
(`PUT /api/medal-votes/:entryId` with `{"medal":"GOLD"}` and the
`X-User-Id` header), confirm `GET /api/admin/medal-votes` (with
`X-Admin-Pin`) shows the tally live. Then call
`POST /api/admin/contest/close-voting` and confirm it opens a `MEDAL`
tiebreak round (`GET /api/tiebreak/current`), cast tiebreak votes, close
the round, call `POST /api/admin/contest/reveal-results`, and confirm
`GET /api/medal-votes/results` now returns the ordered top-3 podium.

- [ ] **Step 6: Update README**

Edit the "Estado actual" block in `README.md`:

```markdown
> **Estado actual:** el backend está completo y probado, incluyendo
> Pinch-o-visión (segundo sistema de puntuación por medallas de oro,
> plata y bronce, con su propio desempate reutilizando la infraestructura
> de desempate existente). El frontend cubre el registro de participante y
> de tapas, la galería de tapas con sistema de favoritos y medallas
> Pinch-o-visión, la pantalla de desempate (para ambos sistemas), el
> podium de Pinch-o-visión, y el panel de administración completo
> (login por PIN, dashboard en vivo, gestión de participantes y tapas,
> control de fases, recuento en vivo de Pinch-o-visión). La pantalla de
> resultados del ranking principal todavía no existe en el frontend — se
> prueba directamente contra la API REST.
```

- [ ] **Step 7: Commit**

```bash
git add README.md
git commit -m "Update README: Pinch-o-visión is live"
```

---

## After all tasks

Run superpowers:finishing-a-development-branch to verify the full test
suite one more time, present the integration menu, and clean up the
worktree/branch per the user's choice.
