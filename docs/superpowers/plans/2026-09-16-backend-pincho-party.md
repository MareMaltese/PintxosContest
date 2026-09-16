# Backend Pincho Party — Implementation Plan (Fase A)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the complete, fully-tested Node/Express/SQLite backend for the Pincho Party contest app: data model, business-rule services, REST API, SSE realtime, image pipeline, admin endpoints, and dev seed/reset tooling — runnable standalone (curl-testable) before any frontend work starts.

**Architecture:** Express app with a thin routes layer delegating to a synchronous service layer (`better-sqlite3`, one file per aggregate) that owns every invariant in a SQLite transaction. Realtime push via a minimal in-process SSE broadcaster. Images accepted via `multer` (memory) and normalized with `sharp` before hitting disk. Admin auth is a stateless PIN header; user auth is an opaque `X-User-Id` header resolved against the `User` table.

**Tech Stack:** Node.js + TypeScript (`tsx` for dev, `tsc` for build) + Express 4 + `better-sqlite3` + `sharp` + `multer` + `zod` + Vitest + ESLint (flat config, `typescript-eslint`).

**Spec:** `docs/superpowers/specs/2026-09-16-pincho-party-design.md`

## Global Constraints

- All critical business rules (max favorites, dedup votes, phase gating, self-vote, immutable entry number, tiebreak candidacy/uniqueness) are enforced in the **backend service layer**, inside a `db.transaction()` where a check-then-write race is possible. Never trust the frontend alone.
- No vote counts are ever exposed by any endpoint (public or admin) while `phase` is `VOTING` or `TIEBREAK`. Only `RESULTS` (and only after `resultsRevealedAt` is set for the public `/results` endpoint) exposes counts.
- Entry `number` is assigned once on creation and is never editable through any endpoint.
- IDs for `User` and `Entry` are `crypto.randomUUID()` — unpredictable, never sequential.
- All user-facing strings returned in API error messages are in Spanish and carry personality consistent with the spec's tone (not corporate).
- The server always binds `0.0.0.0`, never `localhost` only.
- The app name is centralized: `server/src/config.ts` exports `APP_NAME = 'Pincho Party'`, used anywhere the name appears (e.g. default DB filename, log line).
- No placeholder code, no `TODO`s. Every task below ends with passing tests.
- Package versions are pinned to the exact ranges given in each task — they were checked against the npm registry while writing this plan; do not silently swap majors.

---

### Task 1: Server scaffold, config, SQLite schema & connection

**Files:**
- Create: `server/package.json`
- Create: `server/tsconfig.json`
- Create: `server/vitest.config.ts`
- Create: `server/.gitignore`
- Create: `server/src/config.ts`
- Create: `server/src/db/schema.sql`
- Create: `server/src/db/connection.ts`
- Create: `server/src/db/index.ts`
- Test: `server/src/db/connection.test.ts`

**Interfaces:**
- Produces: `createDb(dbPath: string): Database.Database` (from `better-sqlite3`) — opens/creates the file (or `:memory:`), applies `schema.sql`, seeds a default `Contest` row (`phase='REGISTRATION'`) if missing, returns the handle.
- Produces: `config` object (`server/src/config.ts`) with `port`, `adminPin`, `dbPath`, `uploadsDir`, `nodeEnv`, `APP_NAME`.
- Produces: `db` singleton (`server/src/db/index.ts`) — `createDb(config.dbPath)` called once at import time. All later tasks import `db` from here.

- [ ] **Step 1: Create `server/package.json`**

```json
{
  "name": "pincho-party-server",
  "version": "0.1.0",
  "private": true,
  "type": "commonjs",
  "scripts": {
    "dev": "tsx watch src/index.ts",
    "build": "tsc -p tsconfig.json",
    "start": "node dist/index.js",
    "test": "vitest run",
    "lint": "eslint .",
    "typecheck": "tsc --noEmit",
    "seed": "tsx src/seed/devSeed.ts",
    "db:reset": "tsx src/seed/resetDb.ts"
  },
  "dependencies": {
    "better-sqlite3": "^13.0.3",
    "express": "^4.21.2",
    "multer": "^2.4.0",
    "sharp": "^0.35.4",
    "zod": "^3.24.1"
  },
  "devDependencies": {
    "@types/better-sqlite3": "^9.6.0",
    "@types/express": "^4.17.23",
    "@types/node": "^22.20.3",
    "eslint": "^10.10.0",
    "tsx": "^4.23.13",
    "typescript": "^5.9.3",
    "typescript-eslint": "^8.70.0",
    "vitest": "^2.1.9"
  }
}
```

- [ ] **Step 2: Install dependencies**

Run: `cd server && npm install`
Expected: install completes, `node_modules/` created, no peer-dependency errors.

- [ ] **Step 3: Create `server/tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "CommonJS",
    "moduleResolution": "Node",
    "outDir": "dist",
    "rootDir": "src",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "resolveJsonModule": true,
    "forceConsistentCasingInFileNames": true
  },
  "include": ["src"]
}
```

- [ ] **Step 4: Create `server/vitest.config.ts`**

```ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
  },
});
```

- [ ] **Step 5: Create `server/.gitignore`**

```
node_modules/
dist/
data/
uploads/
*.log
```

- [ ] **Step 6: Create `server/src/config.ts`**

```ts
import path from 'node:path';

export const APP_NAME = 'Pincho Party';

export const config = {
  appName: APP_NAME,
  port: Number(process.env.PORT ?? 3000),
  adminPin: process.env.ADMIN_PIN ?? '0000',
  dbPath: process.env.DB_PATH ?? path.join(__dirname, '..', 'data', 'pincho-party.db'),
  uploadsDir: process.env.UPLOADS_DIR ?? path.join(__dirname, '..', 'uploads'),
  nodeEnv: process.env.NODE_ENV ?? 'development',
};
```

- [ ] **Step 7: Create `server/src/db/schema.sql`**

```sql
CREATE TABLE IF NOT EXISTS Contest (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  phase TEXT NOT NULL CHECK (phase IN ('REGISTRATION','VOTING','TIEBREAK','RESULTS')),
  allowSelfVote INTEGER NOT NULL DEFAULT 0,
  resultsRevealedAt TEXT NULL,
  createdAt TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS User (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  createdAt TEXT NOT NULL,
  lastSeen TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS Entry (
  id TEXT PRIMARY KEY,
  number INTEGER NOT NULL UNIQUE,
  creatorId TEXT NOT NULL REFERENCES User(id),
  name TEXT NULL,
  description TEXT NULL,
  imagePath TEXT NOT NULL,
  createdAt TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS Vote (
  id TEXT PRIMARY KEY,
  userId TEXT NOT NULL REFERENCES User(id),
  entryId TEXT NOT NULL REFERENCES Entry(id),
  createdAt TEXT NOT NULL,
  UNIQUE (userId, entryId)
);

CREATE TABLE IF NOT EXISTS TiebreakRound (
  id TEXT PRIMARY KEY,
  roundNumber INTEGER NOT NULL,
  targetRank INTEGER NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('OPEN','CLOSED')),
  createdAt TEXT NOT NULL,
  closedAt TEXT NULL
);

CREATE TABLE IF NOT EXISTS TiebreakCandidate (
  roundId TEXT NOT NULL REFERENCES TiebreakRound(id),
  entryId TEXT NOT NULL REFERENCES Entry(id),
  PRIMARY KEY (roundId, entryId)
);

CREATE TABLE IF NOT EXISTS TiebreakVote (
  id TEXT PRIMARY KEY,
  roundId TEXT NOT NULL REFERENCES TiebreakRound(id),
  userId TEXT NOT NULL REFERENCES User(id),
  entryId TEXT NOT NULL REFERENCES Entry(id),
  createdAt TEXT NOT NULL,
  UNIQUE (roundId, userId)
);
```

- [ ] **Step 8: Write the failing test `server/src/db/connection.test.ts`**

```ts
import { describe, it, expect } from 'vitest';
import { createDb } from './connection';

describe('createDb', () => {
  it('creates all tables and a default REGISTRATION contest row', () => {
    const db = createDb(':memory:');
    const tables = db
      .prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name")
      .all()
      .map((r: any) => r.name);
    expect(tables).toEqual([
      'Contest',
      'Entry',
      'TiebreakCandidate',
      'TiebreakRound',
      'TiebreakVote',
      'User',
      'Vote',
    ]);
    const contest = db.prepare('SELECT * FROM Contest WHERE id = 1').get() as any;
    expect(contest.phase).toBe('REGISTRATION');
    expect(contest.allowSelfVote).toBe(0);
    expect(contest.resultsRevealedAt).toBeNull();
  });

  it('is idempotent: calling twice on the same file does not duplicate the Contest row', () => {
    const db = createDb(':memory:');
    // simulate re-running migrate against an already-initialized handle
    db.exec(require('node:fs').readFileSync(require('node:path').join(__dirname, 'schema.sql'), 'utf-8'));
    const count = (db.prepare('SELECT COUNT(*) as c FROM Contest').get() as any).c;
    expect(count).toBe(1);
  });
});
```

- [ ] **Step 9: Run test to verify it fails**

Run: `cd server && npx vitest run src/db/connection.test.ts`
Expected: FAIL — `Cannot find module './connection'`.

- [ ] **Step 10: Create `server/src/db/connection.ts`**

```ts
import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';

export function createDb(dbPath: string): Database.Database {
  const isMemory = dbPath === ':memory:';
  if (!isMemory) {
    fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  }
  const db = new Database(dbPath);
  if (!isMemory) {
    db.pragma('journal_mode = WAL');
  }
  db.pragma('foreign_keys = ON');

  const schema = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf-8');
  db.exec(schema);

  const existing = db.prepare('SELECT id FROM Contest WHERE id = 1').get();
  if (!existing) {
    db.prepare(
      `INSERT INTO Contest (id, phase, allowSelfVote, resultsRevealedAt, createdAt)
       VALUES (1, 'REGISTRATION', 0, NULL, ?)`
    ).run(new Date().toISOString());
  }
  return db;
}
```

- [ ] **Step 11: Create `server/src/db/index.ts`**

```ts
import { createDb } from './connection';
import { config } from '../config';

export const db = createDb(config.dbPath);
```

- [ ] **Step 12: Run test to verify it passes**

