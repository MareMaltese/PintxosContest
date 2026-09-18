import fs from 'node:fs';
import { config } from '../config';

const isLocalFile = config.dbUrl.startsWith('file:');
const dbPath = isLocalFile ? config.dbUrl.slice('file:'.length) : null;

if (dbPath) {
  if (fs.existsSync(dbPath)) fs.rmSync(dbPath);
  if (fs.existsSync(`${dbPath}-wal`)) fs.rmSync(`${dbPath}-wal`);
  if (fs.existsSync(`${dbPath}-shm`)) fs.rmSync(`${dbPath}-shm`);
} else {
  console.warn('La base de datos es remota (Turso); este script solo borra las fotos subidas.');
}
if (fs.existsSync(config.uploadsDir)) fs.rmSync(config.uploadsDir, { recursive: true, force: true });
console.log('Concurso reseteado: base de datos y fotos eliminadas.');
