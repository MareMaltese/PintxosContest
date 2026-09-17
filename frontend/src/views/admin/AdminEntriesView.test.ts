import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import { setActivePinia, createPinia } from 'pinia';
import AdminEntriesView from './AdminEntriesView.vue';

vi.mock('vue-router', () => ({
  useRouter: () => ({ push: vi.fn() }),
}));

vi.mock('../../services/api', async () => {
  const actual = await vi.importActual<typeof import('../../services/api')>('../../services/api');
  return { ...actual, api: { ...actual.api, get: vi.fn(), patch: vi.fn(), delete: vi.fn() } };
});

import { api } from '../../services/api';
import { useContestStore } from '../../stores/contest';

const entries = [
  {
    id: 'e1',
    number: 1,
    creatorId: 'u1',
    creatorName: 'Laura',
    name: 'Croqueta',
    description: 'Con jamón.',
    imagePath: 'a.webp',
    createdAt: 'x',
    voteCount: 4,
    gold: 2,
    silver: 1,
    bronze: 0,
  },
];

beforeEach(() => {
  setActivePinia(createPinia());
  vi.clearAllMocks();
  vi.unstubAllGlobals();
  vi.mocked(api.get).mockResolvedValue(entries);
});

describe('AdminEntriesView', () => {
  it('lists each entry with its number, name, description and creator', async () => {
    const wrapper = mount(AdminEntriesView);
    await flushPromises();

    expect(wrapper.text()).toContain('#01');
    expect(wrapper.text()).toContain('Croqueta');
    expect(wrapper.text()).toContain('Con jamón.');
    expect(wrapper.text()).toContain('Laura');
  });

  it('shows the favorite vote count, and hides medal columns, when votingMode is FAVORITES', async () => {
    useContestStore().votingMode = 'FAVORITES';
    const wrapper = mount(AdminEntriesView);
    await flushPromises();

    expect(wrapper.text()).toContain('Favoritos');
    expect(wrapper.find('tbody tr').text()).toContain('4');
    expect(wrapper.text()).not.toContain('Oro');
  });

  it('shows the medal tally, and hides the favorites column, when votingMode is MEDALS', async () => {
    useContestStore().votingMode = 'MEDALS';
    const wrapper = mount(AdminEntriesView);
    await flushPromises();

    const row = wrapper.find('tbody tr');
    expect(wrapper.text()).not.toContain('Favoritos');
    expect(wrapper.text()).toContain('Oro');
    expect(row.text()).toContain('2');
    expect(row.text()).toContain('1');
    expect(row.text()).toContain('0');
  });

  it('edits an entry after confirming both prompts', async () => {
    vi.spyOn(window, 'prompt').mockReturnValueOnce('Croqueta de jamón').mockReturnValueOnce('Con jamón ibérico.');
    vi.mocked(api.patch).mockResolvedValue({});
    const wrapper = mount(AdminEntriesView);
    await flushPromises();

    await wrapper.find('button.admin-table__edit').trigger('click');
    await flushPromises();

    expect(api.patch).toHaveBeenCalledWith('/api/admin/entries/e1', {
      name: 'Croqueta de jamón',
      description: 'Con jamón ibérico.',
    });
  });

  it('does not edit when the first prompt is cancelled', async () => {
    vi.spyOn(window, 'prompt').mockReturnValueOnce(null);
    const wrapper = mount(AdminEntriesView);
    await flushPromises();

    await wrapper.find('button.admin-table__edit').trigger('click');
    await flushPromises();

    expect(api.patch).not.toHaveBeenCalled();
  });

  it('deletes an entry after confirming', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    vi.mocked(api.delete).mockResolvedValue({});
    const wrapper = mount(AdminEntriesView);
    await flushPromises();

    await wrapper.find('button.admin-table__delete').trigger('click');
    await flushPromises();

    expect(api.delete).toHaveBeenCalledWith('/api/admin/entries/e1');
  });

  it('asks for confirmation showing the number, name, description and creator', async () => {
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(false);
    const wrapper = mount(AdminEntriesView);
    await flushPromises();

    await wrapper.find('button.admin-table__delete').trigger('click');

    const message = confirmSpy.mock.calls[0][0] as string;
    expect(message).toContain('#01');
    expect(message).toContain('Croqueta');
    expect(message).toContain('Con jamón.');
    expect(message).toContain('Laura');
  });
});
