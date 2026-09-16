import { randomUUID } from 'node:crypto';
import path from 'node:path';
import fs from 'node:fs/promises';
import fsSync from 'node:fs';
import sharp from 'sharp';
import { config } from '../config';

export async function saveEntryImage(buffer: Buffer): Promise<string> {
  const filename = `${randomUUID()}.webp`;
  await fs.mkdir(config.uploadsDir, { recursive: true });
  const outPath = path.join(config.uploadsDir, filename);
  await sharp(buffer)
    .rotate()
    .resize({ width: 1600, height: 1600, fit: 'inside', withoutEnlargement: true })
    .webp({ quality: 80 })
    .toFile(outPath);
  return filename;
}

export function deleteEntryImage(filename: string): void {
  const filePath = path.join(config.uploadsDir, filename);
  fsSync.rm(filePath, { force: true }, () => {});
}
