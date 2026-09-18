import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import { setActivePinia, createPinia } from 'pinia';
import AdminMedalVotesView from './AdminMedalVotesView.vue';
import Icon from '../../components/common/Icon.vue';

vi.mock('vue-router', () => ({
  useRouter: () => ({ push: vi.fn() }),
}));

vi.mock('../../services/api', async () => {
  const actual = await vi.importActual<typeof import('../../services/api')>('../../services/api');
  return { ...actual, api: { ...actual.api, get: vi.fn() } };
});

import { api } from '../../services/api';

beforeEach(() => {
  setActivePinia(createPinia());
  vi.clearAllMocks();
});

describe('AdminMedalVotesView', () => {
  it('shows a loading state while fetching', async () => {
    vi.mocked(api.get).mockReturnValue(new Promise(() => {}));
    const wrapper = mount(AdminMedalVotesView);
    await flushPromises();
    expect(wrapper.text()).toContain('Cargando');
  });

  it('shows the scoreboard once loaded', async () => {
    vi.mocked(api.get).mockResolvedValue({
      standings: [
        { entryId: 'e1', number: 3, name: 'Croqueta', imagePath: 'a.webp', gold: 2, silver: 1, bronze: 0, total: 13 },
        { entryId: 'e2', number: 1, name: null, imagePath: 'b.webp', gold: 0, silver: 0, bronze: 1, total: 1 },
      ],
      pendingWorstTie: null,
    });
    const wrapper = mount(AdminMedalVotesView);
    await flushPromises();

    expect(wrapper.text()).toContain('#03');
    expect(wrapper.text()).toContain('Croqueta');
    expect(wrapper.text()).toContain('13');
    expect(wrapper.find('.admin-medal-votes__start-worst').exists()).toBe(false);

    const thumbnails = wrapper.findAll('.admin-table__thumbnail');
    expect(thumbnails).toHaveLength(2);
    expect(thumbnails[0].attributes('src')).toBe('/uploads/a.webp');
    expect(thumbnails[1].attributes('src')).toBe('/uploads/b.webp');
  });

  it('shows the tiebreak button when there is a pending tie for last place', async () => {
    vi.mocked(api.get).mockResolvedValue({
      standings: [
        { entryId: 'e1', number: 3, name: 'Croqueta', imagePath: 'a.webp', gold: 0, silver: 0, bronze: 0, total: 0 },
      ],
      pendingWorstTie: { targetRank: 4, candidateEntryIds: ['e1', 'e2'] },
    });
    const wrapper = mount(AdminMedalVotesView);
    await flushPromises();

    expect(wrapper.text()).toContain('Hay un empate en el premio al último');
    expect(wrapper.find('.admin-medal-votes__start-worst').exists()).toBe(true);
  });

  it('shows a retryable error message when loading fails', async () => {
    vi.mocked(api.get).mockRejectedValue(new Error('network down'));
    const wrapper = mount(AdminMedalVotesView);
    await flushPromises();
    expect(wrapper.text()).toContain('No hemos podido cargar el recuento.');
  });

  it('shows the skull icon only on the row of the "premio al último" winner', async () => {
    vi.mocked(api.get).mockResolvedValue({
      standings: [
        { entryId: 'e1', number: 3, name: 'Croqueta', imagePath: 'a.webp', gold: 2, silver: 1, bronze: 0, total: 13 },
        { entryId: 'e2', number: 1, name: null, imagePath: 'b.webp', gold: 0, silver: 0, bronze: 0, total: 0 },
      ],
      pendingWorstTie: null,
      worstEntryId: 'e2',
    });
    const wrapper = mount(AdminMedalVotesView);
    await flushPromises();

    const rows = wrapper.findAll('tbody tr');
    expect(rows[0].findComponent(Icon).exists()).toBe(false);
    expect(rows[1].findComponent(Icon).exists()).toBe(true);
  });
});
