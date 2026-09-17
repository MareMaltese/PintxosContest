import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import { setActivePinia, createPinia } from 'pinia';
import EditEntryView from './EditEntryView.vue';

const { push } = vi.hoisted(() => ({ push: vi.fn() }));
vi.mock('vue-router', () => ({
  useRoute: () => ({ params: { id: 'e1' } }),
  useRouter: () => ({ push }),
}));

vi.mock('../services/api', async () => {
  const actual = await vi.importActual<typeof import('../services/api')>('../services/api');
  return { ...actual, api: { ...actual.api, get: vi.fn(), patchForm: vi.fn() } };
});

vi.mock('../services/image', () => ({
  compressImage: vi.fn(async (file: File) => file),
}));

import { api } from '../services/api';

function makeFile(): File {
  return new File(['fake-image-bytes'], 'photo.jpg', { type: 'image/jpeg' });
}

const entry = {
  id: 'e1',
  number: 3,
  creatorId: 'me',
  name: 'Croqueta',
  description: 'Con jamón.',
  imagePath: 'a.webp',
  createdAt: 'x',
};

beforeEach(() => {
  setActivePinia(createPinia());
  vi.clearAllMocks();
});

describe('EditEntryView', () => {
  it('pre-fills name and description once the entry loads', async () => {
    vi.mocked(api.get).mockResolvedValue([entry]);
    const wrapper = mount(EditEntryView);
    await flushPromises();

    expect((wrapper.find('input#entry-name').element as HTMLInputElement).value).toBe('Croqueta');
    expect((wrapper.find('textarea#entry-description').element as HTMLTextAreaElement).value).toBe('Con jamón.');
    expect(wrapper.find('.edit-entry__preview').attributes('src')).toBe('/uploads/a.webp');
  });

  it('shows a check icon before the save button label', async () => {
    vi.mocked(api.get).mockResolvedValue([entry]);
    const wrapper = mount(EditEntryView);
    await flushPromises();

    const submitButton = wrapper.find('button[type="submit"]');
    expect(submitButton.find('.icon').exists()).toBe(true);
    expect(submitButton.text()).toContain('Guardar');
  });

  it('shows an x icon before the cancel button label', async () => {
    vi.mocked(api.get).mockResolvedValue([entry]);
    const wrapper = mount(EditEntryView);
    await flushPromises();

    const cancelButton = wrapper.find('.edit-entry__cancel');
    expect(cancelButton.find('svg').exists()).toBe(true);
    expect(cancelButton.text()).toContain('Cancelar');
  });

  it('saves name, description and a replacement photo', async () => {
    vi.mocked(api.get).mockResolvedValue([entry]);
    vi.mocked(api.patchForm).mockResolvedValue({});
    const wrapper = mount(EditEntryView);
    await flushPromises();

    await wrapper.find('input#entry-name').setValue('Croqueta de jamón');
    const fileInput = wrapper.find('input[type="file"]');
    Object.defineProperty(fileInput.element, 'files', { value: [makeFile()] });
    await fileInput.trigger('change');

    await wrapper.find('form').trigger('submit.prevent');
    await flushPromises();

    expect(api.patchForm).toHaveBeenCalledTimes(1);
    const [path, form] = vi.mocked(api.patchForm).mock.calls[0];
    expect(path).toBe('/api/entries/e1');
    expect((form as FormData).get('name')).toBe('Croqueta de jamón');
    expect((form as FormData).get('description')).toBe('Con jamón.');
    expect((form as FormData).get('image')).toBeInstanceOf(File);
    expect(push).toHaveBeenCalledWith({ name: 'my-entries' });
  });

  it('saves without a new photo when the picker is left untouched', async () => {
    vi.mocked(api.get).mockResolvedValue([entry]);
    vi.mocked(api.patchForm).mockResolvedValue({});
    const wrapper = mount(EditEntryView);
    await flushPromises();

    await wrapper.find('form').trigger('submit.prevent');
    await flushPromises();

    const [, form] = vi.mocked(api.patchForm).mock.calls[0];
    expect((form as FormData).get('image')).toBeNull();
  });

  it('cancelling navigates back without saving', async () => {
    vi.mocked(api.get).mockResolvedValue([entry]);
    const wrapper = mount(EditEntryView);
    await flushPromises();

    await wrapper.find('.edit-entry__cancel').trigger('click');

    expect(api.patchForm).not.toHaveBeenCalled();
    expect(push).toHaveBeenCalledWith({ name: 'my-entries' });
  });
});
