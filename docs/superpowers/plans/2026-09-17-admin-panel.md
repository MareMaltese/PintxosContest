# Panel de Administración (Fase F) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A host can log in with the PIN, see a live dashboard (phase,
counts, who's finished voting, who's online), manage participants and
tapas (rename, delete, with confirmation), and control the contest's
phases (start, close voting with the pending-voters warning, toggle
self-vote, close a tiebreak round, reveal results) — entirely from the
browser, no more `curl`. Spec screens 13–17.

**Architecture:** A stateless PIN header, exactly like Fase A designed it
— `adminAuth.ts` persists the PIN in `localStorage`, `api.ts` attaches it
as `X-Admin-Pin` on every request whenever it's present (alongside the
existing `X-User-Id`, unrelated headers, no conflict). No new backend auth
work: every admin endpoint from Fase A already exists and already
rejects a wrong/missing PIN with 401. One real backend gap gets filled:
there was no way to list every tapa with full detail *regardless of
phase* for management purposes (the guest-facing `GET /api/entries` is
deliberately locked during `REGISTRATION`) — Task 1 adds
`GET /api/admin/entries` for that.

Destructive/edit actions use the browser's native `confirm()` / `prompt()`
/ `alert()` — this is an internal tool for one trusted host, not a
guest-facing screen, so a custom modal system would be over-engineering
for what it buys here.

**Tech Stack:** Same as every previous frontend phase — no new
dependencies.

**Spec:** `docs/superpowers/specs/2026-09-16-pincho-party-design.md`

## Global Constraints

- Admin auth is fully separate from the guest session — a host doesn't
  need to "register" as a guest to use `/admin`.
- Every destructive action (delete participant, delete entry) requires
  `window.confirm()` before calling the API. Every rename uses
  `window.prompt()`. Failures use `window.alert()` — this mirrors the
  spec's "las acciones destructivas deben solicitar confirmación"
  without building bespoke dialog components for an admin-only screen.
- The backend already enforces every rule (Fase A) — the frontend here is
  a thin, honest client. It never re-implements validation the backend
  already owns; it just surfaces the backend's error messages.
- Vote counts stay hidden everywhere they were already hidden (Fase A's
  privacy rule) — nothing in this phase changes that; the dashboard shows
  *voting progress* (`X / Y` completed), never *who voted for what*.
- Same relative-path/no-hardcoded-`localhost` rule as every other phase.

---

### Task 1: Backend — list every entry for admin management

**Files:**
- Modify: `server/src/services/entryService.ts`
- Modify: `server/src/services/entryService.test.ts`
- Modify: `server/src/routes/admin.routes.ts`

**Interfaces:**
- Produces: `listEntriesForAdmin(db): EntryDetail[]` — every entry with
  `creatorName`, ordered by number, **not** phase-gated (unlike
  `listEntries`/`getEntry`, which stay exactly as they are — guests still
  can't see the gallery early). Mounted as `GET /api/admin/entries`
  (admin-authenticated, like every other `/api/admin/*` route).

- [ ] **Step 1: Write the failing test — add to `server/src/services/entryService.test.ts`**

Add `listEntriesForAdmin` to the existing import line, and this test
inside the `describe` block:

```ts
  it('listEntriesForAdmin returns every entry with creator name, even during REGISTRATION', () => {
    const entry = createEntry(db, { creatorId, name: 'Croqueta', description: null, imagePath: 'a.webp' });
    const list = listEntriesForAdmin(db);
    expect(list).toHaveLength(1);
    expect(list[0].number).toBe(entry.number);
    expect(list[0].creatorName).toBe('Laura');
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd server && npx vitest run src/services/entryService.test.ts`
Expected: FAIL — `listEntriesForAdmin is not a function`.

- [ ] **Step 3: Add to `server/src/services/entryService.ts`**

Add after `getEntry`:

```ts
export function listEntriesForAdmin(db: Database.Database): EntryDetail[] {
  return db
    .prepare(
      `SELECT e.*, u.name as creatorName
       FROM Entry e
       JOIN User u ON u.id = e.creatorId
       ORDER BY e.number ASC`
    )
    .all() as EntryDetail[];
}
```

- [ ] **Step 4: Run the whole file to verify it passes with no regressions**

Run: `cd server && npx vitest run src/services/entryService.test.ts`
Expected: PASS (8 tests — the 7 from before plus this one).

- [ ] **Step 5: Mount the route — modify `server/src/routes/admin.routes.ts`**

There is no existing import from `../services/entryService` in this file
— add a new import line (anywhere among the other service imports):

```ts
import { listEntriesForAdmin } from '../services/entryService';
```

Then add this route (anywhere among the other `adminRouter.get`/`.post`
calls — order doesn't matter, they're independent):

```ts
adminRouter.get(
  '/entries',
  asyncHandler(async (_req, res) => {
    res.json(listEntriesForAdmin(db));
  })
);
```

- [ ] **Step 6: Run the full backend suite, typecheck and lint**

Run: `cd server && npm test && npm run typecheck && npm run lint`
Expected: all green (44 tests total — Task 1 only added a service test,
the route itself has no dedicated test file, matching this project's
existing pattern of testing routes at the service layer plus manual
`curl` verification in Task 10).

- [ ] **Step 7: Commit**

```bash
git add server/src/services/entryService.ts server/src/services/entryService.test.ts server/src/routes/admin.routes.ts
git commit -m "Add GET /api/admin/entries: full entry list for admin, not phase-gated"
```

---

### Task 2: `adminAuth` storage service + `api.ts` header support

**Files:**
- Create: `frontend/src/services/adminAuth.ts`
- Test: `frontend/src/services/adminAuth.test.ts`
- Modify: `frontend/src/services/api.ts`
- Modify: `frontend/src/services/api.test.ts`

**Interfaces:**
- Produces: `getStoredAdminPin(): string | null`,
  `saveAdminPin(pin: string): void`, `clearAdminPin(): void` (same
  round-trip shape as `sessionStorage.ts`, different `localStorage` key:
  `pinchoParty.adminPin`).
- Changes `api.ts`'s internal `authHeaders()` (used by every `api.*`
  call) to also attach `X-Admin-Pin` whenever one is stored — every
  existing `api.get/post/patch/delete/postForm` call site is unaffected
  and unchanged.

- [ ] **Step 1: Write the failing test `frontend/src/services/adminAuth.test.ts`**

```ts
import { describe, it, expect, beforeEach } from 'vitest';
import { getStoredAdminPin, saveAdminPin, clearAdminPin } from './adminAuth';

beforeEach(() => localStorage.clear());

describe('adminAuth storage', () => {
  it('returns null when nothing is stored', () => {
    expect(getStoredAdminPin()).toBeNull();
  });

  it('round-trips a saved pin', () => {
    saveAdminPin('1234');
    expect(getStoredAdminPin()).toBe('1234');
  });

  it('clears a stored pin', () => {
    saveAdminPin('1234');
    clearAdminPin();
    expect(getStoredAdminPin()).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && npx vitest run src/services/adminAuth.test.ts`
Expected: FAIL — `Cannot find module './adminAuth'`.

- [ ] **Step 3: Create `frontend/src/services/adminAuth.ts`**

```ts
const ADMIN_PIN_KEY = 'pinchoParty.adminPin';

export function getStoredAdminPin(): string | null {
  return localStorage.getItem(ADMIN_PIN_KEY);
}

export function saveAdminPin(pin: string): void {
  localStorage.setItem(ADMIN_PIN_KEY, pin);
}

export function clearAdminPin(): void {
  localStorage.removeItem(ADMIN_PIN_KEY);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd frontend && npx vitest run src/services/adminAuth.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Write the failing test — add to `frontend/src/services/api.test.ts`**

Add inside the existing `describe('api', ...)` block:

```ts
  it('sends X-Admin-Pin when a pin is stored', async () => {
    localStorage.setItem('pinchoParty.adminPin', '1234');
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({}) });
    vi.stubGlobal('fetch', fetchMock);

    await api.get('/api/admin/dashboard');

    const [, options] = fetchMock.mock.calls[0];
    expect((options.headers as Headers).get('X-Admin-Pin')).toBe('1234');
  });
