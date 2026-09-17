# Frontend — Registro y Fotografía de Tapas (Fase C) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** After registering their name (Fase B), a guest can say whether
they brought a tapa, photograph it with their phone's camera, see a
confirmation with their assigned number, optionally register more, and land
on a waiting screen that reacts live (via SSE) to the contest phase —
matching spec screens 3–6. Also adds an optional, host-provided cover photo
to the welcome screen.

**Architecture:** A `contest` Pinia store (fed by a new `services/sse.ts`
`EventSource` wrapper) becomes the single source of truth for the contest
phase, read by the router guard and the waiting room. A `useHeartbeat`
composable pings the backend every 20s while a session exists. Photo
capture uses the native `<input type="file" accept="image/*"
capture="environment">`, compressed client-side (`services/image.ts`, pure
resize-math tested, canvas encoding as a thin untested wrapper) before
upload through a new `api.postForm()` (the existing `api.ts` gains FormData
support). A small `entries` store hands the just-created entry's photo from
the registration form to the confirmation screen, since the backend
deliberately keeps entry details unreadable during `REGISTRATION` (gallery
reveal is a deliberate surprise, per the spec) — no re-fetch is possible
there.

**Tech Stack:** Same as Fase B (Vue 3.5, Vite 5, Pinia 2, Vue Router 4,
`@lucide/vue`, Vitest + `@vue/test-utils` + jsdom). No new npm dependencies
— `EventSource`, `FormData`, `File`, and `createImageBitmap` are native
browser APIs.

**Spec:** `docs/superpowers/specs/2026-09-16-pincho-party-design.md`

## Global Constraints

- Same relative-path/no-hardcoded-`localhost` rule as Fase B — `sse.ts`
  connects to `/api/contest/stream`, proxied by Vite in dev.
- `GET /api/entries/:id` is phase-gated (`GALLERY_LOCKED` while
  `REGISTRATION`) by backend design (Fase A). The confirmation screen must
  never rely on fetching the entry it just created — it gets that data from
  the `POST /api/entries` response, handed off via the `entries` store.
- Every network action keeps Fase B's rule: explicit loading state, a
  friendly retryable error, button disabled while in flight.
- No emoji as a UI control icon; `@lucide/vue` only. The `Camera` icon is
  confirmed available in the installed `@lucide/vue@1.47.0`.
- The router guard is the single place that decides where a session lands;
  individual views never redirect based on phase themselves.
- This phase does not build the gallery (`/galeria` — Fase D). The waiting
  room reacts live to the phase changing but does not yet navigate anywhere
  when it does; wiring that handoff is Fase D's first task, once the
  gallery route exists.

---

### Task 1: Cover image for the welcome screen

**Files:**
- Create: `frontend/src/assets/images/README.md`
- Modify: `frontend/src/views/WelcomeView.vue`
- Modify: `frontend/src/views/WelcomeView.test.ts`

