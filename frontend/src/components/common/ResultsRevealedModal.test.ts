import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import { setActivePinia, createPinia } from 'pinia';
import ResultsRevealedModal from './ResultsRevealedModal.vue';
import { useContestStore } from '../../stores/contest';
import { useSessionStore } from '../../stores/session';

const pushMock = vi.fn();
vi.mock('vue-router', () => ({
  useRouter: () => ({ push: pushMock }),
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

describe('ResultsRevealedModal', () => {
  it('does not show on mount, even if resultsRevealedAt is already set', () => {
    useContestStore().resultsRevealedAt = '2026-09-18T10:00:00.000Z';
    useSessionStore().user = { id: 'u1', name: 'Laura' };
    const wrapper = mount(ResultsRevealedModal);
    expect(wrapper.find('.results-revealed-modal').exists()).toBe(false);
  });

  it('shows the popup and the favorites winners when resultsRevealedAt is set', async () => {
    vi.mocked(api.get).mockResolvedValue({
      revealedAt: 'x',
      standings: [
        { entryId: 'e1', number: 3, name: 'Croqueta', creatorId: 'u1', voteCount: 5, rank: 1 },
        { entryId: 'e2', number: 1, name: null, creatorId: 'u2', voteCount: 3, rank: 2 },
        { entryId: 'e3', number: 2, name: 'Tortilla', creatorId: 'u3', voteCount: 1, rank: 3 },
        { entryId: 'e4', number: 4, name: 'Pan', creatorId: 'u4', voteCount: 0, rank: 4 },
      ],
    });
    const contest = useContestStore();
    contest.phase = 'RESULTS';
    contest.votingMode = 'FAVORITES';
    useSessionStore().user = { id: 'u1', name: 'Laura' };
    const wrapper = mount(ResultsRevealedModal);

    contest.resultsRevealedAt = '2026-09-18T10:00:00.000Z';
    await flushPromises();

    expect(api.get).toHaveBeenCalledWith('/api/results');
    expect(wrapper.find('.results-revealed-modal').exists()).toBe(true);
    expect(wrapper.text()).toContain('¡Votación finalizada!');
    expect(wrapper.text()).toContain('#03');
    expect(wrapper.text()).toContain('Croqueta');
    expect(wrapper.text()).not.toContain('#04');
  });

  it('shows the medal podium winners when votingMode is MEDALS', async () => {
    vi.mocked(api.get).mockResolvedValue({
      revealedAt: 'x',
      podium: [
        { rank: 1, entryId: 'e1', number: 3, entryName: 'Croqueta', creatorName: 'Laura', medal: 'GOLD', total: 5 },
        { rank: 2, entryId: 'e2', number: 1, entryName: null, creatorName: 'Miguel', medal: 'SILVER', total: 3 },
      ],
    });
    const contest = useContestStore();
    contest.phase = 'RESULTS';
    contest.votingMode = 'MEDALS';
    useSessionStore().user = { id: 'u1', name: 'Laura' };
    const wrapper = mount(ResultsRevealedModal);

    contest.resultsRevealedAt = '2026-09-18T10:00:00.000Z';
    await flushPromises();

    expect(api.get).toHaveBeenCalledWith('/api/medal-votes/results');
    expect(wrapper.text()).toContain('Laura');
    expect(wrapper.text()).toContain('Miguel');
  });

  it('does not show the popup when there is no guest session', async () => {
    const contest = useContestStore();
    contest.phase = 'RESULTS';
    const wrapper = mount(ResultsRevealedModal);

    contest.resultsRevealedAt = '2026-09-18T10:00:00.000Z';
    await flushPromises();

    expect(wrapper.find('.results-revealed-modal').exists()).toBe(false);
  });

  it('dismisses when the button is clicked', async () => {
    vi.mocked(api.get).mockResolvedValue({ revealedAt: 'x', standings: [] });
    const contest = useContestStore();
    contest.phase = 'RESULTS';
    useSessionStore().user = { id: 'u1', name: 'Laura' };
    const wrapper = mount(ResultsRevealedModal);
    contest.resultsRevealedAt = '2026-09-18T10:00:00.000Z';
    await flushPromises();

    await wrapper.find('.results-revealed-modal__dismiss').trigger('click');

    expect(wrapper.find('.results-revealed-modal').exists()).toBe(false);
  });

  it('does not navigate anywhere when votingMode is FAVORITES (no ranking screen for it)', async () => {
    vi.mocked(api.get).mockResolvedValue({ revealedAt: 'x', standings: [] });
    const contest = useContestStore();
    contest.phase = 'RESULTS';
    contest.votingMode = 'FAVORITES';
    useSessionStore().user = { id: 'u1', name: 'Laura' };
    const wrapper = mount(ResultsRevealedModal);
    contest.resultsRevealedAt = '2026-09-18T10:00:00.000Z';
    await flushPromises();

    await wrapper.find('.results-revealed-modal__dismiss').trigger('click');

    expect(pushMock).not.toHaveBeenCalled();
  });

  it('redirects to the Ranking screen when accepting in MEDALS mode', async () => {
    vi.mocked(api.get).mockResolvedValue({ revealedAt: 'x', podium: [] });
    const contest = useContestStore();
    contest.phase = 'RESULTS';
    contest.votingMode = 'MEDALS';
    useSessionStore().user = { id: 'u1', name: 'Laura' };
    const wrapper = mount(ResultsRevealedModal);
    contest.resultsRevealedAt = '2026-09-18T10:00:00.000Z';
    await flushPromises();

    await wrapper.find('.results-revealed-modal__dismiss').trigger('click');

    expect(pushMock).toHaveBeenCalledWith({ name: 'medal-results' });
  });
});
