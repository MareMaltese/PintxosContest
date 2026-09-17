import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import AdminDashboardView from './AdminDashboardView.vue';

vi.mock('vue-router', () => ({
  useRouter: () => ({ push: vi.fn() }),
}));

vi.mock('../../services/api', async () => {
  const actual = await vi.importActual<typeof import('../../services/api')>('../../services/api');
  return { ...actual, api: { ...actual.api, get: vi.fn() } };
});

import { api } from '../../services/api';

beforeEach(() => {
  vi.clearAllMocks();
});

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
  });

  it('shows a retryable error message when loading fails', async () => {
    vi.mocked(api.get).mockRejectedValue(new Error('network down'));
    const wrapper = mount(AdminDashboardView);
    await flushPromises();
    expect(wrapper.text()).toContain('No hemos podido cargar el panel.');
  });
});
