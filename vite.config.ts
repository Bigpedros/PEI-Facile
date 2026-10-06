import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig} from 'vite';

export default defineConfig(() => {
  return {
    plugins: [react(), tailwindcss()],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
        'motore-ocr-cte': path.resolve(__dirname, './Motore-OCR-CTE-v1.0-INTEGRATION/src/index.ts'),
      },
    },
    server: {
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modifyâfile watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
      // Disable file watching when DISABLE_HMR is true to save CPU during agent edits.
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
    },
    test: {
      // Isolate native Canvas allocations between files; large PDF suites otherwise retain native memory.
      pool: 'forks',
      maxWorkers: 1,
      minWorkers: 1,
      environment: 'jsdom',
      setupFiles: ['./vitest.setup.ts'],
      exclude: ['**/node_modules/**', '**/dist/**', 'Motore-OCR-CTE-v1.0-INTEGRATION/**'],
      include: ['src/**/*.test.ts'],
    },
  };
});
