import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    allowedHosts: [
      'gateway-6haxnejlyq-ew.a.run.app',
      'discovercase.hrzn.run',
      'discovercase.hrzn.io',
      '.a.run.app'
    ],
    proxy: {
      '/api': 'http://127.0.0.1:8080',
      '/socket.io': { target: 'http://127.0.0.1:8080', ws: true },
    },
  },
})