**Interfaces:**
- Produces: a `frontend/src/assets/images/` folder (tracked via the README,
  since git doesn't track empty directories) where the host can drop
  `cover.jpg` / `cover.jpeg` / `cover.png` / `cover.webp`; `WelcomeView`
  detects it at build time via `import.meta.glob` and renders it, or
  renders nothing extra if absent.

- [ ] **Step 1: Create `frontend/src/assets/images/README.md`**

```markdown
# Imagen de portada

Coloca aquí un archivo llamado `cover.jpg`, `cover.jpeg`, `cover.png` o
`cover.webp` para que aparezca como foto de portada en la pantalla de
bienvenida. Si no hay ningún archivo con ese nombre, la pantalla se
muestra sin foto — no rompe nada.

Recomendado: una foto apaisada (horizontal), de al menos 800px de ancho.
Si hay más de un archivo que coincide, se usa uno cualquiera de ellos —
deja solo uno.
```

- [ ] **Step 2: Write the failing test — add to `frontend/src/views/WelcomeView.test.ts`**

Add this test inside the existing `describe('WelcomeView', ...)` block:

```ts
  it('does not render a cover image when none has been provided', () => {
    const wrapper = mount(WelcomeView);
    expect(wrapper.find('.welcome__cover').exists()).toBe(false);
  });
```

- [ ] **Step 2b: Run the full test file to confirm the new test passes trivially (no cover asset exists yet)**

Run: `cd frontend && npx vitest run src/views/WelcomeView.test.ts`
Expected: PASS (4 tests) — this test passes even before touching
`WelcomeView.vue`, since no `.welcome__cover` element exists yet either
way. That's fine: its job is to lock in the fallback behavior before the
cover-image code is added, so a future regression (e.g. always rendering
an `<img>` with a broken `src`) gets caught.

- [ ] **Step 3: Modify `frontend/src/views/WelcomeView.vue`**

Add to the `<script setup>` block, after the existing `const session = ...`
line:

```ts
const coverImages = import.meta.glob('../assets/images/cover.{jpg,jpeg,png,webp}', {
  eager: true,
  import: 'default',
}) as Record<string, string>;
const coverImageUrl = Object.values(coverImages)[0] ?? null;
```

In the `<template>`, inside the `v-if="!session.user"` branch, add the
image as the first element (before the `<h1>`):

```html
        <img v-if="coverImageUrl" :src="coverImageUrl" alt="" class="welcome__cover">
```

(`alt=""` is deliberate: this is a decorative image, not content — screen
readers should skip it, per WCAG guidance for decorative images.)

Add to the `<style scoped>` block:

```css
.welcome__cover {
  width: 100%;
  aspect-ratio: 16 / 9;
  object-fit: cover;
  border-radius: var(--radius-md);
  margin-bottom: var(--space-5);
}
```

- [ ] **Step 4: Run the test file again to confirm it still passes**

Run: `cd frontend && npx vitest run src/views/WelcomeView.test.ts`
Expected: PASS (4 tests) — same result, now proven against the real
cover-image code path instead of trivially.

- [ ] **Step 5: Manually verify the fallback with a real image**

This step is a manual sanity check, not part of the automated suite —
temporarily drop any `.jpg` into `frontend/src/assets/images/` named
`cover.jpg`, run `cd frontend && npm run dev`, confirm the welcome screen
shows it above the title, then delete the file again (don't commit a real
photo as part of this plan — the folder ships empty, with only the
README).

- [ ] **Step 6: Commit**

```bash
git add frontend/src/assets/ frontend/src/views/WelcomeView.vue frontend/src/views/WelcomeView.test.ts
git commit -m "Add optional host-provided cover image to the welcome screen"
```

---

### Task 2: `contest` store + `sse` service

**Files:**
- Create: `frontend/src/services/sse.ts`
- Test: `frontend/src/services/sse.test.ts`
- Create: `frontend/src/stores/contest.ts`
- Test: `frontend/src/stores/contest.test.ts`

**Interfaces:**
- Produces: `ContestStreamEvent { type: string; data: Record<string, unknown> }`,
  `connectContestStream(onEvent: (event: ContestStreamEvent) => void): EventSource`
  (listens for `phase-changed`, `tiebreak-round-changed`, `results-revealed`;
  silently ignores events with non-JSON payloads).
- Produces: `ContestPhase = 'REGISTRATION' | 'VOTING' | 'TIEBREAK' | 'RESULTS'`,
  `useContestStore()` exposing `phase: Ref<ContestPhase>` (default
  `'REGISTRATION'`), `allowSelfVote: Ref<boolean>`, `loaded: Ref<boolean>`,
  `init(): Promise<void>` (fetches `GET /api/contest`, then connects the SSE
  stream and updates `phase` live on `phase-changed`).

- [ ] **Step 1: Write the failing test `frontend/src/services/sse.test.ts`**

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { connectContestStream } from './sse';

class FakeEventSource {
  listeners: Record<string, Array<(e: { data: string }) => void>> = {};
  constructor(public url: string) {}
  addEventListener(type: string, cb: (e: { data: string }) => void): void {
    (this.listeners[type] ??= []).push(cb);
  }
  emit(type: string, data: unknown): void {
    for (const cb of this.listeners[type] ?? []) cb({ data: JSON.stringify(data) });
  }
}

beforeEach(() => {
  vi.stubGlobal('EventSource', FakeEventSource);
});

describe('connectContestStream', () => {
  it('connects to the contest SSE endpoint', () => {
    const source = connectContestStream(() => {}) as unknown as FakeEventSource;
    expect(source.url).toBe('/api/contest/stream');
  });

  it('forwards phase-changed events to the callback', () => {
    const onEvent = vi.fn();
    const source = connectContestStream(onEvent) as unknown as FakeEventSource;
    source.emit('phase-changed', { phase: 'VOTING' });
    expect(onEvent).toHaveBeenCalledWith({ type: 'phase-changed', data: { phase: 'VOTING' } });
  });

  it('forwards results-revealed and tiebreak-round-changed events too', () => {
    const onEvent = vi.fn();
    const source = connectContestStream(onEvent) as unknown as FakeEventSource;
    source.emit('results-revealed', { revealedAt: '2026-09-17T10:00:00.000Z' });
    source.emit('tiebreak-round-changed', { phase: 'TIEBREAK' });
    expect(onEvent).toHaveBeenCalledTimes(2);
  });

  it('ignores events with invalid JSON payloads', () => {
    const onEvent = vi.fn();
    const source = connectContestStream(onEvent) as unknown as FakeEventSource;
    source.listeners['phase-changed'][0]({ data: 'not json' });
    expect(onEvent).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && npx vitest run src/services/sse.test.ts`
Expected: FAIL — `Cannot find module './sse'`.

- [ ] **Step 3: Create `frontend/src/services/sse.ts`**

```ts
export interface ContestStreamEvent {
  type: string;
  data: Record<string, unknown>;
}

const EVENT_TYPES = ['phase-changed', 'tiebreak-round-changed', 'results-revealed'];

export function connectContestStream(onEvent: (event: ContestStreamEvent) => void): EventSource {
  const source = new EventSource('/api/contest/stream');
  for (const type of EVENT_TYPES) {
    source.addEventListener(type, (raw) => {
      try {
        const data = JSON.parse((raw as MessageEvent).data) as Record<string, unknown>;
        onEvent({ type, data });
      } catch {
        // ignora eventos con payload inválido
      }
    });
  }
  return source;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd frontend && npx vitest run src/services/sse.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Write the failing test `frontend/src/stores/contest.test.ts`**

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { setActivePinia, createPinia } from 'pinia';

vi.mock('../services/api', async () => {
  const actual = await vi.importActual<typeof import('../services/api')>('../services/api');
  return { ...actual, api: { ...actual.api, get: vi.fn() } };
});

const connectMock = vi.fn();
vi.mock('../services/sse', () => ({
  connectContestStream: (cb: (e: { type: string; data: Record<string, unknown> }) => void) => {
    connectMock(cb);
    return {} as EventSource;
  },
}));

import { api } from '../services/api';
import { useContestStore } from './contest';

beforeEach(() => {
  setActivePinia(createPinia());
  vi.clearAllMocks();
});

describe('useContestStore', () => {
  it('starts in REGISTRATION before init()', () => {
    const store = useContestStore();
    expect(store.phase).toBe('REGISTRATION');
    expect(store.loaded).toBe(false);
  });

  it('init() loads the current phase and connects the SSE stream', async () => {
    vi.mocked(api.get).mockResolvedValue({ phase: 'VOTING', allowSelfVote: true });
    const store = useContestStore();

    await store.init();

    expect(store.phase).toBe('VOTING');
    expect(store.allowSelfVote).toBe(true);
    expect(store.loaded).toBe(true);
    expect(connectMock).toHaveBeenCalledTimes(1);
  });

  it('updates phase when the SSE stream reports a phase-changed event', async () => {
    vi.mocked(api.get).mockResolvedValue({ phase: 'REGISTRATION', allowSelfVote: false });
    const store = useContestStore();
    await store.init();

    const handler = connectMock.mock.calls[0][0];
    handler({ type: 'phase-changed', data: { phase: 'TIEBREAK' } });

    expect(store.phase).toBe('TIEBREAK');
  });

  it('ignores non-phase-changed SSE events', async () => {
    vi.mocked(api.get).mockResolvedValue({ phase: 'VOTING', allowSelfVote: false });
    const store = useContestStore();
    await store.init();

    const handler = connectMock.mock.calls[0][0];
    handler({ type: 'results-revealed', data: { revealedAt: 'x' } });

    expect(store.phase).toBe('VOTING');
  });
});
```

- [ ] **Step 6: Run test to verify it fails**

Run: `cd frontend && npx vitest run src/stores/contest.test.ts`
Expected: FAIL — `Cannot find module './contest'`.

- [ ] **Step 7: Create `frontend/src/stores/contest.ts`**

```ts
import { ref } from 'vue';
import { defineStore } from 'pinia';
import { api } from '../services/api';
import { connectContestStream } from '../services/sse';

export type ContestPhase = 'REGISTRATION' | 'VOTING' | 'TIEBREAK' | 'RESULTS';

interface ContestResponse {
  phase: ContestPhase;
  allowSelfVote: boolean;
}

export const useContestStore = defineStore('contest', () => {
  const phase = ref<ContestPhase>('REGISTRATION');
  const allowSelfVote = ref(false);
  const loaded = ref(false);

  async function init(): Promise<void> {
    const data = await api.get<ContestResponse>('/api/contest');
    phase.value = data.phase;
    allowSelfVote.value = data.allowSelfVote;
    loaded.value = true;

    connectContestStream((event) => {
      if (event.type === 'phase-changed' && typeof event.data.phase === 'string') {
        phase.value = event.data.phase as ContestPhase;
      }
    });
  }

  return { phase, allowSelfVote, loaded, init };
});
```

- [ ] **Step 8: Run test to verify it passes**

Run: `cd frontend && npx vitest run src/stores/contest.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 9: Commit**

```bash
git add frontend/src/services/sse.ts frontend/src/services/sse.test.ts frontend/src/stores/contest.ts frontend/src/stores/contest.test.ts
git commit -m "Add contest store and SSE service for live phase updates"
```

---

### Task 3: Extend `api.ts` with `postForm` (multipart upload support)

**Files:**
- Modify: `frontend/src/services/api.ts`
- Modify: `frontend/src/services/api.test.ts`

**Interfaces:**
- Consumes: `getStoredUserId` (Fase B).
- Produces: `api.postForm<T>(path: string, form: FormData): Promise<T>` —
  same `X-User-Id` attachment and `ApiError` handling as `api.post`, but
  sends `form` directly as the body with no `Content-Type` header set
  (the browser fills in the multipart boundary itself). Internal refactor:
  extracts the shared response-handling logic (`handleResponse`) so both
  the JSON and FormData paths use it — `api.get/post/patch/delete` keep
  their exact existing signatures, unchanged for callers.

- [ ] **Step 1: Write the failing test — add to `frontend/src/services/api.test.ts`**

Add inside the existing `describe('api', ...)` block:

```ts
  it('postForm sends FormData without a Content-Type header', async () => {
    localStorage.setItem('pinchoParty.userId', 'u1');
    localStorage.setItem('pinchoParty.userName', 'Laura');
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 201, json: async () => ({ id: 'e1' }) });
    vi.stubGlobal('fetch', fetchMock);

    const form = new FormData();
    form.set('name', 'Croqueta');
    await api.postForm('/api/entries', form);

    const [url, options] = fetchMock.mock.calls[0];
    expect(url).toBe('/api/entries');
    expect(options.method).toBe('POST');
    expect((options.headers as Headers).get('X-User-Id')).toBe('u1');
    expect((options.headers as Headers).has('Content-Type')).toBe(false);
    expect(options.body).toBe(form);
  });

  it('postForm rejects with ApiError on a failed upload', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 400,
      json: async () => ({ code: 'IMAGE_REQUIRED', message: 'Falta la fotografía de la tapa.' }),
    });
    vi.stubGlobal('fetch', fetchMock);

    await expect(api.postForm('/api/entries', new FormData())).rejects.toMatchObject({
      status: 400,
      code: 'IMAGE_REQUIRED',
    });
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && npx vitest run src/services/api.test.ts`
Expected: FAIL — `api.postForm is not a function`.

- [ ] **Step 3: Modify `frontend/src/services/api.ts`**

Replace the whole file with:

```ts
import { getStoredUserId } from './sessionStorage';

export class ApiError extends Error {
  status: number;
  code: string;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

async function handleResponse<T>(response: Response): Promise<T> {
  if (!response.ok) {
    let code = 'UNKNOWN_ERROR';
    let message = 'No hemos podido completar la petición.';
    try {
      const data = (await response.json()) as { code?: string; message?: string };
      if (data.code) code = data.code;
      if (data.message) message = data.message;
    } catch {
      // el cuerpo no era JSON: nos quedamos con el mensaje genérico
    }
    throw new ApiError(response.status, code, message);
  }
  if (response.status === 204) {
    return undefined as T;
  }
  return (await response.json()) as T;
}

function authHeaders(): Headers {
  const headers = new Headers();
  const userId = getStoredUserId();
  if (userId) headers.set('X-User-Id', userId);
  return headers;
}

interface RequestOptions {
  method?: string;
  json?: unknown;
}

async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const headers = authHeaders();
  let body: string | undefined;
  if (options.json !== undefined) {
    headers.set('Content-Type', 'application/json');
    body = JSON.stringify(options.json);
  }
  const response = await fetch(path, { method: options.method ?? 'GET', headers, body });
  return handleResponse<T>(response);
}

async function requestForm<T>(path: string, form: FormData): Promise<T> {
  const response = await fetch(path, { method: 'POST', headers: authHeaders(), body: form });
  return handleResponse<T>(response);
}

export const api = {
  get: <T>(path: string) => request<T>(path),
  post: <T>(path: string, json?: unknown) => request<T>(path, { method: 'POST', json }),
  postForm: <T>(path: string, form: FormData) => requestForm<T>(path, form),
  patch: <T>(path: string, json?: unknown) => request<T>(path, { method: 'PATCH', json }),
  delete: <T>(path: string) => request<T>(path, { method: 'DELETE' }),
};
```

- [ ] **Step 4: Run the full file to verify it passes**

Run: `cd frontend && npx vitest run src/services/api.test.ts`
Expected: PASS (7 tests — the 5 from Fase B plus the 2 new ones).

- [ ] **Step 5: Run the whole frontend suite to confirm no regression from the refactor**

Run: `cd frontend && npx vitest run`
Expected: every test file still passes (this refactor changed shared
internals that `session.test.ts` and others depend on transitively).

- [ ] **Step 6: Commit**

```bash
git add frontend/src/services/api.ts frontend/src/services/api.test.ts
git commit -m "Add api.postForm for multipart uploads; extract shared response handling"
```

---

### Task 4: Client-side image compression

**Files:**
- Create: `frontend/src/services/image.ts`
- Test: `frontend/src/services/image.test.ts`

**Interfaces:**
- Produces: `computeTargetSize(width: number, height: number, maxDimension = 1600): { width: number; height: number }`
  (pure function, fully unit tested), `compressImage(file: File): Promise<File>`
  (canvas-based resize + JPEG re-encode; untested integration wrapper —
  jsdom has no real `<canvas>` rendering, so this is exercised manually in
  the browser check in Task 8, not in the unit suite).

- [ ] **Step 1: Write the failing test `frontend/src/services/image.test.ts`**

```ts
import { describe, it, expect } from 'vitest';
import { computeTargetSize } from './image';

describe('computeTargetSize', () => {
  it('keeps the original size when already within the limit', () => {
    expect(computeTargetSize(800, 600)).toEqual({ width: 800, height: 600 });
  });

  it('downscales a wide image so the largest side matches the limit', () => {
    expect(computeTargetSize(3200, 2400, 1600)).toEqual({ width: 1600, height: 1200 });
  });

  it('downscales a tall image so the largest side matches the limit', () => {
    expect(computeTargetSize(1200, 4000, 1600)).toEqual({ width: 480, height: 1600 });
  });

  it('does not upscale a small image', () => {
    expect(computeTargetSize(200, 100, 1600)).toEqual({ width: 200, height: 100 });
  });

  it('treats an already-square oversized image correctly', () => {
    expect(computeTargetSize(2000, 2000, 1600)).toEqual({ width: 1600, height: 1600 });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && npx vitest run src/services/image.test.ts`
Expected: FAIL — `Cannot find module './image'`.

- [ ] **Step 3: Create `frontend/src/services/image.ts`**

```ts
const MAX_DIMENSION = 1600;
const JPEG_QUALITY = 0.82;

export function computeTargetSize(
  width: number,
  height: number,
  maxDimension = MAX_DIMENSION
): { width: number; height: number } {
  if (width <= maxDimension && height <= maxDimension) {
    return { width, height };
  }
  const scale = width > height ? maxDimension / width : maxDimension / height;
  return {
    width: Math.round(width * scale),
    height: Math.round(height * scale),
  };
}

function renameToJpeg(filename: string): string {
  return filename.replace(/\.[^.]+$/, '') + '.jpg';
}

export async function compressImage(file: File): Promise<File> {
  const bitmap = await createImageBitmap(file);
  const { width, height } = computeTargetSize(bitmap.width, bitmap.height);

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) return file;
  ctx.drawImage(bitmap, 0, 0, width, height);

  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', JPEG_QUALITY));
  if (!blob) return file;

  return new File([blob], renameToJpeg(file.name), { type: 'image/jpeg' });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd frontend && npx vitest run src/services/image.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add frontend/src/services/image.ts frontend/src/services/image.test.ts
git commit -m "Add client-side image resize-math and compression helper"
```

---

### Task 5: `entries` store (hand-off for the confirmation screen)

**Files:**
- Create: `frontend/src/stores/entries.ts`
- Test: `frontend/src/stores/entries.test.ts`

**Interfaces:**
- Produces: `CreatedEntry { id: string; number: number; name: string | null; description: string | null; imagePath: string }`,
  `useEntriesStore()` exposing `lastCreated: Ref<CreatedEntry | null>` and
  `setLastCreated(entry: CreatedEntry): void`.

- [ ] **Step 1: Write the failing test `frontend/src/stores/entries.test.ts`**

```ts
import { describe, it, expect, beforeEach } from 'vitest';
import { setActivePinia, createPinia } from 'pinia';
import { useEntriesStore } from './entries';

beforeEach(() => setActivePinia(createPinia()));

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
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && npx vitest run src/stores/entries.test.ts`
Expected: FAIL — `Cannot find module './entries'`.

- [ ] **Step 3: Create `frontend/src/stores/entries.ts`**

```ts
import { ref } from 'vue';
import { defineStore } from 'pinia';

export interface CreatedEntry {
  id: string;
  number: number;
  name: string | null;
  description: string | null;
  imagePath: string;
}

export const useEntriesStore = defineStore('entries', () => {
  const lastCreated = ref<CreatedEntry | null>(null);

  function setLastCreated(entry: CreatedEntry): void {
    lastCreated.value = entry;
  }

  return { lastCreated, setLastCreated };
});
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd frontend && npx vitest run src/stores/entries.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add frontend/src/stores/entries.ts frontend/src/stores/entries.test.ts
git commit -m "Add entries store to hand off a just-created entry to its confirmation screen"
```

---

### Task 6: `useHeartbeat` composable

**Files:**
- Create: `frontend/src/composables/useHeartbeat.ts`
- Test: `frontend/src/composables/useHeartbeat.test.ts`

**Interfaces:**
- Consumes: `api` (Task 3), `useSessionStore` (Fase B).
- Produces: `useHeartbeat(): void` — call inside a component's `<script setup>`.
  Sends `POST /api/users/:id/heartbeat` immediately on mount and every 20s
  while `session.user` is set; stops on unmount; does nothing when there is
  no session; swallows request failures (a missed heartbeat must never
  interrupt the UI).

- [ ] **Step 1: Write the failing test `frontend/src/composables/useHeartbeat.test.ts`**

```ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { defineComponent } from 'vue';
import { mount } from '@vue/test-utils';
import { setActivePinia, createPinia } from 'pinia';

vi.mock('../services/api', async () => {
  const actual = await vi.importActual<typeof import('../services/api')>('../services/api');
  return { ...actual, api: { ...actual.api, post: vi.fn().mockResolvedValue(undefined) } };
});

import { api } from '../services/api';
import { useSessionStore } from '../stores/session';
import { useHeartbeat } from './useHeartbeat';

const HostComponent = defineComponent({
  setup() {
    useHeartbeat();
    return () => null;
  },
});

beforeEach(() => {
  vi.useFakeTimers();
  setActivePinia(createPinia());
  vi.clearAllMocks();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('useHeartbeat', () => {
  it('does nothing when there is no session', async () => {
    mount(HostComponent);
    await vi.advanceTimersByTimeAsync(0);
    expect(api.post).not.toHaveBeenCalled();
  });

  it('sends an immediate heartbeat and repeats every 20s while a session exists', async () => {
    const session = useSessionStore();
    session.user = { id: 'u1', name: 'Laura' };

    mount(HostComponent);
    await vi.advanceTimersByTimeAsync(0);
    expect(api.post).toHaveBeenCalledWith('/api/users/u1/heartbeat');
    expect(api.post).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(20_000);
    expect(api.post).toHaveBeenCalledTimes(2);
  });

  it('stops sending heartbeats after unmount', async () => {
    const session = useSessionStore();
    session.user = { id: 'u1', name: 'Laura' };
    const wrapper = mount(HostComponent);
    await vi.advanceTimersByTimeAsync(0);

    wrapper.unmount();
    await vi.advanceTimersByTimeAsync(40_000);

    expect(api.post).toHaveBeenCalledTimes(1);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && npx vitest run src/composables/useHeartbeat.test.ts`
Expected: FAIL — `Cannot find module './useHeartbeat'`.

- [ ] **Step 3: Create `frontend/src/composables/useHeartbeat.ts`**

```ts
import { onMounted, onUnmounted } from 'vue';
import { api } from '../services/api';
import { useSessionStore } from '../stores/session';

const HEARTBEAT_INTERVAL_MS = 20_000;

export function useHeartbeat(): void {
  const session = useSessionStore();
  let timer: ReturnType<typeof setInterval> | undefined;

  function send(): void {
    if (!session.user) return;
    api.post(`/api/users/${session.user.id}/heartbeat`).catch(() => {
      // un heartbeat fallido no debe interrumpir la experiencia
    });
  }

  onMounted(() => {
    send();
    timer = setInterval(send, HEARTBEAT_INTERVAL_MS);
  });

  onUnmounted(() => {
    if (timer) clearInterval(timer);
  });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd frontend && npx vitest run src/composables/useHeartbeat.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add frontend/src/composables/useHeartbeat.ts frontend/src/composables/useHeartbeat.test.ts
git commit -m "Add useHeartbeat composable"
```

---

### Task 7: `HasEntryQuestionView`

**Files:**
- Create: `frontend/src/views/HasEntryQuestionView.vue`
- Test: `frontend/src/views/HasEntryQuestionView.test.ts`
- Modify: `frontend/src/styles/base.css` (add `.button--secondary`)

**Interfaces:**
- Produces: a view with two actions, navigating to `new-entry` or
  `waiting-room` (route names defined in Task 10's router — this view only
  calls `router.push({ name: ... })`, so it compiles and tests independently
  before those routes exist).
- Produces (shared): `.button--secondary` CSS class, reused by this view,
  `EntryConfirmationView` (Task 9), and later phases.

- [ ] **Step 1: Add `.button--secondary` to `frontend/src/styles/base.css`**

Add after the existing `.button--primary` rule:

```css
.button--secondary {
  background: var(--color-surface);
  color: var(--color-text);
  border: 1px solid var(--color-border);
}
```

- [ ] **Step 2: Write the failing test `frontend/src/views/HasEntryQuestionView.test.ts`**

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mount } from '@vue/test-utils';
import HasEntryQuestionView from './HasEntryQuestionView.vue';

const pushMock = vi.fn();
vi.mock('vue-router', () => ({
  useRouter: () => ({ push: pushMock }),
}));

beforeEach(() => {
  pushMock.mockClear();
});

describe('HasEntryQuestionView', () => {
  it('shows the question and both options', () => {
    const wrapper = mount(HasEntryQuestionView);
    expect(wrapper.text()).toContain('¿Has traído algún pincho?');
    expect(wrapper.text()).toContain('Sí, quiero registrar mi pincho');
    expect(wrapper.text()).toContain('No, solo vengo a comer');
  });

  it('navigates to new-entry when answering yes', async () => {
    const wrapper = mount(HasEntryQuestionView);
    await wrapper.findAll('button')[0].trigger('click');
    expect(pushMock).toHaveBeenCalledWith({ name: 'new-entry' });
  });

  it('navigates to waiting-room when answering no', async () => {
    const wrapper = mount(HasEntryQuestionView);
    await wrapper.findAll('button')[1].trigger('click');
    expect(pushMock).toHaveBeenCalledWith({ name: 'waiting-room' });
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `cd frontend && npx vitest run src/views/HasEntryQuestionView.test.ts`
Expected: FAIL — `Cannot find module './HasEntryQuestionView.vue'`.

- [ ] **Step 4: Create `frontend/src/views/HasEntryQuestionView.vue`**

```vue
<script setup lang="ts">
import { useRouter } from 'vue-router';

const router = useRouter();

function yes(): void {
  router.push({ name: 'new-entry' });
}

function no(): void {
  router.push({ name: 'waiting-room' });
}
</script>

<template>
  <main class="has-entry">
    <div class="has-entry__card">
      <h1 class="has-entry__title">
        ¿Has traído algún pincho?
      </h1>
      <div class="has-entry__actions">
        <button class="button button--primary button--block" type="button" @click="yes">
          Sí, quiero registrar mi pincho
        </button>
        <button class="button button--secondary button--block" type="button" @click="no">
          No, solo vengo a comer 😄
        </button>
      </div>
    </div>
  </main>
</template>

<style scoped>
.has-entry {
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: var(--space-5);
}

.has-entry__card {
  background: var(--color-surface);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-md);
  padding: var(--space-8) var(--space-5);
  max-width: 420px;
  width: 100%;
  text-align: center;
}

.has-entry__title {
  font-size: 1.5rem;
  margin: 0 0 var(--space-5);
}

.has-entry__actions {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
}
</style>
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd frontend && npx vitest run src/views/HasEntryQuestionView.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 6: Commit**

```bash
git add frontend/src/styles/base.css frontend/src/views/HasEntryQuestionView.vue frontend/src/views/HasEntryQuestionView.test.ts
git commit -m "Add HasEntryQuestionView and shared secondary button style"
```

---

### Task 8: `NewEntryView` (camera capture + upload)

**Files:**
- Create: `frontend/src/views/NewEntryView.vue`
- Test: `frontend/src/views/NewEntryView.test.ts`

**Interfaces:**
- Consumes: `api.postForm` (Task 3), `compressImage` (Task 4),
  `useEntriesStore` (Task 5).
- Produces: a view that, on submit, navigates to
  `{ name: 'entry-confirmation', params: { number: String(entry.number) } }`.

- [ ] **Step 1: Write the failing test `frontend/src/views/NewEntryView.test.ts`**

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import { setActivePinia, createPinia } from 'pinia';
import NewEntryView from './NewEntryView.vue';

const pushMock = vi.fn();
vi.mock('vue-router', () => ({
  useRouter: () => ({ push: pushMock }),
}));

vi.mock('../services/api', async () => {
  const actual = await vi.importActual<typeof import('../services/api')>('../services/api');
  return { ...actual, api: { ...actual.api, postForm: vi.fn() } };
});

vi.mock('../services/image', () => ({
  compressImage: vi.fn(async (file: File) => file),
}));

import { api } from '../services/api';
import { useEntriesStore } from '../stores/entries';

function makeFile(): File {
  return new File(['fake-image-bytes'], 'photo.jpg', { type: 'image/jpeg' });
}

beforeEach(() => {
  setActivePinia(createPinia());
  pushMock.mockClear();
  vi.clearAllMocks();
});

describe('NewEntryView', () => {
  it('shows a validation message when submitting without a photo', async () => {
    const wrapper = mount(NewEntryView);
    await wrapper.find('form').trigger('submit.prevent');
    expect(wrapper.text()).toContain('Haz una foto de tu pincho');
    expect(api.postForm).not.toHaveBeenCalled();
  });

  it('uploads the compressed photo plus optional fields and navigates to the confirmation screen', async () => {
    vi.mocked(api.postForm).mockResolvedValue({
      id: 'e1',
      number: 7,
      name: 'Croqueta',
      description: null,
      imagePath: 'a.webp',
    });
    const wrapper = mount(NewEntryView);

    const fileInput = wrapper.find('input[type="file"]');
    Object.defineProperty(fileInput.element, 'files', { value: [makeFile()] });
    await fileInput.trigger('change');

    await wrapper.find('input#entry-name').setValue('Croqueta');
    await wrapper.find('form').trigger('submit.prevent');
    await flushPromises();

    expect(api.postForm).toHaveBeenCalledTimes(1);
    const [path, form] = vi.mocked(api.postForm).mock.calls[0];
    expect(path).toBe('/api/entries');
    expect(form.get('name')).toBe('Croqueta');
    expect(form.get('image')).toBeInstanceOf(File);

    expect(useEntriesStore().lastCreated).toEqual({
      id: 'e1',
      number: 7,
      name: 'Croqueta',
      description: null,
      imagePath: 'a.webp',
    });
    expect(pushMock).toHaveBeenCalledWith({ name: 'entry-confirmation', params: { number: '7' } });
  });

  it('shows a retryable error and keeps the form usable when the upload fails', async () => {
    vi.mocked(api.postForm).mockRejectedValue(new Error('network down'));
    const wrapper = mount(NewEntryView);

    const fileInput = wrapper.find('input[type="file"]');
    Object.defineProperty(fileInput.element, 'files', { value: [makeFile()] });
    await fileInput.trigger('change');
    await wrapper.find('form').trigger('submit.prevent');
    await flushPromises();

    expect(wrapper.text()).toContain('No hemos podido guardar tu pincho.');
    expect(pushMock).not.toHaveBeenCalled();
    expect(wrapper.find('button[type="submit"]').attributes('disabled')).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && npx vitest run src/views/NewEntryView.test.ts`
Expected: FAIL — `Cannot find module './NewEntryView.vue'`.

- [ ] **Step 3: Create `frontend/src/views/NewEntryView.vue`**

```vue
<script setup lang="ts">
import { ref } from 'vue';
import { useRouter } from 'vue-router';
import { Camera } from '@lucide/vue';
import { api, ApiError } from '../services/api';
import { compressImage } from '../services/image';
import { useEntriesStore } from '../stores/entries';

interface CreatedEntryResponse {
  id: string;
  number: number;
  name: string | null;
  description: string | null;
  imagePath: string;
}

const router = useRouter();
const entries = useEntriesStore();

const fileInput = ref<HTMLInputElement | null>(null);
const selectedFile = ref<File | null>(null);
const previewUrl = ref<string | null>(null);
const name = ref('');
const description = ref('');
const touched = ref(false);
const isSubmitting = ref(false);
const submitError = ref<string | null>(null);

function pickPhoto(): void {
  fileInput.value?.click();
}

function onFileChange(event: Event): void {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0] ?? null;
  selectedFile.value = file;
  if (previewUrl.value) URL.revokeObjectURL(previewUrl.value);
  previewUrl.value = file ? URL.createObjectURL(file) : null;
}

async function onSubmit(): Promise<void> {
  touched.value = true;
  if (!selectedFile.value) return;

  isSubmitting.value = true;
  submitError.value = null;
  try {
    let photo = selectedFile.value;
    try {
      photo = await compressImage(selectedFile.value);
    } catch {
      // si la compresión falla, seguimos con el archivo original
    }

    const form = new FormData();
    form.set('image', photo);
    if (name.value.trim()) form.set('name', name.value.trim());
    if (description.value.trim()) form.set('description', description.value.trim());

    const entry = await api.postForm<CreatedEntryResponse>('/api/entries', form);
    entries.setLastCreated(entry);
    router.push({ name: 'entry-confirmation', params: { number: String(entry.number) } });
  } catch (err) {
    submitError.value = err instanceof ApiError ? err.message : 'No hemos podido guardar tu pincho.';
  } finally {
    isSubmitting.value = false;
  }
}
</script>

<template>
  <main class="new-entry">
    <form class="new-entry__card" @submit.prevent="onSubmit">
      <h1 class="new-entry__title">
        Registra tu pincho
      </h1>
      <p class="new-entry__subtitle">
        Haz la foto ahora mismo, tal cual está.
      </p>

      <input
        ref="fileInput"
        type="file"
        accept="image/*"
        capture="environment"
        class="new-entry__file-input"
        @change="onFileChange"
      >

      <button type="button" class="new-entry__photo-picker" @click="pickPhoto">
        <img v-if="previewUrl" :src="previewUrl" alt="" class="new-entry__preview">
        <span v-else class="new-entry__photo-placeholder">
          <Camera :size="32" aria-hidden="true" />
          <span>Hacer foto</span>
        </span>
      </button>
      <p v-if="touched && !selectedFile" class="new-entry__error" role="alert">
        Haz una foto de tu pincho para continuar.
      </p>

      <label class="new-entry__label" for="entry-name">Nombre del pincho (opcional)</label>
      <input
        id="entry-name"
        v-model="name"
        class="new-entry__input"
        type="text"
        placeholder="Por ejemplo: Croqueta de jamón"
        maxlength="80"
      >

      <label class="new-entry__label" for="entry-description">Descripción (opcional)</label>
      <textarea
        id="entry-description"
        v-model="description"
        class="new-entry__input new-entry__textarea"
        placeholder="Mini brioche de carrillera con cebolla caramelizada."
        maxlength="280"
        rows="3"
      />

      <p v-if="submitError" class="new-entry__error" role="alert">
        {{ submitError }}
      </p>

      <button class="button button--primary button--block" type="submit" :disabled="isSubmitting">
        {{ isSubmitting ? 'Subiendo tu pincho…' : 'Registrar pincho' }}
      </button>
    </form>
  </main>
</template>

<style scoped>
.new-entry {
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: var(--space-5);
}

.new-entry__card {
  background: var(--color-surface);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-md);
  padding: var(--space-8) var(--space-5);
  max-width: 420px;
  width: 100%;
}

.new-entry__title {
  font-size: 1.5rem;
  margin: 0 0 var(--space-1);
}

.new-entry__subtitle {
  color: var(--color-text-muted);
  margin: 0 0 var(--space-5);
}

.new-entry__file-input {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
}

.new-entry__photo-picker {
  display: block;
  width: 100%;
  aspect-ratio: 4 / 3;
  border-radius: var(--radius-md);
  border: 2px dashed var(--color-border);
  background: var(--color-bg);
  padding: 0;
  overflow: hidden;
  cursor: pointer;
  margin-bottom: var(--space-2);
}

.new-entry__preview {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}

.new-entry__photo-placeholder {
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: var(--space-2);
  color: var(--color-text-muted);
}

.new-entry__label {
  display: block;
  font-weight: 600;
  margin: var(--space-4) 0 var(--space-2);
}

.new-entry__input {
  width: 100%;
  min-height: 48px;
  padding: var(--space-2) var(--space-4);
  border-radius: var(--radius-md);
  border: 1px solid var(--color-border);
  font-size: 1rem;
  font-family: inherit;
  margin-bottom: var(--space-2);
}

.new-entry__textarea {
  min-height: 88px;
  resize: vertical;
}

.new-entry__error {
  color: var(--color-danger);
  margin: 0 0 var(--space-4);
  font-size: 0.9rem;
}
</style>
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd frontend && npx vitest run src/views/NewEntryView.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add frontend/src/views/NewEntryView.vue frontend/src/views/NewEntryView.test.ts
git commit -m "Add NewEntryView: camera capture, compression, upload"
```

---

### Task 9: `EntryConfirmationView`

**Files:**
- Create: `frontend/src/views/EntryConfirmationView.vue`
- Test: `frontend/src/views/EntryConfirmationView.test.ts`

**Interfaces:**
- Consumes: `useEntriesStore` (Task 5).
- Produces: a view reading `route.params.number` and
  `entries.lastCreated`, navigating to `new-entry` or `waiting-room`.

- [ ] **Step 1: Write the failing test `frontend/src/views/EntryConfirmationView.test.ts`**

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mount } from '@vue/test-utils';
import { setActivePinia, createPinia } from 'pinia';
import { useEntriesStore } from '../stores/entries';
import EntryConfirmationView from './EntryConfirmationView.vue';

const pushMock = vi.fn();
vi.mock('vue-router', () => ({
  useRouter: () => ({ push: pushMock }),
  useRoute: () => ({ params: { number: '7' } }),
}));

beforeEach(() => {
  setActivePinia(createPinia());
  pushMock.mockClear();
});

describe('EntryConfirmationView', () => {
  it('shows the assigned number even without a stored entry', () => {
    const wrapper = mount(EntryConfirmationView);
    expect(wrapper.text()).toContain('PINCHO Nº 07');
    expect(wrapper.find('img').exists()).toBe(false);
  });

  it('shows the photo when the entry was just created in this session', () => {
    useEntriesStore().setLastCreated({
      id: 'e1',
      number: 7,
      name: 'Croqueta',
      description: null,
      imagePath: 'abc.webp',
    });
    const wrapper = mount(EntryConfirmationView);
    const img = wrapper.find('img');
    expect(img.exists()).toBe(true);
    expect(img.attributes('src')).toBe('/uploads/abc.webp');
  });

  it('navigates to new-entry on "Registrar otro pincho"', async () => {
    const wrapper = mount(EntryConfirmationView);
    await wrapper.findAll('button')[0].trigger('click');
    expect(pushMock).toHaveBeenCalledWith({ name: 'new-entry' });
  });

  it('navigates to waiting-room on "Terminar"', async () => {
    const wrapper = mount(EntryConfirmationView);
    await wrapper.findAll('button')[1].trigger('click');
    expect(pushMock).toHaveBeenCalledWith({ name: 'waiting-room' });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && npx vitest run src/views/EntryConfirmationView.test.ts`
Expected: FAIL — `Cannot find module './EntryConfirmationView.vue'`.

- [ ] **Step 3: Create `frontend/src/views/EntryConfirmationView.vue`**

```vue
<script setup lang="ts">
import { computed } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useEntriesStore } from '../stores/entries';

const route = useRoute();
const router = useRouter();
const entries = useEntriesStore();

const number = computed(() => route.params.number as string);
const paddedNumber = computed(() => number.value.padStart(2, '0'));
const imageUrl = computed(() => (entries.lastCreated ? `/uploads/${entries.lastCreated.imagePath}` : null));

function registerAnother(): void {
  router.push({ name: 'new-entry' });
}

function finish(): void {
  router.push({ name: 'waiting-room' });
}
</script>

<template>
  <main class="confirmation">
    <div class="confirmation__card">
      <img
        v-if="imageUrl"
        :src="imageUrl"
        :alt="`Foto del pincho número ${number}`"
        class="confirmation__photo"
      >
      <p class="confirmation__badge">
        PINCHO Nº {{ paddedNumber }}
      </p>
      <h1 class="confirmation__title">
        ¡Tu pincho ya está compitiendo!
      </h1>

      <div class="confirmation__actions">
        <button class="button button--secondary button--block" type="button" @click="registerAnother">
          Registrar otro pincho
        </button>
        <button class="button button--primary button--block" type="button" @click="finish">
          Terminar
        </button>
      </div>
    </div>
  </main>
</template>

<style scoped>
.confirmation {
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: var(--space-5);
}

.confirmation__card {
  background: var(--color-surface);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-md);
  padding: var(--space-8) var(--space-5);
  max-width: 420px;
  width: 100%;
  text-align: center;
}

.confirmation__photo {
  width: 100%;
  aspect-ratio: 4 / 3;
  object-fit: cover;
  border-radius: var(--radius-md);
  margin-bottom: var(--space-4);
}

.confirmation__badge {
  display: inline-block;
  font-weight: 700;
  letter-spacing: 0.04em;
  color: var(--color-primary);
  margin: 0 0 var(--space-2);
}

.confirmation__title {
  font-size: 1.5rem;
  margin: 0 0 var(--space-5);
}

.confirmation__actions {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
}
</style>
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd frontend && npx vitest run src/views/EntryConfirmationView.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add frontend/src/views/EntryConfirmationView.vue frontend/src/views/EntryConfirmationView.test.ts
git commit -m "Add EntryConfirmationView"
```

---

### Task 10: `WaitingRoomView`

**Files:**
- Create: `frontend/src/views/WaitingRoomView.vue`
- Test: `frontend/src/views/WaitingRoomView.test.ts`

**Interfaces:**
- Consumes: `useContestStore` (Task 2), `useHeartbeat` (Task 6).
- Produces: a view whose displayed message reacts live to `contest.phase`.
  Does not navigate anywhere yet — see Global Constraints.

- [ ] **Step 1: Write the failing test `frontend/src/views/WaitingRoomView.test.ts`**

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mount } from '@vue/test-utils';
import { setActivePinia, createPinia } from 'pinia';
import { useContestStore } from '../stores/contest';
import WaitingRoomView from './WaitingRoomView.vue';

vi.mock('../composables/useHeartbeat', () => ({
  useHeartbeat: vi.fn(),
}));

beforeEach(() => {
  setActivePinia(createPinia());
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
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && npx vitest run src/views/WaitingRoomView.test.ts`
Expected: FAIL — `Cannot find module './WaitingRoomView.vue'`.

- [ ] **Step 3: Create `frontend/src/views/WaitingRoomView.vue`**

```vue
<script setup lang="ts">
import { useContestStore } from '../stores/contest';
import { useHeartbeat } from '../composables/useHeartbeat';

useHeartbeat();
const contest = useContestStore();
</script>

<template>
  <main class="waiting">
    <div class="waiting__card">
      <h1 class="waiting__title">
        {{ contest.phase === 'REGISTRATION' ? 'Ya estás dentro' : '¡El concurso ha empezado!' }}
      </h1>
      <p class="waiting__subtitle">
        <template v-if="contest.phase === 'REGISTRATION'">
          Espera a que el anfitrión dé comienzo al concurso. Esta pantalla se
          actualiza sola, no hace falta que recargues.
        </template>
        <template v-else>
          Ya puedes probar los pinchos y elegir tus favoritos — la galería
          está al caer.
        </template>
      </p>
    </div>
  </main>
</template>

<style scoped>
.waiting {
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: var(--space-5);
}

.waiting__card {
  background: var(--color-surface);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-md);
  padding: var(--space-8) var(--space-5);
  max-width: 420px;
  width: 100%;
  text-align: center;
}

.waiting__title {
  font-size: 1.5rem;
  margin: 0 0 var(--space-2);
}

.waiting__subtitle {
  color: var(--color-text-muted);
  margin: 0;
}
</style>
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd frontend && npx vitest run src/views/WaitingRoomView.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add frontend/src/views/WaitingRoomView.vue frontend/src/views/WaitingRoomView.test.ts
git commit -m "Add WaitingRoomView reacting live to the contest phase"
```

---

### Task 11: Wire the router, guards, and app bootstrap

**Files:**
- Modify: `frontend/src/router/index.ts`
- Modify: `frontend/src/router/index.test.ts`
- Modify: `frontend/src/main.ts`

**Interfaces:**
- Consumes: every view from Tasks 7–10, `useContestStore` (Task 2).
- Produces: named routes `has-entry` (`/pincho`), `new-entry`
  (`/pincho/nuevo`), `entry-confirmation` (`/pincho/confirmacion/:number`),
  `waiting-room` (`/esperando`), added to Fase B's `welcome`/`register`.
  Updated guard rules (see Step 3). `main.ts` now awaits
  `contest.init()` before mounting, so the guard's phase check is never
  stale on first load.

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

  it('redirects a registered visitor away from /registro to /pincho', async () => {
    useSessionStore().user = { id: 'u1', name: 'Laura' };
    await router.push('/registro');
    expect(router.currentRoute.value.name).toBe('has-entry');
  });

  it('redirects a registered visitor away from / to /pincho during REGISTRATION', async () => {
    useSessionStore().user = { id: 'u1', name: 'Laura' };
    await router.push('/');
    expect(router.currentRoute.value.name).toBe('has-entry');
  });

  it('redirects a registered visitor away from / to /esperando once voting has started', async () => {
    useSessionStore().user = { id: 'u1', name: 'Laura' };
    useContestStore().phase = 'VOTING';
    await router.push('/');
    expect(router.currentRoute.value.name).toBe('waiting-room');
  });

  it('blocks an anonymous visitor from reaching /pincho', async () => {
    await router.push('/pincho');
    expect(router.currentRoute.value.name).toBe('welcome');
  });

  it('blocks an anonymous visitor from reaching /pincho/nuevo', async () => {
    await router.push('/pincho/nuevo');
    expect(router.currentRoute.value.name).toBe('welcome');
  });

  it('blocks an anonymous visitor from reaching /esperando', async () => {
    await router.push('/esperando');
    expect(router.currentRoute.value.name).toBe('welcome');
  });

  it('redirects away from /pincho/nuevo to /esperando once registration has closed', async () => {
    useSessionStore().user = { id: 'u1', name: 'Laura' };
    useContestStore().phase = 'VOTING';
    await router.push('/pincho/nuevo');
    expect(router.currentRoute.value.name).toBe('waiting-room');
  });

  it('lets a registered visitor reach /pincho/confirmacion/:number and /esperando directly', async () => {
    useSessionStore().user = { id: 'u1', name: 'Laura' };
    await router.push('/pincho/confirmacion/7');
    expect(router.currentRoute.value.name).toBe('entry-confirmation');
    await router.push('/esperando');
    expect(router.currentRoute.value.name).toBe('waiting-room');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && npx vitest run src/router/index.test.ts`
Expected: FAIL — new route names don't exist yet, so several `push()`
calls resolve to no match / the old guard rules reject them incorrectly.

- [ ] **Step 3: Replace `frontend/src/router/index.ts`**

```ts
import { createRouter, createWebHistory } from 'vue-router';
import { useSessionStore } from '../stores/session';
import { useContestStore } from '../stores/contest';

const SESSION_REQUIRED_ROUTES = ['has-entry', 'new-entry', 'entry-confirmation', 'waiting-room'];
const REGISTRATION_ONLY_ROUTES = ['has-entry', 'new-entry'];

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
  ],
});

router.beforeEach((to) => {
  const session = useSessionStore();
  const contest = useContestStore();
  const name = to.name as string;

  if (SESSION_REQUIRED_ROUTES.includes(name) && !session.user) {
    return { name: 'welcome' };
  }

  if ((name === 'welcome' || name === 'register') && session.user) {
    return contest.phase === 'REGISTRATION' ? { name: 'has-entry' } : { name: 'waiting-room' };
  }

  if (REGISTRATION_ONLY_ROUTES.includes(name) && contest.phase !== 'REGISTRATION') {
    return { name: 'waiting-room' };
  }
});
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd frontend && npx vitest run src/router/index.test.ts`
Expected: PASS (9 tests).

- [ ] **Step 5: Modify `frontend/src/main.ts`**

```ts
import { createApp } from 'vue';
import { createPinia } from 'pinia';
import App from './App.vue';
import { router } from './router';
import { useContestStore } from './stores/contest';
import './styles/tokens.css';
import './styles/base.css';

const app = createApp(App);
const pinia = createPinia();
app.use(pinia);

const contest = useContestStore();
contest.init().finally(() => {
  app.use(router).mount('#app');
});
```

- [ ] **Step 6: Run the whole frontend suite**

Run: `cd frontend && npx vitest run`
Expected: every test file passes (sessionStorage, api, sse, contest,
entries, session, useHeartbeat, WelcomeView, RegisterUserView,
HasEntryQuestionView, NewEntryView, EntryConfirmationView,
WaitingRoomView, router).

- [ ] **Step 7: Commit**

```bash
git add frontend/src/router/index.ts frontend/src/router/index.test.ts frontend/src/main.ts
git commit -m "Wire entry-registration routes, phase-aware guards, and async app bootstrap"
```

---

### Task 12: Manual verification and final checks

**Files:** none — verification only.

- [ ] **Step 1: Start both dev servers**

Run (background): `cd server && npm run dev`
Run (background): `cd frontend && npm run dev`

- [ ] **Step 2: Browser check if a browser tool is available; otherwise ask the user**

If a browser automation tool is available this session, open
`http://localhost:5173/` and walk: register → "¿Has traído algún pincho?"
→ Sí → take/pick a photo → fill optional name → submit → confirmation
shows the number and photo → "Registrar otro pincho" loops back → "Terminar"
→ waiting room. Then, from the admin dashboard
(`POST /api/admin/contest/start` with the configured PIN), start the
contest and confirm the waiting room's message updates **without a
reload** (this is the one behavior that's structurally impossible to
verify with curl/unit tests alone — it depends on a live SSE push).

If no browser tool is available, say so explicitly, leave both dev servers
running, and ask the user to walk that same path themselves — do not claim
this step passed without either a real browser check or the user's
confirmation.

- [ ] **Step 3: Stop both dev servers**

Stop the frontend and backend background processes started in Step 1.

- [ ] **Step 4: Run typecheck, lint and tests for the frontend**

Run: `cd frontend && npm run typecheck && npm run lint && npm test`
Expected: all three succeed with zero errors.

- [ ] **Step 5: Re-run the backend suite to confirm nothing regressed**

Run: `cd server && npm test`
Expected: all 43 backend tests still pass (this phase touched no backend
code).

- [ ] **Step 6: Commit only if Step 4 required fixes**

If everything was already green, there is nothing to commit here. If you
had to fix something, stage exactly those files and commit:

```bash
git add <fixed files>
git commit -m "Fix lint/typecheck issues found in final verification"
```

---

### Task 13: Update the README

**Files:**
- Modify: `README.md` (repo root)

**Interfaces:** none — documentation only.

- [ ] **Step 1: Update the "Estado actual" note**

```markdown
> **Estado actual:** el backend está completo y probado. El frontend cubre
> el registro de participante y de tapas (bienvenida, ¿has traído pincho?,
> foto + datos del pincho, confirmación con número asignado, sala de
> espera con actualización en vivo por SSE). La galería, la votación, los
> resultados y el panel de administración por interfaz todavía no
> existen — se prueban directamente contra la API REST.
```

- [ ] **Step 2: Commit**

```bash
git add README.md
git commit -m "Update README: entry registration flow is live"
```

---

## End of Fase C

A guest can now go from opening the app to having their photographed tapa
registered and competing, entirely from their phone, with the waiting
screen already proving the live SSE plumbing works end to end. Fase D
(galería) picks up by building the gallery route and wiring the waiting
room's phase-change reaction to actually navigate there.
