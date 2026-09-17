# Frontend — Registro de Usuario (Fase B) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stand up the Vue 3 frontend project and deliver the first real user
flow: a guest opens the app, sees a welcome screen, registers with just a
name (`POST /api/users`), and the app remembers who they are across reloads
via `localStorage` — matching screens 1–2 of the spec.

**Architecture:** Vite + Vue 3 (`<script setup>`) + TypeScript + Vue Router +
Pinia. A thin `services/api.ts` fetch wrapper (relative paths, attaches
`X-User-Id` automatically) is the only way views talk to the backend. A
Pinia `session` store owns the current user and persists it via a tiny
`services/sessionStorage.ts` helper. No component library, no CSS
framework — design tokens as CSS custom properties, per the spec.

**Tech Stack:** Vue 3.5, Vite 5, TypeScript 5.9, Vue Router 4, Pinia 2,
`@lucide/vue` for icons, Vitest + `@vue/test-utils` + jsdom for tests,
ESLint (flat config, `typescript-eslint` + `eslint-plugin-vue`).

**Spec:** `docs/superpowers/specs/2026-09-16-pincho-party-design.md`

## Global Constraints

- The frontend never calls `http://localhost:3000` or any absolute backend
  URL — always relative paths (`/api/...`). In dev, Vite's proxy forwards
  `/api` and `/uploads` to the backend; in production the backend serves the
  built frontend itself. This is what makes the same build work from any LAN
  IP.
- No emoji used as a UI control icon. `@lucide/vue` for icons; emoji only
  allowed as a typographic accent inside copy text.
- No vote/results data exists in this phase — nothing here touches those
  endpoints.
- Every network action gets an explicit loading and error state; a failed
  request is retryable by re-submitting the same form, never silently
  swallowed.
- Buttons and inputs are at least 48px tall (spec's 44px minimum, rounded
  up for comfortable one-hand mobile use).
- Package versions are pinned to the exact ranges given below — checked
  against the npm registry while writing this plan, chosen to avoid mixing
  Vite 5 (what Vitest 2.1.9 is built against) with a newer Vite major that
  would pull in a second, mismatched internal copy of Vite.

---

### Task 1: Scaffold the Vite + Vue 3 + TypeScript project

**Files:**
- Create: `frontend/package.json`
- Create: `frontend/tsconfig.json`
- Create: `frontend/vite.config.ts`
- Create: `frontend/eslint.config.js`
- Create: `frontend/.gitignore`
- Create: `frontend/index.html`
- Create: `frontend/src/main.ts`
- Create: `frontend/src/App.vue`
- Create: `frontend/src/styles/tokens.css`
- Create: `frontend/src/styles/base.css`

**Interfaces:**
- Produces: a bootable Vite dev server on port 5173 proxying `/api` and
  `/uploads` to `http://localhost:3000`; `#app` mount point rendering
  `<router-view />` once the router exists (Task 5). Until then, `App.vue`
  renders a placeholder so the scaffold is independently verifiable.
- Produces: CSS custom properties on `:root` (`--color-*`, `--space-*`,
  `--radius-*`, `--shadow-*`, `--font-sans`) and two reusable utility
  classes, `.button` / `.button--primary` / `.button--block`, that every
  later view/component in this and future phases reuses.

- [ ] **Step 1: Create `frontend/package.json`**

```json
{
  "name": "pincho-party-frontend",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "vue-tsc --noEmit && vite build",
    "preview": "vite preview",
    "test": "vitest run",
    "typecheck": "vue-tsc --noEmit",
    "lint": "eslint ."
  },
  "dependencies": {
    "vue": "^3.5.42",
    "vue-router": "^4.6.4",
    "pinia": "^2.3.1",
    "@lucide/vue": "^1.47.0"
  },
  "devDependencies": {
    "@types/node": "^22.20.3",
    "@vitejs/plugin-vue": "^5.2.4",
    "@vue/test-utils": "^2.5.1",
    "eslint": "^10.10.0",
    "eslint-plugin-vue": "^10.11.0",
    "jsdom": "^25.0.1",
    "typescript": "^5.9.3",
    "typescript-eslint": "^8.70.0",
    "vite": "^5.4.21",
    "vitest": "^2.1.9",
    "vue-eslint-parser": "^10.4.1",
    "vue-tsc": "^2.2.12"
  }
}
```

- [ ] **Step 2: Install dependencies**

Run: `cd frontend && npm install`
Expected: install completes with no peer-dependency errors.

- [ ] **Step 3: Create `frontend/tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "useDefineForClassFields": true,
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "strict": true,
    "jsx": "preserve",
    "resolveJsonModule": true,
    "isolatedModules": true,
    "skipLibCheck": true,
    "noEmit": true,
    "types": ["vite/client", "node"],
    "lib": ["ES2022", "DOM", "DOM.Iterable"]
  },
  "include": ["src/**/*.ts", "src/**/*.vue", "vite.config.ts"]
}
```

