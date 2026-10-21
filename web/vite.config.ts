import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'

// Until this repo's own backend serves /feed/schedule.json, development reads
// next-caltrain-pwa's live feed through this proxy (it has no CORS headers,
// so the browser can't fetch it cross-origin directly).
const feedOrigin = process.env.FEED_ORIGIN ?? 'https://next-caltrain-pwa.appspot.com'

export default defineConfig({
  plugins: [react()],
  server: {
    host: true, // reachable from a phone on the same Wi-Fi
    proxy: { '/feed': { target: feedOrigin, changeOrigin: true } },
  },
  test: {
    environment: 'jsdom',
    reporters: ['tree'],
  },
})
