import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import { setActivePinia, createPinia } from 'pinia';
import RecoverSessionView from './RecoverSessionView.vue';

const { push } = vi.hoisted(() => ({ push: vi.fn() }));
vi.mock('vue-router', () => ({
  useRouter: () => ({ push }),
}));

vi.mock('../services/api', async () => {
  const actual = await vi.importActual<typeof import('../services/api')>('../services/api');
  return { ...actual, api: { ...actual.api, post: vi.fn() } };
});

import { api, ApiError } from '../services/api';

beforeEach(() => {
  setActivePinia(createPinia());
  vi.clearAllMocks();
});

describe('RecoverSessionView', () => {
  it('shows validation errors when submitting empty fields', async () => {
    const wrapper = mount(RecoverSessionView);
    await wrapper.find('form').trigger('submit.prevent');
    expect(wrapper.text()).toContain('Escribe tu nombre y el número de tu pincho.');
    expect(api.post).not.toHaveBeenCalled();
  });

  it('recovers the session and navigates on success', async () => {
    vi.mocked(api.post).mockResolvedValue({ id: 'u1', name: 'Laura' });
    const wrapper = mount(RecoverSessionView);

    await wrapper.find('input#recover-name').setValue('Laura');
    await wrapper.find('input#recover-number').setValue('7');
    await wrapper.find('form').trigger('submit.prevent');
    await flushPromises();

    expect(api.post).toHaveBeenCalledWith('/api/users/recover', { name: 'Laura', number: 7 });
    expect(push).toHaveBeenCalledWith({ name: 'welcome' });
  });

  it('shows the server error message on failure', async () => {
    vi.mocked(api.post).mockRejectedValue(
      new ApiError(404, 'RECOVERY_NOT_FOUND', 'No hemos encontrado esa combinación de nombre y número de pincho.')
    );
    const wrapper = mount(RecoverSessionView);

    await wrapper.find('input#recover-name').setValue('Laura');
    await wrapper.find('input#recover-number').setValue('7');
    await wrapper.find('form').trigger('submit.prevent');
    await flushPromises();

    expect(wrapper.text()).toContain('No hemos encontrado esa combinación de nombre y número de pincho.');
    expect(push).not.toHaveBeenCalled();
  });
});
