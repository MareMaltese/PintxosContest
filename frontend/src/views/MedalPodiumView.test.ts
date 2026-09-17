import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';

vi.mock('../services/api', async () => {
  const actual = await vi.importActual<typeof import('../services/api')>('../services/api');
  return { ...actual, api: { ...actual.api, get: vi.fn() } };
});

import { api, ApiError } from '../services/api';
import MedalPodiumView from './MedalPodiumView.vue';

beforeEach(() => {
  vi.clearAllMocks();
});

describe('MedalPodiumView', () => {
  it('shows a waiting message before the reveal', async () => {
    vi.mocked(api.get).mockRejectedValue(
      new ApiError(409, 'RESULTS_NOT_READY', 'Los resultados todavía no se han mostrado.')
    );
    const wrapper = mount(MedalPodiumView);
    await flushPromises();
    expect(wrapper.text()).toContain('Todavía no se ha revelado');
  });

  it('shows the podium once revealed', async () => {
    vi.mocked(api.get).mockResolvedValue({
      revealedAt: '2026-09-17T20:00:00.000Z',
      podium: [
        { rank: 1, entryId: 'e1', number: 3, entryName: 'Croqueta', creatorName: 'Laura', medal: 'GOLD', total: 15 },
        { rank: 2, entryId: 'e2', number: 7, entryName: null, creatorName: 'Miguel', medal: 'SILVER', total: 9 },
        { rank: 3, entryId: 'e3', number: 1, entryName: null, creatorName: 'Ana', medal: 'BRONZE', total: 4 },
      ],
    });
    const wrapper = mount(MedalPodiumView);
    await flushPromises();

    expect(wrapper.text()).toContain('#03');
    expect(wrapper.text()).toContain('Laura');
    expect(wrapper.findAll('.medal-podium__item')).toHaveLength(3);
    expect(wrapper.find('.medal-podium__circle--gold').exists()).toBe(true);
    expect(wrapper.find('.medal-podium__circle--silver').exists()).toBe(true);
    expect(wrapper.find('.medal-podium__circle--bronze').exists()).toBe(true);
  });

  it('shows a retryable error for other failures', async () => {
    vi.mocked(api.get).mockRejectedValue(new Error('network down'));
    const wrapper = mount(MedalPodiumView);
    await flushPromises();
    expect(wrapper.text()).toContain('No hemos podido cargar el podio.');
  });
});
