import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],

  server: {
    proxy: {
      // React calls /api/... on port 5173.
      // Vite forwards those requests to ASP.NET Core on port 5138.
      '/api': {
        target: 'http://localhost:5138',
        changeOrigin: true,
      },
    },
  },
})