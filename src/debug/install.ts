// One-time bootstrap for debug telemetry. Wraps console.error so the
// overlay can show last-error + error count. Called once from main.tsx.

import { publishDebug } from './debugBus';

let installed = false;
let errorCount = 0;

export function installDebugCounters(): void {
  if (installed) return;
  installed = true;

  publishDebug('errors.count', 0);
  publishDebug('errors.last', '—');

  const originalError = console.error.bind(console);
  console.error = (...args: unknown[]) => {
    errorCount += 1;
    publishDebug('errors.count', errorCount);
    const msg = args
      .map((a) => {
        if (a instanceof Error) return a.message;
        if (typeof a === 'string') return a;
        try { return JSON.stringify(a); } catch { return String(a); }
      })
      .join(' ')
      .slice(0, 140);
    publishDebug('errors.last', msg || '—');
    originalError(...args);
  };

  // Uncaught errors (window-level)
  window.addEventListener('error', (e) => {
    errorCount += 1;
    publishDebug('errors.count', errorCount);
    publishDebug('errors.last', `${e.message}`.slice(0, 140));
  });
  window.addEventListener('unhandledrejection', (e) => {
    errorCount += 1;
    publishDebug('errors.count', errorCount);
    const reason = e.reason instanceof Error ? e.reason.message : String(e.reason);
    publishDebug('errors.last', `unhandled: ${reason}`.slice(0, 140));
  });

  // Initial viewport size
  publishDebug('viewport', `${window.innerWidth}×${window.innerHeight}`);
  window.addEventListener('resize', () => {
    publishDebug('viewport', `${window.innerWidth}×${window.innerHeight}`);
  });
}
