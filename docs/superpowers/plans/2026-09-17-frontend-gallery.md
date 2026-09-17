# Frontend — Galería de Tapas (Fase D) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Once voting opens, guests see a responsive grid of every tapa
(photo + number) and can open any one to see its full detail (name,
description, who brought it) — spec screens 7–8. Purely a viewing
experience: no favoriting yet, that's Fase E. Also closes the loop left
open at the end of Fase C: the waiting room now actually navigates to the
gallery once the phase changes, live, without a reload.

**Architecture:** The existing `entries` Pinia store (Fase C, currently
just `lastCreated`) grows a `list` + `fetchList()` for the grid and a
stateless `fetchDetail(id)` for the detail screen — no new store. The
backend's `GET /api/entries/:id` gains the creator's name (a small `JOIN`),
since the spec requires showing who brought each tapa and there is no
other endpoint that exposes it. The router gains `/galeria` and
`/galeria/:id`, and the redirect rules from Fase C are updated: once
registration closes, everything now lands on the gallery instead of the
now-superseded "wait here" screen.

**Tech Stack:** Same as Fases B/C — no new dependencies, backend or
frontend.

**Spec:** `docs/superpowers/specs/2026-09-16-pincho-party-design.md`

## Global Constraints

- No voting UI in this phase — no favorite button, no golden border, no
  "X/3" indicator. `EntryDetailView` is read-only.
