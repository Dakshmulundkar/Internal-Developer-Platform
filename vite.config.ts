import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      // All API calls (/auth, /projects, /incidents, etc.) proxy to FastAPI
      '/auth': { target: 'http://localhost:8000', changeOrigin: true },
      '/projects': { target: 'http://localhost:8000', changeOrigin: true },
      '/deployments': { target: 'http://localhost:8000', changeOrigin: true },
      '/incidents': { target: 'http://localhost:8000', changeOrigin: true },
      '/rollback': { target: 'http://localhost:8000', changeOrigin: true },
      '/notifications': { target: 'http://localhost:8000', changeOrigin: true },
      '/audit': { target: 'http://localhost:8000', changeOrigin: true },
      '/ai': { target: 'http://localhost:8000', changeOrigin: true },
      '/monitoring': { target: 'http://localhost:8000', changeOrigin: true },
      '/plugins': { target: 'http://localhost:8000', changeOrigin: true },
      '/webhooks': { target: 'http://localhost:8000', changeOrigin: true },
      '/health': { target: 'http://localhost:8000', changeOrigin: true },
      '/docs': { target: 'http://localhost:8000', changeOrigin: true },
      '/redoc': { target: 'http://localhost:8000', changeOrigin: true },
      // WebSocket connections proxy to FastAPI WebSocket endpoint
      '/ws': {
        target: 'ws://localhost:8000',
        ws: true,
        changeOrigin: true,
      },
    },
  },
})
