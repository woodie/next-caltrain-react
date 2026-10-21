// npm run schedule:update -- [--go-live YYYY-MM-DD] [--force] [--gtfs file.zip]
//
// Downloads Caltrain's GTFS, builds schedule.json, and checks it. If the
// timetable is new:
// - without --go-live, writes nothing and asks when it should go live
//   (the "Update schedule" workflow turns that into a GitHub issue);
// - with --go-live, writes public/feed/schedule-<go-live>.json (the workflow
//   turns that into a pull request).

import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { Schedule } from '../src/lib/ScheduleFormat.ts'
import { buildSchedule } from './schedule/build.ts'
import { fetchEffectiveDate, PDF_PAGE } from './schedule/caltrain.ts'
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
const goLive = option('--go-live')
if (goLive && !/^\d{4}-\d{2}-\d{2}$/.test(goLive)) fail(`--go-live must be YYYY-MM-DD, not "${goLive}"`)

console.log(gtfsPath ? `Reading ${gtfsPath}` : `Downloading ${GTFS_SOURCE}`)
const files = gtfsPath ? unzipGtfs(new Uint8Array(readFileSync(gtfsPath))) : await downloadGtfs()
// Special dates from the go-live date on (or from today, when just checking).
const { schedule, feedVersion, feedStartDate } = buildSchedule(files, goLive || pacificToday())
console.log(`GTFS feed_version: ${feedVersion}, feed_start_date: ${feedStartDate}`)

const { errors, warnings } = check(schedule)
for (const w of warnings) console.log(`WARNING: ${w}`)
if (errors.length) fail(`The schedule failed its checks:\n${errors.join('\n')}`)

// The newest schedule file already in the repo, to compare against.
const latest = goLiveDates().at(-1)
const previous: Schedule | null = latest ? JSON.parse(readFileSync(datedPath(latest), 'utf8')) : null
if (previous && previous.scheduleDate === schedule.scheduleDate && !force) {
  console.log(`No new timetable: the newest schedule (${latest}) already has this GTFS (${feedVersion}).`)
  output({ status: 'unchanged' })
  process.exit(0)
}

const changeLines = changes(previous, schedule)
const checkLines = [
  warnings.length ? `${warnings.length} warning(s), likely errors in Caltrain's GTFS:` : 'Passed, with no warnings.',
  ...warnings.map((w) => `- ${w}`),
]

if (!goLive) {
  // A new timetable, and nobody has said when it goes live: ask.
  const effective = await fetchEffectiveDate()
  const repo = process.env.GITHUB_REPOSITORY ?? 'woodie/next-caltrain-react'
  const question = [
    `Caltrain's GTFS has a new timetable (\`${feedVersion}\`). **When should it go live?**`,
    '',
    `- **GTFS** says it takes effect **${feedStartDate}** (\`feed_start_date\`).`,
    effective
      ? `- **[Caltrain's schedules page](${PDF_PAGE})** says the weekday schedule is effective **${effective}**.`
      : `- [Caltrain's schedules page](${PDF_PAGE}) didn't give a date this script could read.`,
    '',
    `To answer, run [Update schedule](https://github.com/${repo}/actions/workflows/update-schedule.yml) with that go-live date. It opens a pull request with the new schedule file, which goes live at the first daily switch on or after that date.`,
    '',
    `## Changes from ${latest ? `schedule-${latest}.json` : 'nothing'}`,
    '',
    ...changeLines,
    '',
    '## Checks',
    '',
    ...checkLines,
    '',
  ].join('\n')
  const questionPath = writeTemp('schedule-question.md', question)
  console.log(`\n${question}`)
  output({ status: 'needs-date', question: questionPath, feed_version: feedVersion })
  process.exit(0)
}

const path = datedPath(goLive)
mkdirSync(FEED_DIR, { recursive: true })
if (existsSync(path)) console.log(`Replacing ${path}`)
writeFileSync(path, formatSchedule(schedule))
console.log(`Wrote ${path}`)

// The pull request's description.
const summary = [
  `A new Caltrain timetable from GTFS \`${feedVersion}\`, going live **${goLive}** (GTFS's own start date: ${feedStartDate}).`,
  '',
  `\`${path}\` goes live at the first daily switch on or after ${goLive} (about 2:30 AM Pacific), when the switch workflow copies it to \`public/feed/schedule.json\` and deploys. Merging this pull request only adds the file.`,
  '',
  `## Changes from ${latest ? `schedule-${latest}.json` : 'nothing'}`,
  '',
  ...changeLines,
  '',
  '## Checks',
  '',
  ...checkLines,
  '',
].join('\n')
const summaryPath = writeTemp('schedule-summary.md', summary)
console.log(`\n${summary}`)
output({ status: 'written', go_live: goLive, file: path, summary: summaryPath, feed_version: feedVersion })

function writeTemp (name: string, text: string): string {
  const path = join(process.env.RUNNER_TEMP ?? tmpdir(), name)
  writeFileSync(path, text)
  return path
}

function output (values: Record<string, string>) {
  if (!process.env.GITHUB_OUTPUT) return
  appendFileSync(process.env.GITHUB_OUTPUT, Object.entries(values).map(([k, v]) => `${k}=${v}\n`).join(''))
}

function fail (message: string): never {
  console.error(message)
  process.exit(1)
}
