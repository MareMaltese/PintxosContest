import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import { setActivePinia, createPinia } from 'pinia';
import EntryDetailView from './EntryDetailView.vue';

vi.mock('vue-router', () => ({
  useRoute: () => ({ params: { id: 'e1' } }),
}));

vi.mock('../services/api', async () => {
  const actual = await vi.importActual<typeof import('../services/api')>('../services/api');
  return { ...actual, api: { ...actual.api, get: vi.fn() } };
});

import { api } from '../services/api';

beforeEach(() => {
  setActivePinia(createPinia());
  vi.clearAllMocks();
});

describe('EntryDetailView', () => {
  it('shows a loading state initially', async () => {
    vi.mocked(api.get).mockReturnValue(new Promise(() => {}));
    const wrapper = mount(EntryDetailView);
    await flushPromises();
    expect(wrapper.text()).toContain('Cargando');
  });

  it('shows the entry details once loaded', async () => {
    vi.mocked(api.get).mockResolvedValue({
      id: 'e1',
      number: 7,
      creatorId: 'u1',
      creatorName: 'Laura',
      name: 'Croqueta',
      description: 'Mini brioche de carrillera.',
      imagePath: 'a.webp',
      createdAt: 'x',
    });
    const wrapper = mount(EntryDetailView);
    await flushPromises();

    expect(wrapper.text()).toContain('#07');
    expect(wrapper.text()).toContain('Croqueta');
    expect(wrapper.text()).toContain('Mini brioche de carrillera.');
    expect(wrapper.text()).toContain('Presentado por Laura');
  });

  it('omits the name/description when the entry has none', async () => {
    vi.mocked(api.get).mockResolvedValue({
      id: 'e1',
      number: 3,
      creatorId: 'u1',
      creatorName: 'Miguel',
      name: null,
      description: null,
      imagePath: 'a.webp',
      createdAt: 'x',
    });
    const wrapper = mount(EntryDetailView);
    await flushPromises();

    expect(wrapper.text()).toContain('#03');
    expect(wrapper.text()).toContain('Presentado por Miguel');
  });

  it('shows a retryable error message when loading fails', async () => {
    vi.mocked(api.get).mockRejectedValue(new Error('network down'));
    const wrapper = mount(EntryDetailView);
    await flushPromises();

    expect(wrapper.text()).toContain('No hemos podido cargar esta tapa.');
  });
});
