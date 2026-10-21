// npm run schedule:switch -- [--date YYYY-MM-DD]
//
// Makes public/feed/schedule.json a copy of the timetable whose go-live date
// (in public/feed/go-live.json) is the latest one that has arrived. Run daily
// by the "Switch schedule" workflow, which commits and deploys when this
// changes the file.

import { appendFileSync, copyFileSync, existsSync, readFileSync } from 'node:fs'
import { CURRENT, liveOn, pacificToday, readGoLive, timetablePath } from './schedule/files.ts'

const args = process.argv.slice(2)
const i = args.indexOf('--date')
const today = i === -1 ? pacificToday() : args[i + 1]

const dates = readGoLive()
const live = liveOn(today, dates)
if (live === null) {
  console.log(`No timetable has gone live by ${today}.`)
  output('false')
  process.exit(0)
}

const source = timetablePath(live)
const same = existsSync(CURRENT) && readFileSync(CURRENT).equals(readFileSync(source))
if (same) {
  console.log(`${CURRENT} is already ${source} (live since ${dates[live]}).`)
  output('false')
} else {
  copyFileSync(source, CURRENT)
  console.log(`${CURRENT} is now ${source} (live since ${dates[live]}).`)
  output('true', dates[live])
}

function output (changed: string, goLive = '') {
  if (!process.env.GITHUB_OUTPUT) return
  appendFileSync(process.env.GITHUB_OUTPUT, `changed=${changed}\ngo_live=${goLive}\n`)
}
