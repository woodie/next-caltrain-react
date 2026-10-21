import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'

// The app fetches /feed/schedule.json from its own origin: a static file in
// public/feed/, served by Vite locally and by App Engine when deployed. Set
// FEED_ORIGIN (e.g. https://next-caltrain-pwa.appspot.com) to proxy /feed to
// another site's feed instead, to compare them.
const feedOrigin = process.env.FEED_ORIGIN
const proxy = feedOrigin ? { '/feed': { target: feedOrigin, changeOrigin: true } } : undefined

export default defineConfig({
  plugins: [react()],
  server: {
    host: true, // reachable from a phone on the same Wi-Fi
    proxy,
  },
  preview: {
    host: true,
    proxy,
  },
  test: {
    environment: 'jsdom',
    reporters: ['tree'],
  },
})
