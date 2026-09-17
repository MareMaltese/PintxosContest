import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';

vi.mock('../services/api', async () => {
  const actual = await vi.importActual<typeof import('../services/api')>('../services/api');
  return { ...actual, api: { ...actual.api, get: vi.fn(), post: vi.fn() } };
});

import { api } from '../services/api';
import TiebreakVoteView from './TiebreakVoteView.vue';

beforeEach(() => {
  vi.clearAllMocks();
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

  it('shows the Pintx-o-visión label for a MEDAL round', async () => {
    vi.mocked(api.get).mockResolvedValue({
      round: { id: 'r1', targetRank: 1, kind: 'MEDAL', status: 'OPEN' },
      candidates: [{ id: 'e1', number: 1, name: null, imagePath: 'a.webp' }],
    });
    const wrapper = mount(TiebreakVoteView);
    await flushPromises();

    expect(wrapper.text()).toContain('Desempate de Pintx-o-visión');
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

  it('shows a retryable error when loading fails', async () => {
    vi.mocked(api.get).mockRejectedValue(new Error('network down'));
    const wrapper = mount(TiebreakVoteView);
    await flushPromises();
    expect(wrapper.text()).toContain('No hemos podido cargar el desempate.');
  });
});
