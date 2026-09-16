import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import sharp from 'sharp';
import { config } from '../config';

let originalUploadsDir: string;

beforeAll(() => {
  originalUploadsDir = config.uploadsDir;
  config.uploadsDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pincho-uploads-'));
});

afterAll(async () => {
  // On Windows, sharp's native file handle (or an AV/indexer scan) can hold the
  // temp directory briefly after .toFile() resolves. Retry a few times, but
  // cleanup is best-effort only -- the OS reclaims the temp dir regardless, so
  // a lingering lock here must never fail the test file.
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      fs.rmSync(config.uploadsDir, { recursive: true, force: true });
      break;
    } catch {
      await new Promise((r) => setTimeout(r, 200));
    }
  }
  config.uploadsDir = originalUploadsDir;
});

describe('saveEntryImage', () => {
  it('resizes a large image down to at most 1600px and writes a .webp file', async () => {
    const { saveEntryImage } = await import('./imageProcessor');
    const input = await sharp({
      create: { width: 3000, height: 2000, channels: 3, background: { r: 200, g: 50, b: 50 } },
    })
      .jpeg()
      .toBuffer();

    const filename = await saveEntryImage(input);
    expect(filename).toMatch(/\.webp$/);
    const fullPath = path.join(config.uploadsDir, filename);
    expect(fs.existsSync(fullPath)).toBe(true);
    const meta = await sharp(fullPath).metadata();
    expect(meta.width).toBeLessThanOrEqual(1600);
    expect(meta.height).toBeLessThanOrEqual(1600);
    expect(meta.format).toBe('webp');
  });

  it('does not upscale a small image', async () => {
    const { saveEntryImage } = await import('./imageProcessor');
    const input = await sharp({
      create: { width: 200, height: 100, channels: 3, background: { r: 10, g: 10, b: 10 } },
    })
      .png()
      .toBuffer();
    const filename = await saveEntryImage(input);
    const meta = await sharp(path.join(config.uploadsDir, filename)).metadata();
    expect(meta.width).toBe(200);
    expect(meta.height).toBe(100);
  });
});
