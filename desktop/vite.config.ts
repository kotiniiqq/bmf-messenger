import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), 'VITE_');

  // A release built without an API address falls back to localhost, and every
  // request then fails before it leaves the tester's machine — the app looks
  // completely broken for a reason nothing on screen explains. Fail the build
  // rather than ship that.
  if (mode === 'production' && !env.VITE_API_BASE) {
    throw new Error(
      'VITE_API_BASE is not set. It comes from desktop/.env.production, which has to be ' +
        'committed — without it the packaged client talks to http://localhost:3000.',
    );
  }

  return {
    plugins: [react()],
    // Electron loads the bundle from the filesystem, so asset URLs must be relative.
    base: './',
    build: { outDir: 'dist', emptyOutDir: true },
    server: { port: 5173, strictPort: true },
  };
});
