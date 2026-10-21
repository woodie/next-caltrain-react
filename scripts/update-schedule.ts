// npm run schedule:update -- [--go-live YYYY-MM-DD] [--force] [--gtfs file.zip]
//
// Downloads Caltrain's GTFS, builds schedule.json, and checks it. If the
// timetable is new, writes public/feed/gtfs-<version>.json and adds it to
// public/feed/go-live.json with a proposed go-live date: --go-live, or
// tomorrow. The "Update schedule" workflow turns that into a pull request,
// where a person changes the date to the real one before merging.

import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { Schedule } from '../src/lib/ScheduleFormat.ts'
import { buildSchedule } from './schedule/build.ts'
import { fetchEffectiveDate, PDF_PAGE } from './schedule/caltrain.ts'
import { changes, check, formatSchedule } from './schedule/check.ts'
import {
  FEED_DIR, GO_LIVE, liveOn, pacificToday, pacificTomorrow, readGoLive, timetableName, timetablePath, writeGoLive,
} from './schedule/files.ts'
import { downloadGtfs, GTFS_SOURCE, unzipGtfs } from './schedule/gtfs.ts'

const args = process.argv.slice(2)
const option = (name: string) => {
  const i = args.indexOf(name)
  return i === -1 ? '' : (args[i + 1] ?? '').trim()
}
const force = args.includes('--force')
const gtfsPath = option('--gtfs')
const goLive = option('--go-live') || pacificTomorrow()
if (!/^\d{4}-\d{2}-\d{2}$/.test(goLive)) fail(`--go-live must be YYYY-MM-DD, not "${goLive}"`)

console.log(gtfsPath ? `Reading ${gtfsPath}` : `Downloading ${GTFS_SOURCE}`)
const files = gtfsPath ? unzipGtfs(new Uint8Array(readFileSync(gtfsPath))) : await downloadGtfs()
// Special dates from today on: the file may go live sooner than proposed.
const { schedule, feedVersion, feedStartDate } = buildSchedule(files, pacificToday())
console.log(`GTFS feed_version: ${feedVersion}, feed_start_date: ${feedStartDate}`)
if (schedule.scheduleDate === null) fail(`Can't read GTFS's feed_version ("${feedVersion}") to name the file.`)

const { errors, warnings } = check(schedule)
for (const w of warnings) console.log(`WARNING: ${w}`)
if (errors.length) fail(`The schedule failed its checks:\n${errors.join('\n')}`)

const name = timetableName(schedule.scheduleDate)
const path = timetablePath(name)
if (existsSync(path) && !force) {
  console.log(`No new timetable: ${path} already has this GTFS (${feedVersion}).`)
  output({ status: 'unchanged' })
  process.exit(0)
}

// Compare with the timetable that's live today.
const dates = readGoLive()
const live = liveOn(pacificToday(), dates)
const previous: Schedule | null = live ? JSON.parse(readFileSync(timetablePath(live), 'utf8')) : null

mkdirSync(FEED_DIR, { recursive: true })
writeFileSync(path, formatSchedule(schedule))
writeGoLive({ ...dates, [name]: goLive })
console.log(`Wrote ${path}, going live ${goLive} in ${GO_LIVE}`)

// The pull request's description.
const effective = await fetchEffectiveDate()
const repo = process.env.GITHUB_REPOSITORY ?? 'woodie/next-caltrain-react'
const branch = `schedule/${name.replace('.json', '')}`
const summary = [
  `A new Caltrain timetable from GTFS \`${feedVersion}\`.`,
  '',
  `**Proposed go-live: ${goLive}.** Before merging, change it to the real date: edit the \`${name}\` line in [\`${GO_LIVE}\`](https://github.com/${repo}/edit/${branch}/${GO_LIVE}).`,
  '',
  `- **GTFS** says it takes effect **${feedStartDate}** (\`feed_start_date\`).`,
  effective
    ? `- **[Caltrain's schedules page](${PDF_PAGE})** says the weekday schedule is effective **${effective}**.`
    : `- [Caltrain's schedules page](${PDF_PAGE}) didn't give a date this script could read.`,
  '',
  `Merging only adds the file. It goes live at the first daily switch on or after its go-live date (about 2:30 AM Pacific), when the switch workflow copies it to \`public/feed/schedule.json\` and deploys.`,
  '',
  `## Changes from ${live ?? 'nothing'}`,
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
output({ status: 'written', branch, go_live: goLive, summary: summaryPath, feed_version: feedVersion })

function output (values: Record<string, string>) {
  if (!process.env.GITHUB_OUTPUT) return
  appendFileSync(process.env.GITHUB_OUTPUT, Object.entries(values).map(([k, v]) => `${k}=${v}\n`).join(''))
}

function fail (message: string): never {
  console.error(message)
  process.exit(1)
}
