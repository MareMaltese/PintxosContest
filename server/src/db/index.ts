import { createDb } from './connection';
import { config } from '../config';

export const db = createDb(config.dbPath);