- The gallery grid shows only photo + number per card (spec: "no mostrar
  demasiada información inicialmente"); name/description/creator only
  appear in the detail view.
- The gallery stays phase-gated exactly like the backend already gates it:
  both server (`GALLERY_LOCKED` during `REGISTRATION`, unchanged since
  Fase A) and the router guard block `/galeria` and `/galeria/:id` while
  registration is open.
- Route naming avoids the existing `/pincho/*` family (`/pincho`,
  `/pincho/nuevo`, `/pincho/confirmacion/:number`) to prevent path
  collisions — gallery routes live under `/galeria`.
- Same loading/error/retry pattern as every previous phase.

---

### Task 1: Backend — include the creator's name in entry detail

**Files:**
- Modify: `server/src/services/entryService.ts`
- Modify: `server/src/services/entryService.test.ts`

**Interfaces:**
- Produces: `EntryDetail extends Entry { creatorName: string }`,
  `getEntry(db, id): EntryDetail` (was `Entry` — the returned object still
  has every existing field, this only adds one). `listEntries` is
  unchanged (grid needs no creator name, no join, no behavior change).

- [ ] **Step 1: Write the failing test — add to `server/src/services/entryService.test.ts`**

Add inside the existing `describe('entryService', ...)` block:

```ts
  it('getEntry includes the creator name', () => {
    const entry = createEntry(db, { creatorId, name: 'Croqueta', description: null, imagePath: 'a.webp' });
    startContest(db);
    const detail = getEntry(db, entry.id);
    expect(detail.creatorName).toBe('Laura');
  });
```

(`creatorId` in this file's `beforeEach` is `createUser(db, 'Laura').id`,
so `'Laura'` is the expected name.)

- [ ] **Step 2: Run test to verify it fails**

Run: `cd server && npx vitest run src/services/entryService.test.ts`
Expected: FAIL — `detail.creatorName` is `undefined`.

- [ ] **Step 3: Modify `server/src/services/entryService.ts`**

Add the new interface after the existing `Entry` interface, and replace
`getEntry`:

```ts
export interface EntryDetail extends Entry {
  creatorName: string;
}

export function getEntry(db: Database.Database, id: string): EntryDetail {
  assertGalleryUnlocked(db);
  const entry = db
    .prepare(
      `SELECT e.*, u.name as creatorName
       FROM Entry e
       JOIN User u ON u.id = e.creatorId
       WHERE e.id = ?`
    )
    .get(id) as EntryDetail | undefined;
  if (!entry) {
    throw new AppError(404, 'ENTRY_NOT_FOUND', 'No existe esa tapa.');
  }
  return entry;
}
```

- [ ] **Step 4: Run the whole file to verify it passes with no regressions**

Run: `cd server && npx vitest run src/services/entryService.test.ts`
Expected: PASS (7 tests — the 6 from Fase A plus this one).

- [ ] **Step 5: Run the full backend suite and typecheck**

Run: `cd server && npm test && npm run typecheck && npm run lint`
Expected: all green (44 backend tests total).

- [ ] **Step 6: Commit**

```bash
git add server/src/services/entryService.ts server/src/services/entryService.test.ts
git commit -m "Include creator name in entry detail response"
```

---

### Task 2: Extend the `entries` store with gallery list + detail fetch

**Files:**
- Modify: `frontend/src/stores/entries.ts`
- Modify: `frontend/src/stores/entries.test.ts`

**Interfaces:**
- Consumes: `api` (Fase B/C).
- Produces (added to the existing `useEntriesStore`, `lastCreated` and
  `setLastCreated` untouched): `EntrySummary { id, number, creatorId, name, description, imagePath, createdAt }`,
  `EntryDetail extends EntrySummary { creatorName: string }`,
  `list: Ref<EntrySummary[]>`, `isLoadingList: Ref<boolean>`,
  `listError: Ref<string | null>`, `fetchList(): Promise<void>`,
  `fetchDetail(id: string): Promise<EntryDetail>` (stateless — the caller
  holds the result locally, no caching, matching this store's existing
  minimal-state style).

- [ ] **Step 1: Write the failing test — add to `frontend/src/stores/entries.test.ts`**

Replace the whole file with:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { setActivePinia, createPinia } from 'pinia';

vi.mock('../services/api', async () => {
  const actual = await vi.importActual<typeof import('../services/api')>('../services/api');
  return { ...actual, api: { ...actual.api, get: vi.fn() } };
});

import { api, ApiError } from '../services/api';
import { useEntriesStore } from './entries';

beforeEach(() => {
  setActivePinia(createPinia());
  vi.clearAllMocks();
});

describe('useEntriesStore', () => {
  it('starts with no last-created entry', () => {
    expect(useEntriesStore().lastCreated).toBeNull();
  });

  it('setLastCreated stores the entry', () => {
    const store = useEntriesStore();
    store.setLastCreated({ id: 'e1', number: 7, name: 'Croqueta', description: null, imagePath: 'a.webp' });
    expect(store.lastCreated).toEqual({
      id: 'e1',
      number: 7,
      name: 'Croqueta',
      description: null,
      imagePath: 'a.webp',
    });
  });

  it('fetchList populates the list on success', async () => {
    vi.mocked(api.get).mockResolvedValue([
      { id: 'e1', number: 1, creatorId: 'u1', name: null, description: null, imagePath: 'a.webp', createdAt: 'x' },
    ]);
    const store = useEntriesStore();

    await store.fetchList();

    expect(store.list).toHaveLength(1);
    expect(store.isLoadingList).toBe(false);
    expect(store.listError).toBeNull();
    expect(api.get).toHaveBeenCalledWith('/api/entries');
  });

  it('fetchList surfaces a friendly error and rethrows on failure', async () => {
    vi.mocked(api.get).mockRejectedValue(new ApiError(500, 'INTERNAL_ERROR', 'Ha ocurrido un error inesperado.'));
    const store = useEntriesStore();

    await expect(store.fetchList()).rejects.toThrow();

    expect(store.listError).toBe('Ha ocurrido un error inesperado.');
    expect(store.isLoadingList).toBe(false);
  });

  it('fetchDetail returns the entry detail without touching list state', async () => {
    vi.mocked(api.get).mockResolvedValue({
      id: 'e1',
      number: 1,
      creatorId: 'u1',
      creatorName: 'Laura',
      name: null,
      description: null,
      imagePath: 'a.webp',
      createdAt: 'x',
    });
    const store = useEntriesStore();

    const detail = await store.fetchDetail('e1');

    expect(detail.creatorName).toBe('Laura');
    expect(api.get).toHaveBeenCalledWith('/api/entries/e1');
    expect(store.list).toEqual([]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && npx vitest run src/stores/entries.test.ts`
Expected: FAIL — `store.fetchList is not a function`.

- [ ] **Step 3: Replace `frontend/src/stores/entries.ts`**

```ts
import { ref } from 'vue';
import { defineStore } from 'pinia';
import { api, ApiError } from '../services/api';

export interface CreatedEntry {
  id: string;
  number: number;
  name: string | null;
  description: string | null;
  imagePath: string;
}

export interface EntrySummary {
  id: string;
  number: number;
  creatorId: string;
  name: string | null;
  description: string | null;
  imagePath: string;
  createdAt: string;
}

export interface EntryDetail extends EntrySummary {
  creatorName: string;
}

export const useEntriesStore = defineStore('entries', () => {
  const lastCreated = ref<CreatedEntry | null>(null);
  const list = ref<EntrySummary[]>([]);
  const isLoadingList = ref(false);
  const listError = ref<string | null>(null);

  function setLastCreated(entry: CreatedEntry): void {
    lastCreated.value = entry;
  }

  async function fetchList(): Promise<void> {
    isLoadingList.value = true;
    listError.value = null;
    try {
      list.value = await api.get<EntrySummary[]>('/api/entries');
    } catch (err) {
      listError.value = err instanceof ApiError ? err.message : 'No hemos podido cargar la galería.';
      throw err;
    } finally {
      isLoadingList.value = false;
    }
  }

  async function fetchDetail(id: string): Promise<EntryDetail> {
    return api.get<EntryDetail>(`/api/entries/${id}`);
  }

  return { lastCreated, list, isLoadingList, listError, setLastCreated, fetchList, fetchDetail };
});
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd frontend && npx vitest run src/stores/entries.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add frontend/src/stores/entries.ts frontend/src/stores/entries.test.ts
git commit -m "Extend entries store with gallery list and detail fetch"
```

---

### Task 3: `GalleryView`

**Files:**
- Create: `frontend/src/views/GalleryView.vue`
- Test: `frontend/src/views/GalleryView.test.ts`

**Interfaces:**
- Consumes: `useEntriesStore` (Task 2), `useHeartbeat` (Fase C).
- Produces: a view that fetches the list on mount and navigates to
  `{ name: 'entry-detail', params: { id } }` on card click.

- [ ] **Step 1: Write the failing test `frontend/src/views/GalleryView.test.ts`**

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import { setActivePinia, createPinia } from 'pinia';
import GalleryView from './GalleryView.vue';

const pushMock = vi.fn();
vi.mock('vue-router', () => ({
  useRouter: () => ({ push: pushMock }),
}));

vi.mock('../composables/useHeartbeat', () => ({
  useHeartbeat: vi.fn(),
}));

vi.mock('../services/api', async () => {
  const actual = await vi.importActual<typeof import('../services/api')>('../services/api');
  return { ...actual, api: { ...actual.api, get: vi.fn() } };
});

import { api } from '../services/api';

beforeEach(() => {
  setActivePinia(createPinia());
  pushMock.mockClear();
  vi.clearAllMocks();
});

describe('GalleryView', () => {
  it('shows a loading state while fetching', () => {
    vi.mocked(api.get).mockReturnValue(new Promise(() => {}));
    const wrapper = mount(GalleryView);
    expect(wrapper.text()).toContain('Cargando');
  });

  it('renders a card with the padded number for each entry', async () => {
    vi.mocked(api.get).mockResolvedValue([
      { id: 'e1', number: 1, creatorId: 'u1', name: null, description: null, imagePath: 'a.webp', createdAt: 'x' },
      { id: 'e2', number: 2, creatorId: 'u2', name: null, description: null, imagePath: 'b.webp', createdAt: 'x' },
    ]);
    const wrapper = mount(GalleryView);
    await flushPromises();

    expect(wrapper.findAll('.gallery__card')).toHaveLength(2);
    expect(wrapper.text()).toContain('#01');
    expect(wrapper.text()).toContain('#02');
  });

  it('navigates to the entry detail when a card is clicked', async () => {
    vi.mocked(api.get).mockResolvedValue([
      { id: 'e1', number: 1, creatorId: 'u1', name: null, description: null, imagePath: 'a.webp', createdAt: 'x' },
    ]);
    const wrapper = mount(GalleryView);
    await flushPromises();

    await wrapper.find('.gallery__card').trigger('click');

    expect(pushMock).toHaveBeenCalledWith({ name: 'entry-detail', params: { id: 'e1' } });
  });

  it('shows a retryable error message when loading fails', async () => {
    vi.mocked(api.get).mockRejectedValue(new Error('network down'));
    const wrapper = mount(GalleryView);
    await flushPromises();
    expect(wrapper.text()).toContain('No hemos podido cargar la galería.');
  });

  it('shows an empty state when there are no entries yet', async () => {
    vi.mocked(api.get).mockResolvedValue([]);
    const wrapper = mount(GalleryView);
    await flushPromises();
    expect(wrapper.text()).toContain('Todavía no hay tapas registradas.');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && npx vitest run src/views/GalleryView.test.ts`
Expected: FAIL — `Cannot find module './GalleryView.vue'`.

- [ ] **Step 3: Create `frontend/src/views/GalleryView.vue`**

```vue
<script setup lang="ts">
import { onMounted } from 'vue';
import { useRouter } from 'vue-router';
import { useEntriesStore } from '../stores/entries';
import { useHeartbeat } from '../composables/useHeartbeat';

useHeartbeat();
const router = useRouter();
const entries = useEntriesStore();

onMounted(() => {
  entries.fetchList().catch(() => {
    // el error queda reflejado en entries.listError
  });
});

function openEntry(id: string): void {
  router.push({ name: 'entry-detail', params: { id } });
}
</script>

<template>
  <main class="gallery">
    <h1 class="gallery__title">Galería de tapas</h1>

    <p v-if="entries.isLoadingList" class="gallery__status">Cargando…</p>
    <template v-else-if="entries.listError">
      <p class="gallery__status gallery__status--error">{{ entries.listError }}</p>
      <button class="button button--secondary" type="button" @click="entries.fetchList()">Reintentar</button>
    </template>
    <p v-else-if="entries.list.length === 0" class="gallery__status">Todavía no hay tapas registradas.</p>

    <div v-else class="gallery__grid">
      <button
        v-for="entry in entries.list"
        :key="entry.id"
        class="gallery__card"
        type="button"
        @click="openEntry(entry.id)"
      >
        <img :src="`/uploads/${entry.imagePath}`" :alt="`Tapa número ${entry.number}`" class="gallery__photo">
        <span class="gallery__number">#{{ String(entry.number).padStart(2, '0') }}</span>
      </button>
    </div>
  </main>
</template>

<style scoped>
.gallery {
  padding: var(--space-5);
  max-width: 960px;
  margin: 0 auto;
}

.gallery__title {
  font-size: 1.5rem;
  margin: 0 0 var(--space-5);
}

.gallery__status {
  color: var(--color-text-muted);
  text-align: center;
  padding: var(--space-6) 0 var(--space-3);
}

.gallery__status--error {
  color: var(--color-danger);
}

.gallery__grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: var(--space-3);
}

@media (min-width: 640px) {
  .gallery__grid {
    grid-template-columns: repeat(3, 1fr);
  }
}

@media (min-width: 960px) {
  .gallery__grid {
    grid-template-columns: repeat(4, 1fr);
  }
}

.gallery__card {
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

.gallery__photo {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}

.gallery__number {
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

- [ ] **Step 4: Run test to verify it passes**

Run: `cd frontend && npx vitest run src/views/GalleryView.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add frontend/src/views/GalleryView.vue frontend/src/views/GalleryView.test.ts
git commit -m "Add GalleryView: responsive grid of tapas"
```

---

### Task 4: `EntryDetailView`

**Files:**
- Create: `frontend/src/views/EntryDetailView.vue`
- Test: `frontend/src/views/EntryDetailView.test.ts`

**Interfaces:**
- Consumes: `useEntriesStore().fetchDetail` (Task 2).
- Produces: a read-only detail view. No voting button — that's Fase E.

- [ ] **Step 1: Write the failing test `frontend/src/views/EntryDetailView.test.ts`**

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import { setActivePinia, createPinia } from 'pinia';
import EntryDetailView from './EntryDetailView.vue';

vi.mock('vue-router', () => ({
  useRoute: () => ({ params: { id: 'e1' } }),
}));

vi.mock('../services/api', async () => {
  const actual = await vi.importActual<typeof import('../services/api')>('../services/api');
  return { ...actual, api: { ...actual.api, get: vi.fn() } };
});

import { api } from '../services/api';

beforeEach(() => {
  setActivePinia(createPinia());
  vi.clearAllMocks();
});

describe('EntryDetailView', () => {
  it('shows a loading state initially', () => {
    vi.mocked(api.get).mockReturnValue(new Promise(() => {}));
    const wrapper = mount(EntryDetailView);
    expect(wrapper.text()).toContain('Cargando');
  });

  it('shows the entry details once loaded', async () => {
    vi.mocked(api.get).mockResolvedValue({
      id: 'e1',
      number: 7,
      creatorId: 'u1',
      creatorName: 'Laura',
      name: 'Croqueta',
      description: 'Mini brioche de carrillera.',
      imagePath: 'a.webp',
      createdAt: 'x',
    });
    const wrapper = mount(EntryDetailView);
    await flushPromises();

    expect(wrapper.text()).toContain('#07');
    expect(wrapper.text()).toContain('Croqueta');
    expect(wrapper.text()).toContain('Mini brioche de carrillera.');
    expect(wrapper.text()).toContain('Presentado por Laura');
  });

  it('omits the name/description when the entry has none', async () => {
    vi.mocked(api.get).mockResolvedValue({
      id: 'e1',
      number: 3,
      creatorId: 'u1',
      creatorName: 'Miguel',
      name: null,
      description: null,
      imagePath: 'a.webp',
      createdAt: 'x',
    });
    const wrapper = mount(EntryDetailView);
    await flushPromises();

    expect(wrapper.text()).toContain('#03');
    expect(wrapper.text()).toContain('Presentado por Miguel');
  });

  it('shows a retryable error message when loading fails', async () => {
    vi.mocked(api.get).mockRejectedValue(new Error('network down'));
    const wrapper = mount(EntryDetailView);
    await flushPromises();

    expect(wrapper.text()).toContain('No hemos podido cargar esta tapa.');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && npx vitest run src/views/EntryDetailView.test.ts`
Expected: FAIL — `Cannot find module './EntryDetailView.vue'`.

- [ ] **Step 3: Create `frontend/src/views/EntryDetailView.vue`**

```vue
<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { useRoute } from 'vue-router';
import { ApiError } from '../services/api';
import { useEntriesStore, type EntryDetail } from '../stores/entries';

const route = useRoute();
const entries = useEntriesStore();

const entry = ref<EntryDetail | null>(null);
const isLoading = ref(true);
const loadError = ref<string | null>(null);

async function load(): Promise<void> {
  isLoading.value = true;
  loadError.value = null;
  try {
    entry.value = await entries.fetchDetail(route.params.id as string);
  } catch (err) {
    loadError.value = err instanceof ApiError ? err.message : 'No hemos podido cargar esta tapa.';
  } finally {
    isLoading.value = false;
  }
}

onMounted(load);
</script>

<template>
  <main class="entry-detail">
    <p v-if="isLoading" class="entry-detail__status">Cargando…</p>
    <template v-else-if="loadError">
      <p class="entry-detail__status entry-detail__status--error">{{ loadError }}</p>
      <button class="button button--secondary" type="button" @click="load">Reintentar</button>
    </template>
    <div v-else-if="entry" class="entry-detail__card">
      <img :src="`/uploads/${entry.imagePath}`" :alt="`Tapa número ${entry.number}`" class="entry-detail__photo">
      <p class="entry-detail__badge">#{{ String(entry.number).padStart(2, '0') }}</p>
      <h1 v-if="entry.name" class="entry-detail__name">{{ entry.name }}</h1>
      <p v-if="entry.description" class="entry-detail__description">{{ entry.description }}</p>
      <p class="entry-detail__creator">Presentado por {{ entry.creatorName }}</p>
    </div>
  </main>
</template>

<style scoped>
.entry-detail {
  padding: var(--space-5);
  max-width: 560px;
  margin: 0 auto;
}

.entry-detail__status {
  color: var(--color-text-muted);
  text-align: center;
  padding: var(--space-6) 0 var(--space-3);
}

.entry-detail__status--error {
  color: var(--color-danger);
}

.entry-detail__card {
  background: var(--color-surface);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-md);
  overflow: hidden;
  padding-bottom: var(--space-5);
}

.entry-detail__photo {
  width: 100%;
  aspect-ratio: 4 / 3;
  object-fit: cover;
  display: block;
}

.entry-detail__badge {
  font-weight: 700;
  letter-spacing: 0.04em;
  color: var(--color-primary);
  margin: var(--space-4) var(--space-5) 0;
}

.entry-detail__name {
  font-size: 1.4rem;
  margin: var(--space-1) var(--space-5) 0;
}

.entry-detail__description {
  color: var(--color-text-muted);
  margin: var(--space-2) var(--space-5) 0;
}

.entry-detail__creator {
  margin: var(--space-4) var(--space-5) 0;
  font-size: 0.9rem;
  color: var(--color-text-muted);
}
</style>
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd frontend && npx vitest run src/views/EntryDetailView.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add frontend/src/views/EntryDetailView.vue frontend/src/views/EntryDetailView.test.ts
git commit -m "Add EntryDetailView (read-only; voting comes in Fase E)"
```

---

### Task 5: Router — gallery routes, updated redirects, live hand-off from the waiting room

**Files:**
- Modify: `frontend/src/router/index.ts`
- Modify: `frontend/src/router/index.test.ts`
- Modify: `frontend/src/views/WaitingRoomView.vue`
- Modify: `frontend/src/views/WaitingRoomView.test.ts`

**Interfaces:**
- Produces: named routes `gallery` (`/galeria`) and `entry-detail`
  (`/galeria/:id`).
- Changes existing behavior: once `contest.phase !== 'REGISTRATION'`,
  `welcome`/`register` and `has-entry`/`new-entry` now redirect to
  `gallery` (previously `has-entry` or `waiting-room`, per Fase C — the
  waiting room's whole job was "hold until the gallery exists," which is
  no longer true). Direct navigation to `waiting-room` after registration
  has closed also redirects straight to `gallery`. `WaitingRoomView`
  itself gains a watcher: if it's already mounted and the phase changes
  live via SSE, it now navigates to `gallery` instead of just updating its
  text.

- [ ] **Step 1: Write the failing tests — replace `frontend/src/router/index.test.ts`**

```ts
import { describe, it, expect, beforeEach } from 'vitest';
import { setActivePinia, createPinia } from 'pinia';
import { useSessionStore } from '../stores/session';
import { useContestStore } from '../stores/contest';
import { router } from './index';

beforeEach(async () => {
  localStorage.clear();
  setActivePinia(createPinia());
  await router.push('/');
});

describe('router', () => {
  it('allows an anonymous visitor to reach /registro', async () => {
    await router.push('/registro');
    expect(router.currentRoute.value.name).toBe('register');
  });

  it('redirects a registered visitor away from /registro to /pincho during REGISTRATION', async () => {
    useSessionStore().user = { id: 'u1', name: 'Laura' };
    await router.push('/registro');
    expect(router.currentRoute.value.name).toBe('has-entry');
  });

  it('redirects a registered visitor away from / to /pincho during REGISTRATION', async () => {
    await router.push('/registro');
    useSessionStore().user = { id: 'u1', name: 'Laura' };
    await router.push('/');
    expect(router.currentRoute.value.name).toBe('has-entry');
  });

  it('redirects a registered visitor away from / to /galeria once voting has started', async () => {
    await router.push('/registro');
    useSessionStore().user = { id: 'u1', name: 'Laura' };
    useContestStore().phase = 'VOTING';
    await router.push('/');
    expect(router.currentRoute.value.name).toBe('gallery');
  });

  it('blocks an anonymous visitor from reaching /pincho, /pincho/nuevo, /esperando, /galeria and /galeria/:id', async () => {
    for (const path of ['/pincho', '/pincho/nuevo', '/esperando', '/galeria', '/galeria/e1']) {
      await router.push(path);
      expect(router.currentRoute.value.name).toBe('welcome');
    }
  });

  it('redirects away from /pincho/nuevo to /galeria once registration has closed', async () => {
    useSessionStore().user = { id: 'u1', name: 'Laura' };
    useContestStore().phase = 'VOTING';
    await router.push('/pincho/nuevo');
    expect(router.currentRoute.value.name).toBe('gallery');
  });

  it('lets a registered visitor reach /pincho/confirmacion/:number directly', async () => {
    useSessionStore().user = { id: 'u1', name: 'Laura' };
    await router.push('/pincho/confirmacion/7');
    expect(router.currentRoute.value.name).toBe('entry-confirmation');
  });

  it('lets a registered visitor reach /esperando during REGISTRATION', async () => {
    useSessionStore().user = { id: 'u1', name: 'Laura' };
    await router.push('/esperando');
    expect(router.currentRoute.value.name).toBe('waiting-room');
  });

  it('redirects away from /esperando to /galeria once registration has closed', async () => {
    useSessionStore().user = { id: 'u1', name: 'Laura' };
    useContestStore().phase = 'VOTING';
    await router.push('/esperando');
    expect(router.currentRoute.value.name).toBe('gallery');
  });

  it('blocks a registered visitor from /galeria while registration is still open', async () => {
    useSessionStore().user = { id: 'u1', name: 'Laura' };
    await router.push('/galeria');
    expect(router.currentRoute.value.name).toBe('waiting-room');
  });

  it('lets a registered visitor reach /galeria and /galeria/:id once voting has started', async () => {
    useSessionStore().user = { id: 'u1', name: 'Laura' };
    useContestStore().phase = 'VOTING';
    await router.push('/galeria');
    expect(router.currentRoute.value.name).toBe('gallery');
    await router.push('/galeria/e1');
    expect(router.currentRoute.value.name).toBe('entry-detail');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && npx vitest run src/router/index.test.ts`
Expected: FAIL — `gallery`/`entry-detail` routes don't exist yet, and
several redirect targets don't match the still-Fase-C guard logic.

- [ ] **Step 3: Replace `frontend/src/router/index.ts`**

```ts
import { createRouter, createWebHistory } from 'vue-router';
import { useSessionStore } from '../stores/session';
import { useContestStore } from '../stores/contest';

const SESSION_REQUIRED_ROUTES = [
  'has-entry',
  'new-entry',
  'entry-confirmation',
  'waiting-room',
  'gallery',
  'entry-detail',
];
const REGISTRATION_ONLY_ROUTES = ['has-entry', 'new-entry'];
const GALLERY_ROUTES = ['gallery', 'entry-detail'];

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
});
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd frontend && npx vitest run src/router/index.test.ts`
Expected: PASS (11 tests).

- [ ] **Step 5: Write the failing test — modify `frontend/src/views/WaitingRoomView.test.ts`**

The file already imports `vi` (it's used for `vi.mock('../composables/useHeartbeat', ...)`) — no change needed there. Add a `nextTick` import from `'vue'`, a `pushMock` + `vue-router` mock at the top (matching every other view test in this project), a `pushMock.mockClear();` in the existing `beforeEach`, and one new test:

```ts
import { nextTick } from 'vue';
```

```ts
const pushMock = vi.fn();
vi.mock('vue-router', () => ({
  useRouter: () => ({ push: pushMock }),
}));
```

```ts
beforeEach(() => {
  setActivePinia(createPinia());
  pushMock.mockClear();
});
```

```ts
  it('navigates to the gallery once the phase changes while mounted', async () => {
    const contest = useContestStore();
    mount(WaitingRoomView);

    contest.phase = 'VOTING';
    await nextTick();

    expect(pushMock).toHaveBeenCalledWith({ name: 'gallery' });
  });
```

The resulting file should look like:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { nextTick } from 'vue';
import { mount } from '@vue/test-utils';
import { setActivePinia, createPinia } from 'pinia';
import { useContestStore } from '../stores/contest';
import WaitingRoomView from './WaitingRoomView.vue';

const pushMock = vi.fn();
vi.mock('vue-router', () => ({
  useRouter: () => ({ push: pushMock }),
}));

vi.mock('../composables/useHeartbeat', () => ({
  useHeartbeat: vi.fn(),
}));

beforeEach(() => {
  setActivePinia(createPinia());
  pushMock.mockClear();
});

describe('WaitingRoomView', () => {
  it('shows a waiting message while the contest is still in REGISTRATION', () => {
    const wrapper = mount(WaitingRoomView);
    expect(wrapper.text()).toContain('Ya estás dentro');
    expect(wrapper.text()).toContain('Espera a que el anfitrión');
  });

  it('shows a started message once the phase leaves REGISTRATION', () => {
    useContestStore().phase = 'VOTING';
    const wrapper = mount(WaitingRoomView);
    expect(wrapper.text()).toContain('¡El concurso ha empezado!');
  });

  it('navigates to the gallery once the phase changes while mounted', async () => {
    const contest = useContestStore();
    mount(WaitingRoomView);

    contest.phase = 'VOTING';
    await nextTick();

    expect(pushMock).toHaveBeenCalledWith({ name: 'gallery' });
  });
});
```

- [ ] **Step 6: Run test to verify it fails**

Run: `cd frontend && npx vitest run src/views/WaitingRoomView.test.ts`
Expected: FAIL — `pushMock` is never called (no watcher yet).

- [ ] **Step 7: Modify `frontend/src/views/WaitingRoomView.vue`**

```vue
<script setup lang="ts">
import { watch } from 'vue';
import { useRouter } from 'vue-router';
import { useContestStore } from '../stores/contest';
import { useHeartbeat } from '../composables/useHeartbeat';

useHeartbeat();
const router = useRouter();
const contest = useContestStore();

watch(
  () => contest.phase,
  (phase) => {
    if (phase !== 'REGISTRATION') {
      router.push({ name: 'gallery' });
    }
  }
);
</script>
```

(Template and `<style>` unchanged — only the `<script setup>` block
gains the router import, the `router`/`watch` wiring, and the
`useContestStore` import moves above it for readability; leave the
existing template/CSS exactly as they are.)

- [ ] **Step 8: Run test to verify it passes**

Run: `cd frontend && npx vitest run src/views/WaitingRoomView.test.ts`
Expected: PASS (3 tests — the 2 from Fase C plus this one).

- [ ] **Step 9: Run the whole frontend suite**

Run: `cd frontend && npx vitest run`
Expected: every test file passes.

- [ ] **Step 10: Commit**

```bash
git add frontend/src/router/index.ts frontend/src/router/index.test.ts frontend/src/views/WaitingRoomView.vue frontend/src/views/WaitingRoomView.test.ts
git commit -m "Add gallery routes; retarget post-registration redirects to the gallery"
```

---

### Task 6: Verification

**Files:** none — verification only.

- [ ] **Step 1: Run typecheck, lint and tests for the frontend**

Run: `cd frontend && npm run typecheck && npm run lint && npm test`
Expected: all three succeed with zero errors.

- [ ] **Step 2: Re-run the full backend suite**

Run: `cd server && npm test`
Expected: all 44 backend tests pass (43 from before Fase D + the new
`creatorName` test from Task 1).

- [ ] **Step 3: End-to-end check at the HTTP level**

A browser tool may not be available — if so, verify the underlying chain
with `curl` instead of skipping verification:

```bash
# from a fresh dev DB: register a user, create an entry, start the contest,
# then confirm the now-unlocked endpoints return what the gallery/detail
# views expect
curl -s http://localhost:3000/api/entries -H "X-User-Id: <id>"
curl -s http://localhost:3000/api/entries/<entry-id> -H "X-User-Id: <id>"
```

Expected: the list endpoint returns the array of entries; the detail
endpoint's response includes `creatorName`. If a browser tool **is**
available this session, additionally open `/galeria` and `/galeria/:id`
directly and confirm the grid and detail screens render correctly. Either
way, state plainly which of the two you did — never claim the other
happened.

- [ ] **Step 4: Commit only if fixes were needed**

```bash
git add <fixed files>
git commit -m "Fix issues found in final verification"
```

---

### Task 7: Update the README

**Files:**
- Modify: `README.md` (repo root)

- [ ] **Step 1: Update the "Estado actual" note**

```markdown
> **Estado actual:** el backend está completo y probado. El frontend cubre
> el registro de participante y de tapas, y la galería de tapas (grid +
> detalle de solo lectura) una vez arranca la votación. La votación en sí,
> los resultados y el panel de administración por interfaz todavía no
> existen — se prueban directamente contra la API REST.
```

- [ ] **Step 2: Commit**

```bash
git add README.md
git commit -m "Update README: gallery is live"
```

---

## End of Fase D

Guests can now browse every tapa in a photo grid and open any one to read
its story, and the waiting room correctly hands off to the gallery the
moment the host starts the contest — live, no reload. Fase E (sistema de
favoritos) adds the "Me encanta" button to `EntryDetailView`, the golden
border and heart indicator on gallery cards, and the "X/3" favorites
counter.
