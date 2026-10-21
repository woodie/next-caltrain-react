// npm run schedule:update -- [--go-live YYYY-MM-DD] [--force] [--gtfs file.zip]
//
// Downloads Caltrain's GTFS, builds schedule.json, checks it, and, if the
// timetable is new, writes public/feed/schedule-<go-live>.json. Run by the
// "Update schedule" workflow, which turns the new file into a pull request.

import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { Schedule } from '../src/lib/ScheduleFormat.ts'
import { buildSchedule } from './schedule/build.ts'
import { changes, check, formatSchedule } from './schedule/check.ts'
import { datedPath, FEED_DIR, goLiveDates, pacificToday } from './schedule/files.ts'
import { downloadGtfs, GTFS_SOURCE, unzipGtfs } from './schedule/gtfs.ts'

const args = process.argv.slice(2)
const option = (name: string) => {
  const i = args.indexOf(name)
  return i === -1 ? '' : (args[i + 1] ?? '').trim()
}
const force = args.includes('--force')
const gtfsPath = option('--gtfs')
let goLive = option('--go-live')
if (goLive && !/^\d{4}-\d{2}-\d{2}$/.test(goLive)) fail(`--go-live must be YYYY-MM-DD, not "${goLive}"`)

console.log(gtfsPath ? `Reading ${gtfsPath}` : `Downloading ${GTFS_SOURCE}`)
const files = gtfsPath ? unzipGtfs(new Uint8Array(readFileSync(gtfsPath))) : await downloadGtfs()

// Without a go-live date, use the timetable's own start date, or today if that's past.
const today = pacificToday()
if (!goLive) {
  const { feedStartDate } = buildSchedule(files)
  goLive = feedStartDate > today ? feedStartDate : today
}
const { schedule, feedVersion } = buildSchedule(files, goLive)
console.log(`GTFS feed_version: ${feedVersion}; going live ${goLive}`)

const { errors, warnings } = check(schedule)
for (const w of warnings) console.log(`WARNING: ${w}`)
if (errors.length) fail(`The schedule failed its checks:\n${errors.join('\n')}`)

// The newest schedule file already in the repo, to compare against.
const dates = goLiveDates()
const latest = dates.at(-1)
const previous: Schedule | null = latest ? JSON.parse(readFileSync(datedPath(latest), 'utf8')) : null
if (previous && previous.scheduleDate === schedule.scheduleDate && !force) {
  console.log(`No change: the newest schedule (${latest}) already has this GTFS (${feedVersion}).`)
  output({ changed: 'false' })
  process.exit(0)
}

const path = datedPath(goLive)
mkdirSync(FEED_DIR, { recursive: true })
if (existsSync(path)) console.log(`Replacing ${path}`)
writeFileSync(path, formatSchedule(schedule))
console.log(`Wrote ${path}`)

// The pull request's description.
const summary = [
  `A new Caltrain timetable from GTFS \`${feedVersion}\`, going live **${goLive}**.`,
  '',
  `\`${path}\` goes live at the first daily switch on or after ${goLive} (about 2:30 AM Pacific), when the switch workflow copies it to \`public/feed/schedule.json\` and deploys. Merging this pull request only adds the file.`,
  '',
  `## Changes from ${latest ? `schedule-${latest}.json` : 'nothing'}`,
  '',
  ...changes(previous, schedule),
  '',
  '## Checks',
  '',
  warnings.length ? `${warnings.length} warning(s), likely errors in Caltrain's GTFS:` : 'Passed, with no warnings.',
  ...warnings.map((w) => `- ${w}`),
  '',
].join('\n')
const summaryPath = join(process.env.RUNNER_TEMP ?? tmpdir(), 'schedule-summary.md')
writeFileSync(summaryPath, summary)
console.log(`\n${summary}`)
output({ changed: 'true', go_live: goLive, file: path, summary: summaryPath, feed_version: feedVersion })

function output (values: Record<string, string>) {
  if (!process.env.GITHUB_OUTPUT) return
  appendFileSync(process.env.GITHUB_OUTPUT, Object.entries(values).map(([k, v]) => `${k}=${v}\n`).join(''))
}

function fail (message: string): never {
  console.error(message)
  process.exit(1)
}
