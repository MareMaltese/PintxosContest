import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import { setActivePinia, createPinia } from 'pinia';
import GalleryView from './GalleryView.vue';

const pushMock = vi.fn();
vi.mock('vue-router', () => ({
  useRouter: () => ({ push: pushMock }),
}));

vi.mock('../composables/useHeartbeat', () => ({
  useHeartbeat: vi.fn(),
}));

vi.mock('../services/api', async () => {
  const actual = await vi.importActual<typeof import('../services/api')>('../services/api');
  return { ...actual, api: { ...actual.api, get: vi.fn() } };
});

import { api } from '../services/api';
import { useContestStore } from '../stores/contest';

beforeEach(() => {
  setActivePinia(createPinia());
  pushMock.mockClear();
  vi.clearAllMocks();
});

describe('GalleryView', () => {
  it('shows a loading state while fetching', async () => {
    vi.mocked(api.get).mockReturnValue(new Promise(() => {}));
    const wrapper = mount(GalleryView);
    // onMounted sets isLoadingList synchronously, but the DOM only reflects
    // it after the next reactivity flush.
    await flushPromises();
    expect(wrapper.text()).toContain('Cargando');
  });

  it('renders a card with the padded number for each entry', async () => {
    vi.mocked(api.get).mockResolvedValue([
      { id: 'e1', number: 1, creatorId: 'u1', name: null, description: null, imagePath: 'a.webp', createdAt: 'x' },
      { id: 'e2', number: 2, creatorId: 'u2', name: null, description: null, imagePath: 'b.webp', createdAt: 'x' },
    ]);
    const wrapper = mount(GalleryView);
    await flushPromises();

    expect(wrapper.findAll('.gallery__card')).toHaveLength(2);
    expect(wrapper.text()).toContain('#01');
    expect(wrapper.text()).toContain('#02');
  });

  it('navigates to the entry detail when a card is clicked', async () => {
    vi.mocked(api.get).mockResolvedValue([
      { id: 'e1', number: 1, creatorId: 'u1', name: null, description: null, imagePath: 'a.webp', createdAt: 'x' },
    ]);
    const wrapper = mount(GalleryView);
    await flushPromises();

    await wrapper.find('.gallery__card').trigger('click');

    expect(pushMock).toHaveBeenCalledWith({ name: 'entry-detail', params: { id: 'e1' } });
  });

  it('shows a retryable error message when loading fails', async () => {
    vi.mocked(api.get).mockRejectedValue(new Error('network down'));
    const wrapper = mount(GalleryView);
    await flushPromises();
    expect(wrapper.text()).toContain('No hemos podido cargar la galería.');
  });

  it('shows an empty state when there are no entries yet', async () => {
    vi.mocked(api.get).mockResolvedValue([]);
    const wrapper = mount(GalleryView);
    await flushPromises();
    expect(wrapper.text()).toContain('Todavía no hay tapas registradas.');
  });

  it('shows the favorite counter during VOTING', async () => {
    vi.mocked(api.get).mockImplementation((path: string) =>
      path === '/api/votes/me' ? Promise.resolve({ entryIds: [], limit: 3 }) : Promise.resolve([])
    );
    useContestStore().phase = 'VOTING';
    const wrapper = mount(GalleryView);
    await flushPromises();

    expect(wrapper.text()).toContain('0 / 3 favoritos');
  });

  it('hides the favorite counter outside VOTING', async () => {
    vi.mocked(api.get).mockImplementation((path: string) =>
      path === '/api/votes/me' ? Promise.resolve({ entryIds: [], limit: 3 }) : Promise.resolve([])
    );
    useContestStore().phase = 'TIEBREAK';
    const wrapper = mount(GalleryView);
    await flushPromises();

    expect(wrapper.text()).not.toContain('favoritos');
  });
});
