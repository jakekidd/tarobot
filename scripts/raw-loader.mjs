// Node ESM loader for Vite-style `?raw` imports.
//
// Vite resolves `import X from './foo.md?raw'` at build time into a
// string export of the file contents. Plain Node (and tsx) have no
// handler for `?raw` — they hit ERR_UNKNOWN_FILE_EXTENSION on the
// underlying .md path.
//
// This loader intercepts any specifier ending with `?raw`, resolves
// the bare path, reads the file synchronously, and synthesizes a
// module that exports the contents as its default export.
//
// Wired into scripts via `node --import ./scripts/raw-loader.mjs ...`
// alongside tsx's own ESM loader. See package.json `scripts.driver` /
// `scripts.e2e`.

import fs from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';

/** @type {import('node:module').ResolveHook} */
export async function resolve(specifier, context, nextResolve) {
  if (!specifier.endsWith('?raw')) {
    return nextResolve(specifier, context);
  }
  const bare = specifier.replace(/\?raw$/, '');
  let resolvedUrl;
  if (bare.startsWith('.') || bare.startsWith('/')) {
    const parentURL = context.parentURL ?? pathToFileURL(process.cwd() + '/').href;
    resolvedUrl = new URL(bare, parentURL).href;
  } else {
    // Bare specifier (e.g. 'foo/bar.md?raw') — let the default
    // resolver find it, then re-attach ?raw.
    const next = await nextResolve(bare, context);
    resolvedUrl = next.url;
  }
  return {
    url: resolvedUrl + '?raw',
    format: 'rawmd',
    shortCircuit: true,
  };
}

/** @type {import('node:module').LoadHook} */
export async function load(url, context, nextLoad) {
  if (url.endsWith('?raw')) {
    const fileUrl = url.replace(/\?raw$/, '');
    const filePath = fileURLToPath(fileUrl);
    const source = fs.readFileSync(filePath, 'utf-8');
    return {
      format: 'module',
      source: `export default ${JSON.stringify(source)};`,
      shortCircuit: true,
    };
  }
  return nextLoad(url, context);
}

// Helpful unused import to make eslint happy if it lands.
void path;
