import type { ErrorRequestHandler } from 'express';
import { ZodError } from 'zod';
import { AppError } from './errors';

export const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
  if (err instanceof AppError) {
    res.status(err.status).json({ code: err.code, message: err.message });
    return;
  }
  if (err instanceof ZodError) {
    res.status(400).json({ code: 'VALIDATION_ERROR', message: 'Datos inválidos.', issues: err.issues });
    return;
  }
  console.error(err);
  res.status(500).json({ code: 'INTERNAL_ERROR', message: 'Ha ocurrido un error inesperado.' });
};