- [ ] **Step 4: Create `frontend/vite.config.ts`**

```ts
import { defineConfig } from 'vitest/config';
import vue from '@vitejs/plugin-vue';

export default defineConfig({
  plugins: [vue()],
  server: {
    proxy: {
      '/api': 'http://localhost:3000',
      '/uploads': 'http://localhost:3000',
    },
  },
  test: {
    environment: 'jsdom',
  },
});
```

- [ ] **Step 5: Create `frontend/eslint.config.js`**

```js
import pluginVue from 'eslint-plugin-vue';
import vueParser from 'vue-eslint-parser';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  ...pluginVue.configs['flat/recommended'],
  ...tseslint.configs.recommended,
  {
    // typescript-eslint's recommended config sets languageOptions.parser globally
    // (no `files` filter), which otherwise clobbers vue-eslint-parser for .vue
    // files since this entry comes last in the array. Reassert both parsers here.
    files: ['**/*.vue'],
    languageOptions: {
      parser: vueParser,
      parserOptions: {
        parser: tseslint.parser,
      },
    },
  },
  {
    rules: {
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      'vue/multi-word-component-names': 'off',
    },
  },
  {
    ignores: ['dist/**', 'node_modules/**'],
  }
);
```

- [ ] **Step 6: Create `frontend/.gitignore`**

```
node_modules/
dist/
```

- [ ] **Step 7: Create `frontend/index.html`**

```html
<!doctype html>
<html lang="es">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover" />
    <title>Pincho Party</title>
  </head>
  <body>
    <div id="app"></div>
    <script type="module" src="/src/main.ts"></script>
  </body>
</html>
```

- [ ] **Step 8: Create `frontend/src/styles/tokens.css`**

```css
:root {
  --color-bg: #faf9f7;
  --color-surface: #ffffff;
  --color-text: #1f1b16;
  --color-text-muted: #6b6459;
  --color-primary: #d9480f;
  --color-primary-contrast: #ffffff;
  --color-border: #ece7e0;
  --color-gold: #c9a227;
  --color-danger: #b3261e;
  --color-success: #2e7d32;

  --radius-md: 16px;
  --radius-lg: 24px;
  --shadow-sm: 0 1px 3px rgba(31, 27, 22, 0.06), 0 1px 2px rgba(31, 27, 22, 0.04);
  --shadow-md: 0 4px 12px rgba(31, 27, 22, 0.08);

  --space-1: 4px;
  --space-2: 8px;
  --space-3: 12px;
  --space-4: 16px;
  --space-5: 24px;
  --space-6: 32px;
  --space-8: 48px;

  --font-sans: system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif;
}

@media (prefers-color-scheme: dark) {
  :root {
    --color-bg: #14110d;
    --color-surface: #1f1b16;
    --color-text: #f5f1ea;
    --color-text-muted: #b3aa9c;
    --color-border: #322c24;
  }
}
```

`--font-sans` deliberately uses the system font stack instead of a
Google Fonts import: the app must keep working on a LAN with no internet
access, and system fonts already look modern on iOS/Android/desktop.

- [ ] **Step 9: Create `frontend/src/styles/base.css`**

```css
*,
*::before,
*::after {
  box-sizing: border-box;
}

html,
body {
  margin: 0;
  padding: 0;
}

body {
  background: var(--color-bg);
  color: var(--color-text);
  font-family: var(--font-sans);
  -webkit-font-smoothing: antialiased;
}

#app {
  min-height: 100vh;
}

button {
  font-family: inherit;
}

.button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: var(--space-2);
  min-height: 48px;
  padding: 0 var(--space-5);
  border-radius: var(--radius-md);
  border: none;
  font-size: 1rem;
  font-weight: 600;
  cursor: pointer;
  transition: transform 0.05s ease, opacity 0.15s ease;
}

.button:active {
  transform: scale(0.98);
}

.button:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.button--primary {
  background: var(--color-primary);
  color: var(--color-primary-contrast);
}

.button--block {
  width: 100%;
}
```

- [ ] **Step 10: Create `frontend/src/App.vue`**

```vue
<script setup lang="ts"></script>

<template>
  <main class="scaffold-placeholder">
    Pincho Party
  </main>
</template>

<style scoped>
.scaffold-placeholder {
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 1.5rem;
  color: var(--color-text-muted);
}
</style>
```

This placeholder is replaced by `<router-view />` in Task 5, once the router
exists — keeping this task's deliverable (a booting dev server) verifiable
on its own.

- [ ] **Step 11: Create `frontend/src/main.ts`**

