import { describe, it, expect, vi, beforeEach } from 'vitest';
import { api, ApiError } from './api';

beforeEach(() => {
  localStorage.clear();
  vi.unstubAllGlobals();
});

describe('api', () => {
  it('sends X-User-Id when a session is stored', async () => {
    localStorage.setItem('pinchoParty.userId', 'u1');
    localStorage.setItem('pinchoParty.userName', 'Laura');
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({ ok: true }) });
    vi.stubGlobal('fetch', fetchMock);

    await api.get('/api/votes/me');

    const [, options] = fetchMock.mock.calls[0];
    expect((options.headers as Headers).get('X-User-Id')).toBe('u1');
  });

  it('does not send X-User-Id when there is no session', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({}) });
    vi.stubGlobal('fetch', fetchMock);

    await api.get('/api/contest');

    const [, options] = fetchMock.mock.calls[0];
    expect((options.headers as Headers).get('X-User-Id')).toBeNull();
  });

  it('sends a JSON body and Content-Type on post()', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 201, json: async () => ({ id: 'u1' }) });
    vi.stubGlobal('fetch', fetchMock);

    await api.post('/api/users', { name: 'Laura' });

    const [, options] = fetchMock.mock.calls[0];
    expect((options.headers as Headers).get('Content-Type')).toBe('application/json');
    expect(options.body).toBe(JSON.stringify({ name: 'Laura' }));
  });

  it('throws ApiError with the server-provided code and message on failure', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 409,
      json: async () => ({ code: 'ALREADY_STARTED', message: 'El concurso ya ha empezado.' }),
    });
    vi.stubGlobal('fetch', fetchMock);

    await expect(api.post('/api/admin/contest/start')).rejects.toMatchObject({
      status: 409,
      code: 'ALREADY_STARTED',
      message: 'El concurso ya ha empezado.',
    });
  });

  it('falls back to a generic message if the error body is not JSON', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      json: async () => {
        throw new Error('not json');
      },
    });
    vi.stubGlobal('fetch', fetchMock);

    await expect(api.get('/api/contest')).rejects.toBeInstanceOf(ApiError);
  });
});
