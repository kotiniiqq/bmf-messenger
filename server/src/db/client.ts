import postgres from 'postgres';
import { config } from '../lib/config.js';

export const sql = postgres(config.DATABASE_URL, {
  max: 10,
  idle_timeout: 30,
  transform: postgres.camel,
});
