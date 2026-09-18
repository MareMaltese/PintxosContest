import { describe, it, expect, beforeEach } from 'vitest';
import { mount } from '@vue/test-utils';
import { setActivePinia, createPinia } from 'pinia';
import ContestFinishedModal from './ContestFinishedModal.vue';
import { useContestStore } from '../../stores/contest';
import { useSessionStore } from '../../stores/session';

beforeEach(() => {
  setActivePinia(createPinia());
});

describe('ContestFinishedModal', () => {
  it('shows immediately when a returning session lands on an already-finished contest', async () => {
    useContestStore().phase = 'RESULTS';
    useSessionStore().user = { id: 'u1', name: 'Laura' };
    const wrapper = mount(ContestFinishedModal);
    await wrapper.vm.$nextTick();

    expect(wrapper.find('.contest-finished-modal').exists()).toBe(true);
    expect(wrapper.text()).toContain('Las votaciones ya han finalizado');
    expect(wrapper.find('.icon').exists()).toBe(true);
  });

  it('shows once a brand-new user finishes registering into an already-finished contest', async () => {
    useContestStore().phase = 'RESULTS';
    const session = useSessionStore();
    const wrapper = mount(ContestFinishedModal);
    expect(wrapper.find('.contest-finished-modal').exists()).toBe(false);

    session.user = { id: 'u1', name: 'Laura' };
    await wrapper.vm.$nextTick();

    expect(wrapper.find('.contest-finished-modal').exists()).toBe(true);
  });

  it('does not show while the contest is still ongoing', () => {
    useContestStore().phase = 'VOTING';
    useSessionStore().user = { id: 'u1', name: 'Laura' };
    const wrapper = mount(ContestFinishedModal);
    expect(wrapper.find('.contest-finished-modal').exists()).toBe(false);
  });

  it('does not show for an anonymous visitor', () => {
    useContestStore().phase = 'RESULTS';
    const wrapper = mount(ContestFinishedModal);
    expect(wrapper.find('.contest-finished-modal').exists()).toBe(false);
  });

  it('does not reopen after being dismissed, even if it would re-check', async () => {
    useContestStore().phase = 'RESULTS';
    const session = useSessionStore();
    session.user = { id: 'u1', name: 'Laura' };
    const wrapper = mount(ContestFinishedModal);
    await wrapper.vm.$nextTick();

    await wrapper.find('.contest-finished-modal__dismiss').trigger('click');
    expect(wrapper.find('.contest-finished-modal').exists()).toBe(false);

    session.user = { id: 'u1', name: 'Laura' };
    await wrapper.vm.$nextTick();
    expect(wrapper.find('.contest-finished-modal').exists()).toBe(false);
  });
});
