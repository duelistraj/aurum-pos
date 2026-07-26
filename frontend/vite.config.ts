import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

const LOCAL_API_URL = 'http://localhost:8080'
const LOCAL_DEV_PORT = 5174
const VALID_DISTRIBUTIONS = new Set(['cloud', 'self_hosted'])

export default defineConfig(({ command, mode }) => {
  const environment = loadEnv(mode, process.cwd(), '')
  const distribution = environment.VITE_DISTRIBUTION || 'self_hosted'

  if (command === 'build') {
    if (!VALID_DISTRIBUTIONS.has(distribution)) {
      throw new Error('VITE_DISTRIBUTION must be cloud or self_hosted.')
    }
    if (
      distribution === 'self_hosted'
      && !/^https?:\/\/[^/\s]+/i.test(environment.VITE_API_URL || '')
    ) {
      throw new Error(
        'Self-hosted builds require VITE_API_URL with a full HTTP or HTTPS URL.',
      )
    }
    if (
      environment.VITE_GOOGLE_AUTH_ENABLED
      && !['true', 'false'].includes(environment.VITE_GOOGLE_AUTH_ENABLED)
    ) {
      throw new Error('VITE_GOOGLE_AUTH_ENABLED must be true or false.')
    }
  }

  return {
    plugins: [react()],
    server: {
      port: LOCAL_DEV_PORT,
      strictPort: true,
      proxy: {
        '/api': {
          target: LOCAL_API_URL,
          changeOrigin: true,
          rewrite: (path) => path.replace(/^\/api/, '')
        }
      }
    }
  }
})
