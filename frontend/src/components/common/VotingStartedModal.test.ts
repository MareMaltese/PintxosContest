import { describe, it, expect, beforeEach } from 'vitest';
import { mount } from '@vue/test-utils';
import { setActivePinia, createPinia } from 'pinia';
import VotingStartedModal from './VotingStartedModal.vue';
import { useContestStore } from '../../stores/contest';
import { useSessionStore } from '../../stores/session';

beforeEach(() => {
  setActivePinia(createPinia());
});

describe('VotingStartedModal', () => {
  it('does not show on mount, even if the phase is already VOTING', () => {
    useContestStore().phase = 'VOTING';
    useSessionStore().user = { id: 'u1', name: 'Laura' };
    const wrapper = mount(VotingStartedModal);
    expect(wrapper.find('.voting-started-modal').exists()).toBe(false);
  });

  it('shows the popup when the phase transitions from REGISTRATION to VOTING for a guest', async () => {
    const contest = useContestStore();
    contest.phase = 'REGISTRATION';
    useSessionStore().user = { id: 'u1', name: 'Laura' };
    const wrapper = mount(VotingStartedModal);

    contest.phase = 'VOTING';
    await wrapper.vm.$nextTick();

    expect(wrapper.find('.voting-started-modal').exists()).toBe(true);
    expect(wrapper.text()).toContain('¡Ya ha empezado!');
    expect(wrapper.text()).toContain('¡Hagan sus votaciones!');
    expect(wrapper.find('.icon').exists()).toBe(true);
  });

  it('does not show the popup when there is no guest session', async () => {
    const contest = useContestStore();
    contest.phase = 'REGISTRATION';
    const wrapper = mount(VotingStartedModal);

    contest.phase = 'VOTING';
    await wrapper.vm.$nextTick();

    expect(wrapper.find('.voting-started-modal').exists()).toBe(false);
  });

  it('does not show the popup for other phase transitions', async () => {
    const contest = useContestStore();
    contest.phase = 'VOTING';
    useSessionStore().user = { id: 'u1', name: 'Laura' };
    const wrapper = mount(VotingStartedModal);

    contest.phase = 'TIEBREAK';
    await wrapper.vm.$nextTick();

    expect(wrapper.find('.voting-started-modal').exists()).toBe(false);
  });

  it('dismisses when the button is clicked', async () => {
    const contest = useContestStore();
    contest.phase = 'REGISTRATION';
    useSessionStore().user = { id: 'u1', name: 'Laura' };
    const wrapper = mount(VotingStartedModal);
    contest.phase = 'VOTING';
    await wrapper.vm.$nextTick();

    await wrapper.find('.voting-started-modal__dismiss').trigger('click');

    expect(wrapper.find('.voting-started-modal').exists()).toBe(false);
  });
});
