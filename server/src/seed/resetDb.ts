import fs from 'node:fs';
import { config } from '../config';

const isLocalFile = config.dbUrl.startsWith('file:');
const dbPath = isLocalFile ? config.dbUrl.slice('file:'.length) : null;

if (dbPath) {
  if (fs.existsSync(dbPath)) fs.rmSync(dbPath);
  if (fs.existsSync(`${dbPath}-wal`)) fs.rmSync(`${dbPath}-wal`);
  if (fs.existsSync(`${dbPath}-shm`)) fs.rmSync(`${dbPath}-shm`);
  console.log('Concurso reseteado: base de datos local eliminada (incluidas las fotos, guardadas en la BD).');
} else {
  console.warn(
    'La base de datos es remota (Turso); este script no la borra automáticamente. ' +
      'Bórrala manualmente desde el dashboard de Turso o con `turso db shell` si quieres empezar de cero.'
  );
}
