import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  build: {
    // Increase the warning threshold slightly — our chunks are well-split
    chunkSizeWarningLimit: 600,
    rollupOptions: {
      output: {
        // Manual chunking: separate heavy vendor libs so the app shell stays small.
        // Vite 8 (Rolldown) requires manualChunks to be a function, not an object.
        manualChunks(id: string) {
          if (id.includes('node_modules/recharts') || id.includes('node_modules/d3-') || id.includes('node_modules/victory-')) {
            return 'vendor-recharts';
          }
          if (id.includes('node_modules/lucide-react')) {
            return 'vendor-lucide';
          }
          if (id.includes('node_modules/@tanstack')) {
            return 'vendor-query';
          }
          if (id.includes('node_modules/zustand')) {
            return 'vendor-zustand';
          }
          if (id.includes('node_modules/react-dom') || id.includes('node_modules/react/')) {
            return 'vendor-react';
          }
        },
      },
    },
  },
  server: {
    // Docker Desktop holds 5173 → Vite used to auto-shift to 5174, which broke
    // APP_FRONTEND_URL (invite email links) and CORS. Pin to 5174 + strictPort
    // so the dev server port is deterministic.
    port: 5174,
    strictPort: true,
    proxy: {
      // All API calls proxy to FastAPI. Keep in sync with backend routers in
      // backend/main.py — a missing prefix returns 404 from the dev server.
      '/auth': { target: 'http://localhost:8001', changeOrigin: true },
      '/api': { target: 'http://localhost:8001', changeOrigin: true },
      '/projects': { target: 'http://localhost:8001', changeOrigin: true },
      '/deployments': { target: 'http://localhost:8001', changeOrigin: true },
      '/incidents': { target: 'http://localhost:8001', changeOrigin: true },
      '/rollback': { target: 'http://localhost:8001', changeOrigin: true },
      '/notifications': { target: 'http://localhost:8001', changeOrigin: true },
      '/audit': { target: 'http://localhost:8001', changeOrigin: true },
      '/ai': { target: 'http://localhost:8001', changeOrigin: true },
      '/monitoring': { target: 'http://localhost:8001', changeOrigin: true },
      '/plugins': { target: 'http://localhost:8001', changeOrigin: true },
      '/comments': { target: 'http://localhost:8001', changeOrigin: true },
      '/search': { target: 'http://localhost:8001', changeOrigin: true },
      '/team': { target: 'http://localhost:8001', changeOrigin: true },
      '/settings': { target: 'http://localhost:8001', changeOrigin: true },
      '/upload': { target: 'http://localhost:8001', changeOrigin: true },
      '/activities': { target: 'http://localhost:8001', changeOrigin: true },
      '/automation': { target: 'http://localhost:8001', changeOrigin: true },
      '/scheduled-tasks': { target: 'http://localhost:8001', changeOrigin: true },
      '/share': { target: 'http://localhost:8001', changeOrigin: true },
      '/events': { target: 'http://localhost:8001', changeOrigin: true },
      '/webhooks': { target: 'http://localhost:8001', changeOrigin: true },
      '/health': { target: 'http://localhost:8001', changeOrigin: true },
      '/docs': { target: 'http://localhost:8001', changeOrigin: true },
      '/redoc': { target: 'http://localhost:8001', changeOrigin: true },
      // WebSocket connections proxy to FastAPI WebSocket endpoint
      '/ws': {
        target: 'ws://localhost:8001',
        ws: true,
        changeOrigin: true,
      },
    },
  },
})
