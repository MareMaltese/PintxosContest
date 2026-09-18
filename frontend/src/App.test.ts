import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mount } from '@vue/test-utils';
import { setActivePinia, createPinia } from 'pinia';
import App from './App.vue';
import NavFooter from './components/common/NavFooter.vue';

const routeMock = { name: 'gallery' as string };
vi.mock('vue-router', () => ({
  useRoute: () => routeMock,
  useRouter: () => ({ push: vi.fn(), back: vi.fn() }),
}));

beforeEach(() => {
  setActivePinia(createPinia());
});

function mountApp() {
  return mount(App, { global: { stubs: { RouterView: true } } });
}

describe('App', () => {
  it('shows the footer nav on a session-required route', () => {
    routeMock.name = 'gallery';
    expect(mountApp().findComponent(NavFooter).exists()).toBe(true);
  });

  it('hides the footer nav on the welcome screen', () => {
    routeMock.name = 'welcome';
    expect(mountApp().findComponent(NavFooter).exists()).toBe(false);
  });

  it('hides the footer nav on the register screen', () => {
    routeMock.name = 'register';
    expect(mountApp().findComponent(NavFooter).exists()).toBe(false);
  });

  it('hides the footer nav on admin routes', () => {
    routeMock.name = 'admin-dashboard';
    expect(mountApp().findComponent(NavFooter).exists()).toBe(false);
  });
});
