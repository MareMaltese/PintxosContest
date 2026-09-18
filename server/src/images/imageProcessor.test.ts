import { describe, it, expect, beforeEach } from 'vitest';
import sharp from 'sharp';
import { createDb, type Db } from '../db/connection';
import { saveEntryImage, deleteEntryImage, getEntryImage } from './imageProcessor';

let db: Db;

beforeEach(async () => {
  db = await createDb(':memory:');
});

describe('saveEntryImage', () => {
  it('resizes a large image down to at most 1600px and stores a .webp blob', async () => {
    const input = await sharp({
      create: { width: 3000, height: 2000, channels: 3, background: { r: 200, g: 50, b: 50 } },
    })
      .jpeg()
      .toBuffer();

    const filename = await saveEntryImage(db, input);
    expect(filename).toMatch(/\.webp$/);

    const stored = await getEntryImage(db, filename);
    expect(stored).toBeDefined();
    expect(stored!.mimeType).toBe('image/webp');
    const meta = await sharp(stored!.data).metadata();
    expect(meta.width).toBeLessThanOrEqual(1600);
    expect(meta.height).toBeLessThanOrEqual(1600);
    expect(meta.format).toBe('webp');
  });

  it('does not upscale a small image', async () => {
    const input = await sharp({
      create: { width: 200, height: 100, channels: 3, background: { r: 10, g: 10, b: 10 } },
    })
      .png()
      .toBuffer();
    const filename = await saveEntryImage(db, input);
    const stored = await getEntryImage(db, filename);
    const meta = await sharp(stored!.data).metadata();
    expect(meta.width).toBe(200);
    expect(meta.height).toBe(100);
  });
});

describe('deleteEntryImage', () => {
  it('removes the stored blob so it can no longer be fetched', async () => {
    const input = await sharp({
      create: { width: 100, height: 100, channels: 3, background: { r: 1, g: 2, b: 3 } },
    })
      .png()
      .toBuffer();
    const filename = await saveEntryImage(db, input);
    expect(await getEntryImage(db, filename)).toBeDefined();

    await deleteEntryImage(db, filename);
    expect(await getEntryImage(db, filename)).toBeUndefined();
  });
});

describe('getEntryImage', () => {
  it('returns undefined for a path that was never stored', async () => {
    expect(await getEntryImage(db, 'nonexistent.webp')).toBeUndefined();
  });
});
