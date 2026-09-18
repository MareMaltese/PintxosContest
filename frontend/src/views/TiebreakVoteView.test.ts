import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import { setActivePinia, createPinia } from 'pinia';

const pushMock = vi.fn();
vi.mock('vue-router', () => ({
  useRouter: () => ({ push: pushMock }),
}));

vi.mock('../services/api', async () => {
  const actual = await vi.importActual<typeof import('../services/api')>('../services/api');
  return { ...actual, api: { ...actual.api, get: vi.fn(), post: vi.fn() } };
});

import { api, ApiError } from '../services/api';
import { useContestStore } from '../stores/contest';
import TiebreakVoteView from './TiebreakVoteView.vue';

beforeEach(() => {
  vi.clearAllMocks();
  setActivePinia(createPinia());
});

describe('TiebreakVoteView', () => {
  it('shows a loading state initially', async () => {
    vi.mocked(api.get).mockReturnValue(new Promise(() => {}));
    const wrapper = mount(TiebreakVoteView);
    await flushPromises();
    expect(wrapper.text()).toContain('Cargando');
  });

  it('shows the main-contest label and candidates for a MAIN round', async () => {
    vi.mocked(api.get).mockResolvedValue({
      round: { id: 'r1', targetRank: 2, kind: 'MAIN', status: 'OPEN' },
      candidates: [
        { id: 'e1', number: 3, name: 'Croqueta', imagePath: 'a.webp' },
        { id: 'e2', number: 5, name: null, imagePath: 'b.webp' },
      ],
    });
    const wrapper = mount(TiebreakVoteView);
    await flushPromises();

    expect(wrapper.text()).toContain('Desempate del concurso');
    expect(wrapper.text()).toContain('#03');
    expect(wrapper.text()).toContain('#05');
  });

  it('shows the medallas label for a MEDAL round', async () => {
    vi.mocked(api.get).mockResolvedValue({
      round: { id: 'r1', targetRank: 1, kind: 'MEDAL', status: 'OPEN' },
      candidates: [{ id: 'e1', number: 1, name: null, imagePath: 'a.webp' }],
    });
    const wrapper = mount(TiebreakVoteView);
    await flushPromises();

    expect(wrapper.text()).toContain('Desempate de medallas');
  });

  it('casts a vote and shows a thank-you message', async () => {
    vi.mocked(api.get).mockResolvedValue({
      round: { id: 'r1', targetRank: 1, kind: 'MAIN', status: 'OPEN' },
      candidates: [{ id: 'e1', number: 1, name: null, imagePath: 'a.webp' }],
    });
    vi.mocked(api.post).mockResolvedValue({ ok: true });
    const wrapper = mount(TiebreakVoteView);
    await flushPromises();

    await wrapper.find('.tiebreak__card').trigger('click');
    await flushPromises();

    expect(api.post).toHaveBeenCalledWith('/api/tiebreak/vote', { entryId: 'e1' });
    expect(wrapper.text()).toContain('registrado');
  });

  it('shows the "premio al último" label when targetRank is past the podium (reused MEDAL kind)', async () => {
    vi.mocked(api.get).mockResolvedValue({
      round: { id: 'r1', targetRank: 4, kind: 'MEDAL', status: 'OPEN' },
      candidates: [{ id: 'e1', number: 4, name: null, imagePath: 'd.webp' }],
    });
    const wrapper = mount(TiebreakVoteView);
    await flushPromises();

    expect(wrapper.text()).toContain('Desempate: premio al último');
  });

  it('shows a retryable error when loading fails', async () => {
    vi.mocked(api.get).mockRejectedValue(new Error('network down'));
    const wrapper = mount(TiebreakVoteView);
    await flushPromises();
    expect(wrapper.text()).toContain('No hemos podido cargar el desempate.');
  });

  describe('waiting for the admin to start a pending tiebreak', () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('shows a waiting message instead of an error when there is no open round yet', async () => {
      vi.mocked(api.get).mockRejectedValue(new ApiError(404, 'NO_OPEN_ROUND', 'No hay ninguna ronda de desempate abierta.'));
      const wrapper = mount(TiebreakVoteView);
      await flushPromises();

      expect(wrapper.text()).toContain('¡Hay un empate!');
      expect(wrapper.text()).not.toContain('No hay ninguna ronda de desempate abierta.');
    });

    it('picks up the round automatically once the admin starts it, without user action', async () => {
      vi.mocked(api.get).mockRejectedValueOnce(
        new ApiError(404, 'NO_OPEN_ROUND', 'No hay ninguna ronda de desempate abierta.')
      );
      const wrapper = mount(TiebreakVoteView);
      await flushPromises();
      expect(wrapper.text()).toContain('¡Hay un empate!');

      vi.mocked(api.get).mockResolvedValue({
        round: { id: 'r1', targetRank: 4, kind: 'MEDAL', status: 'OPEN' },
        candidates: [{ id: 'e1', number: 4, name: null, imagePath: 'd.webp' }],
      });
      await vi.advanceTimersByTimeAsync(5000);
      await flushPromises();

      expect(wrapper.text()).toContain('Desempate: premio al último');
    });
  });

  describe('after voting', () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('keeps polling after voting and picks up a new round instead of staying stuck', async () => {
      vi.mocked(api.get).mockResolvedValue({
        round: { id: 'r1', targetRank: 1, kind: 'MAIN', status: 'OPEN' },
        candidates: [{ id: 'e1', number: 1, name: null, imagePath: 'a.webp' }],
      });
      vi.mocked(api.post).mockResolvedValue({ ok: true });
      const wrapper = mount(TiebreakVoteView);
      await flushPromises();

      await wrapper.find('.tiebreak__card').trigger('click');
      await flushPromises();
      expect(wrapper.text()).toContain('registrado');

      vi.mocked(api.get).mockResolvedValue({
        round: { id: 'r2', targetRank: 1, kind: 'MEDAL', status: 'OPEN' },
        candidates: [{ id: 'e2', number: 2, name: null, imagePath: 'b.webp' }],
      });
      await vi.advanceTimersByTimeAsync(5000);
      await flushPromises();

      expect(wrapper.text()).not.toContain('registrado');
      expect(wrapper.text()).toContain('Desempate de medallas');
    });

    it('does not reset the voted state while polling still returns the same round', async () => {
      vi.mocked(api.get).mockResolvedValue({
        round: { id: 'r1', targetRank: 1, kind: 'MAIN', status: 'OPEN' },
        candidates: [{ id: 'e1', number: 1, name: null, imagePath: 'a.webp' }],
      });
      vi.mocked(api.post).mockResolvedValue({ ok: true });
      const wrapper = mount(TiebreakVoteView);
      await flushPromises();

      await wrapper.find('.tiebreak__card').trigger('click');
      await flushPromises();

      await vi.advanceTimersByTimeAsync(5000);
      await flushPromises();

      expect(wrapper.text()).toContain('registrado');
    });

    it('navigates away once the contest phase leaves TIEBREAK (e.g. results are ready)', async () => {
      vi.mocked(api.get).mockResolvedValue({
        round: { id: 'r1', targetRank: 1, kind: 'MAIN', status: 'OPEN' },
        candidates: [{ id: 'e1', number: 1, name: null, imagePath: 'a.webp' }],
      });
      mount(TiebreakVoteView);
      await flushPromises();

      useContestStore().phase = 'RESULTS';
      await flushPromises();

      expect(pushMock).toHaveBeenCalledWith({ name: 'gallery' });
    });
  });
});
