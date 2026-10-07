import { createWriteStream } from 'node:fs';
import { mkdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { pipeline } from 'node:stream/promises';
import { createGunzip } from 'node:zlib';

// DB-IP City Lite is free and needs no licence key, unlike MaxMind GeoLite2.
// Licence: CC BY 4.0 — attribution belongs in the about screen.
// The current month is published mid-month, so fall back to the previous one.
const root = dirname(dirname(fileURLToPath(import.meta.url)));
const target = join(root, 'data', 'dbip-city-lite.mmdb');

const stampFor = (monthsBack) => {
  const d = new Date();
  d.setUTCMonth(d.getUTCMonth() - monthsBack);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
};

await mkdir(dirname(target), { recursive: true });

let response;
let url;

for (const monthsBack of [0, 1]) {
  url = `https://download.db-ip.com/free/dbip-city-lite-${stampFor(monthsBack)}.mmdb.gz`;
  response = await fetch(url);
  if (response.ok) break;
  console.error(`not published yet: ${url} (${response.status})`);
}

if (!response?.ok) {
  console.error('Could not download a DB-IP City Lite database.');
  process.exit(1);
}

await pipeline(response.body, createGunzip(), createWriteStream(target));
console.error(`geoip database written to ${target} from ${url}`);
