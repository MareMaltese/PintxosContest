import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import { setActivePinia, createPinia } from 'pinia';
import AdminParticipantsView from './AdminParticipantsView.vue';

vi.mock('vue-router', () => ({
  useRouter: () => ({ push: vi.fn() }),
}));

vi.mock('../../services/api', async () => {
  const actual = await vi.importActual<typeof import('../../services/api')>('../../services/api');
  return { ...actual, api: { ...actual.api, get: vi.fn(), patch: vi.fn(), delete: vi.fn() } };
});

import { api } from '../../services/api';

const people = [
  {
    id: 'u1',
    name: 'Laura',
    entryNumbers: [3, 11],
    votedCount: 3,
    voteLimit: 3,
    hasFinishedVoting: true,
    lastSeen: new Date().toISOString(),
  },
  {
    id: 'u2',
    name: 'Miguel',
    entryNumbers: [],
    votedCount: 2,
    voteLimit: 3,
    hasFinishedVoting: false,
    lastSeen: new Date(Date.now() - 7 * 60_000).toISOString(),
  },
];

function dashboardWith(votingMode = 'FAVORITES') {
  return {
    phase: 'VOTING',
    allowSelfVote: false,
    votingMode,
    participantCount: 2,
    entryCount: 2,
    votersFinished: 1,
    votersTotal: 2,
    people,
  };
}

beforeEach(() => {
  setActivePinia(createPinia());
  vi.clearAllMocks();
  vi.unstubAllGlobals();
  vi.mocked(api.get).mockResolvedValue(dashboardWith());
});

describe('AdminParticipantsView', () => {
  it('lists each participant with their entries, voting progress and status', async () => {
    const wrapper = mount(AdminParticipantsView);
    await flushPromises();

    expect(wrapper.text()).toContain('Laura');
    expect(wrapper.text()).toContain('#03, #11');
    expect(wrapper.text()).toContain('3 / 3');
    expect(wrapper.text()).toContain('Completo');
    expect(wrapper.text()).toContain('Miguel');
    expect(wrapper.text()).toContain('2 / 3');
    expect(wrapper.text()).toContain('Pendiente');
  });

  it('hides the voting progress column when votingMode is MEDALS', async () => {
    vi.mocked(api.get).mockResolvedValue(dashboardWith('MEDALS'));
    const wrapper = mount(AdminParticipantsView);
    await flushPromises();

    expect(wrapper.text()).toContain('Laura');
    expect(wrapper.text()).not.toContain('Completo');
    expect(wrapper.text()).not.toContain('Pendiente');
  });

  it('renames a participant after confirming via prompt', async () => {
    vi.spyOn(window, 'prompt').mockReturnValue('Laura M.');
    vi.mocked(api.patch).mockResolvedValue({});
    const wrapper = mount(AdminParticipantsView);
    await flushPromises();

    await wrapper.findAll('button.admin-table__edit')[0].trigger('click');
    await flushPromises();

    expect(api.patch).toHaveBeenCalledWith('/api/admin/users/u1', { name: 'Laura M.' });
  });

  it('does not rename when the prompt is cancelled', async () => {
    vi.spyOn(window, 'prompt').mockReturnValue(null);
    const wrapper = mount(AdminParticipantsView);
    await flushPromises();

    await wrapper.findAll('button.admin-table__edit')[0].trigger('click');
    await flushPromises();

    expect(api.patch).not.toHaveBeenCalled();
  });

  it('deletes a participant after confirming', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    vi.mocked(api.delete).mockResolvedValue({});
    const wrapper = mount(AdminParticipantsView);
    await flushPromises();

    await wrapper.findAll('button.admin-table__delete')[0].trigger('click');
    await flushPromises();

    expect(api.delete).toHaveBeenCalledWith('/api/admin/users/u1');
  });

  it('does not delete when the confirmation is declined', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(false);
    const wrapper = mount(AdminParticipantsView);
    await flushPromises();

    await wrapper.findAll('button.admin-table__delete')[0].trigger('click');
    await flushPromises();

    expect(api.delete).not.toHaveBeenCalled();
  });
});