```

- [ ] **Step 6: Run test to verify it fails**

Run: `cd frontend && npx vitest run src/services/api.test.ts`
Expected: FAIL — the header is never set.

- [ ] **Step 7: Modify `frontend/src/services/api.ts`**

Add the import and update `authHeaders`:

```ts
import { getStoredUserId } from './sessionStorage';
import { getStoredAdminPin } from './adminAuth';
```

```ts
function authHeaders(): Headers {
  const headers = new Headers();
  const userId = getStoredUserId();
  if (userId) headers.set('X-User-Id', userId);
  const adminPin = getStoredAdminPin();
  if (adminPin) headers.set('X-Admin-Pin', adminPin);
  return headers;
}
```

- [ ] **Step 8: Run the whole file to verify it passes with no regressions**

Run: `cd frontend && npx vitest run src/services/api.test.ts`
Expected: PASS (8 tests — the 7 from Fase C plus this one).

- [ ] **Step 9: Commit**

```bash
git add frontend/src/services/adminAuth.ts frontend/src/services/adminAuth.test.ts frontend/src/services/api.ts frontend/src/services/api.test.ts
git commit -m "Add adminAuth storage and X-Admin-Pin header support in api.ts"
```

---

### Task 3: `adminAuth` Pinia store

**Files:**
- Create: `frontend/src/stores/adminAuth.ts`
- Test: `frontend/src/stores/adminAuth.test.ts`

**Interfaces:**
- Consumes: `getStoredAdminPin`, `saveAdminPin`, `clearAdminPin` (Task 2).
- Produces: `useAdminAuthStore()` exposing `pin: Ref<string | null>`,
  `isLoggingIn: Ref<boolean>`, `loginError: Ref<string | null>`,
  `login(candidatePin: string): Promise<void>` (probes
  `GET /api/admin/dashboard` with the candidate PIN via a raw `fetch` —
  deliberately not through `api.ts`, so a wrong PIN is never written to
  storage even transiently — throws on failure after setting
  `loginError`), `logout(): void`.

- [ ] **Step 1: Write the failing test `frontend/src/stores/adminAuth.test.ts`**

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { setActivePinia, createPinia } from 'pinia';
import { useAdminAuthStore } from './adminAuth';

beforeEach(() => {
  localStorage.clear();
  setActivePinia(createPinia());
  vi.unstubAllGlobals();
});

describe('useAdminAuthStore', () => {
  it('starts with no pin when localStorage is empty', () => {
    expect(useAdminAuthStore().pin).toBeNull();
  });

  it('loads a previously-stored pin on creation', () => {
    localStorage.setItem('pinchoParty.adminPin', '1234');
    expect(useAdminAuthStore().pin).toBe('1234');
  });

  it('login() saves the pin and updates state on success', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({}) });
    vi.stubGlobal('fetch', fetchMock);
    const store = useAdminAuthStore();

    await store.login('1234');

    expect(store.pin).toBe('1234');
    expect(localStorage.getItem('pinchoParty.adminPin')).toBe('1234');
    expect(store.isLoggingIn).toBe(false);
    const [url, options] = fetchMock.mock.calls[0];
    expect(url).toBe('/api/admin/dashboard');
    expect((options.headers as Record<string, string>)['X-Admin-Pin']).toBe('1234');
  });

  it('login() surfaces a friendly error and never stores a wrong pin', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 401, json: async () => ({}) }));
    const store = useAdminAuthStore();

    await expect(store.login('0000')).rejects.toThrow();

    expect(store.pin).toBeNull();
    expect(localStorage.getItem('pinchoParty.adminPin')).toBeNull();
    expect(store.loginError).toBe('PIN incorrecto.');
  });

  it('logout() clears the pin from state and storage', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({}) }));
    const store = useAdminAuthStore();
    await store.login('1234');

    store.logout();

    expect(store.pin).toBeNull();
    expect(localStorage.getItem('pinchoParty.adminPin')).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && npx vitest run src/stores/adminAuth.test.ts`
Expected: FAIL — `Cannot find module './adminAuth'`.

- [ ] **Step 3: Create `frontend/src/stores/adminAuth.ts`**

```ts
import { ref } from 'vue';
import { defineStore } from 'pinia';
import { getStoredAdminPin, saveAdminPin, clearAdminPin } from '../services/adminAuth';

export const useAdminAuthStore = defineStore('adminAuth', () => {
  const pin = ref<string | null>(getStoredAdminPin());
  const isLoggingIn = ref(false);
  const loginError = ref<string | null>(null);

  async function login(candidatePin: string): Promise<void> {
    isLoggingIn.value = true;
    loginError.value = null;
    try {
      const response = await fetch('/api/admin/dashboard', {
        headers: { 'X-Admin-Pin': candidatePin },
      });
      if (!response.ok) {
        throw new Error(response.status === 401 ? 'PIN incorrecto.' : 'No hemos podido comprobar el PIN.');
      }
      saveAdminPin(candidatePin);
      pin.value = candidatePin;
    } catch (err) {
      loginError.value = err instanceof Error ? err.message : 'No hemos podido comprobar el PIN.';
      throw err;
    } finally {
      isLoggingIn.value = false;
    }
  }

  function logout(): void {
    pin.value = null;
    clearAdminPin();
  }

  return { pin, isLoggingIn, loginError, login, logout };
});
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd frontend && npx vitest run src/stores/adminAuth.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add frontend/src/stores/adminAuth.ts frontend/src/stores/adminAuth.test.ts
git commit -m "Add adminAuth Pinia store"
```

---

### Task 4: Router — admin routes and guard

**Files:**
- Modify: `frontend/src/router/index.ts`
- Modify: `frontend/src/router/index.test.ts`

**Interfaces:**
- Produces: named routes `admin-login` (`/admin`), `admin-dashboard`
  (`/admin/dashboard`), `admin-participants` (`/admin/participantes`),
  `admin-entries` (`/admin/tapas`), `admin-phases` (`/admin/fases`).
  Unauthenticated visitors to any admin route except `admin-login` are
  sent to `admin-login`; an already-authenticated visitor to
  `admin-login` is sent straight to `admin-dashboard`. This guard is
  entirely independent of the guest session/`contest` guard already in
  this file — admin routes never touch `session`/`contest` state.

- [ ] **Step 1: Write the failing tests — add to `frontend/src/router/index.test.ts`**

Add the import and these tests inside the existing `describe('router', ...)` block:

```ts
import { useAdminAuthStore } from '../stores/adminAuth';
```

```ts
  it('blocks an unauthenticated visitor from every admin route except /admin', async () => {
    for (const path of ['/admin/dashboard', '/admin/participantes', '/admin/tapas', '/admin/fases']) {
      await router.push(path);
      expect(router.currentRoute.value.name).toBe('admin-login');
    }
  });

  it('lets an unauthenticated visitor reach /admin', async () => {
    await router.push('/admin');
    expect(router.currentRoute.value.name).toBe('admin-login');
  });

  it('redirects an authenticated admin away from /admin to the dashboard', async () => {
    useAdminAuthStore().pin = '1234';
    await router.push('/admin');
    expect(router.currentRoute.value.name).toBe('admin-dashboard');
  });

  it('lets an authenticated admin reach every admin route', async () => {
    useAdminAuthStore().pin = '1234';
    for (const [path, name] of [
      ['/admin/dashboard', 'admin-dashboard'],
      ['/admin/participantes', 'admin-participants'],
      ['/admin/tapas', 'admin-entries'],
      ['/admin/fases', 'admin-phases'],
    ] as const) {
      await router.push(path);
      expect(router.currentRoute.value.name).toBe(name);
    }
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && npx vitest run src/router/index.test.ts`
Expected: FAIL — the admin routes don't exist yet.

- [ ] **Step 3: Modify `frontend/src/router/index.ts`**

Add the import:

```ts
import { useAdminAuthStore } from '../stores/adminAuth';
```

