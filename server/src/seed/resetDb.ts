import fs from 'node:fs';
import { config } from '../config';

if (fs.existsSync(config.dbPath)) fs.rmSync(config.dbPath);
if (fs.existsSync(`${config.dbPath}-wal`)) fs.rmSync(`${config.dbPath}-wal`);
if (fs.existsSync(`${config.dbPath}-shm`)) fs.rmSync(`${config.dbPath}-shm`);
if (fs.existsSync(config.uploadsDir)) fs.rmSync(config.uploadsDir, { recursive: true, force: true });
console.log('Concurso reseteado: base de datos y fotos eliminadas.');
