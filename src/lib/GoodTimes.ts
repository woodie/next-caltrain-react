// Local-time helpers. A "schedule day" starts at 2am, so a 1am train still
// counts as part of the previous day's service (the same rule as the apps).
export class GoodTimes {
  readonly date: string
  readonly minutes: number
  readonly seconds: number
  readonly dotw: number
  readonly tomorrowDate: string
  readonly tomorrowDotw: number

  // Ambient fallback for new GoodTimes() -- exists only for callers that construct
  // GoodTimes internally and can't take a seed as a parameter (e.g. TripViewModel).
  // Anything that constructs GoodTimes itself should call seeded() directly instead
  // and leave these alone.
  static dotwSeed: number | null = null
  static minutesSeed: number | null = null

  constructor (referenceDate: Date = new Date()) {
    const gt = GoodTimes.seeded(GoodTimes.dotwSeed, GoodTimes.minutesSeed, referenceDate)
    this.date = gt.date
    this.minutes = gt.minutes
    this.seconds = gt.seconds
    this.dotw = gt.dotw
    this.tomorrowDate = gt.tomorrowDate
    this.tomorrowDotw = gt.tomorrowDotw
  }

  // dotw (0=Sunday...6=Saturday) and/or mins (minutes since midnight) pin the fields that
  // would otherwise come from the real clock -- resolved directly from the arguments, so
  // there's nothing global to reset afterward.
  static seeded (dotw: number | null = null, mins: number | null = null, referenceDate: Date = new Date()): GoodTimes {
    const run = new Date(referenceDate.getTime() - 2 * 3600 * 1000)
    const tomorrow = new Date(run.getFullYear(), run.getMonth(), run.getDate() + 1)
    const resolvedDotw = dotw ?? run.getDay()
    const resolvedMinutes = mins ?? (run.getHours() + 2) * 60 + run.getMinutes()
    const resolvedSeconds = mins === null ? run.getSeconds() : 0
    return Object.assign(Object.create(GoodTimes.prototype) as GoodTimes, {
      date: isoDate(run),
      minutes: resolvedMinutes,
      seconds: resolvedSeconds,
      dotw: resolvedDotw,
      tomorrowDate: isoDate(tomorrow),
      tomorrowDotw: (resolvedDotw + 1) % 7,
    })
  }

  /** Schedule-day (yyyy-MM-dd) for `date`, using the same "day starts at 2am" rule as the constructor. */
  static scheduleDateFor (date: Date): string {
    return isoDate(new Date(date.getTime() - 2 * 3600 * 1000))
  }

  static partTime (minutes: number): [string, string] {
    let hrs = Math.floor(minutes / 60) % 24
    const min = minutes % 60
    const mer = hrs > 11 && hrs < 24 ? 'pm' : 'am'
    if (hrs > 12) hrs -= 12
    if (hrs > 12) hrs -= 12
    if (hrs < 1) hrs = 12
    return [`${hrs}:${min < 10 ? '0' : ''}${min}`, mer]
  }

  static fullTime (minutes: number): string {
    return GoodTimes.partTime(minutes).join('')
  }

  inThePast (target: number): boolean {
    return target - this.minutes < 0
  }

  departing (target: number): boolean {
    return target === this.minutes
  }

  countdown (target: number): string {
    const diff = target - this.minutes - 1
    if (diff < 0) {
      return ''
    } else if (diff > 59) {
      return `in ${Math.floor(diff / 60)} hr ${diff % 60} min`
    } else {
      return `in ${diff} min ${60 - this.seconds} sec`
    }
  }
}

function isoDate (d: Date): string {
  const pad = (n: number) => (n < 10 ? '0' : '') + n
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}
