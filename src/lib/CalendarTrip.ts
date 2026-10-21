import { type Trip, tripDepart } from './CaltrainService'
import { GoodTimes } from './GoodTimes'

// Caltrain runs on Pacific time, whatever the phone's own time zone is.
const CALTRAIN_TZ = 'America/Los_Angeles'

export type PlanMode = 'leave' | 'arrive'

export interface PlannedTrain {
  label: string
  depart: number
  arrive: number
  selected: boolean
}

// Planning a trip for the calendar, like Google Maps' "Leave at" / "Arrive by":
// the planned train plus the trains before and after it, and the event.
export const CalendarTrip = {
  /**
   * The planned train's index in `trips` (sorted by departure): the first
   * departing at or after `minutes` ("leave"), or the last arriving at or
   * before it ("arrive"); -1 if no train fits.
   */
  find (trips: Trip[], mode: PlanMode, minutes: number): number {
    if (mode === 'arrive') {
      return trips.findLastIndex((trip) => trip.arrive <= minutes)
    }
    return trips.findIndex((trip) => tripDepart(trip) >= minutes)
  },

  /** The planned train with the trains before and after it. */
  neighbors (trips: Trip[], index: number): PlannedTrain[] {
    const out: PlannedTrain[] = []
    for (let i = index - 1; i <= index + 1; i++) {
      if (i < 0 || i >= trips.length) continue
      const trip = trips[i]
      out.push({
        label: trip.legs.map((leg) => `#${leg.trainId}`).join('+'),
        depart: tripDepart(trip),
        arrive: trip.arrive,
        selected: i === index,
      })
    }
    return out
  },

  line (train: PlannedTrain): string {
    return `${train.label}  ${GoodTimes.fullTime(train.depart)} – ${GoodTimes.fullTime(train.arrive)}`
  },

  title (destination: string): string {
    return `Caltrain to ${destination}`
  },

  /**
   * The event description: the route, then the trains. The event's own times
   * already say which one is planned, so the description doesn't mark it.
   */
  notes (origin: string, destination: string, trains: PlannedTrain[]): string {
    return [`${origin} to ${destination}`, ...trains.map(CalendarTrip.line)].join('\n')
  },

  /**
   * Local date-time stamp for minutes past midnight on an ISO date
   * (times past midnight, > 1440, roll over to the next day).
   * @return 'YYYYMMDDTHHMMSS'
   */
  stamp (isoDate: string, minutes: number): string {
    const [y, m, d] = isoDate.split('-').map(Number)
    const t = new Date(Date.UTC(y, m - 1, d) + minutes * 60000)
    const pad = (n: number) => (n < 10 ? '0' : '') + n
    return `${t.getUTCFullYear()}${pad(t.getUTCMonth() + 1)}${pad(t.getUTCDate())}` +
      `T${pad(t.getUTCHours())}${pad(t.getUTCMinutes())}00`
  },

  /** A Google Calendar link that opens a prefilled event, with no sign-in or API. */
  googleUrl (title: string, isoDate: string, train: PlannedTrain, details: string): string {
    const dates = `${CalendarTrip.stamp(isoDate, train.depart)}/${CalendarTrip.stamp(isoDate, train.arrive)}`
    return 'https://calendar.google.com/calendar/render?action=TEMPLATE' +
      `&text=${encodeURIComponent(title)}&dates=${dates}` +
      `&ctz=${encodeURIComponent(CALTRAIN_TZ)}&details=${encodeURIComponent(details)}`
  },

  /** Local ISO date (YYYY-MM-DD) for a Date. */
  isoDate (date: Date): string {
    const pad = (n: number) => (n < 10 ? '0' : '') + n
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
  },

  dotw (isoDate: string): number {
    const [y, m, d] = isoDate.split('-').map(Number)
    return new Date(y, m - 1, d).getDay()
  },
}
