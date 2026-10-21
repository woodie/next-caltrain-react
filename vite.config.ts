import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'

// The app fetches /feed/schedule.json from its own origin. On App Engine,
// dispatch.yaml (owned by next-caltrain-feed) routes /feed/* to the feed
// service. Locally (npm run dev and npm run server) this proxy forwards it
// to a feed server instead: the deployed feed by default, or e.g.
// FEED_ORIGIN=http://localhost:8080 for a local next-caltrain-feed.
const feedOrigin = process.env.FEED_ORIGIN ?? 'https://next-caltrain-app.appspot.com'
const proxy = { '/feed': { target: feedOrigin, changeOrigin: true } }

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
