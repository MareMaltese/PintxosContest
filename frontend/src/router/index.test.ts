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
