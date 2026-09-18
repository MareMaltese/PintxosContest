import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
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
import { useSessionStore } from '../stores/session';

beforeEach(() => {
  localStorage.clear();
  setActivePinia(createPinia());
  pushMock.mockClear();
  vi.clearAllMocks();
});

afterEach(() => {
  vi.useRealTimers();
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

  it('hides the favorite counter when votingMode is MEDALS', async () => {
    vi.mocked(api.get).mockImplementation((path: string) =>
      path === '/api/votes/me' ? Promise.resolve({ entryIds: [], limit: 3 }) : Promise.resolve([])
    );
    const contest = useContestStore();
    contest.phase = 'VOTING';
    contest.votingMode = 'MEDALS';
    const wrapper = mount(GalleryView);
    await flushPromises();

    expect(wrapper.text()).not.toContain('favoritos');
  });

  it('highlights cards that are already favorited', async () => {
    vi.mocked(api.get).mockImplementation((path: string) =>
      path === '/api/votes/me'
        ? Promise.resolve({ entryIds: ['e1'], limit: 3 })
        : Promise.resolve([
            { id: 'e1', number: 1, creatorId: 'u1', name: null, description: null, imagePath: 'a.webp', createdAt: 'x' },
            { id: 'e2', number: 2, creatorId: 'u2', name: null, description: null, imagePath: 'b.webp', createdAt: 'x' },
          ])
    );
    const wrapper = mount(GalleryView);
    await flushPromises();

    const cards = wrapper.findAll('.gallery__card');
    expect(cards[0].classes()).toContain('gallery__card--favorite');
    expect(cards[1].classes()).not.toContain('gallery__card--favorite');
  });

  it('marks your own entries with a black border, in any phase', async () => {
    useSessionStore().user = { id: 'me', name: 'Laura' };
    vi.mocked(api.get).mockResolvedValue([
      { id: 'e1', number: 1, creatorId: 'me', name: null, description: null, imagePath: 'a.webp', createdAt: 'x' },
      { id: 'e2', number: 2, creatorId: 'other', name: null, description: null, imagePath: 'b.webp', createdAt: 'x' },
    ]);
    const wrapper = mount(GalleryView);
    await flushPromises();

    const cards = wrapper.findAll('.gallery__card');
    expect(cards[0].classes()).toContain('gallery__card--own');
    expect(cards[1].classes()).not.toContain('gallery__card--own');
  });

  it('shows a pencil overlay on your own entries during REGISTRATION and edits on click', async () => {
    useSessionStore().user = { id: 'me', name: 'Laura' };
    vi.mocked(api.get).mockResolvedValue([
      { id: 'e1', number: 1, creatorId: 'me', name: null, description: null, imagePath: 'a.webp', createdAt: 'x' },
    ]);
    const wrapper = mount(GalleryView);
    await flushPromises();

    expect(wrapper.find('.gallery__own-overlay').exists()).toBe(true);
    await wrapper.find('.gallery__card').trigger('click');
    expect(pushMock).toHaveBeenCalledWith({ name: 'edit-entry', params: { id: 'e1' } });
  });

  it('shows a lock overlay on your own entries once voting starts if self-vote is disallowed', async () => {
    useSessionStore().user = { id: 'me', name: 'Laura' };
    const contest = useContestStore();
    contest.phase = 'VOTING';
    contest.allowSelfVote = false;
    vi.mocked(api.get).mockImplementation((path: string) =>
      path === '/api/votes/me'
        ? Promise.resolve({ entryIds: [], limit: 3 })
        : Promise.resolve([
            { id: 'e1', number: 1, creatorId: 'me', name: null, description: null, imagePath: 'a.webp', createdAt: 'x' },
          ])
    );
    const wrapper = mount(GalleryView);
    await flushPromises();

    expect(wrapper.find('.gallery__own-overlay').exists()).toBe(true);
    await wrapper.find('.gallery__card').trigger('click');
    expect(pushMock).toHaveBeenCalledWith({ name: 'entry-detail', params: { id: 'e1' } });
  });

  it('shows no overlay on your own entries once voting starts if self-vote is allowed', async () => {
    useSessionStore().user = { id: 'me', name: 'Laura' };
    const contest = useContestStore();
    contest.phase = 'VOTING';
    contest.allowSelfVote = true;
    vi.mocked(api.get).mockImplementation((path: string) =>
      path === '/api/votes/me'
        ? Promise.resolve({ entryIds: [], limit: 3 })
        : Promise.resolve([
            { id: 'e1', number: 1, creatorId: 'me', name: null, description: null, imagePath: 'a.webp', createdAt: 'x' },
          ])
    );
    const wrapper = mount(GalleryView);
    await flushPromises();

    expect(wrapper.find('.gallery__own-overlay').exists()).toBe(false);
    expect(wrapper.find('.gallery__card').classes()).toContain('gallery__card--own');
  });

  it('rings a card gold/silver/bronze and shows a medal badge in MEDALS mode', async () => {
    const contest = useContestStore();
    contest.phase = 'VOTING';
    contest.votingMode = 'MEDALS';
    vi.mocked(api.get).mockImplementation((path: string) =>
      path === '/api/medal-votes/me'
        ? Promise.resolve({ gold: 'e1', silver: null, bronze: null })
        : Promise.resolve([
            { id: 'e1', number: 1, creatorId: 'u1', name: null, description: null, imagePath: 'a.webp', createdAt: 'x' },
            { id: 'e2', number: 2, creatorId: 'u2', name: null, description: null, imagePath: 'b.webp', createdAt: 'x' },
          ])
    );
    const wrapper = mount(GalleryView);
    await flushPromises();

    const cards = wrapper.findAll('.gallery__card');
    expect(cards[0].classes()).toContain('gallery__card--gold');
    expect(cards[0].find('.gallery__medal-badge').exists()).toBe(true);
    expect(cards[1].classes()).not.toContain('gallery__card--gold');
    expect(cards[1].find('.gallery__medal-badge').exists()).toBe(false);
  });

  it('refreshes the list when the refresh button is clicked', async () => {
    vi.mocked(api.get).mockResolvedValue([]);
    const wrapper = mount(GalleryView);
    await flushPromises();
    vi.mocked(api.get).mockClear();

    await wrapper.find('.gallery__refresh').trigger('click');
    await flushPromises();

    expect(api.get).toHaveBeenCalledWith('/api/entries');
  });

  it('warns instead of refreshing again if clicked too soon', async () => {
    vi.useFakeTimers();
    vi.mocked(api.get).mockResolvedValue([]);
    const wrapper = mount(GalleryView);
    await flushPromises();

    await wrapper.find('.gallery__refresh').trigger('click');
    vi.mocked(api.get).mockClear();
    await wrapper.find('.gallery__refresh').trigger('click');
    await flushPromises();

    expect(api.get).not.toHaveBeenCalled();
    expect(wrapper.text()).toContain('No me satures');
  });

  it('allows refreshing again once the cooldown has passed', async () => {
    vi.useFakeTimers();
    vi.mocked(api.get).mockResolvedValue([]);
    const wrapper = mount(GalleryView);
    await flushPromises();

    await wrapper.find('.gallery__refresh').trigger('click');
    vi.advanceTimersByTime(3100);
    vi.mocked(api.get).mockClear();
    await wrapper.find('.gallery__refresh').trigger('click');
    await flushPromises();

    expect(api.get).toHaveBeenCalledWith('/api/entries');
  });

  it('flashes a full-screen dark overlay briefly when refresh is clicked', async () => {
    vi.useFakeTimers();
    vi.mocked(api.get).mockResolvedValue([]);
    const wrapper = mount(GalleryView);
    await flushPromises();

    await wrapper.find('.gallery__refresh').trigger('click');
    await flushPromises();
    expect(wrapper.find('.gallery__flash-overlay').exists()).toBe(true);

    vi.advanceTimersByTime(500);
    await wrapper.vm.$nextTick();
    expect(wrapper.find('.gallery__flash-overlay').exists()).toBe(false);
  });

  it('does not flash the overlay for a throttled click', async () => {
    vi.useFakeTimers();
    vi.mocked(api.get).mockResolvedValue([]);
    const wrapper = mount(GalleryView);
    await flushPromises();

    await wrapper.find('.gallery__refresh').trigger('click');
    vi.advanceTimersByTime(500);
    await wrapper.vm.$nextTick();

    await wrapper.find('.gallery__refresh').trigger('click');
    await wrapper.vm.$nextTick();
    expect(wrapper.find('.gallery__flash-overlay').exists()).toBe(false);
  });

  it('badges the "premio al último" winner once results are out', async () => {
    vi.mocked(api.get).mockImplementation((path: string) =>
      path === '/api/medal-votes/results'
        ? Promise.resolve({ worstEntryId: 'e2' })
        : Promise.resolve([
            { id: 'e1', number: 1, creatorId: 'u1', name: null, description: null, imagePath: 'a.webp', createdAt: 'x' },
            { id: 'e2', number: 2, creatorId: 'u2', name: null, description: null, imagePath: 'b.webp', createdAt: 'x' },
          ])
    );
    const contest = useContestStore();
    contest.phase = 'RESULTS';
    const wrapper = mount(GalleryView);
    await flushPromises();

    const cards = wrapper.findAll('.gallery__card');
    expect(cards[0].find('.gallery__medal-badge--worst').exists()).toBe(false);
    expect(cards[1].find('.gallery__medal-badge--worst').exists()).toBe(true);
  });
});
