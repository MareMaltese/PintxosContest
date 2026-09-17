import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import { setActivePinia, createPinia } from 'pinia';
import MyEntriesView from './MyEntriesView.vue';

const { push } = vi.hoisted(() => ({ push: vi.fn() }));
vi.mock('vue-router', () => ({
  useRouter: () => ({ push }),
}));

vi.mock('../services/api', async () => {
  const actual = await vi.importActual<typeof import('../services/api')>('../services/api');
  return { ...actual, api: { ...actual.api, get: vi.fn(), delete: vi.fn() } };
});

import { api } from '../services/api';

beforeEach(() => {
  setActivePinia(createPinia());
  vi.clearAllMocks();
});

describe('MyEntriesView', () => {
  it('shows a loading state initially', async () => {
    vi.mocked(api.get).mockReturnValue(new Promise(() => {}));
    const wrapper = mount(MyEntriesView);
    await flushPromises();
    expect(wrapper.text()).toContain('Cargando');
  });

  it('lists my entries once loaded', async () => {
    vi.mocked(api.get).mockResolvedValue([
      { id: 'e1', number: 3, creatorId: 'me', name: 'Croqueta', description: 'Con jamón.', imagePath: 'a.webp', createdAt: 'x' },
    ]);
    const wrapper = mount(MyEntriesView);
    await flushPromises();

    expect(wrapper.text()).toContain('#03');
    expect(wrapper.text()).toContain('Croqueta');
    expect(wrapper.text()).toContain('Con jamón.');
  });

  it('shows an empty state when there are no entries yet', async () => {
    vi.mocked(api.get).mockResolvedValue([]);
    const wrapper = mount(MyEntriesView);
    await flushPromises();
    expect(wrapper.text()).toContain('Todavía no has registrado ningún pincho.');
  });

  it('navigates to /pincho/nuevo when "Añadir otro pincho" is clicked', async () => {
    vi.mocked(api.get).mockResolvedValue([]);
    const wrapper = mount(MyEntriesView);
    await flushPromises();

    await wrapper.find('.my-entries__add').trigger('click');
    expect(push).toHaveBeenCalledWith({ name: 'new-entry' });
  });

  it('navigates to the edit screen for that entry', async () => {
    vi.mocked(api.get).mockResolvedValue([
      { id: 'e1', number: 3, creatorId: 'me', name: 'Croqueta', description: 'Con jamón.', imagePath: 'a.webp', createdAt: 'x' },
    ]);
    const wrapper = mount(MyEntriesView);
    await flushPromises();

    await wrapper.find('.my-entries__edit').trigger('click');

    expect(push).toHaveBeenCalledWith({ name: 'edit-entry', params: { id: 'e1' } });
  });

  it('deletes an entry after confirming the pop-up, showing its details', async () => {
    vi.mocked(api.get).mockResolvedValue([
      { id: 'e1', number: 3, creatorId: 'me', name: 'Croqueta', description: 'Con jamón.', imagePath: 'a.webp', createdAt: 'x' },
    ]);
    vi.mocked(api.delete).mockResolvedValue({ ok: true });
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);
    const wrapper = mount(MyEntriesView);
    await flushPromises();

    await wrapper.find('.my-entries__delete').trigger('click');
    await flushPromises();

    expect(confirmSpy).toHaveBeenCalledWith(expect.stringContaining('#03'));
    expect(confirmSpy).toHaveBeenCalledWith(expect.stringContaining('Croqueta'));
    expect(confirmSpy).toHaveBeenCalledWith(expect.stringContaining('Con jamón.'));
    expect(api.delete).toHaveBeenCalledWith('/api/entries/e1');
  });

  it('does not delete when the confirmation is cancelled', async () => {
    vi.mocked(api.get).mockResolvedValue([
      { id: 'e1', number: 3, creatorId: 'me', name: 'Croqueta', description: 'Con jamón.', imagePath: 'a.webp', createdAt: 'x' },
    ]);
    vi.spyOn(window, 'confirm').mockReturnValue(false);
    const wrapper = mount(MyEntriesView);
    await flushPromises();

    await wrapper.find('.my-entries__delete').trigger('click');
    await flushPromises();

    expect(api.delete).not.toHaveBeenCalled();
  });

  it('closing the view navigates back to the gallery', async () => {
    vi.mocked(api.get).mockResolvedValue([]);
    const wrapper = mount(MyEntriesView);
    await flushPromises();

    await wrapper.find('.my-entries__close').trigger('click');
    expect(push).toHaveBeenCalledWith({ name: 'gallery' });
  });
});
