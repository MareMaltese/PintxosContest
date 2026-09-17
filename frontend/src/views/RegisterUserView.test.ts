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
