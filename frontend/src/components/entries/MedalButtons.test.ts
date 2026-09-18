import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import { setActivePinia, createPinia } from 'pinia';
import MedalButtons from './MedalButtons.vue';

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

  it('shows the store error message after a failed choice', async () => {
    vi.mocked(api.put).mockRejectedValue(new Error('boom'));
    const wrapper = mount(MedalButtons, { props: { entryId: 'e1' } });

    await wrapper.findAll('button')[0].trigger('click');
    await flushPromises();

    expect(wrapper.text()).toContain('No hemos podido guardar tu voto.');
  });
});
