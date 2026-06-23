import { resolve } from 'node:path'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [tailwindcss(), react()],
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src'),
    },
  },
  server: {
    fs: {
      allow: ['..'],
    },
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:80',
        changeOrigin: true,
        secure: false,
      },
      '^/(?!node_modules|src|assets|@vite|@id|@fs|@react-refresh|ide/|api/).*': {
        target: 'http://127.0.0.1:80',
        changeOrigin: true,
        secure: false,
        bypass(req) {
          const url = req.url || ''
          if (
            url.startsWith('/ide/') ||
            url.startsWith('/src/') ||
            url.startsWith('/node_modules/') ||
            url.startsWith('/@') ||
            url.startsWith('/api/') ||
            url.match(/\.(html|js|css|json|png|jpg|jpeg|gif|svg|ico|woff|woff2|ttf|eot|map)$/i) ||
            url === '/' ||
            url === ''
          ) {
            return url
          }
          return null
        },
      },
    },
  },
})
