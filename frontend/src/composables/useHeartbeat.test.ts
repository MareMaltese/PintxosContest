import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { defineComponent } from 'vue';
import { mount } from '@vue/test-utils';
import { setActivePinia, createPinia } from 'pinia';

vi.mock('../services/api', async () => {
  const actual = await vi.importActual<typeof import('../services/api')>('../services/api');
  return { ...actual, api: { ...actual.api, post: vi.fn().mockResolvedValue(undefined) } };
});

import { api } from '../services/api';
import { useSessionStore } from '../stores/session';
import { useHeartbeat } from './useHeartbeat';

const HostComponent = defineComponent({
  setup() {
    useHeartbeat();
    return () => null;
  },
});

beforeEach(() => {
  vi.useFakeTimers();
  setActivePinia(createPinia());
  vi.clearAllMocks();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('useHeartbeat', () => {
  it('does nothing when there is no session', async () => {
    mount(HostComponent);
    await vi.advanceTimersByTimeAsync(0);
    expect(api.post).not.toHaveBeenCalled();
  });

  it('sends an immediate heartbeat and repeats every 20s while a session exists', async () => {
    const session = useSessionStore();
    session.user = { id: 'u1', name: 'Laura' };

    mount(HostComponent);
    await vi.advanceTimersByTimeAsync(0);
    expect(api.post).toHaveBeenCalledWith('/api/users/u1/heartbeat');
    expect(api.post).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(20_000);
    expect(api.post).toHaveBeenCalledTimes(2);
  });

  it('stops sending heartbeats after unmount', async () => {
    const session = useSessionStore();
    session.user = { id: 'u1', name: 'Laura' };
    const wrapper = mount(HostComponent);
    await vi.advanceTimersByTimeAsync(0);

    wrapper.unmount();
    await vi.advanceTimersByTimeAsync(40_000);

    expect(api.post).toHaveBeenCalledTimes(1);
  });
});
