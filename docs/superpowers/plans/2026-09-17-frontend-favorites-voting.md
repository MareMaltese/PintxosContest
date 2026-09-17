# Fase E — Sistema de favoritos (frontend) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a logged-in guest mark up to 3 tapas as favorites during the `VOTING` phase, see their progress ("X / Y favoritos"), and add/remove favorites from the tapa detail screen — all against the already-complete, already-tested backend voting API.

**Architecture:** A new Pinia store (`stores/votes.ts`) owns favorite state (which entry IDs are favorited, the adaptive limit) and talks to the existing `/api/votes/*` endpoints. Two small presentational components (`FavoriteButton.vue`, `FavoriteCounter.vue`) consume that store and are wired into `EntryDetailView.vue` (the vote action) and `GalleryView.vue` (the counter, for visibility while browsing). No backend changes, no router changes — gallery/detail routes are already reachable in every non-`REGISTRATION` phase, and phase/ownership gating happens by hiding the vote button rather than adding new guards.

**Tech Stack:** Vue 3 `<script setup>` + TypeScript, Pinia setup stores, Vitest + `@vue/test-utils`, `@lucide/vue` for icons (no emoji as UI control, per project convention).

**Spec:** `docs/superpowers/specs/2026-09-16-pincho-party-design.md` (sections 7 "Reglas de negocio críticas", 8 "API", 15 "Testing"). Scope here is the guest-facing favorites system only (design doc's flow items 8-9). Tiebreak and results screens are a separate phase (Fase G) and are explicitly out of scope for this plan.

## Global Constraints

- Max 3 favorites per user, adapted to `min(3, votable count)` — already enforced server-side by `GET /api/votes/me`'s `limit` field and by `POST /api/votes`'s `FAVORITES_LIMIT_REACHED` error. The frontend must not hardcode `3` anywhere; always use the `limit` the server returns.
- No optimistic-success-without-confirmation: per spec section 11, a vote is not considered saved until the server responds 2xx. On failure, any optimistic UI change must revert and show `err.message` (the server's own human-readable message, already surfaced via `ApiError.message`).
- Buttons that trigger a request must be disabled while that request is in flight, to prevent double-tap duplicates (spec section 11).
- Never use emoji as a UI control — use `@lucide/vue`'s `Heart` icon (already a dependency, already used elsewhere via `import { Camera } from '@lucide/vue'` in `NewEntryView.vue`).
- Favoriting/unfavoriting only makes sense during `VOTING` — the backend already rejects it otherwise (`NOT_VOTING_PHASE`), but the UI should not offer the button outside that phase (avoids a guaranteed-fail tap).
- Self-vote: backend already rejects it when `Contest.allowSelfVote` is `false` (`SELF_VOTE_FORBIDDEN`). The UI should disable (not hide) the button on your own entry in that case, with a short explanatory note, so the guest understands why instead of hitting a surprise error.

---

## Existing contracts this plan relies on (read, do not modify)

- `GET /api/votes/me` (`server/src/routes/votes.routes.ts`) → `{ entryIds: string[], limit: number }`
- `POST /api/votes` with `{ entryId }` → `201 { ok: true }`. Errors (all via `ApiError`, `.message` is already the human-readable string): `409 NOT_VOTING_PHASE`, `400 ENTRY_NOT_FOUND`, `403 SELF_VOTE_FORBIDDEN`, `409 ALREADY_VOTED`, `409 FAVORITES_LIMIT_REACHED`.
- `DELETE /api/votes/:entryId` → `200 { ok: true }`. Errors: `409 NOT_VOTING_PHASE`, `404 VOTE_NOT_FOUND`.
- `frontend/src/services/api.ts`: `api.get/post/delete` return parsed JSON or throw `ApiError` (has `.status`, `.code`, `.message`).
- `frontend/src/stores/contest.ts`: `useContestStore()` exposes `phase: Ref<'REGISTRATION'|'VOTING'|'TIEBREAK'|'RESULTS'>` and `allowSelfVote: Ref<boolean>`.
- `frontend/src/stores/session.ts`: `useSessionStore()` exposes `user: Ref<{ id: string; name: string } | null>`.
- `frontend/src/stores/entries.ts`: `EntryDetail` has `id: string`, `creatorId: string`, plus display fields.

---

### Task 1: Votes store

**Files:**
- Create: `frontend/src/stores/votes.ts`
- Test: `frontend/src/stores/votes.test.ts`

**Interfaces:**
- Consumes: `api.get/post/delete` from `../services/api`, `ApiError`.
- Produces: `useVotesStore()` returning `{ favoriteIds: Ref<Set<string>>, limit: Ref<number>, loaded: Ref<boolean>, error: Ref<string|null>, isFavorite: (entryId: string) => boolean, init: () => Promise<void>, toggle: (entryId: string) => Promise<void> }`. Later tasks (2, 4, 5) depend on exactly these names.

- [ ] **Step 1: Write the failing tests**

```ts
// frontend/src/stores/votes.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { setActivePinia, createPinia } from 'pinia';

vi.mock('../services/api', async () => {
  const actual = await vi.importActual<typeof import('../services/api')>('../services/api');
  return { ...actual, api: { ...actual.api, get: vi.fn(), post: vi.fn(), delete: vi.fn() } };
});

import { api, ApiError } from '../services/api';
import { useVotesStore } from './votes';

beforeEach(() => {
  setActivePinia(createPinia());
  vi.clearAllMocks();
});

describe('useVotesStore', () => {
  it('starts unloaded with no favorites', () => {
    const store = useVotesStore();
    expect(store.loaded).toBe(false);
    expect(store.favoriteIds.size).toBe(0);
    expect(store.limit).toBe(0);
  });

  it('init loads favorites and limit from the server', async () => {
    vi.mocked(api.get).mockResolvedValue({ entryIds: ['e1', 'e2'], limit: 3 });
    const store = useVotesStore();

    await store.init();

    expect(api.get).toHaveBeenCalledWith('/api/votes/me');
    expect(store.loaded).toBe(true);
    expect(store.limit).toBe(3);
    expect(store.isFavorite('e1')).toBe(true);
    expect(store.isFavorite('e3')).toBe(false);
  });

  it('init only fetches once even if called twice', async () => {
    vi.mocked(api.get).mockResolvedValue({ entryIds: [], limit: 3 });
    const store = useVotesStore();

    await store.init();
    await store.init();

    expect(api.get).toHaveBeenCalledTimes(1);
  });

  it('toggle adds a favorite optimistically and confirms via POST', async () => {
    vi.mocked(api.get).mockResolvedValue({ entryIds: [], limit: 3 });
    vi.mocked(api.post).mockResolvedValue({ ok: true });
    const store = useVotesStore();
    await store.init();

    await store.toggle('e1');

    expect(api.post).toHaveBeenCalledWith('/api/votes', { entryId: 'e1' });
    expect(store.isFavorite('e1')).toBe(true);
    expect(store.error).toBeNull();
  });

  it('toggle removes an existing favorite via DELETE', async () => {
    vi.mocked(api.get).mockResolvedValue({ entryIds: ['e1'], limit: 3 });
    vi.mocked(api.delete).mockResolvedValue({ ok: true });
    const store = useVotesStore();
    await store.init();

    await store.toggle('e1');

    expect(api.delete).toHaveBeenCalledWith('/api/votes/e1');
    expect(store.isFavorite('e1')).toBe(false);
  });

  it('toggle reverts the optimistic add and surfaces the error on failure', async () => {
    vi.mocked(api.get).mockResolvedValue({ entryIds: [], limit: 3 });
    vi.mocked(api.post).mockRejectedValue(
      new ApiError(409, 'FAVORITES_LIMIT_REACHED', 'Ya has elegido tus 3 pinchos favoritos.')
    );
    const store = useVotesStore();
    await store.init();

    await store.toggle('e1');

    expect(store.isFavorite('e1')).toBe(false);
    expect(store.error).toBe('Ya has elegido tus 3 pinchos favoritos.');
  });

  it('toggle reverts the optimistic remove and surfaces the error on failure', async () => {
    vi.mocked(api.get).mockResolvedValue({ entryIds: ['e1'], limit: 3 });
    vi.mocked(api.delete).mockRejectedValue(new ApiError(409, 'NOT_VOTING_PHASE', 'La votación no está abierta ahora mismo.'));
    const store = useVotesStore();
    await store.init();

    await store.toggle('e1');

    expect(store.isFavorite('e1')).toBe(true);
    expect(store.error).toBe('La votación no está abierta ahora mismo.');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/stores/votes.test.ts`
Expected: FAIL — `Cannot find module './votes'` (file doesn't exist yet).

- [ ] **Step 3: Write the implementation**

```ts
// frontend/src/stores/votes.ts
import { ref } from 'vue';
import { defineStore } from 'pinia';
import { api, ApiError } from '../services/api';

interface MyVotesResponse {
  entryIds: string[];
  limit: number;
}

export const useVotesStore = defineStore('votes', () => {
  const favoriteIds = ref<Set<string>>(new Set());
  const limit = ref(0);
  const loaded = ref(false);
  const error = ref<string | null>(null);

  function isFavorite(entryId: string): boolean {
    return favoriteIds.value.has(entryId);
  }

  async function init(): Promise<void> {
    if (loaded.value) return;
    const data = await api.get<MyVotesResponse>('/api/votes/me');
    favoriteIds.value = new Set(data.entryIds);
    limit.value = data.limit;
    loaded.value = true;
  }

  async function toggle(entryId: string): Promise<void> {
    error.value = null;
    const wasFavorite = isFavorite(entryId);
    const next = new Set(favoriteIds.value);
    if (wasFavorite) {
      next.delete(entryId);
    } else {
      next.add(entryId);
    }
    favoriteIds.value = next;

    try {
      if (wasFavorite) {
        await api.delete(`/api/votes/${entryId}`);
      } else {
        await api.post('/api/votes', { entryId });
      }
    } catch (err) {
      favoriteIds.value = favoriteIds.value.has(entryId)
        ? new Set([...favoriteIds.value].filter((id) => id !== entryId))
        : new Set([...favoriteIds.value, entryId]);
      error.value = err instanceof ApiError ? err.message : 'No hemos podido guardar tu voto.';
    }
  }

  return { favoriteIds, limit, loaded, error, isFavorite, init, toggle };
});
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/stores/votes.test.ts`
Expected: PASS (7 tests).

- [ ] **Step 5: Commit**

```bash
git add src/stores/votes.ts src/stores/votes.test.ts
git commit -m "Add votes store: favorites state and optimistic toggle"
```

---

### Task 2: FavoriteButton component

**Files:**
- Create: `frontend/src/components/entries/FavoriteButton.vue`
- Test: `frontend/src/components/entries/FavoriteButton.test.ts`

**Interfaces:**
- Consumes: `useVotesStore()` from Task 1 (`isFavorite`, `toggle`, `error`).
- Props: `entryId: string` (required), `disabled?: boolean` (default `false` — parent sets this `true` for the self-vote-blocked case), `disabledReason?: string` (shown instead of the button when `disabled` is `true`).
- Produces: nothing consumed by later tasks by name — Task 4 mounts it directly with these props.

- [ ] **Step 1: Write the failing tests**

```ts
// frontend/src/components/entries/FavoriteButton.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import { setActivePinia, createPinia } from 'pinia';
import FavoriteButton from './FavoriteButton.vue';

vi.mock('../../services/api', async () => {
  const actual = await vi.importActual<typeof import('../../services/api')>('../../services/api');
  return { ...actual, api: { ...actual.api, get: vi.fn(), post: vi.fn(), delete: vi.fn() } };
});

import { api } from '../../services/api';

beforeEach(() => {
  setActivePinia(createPinia());
  vi.clearAllMocks();
  vi.mocked(api.get).mockResolvedValue({ entryIds: [], limit: 3 });
});

describe('FavoriteButton', () => {
  it('shows "Me encanta!" when not favorited', () => {
    const wrapper = mount(FavoriteButton, { props: { entryId: 'e1' } });
    expect(wrapper.text()).toContain('Me encanta!');
  });

  it('calls the API and flips to "Ya no tanto!" on click', async () => {
    vi.mocked(api.post).mockResolvedValue({ ok: true });
    const wrapper = mount(FavoriteButton, { props: { entryId: 'e1' } });

    await wrapper.find('button').trigger('click');
    await flushPromises();

    expect(api.post).toHaveBeenCalledWith('/api/votes', { entryId: 'e1' });
    expect(wrapper.text()).toContain('Ya no tanto!');
  });

  it('disables the button while the request is in flight', async () => {
    vi.mocked(api.post).mockReturnValue(new Promise(() => {}));
    const wrapper = mount(FavoriteButton, { props: { entryId: 'e1' } });

    await wrapper.find('button').trigger('click');

    expect((wrapper.find('button').element as HTMLButtonElement).disabled).toBe(true);
  });

  it('shows the disabled reason instead of a clickable button when disabled', () => {
    const wrapper = mount(FavoriteButton, {
      props: { entryId: 'e1', disabled: true, disabledReason: 'No puedes votar tu propio pincho.' },
    });

    expect(wrapper.find('button').exists()).toBe(false);
    expect(wrapper.text()).toContain('No puedes votar tu propio pincho.');
  });

  it('shows the store error message after a failed toggle', async () => {
    vi.mocked(api.post).mockRejectedValue(new Error('boom'));
    const wrapper = mount(FavoriteButton, { props: { entryId: 'e1' } });

    await wrapper.find('button').trigger('click');
    await flushPromises();

    expect(wrapper.text()).toContain('No hemos podido guardar tu voto.');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/components/entries/FavoriteButton.test.ts`
Expected: FAIL — component file doesn't exist.

- [ ] **Step 3: Write the implementation**

```vue
<!-- frontend/src/components/entries/FavoriteButton.vue -->
<script setup lang="ts">
import { ref, computed } from 'vue';
import { Heart } from '@lucide/vue';
import { useVotesStore } from '../../stores/votes';

const props = withDefaults(
  defineProps<{ entryId: string; disabled?: boolean; disabledReason?: string }>(),
  { disabled: false, disabledReason: '' }
);

const votes = useVotesStore();
const isPending = ref(false);

const isFavorite = computed(() => votes.isFavorite(props.entryId));

async function onClick(): Promise<void> {
  isPending.value = true;
  try {
    await votes.toggle(props.entryId);
  } finally {
    isPending.value = false;
  }
}
</script>

<template>
  <div class="favorite-button">
    <p
      v-if="disabled"
      class="favorite-button__reason"
    >
      {{ disabledReason }}
    </p>
    <button
      v-else
      class="button"
      :class="isFavorite ? 'button--primary' : 'button--secondary'"
      type="button"
      :disabled="isPending"
      @click="onClick"
    >
      <Heart
        :size="20"
        :fill="isFavorite ? 'currentColor' : 'none'"
        aria-hidden="true"
      />
      {{ isFavorite ? '¡Ya no tanto!' : '¡Me encanta!' }}
    </button>
    <p
      v-if="votes.error"
      class="favorite-button__error"
    >
      {{ votes.error }}
    </p>
  </div>
</template>

<style scoped>
.favorite-button__reason {
  color: var(--color-text-muted);
  font-size: 0.9rem;
}

.favorite-button__error {
  color: var(--color-danger);
  font-size: 0.9rem;
  margin-top: var(--space-2);
}
</style>
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/components/entries/FavoriteButton.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add src/components/entries/FavoriteButton.vue src/components/entries/FavoriteButton.test.ts
git commit -m "Add FavoriteButton component"
```

---

### Task 3: FavoriteCounter component

**Files:**
- Create: `frontend/src/components/entries/FavoriteCounter.vue`
- Test: `frontend/src/components/entries/FavoriteCounter.test.ts`

**Interfaces:**
- Consumes: `useVotesStore()` from Task 1 (`favoriteIds`, `limit`).
- Produces: nothing consumed by name — Tasks 4 and 5 mount `<FavoriteCounter />` with no props.

- [ ] **Step 1: Write the failing tests**

```ts
// frontend/src/components/entries/FavoriteCounter.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import { mount } from '@vue/test-utils';
import { setActivePinia, createPinia } from 'pinia';
import FavoriteCounter from './FavoriteCounter.vue';
import { useVotesStore } from '../../stores/votes';

beforeEach(() => {
  setActivePinia(createPinia());
});

describe('FavoriteCounter', () => {
  it('shows 0 out of the limit before any favorite is picked', () => {
    const votes = useVotesStore();
    votes.limit = 3;
    const wrapper = mount(FavoriteCounter);
    expect(wrapper.text()).toContain('0 / 3');
  });

  it('reflects the current favorite count', () => {
    const votes = useVotesStore();
    votes.limit = 3;
    votes.favoriteIds = new Set(['e1', 'e2']);
    const wrapper = mount(FavoriteCounter);
    expect(wrapper.text()).toContain('2 / 3');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/components/entries/FavoriteCounter.test.ts`
Expected: FAIL — component file doesn't exist.

- [ ] **Step 3: Write the implementation**

```vue
<!-- frontend/src/components/entries/FavoriteCounter.vue -->
<script setup lang="ts">
import { computed } from 'vue';
import { Heart } from '@lucide/vue';
import { useVotesStore } from '../../stores/votes';

const votes = useVotesStore();
const count = computed(() => votes.favoriteIds.size);
</script>

<template>
  <p class="favorite-counter">
    <Heart
      :size="16"
      aria-hidden="true"
    />
    {{ count }} / {{ votes.limit }} favoritos
  </p>
</template>

<style scoped>
.favorite-counter {
  display: inline-flex;
  align-items: center;
  gap: var(--space-2);
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: 999px;
  padding: var(--space-1) var(--space-3);
  font-size: 0.9rem;
  font-weight: 600;
  color: var(--color-primary);
  margin: 0;
}
</style>
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/components/entries/FavoriteCounter.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add src/components/entries/FavoriteCounter.vue src/components/entries/FavoriteCounter.test.ts
git commit -m "Add FavoriteCounter component"
```

---

### Task 4: Wire favorites into EntryDetailView

**Files:**
- Modify: `frontend/src/views/EntryDetailView.vue`
- Modify test: `frontend/src/views/EntryDetailView.test.ts`

**Interfaces:**
- Consumes: `useVotesStore()` (Task 1), `<FavoriteButton>` (Task 2), `<FavoriteCounter>` (Task 3), `useContestStore()` (`phase`, `allowSelfVote` — already exist), `useSessionStore()` (`user` — already exists).
- Produces: nothing new consumed elsewhere.

**Behavior added:** on mount, call `votes.init()` alongside the existing entry load. When `contest.phase === 'VOTING'`, render `<FavoriteCounter />` and `<FavoriteButton>`; pass `disabled` + `disabledReason` when this is the viewer's own entry and `!contest.allowSelfVote`. Outside `VOTING`, render neither (no dead-end buttons before/after the voting window). Also add a close button (`X` icon, top of the card) that returns to the gallery — the large-image view currently has no way back except the browser's back button.

- [ ] **Step 1: Write the failing tests**

Append to the existing `frontend/src/views/EntryDetailView.test.ts` (it already mocks `api.get`; add `api.post`/`api.delete` to the mock factory and set up the `contest`/`session` stores per test):

```ts
// Replace the existing vi.mock('../services/api', ...) block with:
vi.mock('../services/api', async () => {
  const actual = await vi.importActual<typeof import('../services/api')>('../services/api');
  return { ...actual, api: { ...actual.api, get: vi.fn(), post: vi.fn(), delete: vi.fn() } };
});

// Replace the existing vi.mock('vue-router', ...) block with one that also
// provides a spy-able push (existing tests only destructure useRoute, so this
// is additive). vi.mock factories are hoisted above imports, so the shared
// spy must be created via vi.hoisted:
const { push } = vi.hoisted(() => ({ push: vi.fn() }));
vi.mock('vue-router', () => ({
  useRoute: () => ({ params: { id: 'e1' } }),
  useRouter: () => ({ push }),
}));

// Add these imports alongside the existing ones:
import { useContestStore } from '../stores/contest';
import { useSessionStore } from '../stores/session';

// Add this helper near the top of the describe block:
function mockEntry(overrides: Partial<{ creatorId: string }> = {}) {
  return {
    id: 'e1',
    number: 7,
    creatorId: 'u1',
    creatorName: 'Laura',
    name: 'Croqueta',
    description: 'Mini brioche de carrillera.',
    imagePath: 'a.webp',
    createdAt: 'x',
    ...overrides,
  };
}

// Add these test cases inside describe('EntryDetailView', ...):
it('shows the favorite button and counter during VOTING', async () => {
  vi.mocked(api.get).mockImplementation((path: string) =>
    path === '/api/votes/me'
      ? Promise.resolve({ entryIds: [], limit: 3 })
      : Promise.resolve(mockEntry())
  );
  useContestStore().phase = 'VOTING';
  useSessionStore().user = { id: 'me', name: 'Yo' };
  const wrapper = mount(EntryDetailView);
  await flushPromises();

  expect(wrapper.text()).toContain('0 / 3 favoritos');
  expect(wrapper.text()).toContain('Me encanta!');
});

it('hides voting UI outside the VOTING phase', async () => {
  vi.mocked(api.get).mockImplementation((path: string) =>
    path === '/api/votes/me'
      ? Promise.resolve({ entryIds: [], limit: 3 })
      : Promise.resolve(mockEntry())
  );
  useContestStore().phase = 'RESULTS';
  useSessionStore().user = { id: 'me', name: 'Yo' };
  const wrapper = mount(EntryDetailView);
  await flushPromises();

  expect(wrapper.text()).not.toContain('favoritos');
  expect(wrapper.find('button.button--secondary').exists()).toBe(false);
});

it('disables voting on your own entry when self-vote is not allowed', async () => {
  vi.mocked(api.get).mockImplementation((path: string) =>
    path === '/api/votes/me'
      ? Promise.resolve({ entryIds: [], limit: 3 })
      : Promise.resolve(mockEntry({ creatorId: 'me' }))
  );
  const contest = useContestStore();
  contest.phase = 'VOTING';
  contest.allowSelfVote = false;
  useSessionStore().user = { id: 'me', name: 'Yo' };
  const wrapper = mount(EntryDetailView);
  await flushPromises();

  expect(wrapper.text()).toContain('No puedes votar tu propio pincho.');
  expect(wrapper.find('button.button--secondary').exists()).toBe(false);
});

it('closing the detail view navigates back to the gallery', async () => {
  vi.mocked(api.get).mockImplementation((path: string) =>
    path === '/api/votes/me'
      ? Promise.resolve({ entryIds: [], limit: 3 })
      : Promise.resolve(mockEntry())
  );
  const wrapper = mount(EntryDetailView);
  await flushPromises();

  await wrapper.find('.entry-detail__close').trigger('click');

  expect(push).toHaveBeenCalledWith({ name: 'gallery' });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/views/EntryDetailView.test.ts`
Expected: FAIL — new assertions (`0 / 3 favoritos`, `Me encanta!`, self-vote message, close button) not found; `api.get` mock signature also needs the multi-path `mockImplementation`.

- [ ] **Step 3: Write the implementation**

```vue
<!-- frontend/src/views/EntryDetailView.vue -->
<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { X } from '@lucide/vue';
import { ApiError } from '../services/api';
import { useEntriesStore, type EntryDetail } from '../stores/entries';
import { useVotesStore } from '../stores/votes';
import { useContestStore } from '../stores/contest';
import { useSessionStore } from '../stores/session';
import FavoriteButton from '../components/entries/FavoriteButton.vue';
import FavoriteCounter from '../components/entries/FavoriteCounter.vue';

const route = useRoute();
const router = useRouter();
const entries = useEntriesStore();
const votes = useVotesStore();
const contest = useContestStore();
const session = useSessionStore();

const entry = ref<EntryDetail | null>(null);
const isLoading = ref(true);
const loadError = ref<string | null>(null);

const canVote = computed(() => contest.phase === 'VOTING');
const isOwnEntry = computed(() => entry.value !== null && entry.value.creatorId === session.user?.id);
const selfVoteBlocked = computed(() => isOwnEntry.value && !contest.allowSelfVote);

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

function close(): void {
  router.push({ name: 'gallery' });
}

onMounted(() => {
  load();
  votes.init();
});
</script>

<template>
  <main class="entry-detail">
    <button
      class="entry-detail__close"
      type="button"
      aria-label="Cerrar"
      @click="close"
    >
      <X
        :size="24"
        aria-hidden="true"
      />
    </button>

    <p
      v-if="isLoading"
      class="entry-detail__status"
    >
      Cargando…
    </p>
    <template v-else-if="loadError">
      <p class="entry-detail__status entry-detail__status--error">
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
    <div
      v-else-if="entry"
      class="entry-detail__card"
    >
      <img
        :src="`/uploads/${entry.imagePath}`"
        :alt="`Tapa número ${entry.number}`"
        class="entry-detail__photo"
      >
      <p class="entry-detail__badge">
        #{{ String(entry.number).padStart(2, '0') }}
      </p>
      <h1
        v-if="entry.name"
        class="entry-detail__name"
      >
        {{ entry.name }}
      </h1>
      <p
        v-if="entry.description"
        class="entry-detail__description"
      >
        {{ entry.description }}
      </p>
      <p class="entry-detail__creator">
        Presentado por {{ entry.creatorName }}
      </p>

      <div
        v-if="canVote"
        class="entry-detail__voting"
      >
        <FavoriteCounter />
        <FavoriteButton
          :entry-id="entry.id"
          :disabled="selfVoteBlocked"
          disabled-reason="No puedes votar tu propio pincho."
        />
      </div>
    </div>
  </main>
</template>

<style scoped>
.entry-detail {
  padding: var(--space-5);
  max-width: 560px;
  margin: 0 auto;
  position: relative;
}

.entry-detail__close {
  position: absolute;
  top: var(--space-5);
  right: var(--space-5);
  z-index: 1;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 40px;
  height: 40px;
  border-radius: 999px;
  border: none;
  background: rgba(31, 27, 22, 0.55);
  color: #fff;
  cursor: pointer;
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

.entry-detail__voting {
  margin: var(--space-4) var(--space-5) 0;
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: var(--space-3);
}
</style>
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/views/EntryDetailView.test.ts`
Expected: PASS (all existing + 3 new tests).

- [ ] **Step 5: Commit**

```bash
git add src/views/EntryDetailView.vue src/views/EntryDetailView.test.ts
git commit -m "Wire favorites into EntryDetailView"
```

---

### Task 5: Show the favorite counter in the gallery header

**Files:**
- Modify: `frontend/src/views/GalleryView.vue`
- Modify test: `frontend/src/views/GalleryView.test.ts`

**Interfaces:**
- Consumes: `useVotesStore()` (Task 1), `<FavoriteCounter>` (Task 3), `useContestStore()` (already exists).

**Behavior added:** on mount, call `votes.init()` alongside the existing `entries.fetchList()`. Render `<FavoriteCounter />` next to the title when `contest.phase === 'VOTING'`.

- [ ] **Step 1: Write the failing test**

Read `frontend/src/views/GalleryView.test.ts` first to match its existing mock setup for `api`/stores, then add:

```ts
// Add to the api mock factory: post: vi.fn(), delete: vi.fn() (alongside the existing get: vi.fn())
// Add this import: import { useContestStore } from '../stores/contest';

it('shows the favorite counter during VOTING', async () => {
  vi.mocked(api.get).mockImplementation((path: string) =>
    path === '/api/votes/me' ? Promise.resolve({ entryIds: [], limit: 3 }) : Promise.resolve([])
  );
  useContestStore().phase = 'VOTING';
  const wrapper = mount(GalleryView);
  await flushPromises();

  expect(wrapper.text()).toContain('0 / 3 favoritos');
});

it('hides the favorite counter outside VOTING', async () => {
  vi.mocked(api.get).mockImplementation((path: string) =>
    path === '/api/votes/me' ? Promise.resolve({ entryIds: [], limit: 3 }) : Promise.resolve([])
  );
  useContestStore().phase = 'TIEBREAK';
  const wrapper = mount(GalleryView);
  await flushPromises();

  expect(wrapper.text()).not.toContain('favoritos');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/views/GalleryView.test.ts`
Expected: FAIL — counter text not present yet.

- [ ] **Step 3: Write the implementation**

```vue
<!-- frontend/src/views/GalleryView.vue -->
<script setup lang="ts">
import { onMounted } from 'vue';
import { useRouter } from 'vue-router';
import { useEntriesStore } from '../stores/entries';
import { useVotesStore } from '../stores/votes';
import { useContestStore } from '../stores/contest';
import { useHeartbeat } from '../composables/useHeartbeat';
import FavoriteCounter from '../components/entries/FavoriteCounter.vue';

useHeartbeat();
const router = useRouter();
const entries = useEntriesStore();
const votes = useVotesStore();
const contest = useContestStore();

onMounted(() => {
  entries.fetchList().catch(() => {
    // el error queda reflejado en entries.listError
  });
  votes.init();
});

function openEntry(id: string): void {
  router.push({ name: 'entry-detail', params: { id } });
}
</script>

<template>
  <main class="gallery">
    <div class="gallery__header">
      <h1 class="gallery__title">
        Galería de tapas
      </h1>
      <FavoriteCounter v-if="contest.phase === 'VOTING'" />
    </div>

    <p
      v-if="entries.isLoadingList"
      class="gallery__status"
    >
      Cargando…
    </p>
    <template v-else-if="entries.listError">
      <p class="gallery__status gallery__status--error">
        {{ entries.listError }}
      </p>
      <button
        class="button button--secondary"
        type="button"
        @click="entries.fetchList()"
      >
        Reintentar
      </button>
    </template>
    <p
      v-else-if="entries.list.length === 0"
      class="gallery__status"
    >
      Todavía no hay tapas registradas.
    </p>

    <div
      v-else
      class="gallery__grid"
    >
      <button
        v-for="entry in entries.list"
        :key="entry.id"
        class="gallery__card"
        type="button"
        @click="openEntry(entry.id)"
      >
        <img
          :src="`/uploads/${entry.imagePath}`"
          :alt="`Tapa número ${entry.number}`"
          class="gallery__photo"
        >
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

.gallery__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-3);
  margin: 0 0 var(--space-5);
}

.gallery__title {
  font-size: 1.5rem;
  margin: 0;
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

Run: `npx vitest run src/views/GalleryView.test.ts`
Expected: PASS (all existing + 2 new tests).

- [ ] **Step 5: Commit**

```bash
git add src/views/GalleryView.vue src/views/GalleryView.test.ts
git commit -m "Show favorite counter in the gallery header during VOTING"
```

---

### Task 6: Final verification and README update

**Files:**
- Modify: `README.md` (repo root)

- [ ] **Step 1: Run the full frontend suite**

Run: `cd frontend && npx vitest run`
Expected: PASS, all tests including the new ones from Tasks 1-5.

- [ ] **Step 2: Run lint and typecheck**

Run: `cd frontend && npm run lint && npm run typecheck`
Expected: both clean. If `eslint` reports attribute-wrapping/self-closing warnings on the new files (this happened for the admin panel's plan-provided snippets), run `npx eslint . --fix` and re-run both the lint command and the full test suite to confirm nothing broke.

- [ ] **Step 3: Run the backend suite (unaffected, but confirm nothing regressed)**

Run: `cd server && npm test`
Expected: PASS (still 45 tests — this plan touches no backend code).

- [ ] **Step 4: Manual smoke check against a running backend**

With the backend running and the contest in `VOTING` phase (`POST /api/admin/contest/start` then check `GET /api/contest`), open a tapa detail page as a logged-in guest and confirm: the counter shows `0 / <limit>`, tapping "¡Me encanta!" flips it to "¡Ya no tanto!" and the counter increments, tapping again removes it, the close (X) button returns to the gallery, and attempting a 4th favorite (or your own entry with self-vote disabled) shows the server's own error message rather than crashing.

- [ ] **Step 5: Update README**

Edit the "Estado actual" block in `README.md` to mention the favorites system is now live in the frontend, e.g.:

```markdown
> **Estado actual:** el backend está completo y probado. El frontend cubre
> el registro de participante y de tapas, la galería de tapas con sistema de
> favoritos (marcar/desmarcar hasta 3 pinchos durante la votación), la
> pantalla de detalle de tapa, y el panel de administración completo (login
> por PIN, dashboard en vivo, gestión de participantes y tapas, control de
> fases). El desempate y la pantalla de resultados todavía no existen en el
> frontend — se prueban directamente contra la API REST.
```

- [ ] **Step 6: Commit**

```bash
git add README.md
git commit -m "Update README: favorites voting is live"
```

---

## After all tasks

Run superpowers:finishing-a-development-branch to verify the full test suite one more time, present the integration menu, and clean up the worktree/branch per the user's choice.