Add to the `routes` array (order among existing routes doesn't matter):

```ts
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
```

Add the constant near the other route-name lists, and the guard clauses
inside `router.beforeEach`, before the existing guest-flow checks (order
doesn't matter here since admin route names never overlap with guest
route names, but keeping admin checks together aids readability):

```ts
const ADMIN_ROUTES = ['admin-dashboard', 'admin-participants', 'admin-entries', 'admin-phases'];
```

```ts
  const adminAuth = useAdminAuthStore();
  if (ADMIN_ROUTES.includes(name) && !adminAuth.pin) {
    return { name: 'admin-login' };
  }
  if (name === 'admin-login' && adminAuth.pin) {
    return { name: 'admin-dashboard' };
  }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd frontend && npx vitest run src/router/index.test.ts`
Expected: PASS (17 tests — the 11 from Fase D plus these 6; the admin
views these routes point to don't exist yet, but that only matters once
a test actually renders one, and none of these do).

- [ ] **Step 5: Commit**

```bash
git add frontend/src/router/index.ts frontend/src/router/index.test.ts
git commit -m "Add admin routes and auth guard"
```

---

### Task 5: `AdminLoginView`

**Files:**
- Create: `frontend/src/views/admin/AdminLoginView.vue`
- Test: `frontend/src/views/admin/AdminLoginView.test.ts`

**Interfaces:**
- Consumes: `useAdminAuthStore` (Task 3).
- Produces: a view that navigates to `{ name: 'admin-dashboard' }` on
  successful login.

- [ ] **Step 1: Write the failing test `frontend/src/views/admin/AdminLoginView.test.ts`**

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import { setActivePinia, createPinia } from 'pinia';
import AdminLoginView from './AdminLoginView.vue';

const pushMock = vi.fn();
vi.mock('vue-router', () => ({
  useRouter: () => ({ push: pushMock }),
}));

beforeEach(() => {
  localStorage.clear();
  setActivePinia(createPinia());
  pushMock.mockClear();
  vi.unstubAllGlobals();
});

describe('AdminLoginView', () => {
  it('shows a validation message when submitting an empty pin', async () => {
    const wrapper = mount(AdminLoginView);
    await wrapper.find('form').trigger('submit.prevent');
    expect(wrapper.text()).toContain('Escribe el PIN');
  });

  it('logs in and navigates to the dashboard on success', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({}) }));
    const wrapper = mount(AdminLoginView);

    await wrapper.find('input#admin-pin').setValue('1234');
    await wrapper.find('form').trigger('submit.prevent');
    await flushPromises();

    expect(pushMock).toHaveBeenCalledWith({ name: 'admin-dashboard' });
  });

  it('shows a retryable error on a wrong pin', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 401, json: async () => ({}) }));
    const wrapper = mount(AdminLoginView);

    await wrapper.find('input#admin-pin').setValue('0000');
    await wrapper.find('form').trigger('submit.prevent');
    await flushPromises();

    expect(wrapper.text()).toContain('PIN incorrecto.');
    expect(pushMock).not.toHaveBeenCalled();
    expect(wrapper.find('button[type="submit"]').attributes('disabled')).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && npx vitest run src/views/admin/AdminLoginView.test.ts`
Expected: FAIL — `Cannot find module './AdminLoginView.vue'`.

- [ ] **Step 3: Create `frontend/src/views/admin/AdminLoginView.vue`**

```vue
<script setup lang="ts">
import { ref } from 'vue';
import { useRouter } from 'vue-router';
import { useAdminAuthStore } from '../../stores/adminAuth';

const router = useRouter();
const adminAuth = useAdminAuthStore();
const pin = ref('');
const touched = ref(false);

async function onSubmit(): Promise<void> {
  touched.value = true;
  if (!pin.value.trim()) return;
  try {
    await adminAuth.login(pin.value.trim());
    router.push({ name: 'admin-dashboard' });
  } catch {
    // el mensaje de error ya queda reflejado en adminAuth.loginError
  }
}
</script>

<template>
  <main class="admin-login">
    <form class="admin-login__card" @submit.prevent="onSubmit">
      <h1 class="admin-login__title">
        Panel de administración
      </h1>
      <p class="admin-login__subtitle">
        Introduce el PIN del anfitrión.
      </p>

      <label class="admin-login__label" for="admin-pin">PIN</label>
      <input
        id="admin-pin"
        v-model="pin"
        class="admin-login__input"
        type="password"
        inputmode="numeric"
        autocomplete="off"
      >
      <p v-if="touched && !pin.trim()" class="admin-login__error" role="alert">
        Escribe el PIN para continuar.
      </p>
      <p v-if="adminAuth.loginError" class="admin-login__error" role="alert">
        {{ adminAuth.loginError }}
      </p>

      <button class="button button--primary button--block" type="submit" :disabled="adminAuth.isLoggingIn">
        {{ adminAuth.isLoggingIn ? 'Comprobando…' : 'Entrar' }}
      </button>
    </form>
  </main>
</template>

<style scoped>
.admin-login {
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: var(--space-5);
}

.admin-login__card {
  background: var(--color-surface);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-md);
  padding: var(--space-8) var(--space-5);
  max-width: 360px;
  width: 100%;
}

.admin-login__title {
  font-size: 1.4rem;
  margin: 0 0 var(--space-1);
}

.admin-login__subtitle {
  color: var(--color-text-muted);
  margin: 0 0 var(--space-5);
}

.admin-login__label {
  display: block;
  font-weight: 600;
  margin-bottom: var(--space-2);
}

.admin-login__input {
  width: 100%;
  min-height: 48px;
  padding: 0 var(--space-4);
  border-radius: var(--radius-md);
  border: 1px solid var(--color-border);
  font-size: 1.2rem;
  letter-spacing: 0.1em;
  margin-bottom: var(--space-4);
}

.admin-login__error {
  color: var(--color-danger);
  margin: calc(var(--space-2) * -1) 0 var(--space-4);
  font-size: 0.9rem;
}
</style>
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd frontend && npx vitest run src/views/admin/AdminLoginView.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add frontend/src/views/admin/AdminLoginView.vue frontend/src/views/admin/AdminLoginView.test.ts
git commit -m "Add AdminLoginView"
```

---

### Task 6: `AdminNav`, `useAdminDashboard`, `relativeTime`, and `AdminDashboardView`

**Files:**
- Create: `frontend/src/components/admin/AdminNav.vue`
- Test: `frontend/src/components/admin/AdminNav.test.ts`
- Create: `frontend/src/services/relativeTime.ts`
- Test: `frontend/src/services/relativeTime.test.ts`
- Create: `frontend/src/composables/useAdminDashboard.ts`
- Test: `frontend/src/composables/useAdminDashboard.test.ts`
- Create: `frontend/src/views/admin/AdminDashboardView.vue`
- Test: `frontend/src/views/admin/AdminDashboardView.test.ts`

**Interfaces:**
- Produces `AdminNav.vue`: four nav buttons, `router.push`-ing to each
  admin route by name — reused as-is by Tasks 7, 8, 9.
- Produces `formatRelativeTime(isoTimestamp: string, now?: Date): string`
  — `< 30s` → `'en línea'`; `< 60s` → `'hace Ns'`; `< 60min` → `'hace N
  min'`; else → `'hace N h'`.
- Produces `AdminPerson { id, name, entryNumbers: number[], votedCount,
  voteLimit, hasFinishedVoting, lastSeen }`,
  `AdminDashboardData { phase, allowSelfVote, participantCount,
  entryCount, votersFinished, votersTotal, people: AdminPerson[] }`,
  `useAdminDashboard()` returning `{ data: Ref<AdminDashboardData |
  null>, isLoading, error, refetch }` — fetches `GET /api/admin/dashboard`
  on mount and every 7s while mounted, stops on unmount. Reused as-is by
  Task 7 (`AdminParticipantsView`).

- [ ] **Step 1: Write the failing test `frontend/src/components/admin/AdminNav.test.ts`**

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mount } from '@vue/test-utils';
import AdminNav from './AdminNav.vue';

