import { describe, it, expect, vi } from 'vitest';
import { ZodError, z } from 'zod';
import { errorHandler } from './errorHandler';
import { AppError } from './errors';

function mockRes() {
  const res: any = {};
  res.status = vi.fn().mockReturnValue(res);
  res.json = vi.fn().mockReturnValue(res);
  return res;
}

describe('errorHandler', () => {
  it('formats an AppError with its own status and code', () => {
    const res = mockRes();
    errorHandler(new AppError(409, 'ALREADY_STARTED', 'El concurso ya ha empezado.'), {} as any, res, vi.fn());
    expect(res.status).toHaveBeenCalledWith(409);
    expect(res.json).toHaveBeenCalledWith({ code: 'ALREADY_STARTED', message: 'El concurso ya ha empezado.' });
  });

  it('formats a ZodError as 400 VALIDATION_ERROR', () => {
    const res = mockRes();
    const schema = z.object({ name: z.string() });
    let zodError: ZodError;
    try {
      schema.parse({});
      throw new Error('should not reach');
    } catch (e) {
      zodError = e as ZodError;
    }
    errorHandler(zodError, {} as any, res, vi.fn());
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ code: 'VALIDATION_ERROR' }));
  });

  it('falls back to 500 for unknown errors, without leaking internals', () => {
    const res = mockRes();
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    errorHandler(new Error('db connection reset'), {} as any, res, vi.fn());
    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({ code: 'INTERNAL_ERROR', message: 'Ha ocurrido un error inesperado.' });
    consoleSpy.mockRestore();
  });
});
