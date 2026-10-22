import { GoodTimes } from './GoodTimes'

export const ScheduleType = {
  Weekday: 0,
  Weekend: 1,
  Holiday: 2,
} as const
export type ScheduleType = (typeof ScheduleType)[keyof typeof ScheduleType]

export const scheduleLabel: Record<ScheduleType, string> = {
  [ScheduleType.Weekday]: 'Weekday',
  [ScheduleType.Weekend]: 'Weekend',
  [ScheduleType.Holiday]: 'Holiday',
}

// The parsed schedule.json, the same format the iOS and Android apps read.
export type { Schedule, TimeTable } from './ScheduleFormat'
import type { Schedule, TimeTable } from './ScheduleFormat'

export class ScheduleError extends Error {}

// A static file on the same origin (public/feed/schedule.json, kept current by
// the schedule workflows). VITE_SCHEDULE_URL can point a build at another feed.
export const scheduleUrl = import.meta.env.VITE_SCHEDULE_URL ?? '/feed/schedule.json'

// Not private: specs read/write these keys directly instead of hardcoding the strings.
export const cacheKey = 'schedule.json'
export const lastFetchKey = 'lastFetchTime'

/** Stop lists are non-empty and every schedule table's train arrays match their direction's stop-list length. */
export function isValid (schedule: Schedule): boolean {
  if (schedule.northStops.length === 0 || schedule.southStops.length === 0) return false
  const tables: [TimeTable, number][] = [
    [schedule.northWeekday, schedule.northStops.length],
    [schedule.northWeekend, schedule.northStops.length],
    [schedule.northHoliday, schedule.northStops.length],
    [schedule.southWeekday, schedule.southStops.length],
    [schedule.southWeekend, schedule.southStops.length],
    [schedule.southHoliday, schedule.southStops.length],
  ]
  return tables.every(([table, count]) => Object.values(table).every((times) => times.length === count))
}

/** Loads a valid cached schedule from local storage, if one exists. */
export function loadCached (storage: Storage = localStorage): Schedule | null {
  try {
    const cached = storage.getItem(cacheKey)
    if (cached === null) return null
    const schedule = withDefaults(JSON.parse(cached))
    return isValid(schedule) ? schedule : null
  } catch {
    return null
  }
}

/** True if the last successful fetch landed on today's schedule-day (2am boundary; see GoodTimes.scheduleDateFor). */
export function fetchedToday (storage: Storage = localStorage, now: Date = new Date()): boolean {
  const last = Number(storage.getItem(lastFetchKey))
  if (!last) return false
  return GoodTimes.scheduleDateFor(new Date(last)) === GoodTimes.scheduleDateFor(now)
}

/**
 * Fetches the latest schedule, caches it if valid, and returns it;
 * throws on network/decode/validation failure.
 */
export async function fetchFromNetwork (
  fetcher: typeof fetch = fetch,
  storage: Storage = localStorage,
  url: string = scheduleUrl,
): Promise<Schedule> {
  const response = await fetcher(url, { cache: 'no-store' })
  if (!response.ok) throw new ScheduleError(`The server responded with status ${response.status}.`)
  const text = await response.text()
  const schedule = withDefaults(JSON.parse(text))
  if (!isValid(schedule)) throw new ScheduleError("The server sent back schedule data that didn't validate.")
  try {
    storage.setItem(cacheKey, text)
    storage.setItem(lastFetchKey, String(Date.now()))
  } catch (error) {
    console.log(error)
  }
  return schedule
}

// specialDates and scheduleDate are optional in older feeds; the feed abbreviates one station name.
function withDefaults (json: Schedule): Schedule {
  const spell = (stops: string[]) => stops.map((s) => s === 'So San Francisco' ? 'South San Francisco' : s)
  return {
    ...json,
    northStops: spell(json.northStops),
    southStops: spell(json.southStops),
    specialDates: json.specialDates ?? {},
    scheduleDate: json.scheduleDate ?? null,
  }
}

export const CaltrainSchedule = {
  optionIndex (date: string, dotw: number, specialDates: Record<string, number>): ScheduleType {
    const type = specialDates[date]
    if (type !== undefined) {
      return type in scheduleLabel ? (type as ScheduleType) : ScheduleType.Weekday
    } else if (dotw === 0 || dotw === 6) {
      return ScheduleType.Weekend
    } else {
      return ScheduleType.Weekday
    }
  },
}
