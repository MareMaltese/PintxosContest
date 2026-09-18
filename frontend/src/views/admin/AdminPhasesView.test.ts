import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import { setActivePinia, createPinia } from 'pinia';
import AdminPhasesView from './AdminPhasesView.vue';

vi.mock('vue-router', () => ({
  useRouter: () => ({ push: vi.fn() }),
}));

vi.mock('../../services/api', async () => {
  const actual = await vi.importActual<typeof import('../../services/api')>('../../services/api');
  return { ...actual, api: { ...actual.api, get: vi.fn(), post: vi.fn(), patch: vi.fn(), delete: vi.fn() } };
});

import { api, ApiError } from '../../services/api';

function dashboardWith(
  phase: string,
  allowSelfVote = false,
  votingMode = 'FAVORITES',
  resultsRevealedAt: string | null = null,
  worstPrizeEnabled = false,
  openRound: { kind: string; targetRank: number } | null = null
) {
  return {
    phase,
    allowSelfVote,
    votingMode,
    resultsRevealedAt,
    worstPrizeEnabled,
    openRound,
    participantCount: 2,
    entryCount: 2,
    votersFinished: 1,
    votersTotal: 2,
    people: [],
  };
}

beforeEach(() => {
  setActivePinia(createPinia());
  vi.clearAllMocks();
  vi.unstubAllGlobals();
});

