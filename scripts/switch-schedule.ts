// npm run schedule:switch -- [--date YYYY-MM-DD]
//
// Makes public/feed/schedule.json a copy of the newest dated schedule whose
// go-live date has arrived. Run daily by the "Switch schedule" workflow,
// which commits and deploys when this changes the file.

import { appendFileSync, copyFileSync, existsSync, readFileSync } from 'node:fs'
import { CURRENT, datedPath, goLiveDates, liveOn, pacificToday } from './schedule/files.ts'

const args = process.argv.slice(2)
const i = args.indexOf('--date')
const today = i === -1 ? pacificToday() : args[i + 1]

const live = liveOn(today, goLiveDates())
if (live === null) {
  console.log(`No schedule has gone live by ${today}.`)
  output('false')
  process.exit(0)
}

const source = datedPath(live)
const same = existsSync(CURRENT) && readFileSync(CURRENT).equals(readFileSync(source))
if (same) {
  console.log(`${CURRENT} is already ${source} (live since ${live}).`)
  output('false')
} else {
  copyFileSync(source, CURRENT)
  console.log(`${CURRENT} is now ${source} (live since ${live}).`)
  output('true', live)
}

function output (changed: string, goLive = '') {
  if (!process.env.GITHUB_OUTPUT) return
  appendFileSync(process.env.GITHUB_OUTPUT, `changed=${changed}\ngo_live=${goLive}\n`)
}
