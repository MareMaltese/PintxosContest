import { describe, it, expect, vi, beforeEach } from 'vitest';
import { setActivePinia, createPinia } from 'pinia';

vi.mock('../services/api', async () => {
  const actual = await vi.importActual<typeof import('../services/api')>('../services/api');
  return { ...actual, api: { post: vi.fn() } };
});

import { api, ApiError } from '../services/api';
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

  it('recover() saves the user to state and localStorage on success', async () => {
    vi.mocked(api.post).mockResolvedValue({ id: 'u1', name: 'Laura' });
    const store = useSessionStore();

    await store.recover('Laura', 7);

    expect(api.post).toHaveBeenCalledWith('/api/users/recover', { name: 'Laura', number: 7 });
    expect(store.user).toEqual({ id: 'u1', name: 'Laura' });
    expect(localStorage.getItem('pinchoParty.userId')).toBe('u1');
    expect(store.isRecovering).toBe(false);
  });

  it('recover() surfaces a friendly message and rethrows on failure', async () => {
    vi.mocked(api.post).mockRejectedValue(
      new ApiError(404, 'RECOVERY_NOT_FOUND', 'No hemos encontrado esa combinación de nombre y número de pincho.')
    );
    const store = useSessionStore();

    await expect(store.recover('Laura', 7)).rejects.toThrow();

    expect(store.user).toBeNull();
    expect(store.recoverError).toBe('No hemos encontrado esa combinación de nombre y número de pincho.');
    expect(store.isRecovering).toBe(false);
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
