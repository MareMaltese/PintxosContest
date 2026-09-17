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

  it('postForm sends FormData without a Content-Type header', async () => {
    localStorage.setItem('pinchoParty.userId', 'u1');
    localStorage.setItem('pinchoParty.userName', 'Laura');
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 201, json: async () => ({ id: 'e1' }) });
    vi.stubGlobal('fetch', fetchMock);

    const form = new FormData();
    form.set('name', 'Croqueta');
    await api.postForm('/api/entries', form);

    const [url, options] = fetchMock.mock.calls[0];
    expect(url).toBe('/api/entries');
    expect(options.method).toBe('POST');
    expect((options.headers as Headers).get('X-User-Id')).toBe('u1');
    expect((options.headers as Headers).has('Content-Type')).toBe(false);
    expect(options.body).toBe(form);
  });

  it('postForm rejects with ApiError on a failed upload', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 400,
      json: async () => ({ code: 'IMAGE_REQUIRED', message: 'Falta la fotografía de la tapa.' }),
    });
    vi.stubGlobal('fetch', fetchMock);

    await expect(api.postForm('/api/entries', new FormData())).rejects.toMatchObject({
      status: 400,
      code: 'IMAGE_REQUIRED',
    });
  });

  it('patchForm sends FormData with PATCH and without a Content-Type header', async () => {
    localStorage.setItem('pinchoParty.userId', 'u1');
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({ id: 'e1' }) });
    vi.stubGlobal('fetch', fetchMock);

    const form = new FormData();
    form.set('name', 'Croqueta');
    await api.patchForm('/api/entries/e1', form);

    const [url, options] = fetchMock.mock.calls[0];
    expect(url).toBe('/api/entries/e1');
    expect(options.method).toBe('PATCH');
    expect((options.headers as Headers).has('Content-Type')).toBe(false);
    expect(options.body).toBe(form);
  });

  it('sends a JSON body and Content-Type on put()', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({ ok: true }) });
    vi.stubGlobal('fetch', fetchMock);

    await api.put('/api/medal-votes/e1', { medal: 'GOLD' });

    const [url, options] = fetchMock.mock.calls[0];
    expect(url).toBe('/api/medal-votes/e1');
    expect(options.method).toBe('PUT');
    expect((options.headers as Headers).get('Content-Type')).toBe('application/json');
    expect(options.body).toBe(JSON.stringify({ medal: 'GOLD' }));
  });

  it('sends X-Admin-Pin when a pin is stored', async () => {
    localStorage.setItem('pinchoParty.adminPin', '1234');
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({}) });
    vi.stubGlobal('fetch', fetchMock);

    await api.get('/api/admin/dashboard');

    const [, options] = fetchMock.mock.calls[0];
    expect((options.headers as Headers).get('X-Admin-Pin')).toBe('1234');
  });
});
