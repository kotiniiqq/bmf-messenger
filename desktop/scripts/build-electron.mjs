import { build } from 'esbuild';
import { cp, mkdir, rm } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Bundles the main and preload processes instead of just transpiling them.
 *
 * Transpiling leaves bare imports like `electron-updater` in the output, and the
 * packaged app has no node_modules to resolve them from — it dies at startup
 * with ERR_MODULE_NOT_FOUND. Declaring them as dependencies instead would make
 * electron-builder run npm install inside the workspace, which rewrites the
 * hoisted node_modules it is running from. Bundling avoids both.
 */

const here = dirname(dirname(fileURLToPath(import.meta.url)));
const repoRoot = dirname(here);
const vendorDir = join(here, 'dist-electron', 'node_modules');

/**
 * libsignal is the exception to the bundling rule, and it has to be.
 *
 * It loads a compiled `.node` through node-gyp-build, which finds it by looking
 * next to its own package at runtime. A bundler cannot follow that — esbuild
 * would inline the JavaScript and leave the binary behind, and the app would
 * die on the first attempt to use the privacy mode.
 *
 * So it stays external and its package is copied beside the bundle instead,
 * where Node's ordinary resolution finds it. Only the current platform's
 * prebuild is copied: the other five are 20 MB each and no use on this machine.
 */
const EXTERNAL_PACKAGES = ['@signalapp/libsignal-client', 'node-gyp-build'];

const shared = {
  bundle: true,
  platform: 'node',
  target: 'node20',
  // Electron itself is provided by the runtime and must never be bundled.
  external: ['electron', ...EXTERNAL_PACKAGES],
  sourcemap: false,
  logLevel: 'info',
};

/** Copies the externals next to the bundle so `require` resolves them there. */
async function vendorExternals() {
  await rm(vendorDir, { recursive: true, force: true });
  await mkdir(vendorDir, { recursive: true });

  const platform = `${process.platform}-${process.arch}`;

  for (const name of EXTERNAL_PACKAGES) {
    const from = join(repoRoot, 'node_modules', name);
    const to = join(vendorDir, name);

    await cp(from, to, {
      recursive: true,
      filter: (source) => {
        const inPrebuilds = source.includes(`${join('prebuilds')}`);
        // Keep the prebuilds directory itself, and inside it only ours.
        return !inPrebuilds || source.endsWith('prebuilds') || source.includes(platform);
      },
    });
  }

  console.error(`vendored ${EXTERNAL_PACKAGES.join(', ')} for ${platform}`);
}

await build({
  ...shared,
  entryPoints: ['electron/main.ts'],
  outfile: 'dist-electron/main.cjs',
  // CommonJS, not ESM: electron-updater pulls in fs-extra and graceful-fs, which
  // call require() at runtime — an ESM bundle cannot satisfy that.
  format: 'cjs',
});

await build({
  ...shared,
  entryPoints: ['electron/preload.ts'],
  // A sandboxed preload must be CommonJS; the package is type: module, so the
  // extension has to say so explicitly.
  outfile: 'dist-electron/preload.cjs',
  format: 'cjs',
});

await vendorExternals();

/**
 * The tray and the window need the icon at runtime, and `build/` is only given
 * to electron-builder — it is not shipped inside the app. Copying it next to
 * the bundle is what lets the main process find it in a packaged build, where
 * there is no repository to reach back into.
 */
await cp(join(here, 'build', 'icon.png'), join(here, 'dist-electron', 'icon.png'));
console.error('copied icon.png next to the bundle');
