
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],

  server: {
    host: '0.0.0.0',
    port: 5173,

    proxy: {
      // Forward API requests and SignalR WebSockets
      // to the ASP.NET Core API container.
      '/api': {
        target: 'http://127.0.0.1:3002',
        changeOrigin: true,
        secure: false,

        // Required for forwarding SignalR WebSockets.
        ws: true,
      },
    },
  },
})
