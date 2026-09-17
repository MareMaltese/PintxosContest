import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import { setActivePinia, createPinia } from 'pinia';
import AdminPhasesView from './AdminPhasesView.vue';

vi.mock('vue-router', () => ({
  useRouter: () => ({ push: vi.fn() }),
}));

vi.mock('../../services/api', async () => {
  const actual = await vi.importActual<typeof import('../../services/api')>('../../services/api');
  return { ...actual, api: { ...actual.api, get: vi.fn(), post: vi.fn(), patch: vi.fn() } };
});

import { api, ApiError } from '../../services/api';

function dashboardWith(phase: string, allowSelfVote = false, votingMode = 'FAVORITES') {
  return {
    phase,
    allowSelfVote,
    votingMode,
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

  it('toggles votingMode between FAVORITES and MEDALS', async () => {
    vi.mocked(api.get).mockResolvedValue(dashboardWith('VOTING', false, 'FAVORITES'));
    vi.mocked(api.patch).mockResolvedValue({});
    const wrapper = mount(AdminPhasesView);
    await flushPromises();

    expect(wrapper.text()).toContain('Favoritos');
    await wrapper.find('.admin-phases__voting-mode').trigger('click');
    await flushPromises();

    expect(api.patch).toHaveBeenCalledWith('/api/admin/contest', { votingMode: 'MEDALS' });
  });

  it('shows only "Cerrar ronda de desempate" during TIEBREAK', async () => {
    vi.mocked(api.get).mockResolvedValue(dashboardWith('TIEBREAK'));
    const wrapper = mount(AdminPhasesView);
    await flushPromises();

    expect(wrapper.text()).toContain('Cerrar ronda de desempate');
  });

  it('shows only "Mostrar resultados" during RESULTS', async () => {
    vi.mocked(api.get).mockResolvedValue(dashboardWith('RESULTS'));
    const wrapper = mount(AdminPhasesView);
    await flushPromises();

    expect(wrapper.text()).toContain('Mostrar resultados');
  });
});
