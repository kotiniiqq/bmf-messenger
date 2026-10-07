import { cp } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

// tsc only emits JavaScript, so the .sql files would never reach dist/ on their own
// and `npm run migrate` would find an empty migrations directory.
const root = dirname(dirname(fileURLToPath(import.meta.url)));

await cp(join(root, 'src/db/migrations'), join(root, 'dist/db/migrations'), {
  recursive: true,
  filter: (src) => !src.endsWith('.ts'),
});

console.error('migrations copied to dist');
