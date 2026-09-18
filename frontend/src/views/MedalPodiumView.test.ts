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

  it('draws the podium with silver on the left, gold in the centre, bronze on the right', async () => {
    vi.mocked(api.get).mockResolvedValue({
      revealedAt: '2026-09-17T20:00:00.000Z',
      podium: [
        {
          rank: 1,
          entryId: 'e1',
          number: 3,
          entryName: 'Croqueta',
          creatorName: 'Laura',
          imagePath: 'gold.webp',
          medal: 'GOLD',
          total: 15,
        },
        {
          rank: 2,
          entryId: 'e2',
          number: 7,
          entryName: null,
          creatorName: 'Miguel',
          imagePath: 'silver.webp',
          medal: 'SILVER',
          total: 9,
        },
        {
          rank: 3,
          entryId: 'e3',
          number: 1,
          entryName: null,
          creatorName: 'Ana',
          imagePath: 'bronze.webp',
          medal: 'BRONZE',
          total: 4,
        },
      ],
      standings: [],
    });
    const wrapper = mount(MedalPodiumView);
    await flushPromises();

    const columns = wrapper.findAll('.medal-podium__column');
    expect(columns).toHaveLength(3);

    expect(columns[0].find('.medal-podium__step--silver').exists()).toBe(true);
    expect(columns[0].text()).toContain('#07');
    expect(columns[0].find('img').attributes('src')).toBe('/uploads/silver.webp');

    expect(columns[1].find('.medal-podium__step--gold').exists()).toBe(true);
    expect(columns[1].text()).toContain('#03');
    expect(columns[1].find('img').attributes('src')).toBe('/uploads/gold.webp');

    expect(columns[2].find('.medal-podium__step--bronze').exists()).toBe(true);
    expect(columns[2].text()).toContain('#01');
    expect(columns[2].find('img').attributes('src')).toBe('/uploads/bronze.webp');

    const goldStep = wrapper.find('.medal-podium__step--gold').element as HTMLElement;
    const silverStep = wrapper.find('.medal-podium__step--silver').element as HTMLElement;
    const bronzeStep = wrapper.find('.medal-podium__step--bronze').element as HTMLElement;
    expect(goldStep.style.height).toBe('160px');
    expect(silverStep.style.height).toBe('120px');
    expect(bronzeStep.style.height).toBe('90px');
  });

  it('shows a retryable error for other failures', async () => {
    vi.mocked(api.get).mockRejectedValue(new Error('network down'));
    const wrapper = mount(MedalPodiumView);
    await flushPromises();
    expect(wrapper.text()).toContain('No hemos podido cargar el podio.');
  });

  it('lists every participant with their medal counts and total', async () => {
    vi.mocked(api.get).mockResolvedValue({
      revealedAt: '2026-09-17T20:00:00.000Z',
      podium: [],
      standings: [
        {
          rank: 1,
          entryId: 'e1',
          number: 3,
          name: 'Croqueta',
          creatorId: 'u1',
          creatorName: 'Laura',
          imagePath: 'a.webp',
          gold: 3,
          silver: 1,
          bronze: 0,
          total: 18,
        },
        {
          rank: 2,
          entryId: 'e2',
          number: 7,
          name: null,
          creatorId: 'u2',
          creatorName: 'Miguel',
          imagePath: 'b.webp',
          gold: 0,
          silver: 2,
          bronze: 1,
          total: 7,
        },
      ],
    });
    const wrapper = mount(MedalPodiumView);
    await flushPromises();

    const rows = wrapper.findAll('.medal-podium__row');
    expect(rows).toHaveLength(2);

    expect(rows[0].text()).toContain('#03');
    expect(rows[0].text()).toContain('Laura');
    expect(rows[0].find('.medal-podium__count--gold').text()).toBe('3');
    expect(rows[0].find('.medal-podium__count--silver').text()).toBe('1');
    expect(rows[0].find('.medal-podium__count--bronze').text()).toBe('0');
    expect(rows[0].text()).toContain('18');

    expect(rows[1].text()).toContain('#07');
    expect(rows[1].find('.medal-podium__count--gold').text()).toBe('0');
    expect(rows[1].find('.medal-podium__count--silver').text()).toBe('2');
    expect(rows[1].find('.medal-podium__count--bronze').text()).toBe('1');
    expect(rows[1].text()).toContain('7');
  });
});
