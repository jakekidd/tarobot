// Vitest config. Inherits Vite's resolution + ?raw imports so the
// engine's materials/ loaders work in tests without changes.

import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts'],
    environment: 'node',
    globals: false,
    coverage: {
      provider: 'v8',
      include: [
        'src/pipeline/survey/**/*.ts',
        'src/pipeline/seer/mantra.ts',
        'src/ui/survey/nameBanks.ts',
      ],
      exclude: [
        '**/*.test.ts',
        'src/pipeline/survey/index.ts',  // barrel
        'src/pipeline/survey/agents/observer.ts',  // adapter wiring
        'src/pipeline/survey/agents/detective.ts',
        'src/pipeline/survey/agents/augur.ts',
      ],
      reporter: ['text', 'html'],
    },
  },
});
