import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import { setActivePinia, createPinia } from 'pinia';
import RankingView from './RankingView.vue';

vi.mock('../composables/useHeartbeat', () => ({
  useHeartbeat: vi.fn(),
}));

vi.mock('../services/api', async () => {
  const actual = await vi.importActual<typeof import('../services/api')>('../services/api');
  return { ...actual, api: { ...actual.api, get: vi.fn(), put: vi.fn() } };
});

import { api } from '../services/api';
import { useContestStore } from '../stores/contest';
import { useSessionStore } from '../stores/session';

const ENTRIES = [1, 2, 3, 4, 5].map((n) => ({
  id: `e${n}`,
  number: n,
  creatorId: `u${n}`,
  name: n === 5 ? null : `Pincho ${n}`,
  description: null,
  imagePath: `${n}.webp`,
  createdAt: 'x',
}));

function mockApi(savedOrder: string[]): void {
  vi.mocked(api.get).mockImplementation(async (path: string) => {
    if (path === '/api/entries') return ENTRIES;
    if (path === '/api/ranking-votes/me') return { entryIds: savedOrder };
    throw new Error(`unexpected GET ${path}`);
  });
}

beforeEach(() => {
  localStorage.clear();
  setActivePinia(createPinia());
  vi.clearAllMocks();
  useSessionStore().user = { id: 'u1', name: 'Laura' };
  useContestStore().phase = 'VOTING';
  useContestStore().votingMode = 'RANKING';
});

describe('RankingView', () => {
  it('lists votable entries in the saved order with photo, name and number, leaving out the own entry', async () => {
    mockApi(['e4', 'e2', 'e5', 'e3']);
    const wrapper = mount(RankingView);
    await flushPromises();

    const items = wrapper.findAll('.ranking__item');
    expect(items.map((i) => i.find('.ranking__number').text())).toEqual(['#04', '#02', '#05', '#03']);
    expect(items[0].find('.ranking__name').text()).toBe('Pincho 4');
    expect(items[0].find('img').attributes('src')).toBe('/uploads/4.webp');
    expect(items[2].find('.ranking__name').text()).toBe('Sin nombre');
    expect(wrapper.text()).toContain('Tu pincho no aparece');
  });

  it('marks the first three with gold, silver and bronze borders and medals', async () => {
    mockApi(['e4', 'e2', 'e5', 'e3']);
    const wrapper = mount(RankingView);
    await flushPromises();

    const items = wrapper.findAll('.ranking__item');
    expect(items[0].classes()).toContain('ranking__item--gold');
    expect(items[1].classes()).toContain('ranking__item--silver');
    expect(items[2].classes()).toContain('ranking__item--bronze');
    expect(items[0].find('.ranking__badge--gold').exists()).toBe(true);
    expect(items[3].find('.ranking__position').text()).toBe('4º');
  });

  it('shows the instructions, and the worst-prize warning only when that prize is on', async () => {
    mockApi([]);
    const wrapper = mount(RankingView);
    await flushPromises();
    expect(wrapper.text()).toContain('Ordénalos según tu gusto, de mejor a peor.');
    expect(wrapper.text()).not.toContain('premio para el último');

    useContestStore().worstPrizeEnabled = true;
    await flushPromises();
    expect(wrapper.text()).toContain('¡Ten en cuenta que hay premio para el último!');
    expect(wrapper.findAll('.ranking__item').at(-1)!.classes()).toContain('ranking__item--last');
  });

  it('offers to save the default order when nothing was saved yet', async () => {
    mockApi([]);
    vi.mocked(api.put).mockResolvedValue({ ok: true });
    const wrapper = mount(RankingView);
    await flushPromises();

    await wrapper.find('.ranking__save').trigger('click');
    await flushPromises();

    expect(api.put).toHaveBeenCalledWith('/api/ranking-votes/me', { entryIds: ['e2', 'e3', 'e4', 'e5'] });
    expect(wrapper.find('.ranking__save').exists()).toBe(false);
    expect(wrapper.text()).toContain('Clasificación guardada');
  });

  it('is read-only after voting', async () => {
    useContestStore().phase = 'RESULTS';
    mockApi(['e4', 'e2', 'e5', 'e3']);
    const wrapper = mount(RankingView);
    await flushPromises();

    expect(wrapper.text()).toContain('La votación ha terminado');
    expect(wrapper.find('.ranking__grip').exists()).toBe(false);
    expect(wrapper.find('.ranking__save').exists()).toBe(false);
    expect(wrapper.find('.ranking__item').classes()).toContain('ranking__item--locked');
  });
});
