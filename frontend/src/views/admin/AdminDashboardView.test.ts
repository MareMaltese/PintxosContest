import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import { setActivePinia, createPinia } from 'pinia';
import AdminDashboardView from './AdminDashboardView.vue';

const { pushMock } = vi.hoisted(() => ({ pushMock: vi.fn() }));
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

const fullData = {
  phase: 'VOTING',
  allowSelfVote: false,
  votingMode: 'FAVORITES',
  participantCount: 12,
  entryCount: 17,
  votersFinished: 3,
  votersTotal: 18,
  people: [],
};

describe('AdminDashboardView', () => {
  it('shows a loading state while fetching', async () => {
    vi.mocked(api.get).mockReturnValue(new Promise(() => {}));
    const wrapper = mount(AdminDashboardView);
    await flushPromises();
    expect(wrapper.text()).toContain('Cargando');
  });

  it('shows the four stat cards once loaded', async () => {
    vi.mocked(api.get).mockResolvedValue({
      phase: 'VOTING',
      allowSelfVote: false,
      votingMode: 'FAVORITES',
      participantCount: 12,
      entryCount: 17,
      votersFinished: 3,
      votersTotal: 18,
      people: [],
    });
    const wrapper = mount(AdminDashboardView);
    await flushPromises();

    expect(wrapper.text()).toContain('Votación');
    expect(wrapper.text()).toContain('12');
    expect(wrapper.text()).toContain('17');
    expect(wrapper.text()).toContain('3 / 18');
    expect(wrapper.text()).toContain('Favoritos');
  });

  it('shows "Medallas" as the scoring type when votingMode is MEDALS', async () => {
    vi.mocked(api.get).mockResolvedValue({
      phase: 'VOTING',
      allowSelfVote: false,
      votingMode: 'MEDALS',
      participantCount: 12,
      entryCount: 17,
      votersFinished: 3,
      votersTotal: 18,
      people: [],
    });
    const wrapper = mount(AdminDashboardView);
    await flushPromises();

    expect(wrapper.text()).toContain('Medallas');
  });

  it('hides the "han terminado de votar" card when votingMode is MEDALS', async () => {
    vi.mocked(api.get).mockResolvedValue({
      phase: 'VOTING',
      allowSelfVote: false,
      votingMode: 'MEDALS',
      participantCount: 12,
      entryCount: 17,
      votersFinished: 3,
      votersTotal: 18,
      people: [],
    });
    const wrapper = mount(AdminDashboardView);
    await flushPromises();

    expect(wrapper.text()).not.toContain('Han terminado de votar');
  });

  it('links the Fase actual and Tipo de puntuación cards to Administración', async () => {
    vi.mocked(api.get).mockResolvedValue(fullData);
    const wrapper = mount(AdminDashboardView);
    await flushPromises();

    const cards = wrapper.findAll('.admin-card');
    await cards[0].trigger('click');
    expect(pushMock).toHaveBeenLastCalledWith({ name: 'admin-phases' });
    await cards[3].trigger('click');
    expect(pushMock).toHaveBeenLastCalledWith({ name: 'admin-phases' });
  });

  it('links the Participantes card to Participantes', async () => {
    vi.mocked(api.get).mockResolvedValue(fullData);
    const wrapper = mount(AdminDashboardView);
    await flushPromises();

    await wrapper.findAll('.admin-card')[1].trigger('click');
    expect(pushMock).toHaveBeenLastCalledWith({ name: 'admin-participants' });
  });

  it('links the Tapas y Pinchos card to Tapas', async () => {
    vi.mocked(api.get).mockResolvedValue(fullData);
    const wrapper = mount(AdminDashboardView);
    await flushPromises();

    await wrapper.findAll('.admin-card')[2].trigger('click');
    expect(pushMock).toHaveBeenLastCalledWith({ name: 'admin-entries' });
  });

  it('shows a retryable error message when loading fails', async () => {
    vi.mocked(api.get).mockRejectedValue(new Error('network down'));
    const wrapper = mount(AdminDashboardView);
    await flushPromises();
    expect(wrapper.text()).toContain('No hemos podido cargar el panel.');
  });
});
