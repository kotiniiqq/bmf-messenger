import { open, type CityResponse, type Reader } from 'maxmind';
import { config } from './config.js';
import { logger } from './logger.js';

/**
 * City lookup against a local database. Nothing leaves this process — sending
 * user addresses to a third-party lookup service would be a worse privacy
 * trade than the one ADR 0003 already accepts.
 *
 * The database is optional. Without it every session simply has a null city.
 */
let reader: Reader<CityResponse> | null = null;
let loading: Promise<Reader<CityResponse> | null> | null = null;

function loadReader(): Promise<Reader<CityResponse> | null> {
  loading ??= open<CityResponse>(config.GEOIP_DB_PATH)
    .then((db) => {
      logger.info({ path: config.GEOIP_DB_PATH }, 'geoip database loaded');
      reader = db;
      return db;
    })
    .catch(() => {
      logger.warn({ path: config.GEOIP_DB_PATH }, 'geoip database unavailable; city will be null');
      return null;
    });

  return loading;
}

/** Addresses that can never resolve to a city — skip the lookup entirely. */
const PRIVATE_RANGES =
  /^(10\.|127\.|169\.254\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|::1$|fe80:|fc|fd)/i;

export async function lookupCity(ip: string | undefined): Promise<string | null> {
  if (!ip || PRIVATE_RANGES.test(ip)) return null;

  const db = reader ?? (await loadReader());
  if (!db) return null;

  try {
    return db.get(ip)?.city?.names?.en ?? null;
  } catch {
    // Malformed address: not worth failing a login over.
    return null;
  }
}
