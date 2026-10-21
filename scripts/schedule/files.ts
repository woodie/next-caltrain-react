import { existsSync, readFileSync, writeFileSync } from 'node:fs'

// Each timetable is kept as public/feed/gtfs-<version>.json, named for the
// GTFS build it came from and never renamed. public/feed/go-live.json says
// when each one goes live, one line per timetable, so a go-live date is a
// one-line edit (in a pull request, even from the GitHub app). The timetable
// live today is copied to public/feed/schedule.json, the name the apps read.
export const FEED_DIR = 'public/feed'
export const CURRENT = `${FEED_DIR}/schedule.json`
export const GO_LIVE = `${FEED_DIR}/go-live.json`

export type GoLiveDates = Record<string, string> // timetable file name -> YYYY-MM-DD

/** "gtfs-20260610-2225.json" for a feed_version of "UTC: 10-Jun-2026 22:25" (scheduleDate). */
export function timetableName (scheduleDate: number): string {
  const iso = new Date(scheduleDate).toISOString() // 2026-06-10T22:25:00.000Z
  return `gtfs-${iso.slice(0, 10).replaceAll('-', '')}-${iso.slice(11, 16).replace(':', '')}.json`
}

export const timetablePath = (name: string) => `${FEED_DIR}/${name}`

export function readGoLive (): GoLiveDates {
  return existsSync(GO_LIVE) ? JSON.parse(readFileSync(GO_LIVE, 'utf8')) : {}
}

/** One timetable per line, by go-live date, so the date is easy to find and edit. */
export function writeGoLive (dates: GoLiveDates): void {
  const entries = Object.entries(dates).sort(([, a], [, b]) => a.localeCompare(b))
  const lines = entries.map(([name, date], i) => `  ${JSON.stringify(name)}: ${JSON.stringify(date)}${i < entries.length - 1 ? ',' : ''}`)
  writeFileSync(GO_LIVE, `{\n${lines.join('\n')}\n}\n`)
}

/** The timetable that should be live on `today`: the latest go-live date that has arrived. */
export function liveOn (today: string, dates: GoLiveDates): string | null {
  const arrived = Object.entries(dates).filter(([, date]) => date <= today)
  arrived.sort(([, a], [, b]) => a.localeCompare(b))
  return arrived.at(-1)?.[0] ?? null
}

/** Today's date in Pacific time, where Caltrain runs. */
export function pacificToday (now: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Los_Angeles' }).format(now)
}

/** Tomorrow's date in Pacific time: the proposed go-live date for a new timetable. */
export function pacificTomorrow (now: Date = new Date()): string {
  return pacificToday(new Date(now.getTime() + 24 * 3600 * 1000))
}
