import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';
import { RELEASE_VERSION } from './releaseVersion';

export default defineConfig({
  plugins: [react()],
  define: {
    __APP_VERSION__: JSON.stringify(RELEASE_VERSION),
  },
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    restoreMocks: true,
  },
});
