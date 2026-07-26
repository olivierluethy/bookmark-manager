// Deliberately dependency-free: `src/db/client.ts` constructs
// `new SQLocalDrizzle(...)` at module scope, which (per sqlocal's
// `dist/client.js` constructor) synchronously spins up a Web Worker as soon
// as that module is evaluated — merely *importing* client.ts, even just to
// reach `checkEnvironment`, triggers it. This function must be importable
// (by `main.tsx`, before it decides whether to touch the database at all,
// and by `BootGuard`) without ever pulling client.ts into the module graph.

/**
 * SQLocal needs a Worker, OPFS, and cross-origin isolation. Without isolation
 * the browser blocks OPFS and every write is silently discarded, so this must
 * fail loudly at boot rather than let the app appear to work.
 */
export function checkEnvironment(): { ok: true } | { ok: false; reason: string; fix: string } {
  if (typeof Worker === 'undefined') {
    return {
      ok: false,
      reason: 'This browser does not support Web Workers.',
      fix: 'Use a current version of Chrome, Edge, Firefox, Brave, or Safari.',
    };
  }
  if (!navigator.storage?.getDirectory) {
    return {
      ok: false,
      reason: 'This browser does not support the Origin Private File System.',
      fix: 'Use Chrome/Edge 108+, Firefox 111+, or Safari 17+.',
    };
  }
  if (!crossOriginIsolated) {
    return {
      ok: false,
      reason: 'This page is not cross-origin isolated, so the browser blocks database storage.',
      fix: 'Serve the app with the headers "Cross-Origin-Opener-Policy: same-origin" and "Cross-Origin-Embedder-Policy: credentialless".',
    };
  }
  return { ok: true };
}
