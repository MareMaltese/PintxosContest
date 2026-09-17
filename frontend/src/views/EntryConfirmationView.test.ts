import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mount } from '@vue/test-utils';
import { setActivePinia, createPinia } from 'pinia';
import { useEntriesStore } from '../stores/entries';
import EntryConfirmationView from './EntryConfirmationView.vue';

const pushMock = vi.fn();
vi.mock('vue-router', () => ({
  useRouter: () => ({ push: pushMock }),
  useRoute: () => ({ params: { number: '7' } }),
}));

beforeEach(() => {
  setActivePinia(createPinia());
  pushMock.mockClear();
});

describe('EntryConfirmationView', () => {
  it('shows the assigned number even without a stored entry', () => {
    const wrapper = mount(EntryConfirmationView);
    expect(wrapper.text()).toContain('PINCHO Nº 07');
    expect(wrapper.find('img').exists()).toBe(false);
  });

  it('shows the photo when the entry was just created in this session', () => {
    useEntriesStore().setLastCreated({
      id: 'e1',
      number: 7,
      name: 'Croqueta',
      description: null,
      imagePath: 'abc.webp',
    });
    const wrapper = mount(EntryConfirmationView);
    const img = wrapper.find('img');
    expect(img.exists()).toBe(true);
    expect(img.attributes('src')).toBe('/uploads/abc.webp');
  });

  it('navigates to new-entry on "Registrar otro pincho"', async () => {
    const wrapper = mount(EntryConfirmationView);
    await wrapper.findAll('button')[0].trigger('click');
    expect(pushMock).toHaveBeenCalledWith({ name: 'new-entry' });
  });

  it('navigates to the gallery on "Terminar"', async () => {
    const wrapper = mount(EntryConfirmationView);
    await wrapper.findAll('button')[1].trigger('click');
    expect(pushMock).toHaveBeenCalledWith({ name: 'gallery' });
  });
});
