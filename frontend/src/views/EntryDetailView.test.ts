import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import { setActivePinia, createPinia } from 'pinia';
import EntryDetailView from './EntryDetailView.vue';

const { push } = vi.hoisted(() => ({ push: vi.fn() }));
vi.mock('vue-router', () => ({
  useRoute: () => ({ params: { id: 'e1' } }),
  useRouter: () => ({ push }),
}));

vi.mock('../services/api', async () => {
  const actual = await vi.importActual<typeof import('../services/api')>('../services/api');
  return { ...actual, api: { ...actual.api, get: vi.fn(), post: vi.fn(), delete: vi.fn() } };
});

import { api } from '../services/api';
import { useContestStore } from '../stores/contest';
import { useSessionStore } from '../stores/session';

function mockEntry(overrides: Partial<{ creatorId: string }> = {}) {
  return {
    id: 'e1',
    number: 7,
    creatorId: 'u1',
    creatorName: 'Laura',
    name: 'Croqueta',
    description: 'Mini brioche de carrillera.',
    imagePath: 'a.webp',
    createdAt: 'x',
    ...overrides,
  };
}

beforeEach(() => {
  setActivePinia(createPinia());
  vi.clearAllMocks();
});

describe('EntryDetailView', () => {
  it('shows a loading state initially', async () => {
    vi.mocked(api.get).mockReturnValue(new Promise(() => {}));
    const wrapper = mount(EntryDetailView);
    await flushPromises();
    expect(wrapper.text()).toContain('Cargando');
  });

  it('shows the entry details once loaded', async () => {
    vi.mocked(api.get).mockResolvedValue({
      id: 'e1',
      number: 7,
      creatorId: 'u1',
      creatorName: 'Laura',
      name: 'Croqueta',
      description: 'Mini brioche de carrillera.',
      imagePath: 'a.webp',
      createdAt: 'x',
    });
    const wrapper = mount(EntryDetailView);
    await flushPromises();

    expect(wrapper.text()).toContain('#07');
    expect(wrapper.text()).toContain('Croqueta');
    expect(wrapper.text()).toContain('Mini brioche de carrillera.');
    expect(wrapper.text()).toContain('Presentado por Laura');
  });

  it('omits the name/description when the entry has none', async () => {
    vi.mocked(api.get).mockResolvedValue({
      id: 'e1',
      number: 3,
      creatorId: 'u1',
      creatorName: 'Miguel',
      name: null,
      description: null,
      imagePath: 'a.webp',
      createdAt: 'x',
    });
    const wrapper = mount(EntryDetailView);
    await flushPromises();

    expect(wrapper.text()).toContain('#03');
    expect(wrapper.text()).toContain('Presentado por Miguel');
  });

  it('shows a retryable error message when loading fails', async () => {
    vi.mocked(api.get).mockRejectedValue(new Error('network down'));
    const wrapper = mount(EntryDetailView);
    await flushPromises();

    expect(wrapper.text()).toContain('No hemos podido cargar esta tapa.');
  });

  it('shows the favorite button and counter during VOTING', async () => {
    vi.mocked(api.get).mockImplementation((path: string) =>
      path === '/api/votes/me' ? Promise.resolve({ entryIds: [], limit: 3 }) : Promise.resolve(mockEntry())
    );
    useContestStore().phase = 'VOTING';
    useSessionStore().user = { id: 'me', name: 'Yo' };
    const wrapper = mount(EntryDetailView);
    await flushPromises();

    expect(wrapper.text()).toContain('0 / 3 favoritos');
    expect(wrapper.text()).toContain('Me encanta!');
  });

  it('hides voting UI outside the VOTING phase', async () => {
    vi.mocked(api.get).mockImplementation((path: string) =>
      path === '/api/votes/me' ? Promise.resolve({ entryIds: [], limit: 3 }) : Promise.resolve(mockEntry())
    );
    useContestStore().phase = 'RESULTS';
    useSessionStore().user = { id: 'me', name: 'Yo' };
    const wrapper = mount(EntryDetailView);
    await flushPromises();

    expect(wrapper.text()).not.toContain('favoritos');
    expect(wrapper.find('button.button--secondary').exists()).toBe(false);
  });

  it('disables voting on your own entry when self-vote is not allowed', async () => {
    vi.mocked(api.get).mockImplementation((path: string) =>
      path === '/api/votes/me' ? Promise.resolve({ entryIds: [], limit: 3 }) : Promise.resolve(mockEntry({ creatorId: 'me' }))
    );
    const contest = useContestStore();
    contest.phase = 'VOTING';
    contest.allowSelfVote = false;
    useSessionStore().user = { id: 'me', name: 'Yo' };
    const wrapper = mount(EntryDetailView);
    await flushPromises();

    expect(wrapper.text()).toContain('No puedes votar tu propio pincho.');
    expect(wrapper.find('button.button--secondary').exists()).toBe(false);
  });

  it('closing the detail view navigates back to the gallery', async () => {
    vi.mocked(api.get).mockImplementation((path: string) =>
      path === '/api/votes/me' ? Promise.resolve({ entryIds: [], limit: 3 }) : Promise.resolve(mockEntry())
    );
    const wrapper = mount(EntryDetailView);
    await flushPromises();

    await wrapper.find('.entry-detail__close').trigger('click');

    expect(push).toHaveBeenCalledWith({ name: 'gallery' });
  });
});