describe('AdminPhasesView', () => {
  it('shows only "Iniciar concurso" during REGISTRATION', async () => {
    vi.mocked(api.get).mockResolvedValue(dashboardWith('REGISTRATION'));
    const wrapper = mount(AdminPhasesView);
    await flushPromises();

    expect(wrapper.text()).toContain('Iniciar concurso');
    expect(wrapper.text()).not.toContain('Cerrar votación');
  });

  it('starts the contest after confirming', async () => {
    vi.mocked(api.get).mockResolvedValue(dashboardWith('REGISTRATION'));
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    vi.mocked(api.post).mockResolvedValue({});
    const wrapper = mount(AdminPhasesView);
    await flushPromises();

    await wrapper.find('.admin-phases__start').trigger('click');
    await flushPromises();

    expect(api.post).toHaveBeenCalledWith('/api/admin/contest/start');
  });

  it('shows only "Cerrar votación" during VOTING', async () => {
    vi.mocked(api.get).mockResolvedValue(dashboardWith('VOTING'));
    const wrapper = mount(AdminPhasesView);
    await flushPromises();

    expect(wrapper.text()).toContain('Cerrar votación');
    expect(wrapper.text()).not.toContain('Iniciar concurso');
  });

  it('closes voting directly when nobody is pending', async () => {
    vi.mocked(api.get).mockResolvedValue(dashboardWith('VOTING'));
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    vi.mocked(api.post).mockResolvedValue({ phase: 'RESULTS' });
    const wrapper = mount(AdminPhasesView);
    await flushPromises();

    await wrapper.find('.admin-phases__close-voting').trigger('click');
    await flushPromises();

    expect(api.post).toHaveBeenCalledWith('/api/admin/contest/close-voting', {});
  });

  it('offers to force-close when voters are pending, and does so on confirmation', async () => {
    vi.mocked(api.get).mockResolvedValue(dashboardWith('VOTING'));
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);
    vi.mocked(api.post)
      .mockRejectedValueOnce(new ApiError(409, 'VOTERS_PENDING', 'Hay 1 persona(s) que todavía no ha(n) completado sus votos.'))
      .mockResolvedValueOnce({ phase: 'RESULTS' });
    const wrapper = mount(AdminPhasesView);
    await flushPromises();

    await wrapper.find('.admin-phases__close-voting').trigger('click');
    await flushPromises();

    expect(confirmSpy).toHaveBeenCalledTimes(2);
    expect(api.post).toHaveBeenNthCalledWith(1, '/api/admin/contest/close-voting', {});
    expect(api.post).toHaveBeenNthCalledWith(2, '/api/admin/contest/close-voting', { force: true });
  });

  it('toggles allowSelfVote', async () => {
    vi.mocked(api.get).mockResolvedValue(dashboardWith('VOTING', false));
    vi.mocked(api.patch).mockResolvedValue({});
    const wrapper = mount(AdminPhasesView);
    await flushPromises();

    await wrapper.find('.admin-phases__self-vote').trigger('click');
    await flushPromises();

    expect(api.patch).toHaveBeenCalledWith('/api/admin/contest', { allowSelfVote: true });
  });

  it('asks for confirmation before toggling votingMode once voting has started', async () => {
    vi.mocked(api.get).mockResolvedValue(dashboardWith('VOTING', false, 'FAVORITES'));
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    vi.mocked(api.patch).mockResolvedValue({});
    const wrapper = mount(AdminPhasesView);
    await flushPromises();

    expect(wrapper.text()).toContain('Favoritos');
    await wrapper.find('.admin-phases__voting-mode').trigger('click');
    await flushPromises();

    expect(window.confirm).toHaveBeenCalled();
    expect(api.patch).toHaveBeenCalledWith('/api/admin/contest', { votingMode: 'MEDALS' });
  });

  it('does not toggle votingMode when the confirmation is declined', async () => {
    vi.mocked(api.get).mockResolvedValue(dashboardWith('VOTING', false, 'FAVORITES'));
    vi.spyOn(window, 'confirm').mockReturnValue(false);
    const wrapper = mount(AdminPhasesView);
    await flushPromises();

    await wrapper.find('.admin-phases__voting-mode').trigger('click');
    await flushPromises();

    expect(api.patch).not.toHaveBeenCalled();
  });

  it('toggles votingMode without asking during REGISTRATION', async () => {
    vi.mocked(api.get).mockResolvedValue(dashboardWith('REGISTRATION', false, 'FAVORITES'));
    const confirmSpy = vi.spyOn(window, 'confirm');
    vi.mocked(api.patch).mockResolvedValue({});
    const wrapper = mount(AdminPhasesView);
    await flushPromises();

    await wrapper.find('.admin-phases__voting-mode').trigger('click');
    await flushPromises();

    expect(confirmSpy).not.toHaveBeenCalled();
    expect(api.patch).toHaveBeenCalledWith('/api/admin/contest', { votingMode: 'MEDALS' });
  });

  it('hides the "premio al último" toggle in FAVORITES mode', async () => {
    vi.mocked(api.get).mockResolvedValue(dashboardWith('VOTING', false, 'FAVORITES'));
    const wrapper = mount(AdminPhasesView);
    await flushPromises();

    expect(wrapper.find('.admin-phases__worst-prize').exists()).toBe(false);
  });

  it('toggles worstPrizeEnabled in MEDALS mode', async () => {
    vi.mocked(api.get).mockResolvedValue(dashboardWith('VOTING', false, 'MEDALS', null, false));
    vi.mocked(api.patch).mockResolvedValue({});
    const wrapper = mount(AdminPhasesView);
    await flushPromises();

    expect(wrapper.text()).toContain('Premio al último: desactivado');
    await wrapper.find('.admin-phases__worst-prize').trigger('click');
    await flushPromises();

    expect(api.patch).toHaveBeenCalledWith('/api/admin/contest', { worstPrizeEnabled: true });
  });

  it('shows "Cerrar ronda de desempate" when there is an open round during TIEBREAK', async () => {
    vi.mocked(api.get).mockResolvedValue(
      dashboardWith('TIEBREAK', false, 'FAVORITES', null, false, { kind: 'MAIN', targetRank: 1 })
    );
    const wrapper = mount(AdminPhasesView);
    await flushPromises();

    expect(wrapper.text()).toContain('Cerrar ronda de desempate');
  });

  it('points to Clasificación instead of a close-round button when the tiebreak has not been started yet', async () => {
    vi.mocked(api.get).mockResolvedValue(dashboardWith('TIEBREAK', false, 'MEDALS', null, true, null));
    const wrapper = mount(AdminPhasesView);
    await flushPromises();

    expect(wrapper.text()).not.toContain('Cerrar ronda de desempate');
    expect(wrapper.text()).toContain('Clasificación');
  });

  it('shows which kind of tiebreak is open during TIEBREAK', async () => {
    vi.mocked(api.get).mockResolvedValue(
      dashboardWith('TIEBREAK', false, 'FAVORITES', null, false, { kind: 'MAIN', targetRank: 1 })
    );
    const wrapper = mount(AdminPhasesView);
    await flushPromises();

    expect(wrapper.text()).toContain('Desempate del concurso');
  });

  it('labels a worst-prize tiebreak distinctly from a podium medal tiebreak', async () => {
    vi.mocked(api.get).mockResolvedValue(
      dashboardWith('TIEBREAK', false, 'MEDALS', null, true, { kind: 'MEDAL', targetRank: 5 })
    );
    const wrapper = mount(AdminPhasesView);
    await flushPromises();

    expect(wrapper.text()).toContain('Desempate: premio al último');
  });

  it('shows "Mostrar resultados" during RESULTS before revealing', async () => {
    vi.mocked(api.get).mockResolvedValue(dashboardWith('RESULTS', false, 'FAVORITES', null));
    const wrapper = mount(AdminPhasesView);
    await flushPromises();

    expect(wrapper.text()).toContain('Mostrar resultados');
    expect(wrapper.text()).not.toContain('Volver a votación');
  });

  it('shows "Volver a votación" instead, once results have been revealed', async () => {
    vi.mocked(api.get).mockResolvedValue(dashboardWith('RESULTS', false, 'FAVORITES', '2026-09-18T10:00:00.000Z'));
    const wrapper = mount(AdminPhasesView);
    await flushPromises();

    expect(wrapper.text()).toContain('Volver a votación');
    expect(wrapper.text()).not.toContain('Mostrar resultados');
  });

  it('reopens voting after confirming', async () => {
    vi.mocked(api.get).mockResolvedValue(dashboardWith('RESULTS', false, 'FAVORITES', '2026-09-18T10:00:00.000Z'));
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    vi.mocked(api.post).mockResolvedValue({ phase: 'VOTING' });
    const wrapper = mount(AdminPhasesView);
    await flushPromises();

    await wrapper.find('.admin-phases__reopen-voting').trigger('click');
    await flushPromises();

    expect(api.post).toHaveBeenCalledWith('/api/admin/contest/reopen-voting');
  });

  it('does not reopen voting when the confirmation is declined', async () => {
    vi.mocked(api.get).mockResolvedValue(dashboardWith('RESULTS', false, 'FAVORITES', '2026-09-18T10:00:00.000Z'));
    vi.spyOn(window, 'confirm').mockReturnValue(false);
    const wrapper = mount(AdminPhasesView);
    await flushPromises();

    await wrapper.find('.admin-phases__reopen-voting').trigger('click');
    await flushPromises();

    expect(api.post).not.toHaveBeenCalled();
  });

  it('hides "Volver al inicio" during REGISTRATION', async () => {
    vi.mocked(api.get).mockResolvedValue(dashboardWith('REGISTRATION'));
    const wrapper = mount(AdminPhasesView);
    await flushPromises();

    expect(wrapper.find('.admin-phases__back-to-registration').exists()).toBe(false);
  });

  it.each(['VOTING', 'TIEBREAK', 'RESULTS'])('shows "Volver al inicio" during %s', async (phase) => {
    vi.mocked(api.get).mockResolvedValue(dashboardWith(phase));
    const wrapper = mount(AdminPhasesView);
    await flushPromises();

    expect(wrapper.find('.admin-phases__back-to-registration').exists()).toBe(true);
  });

  it('goes back to registration after confirming', async () => {
    vi.mocked(api.get).mockResolvedValue(dashboardWith('VOTING'));
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    vi.mocked(api.post).mockResolvedValue({ phase: 'REGISTRATION' });
    const wrapper = mount(AdminPhasesView);
    await flushPromises();

    await wrapper.find('.admin-phases__back-to-registration').trigger('click');
    await flushPromises();

    expect(api.post).toHaveBeenCalledWith('/api/admin/contest/back-to-registration');
  });

  it('does not go back to registration when the confirmation is declined', async () => {
    vi.mocked(api.get).mockResolvedValue(dashboardWith('VOTING'));
    vi.spyOn(window, 'confirm').mockReturnValue(false);
    const wrapper = mount(AdminPhasesView);
    await flushPromises();

    await wrapper.find('.admin-phases__back-to-registration').trigger('click');
    await flushPromises();

    expect(api.post).not.toHaveBeenCalled();
  });

  it('shows the tiebreak history with tally and vote log once rounds exist', async () => {
    vi.mocked(api.get).mockImplementation((path: string) =>
      path === '/api/admin/tiebreak/history'
        ? Promise.resolve([
            {
              id: 'r1',
              roundNumber: 1,
              kind: 'MAIN',
              targetRank: 1,
              status: 'CLOSED',
              createdAt: '2026-09-18T18:00:00.000Z',
              closedAt: '2026-09-18T18:05:00.000Z',
              candidates: [
                { entryId: 'e1', number: 1, name: 'Croqueta', votes: 2 },
                { entryId: 'e2', number: 2, name: null, votes: 1 },
              ],
              votes: [{ userName: 'Ana', entryNumber: 1, createdAt: '2026-09-18T18:04:00.000Z' }],
              result: 'RESOLVED',
              winnerEntryId: 'e1',
            },
          ])
        : Promise.resolve(dashboardWith('RESULTS', false, 'FAVORITES', '2026-09-18T18:06:00.000Z'))
    );
    const wrapper = mount(AdminPhasesView);
    await flushPromises();

    expect(wrapper.text()).toContain('Historial de desempates');
    expect(wrapper.text()).toContain('Resuelto: ganó la tapa #01');
    expect(wrapper.text()).toContain('#01 Croqueta — 2 voto(s)');
    expect(wrapper.find('.admin-phases__history-log summary').text()).toContain('Ver votos (1)');
  });

  it('deletes the tiebreak history after confirming', async () => {
    let historyDeleted = false;
    vi.mocked(api.get).mockImplementation((path: string) =>
      path === '/api/admin/tiebreak/history'
        ? Promise.resolve(
            historyDeleted
              ? []
              : [
                  {
                    id: 'r1',
                    roundNumber: 1,
                    kind: 'MAIN',
                    targetRank: 1,
                    status: 'CLOSED',
                    createdAt: '2026-09-18T18:00:00.000Z',
                    closedAt: '2026-09-18T18:05:00.000Z',
                    candidates: [{ entryId: 'e1', number: 1, name: 'Croqueta', votes: 2 }],
                    votes: [],
                    result: 'RESOLVED',
                    winnerEntryId: 'e1',
                  },
                ]
          )
        : Promise.resolve(dashboardWith('RESULTS', false, 'FAVORITES', '2026-09-18T18:06:00.000Z'))
    );
    vi.mocked(api.delete).mockImplementation(() => {
      historyDeleted = true;
      return Promise.resolve({ ok: true });
    });
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    const wrapper = mount(AdminPhasesView);
    await flushPromises();

    expect(wrapper.text()).toContain('Historial de desempates');
    await wrapper.find('.admin-phases__history-delete').trigger('click');
    await flushPromises();

    expect(api.delete).toHaveBeenCalledWith('/api/admin/tiebreak/history');
    expect(wrapper.text()).not.toContain('Historial de desempates');
  });

  it('does not delete the tiebreak history when the confirmation is declined', async () => {
    vi.mocked(api.get).mockImplementation((path: string) =>
      path === '/api/admin/tiebreak/history'
        ? Promise.resolve([
            {
              id: 'r1',
              roundNumber: 1,
              kind: 'MAIN',
              targetRank: 1,
              status: 'CLOSED',
              createdAt: '2026-09-18T18:00:00.000Z',
              closedAt: '2026-09-18T18:05:00.000Z',
              candidates: [{ entryId: 'e1', number: 1, name: 'Croqueta', votes: 2 }],
              votes: [],
              result: 'RESOLVED',
              winnerEntryId: 'e1',
            },
          ])
        : Promise.resolve(dashboardWith('RESULTS', false, 'FAVORITES', '2026-09-18T18:06:00.000Z'))
    );
    vi.spyOn(window, 'confirm').mockReturnValue(false);
    const wrapper = mount(AdminPhasesView);
    await flushPromises();

    await wrapper.find('.admin-phases__history-delete').trigger('click');
    await flushPromises();

    expect(api.delete).not.toHaveBeenCalled();
    expect(wrapper.text()).toContain('Historial de desempates');
  });
});