const pushMock = vi.fn();
vi.mock('vue-router', () => ({
  useRouter: () => ({ push: pushMock }),
}));

beforeEach(() => {
  pushMock.mockClear();
});

describe('AdminNav', () => {
  it('navigates to each admin route by name when its button is clicked', async () => {
    const wrapper = mount(AdminNav);
    const buttons = wrapper.findAll('button');
    expect(buttons).toHaveLength(4);

    await buttons[0].trigger('click');
    expect(pushMock).toHaveBeenLastCalledWith({ name: 'admin-dashboard' });
    await buttons[1].trigger('click');
    expect(pushMock).toHaveBeenLastCalledWith({ name: 'admin-participants' });
    await buttons[2].trigger('click');
    expect(pushMock).toHaveBeenLastCalledWith({ name: 'admin-entries' });
    await buttons[3].trigger('click');
    expect(pushMock).toHaveBeenLastCalledWith({ name: 'admin-phases' });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && npx vitest run src/components/admin/AdminNav.test.ts`
Expected: FAIL — `Cannot find module './AdminNav.vue'`.

- [ ] **Step 3: Create `frontend/src/components/admin/AdminNav.vue`**

```vue
<script setup lang="ts">
import { useRouter } from 'vue-router';

const router = useRouter();

function goTo(name: string): void {
  router.push({ name });
}
</script>

<template>
  <nav class="admin-nav">
    <button type="button" @click="goTo('admin-dashboard')">
      Dashboard
    </button>
    <button type="button" @click="goTo('admin-participants')">
      Participantes
    </button>
    <button type="button" @click="goTo('admin-entries')">
      Tapas
    </button>
    <button type="button" @click="goTo('admin-phases')">
      Fases
    </button>
  </nav>
</template>

<style scoped>
.admin-nav {
  display: flex;
  gap: var(--space-2);
  padding: var(--space-3) var(--space-5);
  background: var(--color-surface);
  border-bottom: 1px solid var(--color-border);
  overflow-x: auto;
}

.admin-nav button {
  background: none;
  border: none;
  padding: var(--space-2) var(--space-3);
  border-radius: var(--radius-md);
  font-weight: 600;
  font-size: 0.95rem;
  color: var(--color-text-muted);
  cursor: pointer;
  white-space: nowrap;
}

.admin-nav button:hover {
  background: var(--color-bg);
  color: var(--color-text);
}
</style>
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd frontend && npx vitest run src/components/admin/AdminNav.test.ts`
Expected: PASS (1 test).

- [ ] **Step 5: Write the failing test `frontend/src/services/relativeTime.test.ts`**

```ts
import { describe, it, expect } from 'vitest';
import { formatRelativeTime } from './relativeTime';

const NOW = new Date('2026-09-17T12:00:00.000Z');

describe('formatRelativeTime', () => {
  it('shows "en línea" for activity within the last 30 seconds', () => {
    expect(formatRelativeTime('2026-09-17T11:59:45.000Z', NOW)).toBe('en línea');
  });

  it('shows seconds for activity under a minute ago', () => {
    expect(formatRelativeTime('2026-09-17T11:59:15.000Z', NOW)).toBe('hace 45 s');
  });

  it('shows minutes for activity under an hour ago', () => {
    expect(formatRelativeTime('2026-09-17T11:53:00.000Z', NOW)).toBe('hace 7 min');
  });

  it('shows hours for activity an hour or more ago', () => {
    expect(formatRelativeTime('2026-09-17T09:30:00.000Z', NOW)).toBe('hace 2 h');
  });

  it('never shows a negative duration for clock-skewed timestamps', () => {
    expect(formatRelativeTime('2026-09-17T12:00:05.000Z', NOW)).toBe('en línea');
  });
});
```

- [ ] **Step 6: Run test to verify it fails**

Run: `cd frontend && npx vitest run src/services/relativeTime.test.ts`
Expected: FAIL — `Cannot find module './relativeTime'`.

- [ ] **Step 7: Create `frontend/src/services/relativeTime.ts`**

```ts
export function formatRelativeTime(isoTimestamp: string, now: Date = new Date()): string {
  const diffMs = now.getTime() - new Date(isoTimestamp).getTime();
  const diffSeconds = Math.max(0, Math.floor(diffMs / 1000));

  if (diffSeconds < 30) return 'en línea';
  if (diffSeconds < 60) return `hace ${diffSeconds} s`;

  const diffMinutes = Math.floor(diffSeconds / 60);
  if (diffMinutes < 60) return `hace ${diffMinutes} min`;

  const diffHours = Math.floor(diffMinutes / 60);
  return `hace ${diffHours} h`;
}
```

- [ ] **Step 8: Run test to verify it passes**

Run: `cd frontend && npx vitest run src/services/relativeTime.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 9: Write the failing test `frontend/src/composables/useAdminDashboard.test.ts`**

```ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { defineComponent } from 'vue';
import { mount } from '@vue/test-utils';

vi.mock('../services/api', async () => {
  const actual = await vi.importActual<typeof import('../services/api')>('../services/api');
  return { ...actual, api: { ...actual.api, get: vi.fn() } };
});

import { api, ApiError } from '../services/api';
import { useAdminDashboard } from './useAdminDashboard';

const sampleData = {
  phase: 'VOTING' as const,
  allowSelfVote: false,
  participantCount: 2,
  entryCount: 1,
  votersFinished: 0,
  votersTotal: 2,
  people: [],
};

let captured: ReturnType<typeof useAdminDashboard>;
const HostComponent = defineComponent({
  setup() {
    captured = useAdminDashboard();
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

describe('useAdminDashboard', () => {
  it('fetches on mount and polls every 7s', async () => {
    vi.mocked(api.get).mockResolvedValue(sampleData);
    mount(HostComponent);
    await vi.advanceTimersByTimeAsync(0);

    expect(captured.data.value).toEqual(sampleData);
    expect(captured.isLoading.value).toBe(false);
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
    expect(captured.isLoading.value).toBe(false);
  });
});
```

- [ ] **Step 10: Run test to verify it fails**

Run: `cd frontend && npx vitest run src/composables/useAdminDashboard.test.ts`
Expected: FAIL — `Cannot find module './useAdminDashboard'`.

- [ ] **Step 11: Create `frontend/src/composables/useAdminDashboard.ts`**

```ts
import { ref, onMounted, onUnmounted } from 'vue';
import { api, ApiError } from '../services/api';

export interface AdminPerson {
  id: string;
  name: string;
  entryNumbers: number[];
  votedCount: number;
  voteLimit: number;
  hasFinishedVoting: boolean;
  lastSeen: string;
}

export interface AdminDashboardData {
  phase: 'REGISTRATION' | 'VOTING' | 'TIEBREAK' | 'RESULTS';
  allowSelfVote: boolean;
  participantCount: number;
  entryCount: number;
  votersFinished: number;
  votersTotal: number;
  people: AdminPerson[];
}

const POLL_INTERVAL_MS = 7000;

export function useAdminDashboard() {
  const data = ref<AdminDashboardData | null>(null);
  const isLoading = ref(true);
  const error = ref<string | null>(null);
  let timer: ReturnType<typeof setInterval> | undefined;

  async function refetch(): Promise<void> {
    try {
      data.value = await api.get<AdminDashboardData>('/api/admin/dashboard');
      error.value = null;
    } catch (err) {
      error.value = err instanceof ApiError ? err.message : 'No hemos podido cargar el panel.';
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

- [ ] **Step 12: Run test to verify it passes**

Run: `cd frontend && npx vitest run src/composables/useAdminDashboard.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 13: Write the failing test `frontend/src/views/admin/AdminDashboardView.test.ts`**

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import AdminDashboardView from './AdminDashboardView.vue';

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

describe('AdminDashboardView', () => {
  it('shows a loading state while fetching', async () => {
    vi.mocked(api.get).mockReturnValue(new Promise(() => {}));
    const wrapper = mount(AdminDashboardView);
    await flushPromises();
    expect(wrapper.text()).toContain('Cargando');
  });

  it('shows the four stat cards once loaded', async () => {
    vi.mocked(api.get).mockResolvedValue({
      phase: 'VOTING',
      allowSelfVote: false,
      participantCount: 12,
      entryCount: 17,
      votersFinished: 3,
      votersTotal: 18,
      people: [],
    });
    const wrapper = mount(AdminDashboardView);
    await flushPromises();

    expect(wrapper.text()).toContain('Votación');
    expect(wrapper.text()).toContain('12');
    expect(wrapper.text()).toContain('17');
    expect(wrapper.text()).toContain('3 / 18');
  });

  it('shows a retryable error message when loading fails', async () => {
    vi.mocked(api.get).mockRejectedValue(new Error('network down'));
    const wrapper = mount(AdminDashboardView);
    await flushPromises();
    expect(wrapper.text()).toContain('No hemos podido cargar el panel.');
  });
});
```

- [ ] **Step 14: Run test to verify it fails**

Run: `cd frontend && npx vitest run src/views/admin/AdminDashboardView.test.ts`
Expected: FAIL — `Cannot find module './AdminDashboardView.vue'`.

- [ ] **Step 15: Create `frontend/src/views/admin/AdminDashboardView.vue`**

```vue
<script setup lang="ts">
import AdminNav from '../../components/admin/AdminNav.vue';
import { useAdminDashboard } from '../../composables/useAdminDashboard';

const { data, isLoading, error, refetch } = useAdminDashboard();

const PHASE_LABELS: Record<string, string> = {
  REGISTRATION: 'Registro',
  VOTING: 'Votación',
  TIEBREAK: 'Desempate',
  RESULTS: 'Resultados',
};
</script>

<template>
  <div>
    <AdminNav />
    <main class="admin-dashboard">
      <p v-if="isLoading" class="admin-dashboard__status">
        Cargando…
      </p>
      <template v-else-if="error">
        <p class="admin-dashboard__status admin-dashboard__status--error">
          {{ error }}
        </p>
        <button class="button button--secondary" type="button" @click="refetch">
          Reintentar
        </button>
      </template>
      <div v-else-if="data" class="admin-dashboard__grid">
        <div class="admin-card">
          <p class="admin-card__label">
            Fase actual
          </p>
          <p class="admin-card__value">
            {{ PHASE_LABELS[data.phase] }}
          </p>
        </div>
        <div class="admin-card">
          <p class="admin-card__label">
            Participantes
          </p>
          <p class="admin-card__value">
            {{ data.participantCount }}
          </p>
        </div>
        <div class="admin-card">
          <p class="admin-card__label">
            Pinchos
          </p>
          <p class="admin-card__value">
            {{ data.entryCount }}
          </p>
        </div>
        <div class="admin-card">
          <p class="admin-card__label">
            Han terminado de votar
          </p>
          <p class="admin-card__value">
            {{ data.votersFinished }} / {{ data.votersTotal }}
          </p>
        </div>
      </div>
    </main>
  </div>
</template>

<style scoped>
.admin-dashboard {
  padding: var(--space-5);
  max-width: 720px;
  margin: 0 auto;
}

.admin-dashboard__status {
  color: var(--color-text-muted);
  text-align: center;
  padding: var(--space-6) 0 var(--space-3);
}

.admin-dashboard__status--error {
  color: var(--color-danger);
}

.admin-dashboard__grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: var(--space-3);
}

.admin-card {
  background: var(--color-surface);
  border-radius: var(--radius-md);
  box-shadow: var(--shadow-sm);
  padding: var(--space-4);
}

.admin-card__label {
  color: var(--color-text-muted);
  font-size: 0.85rem;
  margin: 0 0 var(--space-1);
}

.admin-card__value {
  font-size: 1.5rem;
  font-weight: 700;
  margin: 0;
}
</style>
```

- [ ] **Step 16: Run test to verify it passes**

Run: `cd frontend && npx vitest run src/views/admin/AdminDashboardView.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 17: Commit**

```bash
git add frontend/src/components/admin/ frontend/src/services/relativeTime.ts frontend/src/services/relativeTime.test.ts frontend/src/composables/useAdminDashboard.ts frontend/src/composables/useAdminDashboard.test.ts frontend/src/views/admin/AdminDashboardView.vue frontend/src/views/admin/AdminDashboardView.test.ts
git commit -m "Add AdminNav, useAdminDashboard, relativeTime, and AdminDashboardView"
```

---

### Task 7: `AdminParticipantsView`

**Files:**
- Create: `frontend/src/views/admin/AdminParticipantsView.vue`
- Test: `frontend/src/views/admin/AdminParticipantsView.test.ts`

**Interfaces:**
- Consumes: `useAdminDashboard` (Task 6), `AdminNav` (Task 6),
  `formatRelativeTime` (Task 6), `api.patch`/`api.delete`.

- [ ] **Step 1: Write the failing test `frontend/src/views/admin/AdminParticipantsView.test.ts`**

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import AdminParticipantsView from './AdminParticipantsView.vue';

vi.mock('vue-router', () => ({
  useRouter: () => ({ push: vi.fn() }),
}));

vi.mock('../../services/api', async () => {
  const actual = await vi.importActual<typeof import('../../services/api')>('../../services/api');
  return { ...actual, api: { ...actual.api, get: vi.fn(), patch: vi.fn(), delete: vi.fn() } };
});

import { api } from '../../services/api';

const people = [
  {
    id: 'u1',
    name: 'Laura',
    entryNumbers: [3, 11],
    votedCount: 3,
    voteLimit: 3,
    hasFinishedVoting: true,
    lastSeen: new Date().toISOString(),
  },
  {
    id: 'u2',
    name: 'Miguel',
    entryNumbers: [],
    votedCount: 2,
    voteLimit: 3,
    hasFinishedVoting: false,
    lastSeen: new Date(Date.now() - 7 * 60_000).toISOString(),
  },
];

beforeEach(() => {
  vi.clearAllMocks();
  vi.unstubAllGlobals();
  vi.mocked(api.get).mockResolvedValue({
    phase: 'VOTING',
    allowSelfVote: false,
    participantCount: 2,
    entryCount: 2,
    votersFinished: 1,
    votersTotal: 2,
    people,
  });
});

describe('AdminParticipantsView', () => {
  it('lists each participant with their entries, voting progress and status', async () => {
    const wrapper = mount(AdminParticipantsView);
    await flushPromises();

    expect(wrapper.text()).toContain('Laura');
    expect(wrapper.text()).toContain('#03, #11');
    expect(wrapper.text()).toContain('3 / 3');
    expect(wrapper.text()).toContain('Completo');
    expect(wrapper.text()).toContain('Miguel');
    expect(wrapper.text()).toContain('2 / 3');
    expect(wrapper.text()).toContain('Pendiente');
  });

  it('renames a participant after confirming via prompt', async () => {
    vi.spyOn(window, 'prompt').mockReturnValue('Laura M.');
    vi.mocked(api.patch).mockResolvedValue({});
    const wrapper = mount(AdminParticipantsView);
    await flushPromises();

    await wrapper.findAll('button.admin-table__edit')[0].trigger('click');
    await flushPromises();

    expect(api.patch).toHaveBeenCalledWith('/api/admin/users/u1', { name: 'Laura M.' });
  });

  it('does not rename when the prompt is cancelled', async () => {
    vi.spyOn(window, 'prompt').mockReturnValue(null);
    const wrapper = mount(AdminParticipantsView);
    await flushPromises();

    await wrapper.findAll('button.admin-table__edit')[0].trigger('click');
    await flushPromises();

    expect(api.patch).not.toHaveBeenCalled();
  });

  it('deletes a participant after confirming', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    vi.mocked(api.delete).mockResolvedValue({});
    const wrapper = mount(AdminParticipantsView);
    await flushPromises();

    await wrapper.findAll('button.admin-table__delete')[0].trigger('click');
    await flushPromises();

    expect(api.delete).toHaveBeenCalledWith('/api/admin/users/u1');
  });

  it('does not delete when the confirmation is declined', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(false);
    const wrapper = mount(AdminParticipantsView);
    await flushPromises();

    await wrapper.findAll('button.admin-table__delete')[0].trigger('click');
    await flushPromises();

    expect(api.delete).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && npx vitest run src/views/admin/AdminParticipantsView.test.ts`
Expected: FAIL — `Cannot find module './AdminParticipantsView.vue'`.

- [ ] **Step 3: Create `frontend/src/views/admin/AdminParticipantsView.vue`**

```vue
<script setup lang="ts">
import AdminNav from '../../components/admin/AdminNav.vue';
import { useAdminDashboard, type AdminPerson } from '../../composables/useAdminDashboard';
import { formatRelativeTime } from '../../services/relativeTime';
import { api, ApiError } from '../../services/api';

const { data, isLoading, error, refetch } = useAdminDashboard();

function entryLabels(person: AdminPerson): string {
  if (person.entryNumbers.length === 0) return '—';
  return person.entryNumbers.map((n) => `#${String(n).padStart(2, '0')}`).join(', ');
}

async function renamePerson(person: AdminPerson): Promise<void> {
  const newName = window.prompt('Nuevo nombre', person.name);
  if (newName === null) return;
  const trimmed = newName.trim();
  if (!trimmed || trimmed === person.name) return;
  try {
    await api.patch(`/api/admin/users/${person.id}`, { name: trimmed });
    await refetch();
  } catch (err) {
    window.alert(err instanceof ApiError ? err.message : 'No hemos podido renombrar.');
  }
}

async function deletePerson(person: AdminPerson): Promise<void> {
  const confirmed = window.confirm(`¿Eliminar a ${person.name}? Esto borrará también sus tapas y votos.`);
  if (!confirmed) return;
  try {
    await api.delete(`/api/admin/users/${person.id}`);
    await refetch();
  } catch (err) {
    window.alert(err instanceof ApiError ? err.message : 'No hemos podido eliminar al participante.');
  }
}
</script>

<template>
  <div>
    <AdminNav />
    <main class="admin-participants">
      <h1 class="admin-participants__title">
        Participantes
      </h1>

      <p v-if="isLoading" class="admin-participants__status">
        Cargando…
      </p>
      <template v-else-if="error">
        <p class="admin-participants__status admin-participants__status--error">
          {{ error }}
        </p>
        <button class="button button--secondary" type="button" @click="refetch">
          Reintentar
        </button>
      </template>
      <table v-else-if="data" class="admin-table">
        <thead>
          <tr>
            <th>Nombre</th>
            <th>Pinchos</th>
            <th>Votos</th>
            <th>Última actividad</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="person in data.people" :key="person.id">
            <td>{{ person.name }}</td>
            <td>{{ entryLabels(person) }}</td>
            <td>{{ person.votedCount }} / {{ person.voteLimit }} — {{ person.hasFinishedVoting ? 'Completo' : 'Pendiente' }}</td>
            <td>{{ formatRelativeTime(person.lastSeen) }}</td>
            <td>
              <button class="admin-table__edit" type="button" @click="renamePerson(person)">
                Editar
              </button>
              <button class="admin-table__delete" type="button" @click="deletePerson(person)">
                Eliminar
              </button>
            </td>
          </tr>
        </tbody>
      </table>
    </main>
  </div>
</template>

<style scoped>
.admin-participants {
  padding: var(--space-5);
  max-width: 960px;
  margin: 0 auto;
}

.admin-participants__title {
  font-size: 1.4rem;
  margin: 0 0 var(--space-4);
}

.admin-participants__status {
  color: var(--color-text-muted);
  text-align: center;
  padding: var(--space-6) 0 var(--space-3);
}

.admin-participants__status--error {
  color: var(--color-danger);
}

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

.admin-table button {
  background: none;
  border: none;
  color: var(--color-primary);
  font-weight: 600;
  cursor: pointer;
  padding: var(--space-1) var(--space-2);
}

.admin-table__delete {
  color: var(--color-danger) !important;
}
</style>
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd frontend && npx vitest run src/views/admin/AdminParticipantsView.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add frontend/src/views/admin/AdminParticipantsView.vue frontend/src/views/admin/AdminParticipantsView.test.ts
git commit -m "Add AdminParticipantsView: list, rename, delete"
```

---

### Task 8: `AdminEntriesView`

**Files:**
- Create: `frontend/src/views/admin/AdminEntriesView.vue`
- Test: `frontend/src/views/admin/AdminEntriesView.test.ts`

**Interfaces:**
- Consumes: `AdminNav` (Task 6), `GET /api/admin/entries` (Task 1) via a
  local `onMounted` fetch (this view does not use `useAdminDashboard` —
  it needs full entry detail, which that composable's endpoint doesn't
  return).

- [ ] **Step 1: Write the failing test `frontend/src/views/admin/AdminEntriesView.test.ts`**

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import AdminEntriesView from './AdminEntriesView.vue';

vi.mock('vue-router', () => ({
  useRouter: () => ({ push: vi.fn() }),
}));

vi.mock('../../services/api', async () => {
  const actual = await vi.importActual<typeof import('../../services/api')>('../../services/api');
  return { ...actual, api: { ...actual.api, get: vi.fn(), patch: vi.fn(), delete: vi.fn() } };
});

import { api } from '../../services/api';

const entries = [
  {
    id: 'e1',
    number: 1,
    creatorId: 'u1',
    creatorName: 'Laura',
    name: 'Croqueta',
    description: 'Con jamón.',
    imagePath: 'a.webp',
    createdAt: 'x',
  },
];

beforeEach(() => {
  vi.clearAllMocks();
  vi.unstubAllGlobals();
  vi.mocked(api.get).mockResolvedValue(entries);
});

describe('AdminEntriesView', () => {
  it('lists each entry with its number, name, description and creator', async () => {
    const wrapper = mount(AdminEntriesView);
    await flushPromises();

    expect(wrapper.text()).toContain('#01');
    expect(wrapper.text()).toContain('Croqueta');
    expect(wrapper.text()).toContain('Con jamón.');
    expect(wrapper.text()).toContain('Laura');
  });

  it('edits an entry after confirming both prompts', async () => {
    vi.spyOn(window, 'prompt').mockReturnValueOnce('Croqueta de jamón').mockReturnValueOnce('Con jamón ibérico.');
    vi.mocked(api.patch).mockResolvedValue({});
    const wrapper = mount(AdminEntriesView);
    await flushPromises();

    await wrapper.find('button.admin-table__edit').trigger('click');
    await flushPromises();

    expect(api.patch).toHaveBeenCalledWith('/api/admin/entries/e1', {
      name: 'Croqueta de jamón',
      description: 'Con jamón ibérico.',
    });
  });

  it('does not edit when the first prompt is cancelled', async () => {
    vi.spyOn(window, 'prompt').mockReturnValueOnce(null);
    const wrapper = mount(AdminEntriesView);
    await flushPromises();

    await wrapper.find('button.admin-table__edit').trigger('click');
    await flushPromises();

    expect(api.patch).not.toHaveBeenCalled();
  });

  it('deletes an entry after confirming', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    vi.mocked(api.delete).mockResolvedValue({});
    const wrapper = mount(AdminEntriesView);
    await flushPromises();

    await wrapper.find('button.admin-table__delete').trigger('click');
    await flushPromises();

    expect(api.delete).toHaveBeenCalledWith('/api/admin/entries/e1');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && npx vitest run src/views/admin/AdminEntriesView.test.ts`
Expected: FAIL — `Cannot find module './AdminEntriesView.vue'`.

- [ ] **Step 3: Create `frontend/src/views/admin/AdminEntriesView.vue`**

```vue
<script setup lang="ts">
import { ref, onMounted } from 'vue';
import AdminNav from '../../components/admin/AdminNav.vue';
import { api, ApiError } from '../../services/api';

interface AdminEntry {
  id: string;
  number: number;
  creatorId: string;
  creatorName: string;
  name: string | null;
  description: string | null;
  imagePath: string;
  createdAt: string;
}

const entries = ref<AdminEntry[]>([]);
const isLoading = ref(true);
const error = ref<string | null>(null);

async function fetchEntries(): Promise<void> {
  isLoading.value = true;
  error.value = null;
  try {
    entries.value = await api.get<AdminEntry[]>('/api/admin/entries');
  } catch (err) {
    error.value = err instanceof ApiError ? err.message : 'No hemos podido cargar las tapas.';
  } finally {
    isLoading.value = false;
  }
}

onMounted(fetchEntries);

async function editEntry(entry: AdminEntry): Promise<void> {
  const newName = window.prompt('Nombre de la tapa (vacío para quitar)', entry.name ?? '');
  if (newName === null) return;
  const newDescription = window.prompt('Descripción (vacío para quitar)', entry.description ?? '');
  if (newDescription === null) return;
  try {
    await api.patch(`/api/admin/entries/${entry.id}`, {
      name: newName.trim() || null,
      description: newDescription.trim() || null,
    });
    await fetchEntries();
  } catch (err) {
    window.alert(err instanceof ApiError ? err.message : 'No hemos podido editar la tapa.');
  }
}

async function deleteEntry(entry: AdminEntry): Promise<void> {
  const confirmed = window.confirm(`¿Eliminar la tapa #${entry.number}? Esto no se puede deshacer.`);
  if (!confirmed) return;
  try {
    await api.delete(`/api/admin/entries/${entry.id}`);
    await fetchEntries();
  } catch (err) {
    window.alert(err instanceof ApiError ? err.message : 'No hemos podido eliminar la tapa.');
  }
}
</script>

<template>
  <div>
    <AdminNav />
    <main class="admin-entries">
      <h1 class="admin-entries__title">
        Tapas
      </h1>

      <p v-if="isLoading" class="admin-entries__status">
        Cargando…
      </p>
      <template v-else-if="error">
        <p class="admin-entries__status admin-entries__status--error">
          {{ error }}
        </p>
        <button class="button button--secondary" type="button" @click="fetchEntries">
          Reintentar
        </button>
      </template>
      <table v-else class="admin-table">
        <thead>
          <tr>
            <th>Nº</th>
            <th>Nombre</th>
            <th>Descripción</th>
            <th>Creador</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="entry in entries" :key="entry.id">
            <td>#{{ String(entry.number).padStart(2, '0') }}</td>
            <td>{{ entry.name ?? '—' }}</td>
            <td>{{ entry.description ?? '—' }}</td>
            <td>{{ entry.creatorName }}</td>
            <td>
              <button class="admin-table__edit" type="button" @click="editEntry(entry)">
                Editar
              </button>
              <button class="admin-table__delete" type="button" @click="deleteEntry(entry)">
                Eliminar
              </button>
            </td>
          </tr>
        </tbody>
      </table>
    </main>
  </div>
</template>

<style scoped>
.admin-entries {
  padding: var(--space-5);
  max-width: 960px;
  margin: 0 auto;
}

.admin-entries__title {
  font-size: 1.4rem;
  margin: 0 0 var(--space-4);
}

.admin-entries__status {
  color: var(--color-text-muted);
  text-align: center;
  padding: var(--space-6) 0 var(--space-3);
}

.admin-entries__status--error {
  color: var(--color-danger);
}

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

.admin-table button {
  background: none;
  border: none;
  color: var(--color-primary);
  font-weight: 600;
  cursor: pointer;
  padding: var(--space-1) var(--space-2);
}

.admin-table__delete {
  color: var(--color-danger) !important;
}
</style>
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd frontend && npx vitest run src/views/admin/AdminEntriesView.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add frontend/src/views/admin/AdminEntriesView.vue frontend/src/views/admin/AdminEntriesView.test.ts
git commit -m "Add AdminEntriesView: list, edit, delete"
```

---

### Task 9: `AdminPhasesView`

**Files:**
- Create: `frontend/src/views/admin/AdminPhasesView.vue`
- Test: `frontend/src/views/admin/AdminPhasesView.test.ts`

**Interfaces:**
- Consumes: `useAdminDashboard` (Task 6), `AdminNav` (Task 6).
- Produces: a view exposing phase-appropriate action buttons only
  (`v-if` on `data.phase`) — never a button that would just error out.

- [ ] **Step 1: Write the failing test `frontend/src/views/admin/AdminPhasesView.test.ts`**

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import AdminPhasesView from './AdminPhasesView.vue';

vi.mock('vue-router', () => ({
  useRouter: () => ({ push: vi.fn() }),
}));

vi.mock('../../services/api', async () => {
  const actual = await vi.importActual<typeof import('../../services/api')>('../../services/api');
  return { ...actual, api: { ...actual.api, get: vi.fn(), post: vi.fn(), patch: vi.fn() } };
});

import { api, ApiError } from '../../services/api';

function dashboardWith(phase: string, allowSelfVote = false) {
  return {
    phase,
    allowSelfVote,
    participantCount: 2,
    entryCount: 2,
    votersFinished: 1,
    votersTotal: 2,
    people: [],
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.unstubAllGlobals();
});

describe('AdminPhasesView', () => {
  it('shows only "Iniciar concurso" during REGISTRATION', async () => {
    vi.mocked(api.get).mockResolvedValue(dashboardWith('REGISTRATION'));
    const wrapper = mount(AdminPhasesView);
    await flushPromises();

    expect(wrapper.text()).toContain('Iniciar concurso');
    expect(wrapper.text()).not.toContain('Cerrar votación');
  });

  it('starts the contest after confirming', async () => {
    vi.mocked(api.get).mockResolvedValue(dashboardWith('REGISTRATION'));
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    vi.mocked(api.post).mockResolvedValue({});
    const wrapper = mount(AdminPhasesView);
    await flushPromises();

    await wrapper.find('.admin-phases__start').trigger('click');
    await flushPromises();

    expect(api.post).toHaveBeenCalledWith('/api/admin/contest/start');
  });

  it('shows only "Cerrar votación" during VOTING', async () => {
    vi.mocked(api.get).mockResolvedValue(dashboardWith('VOTING'));
    const wrapper = mount(AdminPhasesView);
    await flushPromises();

    expect(wrapper.text()).toContain('Cerrar votación');
    expect(wrapper.text()).not.toContain('Iniciar concurso');
  });

  it('closes voting directly when nobody is pending', async () => {
    vi.mocked(api.get).mockResolvedValue(dashboardWith('VOTING'));
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    vi.mocked(api.post).mockResolvedValue({ phase: 'RESULTS' });
    const wrapper = mount(AdminPhasesView);
    await flushPromises();

    await wrapper.find('.admin-phases__close-voting').trigger('click');
    await flushPromises();

    expect(api.post).toHaveBeenCalledWith('/api/admin/contest/close-voting', {});
  });

  it('offers to force-close when voters are pending, and does so on confirmation', async () => {
    vi.mocked(api.get).mockResolvedValue(dashboardWith('VOTING'));
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);
    vi.mocked(api.post)
      .mockRejectedValueOnce(new ApiError(409, 'VOTERS_PENDING', 'Hay 1 persona(s) que todavía no ha(n) completado sus votos.'))
      .mockResolvedValueOnce({ phase: 'RESULTS' });
    const wrapper = mount(AdminPhasesView);
    await flushPromises();

    await wrapper.find('.admin-phases__close-voting').trigger('click');
    await flushPromises();

    expect(confirmSpy).toHaveBeenCalledTimes(2);
    expect(api.post).toHaveBeenNthCalledWith(1, '/api/admin/contest/close-voting', {});
    expect(api.post).toHaveBeenNthCalledWith(2, '/api/admin/contest/close-voting', { force: true });
  });

  it('toggles allowSelfVote', async () => {
    vi.mocked(api.get).mockResolvedValue(dashboardWith('VOTING', false));
    vi.mocked(api.patch).mockResolvedValue({});
    const wrapper = mount(AdminPhasesView);
    await flushPromises();

    await wrapper.find('.admin-phases__self-vote').trigger('click');
    await flushPromises();

    expect(api.patch).toHaveBeenCalledWith('/api/admin/contest', { allowSelfVote: true });
  });

  it('shows only "Cerrar ronda de desempate" during TIEBREAK', async () => {
    vi.mocked(api.get).mockResolvedValue(dashboardWith('TIEBREAK'));
    const wrapper = mount(AdminPhasesView);
    await flushPromises();

    expect(wrapper.text()).toContain('Cerrar ronda de desempate');
  });

  it('shows only "Mostrar resultados" during RESULTS', async () => {
    vi.mocked(api.get).mockResolvedValue(dashboardWith('RESULTS'));
    const wrapper = mount(AdminPhasesView);
    await flushPromises();

    expect(wrapper.text()).toContain('Mostrar resultados');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && npx vitest run src/views/admin/AdminPhasesView.test.ts`
Expected: FAIL — `Cannot find module './AdminPhasesView.vue'`.

- [ ] **Step 3: Create `frontend/src/views/admin/AdminPhasesView.vue`**

```vue
<script setup lang="ts">
import AdminNav from '../../components/admin/AdminNav.vue';
import { useAdminDashboard } from '../../composables/useAdminDashboard';
import { api, ApiError } from '../../services/api';

const { data, isLoading, error, refetch } = useAdminDashboard();

function friendlyMessage(err: unknown, fallback: string): string {
  return err instanceof ApiError ? err.message : fallback;
}

async function startContest(): Promise<void> {
  const confirmed = window.confirm(
    'Una vez iniciado el concurso ya no se podrán registrar nuevas tapas. ¿Quieres continuar?'
  );
  if (!confirmed) return;
  try {
    await api.post('/api/admin/contest/start');
    await refetch();
  } catch (err) {
    window.alert(friendlyMessage(err, 'No hemos podido iniciar el concurso.'));
  }
}

async function closeVoting(): Promise<void> {
  const confirmed = window.confirm('¿Cerrar la votación?');
  if (!confirmed) return;
  try {
    await api.post('/api/admin/contest/close-voting', {});
    await refetch();
  } catch (err) {
    if (err instanceof ApiError && err.code === 'VOTERS_PENDING') {
      const forceConfirmed = window.confirm(`${err.message} ¿Cerrar igualmente?`);
      if (!forceConfirmed) return;
      try {
        await api.post('/api/admin/contest/close-voting', { force: true });
        await refetch();
      } catch (err2) {
        window.alert(friendlyMessage(err2, 'No hemos podido cerrar la votación.'));
      }
      return;
    }
    window.alert(friendlyMessage(err, 'No hemos podido cerrar la votación.'));
  }
}

async function toggleSelfVote(): Promise<void> {
  if (!data.value) return;
  try {
    await api.patch('/api/admin/contest', { allowSelfVote: !data.value.allowSelfVote });
    await refetch();
  } catch (err) {
    window.alert(friendlyMessage(err, 'No hemos podido cambiar la configuración.'));
  }
}

async function closeTiebreakRound(): Promise<void> {
  try {
    await api.post('/api/admin/tiebreak/close-round');
    await refetch();
  } catch (err) {
    window.alert(friendlyMessage(err, 'No hemos podido cerrar la ronda.'));
  }
}

async function revealResults(): Promise<void> {
  const confirmed = window.confirm('¿Mostrar los resultados a todo el mundo ahora?');
  if (!confirmed) return;
  try {
    await api.post('/api/admin/contest/reveal-results');
    await refetch();
  } catch (err) {
    window.alert(friendlyMessage(err, 'No hemos podido mostrar los resultados.'));
  }
}
</script>

<template>
  <div>
    <AdminNav />
    <main class="admin-phases">
      <h1 class="admin-phases__title">
        Control de fases
      </h1>

      <p v-if="isLoading" class="admin-phases__status">
        Cargando…
      </p>
      <template v-else-if="error">
        <p class="admin-phases__status admin-phases__status--error">
          {{ error }}
        </p>
        <button class="button button--secondary" type="button" @click="refetch">
          Reintentar
        </button>
      </template>
      <div v-else-if="data" class="admin-phases__actions">
        <button
          v-if="data.phase === 'REGISTRATION'"
          class="button button--primary admin-phases__start"
          type="button"
          @click="startContest"
        >
          Iniciar concurso
        </button>

        <button
          v-if="data.phase === 'VOTING'"
          class="button button--primary admin-phases__close-voting"
          type="button"
          @click="closeVoting"
        >
          Cerrar votación
        </button>

        <button
          v-if="data.phase === 'TIEBREAK'"
          class="button button--primary admin-phases__close-round"
          type="button"
          @click="closeTiebreakRound"
        >
          Cerrar ronda de desempate
        </button>

        <button
          v-if="data.phase === 'RESULTS'"
          class="button button--primary admin-phases__reveal"
          type="button"
          @click="revealResults"
        >
          Mostrar resultados
        </button>

        <button class="button button--secondary admin-phases__self-vote" type="button" @click="toggleSelfVote">
          Autovoto: {{ data.allowSelfVote ? 'permitido' : 'no permitido' }} (cambiar)
        </button>
      </div>
    </main>
  </div>
</template>

<style scoped>
.admin-phases {
  padding: var(--space-5);
  max-width: 480px;
  margin: 0 auto;
}

.admin-phases__title {
  font-size: 1.4rem;
  margin: 0 0 var(--space-4);
}

.admin-phases__status {
  color: var(--color-text-muted);
  text-align: center;
  padding: var(--space-6) 0 var(--space-3);
}

.admin-phases__status--error {
  color: var(--color-danger);
}

.admin-phases__actions {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
}
</style>
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd frontend && npx vitest run src/views/admin/AdminPhasesView.test.ts`
Expected: PASS (8 tests).

- [ ] **Step 5: Run the whole frontend suite**

Run: `cd frontend && npx vitest run`
Expected: every test file passes.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/views/admin/AdminPhasesView.vue frontend/src/views/admin/AdminPhasesView.test.ts
git commit -m "Add AdminPhasesView: phase-gated contest controls"
```

---

### Task 10: Verification and README

**Files:**
- Modify: `README.md` (repo root)

- [ ] **Step 1: Run typecheck, lint and tests for the frontend**

Run: `cd frontend && npm run typecheck && npm run lint && npm test`
Expected: all three succeed with zero errors.

- [ ] **Step 2: Re-run the backend suite**

Run: `cd server && npm test`
Expected: all 44 backend tests pass.

- [ ] **Step 3: End-to-end check via curl (or a browser, if a tool is available)**

```bash
# start the contest, then confirm the dashboard reflects it, then confirm
# the admin entries endpoint lists tapas even before voting opens
curl -s -X POST http://localhost:3000/api/admin/contest/start -H "X-Admin-Pin: 0000"
curl -s http://localhost:3000/api/admin/dashboard -H "X-Admin-Pin: 0000"
curl -s http://localhost:3000/api/admin/entries -H "X-Admin-Pin: 0000"
```

If a browser tool is available, additionally log in at `/admin` with the
real PIN and click through all four screens. State plainly which of the
two you did — never claim the other happened.

- [ ] **Step 4: Commit only if fixes were needed**

```bash
git add <fixed files>
git commit -m "Fix issues found in final verification"
```

- [ ] **Step 5: Update the README's "Estado actual" note**

```markdown
> **Estado actual:** el backend está completo y probado. El frontend
> cubre el registro de participante y de tapas, la galería de tapas, y
> el panel de administración completo (login por PIN, dashboard en vivo,
> gestión de participantes y tapas, control de fases). La votación en sí
> (favoritos) y la pantalla de resultados todavía no existen en el
> frontend — se prueban directamente contra la API REST.
```

- [ ] **Step 6: Commit**

```bash
git add README.md
git commit -m "Update README: admin panel is live"
```

---

## End of Fase F

A host can now run the entire party from their phone or laptop browser:
log in once with the PIN, watch the dashboard update live, fix a typo'd
name, delete an accidental duplicate entry, and drive the contest through
every phase — no more `curl`. Fase E (sistema de favoritos) and Fase G
(desempates y resultados) remain the two guest-facing pieces still
missing from the frontend.