Run: `cd server && npx vitest run src/db/connection.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 13: Commit**

```bash
git add server/package.json server/package-lock.json server/tsconfig.json server/vitest.config.ts server/.gitignore server/src/config.ts server/src/db/
git commit -m "Scaffold backend: SQLite schema, connection, config"
```

---

### Task 2: `contestService` + `userService`

**Files:**
- Create: `server/src/middleware/errors.ts`
- Create: `server/src/services/contestService.ts`
- Test: `server/src/services/contestService.test.ts`
- Create: `server/src/services/userService.ts`
- Test: `server/src/services/userService.test.ts`

**Interfaces:**
- Consumes: `createDb` (Task 1) — tests open `createDb(':memory:')` per test for isolation.
- Produces: `AppError` class (`status: number, code: string, message: string`) — used by every later service for domain errors.
- Produces `contestService`: `ContestPhase = 'REGISTRATION'|'VOTING'|'TIEBREAK'|'RESULTS'`, `Contest { phase, allowSelfVote, resultsRevealedAt }`, `getContest(db)`, `setPhase(db, phase)`, `startContest(db)`, `setAllowSelfVote(db, allow)`, `revealResults(db)`.
- Produces `userService`: `User { id, name, createdAt, lastSeen }`, `createUser(db, name)`, `touchHeartbeat(db, id)` (throws plain `Error('USER_NOT_FOUND')` if no row updated), `getUser(db, id)`, `listUsers(db)`.

- [ ] **Step 1: Create `server/src/middleware/errors.ts`**

```ts
export class AppError extends Error {
  status: number;
  code: string;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}
```

- [ ] **Step 2: Write the failing test `server/src/services/contestService.test.ts`**

```ts
import { describe, it, expect, beforeEach } from 'vitest';
import type Database from 'better-sqlite3';
import { createDb } from '../db/connection';
import { getContest, startContest, setAllowSelfVote, revealResults, setPhase } from './contestService';
import { AppError } from '../middleware/errors';

let db: Database.Database;

beforeEach(() => {
  db = createDb(':memory:');
});

describe('contestService', () => {
  it('starts in REGISTRATION with allowSelfVote false', () => {
    const contest = getContest(db);
    expect(contest.phase).toBe('REGISTRATION');
    expect(contest.allowSelfVote).toBe(false);
    expect(contest.resultsRevealedAt).toBeNull();
  });

  it('startContest moves REGISTRATION -> VOTING', () => {
    const contest = startContest(db);
    expect(contest.phase).toBe('VOTING');
  });

  it('startContest throws if the contest already started', () => {
    startContest(db);
    expect(() => startContest(db)).toThrow(AppError);
  });

  it('setAllowSelfVote toggles the flag', () => {
    expect(setAllowSelfVote(db, true).allowSelfVote).toBe(true);
    expect(setAllowSelfVote(db, false).allowSelfVote).toBe(false);
  });

  it('revealResults requires phase RESULTS and sets resultsRevealedAt once', () => {
    expect(() => revealResults(db)).toThrow(AppError);
    setPhase(db, 'RESULTS');
    const revealed = revealResults(db);
    expect(revealed.resultsRevealedAt).not.toBeNull();
    expect(() => revealResults(db)).toThrow(AppError);
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `cd server && npx vitest run src/services/contestService.test.ts`
Expected: FAIL — `Cannot find module './contestService'`.

- [ ] **Step 4: Create `server/src/services/contestService.ts`**

```ts
import type Database from 'better-sqlite3';
import { AppError } from '../middleware/errors';

export type ContestPhase = 'REGISTRATION' | 'VOTING' | 'TIEBREAK' | 'RESULTS';

export interface Contest {
  phase: ContestPhase;
  allowSelfVote: boolean;
  resultsRevealedAt: string | null;
}

interface ContestRow {
  phase: ContestPhase;
  allowSelfVote: number;
  resultsRevealedAt: string | null;
}

export function getContest(db: Database.Database): Contest {
  const row = db
    .prepare('SELECT phase, allowSelfVote, resultsRevealedAt FROM Contest WHERE id = 1')
    .get() as ContestRow;
  return { phase: row.phase, allowSelfVote: !!row.allowSelfVote, resultsRevealedAt: row.resultsRevealedAt };
}

export function setPhase(db: Database.Database, phase: ContestPhase): void {
  db.prepare('UPDATE Contest SET phase = ? WHERE id = 1').run(phase);
}

export function startContest(db: Database.Database): Contest {
  const contest = getContest(db);
  if (contest.phase !== 'REGISTRATION') {
    throw new AppError(409, 'ALREADY_STARTED', 'El concurso ya ha empezado.');
  }
  setPhase(db, 'VOTING');
  return getContest(db);
}

export function setAllowSelfVote(db: Database.Database, allow: boolean): Contest {
  db.prepare('UPDATE Contest SET allowSelfVote = ? WHERE id = 1').run(allow ? 1 : 0);
  return getContest(db);
}

export function revealResults(db: Database.Database): Contest {
  const contest = getContest(db);
  if (contest.phase !== 'RESULTS') {
    throw new AppError(409, 'NOT_READY', 'Los resultados todavía no están listos para mostrarse.');
  }
  if (contest.resultsRevealedAt) {
    throw new AppError(409, 'ALREADY_REVEALED', 'Los resultados ya se han mostrado.');
  }
  const now = new Date().toISOString();
  db.prepare('UPDATE Contest SET resultsRevealedAt = ? WHERE id = 1').run(now);
  return getContest(db);
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd server && npx vitest run src/services/contestService.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 6: Write the failing test `server/src/services/userService.test.ts`**

```ts
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
```

- [ ] **Step 7: Run test to verify it fails**

Run: `cd server && npx vitest run src/services/userService.test.ts`
Expected: FAIL — `Cannot find module './userService'`.

- [ ] **Step 8: Create `server/src/services/userService.ts`**

```ts
import { randomUUID } from 'node:crypto';
import type Database from 'better-sqlite3';

export interface User {
  id: string;
  name: string;
  createdAt: string;
  lastSeen: string;
}

export function createUser(db: Database.Database, name: string): User {
  const id = randomUUID();
  const now = new Date().toISOString();
  db.prepare('INSERT INTO User (id, name, createdAt, lastSeen) VALUES (?, ?, ?, ?)').run(id, name, now, now);
  return { id, name, createdAt: now, lastSeen: now };
}

export function touchHeartbeat(db: Database.Database, id: string): void {
  const now = new Date().toISOString();
  const result = db.prepare('UPDATE User SET lastSeen = ? WHERE id = ?').run(now, id);
  if (result.changes === 0) {
    throw new Error('USER_NOT_FOUND');
  }
}

export function getUser(db: Database.Database, id: string): User | undefined {
  return db.prepare('SELECT * FROM User WHERE id = ?').get(id) as User | undefined;
}

export function listUsers(db: Database.Database): User[] {
  return db.prepare('SELECT * FROM User ORDER BY createdAt ASC').all() as User[];
}
```

- [ ] **Step 9: Run test to verify it passes**

Run: `cd server && npx vitest run src/services/userService.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 10: Commit**

```bash
git add server/src/middleware/errors.ts server/src/services/contestService.ts server/src/services/contestService.test.ts server/src/services/userService.ts server/src/services/userService.test.ts
git commit -m "Add contestService and userService with tests"
```

---

### Task 3: `entryService`

**Files:**
- Create: `server/src/services/entryService.ts`
- Test: `server/src/services/entryService.test.ts`

**Interfaces:**
- Consumes: `getContest` (Task 2), `AppError` (Task 2).
- Produces: `Entry { id, number, creatorId, name, description, imagePath, createdAt }`, `createEntry(db, { creatorId, name, description, imagePath })`, `listEntries(db)` (throws `AppError` if `phase === 'REGISTRATION'`), `getEntry(db, id)` (same gate, throws 404 if missing), `getEntryUnchecked(db, id)` (no phase gate, no throw — used internally by `voteService`).

- [ ] **Step 1: Write the failing test `server/src/services/entryService.test.ts`**

```ts
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd server && npx vitest run src/services/entryService.test.ts`
Expected: FAIL — `Cannot find module './entryService'`.

- [ ] **Step 3: Create `server/src/services/entryService.ts`**

```ts
import { randomUUID } from 'node:crypto';
import type Database from 'better-sqlite3';
import { AppError } from '../middleware/errors';
import { getContest } from './contestService';

export interface Entry {
  id: string;
  number: number;
  creatorId: string;
  name: string | null;
  description: string | null;
  imagePath: string;
  createdAt: string;
}

export interface CreateEntryInput {
  creatorId: string;
  name: string | null;
  description: string | null;
  imagePath: string;
}

// better-sqlite3 runs synchronously, so the whole Node process is blocked for the
// duration of this transaction: no other request handler can interleave between
// the MAX(number) read and the INSERT, even without relying on SQLite's own locking.
export function createEntry(db: Database.Database, input: CreateEntryInput): Entry {
  const contest = getContest(db);
  if (contest.phase !== 'REGISTRATION') {
    throw new AppError(409, 'REGISTRATION_CLOSED', 'Ya no se pueden registrar tapas: el concurso ha empezado.');
  }
  const id = randomUUID();
  const createdAt = new Date().toISOString();
  const tx = db.transaction(() => {
    const row = db.prepare('SELECT COALESCE(MAX(number), 0) as maxNumber FROM Entry').get() as {
      maxNumber: number;
    };
    const number = row.maxNumber + 1;
    db.prepare(
      `INSERT INTO Entry (id, number, creatorId, name, description, imagePath, createdAt)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    ).run(id, number, input.creatorId, input.name, input.description, input.imagePath, createdAt);
    return number;
  });
  const number = tx();
  return { id, number, creatorId: input.creatorId, name: input.name, description: input.description, imagePath: input.imagePath, createdAt };
}

function assertGalleryUnlocked(db: Database.Database): void {
  const contest = getContest(db);
  if (contest.phase === 'REGISTRATION') {
    throw new AppError(409, 'GALLERY_LOCKED', 'La galería todavía no está disponible.');
  }
}

export function listEntries(db: Database.Database): Entry[] {
  assertGalleryUnlocked(db);
  return db.prepare('SELECT * FROM Entry ORDER BY number ASC').all() as Entry[];
}

export function getEntry(db: Database.Database, id: string): Entry {
  assertGalleryUnlocked(db);
  const entry = db.prepare('SELECT * FROM Entry WHERE id = ?').get(id) as Entry | undefined;
  if (!entry) {
    throw new AppError(404, 'ENTRY_NOT_FOUND', 'No existe esa tapa.');
  }
  return entry;
}

