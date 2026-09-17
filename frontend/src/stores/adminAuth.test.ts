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
