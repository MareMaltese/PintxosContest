import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import { setActivePinia, createPinia } from 'pinia';
import MedalButtons from './MedalButtons.vue';
import { useEntriesStore } from '../../stores/entries';
import { useMedalVotesStore } from '../../stores/medalVotes';

vi.mock('../../services/api', async () => {
  const actual = await vi.importActual<typeof import('../../services/api')>('../../services/api');
  return { ...actual, api: { ...actual.api, get: vi.fn(), put: vi.fn() } };
});

import { api } from '../../services/api';

beforeEach(() => {
  setActivePinia(createPinia());
  vi.clearAllMocks();
  vi.mocked(api.get).mockResolvedValue({ gold: null, silver: null, bronze: null });
});

describe('MedalButtons', () => {
  it('shows the three medal buttons, none active', () => {
    const wrapper = mount(MedalButtons, { props: { entryId: 'e1' } });
    const buttons = wrapper.findAll('button');
    expect(buttons).toHaveLength(3);
    expect(wrapper.text()).toContain('Oro');
    expect(wrapper.text()).toContain('Plata');
    expect(wrapper.text()).toContain('Bronce');
    expect(wrapper.find('.medal-buttons__button--active').exists()).toBe(false);
  });

  it('shows the point value under each medal', () => {
    const wrapper = mount(MedalButtons, { props: { entryId: 'e1' } });
    const buttons = wrapper.findAll('button');
    expect(buttons[0].find('.medal-buttons__points').text()).toBe('5 pts');
    expect(buttons[1].find('.medal-buttons__points').text()).toBe('3 pts');
    expect(buttons[2].find('.medal-buttons__points').text()).toBe('1 pt');
  });

  it('assigns GOLD when the gold button is clicked', async () => {
    vi.mocked(api.put).mockResolvedValue({ ok: true });
    const wrapper = mount(MedalButtons, { props: { entryId: 'e1' } });

    await wrapper.findAll('button')[0].trigger('click');
    await flushPromises();

    expect(api.put).toHaveBeenCalledWith('/api/medal-votes/e1', { medal: 'GOLD' });
    expect(wrapper.find('.medal-buttons__button--gold.medal-buttons__button--active').exists()).toBe(true);
  });

  it('clears the medal when its active button is clicked again', async () => {
    vi.mocked(api.put).mockResolvedValue({ ok: true });
    const wrapper = mount(MedalButtons, { props: { entryId: 'e1' } });
    await wrapper.findAll('button')[0].trigger('click');
    await flushPromises();

    await wrapper.findAll('button')[0].trigger('click');
    await flushPromises();

    expect(api.put).toHaveBeenLastCalledWith('/api/medal-votes/e1', { medal: null });
    expect(wrapper.find('.medal-buttons__button--active').exists()).toBe(false);
  });

  it('shows the disabled reason instead of buttons when disabled', () => {
    const wrapper = mount(MedalButtons, {
      props: { entryId: 'e1', disabled: true, disabledReason: 'No puedes puntuar tu propio pincho.' },
    });
    expect(wrapper.find('button').exists()).toBe(false);
    expect(wrapper.text()).toContain('No puedes puntuar tu propio pincho.');
  });

  it('warns before reassigning a medal already held by another entry, showing its number/photo/name', async () => {
    useMedalVotesStore().gold = 'e2';
    useEntriesStore().list = [
      { id: 'e2', number: 5, creatorId: 'u2', name: 'Tortilla', description: null, imagePath: 'b.webp', createdAt: 'x' },
    ];
    const wrapper = mount(MedalButtons, { props: { entryId: 'e1' } });
    await flushPromises();

    await wrapper.findAll('button')[0].trigger('click');
    await flushPromises();

    expect(api.put).not.toHaveBeenCalled();
    expect(wrapper.text()).toContain('#05');
    expect(wrapper.text()).toContain('Tortilla');
    expect(wrapper.find('.medal-buttons__swap-photo').attributes('src')).toBe('/uploads/b.webp');
  });

  it('reassigns the medal once the swap is confirmed', async () => {
    useMedalVotesStore().gold = 'e2';
    vi.mocked(api.put).mockResolvedValue({ ok: true });
    useEntriesStore().list = [
      { id: 'e2', number: 5, creatorId: 'u2', name: 'Tortilla', description: null, imagePath: 'b.webp', createdAt: 'x' },
    ];
    const wrapper = mount(MedalButtons, { props: { entryId: 'e1' } });
    await flushPromises();
    await wrapper.findAll('button')[0].trigger('click');
    await flushPromises();

    await wrapper.find('.medal-buttons__swap-confirm').trigger('click');
    await flushPromises();

    expect(api.put).toHaveBeenCalledWith('/api/medal-votes/e1', { medal: 'GOLD' });
    expect(wrapper.find('.medal-buttons__swap').exists()).toBe(false);
  });

  it('does not reassign the medal when the swap is cancelled', async () => {
    useMedalVotesStore().gold = 'e2';
    useEntriesStore().list = [
      { id: 'e2', number: 5, creatorId: 'u2', name: 'Tortilla', description: null, imagePath: 'b.webp', createdAt: 'x' },
    ];
    const wrapper = mount(MedalButtons, { props: { entryId: 'e1' } });
    await flushPromises();
    await wrapper.findAll('button')[0].trigger('click');
    await flushPromises();

    await wrapper.find('.medal-buttons__swap-cancel').trigger('click');
    await flushPromises();

    expect(api.put).not.toHaveBeenCalled();
    expect(wrapper.find('.medal-buttons__swap').exists()).toBe(false);
  });

  it('does not warn when choosing a medal nobody else currently holds', async () => {
    vi.mocked(api.put).mockResolvedValue({ ok: true });
    const wrapper = mount(MedalButtons, { props: { entryId: 'e1' } });
    await flushPromises();

    await wrapper.findAll('button')[0].trigger('click');
    await flushPromises();

    expect(api.put).toHaveBeenCalledWith('/api/medal-votes/e1', { medal: 'GOLD' });
    expect(wrapper.find('.medal-buttons__swap').exists()).toBe(false);
  });

  it('shows the store error message after a failed choice', async () => {
    vi.mocked(api.put).mockRejectedValue(new Error('boom'));
    const wrapper = mount(MedalButtons, { props: { entryId: 'e1' } });

    await wrapper.findAll('button')[0].trigger('click');
    await flushPromises();

    expect(wrapper.text()).toContain('No hemos podido guardar tu voto.');
  });
});
