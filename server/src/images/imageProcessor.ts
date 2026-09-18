import { randomUUID } from 'node:crypto';
import sharp from 'sharp';
import type { Db } from '../db/connection';

export async function saveEntryImage(db: Db, buffer: Buffer): Promise<string> {
  const filename = `${randomUUID()}.webp`;
  const processed = await sharp(buffer)
    .rotate()
    .resize({ width: 1600, height: 1600, fit: 'inside', withoutEnlargement: true })
    .webp({ quality: 80 })
    .toBuffer();
  await db
    .prepare('INSERT INTO Image (path, data, mimeType, createdAt) VALUES (?, ?, ?, ?)')
    .run(filename, processed, 'image/webp', new Date().toISOString());
  return filename;
}

export async function deleteEntryImage(db: Db, filename: string): Promise<void> {
  await db.prepare('DELETE FROM Image WHERE path = ?').run(filename);
}

export interface StoredImage {
  data: Buffer;
  mimeType: string;
}

export async function getEntryImage(db: Db, filename: string): Promise<StoredImage | undefined> {
  const row = (await db.prepare('SELECT data, mimeType FROM Image WHERE path = ?').get(filename)) as unknown as
    | { data: ArrayBuffer; mimeType: string }
    | undefined;
  if (!row) return undefined;
  return { data: Buffer.from(row.data), mimeType: row.mimeType };
}