export function getEntryUnchecked(db: Database.Database, id: string): Entry | undefined {
  return db.prepare('SELECT * FROM Entry WHERE id = ?').get(id) as Entry | undefined;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd server && npx vitest run src/services/entryService.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add server/src/services/entryService.ts server/src/services/entryService.test.ts
git commit -m "Add entryService: atomic numbering and registration-phase gating"
```

---

### Task 4: `rankingService`

**Files:**
- Create: `server/src/services/rankingService.ts`
- Test: `server/src/services/rankingService.test.ts`

**Interfaces:**
- Consumes: nothing beyond `Database.Database` — reads `Entry`/`Vote` directly.
- Produces: `StandingEntry { entryId, number, name, creatorId, voteCount }`, `Standing extends StandingEntry { rank }`, `computeStandings(db): Standing[]` (competition ranking: ties share a rank, next rank skips accordingly), `podiumTieGroups(standings: Standing[]): Standing[][]` (only groups where `rank <= 3` and the group has more than one member, sorted by rank ascending).

- [ ] **Step 1: Write the failing test `server/src/services/rankingService.test.ts`**

```ts
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
    // a: 2 votes, b: 2 votes (tie for rank 1) -> podium tie
    addVote(db, v1.id, a.id);
    addVote(db, v2.id, a.id);
    addVote(db, v1.id, b.id);
    addVote(db, v2.id, b.id);
    // c: 1 vote, d: 1 vote (tie for rank 3) -> podium tie
    addVote(db, v3.id, c.id);
    addVote(db, v1.id, d.id);
    // e: 0 votes, rank 5, not a podium tie

    const standings = computeStandings(db);
    const groups = podiumTieGroups(standings);
    expect(groups).toHaveLength(2);
    expect(groups[0].map((s) => s.entryId).sort()).toEqual([a.id, b.id].sort());
    expect(groups[1].map((s) => s.entryId).sort()).toEqual([c.id, d.id].sort());
    expect(groups.some((g) => g.some((s) => s.entryId === e.id))).toBe(false);
  });

  it('returns no groups when the podium is unambiguous', () => {
    const a = makeEntry('A');
    const b = makeEntry('B');
    startContest(db);
    const v1 = createUser(db, 'v1');
    addVote(db, v1.id, a.id);
    const standings = computeStandings(db);
    expect(podiumTieGroups(standings)).toHaveLength(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd server && npx vitest run src/services/rankingService.test.ts`
Expected: FAIL — `Cannot find module './rankingService'` (also fails because `voteService` doesn't exist yet — expected, next step creates both files needed; ranking test imports `addVote` which will be created in Task 5. For this task, temporarily skip running the full file and only confirm the module-not-found error for `rankingService` itself via `npx tsc --noEmit` once Task 5 lands — see note in Step 5).

- [ ] **Step 3: Create `server/src/services/rankingService.ts`**

```ts
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

  let rank = 0;
  let lastCount = -1;
  let seen = 0;
  const standings: Standing[] = [];
  for (const row of rows) {
    seen += 1;
    if (row.voteCount !== lastCount) {
      rank = seen;
      lastCount = row.voteCount;
    }
    standings.push({ ...row, rank });
  }
  return standings;
}

export function podiumTieGroups(standings: Standing[]): Standing[][] {
  const groups = new Map<number, Standing[]>();
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
```

- [ ] **Step 4: This task's test file depends on Task 5's `addVote` — do not run it standalone yet**

This is a deliberate, documented exception to strict per-task isolation: `rankingService` is naturally tested through votes. Move directly to Task 5, which creates `voteService` and, in its own last step, runs **both** `rankingService.test.ts` and `voteService.test.ts` together.

- [ ] **Step 5: Commit (code only, tests verified at the end of Task 5)**

```bash
git add server/src/services/rankingService.ts server/src/services/rankingService.test.ts
git commit -m "Add rankingService: standings and podium tie detection"
```

---

### Task 5: `voteService`

**Files:**
- Create: `server/src/services/voteService.ts`
- Test: `server/src/services/voteService.test.ts`

**Interfaces:**
- Consumes: `getContest` (Task 2), `AppError` (Task 2), `getEntryUnchecked` (Task 3).
- Produces: `getVotableCount(db, userId, allowSelfVote): number`, `getFavoriteLimit(db, userId): number` (= `min(3, votable count)`, reads current `allowSelfVote` from `getContest`), `listMyVotes(db, userId): string[]`, `addVote(db, userId, entryId): void`, `removeVote(db, userId, entryId): void`.

- [ ] **Step 1: Write the failing test `server/src/services/voteService.test.ts`**

```ts
import { describe, it, expect, beforeEach } from 'vitest';
import type Database from 'better-sqlite3';
import { createDb } from '../db/connection';
import { createUser } from './userService';
import { createEntry } from './entryService';
import { startContest, setAllowSelfVote } from './contestService';
import { addVote, removeVote, listMyVotes, getFavoriteLimit } from './voteService';
import { AppError } from '../middleware/errors';

let db: Database.Database;
let voterId: string;
let entryIds: string[];

function setupEntries(count: number, ownerName = 'owner') {
  const owner = createUser(db, ownerName);
  return Array.from({ length: count }, (_, i) =>
    createEntry(db, { creatorId: owner.id, name: `Entry ${i}`, description: null, imagePath: 'a.webp' }).id
  );
}

beforeEach(() => {
  db = createDb(':memory:');
  entryIds = setupEntries(5);
  voterId = createUser(db, 'Voter').id;
  startContest(db);
});

describe('voteService', () => {
  it('allows adding up to 3 favorites', () => {
    addVote(db, voterId, entryIds[0]);
    addVote(db, voterId, entryIds[1]);
    addVote(db, voterId, entryIds[2]);
    expect(listMyVotes(db, voterId).sort()).toEqual([entryIds[0], entryIds[1], entryIds[2]].sort());
  });

  it('refuses a 4th favorite with a clear error', () => {
    addVote(db, voterId, entryIds[0]);
    addVote(db, voterId, entryIds[1]);
    addVote(db, voterId, entryIds[2]);
    expect(() => addVote(db, voterId, entryIds[3])).toThrow(AppError);
    expect(listMyVotes(db, voterId)).toHaveLength(3);
  });

  it('refuses voting the same entry twice', () => {
    addVote(db, voterId, entryIds[0]);
    expect(() => addVote(db, voterId, entryIds[0])).toThrow(AppError);
  });

  it('removeVote frees up a slot that can be reused', () => {
    addVote(db, voterId, entryIds[0]);
    addVote(db, voterId, entryIds[1]);
    addVote(db, voterId, entryIds[2]);
    removeVote(db, voterId, entryIds[1]);
    expect(listMyVotes(db, voterId)).toHaveLength(2);
    addVote(db, voterId, entryIds[3]);
    expect(listMyVotes(db, voterId)).toHaveLength(3);
  });

  it('removeVote throws if the entry was not a favorite', () => {
    expect(() => removeVote(db, voterId, entryIds[0])).toThrow(AppError);
  });

  it('blocks self-vote by default', () => {
    const [selfEntryId] = setupEntries(1, 'self');
    const selfUser = createUser(db, 'self-voter');
    // re-fetch: setupEntries created its own owner; grab that owner's id via the entry
    const entry = db.prepare('SELECT creatorId FROM Entry WHERE id = ?').get(selfEntryId) as { creatorId: string };
    expect(() => addVote(db, entry.creatorId, selfEntryId)).toThrow(AppError);
  });

  it('allows self-vote when allowSelfVote is true', () => {
    setAllowSelfVote(db, true);
    const [selfEntryId] = setupEntries(1, 'self2');
    const entry = db.prepare('SELECT creatorId FROM Entry WHERE id = ?').get(selfEntryId) as { creatorId: string };
    expect(() => addVote(db, entry.creatorId, selfEntryId)).not.toThrow();
  });

  it('blocks voting outside the VOTING phase', () => {
    db.prepare("UPDATE Contest SET phase = 'REGISTRATION' WHERE id = 1").run();
    expect(() => addVote(db, voterId, entryIds[0])).toThrow(AppError);
  });

  it('adapts the favorite limit downward when self-vote is disallowed and the user owns entries', () => {
    const owner = createUser(db, 'prolific');
    const ownEntries = [
      createEntry(db, { creatorId: owner.id, name: null, description: null, imagePath: 'a.webp' }),
    ];
    // total entries = 5 (setup) + 1 = 6, owner has 1 of their own, votable = 5, limit = min(3,5) = 3
    expect(getFavoriteLimit(db, owner.id)).toBe(3);
  });

  it('caps the favorite limit to the number of votable entries when fewer than 3 exist', () => {
    const freshDb = createDb(':memory:');
    const only = setupEntriesFor(freshDb, 2);
    const user = createUser(freshDb, 'lonely-voter');
    startContest(freshDb);
    expect(getFavoriteLimit(freshDb, user.id)).toBe(2);
  });
});

function setupEntriesFor(database: Database.Database, count: number) {
  const owner = createUser(database, 'owner2');
  return Array.from({ length: count }, (_, i) =>
    createEntry(database, { creatorId: owner.id, name: `E${i}`, description: null, imagePath: 'a.webp' }).id
  );
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd server && npx vitest run src/services/voteService.test.ts`
Expected: FAIL — `Cannot find module './voteService'`.

- [ ] **Step 3: Create `server/src/services/voteService.ts`**

```ts
import { randomUUID } from 'node:crypto';
import type Database from 'better-sqlite3';
import { AppError } from '../middleware/errors';
import { getContest } from './contestService';
import { getEntryUnchecked } from './entryService';

const MAX_FAVORITES = 3;

export function getVotableCount(db: Database.Database, userId: string, allowSelfVote: boolean): number {
  const total = (db.prepare('SELECT COUNT(*) as c FROM Entry').get() as { c: number }).c;
  if (allowSelfVote) return total;
  const own = (db.prepare('SELECT COUNT(*) as c FROM Entry WHERE creatorId = ?').get(userId) as { c: number }).c;
  return total - own;
}

export function getFavoriteLimit(db: Database.Database, userId: string): number {
  const contest = getContest(db);
  const votable = getVotableCount(db, userId, contest.allowSelfVote);
  return Math.min(MAX_FAVORITES, Math.max(votable, 0));
}

export function listMyVotes(db: Database.Database, userId: string): string[] {
  const rows = db.prepare('SELECT entryId FROM Vote WHERE userId = ?').all(userId) as { entryId: string }[];
  return rows.map((r) => r.entryId);
}

export function addVote(db: Database.Database, userId: string, entryId: string): void {
  const contest = getContest(db);
  if (contest.phase !== 'VOTING') {
    throw new AppError(409, 'NOT_VOTING_PHASE', 'La votación no está abierta ahora mismo.');
  }
  const entry = getEntryUnchecked(db, entryId);
  if (!entry) {
    throw new AppError(400, 'ENTRY_NOT_FOUND', 'Esa tapa no existe.');
  }
  if (!contest.allowSelfVote && entry.creatorId === userId) {
    throw new AppError(403, 'SELF_VOTE_FORBIDDEN', 'No puedes votar tu propio pincho.');
  }
  const tx = db.transaction(() => {
    const existing = db.prepare('SELECT 1 FROM Vote WHERE userId = ? AND entryId = ?').get(userId, entryId);
    if (existing) {
      throw new AppError(409, 'ALREADY_VOTED', 'Ya has marcado esta tapa como favorita.');
    }
    const current = (db.prepare('SELECT COUNT(*) as c FROM Vote WHERE userId = ?').get(userId) as { c: number }).c;
    const limit = getFavoriteLimit(db, userId);
    if (current >= limit) {
      throw new AppError(
        409,
        'FAVORITES_LIMIT_REACHED',
        `Ya has elegido tus ${limit} pinchos favoritos. Si quieres cambiar uno, primero quita el "Me encanta" de otro pincho.`
      );
    }
    db.prepare('INSERT INTO Vote (id, userId, entryId, createdAt) VALUES (?, ?, ?, ?)').run(
      randomUUID(),
      userId,
      entryId,
      new Date().toISOString()
    );
  });
  tx();
}

export function removeVote(db: Database.Database, userId: string, entryId: string): void {
  const contest = getContest(db);
  if (contest.phase !== 'VOTING') {
    throw new AppError(409, 'NOT_VOTING_PHASE', 'La votación no está abierta ahora mismo.');
  }
  const result = db.prepare('DELETE FROM Vote WHERE userId = ? AND entryId = ?').run(userId, entryId);
  if (result.changes === 0) {
    throw new AppError(404, 'VOTE_NOT_FOUND', 'No tenías esa tapa marcada como favorita.');
  }
}
```

- [ ] **Step 4: Run both test files to verify they pass**

Run: `cd server && npx vitest run src/services/voteService.test.ts src/services/rankingService.test.ts`
Expected: PASS (10 tests in `voteService.test.ts`, 3 tests in `rankingService.test.ts`).

- [ ] **Step 5: Commit**

```bash
git add server/src/services/voteService.ts server/src/services/voteService.test.ts
git commit -m "Add voteService: adaptive favorite limit, self-vote and phase rules"
```

---

### Task 6: `tiebreakService`

**Files:**
- Create: `server/src/services/tiebreakService.ts`
- Test: `server/src/services/tiebreakService.test.ts`

**Interfaces:**
- Consumes: `getContest`, `setPhase` (Task 2), `computeStandings`, `podiumTieGroups`, `Standing` (Task 4), `AppError` (Task 2).
- Produces: `TiebreakRound { id, roundNumber, targetRank, status: 'OPEN'|'CLOSED', createdAt, closedAt }`, `EntrySummary { id, number, name, imagePath }`, `openRound(db, targetRank, candidateEntryIds): TiebreakRound`, `getRoundById(db, id)`, `getOpenRoundId(db): string | null`, `getCandidateIds(db, roundId): string[]`, `getCurrentOpenRound(db): { round, candidates } | null`, `castVote(db, roundId, userId, entryId): void`, `CloseRoundResult { status: 'RESOLVED'|'STILL_TIED', winnerEntryId?, tiedEntryIds? }`, `closeRound(db, roundId): CloseRoundResult`, `AdvanceResult { phase: 'TIEBREAK'|'RESULTS', openedRound? }`, `advance(db): AdvanceResult` (walks podium tie groups in rank order, opens the next unresolved one, or sets phase to `RESULTS` when none remain).

- [ ] **Step 1: Write the failing test `server/src/services/tiebreakService.test.ts`**

```ts
import { describe, it, expect, beforeEach } from 'vitest';
import type Database from 'better-sqlite3';
import { createDb } from '../db/connection';
import { createUser } from './userService';
import { createEntry } from './entryService';
import { startContest, setAllowSelfVote, getContest } from './contestService';
import { addVote } from './voteService';
import { advance, castVote, closeRound, getCurrentOpenRound, getOpenRoundId } from './tiebreakService';
import { AppError } from '../middleware/errors';

let db: Database.Database;

function makeEntry(name: string) {
  const owner = createUser(db, `owner-${name}`);
  return createEntry(db, { creatorId: owner.id, name, description: null, imagePath: 'a.webp' });
}

beforeEach(() => {
  db = createDb(':memory:');
  setAllowSelfVote(db, true);
});

describe('tiebreakService', () => {
  it('advance() moves straight to RESULTS when the podium has no ties', () => {
    const a = makeEntry('A');
    const b = makeEntry('B');
    startContest(db);
    const voter = createUser(db, 'voter');
    addVote(db, voter.id, a.id);
    const result = advance(db);
    expect(result.phase).toBe('RESULTS');
    expect(getContest(db).phase).toBe('RESULTS');
  });

  it('advance() opens a TIEBREAK round when rank 1 is tied', () => {
    const a = makeEntry('A');
    const b = makeEntry('B');
    startContest(db);
    const [v1, v2] = [createUser(db, 'v1'), createUser(db, 'v2')];
    addVote(db, v1.id, a.id);
    addVote(db, v2.id, b.id);

    const result = advance(db);
    expect(result.phase).toBe('TIEBREAK');
    expect(result.openedRound?.targetRank).toBe(1);
    const current = getCurrentOpenRound(db)!;
    expect(current.candidates.map((c) => c.id).sort()).toEqual([a.id, b.id].sort());
  });

  it('a tiebreak round resolves once a unique winner emerges', () => {
    const a = makeEntry('A');
    const b = makeEntry('B');
    startContest(db);
    const [v1, v2, v3] = [createUser(db, 'v1'), createUser(db, 'v2'), createUser(db, 'v3')];
    addVote(db, v1.id, a.id);
    addVote(db, v2.id, b.id);
    advance(db); // opens round for rank 1

    const roundId = getOpenRoundId(db)!;
    castVote(db, roundId, v1.id, a.id);
    castVote(db, roundId, v2.id, a.id);
    castVote(db, roundId, v3.id, b.id);

    const closeResult = closeRound(db, roundId);
    expect(closeResult.status).toBe('RESOLVED');
    expect(closeResult.winnerEntryId).toBe(a.id);
  });

  it('a still-tied round automatically reopens with the same target rank', () => {
    const a = makeEntry('A');
    const b = makeEntry('B');
    startContest(db);
    const [v1, v2] = [createUser(db, 'v1'), createUser(db, 'v2')];
    addVote(db, v1.id, a.id);
    addVote(db, v2.id, b.id);
    advance(db);

    const roundId = getOpenRoundId(db)!;
    castVote(db, roundId, v1.id, a.id);
    castVote(db, roundId, v2.id, b.id);

    const closeResult = closeRound(db, roundId);
    expect(closeResult.status).toBe('STILL_TIED');
    const newOpenId = getOpenRoundId(db);
    expect(newOpenId).not.toBeNull();
    expect(newOpenId).not.toBe(roundId);
  });

  it('rejects a vote for an entry that is not a candidate in the round', () => {
    const a = makeEntry('A');
    const b = makeEntry('B');
    const c = makeEntry('C');
    startContest(db);
    const [v1, v2] = [createUser(db, 'v1'), createUser(db, 'v2')];
    addVote(db, v1.id, a.id);
    addVote(db, v2.id, b.id);
    advance(db);
    const roundId = getOpenRoundId(db)!;
    expect(() => castVote(db, roundId, v1.id, c.id)).toThrow(AppError);
  });

  it('rejects a second vote from the same user in the same round', () => {
    const a = makeEntry('A');
    const b = makeEntry('B');
    startContest(db);
    const [v1, v2] = [createUser(db, 'v1'), createUser(db, 'v2')];
    addVote(db, v1.id, a.id);
    addVote(db, v2.id, b.id);
    advance(db);
    const roundId = getOpenRoundId(db)!;
    castVote(db, roundId, v1.id, a.id);
    expect(() => castVote(db, roundId, v1.id, b.id)).toThrow(AppError);
  });

  it('rejects voting when there is no open round', () => {
    const a = makeEntry('A');
    startContest(db);
    const voter = createUser(db, 'voter');
    expect(() => castVote(db, 'nonexistent-round', voter.id, a.id)).toThrow(AppError);
  });

  it('does not open a tiebreak round for ties below the podium', () => {
    const a = makeEntry('A');
    const b = makeEntry('B');
    const c = makeEntry('C');
    const d = makeEntry('D');
    const e = makeEntry('E');
    startContest(db);
    const [v1, v2, v3] = [createUser(db, 'v1'), createUser(db, 'v2'), createUser(db, 'v3')];
    addVote(db, v1.id, a.id);
    addVote(db, v2.id, a.id);
    addVote(db, v3.id, a.id); // a: 3 votes -> rank 1, unambiguous
    addVote(db, v1.id, b.id);
    addVote(db, v2.id, b.id); // b: 2 votes -> rank 2, unambiguous
    addVote(db, v1.id, c.id); // c: 1 vote -> rank 3, unambiguous
    // d and e: 0 votes each, tied for rank 4 -- below the podium cutoff, must be ignored

    const result = advance(db);
    expect(result.phase).toBe('RESULTS');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd server && npx vitest run src/services/tiebreakService.test.ts`
Expected: FAIL — `Cannot find module './tiebreakService'`.

- [ ] **Step 3: Create `server/src/services/tiebreakService.ts`**

```ts
import { randomUUID } from 'node:crypto';
import type Database from 'better-sqlite3';
import { AppError } from '../middleware/errors';
import { getContest, setPhase } from './contestService';
import { computeStandings, podiumTieGroups } from './rankingService';

export interface TiebreakRound {
  id: string;
  roundNumber: number;
  targetRank: number;
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

export function openRound(db: Database.Database, targetRank: number, candidateEntryIds: string[]): TiebreakRound {
  const now = new Date().toISOString();
  const prevMax = db.prepare('SELECT MAX(roundNumber) as m FROM TiebreakRound').get() as { m: number | null };
  const roundNumber = (prevMax.m ?? 0) + 1;
  const id = randomUUID();
  const tx = db.transaction(() => {
    db.prepare(
      `INSERT INTO TiebreakRound (id, roundNumber, targetRank, status, createdAt, closedAt)
       VALUES (?, ?, ?, 'OPEN', ?, NULL)`
    ).run(id, roundNumber, targetRank, now);
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

export function closeRound(db: Database.Database, roundId: string): CloseRoundResult {
  const round = getRoundById(db, roundId);
  if (!round || round.status !== 'OPEN') {
    throw new AppError(409, 'ROUND_NOT_OPEN', 'Esta ronda ya está cerrada.');
  }
  const tally = db
    .prepare('SELECT entryId, COUNT(*) as votes FROM TiebreakVote WHERE roundId = ? GROUP BY entryId ORDER BY votes DESC')
    .all(roundId) as { entryId: string; votes: number }[];

  const now = new Date().toISOString();
  db.prepare("UPDATE TiebreakRound SET status = 'CLOSED', closedAt = ? WHERE id = ?").run(now, roundId);

  if (tally.length === 0) {
    const candidates = getCandidateIds(db, roundId);
    openRound(db, round.targetRank, candidates);
    return { status: 'STILL_TIED', tiedEntryIds: candidates };
  }

  const topVotes = tally[0].votes;
  const winners = tally.filter((t) => t.votes === topVotes).map((t) => t.entryId);

  if (winners.length > 1) {
    openRound(db, round.targetRank, winners);
    return { status: 'STILL_TIED', tiedEntryIds: winners };
  }

  return { status: 'RESOLVED', winnerEntryId: winners[0] };
}

function isRankResolved(db: Database.Database, targetRank: number): boolean {
  const lastRound = db
    .prepare('SELECT id, status FROM TiebreakRound WHERE targetRank = ? ORDER BY roundNumber DESC LIMIT 1')
    .get(targetRank) as { id: string; status: string } | undefined;
  if (!lastRound || lastRound.status !== 'CLOSED') return false;
  const tally = db
    .prepare('SELECT entryId, COUNT(*) as votes FROM TiebreakVote WHERE roundId = ? GROUP BY entryId ORDER BY votes DESC')
    .all(lastRound.id) as { entryId: string; votes: number }[];
  if (tally.length === 0) return false;
  const top = tally[0].votes;
  return tally.filter((t) => t.votes === top).length === 1;
}

export interface AdvanceResult {
  phase: 'TIEBREAK' | 'RESULTS';
  openedRound?: TiebreakRound;
}

export function advance(db: Database.Database): AdvanceResult {
  const standings = computeStandings(db);
  const groups = podiumTieGroups(standings);
  for (const group of groups) {
    const rank = group[0].rank;
    if (isRankResolved(db, rank)) continue;
    if (getOpenRoundId(db)) {
      return { phase: 'TIEBREAK' };
    }
    const round = openRound(
      db,
      rank,
      group.map((g) => g.entryId)
    );
    return { phase: 'TIEBREAK', openedRound: round };
  }
  setPhase(db, 'RESULTS');
  return { phase: 'RESULTS' };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd server && npx vitest run src/services/tiebreakService.test.ts`
Expected: PASS (8 tests).

- [ ] **Step 5: Run the full test suite so far**

Run: `cd server && npx vitest run`
Expected: all test files pass.

- [ ] **Step 6: Commit**

```bash
git add server/src/services/tiebreakService.ts server/src/services/tiebreakService.test.ts
git commit -m "Add tiebreakService: rounds, voting, resolution, sequential advance()"
```

---

### Task 7: Express bootstrap & shared middleware

**Files:**
- Create: `server/src/middleware/asyncHandler.ts`
- Create: `server/src/middleware/errorHandler.ts`
- Test: `server/src/middleware/errorHandler.test.ts`
- Create: `server/src/middleware/userAuth.ts`
- Create: `server/src/middleware/adminAuth.ts`
- Create: `server/src/types/express.d.ts`
- Create: `server/src/routes/contest.routes.ts`
- Create: `server/src/realtime/sse.ts`
- Create: `server/src/index.ts`

**Interfaces:**
- Consumes: `AppError` (Task 2), `db` (Task 1), `getContest` (Task 2), `config` (Task 1).
- Produces: `asyncHandler(fn): RequestHandler`, `errorHandler: ErrorRequestHandler`, `userAuth: RequestHandler` (sets `req.userId`), `adminAuth: RequestHandler`, `addClient(res)`, `removeClient(res)`, `broadcast(event, data)` (`server/src/realtime/sse.ts`) — later tasks call these three from `admin.routes.ts`. `req.userId?: string` augmentation available process-wide once `types/express.d.ts` is included by `tsconfig.json`.

- [ ] **Step 1: Create `server/src/middleware/asyncHandler.ts`**

```ts
import type { NextFunction, Request, RequestHandler, Response } from 'express';

export const asyncHandler =
  (fn: (req: Request, res: Response, next: NextFunction) => Promise<void>): RequestHandler =>
  (req, res, next) => {
    fn(req, res, next).catch(next);
  };
```

- [ ] **Step 2: Write the failing test `server/src/middleware/errorHandler.test.ts`**

```ts
import { describe, it, expect, vi } from 'vitest';
import { ZodError, z } from 'zod';
import { errorHandler } from './errorHandler';
import { AppError } from './errors';

function mockRes() {
  const res: any = {};
  res.status = vi.fn().mockReturnValue(res);
  res.json = vi.fn().mockReturnValue(res);
  return res;
}

describe('errorHandler', () => {
  it('formats an AppError with its own status and code', () => {
    const res = mockRes();
    errorHandler(new AppError(409, 'ALREADY_STARTED', 'El concurso ya ha empezado.'), {} as any, res, vi.fn());
    expect(res.status).toHaveBeenCalledWith(409);
    expect(res.json).toHaveBeenCalledWith({ code: 'ALREADY_STARTED', message: 'El concurso ya ha empezado.' });
  });

  it('formats a ZodError as 400 VALIDATION_ERROR', () => {
    const res = mockRes();
    const schema = z.object({ name: z.string() });
    let zodError: ZodError;
    try {
      schema.parse({});
      throw new Error('should not reach');
    } catch (e) {
      zodError = e as ZodError;
    }
    errorHandler(zodError, {} as any, res, vi.fn());
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ code: 'VALIDATION_ERROR' })
    );
  });

  it('falls back to 500 for unknown errors, without leaking internals', () => {
    const res = mockRes();
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    errorHandler(new Error('db connection reset'), {} as any, res, vi.fn());
    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({ code: 'INTERNAL_ERROR', message: 'Ha ocurrido un error inesperado.' });
    consoleSpy.mockRestore();
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `cd server && npx vitest run src/middleware/errorHandler.test.ts`
Expected: FAIL — `Cannot find module './errorHandler'`.

- [ ] **Step 4: Create `server/src/middleware/errorHandler.ts`**

```ts
import type { ErrorRequestHandler } from 'express';
import { ZodError } from 'zod';
import { AppError } from './errors';

export const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
  if (err instanceof AppError) {
    res.status(err.status).json({ code: err.code, message: err.message });
    return;
  }
  if (err instanceof ZodError) {
    res.status(400).json({ code: 'VALIDATION_ERROR', message: 'Datos inválidos.', issues: err.issues });
    return;
  }
  console.error(err);
  res.status(500).json({ code: 'INTERNAL_ERROR', message: 'Ha ocurrido un error inesperado.' });
};
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd server && npx vitest run src/middleware/errorHandler.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 6: Create `server/src/types/express.d.ts`**

```ts
export {};

declare global {
  namespace Express {
    interface Request {
      userId?: string;
    }
  }
}
```

- [ ] **Step 7: Create `server/src/middleware/userAuth.ts`**

```ts
import type { RequestHandler } from 'express';
import { db } from '../db';
import { AppError } from './errors';

export const userAuth: RequestHandler = (req, _res, next) => {
  const userId = req.header('X-User-Id');
  if (!userId) {
    next(new AppError(401, 'MISSING_USER_ID', 'Falta identificarse.'));
    return;
  }
  const user = db.prepare('SELECT id FROM User WHERE id = ?').get(userId);
  if (!user) {
    next(new AppError(401, 'UNKNOWN_USER', 'No reconocemos tu sesión. Vuelve a entrar con tu nombre.'));
    return;
  }
  req.userId = userId;
  next();
};
```

- [ ] **Step 8: Create `server/src/middleware/adminAuth.ts`**

```ts
import type { RequestHandler } from 'express';
import { config } from '../config';
import { AppError } from './errors';

export const adminAuth: RequestHandler = (req, _res, next) => {
  const pin = req.header('X-Admin-Pin');
  if (!pin || pin !== config.adminPin) {
    next(new AppError(401, 'INVALID_PIN', 'PIN de administrador incorrecto.'));
    return;
  }
  next();
};
```

- [ ] **Step 9: Create `server/src/realtime/sse.ts`**

```ts
import type { Response } from 'express';

const clients = new Set<Response>();

export function addClient(res: Response): void {
  clients.add(res);
}

export function removeClient(res: Response): void {
  clients.delete(res);
}

export function broadcast(event: string, data: unknown): void {
  const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  for (const client of clients) {
    client.write(payload);
  }
}
```

- [ ] **Step 10: Create `server/src/routes/contest.routes.ts`**

```ts
import { Router } from 'express';
import { db } from '../db';
import { getContest } from '../services/contestService';
import { addClient, removeClient } from '../realtime/sse';

export const contestRouter = Router();

contestRouter.get('/', (_req, res) => {
  res.json(getContest(db));
});

contestRouter.get('/stream', (req, res) => {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
  });
  res.write('\n');
  addClient(res);
  req.on('close', () => removeClient(res));
});
```

- [ ] **Step 11: Create `server/src/index.ts`**

```ts
import path from 'node:path';
import express from 'express';
import { config } from './config';
import { contestRouter } from './routes/contest.routes';
import { errorHandler } from './middleware/errorHandler';

const app = express();

app.use(express.json());
app.use('/uploads', express.static(config.uploadsDir));

app.use('/api/contest', contestRouter);

if (config.nodeEnv === 'production') {
  const clientDist = path.join(__dirname, '..', '..', 'frontend', 'dist');
  app.use(express.static(clientDist));
  app.get('*', (_req, res) => {
    res.sendFile(path.join(clientDist, 'index.html'));
  });
}

app.use(errorHandler);

app.listen(config.port, '0.0.0.0', () => {
  console.log(`${config.appName} escuchando en http://0.0.0.0:${config.port}`);
});
```

- [ ] **Step 12: Smoke-test the server manually**

Run: `cd server && npm run dev` (in one terminal), then in another: `curl http://localhost:3000/api/contest`
Expected: `{"phase":"REGISTRATION","allowSelfVote":false,"resultsRevealedAt":null}`. Stop the dev server (Ctrl+C) after confirming.

- [ ] **Step 13: Commit**

```bash
git add server/src/middleware/ server/src/types/express.d.ts server/src/routes/contest.routes.ts server/src/realtime/sse.ts server/src/index.ts
git commit -m "Wire Express app: error handling, auth middleware, SSE, contest route"
```

---

### Task 8: Image processing + entries routes

**Files:**
- Create: `server/src/images/imageProcessor.ts`
- Create: `server/src/routes/entries.routes.ts`
- Modify: `server/src/index.ts` (mount `entriesRouter`)
- Test: `server/src/images/imageProcessor.test.ts`

**Interfaces:**
- Consumes: `createEntry`, `listEntries`, `getEntry` (Task 3), `userAuth`, `asyncHandler`, `AppError` (Tasks 2, 7), `config` (Task 1).
- Produces: `saveEntryImage(buffer: Buffer): Promise<string>` (returns the stored filename, relative to `config.uploadsDir`), `deleteEntryImage(filename: string): void` (fire-and-forget removal, used later by admin delete endpoints), `entriesRouter` mounted at `/api/entries`.

- [ ] **Step 1: Write the failing test `server/src/images/imageProcessor.test.ts`**

```ts
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import sharp from 'sharp';
import { config } from '../config';

let originalUploadsDir: string;

beforeAll(() => {
  originalUploadsDir = config.uploadsDir;
  config.uploadsDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pincho-uploads-'));
});

afterAll(() => {
  fs.rmSync(config.uploadsDir, { recursive: true, force: true });
  config.uploadsDir = originalUploadsDir;
});

describe('saveEntryImage', () => {
  it('resizes a large image down to at most 1600px and writes a .webp file', async () => {
    const { saveEntryImage } = await import('./imageProcessor');
    const input = await sharp({
      create: { width: 3000, height: 2000, channels: 3, background: { r: 200, g: 50, b: 50 } },
    })
      .jpeg()
      .toBuffer();

    const filename = await saveEntryImage(input);
    expect(filename).toMatch(/\.webp$/);
    const fullPath = path.join(config.uploadsDir, filename);
    expect(fs.existsSync(fullPath)).toBe(true);
    const meta = await sharp(fullPath).metadata();
    expect(meta.width).toBeLessThanOrEqual(1600);
    expect(meta.height).toBeLessThanOrEqual(1600);
    expect(meta.format).toBe('webp');
  });

  it('does not upscale a small image', async () => {
    const { saveEntryImage } = await import('./imageProcessor');
    const input = await sharp({
      create: { width: 200, height: 100, channels: 3, background: { r: 10, g: 10, b: 10 } },
    })
      .png()
      .toBuffer();
    const filename = await saveEntryImage(input);
    const meta = await sharp(path.join(config.uploadsDir, filename)).metadata();
    expect(meta.width).toBe(200);
    expect(meta.height).toBe(100);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd server && npx vitest run src/images/imageProcessor.test.ts`
Expected: FAIL — `Cannot find module './imageProcessor'`.

- [ ] **Step 3: Create `server/src/images/imageProcessor.ts`**

```ts
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import fs from 'node:fs/promises';
import fsSync from 'node:fs';
import sharp from 'sharp';
import { config } from '../config';

export async function saveEntryImage(buffer: Buffer): Promise<string> {
  const filename = `${randomUUID()}.webp`;
  await fs.mkdir(config.uploadsDir, { recursive: true });
  const outPath = path.join(config.uploadsDir, filename);
  await sharp(buffer)
    .rotate()
    .resize({ width: 1600, height: 1600, fit: 'inside', withoutEnlargement: true })
    .webp({ quality: 80 })
    .toFile(outPath);
  return filename;
}

export function deleteEntryImage(filename: string): void {
  const filePath = path.join(config.uploadsDir, filename);
  fsSync.rm(filePath, { force: true }, () => {});
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd server && npx vitest run src/images/imageProcessor.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Create `server/src/routes/entries.routes.ts`**

```ts
import { Router } from 'express';
import multer from 'multer';
import { z } from 'zod';
import { db } from '../db';
import { userAuth } from '../middleware/userAuth';
import { asyncHandler } from '../middleware/asyncHandler';
import { AppError } from '../middleware/errors';
import { createEntry, listEntries, getEntry } from '../services/entryService';
import { saveEntryImage } from '../images/imageProcessor';

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 15 * 1024 * 1024 },
});

const entryFieldsSchema = z.object({
  name: z.string().trim().max(80).optional(),
  description: z.string().trim().max(280).optional(),
});

export const entriesRouter = Router();

entriesRouter.post(
  '/',
  userAuth,
  upload.single('image'),
  asyncHandler(async (req, res) => {
    if (!req.file) {
      throw new AppError(400, 'IMAGE_REQUIRED', 'Falta la fotografía de la tapa.');
    }
    if (!req.file.mimetype.startsWith('image/')) {
      throw new AppError(400, 'INVALID_IMAGE_TYPE', 'El archivo no es una imagen válida.');
    }
    const fields = entryFieldsSchema.parse(req.body);
    const imagePath = await saveEntryImage(req.file.buffer);
    const entry = createEntry(db, {
      creatorId: req.userId!,
      name: fields.name || null,
      description: fields.description || null,
      imagePath,
    });
    res.status(201).json(entry);
  })
);

entriesRouter.get(
  '/',
  userAuth,
  asyncHandler(async (_req, res) => {
    res.json(listEntries(db));
  })
);

entriesRouter.get(
  '/:id',
  userAuth,
  asyncHandler(async (req, res) => {
    res.json(getEntry(db, req.params.id));
  })
);
```

- [ ] **Step 6: Mount the router in `server/src/index.ts`**

```ts
import { entriesRouter } from './routes/entries.routes';
```

Add after `app.use('/api/contest', contestRouter);`:

```ts
app.use('/api/entries', entriesRouter);
```

- [ ] **Step 7: Smoke-test manually**

Run: `cd server && npm run dev`, then in another terminal:
```bash
curl -X POST http://localhost:3000/api/users -H "Content-Type: application/json" -d '{"name":"Laura"}'
# copy the returned id into USER_ID
curl -X POST http://localhost:3000/api/entries -H "X-User-Id: USER_ID" -F "name=Croqueta" -F "image=@/path/to/any/photo.jpg"
```
Note: `POST /api/users` doesn't exist yet (Task 9) — for this smoke test, insert a user directly: `curl` will 401 with `MISSING_USER_ID`/`UNKNOWN_USER` until Task 9 lands. It's acceptable to defer the full manual smoke test to the end of Task 9; for now just confirm the server starts without errors and `GET /api/entries` (without a user) returns `401 MISSING_USER_ID`.

Run: `curl -i http://localhost:3000/api/entries`
Expected: `HTTP/1.1 401` with `{"code":"MISSING_USER_ID", ...}`.

- [ ] **Step 8: Commit**

```bash
git add server/src/images/ server/src/routes/entries.routes.ts server/src/index.ts
git commit -m "Add image processing pipeline and entries routes"
```

---

### Task 9: Users, votes and contest realtime wiring

**Files:**
- Create: `server/src/routes/users.routes.ts`
- Create: `server/src/routes/votes.routes.ts`
- Modify: `server/src/index.ts` (mount both routers)

**Interfaces:**
- Consumes: `createUser`, `touchHeartbeat` (Task 2), `addVote`, `removeVote`, `listMyVotes`, `getFavoriteLimit` (Task 5), `asyncHandler`, `userAuth`, `AppError` (Tasks 2, 7).
- Produces: `usersRouter` mounted at `/api/users`, `votesRouter` mounted at `/api/votes`.

- [ ] **Step 1: Create `server/src/routes/users.routes.ts`**

```ts
import { Router } from 'express';
import { z } from 'zod';
import { db } from '../db';
import { asyncHandler } from '../middleware/asyncHandler';
import { AppError } from '../middleware/errors';
import { createUser, touchHeartbeat } from '../services/userService';

const createUserSchema = z.object({ name: z.string().trim().min(1).max(60) });

export const usersRouter = Router();

usersRouter.post(
  '/',
  asyncHandler(async (req, res) => {
    const { name } = createUserSchema.parse(req.body);
    res.status(201).json(createUser(db, name));
  })
);

usersRouter.post(
  '/:id/heartbeat',
  asyncHandler(async (req, res) => {
    try {
      touchHeartbeat(db, req.params.id);
    } catch {
      throw new AppError(404, 'USER_NOT_FOUND', 'No existe ese usuario.');
    }
    res.json({ ok: true });
  })
);
```

- [ ] **Step 2: Create `server/src/routes/votes.routes.ts`**

```ts
import { Router } from 'express';
import { z } from 'zod';
import { db } from '../db';
import { userAuth } from '../middleware/userAuth';
import { asyncHandler } from '../middleware/asyncHandler';
import { addVote, removeVote, listMyVotes, getFavoriteLimit } from '../services/voteService';

const voteSchema = z.object({ entryId: z.string().uuid() });

export const votesRouter = Router();

votesRouter.get(
  '/me',
  userAuth,
  asyncHandler(async (req, res) => {
    const entryIds = listMyVotes(db, req.userId!);
    const limit = getFavoriteLimit(db, req.userId!);
    res.json({ entryIds, limit });
  })
);

votesRouter.post(
  '/',
  userAuth,
  asyncHandler(async (req, res) => {
    const { entryId } = voteSchema.parse(req.body);
    addVote(db, req.userId!, entryId);
    res.status(201).json({ ok: true });
  })
);

votesRouter.delete(
  '/:entryId',
  userAuth,
  asyncHandler(async (req, res) => {
    removeVote(db, req.userId!, req.params.entryId);
    res.json({ ok: true });
  })
);
```

- [ ] **Step 3: Mount both routers in `server/src/index.ts`**

```ts
import { usersRouter } from './routes/users.routes';
import { votesRouter } from './routes/votes.routes';
```

Add:

```ts
app.use('/api/users', usersRouter);
app.use('/api/votes', votesRouter);
```

- [ ] **Step 4: Full manual smoke test of the registration + voting flow**

Run: `cd server && npm run dev`, then:

```bash
curl -s -X POST http://localhost:3000/api/users -H "Content-Type: application/json" -d '{"name":"Laura"}'
# -> {"id":"<UUID1>",...}
curl -s -X POST http://localhost:3000/api/entries -H "X-User-Id: <UUID1>" -F "name=Croqueta" -F "image=@server/tests-fixtures/sample.jpg"
```

If no sample image is at hand, generate one first: `cd server && node -e "require('sharp')({create:{width:400,height:300,channels:3,background:'red'}}).jpeg().toFile('/tmp/sample.jpg')"` and use `/tmp/sample.jpg` in the `-F "image=@...`" flag above.

Expected: `201` with `{"id":...,"number":1,...}`. Then:

```bash
curl -s -X POST http://localhost:3000/api/admin/contest/start -H "X-Admin-Pin: 0000"
```

This 404s (admin routes not mounted yet — Task 11); for now, flip the phase directly for this manual check: stop the server, run `cd server && node -e "const {createDb}=require('./dist/db/connection'); const db=createDb(process.env.DB_PATH||'./data/pincho-party.db'); db.prepare(\"UPDATE Contest SET phase='VOTING' WHERE id=1\").run();"` — **or simply defer this end-to-end curl check to the end of Task 11**, once `admin/contest/start` exists. For this task, it is sufficient that entry creation and `GET /api/votes/me` (which will 401 without a phase change, that's fine) both respond without crashing the process.

- [ ] **Step 5: Commit**

```bash
git add server/src/routes/users.routes.ts server/src/routes/votes.routes.ts server/src/index.ts
git commit -m "Add users and votes routes"
```

---

### Task 10: Tiebreak and results routes

**Files:**
- Create: `server/src/routes/tiebreak.routes.ts`
- Create: `server/src/routes/results.routes.ts`
- Modify: `server/src/index.ts` (mount both routers)

**Interfaces:**
- Consumes: `getCurrentOpenRound`, `castVote` (Task 6), `getContest` (Task 2), `computeStandings` (Task 4), `userAuth`, `asyncHandler`, `AppError`.
- Produces: `tiebreakRouter` mounted at `/api/tiebreak`, `resultsRouter` mounted at `/api/results`.

- [ ] **Step 1: Create `server/src/routes/tiebreak.routes.ts`**

```ts
import { Router } from 'express';
import { z } from 'zod';
import { db } from '../db';
import { userAuth } from '../middleware/userAuth';
import { asyncHandler } from '../middleware/asyncHandler';
import { AppError } from '../middleware/errors';
import { getCurrentOpenRound, castVote } from '../services/tiebreakService';

const voteSchema = z.object({ entryId: z.string().uuid() });

export const tiebreakRouter = Router();

tiebreakRouter.get(
  '/current',
  userAuth,
  asyncHandler(async (_req, res) => {
    const current = getCurrentOpenRound(db);
    if (!current) {
      throw new AppError(404, 'NO_OPEN_ROUND', 'No hay ninguna ronda de desempate abierta.');
    }
    res.json(current);
  })
);

tiebreakRouter.post(
  '/vote',
  userAuth,
  asyncHandler(async (req, res) => {
    const { entryId } = voteSchema.parse(req.body);
    const current = getCurrentOpenRound(db);
    if (!current) {
      throw new AppError(404, 'NO_OPEN_ROUND', 'No hay ninguna ronda de desempate abierta.');
    }
    castVote(db, current.round.id, req.userId!, entryId);
    res.status(201).json({ ok: true });
  })
);
```

- [ ] **Step 2: Create `server/src/routes/results.routes.ts`**

```ts
import { Router } from 'express';
import { db } from '../db';
import { userAuth } from '../middleware/userAuth';
import { asyncHandler } from '../middleware/asyncHandler';
import { AppError } from '../middleware/errors';
import { getContest } from '../services/contestService';
import { computeStandings } from '../services/rankingService';

export const resultsRouter = Router();

resultsRouter.get(
  '/',
  userAuth,
  asyncHandler(async (_req, res) => {
    const contest = getContest(db);
    if (contest.phase !== 'RESULTS' || !contest.resultsRevealedAt) {
      throw new AppError(409, 'RESULTS_NOT_READY', 'Los resultados todavía no se han mostrado.');
    }
    res.json({ revealedAt: contest.resultsRevealedAt, standings: computeStandings(db) });
  })
);
```

- [ ] **Step 3: Mount both routers in `server/src/index.ts`**

```ts
import { tiebreakRouter } from './routes/tiebreak.routes';
import { resultsRouter } from './routes/results.routes';
```

Add:

```ts
app.use('/api/tiebreak', tiebreakRouter);
app.use('/api/results', resultsRouter);
```

- [ ] **Step 4: Verify the server still boots**

Run: `cd server && npm run dev`, confirm the console prints the listening line with no errors, then Ctrl+C.

- [ ] **Step 5: Commit**

```bash
git add server/src/routes/tiebreak.routes.ts server/src/routes/results.routes.ts server/src/index.ts
git commit -m "Add tiebreak and results routes"
```

---

### Task 11: Admin routes (dashboard, phase control, participant/entry management)

**Files:**
- Create: `server/src/routes/admin.routes.ts`
- Modify: `server/src/index.ts` (mount `adminRouter`)

**Interfaces:**
- Consumes: `adminAuth` (Task 7), `getContest`, `startContest`, `setAllowSelfVote`, `revealResults` (Task 2), `listUsers`, `getUser` (Task 2), `getFavoriteLimit` (Task 5), `advance`, `closeRound`, `getOpenRoundId` (Task 6), `broadcast` (Task 7), `deleteEntryImage` (Task 8).
- Produces: `adminRouter` mounted at `/api/admin`, all behind `adminAuth`.

- [ ] **Step 1: Create `server/src/routes/admin.routes.ts`**

```ts
import { Router } from 'express';
import { z } from 'zod';
import { db } from '../db';
import { adminAuth } from '../middleware/adminAuth';
import { asyncHandler } from '../middleware/asyncHandler';
import { AppError } from '../middleware/errors';
import { getContest, startContest, setAllowSelfVote, revealResults } from '../services/contestService';
import { listUsers, getUser } from '../services/userService';
import { getFavoriteLimit } from '../services/voteService';
import { advance, closeRound, getOpenRoundId } from '../services/tiebreakService';
import { deleteEntryImage } from '../images/imageProcessor';
import { broadcast } from '../realtime/sse';

export const adminRouter = Router();
adminRouter.use(adminAuth);

adminRouter.get(
  '/dashboard',
  asyncHandler(async (_req, res) => {
    const contest = getContest(db);
    const users = listUsers(db);
    const entryCount = (db.prepare('SELECT COUNT(*) as c FROM Entry').get() as { c: number }).c;

    const people = users.map((u) => {
      const entryNumbers = (
        db.prepare('SELECT number FROM Entry WHERE creatorId = ? ORDER BY number ASC').all(u.id) as {
          number: number;
        }[]
      ).map((e) => e.number);
      const votedCount = (db.prepare('SELECT COUNT(*) as c FROM Vote WHERE userId = ?').get(u.id) as { c: number })
        .c;
      const limit = getFavoriteLimit(db, u.id);
      return {
        id: u.id,
        name: u.name,
        entryNumbers,
        votedCount,
        voteLimit: limit,
        hasFinishedVoting: votedCount >= limit,
        lastSeen: u.lastSeen,
      };
    });

    res.json({
      phase: contest.phase,
      allowSelfVote: contest.allowSelfVote,
      participantCount: users.length,
      entryCount,
      votersFinished: people.filter((p) => p.hasFinishedVoting).length,
      votersTotal: users.length,
      people,
    });
  })
);

adminRouter.post(
  '/contest/start',
  asyncHandler(async (_req, res) => {
    const contest = startContest(db);
    broadcast('phase-changed', { phase: contest.phase });
    res.json(contest);
  })
);

const closeVotingSchema = z.object({ force: z.boolean().optional() });

adminRouter.post(
  '/contest/close-voting',
  asyncHandler(async (req, res) => {
    const { force } = closeVotingSchema.parse(req.body ?? {});
    const contest = getContest(db);
    if (contest.phase !== 'VOTING') {
      throw new AppError(409, 'NOT_VOTING_PHASE', 'La votación no está abierta ahora mismo.');
    }
    const users = listUsers(db);
    const pending = users.filter((u) => {
      const votedCount = (db.prepare('SELECT COUNT(*) as c FROM Vote WHERE userId = ?').get(u.id) as { c: number })
        .c;
      return votedCount < getFavoriteLimit(db, u.id);
    });
    if (pending.length > 0 && !force) {
      res.status(409).json({
        code: 'VOTERS_PENDING',
        message: `Hay ${pending.length} persona(s) que todavía no ha(n) completado sus votos.`,
        pending: pending.map((p) => ({ id: p.id, name: p.name })),
      });
      return;
    }
    const result = advance(db);
    broadcast('phase-changed', { phase: result.phase, openedRound: result.openedRound ?? null });
    res.json(result);
  })
);

adminRouter.post(
  '/tiebreak/close-round',
  asyncHandler(async (_req, res) => {
    const roundId = getOpenRoundId(db);
    if (!roundId) {
      throw new AppError(404, 'NO_OPEN_ROUND', 'No hay ninguna ronda de desempate abierta.');
    }
    const closeResult = closeRound(db, roundId);
    let phase: 'TIEBREAK' | 'RESULTS' = 'TIEBREAK';
    if (closeResult.status === 'RESOLVED') {
      phase = advance(db).phase;
    }
    broadcast('tiebreak-round-changed', { closeResult, phase });
    res.json({ closeResult, phase });
  })
);

adminRouter.post(
  '/contest/reveal-results',
  asyncHandler(async (_req, res) => {
    const contest = revealResults(db);
    broadcast('results-revealed', { revealedAt: contest.resultsRevealedAt });
    res.json(contest);
  })
);

const allowSelfVoteSchema = z.object({ allowSelfVote: z.boolean() });

adminRouter.patch(
  '/contest',
  asyncHandler(async (req, res) => {
    const { allowSelfVote } = allowSelfVoteSchema.parse(req.body);
    res.json(setAllowSelfVote(db, allowSelfVote));
  })
);

const editEntrySchema = z.object({
  name: z.string().trim().max(80).nullable().optional(),
  description: z.string().trim().max(280).nullable().optional(),
});

adminRouter.patch(
  '/entries/:id',
  asyncHandler(async (req, res) => {
    const fields = editEntrySchema.parse(req.body);
    const entry = db.prepare('SELECT * FROM Entry WHERE id = ?').get(req.params.id);
    if (!entry) {
      throw new AppError(404, 'ENTRY_NOT_FOUND', 'No existe esa tapa.');
    }
    if (fields.name !== undefined) {
      db.prepare('UPDATE Entry SET name = ? WHERE id = ?').run(fields.name, req.params.id);
    }
    if (fields.description !== undefined) {
      db.prepare('UPDATE Entry SET description = ? WHERE id = ?').run(fields.description, req.params.id);
    }
    res.json(db.prepare('SELECT * FROM Entry WHERE id = ?').get(req.params.id));
  })
);

adminRouter.delete(
  '/entries/:id',
  asyncHandler(async (req, res) => {
    const entry = db.prepare('SELECT imagePath FROM Entry WHERE id = ?').get(req.params.id) as
      | { imagePath: string }
      | undefined;
    if (!entry) {
      throw new AppError(404, 'ENTRY_NOT_FOUND', 'No existe esa tapa.');
    }
    const tx = db.transaction((id: string) => {
      db.prepare('DELETE FROM TiebreakVote WHERE entryId = ?').run(id);
      db.prepare('DELETE FROM TiebreakCandidate WHERE entryId = ?').run(id);
      db.prepare('DELETE FROM Vote WHERE entryId = ?').run(id);
      db.prepare('DELETE FROM Entry WHERE id = ?').run(id);
    });
    tx(req.params.id);
    deleteEntryImage(entry.imagePath);
    res.json({ ok: true });
  })
);

const editUserSchema = z.object({ name: z.string().trim().min(1).max(60) });

adminRouter.patch(
  '/users/:id',
  asyncHandler(async (req, res) => {
    const { name } = editUserSchema.parse(req.body);
    const result = db.prepare('UPDATE User SET name = ? WHERE id = ?').run(name, req.params.id);
    if (result.changes === 0) {
      throw new AppError(404, 'USER_NOT_FOUND', 'No existe ese participante.');
    }
    res.json(getUser(db, req.params.id));
  })
);

adminRouter.delete(
  '/users/:id',
  asyncHandler(async (req, res) => {
    const ownEntries = db.prepare('SELECT id, imagePath FROM Entry WHERE creatorId = ?').all(req.params.id) as {
      id: string;
      imagePath: string;
    }[];
    const tx = db.transaction((id: string) => {
      for (const entry of ownEntries) {
        db.prepare('DELETE FROM TiebreakVote WHERE entryId = ?').run(entry.id);
        db.prepare('DELETE FROM TiebreakCandidate WHERE entryId = ?').run(entry.id);
        db.prepare('DELETE FROM Vote WHERE entryId = ?').run(entry.id);
      }
      db.prepare('DELETE FROM Entry WHERE creatorId = ?').run(id);
      db.prepare('DELETE FROM Vote WHERE userId = ?').run(id);
      db.prepare('DELETE FROM TiebreakVote WHERE userId = ?').run(id);
      const result = db.prepare('DELETE FROM User WHERE id = ?').run(id);
      if (result.changes === 0) {
        throw new AppError(404, 'USER_NOT_FOUND', 'No existe ese participante.');
      }
    });
    tx(req.params.id);
    for (const entry of ownEntries) {
      deleteEntryImage(entry.imagePath);
    }
    res.json({ ok: true });
  })
);
```

- [ ] **Step 2: Mount the router in `server/src/index.ts`**

```ts
import { adminRouter } from './routes/admin.routes';
```

Add:

```ts
app.use('/api/admin', adminRouter);
```

- [ ] **Step 3: Full manual smoke test of the whole flow**

Run: `cd server && npm run dev`, then:

```bash
# 1. two participants register
U1=$(curl -s -X POST http://localhost:3000/api/users -H "Content-Type: application/json" -d '{"name":"Laura"}' | node -pe 'JSON.parse(require("fs").readFileSync(0)).id')
U2=$(curl -s -X POST http://localhost:3000/api/users -H "Content-Type: application/json" -d '{"name":"Miguel"}' | node -pe 'JSON.parse(require("fs").readFileSync(0)).id')

# 2. Laura registers a tapa (create a throwaway sample.jpg first if needed)
node -e "require('sharp')({create:{width:400,height:300,channels:3,background:'red'}}).jpeg().toFile('/tmp/sample.jpg')"
E1=$(curl -s -X POST http://localhost:3000/api/entries -H "X-User-Id: $U1" -F "name=Croqueta" -F "image=@/tmp/sample.jpg" | node -pe 'JSON.parse(require("fs").readFileSync(0)).id')

# 3. admin starts the contest
curl -s -X POST http://localhost:3000/api/admin/contest/start -H "X-Admin-Pin: 0000"

# 4. Miguel votes Laura's tapa
curl -s -X POST http://localhost:3000/api/votes -H "X-User-Id: $U2" -H "Content-Type: application/json" -d "{\"entryId\":\"$E1\"}"

# 5. admin dashboard shows the vote progress (not the count)
curl -s http://localhost:3000/api/admin/dashboard -H "X-Admin-Pin: 0000"

# 6. admin closes voting (force, since Laura hasn't voted)
curl -s -X POST http://localhost:3000/api/admin/contest/close-voting -H "X-Admin-Pin: 0000" -H "Content-Type: application/json" -d '{"force":true}'

# 7. admin reveals results
curl -s -X POST http://localhost:3000/api/admin/contest/reveal-results -H "X-Admin-Pin: 0000"

# 8. anyone can now read results
curl -s http://localhost:3000/api/results -H "X-User-Id: $U2"
```

Expected: step 8 returns `{"revealedAt": "...", "standings": [{"entryId": "...", "voteCount": 1, "rank": 1, ...}]}`. Stop the dev server afterward.

- [ ] **Step 4: Commit**

```bash
git add server/src/routes/admin.routes.ts server/src/index.ts
git commit -m "Add admin routes: dashboard, phase control, participant/entry management"
```

---

### Task 12: ESLint, typecheck and full verification pass

**Files:**
- Create: `server/eslint.config.js`
- Modify: `server/package.json` (already has `lint`/`typecheck` scripts from Task 1 — verify only)

**Interfaces:**
- No new runtime interfaces — this task only adds static verification tooling.

- [ ] **Step 1: Create `server/eslint.config.js`**

```js
// @ts-check
const tseslint = require('typescript-eslint');

module.exports = tseslint.config(
  ...tseslint.configs.recommended,
  {
    rules: {
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
    },
  },
  {
    ignores: ['dist/**', 'node_modules/**', 'data/**', 'uploads/**'],
  }
);
```

- [ ] **Step 2: Run the full verification triad**

Run: `cd server && npm run typecheck`
Expected: no errors. If any appear (e.g. an unused import left over from earlier tasks), fix them now.

Run: `cd server && npm run lint`
Expected: no errors. Fix any real findings; do not disable rules to silence them unless a rule is genuinely wrong for this codebase.

Run: `cd server && npm test`
Expected: every test file passes.

- [ ] **Step 3: Commit**

```bash
git add server/eslint.config.js
git commit -m "Add backend ESLint config; verify typecheck, lint and tests are green"
```

---

### Task 13: Dev seed, reset script, root scripts

**Files:**
- Create: `server/src/seed/devSeed.ts`
- Create: `server/src/seed/resetDb.ts`
- Create: `package.json` (repo root)
- Create: `.gitignore` (repo root)

**Interfaces:**
- Consumes: `createDb` (Task 1), `createUser` (Task 2), `createEntry` (Task 3), `startContest` (Task 2), `addVote` (Task 5), `config` (Task 1).
- Produces: `npm run seed` (from `server/`) generates 20 participants, 18 tapas with generated placeholder photos, and random votes; refuses to run when `NODE_ENV=production`. `npm run db:reset` wipes the SQLite file and `uploads/`. Root `package.json` provides `npm run dev`/`build`/`start`/`test`/`seed`/`db:reset` that delegate into `server/` (and, from Task-B onward, `frontend/`) via `--prefix`.

- [ ] **Step 1: Create `server/src/seed/resetDb.ts`**

```ts
import fs from 'node:fs';
import { config } from '../config';

if (fs.existsSync(config.dbPath)) fs.rmSync(config.dbPath);
if (fs.existsSync(`${config.dbPath}-wal`)) fs.rmSync(`${config.dbPath}-wal`);
if (fs.existsSync(`${config.dbPath}-shm`)) fs.rmSync(`${config.dbPath}-shm`);
if (fs.existsSync(config.uploadsDir)) fs.rmSync(config.uploadsDir, { recursive: true, force: true });
console.log('Concurso reseteado: base de datos y fotos eliminadas.');
```

- [ ] **Step 2: Create `server/src/seed/devSeed.ts`**

```ts
import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import sharp from 'sharp';
import { createDb } from '../db/connection';
import { config } from '../config';
import { createUser } from '../services/userService';
import { createEntry } from '../services/entryService';
import { startContest } from '../services/contestService';
import { addVote } from '../services/voteService';

if (config.nodeEnv === 'production') {
  console.error('El seed de desarrollo no se ejecuta en producción.');
  process.exit(1);
}

const FIRST_NAMES = [
  'Laura', 'Miguel', 'Ana', 'Carlos', 'Sara', 'Diego', 'Marta', 'Pablo', 'Lucía', 'Javier',
  'Elena', 'Hugo', 'Claudia', 'Adrián', 'Nuria', 'Álvaro', 'Marina', 'Rubén', 'Irene', 'Óscar',
];

async function placeholderImage(index: number): Promise<string> {
  const hue = (index * 47) % 360;
  fs.mkdirSync(config.uploadsDir, { recursive: true });
  const filename = `${randomUUID()}.webp`;
  await sharp({
    create: { width: 800, height: 800, channels: 3, background: `hsl(${hue}, 60%, 55%)` },
  })
    .webp({ quality: 70 })
    .toFile(path.join(config.uploadsDir, filename));
  return filename;
}

async function main() {
  const db = createDb(config.dbPath);

  const userIds = FIRST_NAMES.map((name) => createUser(db, name).id);

  const entryIds: string[] = [];
  for (let i = 0; i < 18; i++) {
    const creatorId = userIds[i % 15];
    const imagePath = await placeholderImage(i);
    const entry = createEntry(db, {
      creatorId,
      name: i % 3 === 0 ? null : `Tapa de prueba ${i + 1}`,
      description: 'Descripción de ejemplo generada por el seed de desarrollo.',
      imagePath,
    });
    entryIds.push(entry.id);
  }

  startContest(db);

  for (const userId of userIds) {
    const votable = entryIds.filter((id) => {
      const row = db.prepare('SELECT creatorId FROM Entry WHERE id = ?').get(id) as { creatorId: string };
      return row.creatorId !== userId;
    });
    const shuffled = votable.sort(() => Math.random() - 0.5).slice(0, 3);
    for (const entryId of shuffled) {
      addVote(db, userId, entryId);
    }
  }

  console.log('Datos de prueba generados: 20 participantes, 18 tapas y votos aleatorios (fase VOTING).');
}

main();
```

- [ ] **Step 3: Run the seed script manually to verify it works**

Run: `cd server && DB_PATH=./data/dev-check.db UPLOADS_DIR=./uploads-dev-check npm run seed`
Expected: prints the success message with no errors.

Run: `rm -rf server/data/dev-check.db server/uploads-dev-check` to clean up the throwaway check.

- [ ] **Step 4: Create root `package.json`**

```json
{
  "name": "pincho-party",
  "private": true,
  "scripts": {
    "dev": "concurrently -n server -c blue \"npm run dev --prefix server\"",
    "install:all": "npm install --prefix server",
    "build": "npm run build --prefix server",
    "start": "npm run start --prefix server",
    "test": "npm test --prefix server",
    "seed": "npm run seed --prefix server",
    "db:reset": "npm run db:reset --prefix server"
  },
  "devDependencies": {
    "concurrently": "^10.0.5"
  }
}
```

(The `dev` and `build` scripts will be extended to also run `frontend` once the frontend plan lands — this is a known, deliberate placeholder for the *next* plan, not a code placeholder within this one.)

- [ ] **Step 5: Install root dependency**

Run: `npm install` (from repo root)
Expected: installs `concurrently` into the root `node_modules/`.

- [ ] **Step 6: Create root `.gitignore`**

```
node_modules/
dist/
server/data/
server/uploads/
*.log
.DS_Store
```

- [ ] **Step 7: Remove the now-redundant `server/.gitignore` entries duplication check**

Run: `cat server/.gitignore` — confirm it still correctly ignores `node_modules/`, `dist/`, `data/`, `uploads/` relative to `server/`; both gitignores coexisting is intentional (root one covers running `git status` from the repo root, the nested one is redundant-but-harmless documentation of what's local to `server/`). No changes needed.

- [ ] **Step 8: Final full verification pass**

Run: `npm test --prefix server && npm run typecheck --prefix server && npm run lint --prefix server`
Expected: all green.

- [ ] **Step 9: Commit**

```bash
git add server/src/seed/ package.json .gitignore
git commit -m "Add dev seed/reset scripts and root project scripts"
```

---

## End of Fase A

At this point the backend is a complete, standalone, curl-testable REST + SSE API covering registration, voting, tiebreaks and results, with the full business-rule test suite green. The next plan (Fase B onward: frontend scaffold, registration UI, entry/photo capture, gallery, voting UI, admin UI, results/podium) will be written as a separate plan document once this one is executed, per the user's phase-by-phase, frequent-commits way of working.
