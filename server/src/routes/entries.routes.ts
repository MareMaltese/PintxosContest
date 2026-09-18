import { Router } from 'express';
import multer from 'multer';
import { z } from 'zod';
import { db } from '../db';
import { userAuth } from '../middleware/userAuth';
import { asyncHandler } from '../middleware/asyncHandler';
import { AppError } from '../middleware/errors';
import {
  createEntry,
  listEntries,
  getEntry,
  listMyEntries,
  updateOwnEntry,
  deleteOwnEntry,
} from '../services/entryService';
import { saveEntryImage, deleteEntryImage } from '../images/imageProcessor';
import { broadcast } from '../realtime/sse';

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
    const imagePath = await saveEntryImage(db, req.file.buffer);
    const entry = await createEntry(db, {
      creatorId: req.userId!,
      name: fields.name || null,
      description: fields.description || null,
      imagePath,
    });
    broadcast('entries-changed', {});
    res.status(201).json(entry);
  })
);

entriesRouter.get(
  '/',
  userAuth,
  asyncHandler(async (_req, res) => {
    res.json(await listEntries(db));
  })
);

entriesRouter.get(
  '/mine',
  userAuth,
  asyncHandler(async (req, res) => {
    res.json(await listMyEntries(db, req.userId!));
  })
);

const updateOwnEntrySchema = z.object({
  name: z.string().trim().max(80),
  description: z.string().trim().max(280),
});

entriesRouter.patch(
  '/:id',
  userAuth,
  upload.single('image'),
  asyncHandler(async (req, res) => {
    if (req.file && !req.file.mimetype.startsWith('image/')) {
      throw new AppError(400, 'INVALID_IMAGE_TYPE', 'El archivo no es una imagen válida.');
    }
    const fields = updateOwnEntrySchema.parse(req.body);
    let entry = await updateOwnEntry(db, req.userId!, req.params.id, {
      name: fields.name || null,
      description: fields.description || null,
    });
    if (req.file) {
      const oldImagePath = entry.imagePath;
      const imagePath = await saveEntryImage(db, req.file.buffer);
      entry = await updateOwnEntry(db, req.userId!, req.params.id, { imagePath });
      await deleteEntryImage(db, oldImagePath);
    }
    broadcast('entries-changed', {});
    res.json(entry);
  })
);

entriesRouter.delete(
  '/:id',
  userAuth,
  asyncHandler(async (req, res) => {
    const imagePath = await deleteOwnEntry(db, req.userId!, req.params.id);
    await deleteEntryImage(db, imagePath);
    broadcast('entries-changed', {});
    res.json({ ok: true });
  })
);

entriesRouter.get(
  '/:id',
  userAuth,
  asyncHandler(async (req, res) => {
    res.json(await getEntry(db, req.params.id));
  })
);
