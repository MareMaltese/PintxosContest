import { describe, it, expect, beforeEach } from 'vitest';
import { setActivePinia, createPinia } from 'pinia';
import { useSessionStore } from '../stores/session';
import { useContestStore } from '../stores/contest';
import { useAdminAuthStore } from '../stores/adminAuth';
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

  it('allows an anonymous visitor to reach /recuperar', async () => {
    await router.push('/recuperar');
    expect(router.currentRoute.value.name).toBe('recover-session');
  });

  it('redirects a registered visitor away from /recuperar to /pincho during REGISTRATION', async () => {
    useSessionStore().user = { id: 'u1', name: 'Laura' };
    await router.push('/recuperar');
    expect(router.currentRoute.value.name).toBe('has-entry');
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

  it('blocks an anonymous visitor from reaching /pincho, /pincho/nuevo, /galeria and /galeria/:id', async () => {
    for (const path of ['/pincho', '/pincho/nuevo', '/galeria', '/galeria/e1']) {
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

  it('lets a registered visitor reach /galeria and /galeria/:id during REGISTRATION', async () => {
    useSessionStore().user = { id: 'u1', name: 'Laura' };
    await router.push('/galeria');
    expect(router.currentRoute.value.name).toBe('gallery');
    await router.push('/galeria/e1');
    expect(router.currentRoute.value.name).toBe('entry-detail');
  });

  it('lets a registered visitor reach /galeria and /galeria/:id once voting has started', async () => {
    useSessionStore().user = { id: 'u1', name: 'Laura' };
    useContestStore().phase = 'VOTING';
    await router.push('/galeria');
    expect(router.currentRoute.value.name).toBe('gallery');
    await router.push('/galeria/e1');
    expect(router.currentRoute.value.name).toBe('entry-detail');
  });

  it('blocks an unauthenticated visitor from every admin route except /admin', async () => {
    for (const path of [
      '/admin/dashboard',
      '/admin/participantes',
      '/admin/tapas',
      '/admin/fases',
      '/admin/pinch-o-vision',
    ]) {
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
      ['/admin/pinch-o-vision', 'admin-medal-votes'],
    ] as const) {
      await router.push(path);
      expect(router.currentRoute.value.name).toBe(name);
    }
  });

  it('lets a registered visitor reach /pinch-o-vision once voting has started', async () => {
    useSessionStore().user = { id: 'u1', name: 'Laura' };
    useContestStore().phase = 'VOTING';
    await router.push('/pinch-o-vision');
    expect(router.currentRoute.value.name).toBe('medal-results');
  });

  it('blocks an anonymous visitor from /pinch-o-vision and /desempate', async () => {
    for (const path of ['/pinch-o-vision', '/desempate']) {
      await router.push(path);
      expect(router.currentRoute.value.name).toBe('welcome');
    }
  });

  it('redirects a registered visitor from the gallery to /desempate when a tiebreak round opens', async () => {
    useSessionStore().user = { id: 'u1', name: 'Laura' };
    useContestStore().phase = 'TIEBREAK';
    await router.push('/galeria');
    expect(router.currentRoute.value.name).toBe('tiebreak');
  });

  it('redirects away from /desempate to the gallery outside the TIEBREAK phase', async () => {
    useSessionStore().user = { id: 'u1', name: 'Laura' };
    useContestStore().phase = 'RESULTS';
    await router.push('/desempate');
    expect(router.currentRoute.value.name).toBe('gallery');
  });

  it('lets a registered visitor reach /mis-pinchos during REGISTRATION', async () => {
    useSessionStore().user = { id: 'u1', name: 'Laura' };
    await router.push('/mis-pinchos');
    expect(router.currentRoute.value.name).toBe('my-entries');
  });

  it('blocks an anonymous visitor from /mis-pinchos', async () => {
    await router.push('/mis-pinchos');
    expect(router.currentRoute.value.name).toBe('welcome');
  });

  it('redirects away from /mis-pinchos to /galeria once registration has closed', async () => {
    useSessionStore().user = { id: 'u1', name: 'Laura' };
    useContestStore().phase = 'VOTING';
    await router.push('/mis-pinchos');
    expect(router.currentRoute.value.name).toBe('gallery');
  });

  it('lets a registered visitor reach /mis-pinchos/:id/editar during REGISTRATION', async () => {
    useSessionStore().user = { id: 'u1', name: 'Laura' };
    await router.push('/mis-pinchos/e1/editar');
    expect(router.currentRoute.value.name).toBe('edit-entry');
  });

  it('blocks an anonymous visitor from /mis-pinchos/:id/editar', async () => {
    await router.push('/mis-pinchos/e1/editar');
    expect(router.currentRoute.value.name).toBe('welcome');
  });

  it('redirects away from /mis-pinchos/:id/editar to /galeria once registration has closed', async () => {
    useSessionStore().user = { id: 'u1', name: 'Laura' };
    useContestStore().phase = 'VOTING';
    await router.push('/mis-pinchos/e1/editar');
    expect(router.currentRoute.value.name).toBe('gallery');
  });

  it('shows the not-found page for an unknown path', async () => {
    await router.push('/esto-no-existe');
    expect(router.currentRoute.value.name).toBe('not-found');
  });
});
