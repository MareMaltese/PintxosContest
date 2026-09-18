import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { defineComponent } from 'vue';
import { mount } from '@vue/test-utils';

vi.mock('../services/api', async () => {
  const actual = await vi.importActual<typeof import('../services/api')>('../services/api');
  return { ...actual, api: { ...actual.api, get: vi.fn() } };
});

import { api, ApiError } from '../services/api';
import { useTiebreakHistory } from './useTiebreakHistory';

const sampleData = [
  {
    id: 'r1',
    roundNumber: 1,
    kind: 'MAIN' as const,
    targetRank: 1,
    status: 'CLOSED' as const,
    createdAt: '2026-09-18T18:00:00.000Z',
    closedAt: '2026-09-18T18:05:00.000Z',
    candidates: [{ entryId: 'e1', number: 1, name: null, votes: 2 }],
    votes: [{ userName: 'Ana', entryNumber: 1, createdAt: '2026-09-18T18:04:00.000Z' }],
    result: 'RESOLVED' as const,
    winnerEntryId: 'e1',
  },
];

let captured: ReturnType<typeof useTiebreakHistory>;
const HostComponent = defineComponent({
  setup() {
    captured = useTiebreakHistory();
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

describe('useTiebreakHistory', () => {
  it('fetches on mount and polls every 7s', async () => {
    vi.mocked(api.get).mockResolvedValue(sampleData);
    mount(HostComponent);
    await vi.advanceTimersByTimeAsync(0);

    expect(captured.data.value).toEqual(sampleData);
    expect(api.get).toHaveBeenCalledWith('/api/admin/tiebreak/history');
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
  });
});
