import { describe, it, expect, vi, beforeEach } from 'vitest';
import { nextTick } from 'vue';
import { mount } from '@vue/test-utils';
import { setActivePinia, createPinia } from 'pinia';
import { useContestStore } from '../stores/contest';
import WaitingRoomView from './WaitingRoomView.vue';

const pushMock = vi.fn();
vi.mock('vue-router', () => ({
  useRouter: () => ({ push: pushMock }),
}));

vi.mock('../composables/useHeartbeat', () => ({
  useHeartbeat: vi.fn(),
}));

beforeEach(() => {
  setActivePinia(createPinia());
  pushMock.mockClear();
});

describe('WaitingRoomView', () => {
  it('shows a waiting message while the contest is still in REGISTRATION', () => {
    const wrapper = mount(WaitingRoomView);
    expect(wrapper.text()).toContain('Ya estás dentro');
    expect(wrapper.text()).toContain('Espera a que el anfitrión');
  });

  it('shows a started message once the phase leaves REGISTRATION', () => {
    useContestStore().phase = 'VOTING';
    const wrapper = mount(WaitingRoomView);
    expect(wrapper.text()).toContain('¡El concurso ha empezado!');
  });

  it('navigates to the gallery once the phase changes while mounted', async () => {
    const contest = useContestStore();
    mount(WaitingRoomView);

    contest.phase = 'VOTING';
    await nextTick();

    expect(pushMock).toHaveBeenCalledWith({ name: 'gallery' });
  });
});
