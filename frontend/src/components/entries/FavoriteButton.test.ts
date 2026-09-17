import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import { setActivePinia, createPinia } from 'pinia';
import FavoriteButton from './FavoriteButton.vue';

vi.mock('../../services/api', async () => {
  const actual = await vi.importActual<typeof import('../../services/api')>('../../services/api');
  return { ...actual, api: { ...actual.api, get: vi.fn(), post: vi.fn(), delete: vi.fn() } };
});

import { api } from '../../services/api';

beforeEach(() => {
  setActivePinia(createPinia());
  vi.clearAllMocks();
  vi.mocked(api.get).mockResolvedValue({ entryIds: [], limit: 3 });
});

describe('FavoriteButton', () => {
  it('shows "Me encanta!" when not favorited', () => {
    const wrapper = mount(FavoriteButton, { props: { entryId: 'e1' } });
    expect(wrapper.text()).toContain('Me encanta!');
  });

  it('calls the API and flips to "Ya no tanto!" on click', async () => {
    vi.mocked(api.post).mockResolvedValue({ ok: true });
    const wrapper = mount(FavoriteButton, { props: { entryId: 'e1' } });

    await wrapper.find('button').trigger('click');
    await flushPromises();

    expect(api.post).toHaveBeenCalledWith('/api/votes', { entryId: 'e1' });
    expect(wrapper.text()).toContain('Ya no tanto!');
  });

  it('disables the button while the request is in flight', async () => {
    vi.mocked(api.post).mockReturnValue(new Promise(() => {}));
    const wrapper = mount(FavoriteButton, { props: { entryId: 'e1' } });

    await wrapper.find('button').trigger('click');

    expect((wrapper.find('button').element as HTMLButtonElement).disabled).toBe(true);
  });

  it('shows the disabled reason instead of a clickable button when disabled', () => {
    const wrapper = mount(FavoriteButton, {
      props: { entryId: 'e1', disabled: true, disabledReason: 'No puedes votar tu propio pincho.' },
    });

    expect(wrapper.find('button').exists()).toBe(false);
    expect(wrapper.text()).toContain('No puedes votar tu propio pincho.');
  });

  it('shows the store error message after a failed toggle', async () => {
    vi.mocked(api.post).mockRejectedValue(new Error('boom'));
    const wrapper = mount(FavoriteButton, { props: { entryId: 'e1' } });

    await wrapper.find('button').trigger('click');
    await flushPromises();

    expect(wrapper.text()).toContain('No hemos podido guardar tu voto.');
  });
});
