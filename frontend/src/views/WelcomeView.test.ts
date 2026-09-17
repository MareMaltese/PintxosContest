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

  it('does not render a cover image when none has been provided', () => {
    const wrapper = mount(WelcomeView);
    expect(wrapper.find('.welcome__cover').exists()).toBe(false);
  });
});
