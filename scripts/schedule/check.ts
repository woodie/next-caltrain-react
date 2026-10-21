import type { Schedule, TimeTable } from '../../src/lib/ScheduleFormat.ts'

const TABLES = ['northWeekday', 'northWeekend', 'northHoliday', 'southWeekday', 'southWeekend', 'southHoliday'] as const

export interface Problems {
  errors: string[] // the file is broken: never publish it
  warnings: string[] // the data looks wrong (e.g. Caltrain's GTFS): publish, but say so
}

/**
 * Like next-caltrain-pwa's validate_schedule.py, plus the check that would
 * have caught issue #36 there: a train reaching a station before the one it
 * just left.
 */
export function check (schedule: Schedule): Problems {
  const errors: string[] = []
  const warnings: string[] = []
  if (schedule.northStops.length === 0 || schedule.southStops.length === 0) errors.push('A stop list is empty.')
  for (const name of ['northWeekday', 'northWeekend', 'southWeekday', 'southWeekend'] as const) {
    if (Object.keys(schedule[name]).length === 0) errors.push(`${name} has no trains.`)
  }
  for (const name of TABLES) {
    const stops = name.startsWith('north') ? schedule.northStops : schedule.southStops
    for (const [train, times] of Object.entries(schedule[name])) {
      if (times.length !== stops.length) {
        errors.push(`${name} #${train} has ${times.length} times for ${stops.length} stops.`)
        continue
      }
      let last: { stop: string, time: number } | null = null
      times.forEach((time, i) => {
        if (time === null) return
        if (time < 0 || time >= 1800) errors.push(`${name} #${train} has an impossible time (${time}) at ${stops[i]}.`)
        if (last && time < last.time) {
          warnings.push(`${name} #${train} reaches ${stops[i]} (${clock(time)}) before leaving ${last.stop} (${clock(last.time)}).`)
        }
        last = { stop: stops[i], time }
      })
    }
  }
  return { errors, warnings }
}

/** What changed from the previous schedule, as Markdown lines for a pull request. */
export function changes (before: Schedule | null, after: Schedule): string[] {
  if (before === null) return ['- First schedule file.']
  const lines: string[] = []
  for (const key of ['northStops', 'southStops'] as const) {
    if (JSON.stringify(before[key]) !== JSON.stringify(after[key])) lines.push(`- **${key}** changed.`)
  }
  for (const name of TABLES) {
    const line = tableChanges(before[name], after[name])
    if (line) lines.push(`- **${name}:** ${line}`)
  }
  const dates = (s: Schedule) => Object.entries(s.specialDates).map(([d, t]) => `${d}:${t}`)
  const added = dates(after).filter((d) => !dates(before).includes(d))
  const removed = dates(before).filter((d) => !dates(after).includes(d))
  if (added.length || removed.length) {
    lines.push(`- **specialDates:** ${[...added.map((d) => `+${d}`), ...removed.map((d) => `−${d}`)].join(', ')}`)
  }
  return lines.length ? lines : ['- No timetable changes (only the feed version).']
}

function tableChanges (before: TimeTable, after: TimeTable): string {
  const added = Object.keys(after).filter((t) => !(t in before))
  const removed = Object.keys(before).filter((t) => !(t in after))
  const changed = Object.keys(after).filter((t) => t in before && JSON.stringify(before[t]) !== JSON.stringify(after[t]))
  const parts = [
    added.length && `${added.length} added (${added.join(', ')})`,
    removed.length && `${removed.length} removed (${removed.join(', ')})`,
    changed.length && `${changed.length} retimed (${changed.join(', ')})`,
  ].filter(Boolean)
  return parts.join('; ')
}

function clock (minutes: number): string {
  const h = Math.floor(minutes / 60) % 24
  return `${h % 12 || 12}:${String(minutes % 60).padStart(2, '0')}${h < 12 ? 'am' : 'pm'}`
}

/**
 * JSON with one train per line, so a pull request shows exactly which
 * trains changed. Same content as compact JSON; gzip makes the size moot.
 */
export function formatSchedule (schedule: Schedule): string {
  const lines = ['{']
  const keys = Object.keys(schedule) as (keyof Schedule)[]
  keys.forEach((key, k) => {
    const value = schedule[key]
    const comma = k < keys.length - 1 ? ',' : ''
    if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
      const entries = Object.entries(value)
      if (entries.length === 0) {
        lines.push(`  ${JSON.stringify(key)}: {}${comma}`)
        return
      }
      lines.push(`  ${JSON.stringify(key)}: {`)
      entries.forEach(([k2, v], i) => lines.push(`    ${JSON.stringify(k2)}: ${JSON.stringify(v)}${i < entries.length - 1 ? ',' : ''}`))
      lines.push(`  }${comma}`)
    } else {
      lines.push(`  ${JSON.stringify(key)}: ${JSON.stringify(value)}${comma}`)
    }
  })
  lines.push('}')
  return lines.join('\n') + '\n'
}
