import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mount } from '@vue/test-utils';
import NotFoundView from './NotFoundView.vue';

const { push } = vi.hoisted(() => ({ push: vi.fn() }));
vi.mock('vue-router', () => ({
  useRouter: () => ({ push }),
}));

beforeEach(() => {
  push.mockClear();
});

describe('NotFoundView', () => {
  it('shows a not-found message', () => {
    const wrapper = mount(NotFoundView);
    expect(wrapper.text()).toContain('404');
  });

  it('navigates home when the button is clicked', async () => {
    const wrapper = mount(NotFoundView);
    await wrapper.find('.not-found__home').trigger('click');
    expect(push).toHaveBeenCalledWith({ name: 'welcome' });
  });
});