```ts
import { createApp } from 'vue';
import { createPinia } from 'pinia';
import App from './App.vue';
import './styles/tokens.css';
import './styles/base.css';

createApp(App).use(createPinia()).mount('#app');
```

- [ ] **Step 12: Verify the dev server boots and serves the placeholder**

Run: `cd frontend && npm run dev` (in the background)
Then: `curl -s http://localhost:5173/ | grep -o '<title>[^<]*</title>'`
Expected: `<title>Pincho Party</title>`. Stop the dev server afterward.

- [ ] **Step 13: Verify typecheck and lint pass on the scaffold**

Run: `cd frontend && npm run typecheck && npm run lint`
Expected: both exit with no errors.

- [ ] **Step 14: Commit**

```bash
git add frontend/package.json frontend/package-lock.json frontend/tsconfig.json frontend/vite.config.ts frontend/eslint.config.js frontend/.gitignore frontend/index.html frontend/src/main.ts frontend/src/App.vue frontend/src/styles/
git commit -m "Scaffold Vue 3 + Vite + TypeScript frontend"
```

---

### Task 2: `sessionStorage` persistence helper

**Files:**
- Create: `frontend/src/services/sessionStorage.ts`
- Test: `frontend/src/services/sessionStorage.test.ts`

**Interfaces:**
- Produces: `StoredSession { id: string; name: string }`,
  `loadStoredSession(): StoredSession | null`,
  `saveStoredSession(session: StoredSession): void`,
  `clearStoredSession(): void`, `getStoredUserId(): string | null`.

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect, beforeEach } from 'vitest';
import { loadStoredSession, saveStoredSession, clearStoredSession, getStoredUserId } from './sessionStorage';

beforeEach(() => localStorage.clear());

