import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import { setActivePinia, createPinia } from 'pinia';
import FavoriteButton from './FavoriteButton.vue';
import { useVotesStore } from '../../stores/votes';
import { useEntriesStore } from '../../stores/entries';

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

  it('warns instead of favoriting when the 3 allowed favorites are already used', async () => {
    const votes = useVotesStore();
    votes.loaded = true;
    votes.limit = 3;
    votes.favoriteIds = new Set(['a', 'b', 'c']);
    useEntriesStore().list = [
      { id: 'a', number: 1, creatorId: 'u1', name: 'Croqueta', description: null, imagePath: 'a.webp', createdAt: 'x' },
      { id: 'b', number: 2, creatorId: 'u2', name: null, description: null, imagePath: 'b.webp', createdAt: 'x' },
      { id: 'c', number: 3, creatorId: 'u3', name: 'Tortilla', description: null, imagePath: 'c.webp', createdAt: 'x' },
    ];
    const wrapper = mount(FavoriteButton, { props: { entryId: 'e4' } });

    await wrapper.find('button').trigger('click');
    await flushPromises();

    expect(api.post).not.toHaveBeenCalled();
    expect(wrapper.find('.favorite-button__limit .icon').exists()).toBe(true);
    const rows = wrapper.findAll('.favorite-button__limit-row');
    expect(rows).toHaveLength(3);
    expect(rows[0].text()).toContain('#01');
    expect(rows[0].text()).toContain('Croqueta');
  });

  it('swaps a favorite when one of the listed entries is chosen', async () => {
    const votes = useVotesStore();
    votes.loaded = true;
    votes.limit = 3;
    votes.favoriteIds = new Set(['a', 'b', 'c']);
    useEntriesStore().list = [
      { id: 'a', number: 1, creatorId: 'u1', name: 'Croqueta', description: null, imagePath: 'a.webp', createdAt: 'x' },
      { id: 'b', number: 2, creatorId: 'u2', name: null, description: null, imagePath: 'b.webp', createdAt: 'x' },
      { id: 'c', number: 3, creatorId: 'u3', name: 'Tortilla', description: null, imagePath: 'c.webp', createdAt: 'x' },
    ];
    vi.mocked(api.delete).mockResolvedValue({ ok: true });
    vi.mocked(api.post).mockResolvedValue({ ok: true });
    const wrapper = mount(FavoriteButton, { props: { entryId: 'e4' } });
    await wrapper.find('button').trigger('click');
    await flushPromises();

    await wrapper.findAll('.favorite-button__limit-swap')[0].trigger('click');
    await flushPromises();

    expect(api.delete).toHaveBeenCalledWith('/api/votes/a');
    expect(api.post).toHaveBeenCalledWith('/api/votes', { entryId: 'e4' });
    expect(wrapper.find('.favorite-button__limit').exists()).toBe(false);
  });

  it('dismisses the limit warning without changing any favorite', async () => {
    const votes = useVotesStore();
    votes.loaded = true;
    votes.limit = 3;
    votes.favoriteIds = new Set(['a', 'b', 'c']);
    useEntriesStore().list = [
      { id: 'a', number: 1, creatorId: 'u1', name: 'Croqueta', description: null, imagePath: 'a.webp', createdAt: 'x' },
      { id: 'b', number: 2, creatorId: 'u2', name: null, description: null, imagePath: 'b.webp', createdAt: 'x' },
      { id: 'c', number: 3, creatorId: 'u3', name: 'Tortilla', description: null, imagePath: 'c.webp', createdAt: 'x' },
    ];
    const wrapper = mount(FavoriteButton, { props: { entryId: 'e4' } });
    await wrapper.find('button').trigger('click');
    await flushPromises();

    await wrapper.find('.favorite-button__limit-cancel').trigger('click');

    expect(api.post).not.toHaveBeenCalled();
    expect(api.delete).not.toHaveBeenCalled();
    expect(wrapper.find('.favorite-button__limit').exists()).toBe(false);
  });
});
