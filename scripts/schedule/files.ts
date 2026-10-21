import { readdirSync } from 'node:fs'

// Every schedule is kept as public/feed/schedule-YYYY-MM-DD.json, named for
// the day it goes live. The one live today is also copied to
// public/feed/schedule.json, the name the apps read.
export const FEED_DIR = 'public/feed'
export const CURRENT = `${FEED_DIR}/schedule.json`

const DATED = /^schedule-(\d{4}-\d{2}-\d{2})\.json$/

export const datedPath = (goLive: string) => `${FEED_DIR}/schedule-${goLive}.json`

/** Go-live dates of the dated schedule files, oldest first. */
export function goLiveDates (names: string[] = safeReaddir(FEED_DIR)): string[] {
  return names.map((name) => DATED.exec(name)?.[1]).filter((d): d is string => d !== undefined).sort()
}

/** The go-live date of the schedule that should be live on `today`, if any. */
export function liveOn (today: string, dates: string[]): string | null {
  return dates.filter((d) => d <= today).at(-1) ?? null
}

/** Today's date in Pacific time, where Caltrain runs. */
export function pacificToday (now: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Los_Angeles' }).format(now)
}

function safeReaddir (dir: string): string[] {
  try {
    return readdirSync(dir)
  } catch {
    return []
  }
}
