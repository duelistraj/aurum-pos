import react from '@vitejs/plugin-react';
import { configDefaults, defineConfig } from 'vitest/config';
import { RELEASE_VERSION } from './releaseVersion';

export default defineConfig({
  plugins: [react()],
  define: {
    __APP_VERSION__: JSON.stringify(RELEASE_VERSION),
  },
  test: {
    environment: 'jsdom',
    exclude: [...configDefaults.exclude, 'e2e/**'],
    setupFiles: ['./src/test/setup.ts'],
    restoreMocks: true,
  },
});
