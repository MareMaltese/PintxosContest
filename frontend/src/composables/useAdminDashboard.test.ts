import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { defineComponent } from 'vue';
import { mount } from '@vue/test-utils';

vi.mock('../services/api', async () => {
  const actual = await vi.importActual<typeof import('../services/api')>('../services/api');
  return { ...actual, api: { ...actual.api, get: vi.fn() } };
});

import { api, ApiError } from '../services/api';
import { useAdminDashboard } from './useAdminDashboard';

const sampleData = {
  phase: 'VOTING' as const,
  allowSelfVote: false,
  participantCount: 2,
  entryCount: 1,
  votersFinished: 0,
  votersTotal: 2,
  people: [],
};

let captured: ReturnType<typeof useAdminDashboard>;
const HostComponent = defineComponent({
  setup() {
    captured = useAdminDashboard();
    return () => null;
  },
});

beforeEach(() => {
  vi.useFakeTimers();
  vi.clearAllMocks();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('useAdminDashboard', () => {
  it('fetches on mount and polls every 7s', async () => {
    vi.mocked(api.get).mockResolvedValue(sampleData);
    mount(HostComponent);
    await vi.advanceTimersByTimeAsync(0);

    expect(captured.data.value).toEqual(sampleData);
    expect(captured.isLoading.value).toBe(false);
    expect(api.get).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(7000);
    expect(api.get).toHaveBeenCalledTimes(2);
  });

  it('stops polling after unmount', async () => {
    vi.mocked(api.get).mockResolvedValue(sampleData);
    const wrapper = mount(HostComponent);
    await vi.advanceTimersByTimeAsync(0);

    wrapper.unmount();
    await vi.advanceTimersByTimeAsync(21000);

    expect(api.get).toHaveBeenCalledTimes(1);
  });

  it('surfaces a friendly error on failure', async () => {
    vi.mocked(api.get).mockRejectedValue(new ApiError(500, 'INTERNAL_ERROR', 'Ha ocurrido un error inesperado.'));
    mount(HostComponent);
    await vi.advanceTimersByTimeAsync(0);

    expect(captured.error.value).toBe('Ha ocurrido un error inesperado.');
    expect(captured.isLoading.value).toBe(false);
  });
});
