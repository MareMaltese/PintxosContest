import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import { setActivePinia, createPinia } from 'pinia';
import NewEntryView from './NewEntryView.vue';

const pushMock = vi.fn();
vi.mock('vue-router', () => ({
  useRouter: () => ({ push: pushMock }),
}));

vi.mock('../services/api', async () => {
  const actual = await vi.importActual<typeof import('../services/api')>('../services/api');
  return { ...actual, api: { ...actual.api, postForm: vi.fn() } };
});

vi.mock('../services/image', () => ({
  compressImage: vi.fn(async (file: File) => file),
}));

import { api } from '../services/api';
import { useEntriesStore } from '../stores/entries';

function makeFile(): File {
  return new File(['fake-image-bytes'], 'photo.jpg', { type: 'image/jpeg' });
}

beforeEach(() => {
  setActivePinia(createPinia());
  pushMock.mockClear();
  vi.clearAllMocks();
});

describe('NewEntryView', () => {
  it('shows a plus-circle icon before "Registrar pincho"', () => {
    const wrapper = mount(NewEntryView);
    expect(wrapper.find('button[type="submit"] .icon').exists()).toBe(true);
  });

  it('shows a validation message when submitting without a photo', async () => {
    const wrapper = mount(NewEntryView);
    await wrapper.find('form').trigger('submit.prevent');
    expect(wrapper.text()).toContain('Haz una foto de tu pincho');
    expect(api.postForm).not.toHaveBeenCalled();
  });

  it('uploads the compressed photo plus optional fields and navigates to the confirmation screen', async () => {
    vi.mocked(api.postForm).mockResolvedValue({
      id: 'e1',
      number: 7,
      name: 'Croqueta',
      description: null,
      imagePath: 'a.webp',
    });
    const wrapper = mount(NewEntryView);

    const fileInput = wrapper.find('input[type="file"]');
    Object.defineProperty(fileInput.element, 'files', { value: [makeFile()] });
    await fileInput.trigger('change');

    await wrapper.find('input#entry-name').setValue('Croqueta');
    await wrapper.find('form').trigger('submit.prevent');
    await flushPromises();

    expect(api.postForm).toHaveBeenCalledTimes(1);
    const [path, form] = vi.mocked(api.postForm).mock.calls[0];
    expect(path).toBe('/api/entries');
    expect(form.get('name')).toBe('Croqueta');
    expect(form.get('image')).toBeInstanceOf(File);

    expect(useEntriesStore().lastCreated).toEqual({
      id: 'e1',
      number: 7,
      name: 'Croqueta',
      description: null,
      imagePath: 'a.webp',
    });
    expect(pushMock).toHaveBeenCalledWith({ name: 'entry-confirmation', params: { number: '7' } });
  });

  it('shows a retryable error and keeps the form usable when the upload fails', async () => {
    vi.mocked(api.postForm).mockRejectedValue(new Error('network down'));
    const wrapper = mount(NewEntryView);

    const fileInput = wrapper.find('input[type="file"]');
    Object.defineProperty(fileInput.element, 'files', { value: [makeFile()] });
    await fileInput.trigger('change');
    await wrapper.find('form').trigger('submit.prevent');
    await flushPromises();

    expect(wrapper.text()).toContain('No hemos podido guardar tu pincho.');
    expect(pushMock).not.toHaveBeenCalled();
    expect(wrapper.find('button[type="submit"]').attributes('disabled')).toBeUndefined();
  });
});
