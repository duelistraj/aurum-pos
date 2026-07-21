import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

const LOCAL_API_URL = 'http://localhost:8080'
const LOCAL_DEV_PORT = 5174

export default defineConfig({
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
})
