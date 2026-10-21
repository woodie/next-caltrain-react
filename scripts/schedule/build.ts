import type { Schedule, TimeTable } from '../../src/lib/ScheduleFormat.ts'
import { type GtfsFiles, parseCsv, type Row } from './gtfs.ts'

// Ported from next-caltrain-pwa's generate.py and update_json.py, so the
// weekday and weekend tables come out the same. Unlike there, holidays come
// from GTFS too (no hand-maintained CSVs or holiday_service.js).

// calendar_dates-only services with at least this many trips are the
// holiday/modified schedule; smaller ones are one-off extras (World Cup trains).
const HOLIDAY_MIN_TRIPS = 10

// Stop IDs above this are GTFS's extra, non-platform stops.
const LAST_PLATFORM_STOP = 70400

export interface BuiltSchedule {
  schedule: Schedule
  feedVersion: string // Trillium's build stamp, e.g. "UTC: 10-Jun-2026 22:25"
  feedStartDate: string // YYYY-MM-DD, when this timetable takes effect
}

/** `since` (YYYY-MM-DD) drops special dates before it, normally the go-live date. */
export function buildSchedule (files: GtfsFiles, since = ''): BuiltSchedule {
  const read = (name: string): Row[] => {
    if (!(name in files)) throw new Error(`GTFS is missing ${name}`)
    return parseCsv(files[name])
  }
  const feedInfo = read('feed_info.txt')[0]
  const calendar = read('calendar.txt')
  const calendarDates = read('calendar_dates.txt')
  const trips = read('trips.txt')
  const stopTimes = read('stop_times.txt')
  const stations = stationLists(read('stops.txt'))
  const services = resolveServiceIds(calendar, trips)

  const tables = (serviceId: string | null, stripM = false) => ({
    north: serviceId ? timeTable(trips, stopTimes, serviceId, stations.north, stripM) : {},
    south: serviceId ? timeTable(trips, stopTimes, serviceId, stations.south, stripM) : {},
  })
  const weekday = tables(services.weekday)
  const weekend = tables(services.weekend)
  const holiday = tables(services.holiday, true) // holiday trips are named "M101", ...

  const label = (id: number) => stations.labels.get(id)!
  return {
    schedule: {
      specialDates: specialDates(calendarDates, services, since),
      northStops: stations.north.map(label),
      southStops: stations.south.map(label),
      northWeekday: weekday.north,
      northWeekend: weekend.north,
      northHoliday: holiday.north,
      southWeekday: weekday.south,
      southWeekend: weekend.south,
      southHoliday: holiday.south,
      scheduleDate: feedVersionMs(feedInfo.feed_version),
    },
    feedVersion: feedInfo.feed_version,
    feedStartDate: isoDate(feedInfo.feed_start_date),
  }
}

/** Platform stops, odd IDs northbound and even southbound, each in travel order. */
export function stationLists (stops: Row[]) {
  const north: number[] = []
  const south: number[] = []
  const labels = new Map<number, string>()
  for (const row of stops) {
    if (!/^\d+$/.test(row.stop_id)) continue
    const stopId = Number(row.stop_id)
    if (stopId > LAST_PLATFORM_STOP) continue
    let name = row.stop_name.split(/\s+/).filter((w) => w !== 'Caltrain' && w !== 'Station').join(' ')
    name = name.replace('South San', 'So San').replace('Avenue', 'Ave')
    if (name === 'Atherton') continue // closed, but still in GTFS
    name = name.replace(' Northbound', '').replace(' Southbound', '')
    labels.set(stopId, name)
    if (stopId % 2 === 1) north.unshift(stopId)
    else south.push(stopId)
  }
  return { north, south, labels }
}

interface Services { weekday: string | null, weekend: string | null, holiday: string | null }

/** Weekday and weekend from calendar.txt; holiday is the large calendar_dates-only service. */
export function resolveServiceIds (calendar: Row[], trips: Row[]): Services {
  let weekday: string | null = null
  let weekend: string | null = null
  for (const row of calendar) {
    if (row.monday === '1') weekday = row.service_id
    else if (row.saturday === '1') weekend = row.service_id
  }
  const calendarIds = new Set(calendar.map((row) => row.service_id))
  const counts = new Map<string, number>()
  for (const trip of trips) counts.set(trip.service_id, (counts.get(trip.service_id) ?? 0) + 1)
  const holiday = [...counts.keys()].sort()
    .find((id) => !calendarIds.has(id) && counts.get(id)! >= HOLIDAY_MIN_TRIPS) ?? null
  return { weekday, weekend, holiday }
}

/** Train number -> departure minutes at each station (null where it doesn't stop). */
function timeTable (trips: Row[], stopTimes: Row[], serviceId: string, stations: number[], stripM: boolean): TimeTable {
  const index = new Map(stations.map((id, i) => [id, i]))
  const names = new Map<string, string>()
  for (const trip of trips) {
    if (trip.service_id !== serviceId) continue
    const name = trip.trip_short_name
    names.set(trip.trip_id, stripM && name.startsWith('M') ? name.slice(1) : name)
  }
  const table: TimeTable = {}
  for (const st of stopTimes) {
    const name = names.get(st.trip_id)
    const i = index.get(Number(st.stop_id))
    if (name === undefined || i === undefined) continue
    table[name] ??= new Array(stations.length).fill(null)
    table[name][i] = minutes(st.departure_time)
  }
  return table
}

/**
 * Dates that don't follow the usual weekday/weekend rule, from calendar_dates:
 * 1 where weekend service runs instead, 2 for the holiday (modified) schedule,
 * 0 for weekday service on another day.
 */
export function specialDates (calendarDates: Row[], services: Services, since = ''): Record<string, number> {
  const added = new Map<string, Set<string>>()
  for (const row of calendarDates) {
    if (row.exception_type !== '1') continue
    const date = isoDate(row.date)
    if (date < since) continue
    if (!added.has(date)) added.set(date, new Set())
    added.get(date)!.add(row.service_id)
  }
  const out: Record<string, number> = {}
  for (const date of [...added.keys()].sort()) {
    const ids = added.get(date)!
    if (services.holiday && ids.has(services.holiday)) out[date] = 2
    else if (services.weekend && ids.has(services.weekend)) out[date] = 1
    else if (services.weekday && ids.has(services.weekday)) out[date] = 0
  }
  return out
}

/** "14:52:00" -> 892; times past midnight run over 1440 ("24:05:00" -> 1445). */
function minutes (time: string): number {
  const [h, m] = time.split(':').map(Number)
  return h * 60 + m
}

function isoDate (yyyymmdd: string): string {
  return `${yyyymmdd.slice(0, 4)}-${yyyymmdd.slice(4, 6)}-${yyyymmdd.slice(6, 8)}`
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

/** "UTC: 10-Jun-2026 22:25" -> epoch ms, or null if the format changes. */
export function feedVersionMs (feedVersion: string): number | null {
  const m = /UTC: (\d{1,2})-([A-Za-z]{3})-(\d{4}) (\d{1,2}):(\d{2})/.exec(feedVersion ?? '')
  if (!m) return null
  const month = MONTHS.indexOf(m[2])
  if (month === -1) return null
  return Date.UTC(Number(m[3]), month, Number(m[1]), Number(m[4]), Number(m[5]))
}
