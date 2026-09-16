import { Router } from 'express';
import multer from 'multer';
import { z } from 'zod';
import { db } from '../db';
import { userAuth } from '../middleware/userAuth';
import { asyncHandler } from '../middleware/asyncHandler';
import { AppError } from '../middleware/errors';
import { createEntry, listEntries, getEntry } from '../services/entryService';
import { saveEntryImage } from '../images/imageProcessor';

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 15 * 1024 * 1024 },
});

const entryFieldsSchema = z.object({
  name: z.string().trim().max(80).optional(),
  description: z.string().trim().max(280).optional(),
});

export const entriesRouter = Router();

entriesRouter.post(
  '/',
  userAuth,
  upload.single('image'),
  asyncHandler(async (req, res) => {
    if (!req.file) {
      throw new AppError(400, 'IMAGE_REQUIRED', 'Falta la fotografía de la tapa.');
    }
    if (!req.file.mimetype.startsWith('image/')) {
      throw new AppError(400, 'INVALID_IMAGE_TYPE', 'El archivo no es una imagen válida.');
    }
    const fields = entryFieldsSchema.parse(req.body);
    const imagePath = await saveEntryImage(req.file.buffer);
    const entry = createEntry(db, {
      creatorId: req.userId!,
      name: fields.name || null,
      description: fields.description || null,
      imagePath,
    });
    res.status(201).json(entry);
  })
);

entriesRouter.get(
  '/',
  userAuth,
  asyncHandler(async (_req, res) => {
    res.json(listEntries(db));
  })
);

entriesRouter.get(
  '/:id',
  userAuth,
  asyncHandler(async (req, res) => {
    res.json(getEntry(db, req.params.id));
  })
);