describe('sessionStorage', () => {
  it('returns null when nothing is stored', () => {
    expect(loadStoredSession()).toBeNull();
    expect(getStoredUserId()).toBeNull();
  });

  it('round-trips a saved session', () => {
    saveStoredSession({ id: 'u1', name: 'Laura' });
    expect(loadStoredSession()).toEqual({ id: 'u1', name: 'Laura' });
    expect(getStoredUserId()).toBe('u1');
  });

  it('clears a stored session', () => {
    saveStoredSession({ id: 'u1', name: 'Laura' });
    clearStoredSession();
    expect(loadStoredSession()).toBeNull();
    expect(getStoredUserId()).toBeNull();
  });

  it('treats a partially-stored session as absent', () => {
    localStorage.setItem('pinchoParty.userId', 'u1');
    expect(loadStoredSession()).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && npx vitest run src/services/sessionStorage.test.ts`
Expected: FAIL — `Cannot find module './sessionStorage'`.

- [ ] **Step 3: Create `frontend/src/services/sessionStorage.ts`**

```ts
export interface StoredSession {
  id: string;
  name: string;
}

const USER_ID_KEY = 'pinchoParty.userId';
const USER_NAME_KEY = 'pinchoParty.userName';

export function loadStoredSession(): StoredSession | null {
  const id = localStorage.getItem(USER_ID_KEY);
  const name = localStorage.getItem(USER_NAME_KEY);
  if (!id || !name) return null;
  return { id, name };
}

export function saveStoredSession(session: StoredSession): void {
  localStorage.setItem(USER_ID_KEY, session.id);
  localStorage.setItem(USER_NAME_KEY, session.name);
}

export function clearStoredSession(): void {
  localStorage.removeItem(USER_ID_KEY);
  localStorage.removeItem(USER_NAME_KEY);
}

export function getStoredUserId(): string | null {
  return localStorage.getItem(USER_ID_KEY);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd frontend && npx vitest run src/services/sessionStorage.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add frontend/src/services/sessionStorage.ts frontend/src/services/sessionStorage.test.ts
git commit -m "Add sessionStorage persistence helper"
```

---

### Task 3: `api` fetch wrapper

**Files:**
- Create: `frontend/src/services/api.ts`
- Test: `frontend/src/services/api.test.ts`

**Interfaces:**
- Consumes: `getStoredUserId` (Task 2).
- Produces: `class ApiError extends Error { status: number; code: string }`,
  `api.get<T>(path): Promise<T>`, `api.post<T>(path, json?): Promise<T>`,
  `api.patch<T>(path, json?): Promise<T>`, `api.delete<T>(path): Promise<T>`.
  Every call attaches `X-User-Id` when a session is stored; a non-2xx
  response is rejected as an `ApiError` carrying the server's `code`/
  `message` (or a generic fallback if the body isn't JSON).

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { api, ApiError } from './api';

beforeEach(() => {
  localStorage.clear();
  vi.unstubAllGlobals();
});

describe('api', () => {
  it('sends X-User-Id when a session is stored', async () => {
    localStorage.setItem('pinchoParty.userId', 'u1');
    localStorage.setItem('pinchoParty.userName', 'Laura');
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({ ok: true }) });
    vi.stubGlobal('fetch', fetchMock);

    await api.get('/api/votes/me');

    const [, options] = fetchMock.mock.calls[0];
    expect((options.headers as Headers).get('X-User-Id')).toBe('u1');
  });

  it('does not send X-User-Id when there is no session', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({}) });
    vi.stubGlobal('fetch', fetchMock);

    await api.get('/api/contest');

    const [, options] = fetchMock.mock.calls[0];
    expect((options.headers as Headers).get('X-User-Id')).toBeNull();
  });

  it('sends a JSON body and Content-Type on post()', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 201, json: async () => ({ id: 'u1' }) });
    vi.stubGlobal('fetch', fetchMock);

    await api.post('/api/users', { name: 'Laura' });

    const [, options] = fetchMock.mock.calls[0];
    expect((options.headers as Headers).get('Content-Type')).toBe('application/json');
    expect(options.body).toBe(JSON.stringify({ name: 'Laura' }));
  });

  it('throws ApiError with the server-provided code and message on failure', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 409,
      json: async () => ({ code: 'ALREADY_STARTED', message: 'El concurso ya ha empezado.' }),
    });
    vi.stubGlobal('fetch', fetchMock);

    await expect(api.post('/api/admin/contest/start')).rejects.toMatchObject({
      status: 409,
      code: 'ALREADY_STARTED',
      message: 'El concurso ya ha empezado.',
    });
  });

  it('falls back to a generic message if the error body is not JSON', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      json: async () => {
        throw new Error('not json');
      },
    });
    vi.stubGlobal('fetch', fetchMock);

    await expect(api.get('/api/contest')).rejects.toBeInstanceOf(ApiError);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && npx vitest run src/services/api.test.ts`
Expected: FAIL — `Cannot find module './api'`.

- [ ] **Step 3: Create `frontend/src/services/api.ts`**

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

interface RequestOptions {
  method?: string;
  json?: unknown;
}

async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const headers = new Headers();
  const userId = getStoredUserId();
  if (userId) headers.set('X-User-Id', userId);

  let body: string | undefined;
  if (options.json !== undefined) {
    headers.set('Content-Type', 'application/json');
    body = JSON.stringify(options.json);
  }

  const response = await fetch(path, { method: options.method ?? 'GET', headers, body });

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

export const api = {
  get: <T>(path: string) => request<T>(path),
  post: <T>(path: string, json?: unknown) => request<T>(path, { method: 'POST', json }),
  patch: <T>(path: string, json?: unknown) => request<T>(path, { method: 'PATCH', json }),
  delete: <T>(path: string) => request<T>(path, { method: 'DELETE' }),
};
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd frontend && npx vitest run src/services/api.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add frontend/src/services/api.ts frontend/src/services/api.test.ts
git commit -m "Add api fetch wrapper with X-User-Id and ApiError handling"
```

---

### Task 4: `session` Pinia store

**Files:**
- Create: `frontend/src/stores/session.ts`
- Test: `frontend/src/stores/session.test.ts`

**Interfaces:**
- Consumes: `api`, `ApiError` (Task 3), `loadStoredSession`,
  `saveStoredSession`, `clearStoredSession` (Task 2).
- Produces: `SessionUser { id: string; name: string }`,
  `useSessionStore()` exposing `user: Ref<SessionUser | null>`,
  `isRegistering: Ref<boolean>`, `registerError: Ref<string | null>`,
  `register(name: string): Promise<void>` (throws on failure, after setting
  `registerError`), `clear(): void`.

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { setActivePinia, createPinia } from 'pinia';

vi.mock('../services/api', async () => {
  const actual = await vi.importActual<typeof import('../services/api')>('../services/api');
  return { ...actual, api: { post: vi.fn() } };
});

import { api } from '../services/api';
import { ApiError } from '../services/api';
import { useSessionStore } from './session';

beforeEach(() => {
  localStorage.clear();
  setActivePinia(createPinia());
  vi.clearAllMocks();
});

describe('useSessionStore', () => {
  it('starts with no user when localStorage is empty', () => {
    const store = useSessionStore();
    expect(store.user).toBeNull();
  });

  it('loads a previously-stored session on creation', () => {
    localStorage.setItem('pinchoParty.userId', 'u1');
    localStorage.setItem('pinchoParty.userName', 'Laura');
    const store = useSessionStore();
    expect(store.user).toEqual({ id: 'u1', name: 'Laura' });
  });

  it('register() saves the user to state and localStorage on success', async () => {
    vi.mocked(api.post).mockResolvedValue({ id: 'u1', name: 'Laura' });
    const store = useSessionStore();

    await store.register('Laura');

    expect(store.user).toEqual({ id: 'u1', name: 'Laura' });
    expect(localStorage.getItem('pinchoParty.userId')).toBe('u1');
    expect(store.isRegistering).toBe(false);
  });

  it('register() surfaces a friendly message and rethrows on failure', async () => {
    vi.mocked(api.post).mockRejectedValue(new ApiError(500, 'INTERNAL_ERROR', 'Ha ocurrido un error inesperado.'));
    const store = useSessionStore();

    await expect(store.register('Laura')).rejects.toThrow();

    expect(store.user).toBeNull();
    expect(store.registerError).toBe('Ha ocurrido un error inesperado.');
    expect(store.isRegistering).toBe(false);
  });

  it('clear() removes the session from state and localStorage', async () => {
    vi.mocked(api.post).mockResolvedValue({ id: 'u1', name: 'Laura' });
    const store = useSessionStore();
    await store.register('Laura');

    store.clear();

    expect(store.user).toBeNull();
    expect(localStorage.getItem('pinchoParty.userId')).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && npx vitest run src/stores/session.test.ts`
Expected: FAIL — `Cannot find module './session'`.

- [ ] **Step 3: Create `frontend/src/stores/session.ts`**

```ts
import { ref } from 'vue';
import { defineStore } from 'pinia';
import { api, ApiError } from '../services/api';
import { loadStoredSession, saveStoredSession, clearStoredSession } from '../services/sessionStorage';

export interface SessionUser {
  id: string;
  name: string;
}

export const useSessionStore = defineStore('session', () => {
  const user = ref<SessionUser | null>(loadStoredSession());
  const isRegistering = ref(false);
  const registerError = ref<string | null>(null);

  async function register(name: string): Promise<void> {
    isRegistering.value = true;
    registerError.value = null;
    try {
      const created = await api.post<SessionUser>('/api/users', { name });
      user.value = created;
      saveStoredSession(created);
    } catch (err) {
      registerError.value =
        err instanceof ApiError ? err.message : 'No hemos podido completar tu registro.';
      throw err;
    } finally {
      isRegistering.value = false;
    }
  }

  function clear(): void {
    user.value = null;
    clearStoredSession();
  }

  return { user, isRegistering, registerError, register, clear };
});
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd frontend && npx vitest run src/stores/session.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add frontend/src/stores/session.ts frontend/src/stores/session.test.ts
git commit -m "Add session Pinia store with register/clear actions"
```

---

### Task 5: Views + router

**Files:**
- Create: `frontend/src/views/WelcomeView.vue`
- Test: `frontend/src/views/WelcomeView.test.ts`
- Create: `frontend/src/views/RegisterUserView.vue`
- Test: `frontend/src/views/RegisterUserView.test.ts`
- Create: `frontend/src/router/index.ts`
- Test: `frontend/src/router/index.test.ts`
- Modify: `frontend/src/main.ts` (install the router)
- Modify: `frontend/src/App.vue` (render `<router-view />` instead of the placeholder)

**Interfaces:**
- Consumes: `useSessionStore` (Task 4).
- Produces: named routes `welcome` (`/`) and `register` (`/registro`);
  exported `router` singleton used by `main.ts` and by
  `router/index.test.ts`.

- [ ] **Step 1: Write the failing test for `WelcomeView`**

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mount } from '@vue/test-utils';
import { setActivePinia, createPinia } from 'pinia';
import { useSessionStore } from '../stores/session';
import WelcomeView from './WelcomeView.vue';

const pushMock = vi.fn();
vi.mock('vue-router', () => ({
  useRouter: () => ({ push: pushMock }),
}));

beforeEach(() => {
  localStorage.clear();
  setActivePinia(createPinia());
  pushMock.mockClear();
});

describe('WelcomeView', () => {
  it('shows the welcome message and CTA when there is no session', () => {
    const wrapper = mount(WelcomeView);
    expect(wrapper.text()).toContain('¡Bienvenido al concurso de pinchos!');
    expect(wrapper.find('button').exists()).toBe(true);
  });

  it('navigates to the register route when the CTA is clicked', async () => {
    const wrapper = mount(WelcomeView);
    await wrapper.find('button').trigger('click');
    expect(pushMock).toHaveBeenCalledWith({ name: 'register' });
  });

  it('shows a personalised greeting when a session exists', () => {
    const session = useSessionStore();
    session.user = { id: 'u1', name: 'Laura' };
    const wrapper = mount(WelcomeView);
    expect(wrapper.text()).toContain('¡Hola, Laura!');
    expect(wrapper.find('button').exists()).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && npx vitest run src/views/WelcomeView.test.ts`
Expected: FAIL — `Cannot find module './WelcomeView.vue'`.

- [ ] **Step 3: Create `frontend/src/views/WelcomeView.vue`**

```vue
<script setup lang="ts">
import { useRouter } from 'vue-router';
import { useSessionStore } from '../stores/session';

const router = useRouter();
const session = useSessionStore();

function goToRegister(): void {
  router.push({ name: 'register' });
}
</script>

<template>
  <main class="welcome">
    <div class="welcome__card">
      <template v-if="!session.user">
        <h1 class="welcome__title">¡Bienvenido al concurso de pinchos!</h1>
        <p class="welcome__subtitle">Que empiece el picoteo.</p>
        <button class="button button--primary" type="button" @click="goToRegister">Participar</button>
      </template>
      <template v-else>
        <h1 class="welcome__title">¡Hola, {{ session.user.name }}!</h1>
        <p class="welcome__subtitle">
          Ya estás dentro del concurso. Muy pronto podrás registrar tu pincho.
        </p>
      </template>
    </div>
  </main>
</template>

<style scoped>
.welcome {
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: var(--space-5);
}

.welcome__card {
  background: var(--color-surface);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-md);
  padding: var(--space-8) var(--space-5);
  max-width: 420px;
  width: 100%;
  text-align: center;
}

.welcome__title {
  font-size: 1.75rem;
  margin: 0 0 var(--space-2);
}

.welcome__subtitle {
  color: var(--color-text-muted);
  margin: 0 0 var(--space-5);
}
</style>
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd frontend && npx vitest run src/views/WelcomeView.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Write the failing test for `RegisterUserView`**

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import { setActivePinia, createPinia } from 'pinia';
import RegisterUserView from './RegisterUserView.vue';

const pushMock = vi.fn();
vi.mock('vue-router', () => ({
  useRouter: () => ({ push: pushMock }),
}));

vi.mock('../services/api', async () => {
  const actual = await vi.importActual<typeof import('../services/api')>('../services/api');
  return { ...actual, api: { post: vi.fn() } };
});

import { api } from '../services/api';

beforeEach(() => {
  localStorage.clear();
  setActivePinia(createPinia());
  pushMock.mockClear();
  vi.clearAllMocks();
});

describe('RegisterUserView', () => {
  it('shows a validation message when submitting an empty name', async () => {
    const wrapper = mount(RegisterUserView);
    await wrapper.find('form').trigger('submit.prevent');
    expect(wrapper.text()).toContain('Escribe tu nombre');
    expect(api.post).not.toHaveBeenCalled();
  });

  it('registers and navigates to the welcome route on success', async () => {
    vi.mocked(api.post).mockResolvedValue({ id: 'u1', name: 'Laura' });
    const wrapper = mount(RegisterUserView);

    await wrapper.find('input#name').setValue('Laura');
    await wrapper.find('form').trigger('submit.prevent');
    await flushPromises();

    expect(api.post).toHaveBeenCalledWith('/api/users', { name: 'Laura' });
    expect(pushMock).toHaveBeenCalledWith({ name: 'welcome' });
  });

  it('shows a retryable error message when registration fails', async () => {
    vi.mocked(api.post).mockRejectedValue(new Error('network down'));
    const wrapper = mount(RegisterUserView);

    await wrapper.find('input#name').setValue('Laura');
    await wrapper.find('form').trigger('submit.prevent');
    await flushPromises();

    expect(wrapper.text()).toContain('No hemos podido completar tu registro.');
    expect(pushMock).not.toHaveBeenCalled();

    const button = wrapper.find('button[type="submit"]');
    expect(button.attributes('disabled')).toBeUndefined();
  });
});
```

- [ ] **Step 6: Run test to verify it fails**

Run: `cd frontend && npx vitest run src/views/RegisterUserView.test.ts`
Expected: FAIL — `Cannot find module './RegisterUserView.vue'`.

- [ ] **Step 7: Create `frontend/src/views/RegisterUserView.vue`**

```vue
<script setup lang="ts">
import { ref } from 'vue';
import { useRouter } from 'vue-router';
import { ArrowRight } from '@lucide/vue';
import { useSessionStore } from '../stores/session';

const router = useRouter();
const session = useSessionStore();
const name = ref('');
const touched = ref(false);

function trimmedName(): string {
  return name.value.trim();
}

async function onSubmit(): Promise<void> {
  touched.value = true;
  if (!trimmedName()) return;
  try {
    await session.register(trimmedName());
    router.push({ name: 'welcome' });
  } catch {
    // el mensaje de error ya queda reflejado en session.registerError
  }
}
</script>

<template>
  <main class="register">
    <form class="register__card" @submit.prevent="onSubmit">
      <h1 class="register__title">¿Cómo te llamas?</h1>
      <p class="register__subtitle">Solo necesitamos tu nombre, nada más.</p>

      <label class="register__label" for="name">Nombre</label>
      <input
        id="name"
        v-model="name"
        class="register__input"
        type="text"
        placeholder="Tu nombre"
        autocomplete="name"
        maxlength="60"
        :aria-invalid="touched && !trimmedName()"
      />
      <p v-if="touched && !trimmedName()" class="register__error" role="alert">
        Escribe tu nombre para continuar.
      </p>
      <p v-if="session.registerError" class="register__error" role="alert">
        {{ session.registerError }}
      </p>

      <button class="button button--primary button--block" type="submit" :disabled="session.isRegistering">
        <span>{{ session.isRegistering ? 'Un momento…' : 'Participar' }}</span>
        <ArrowRight :size="18" aria-hidden="true" />
      </button>
    </form>
  </main>
</template>

<style scoped>
.register {
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: var(--space-5);
}

.register__card {
  background: var(--color-surface);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-md);
  padding: var(--space-8) var(--space-5);
  max-width: 420px;
  width: 100%;
}

.register__title {
  font-size: 1.5rem;
  margin: 0 0 var(--space-1);
}

.register__subtitle {
  color: var(--color-text-muted);
  margin: 0 0 var(--space-5);
}

.register__label {
  display: block;
  font-weight: 600;
  margin-bottom: var(--space-2);
}

.register__input {
  width: 100%;
  min-height: 48px;
  padding: 0 var(--space-4);
  border-radius: var(--radius-md);
  border: 1px solid var(--color-border);
  font-size: 1rem;
  margin-bottom: var(--space-4);
}

.register__input:focus {
  outline: 2px solid var(--color-primary);
  outline-offset: 2px;
}

.register__error {
  color: var(--color-danger);
  margin: calc(var(--space-2) * -1) 0 var(--space-4);
  font-size: 0.9rem;
}
</style>
```

- [ ] **Step 8: Run test to verify it passes**

Run: `cd frontend && npx vitest run src/views/RegisterUserView.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 9: Write the failing test for the router**

```ts
import { describe, it, expect, beforeEach } from 'vitest';
import { setActivePinia, createPinia } from 'pinia';
import { useSessionStore } from '../stores/session';
import { router } from './index';

beforeEach(async () => {
  localStorage.clear();
  setActivePinia(createPinia());
  await router.push('/');
});

describe('router', () => {
  it('allows visiting /registro when there is no session', async () => {
    await router.push('/registro');
    expect(router.currentRoute.value.name).toBe('register');
  });

  it('redirects away from /registro when a session already exists', async () => {
    const session = useSessionStore();
    session.user = { id: 'u1', name: 'Laura' };
    await router.push('/registro');
    expect(router.currentRoute.value.name).toBe('welcome');
  });
});
```

- [ ] **Step 10: Run test to verify it fails**

Run: `cd frontend && npx vitest run src/router/index.test.ts`
Expected: FAIL — `Cannot find module './index'`.

- [ ] **Step 11: Create `frontend/src/router/index.ts`**

```ts
import { createRouter, createWebHistory } from 'vue-router';
import { useSessionStore } from '../stores/session';

export const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/', name: 'welcome', component: () => import('../views/WelcomeView.vue') },
    { path: '/registro', name: 'register', component: () => import('../views/RegisterUserView.vue') },
  ],
});

router.beforeEach((to) => {
  const session = useSessionStore();
  if (to.name === 'register' && session.user) {
    return { name: 'welcome' };
  }
});
```

- [ ] **Step 12: Run test to verify it passes**

Run: `cd frontend && npx vitest run src/router/index.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 13: Wire the router into the app — modify `frontend/src/main.ts`**

```ts
import { createApp } from 'vue';
import { createPinia } from 'pinia';
import App from './App.vue';
import { router } from './router';
import './styles/tokens.css';
import './styles/base.css';

createApp(App).use(createPinia()).use(router).mount('#app');
```

- [ ] **Step 14: Replace the placeholder — modify `frontend/src/App.vue`**

```vue
<script setup lang="ts"></script>

<template>
  <router-view />
</template>
```

- [ ] **Step 15: Run the full frontend test suite**

Run: `cd frontend && npx vitest run`
Expected: all test files pass (sessionStorage, api, session, WelcomeView,
RegisterUserView, router — 22 tests total).

- [ ] **Step 16: Commit**

```bash
git add frontend/src/views/ frontend/src/router/ frontend/src/main.ts frontend/src/App.vue
git commit -m "Add welcome/register views and router with post-registration guard"
```

---

### Task 6: Manual browser verification

No new files — this task exercises the real, running app end-to-end before
calling the phase done, per the "always verify UI changes in a browser"
rule.

- [ ] **Step 1: Start both dev servers**

Run (background): `cd server && npm run dev`
Run (background): `cd frontend && npm run dev`

- [ ] **Step 2: Open the app in a browser and walk the golden path**

Open `http://localhost:5173/`. Verify, in order:

1. Fresh load (no prior session) shows "¡Bienvenido al concurso de
   pinchos!" with a "Participar" button.
2. Clicking "Participar" navigates to the name form.
3. Submitting the form empty shows "Escribe tu nombre para continuar."
   and does not navigate away.
4. Typing a name and submitting shows the button read "Un momento…"
   briefly, then navigates back to `/` showing "¡Hola, `<name>`!".
5. Reloading the page keeps showing the greeting (session persisted in
   `localStorage`) instead of the welcome screen.
6. Manually navigating to `http://localhost:5173/registro` while a session
   exists immediately redirects back to `/` (router guard working live, not
   just in the unit test).

If any step fails, fix the underlying code and re-run the full step
sequence from the top before continuing — do not patch around a failure
with a workaround in the browser only.

- [ ] **Step 3: Stop both dev servers**

Stop the frontend and backend background processes started in Step 1.

---

### Task 7: Final verification pass

**Files:** none — verification only.

- [ ] **Step 1: Run typecheck, lint and tests for the frontend**

Run: `cd frontend && npm run typecheck && npm run lint && npm test`
Expected: all three succeed with zero errors.

- [ ] **Step 2: Re-run the backend suite to confirm nothing regressed**

Run: `cd server && npm test`
Expected: all 43 backend tests still pass (this phase touched no backend
code, but it's a cheap, worthwhile check before integrating).

- [ ] **Step 3: Commit only if Step 1 required fixes**

If typecheck/lint/tests were already green, there is nothing to commit here.
If you had to fix something, stage exactly those files and commit:

```bash
git add <fixed files>
git commit -m "Fix lint/typecheck issues found in final verification"
```

---

### Task 8: Wire the frontend into root scripts and update the README

**Files:**
- Modify: `package.json` (repo root)
- Modify: `README.md` (repo root)

**Interfaces:** none — project wiring and documentation only.

- [ ] **Step 1: Update the root `package.json` scripts**

```json
{
  "name": "pincho-party",
  "private": true,
  "scripts": {
    "dev": "concurrently -n server,frontend -c blue,green \"npm run dev --prefix server\" \"npm run dev --prefix frontend\"",
    "install:all": "npm install --prefix server && npm install --prefix frontend",
    "build": "npm run build --prefix frontend && npm run build --prefix server",
    "start": "npm run start --prefix server",
    "test": "npm test --prefix server && npm test --prefix frontend",
    "seed": "npm run seed --prefix server",
    "db:reset": "npm run db:reset --prefix server"
  },
  "devDependencies": {
    "concurrently": "^10.0.5"
  }
}
```

- [ ] **Step 2: Verify the combined dev script boots both servers**

Run (background): `npm run dev` (from the repo root)
Then: `curl -s -o /dev/null -w "%{http_code}\n" http://localhost:5173/`
and: `curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3000/api/contest`
Expected: both print `200`. Stop the background process afterward.

- [ ] **Step 3: Update `README.md`**

Replace the "Estado actual" note near the top:

```markdown
> **Estado actual:** el backend (API + base de datos + lógica del concurso)
> y el arranque del frontend (bienvenida + registro de participante por
> nombre) están completos y probados. El resto de pantallas del frontend
> (registro de tapas, galería, votación, resultados, admin) todavía no
> existen.
```

Update the "Desarrollo" section to mention the frontend dev server:

```markdown
## Desarrollo

```bash
npm run dev
```

Levanta backend y frontend a la vez: la API en `http://localhost:3000` y el
frontend (con recarga automática) en `http://localhost:5173`, que redirige
las peticiones `/api` y `/uploads` a la API mientras desarrollas. Abre
`http://localhost:5173` en el navegador — no `:3000` — mientras trabajas en
el frontend.

Para trabajar solo dentro de un paquete:

```bash
cd server    # o: cd frontend
npm run dev
npm test
npm run typecheck
npm run lint
```
```

- [ ] **Step 4: Commit**

```bash
git add package.json package-lock.json README.md
git commit -m "Wire frontend into root dev/build/test scripts; update README"
```

---

## End of Fase B

The app now has a real, working first screen: a guest can open it on their
phone, register with just a name, and the app remembers them across
reloads — all served through the same relative-path/proxy setup that will
carry through every later phase. Fase C (registro y fotografía de tapas)
picks up right after the welcome greeting shown in `WelcomeView`.
