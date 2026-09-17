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
    await router.push('/registro');
    useSessionStore().user = { id: 'u1', name: 'Laura' };
    await router.push('/');
    expect(router.currentRoute.value.name).toBe('has-entry');
  });

  it('redirects a registered visitor away from / to /esperando once voting has started', async () => {
    await router.push('/registro');
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
