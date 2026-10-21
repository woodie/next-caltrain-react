import { CaltrainService, type Trip, tripDepart } from './CaltrainService'
import { GoodTimes } from './GoodTimes'
import { CaltrainSchedule, type Schedule, ScheduleType } from './Schedule'

const kStopAM = 'stopAM'
const kStopPM = 'stopPM'

// Plain state plus methods, like the apps' view models. The React side
// (useTripViewModel) re-renders after each call; specs drive it directly.
export class TripViewModel {
  origin = 'San Francisco'
  destination = 'Palo Alto'
  scheduleType: ScheduleType = ScheduleType.Weekday
  trips: Trip[] = []
  nextIndex = 0
  offset = 0
  goodTimes = new GoodTimes()
  private userSelected = false

  /** Minutes-since-midnight offset applied to "tomorrow"'s trips (see `Trip.isFuture`). */
  static readonly dayMinutes = 1440

  readonly schedule: Schedule
  readonly service: CaltrainService
  private storage: Storage

  /** `schedule` is loaded at startup (cache or network) and injected here. */
  constructor (schedule: Schedule, storage: Storage = localStorage) {
    this.schedule = schedule
    this.storage = storage
    this.service = new CaltrainService(schedule)

    const stations = schedule.southStops
    const stopAM = savedIndex(storage, kStopAM, stations.length) ?? 15
    const stopPM = savedIndex(storage, kStopPM, stations.length) ?? 0

    if (TripViewModel.isFlipped()) {
      this.origin = stations[stopPM]
      this.destination = stations[stopAM]
    } else {
      this.origin = stations[stopAM]
      this.destination = stations[stopPM]
    }

    this.scheduleType = CaltrainSchedule.optionIndex(
      this.goodTimes.date, this.goodTimes.dotw, schedule.specialDates,
    )
    this.refresh()
  }

  get hasManualSelection (): boolean {
    return this.userSelected
  }

  get swapped (): boolean {
    const today = CaltrainSchedule.optionIndex(
      this.goodTimes.date, this.goodTimes.dotw, this.schedule.specialDates,
    )
    return this.scheduleType !== today
  }

  /** Schedule type for tomorrow's date, used for trips appended after today's. */
  get tomorrowScheduleType (): ScheduleType {
    return CaltrainSchedule.optionIndex(
      this.goodTimes.tomorrowDate, this.goodTimes.tomorrowDotw, this.schedule.specialDates,
    )
  }

  get countdown (): string | null {
    if (this.offset >= this.trips.length) return null
    const c = this.goodTimes.countdown(tripDepart(this.trips[this.offset]))
    return c === '' ? null : c
  }

  get isDeparting (): boolean {
    if (this.offset >= this.trips.length) return false
    return this.goodTimes.departing(tripDepart(this.trips[this.offset]))
  }

  /** True if the currently-selected trip belongs to the appended "tomorrow" block. */
  get isFutureSelected (): boolean {
    if (this.offset >= this.trips.length) return false
    return this.trips[this.offset].isFuture
  }

  // After noon, the morning and evening stations trade places for the trip home.
  static isFlipped (now: Date = new Date()): boolean {
    return now.getHours() >= 12
  }

  get orderedStations (): string[] {
    const south = this.schedule.southStops
    const direction = CaltrainService.direction(this.origin, this.destination, south)
    return direction === 'South' ? south : [...south].reverse()
  }

  /** Called once a second: a new clock reading, and the next train it implies. */
  tick (): void {
    this.goodTimes = new GoodTimes()
    this.updateNextIndex()
  }

  refresh (): void {
    const todayTrips = this.service.routes(this.origin, this.destination, this.scheduleType)
    const tomorrowTrips = this.service.routes(this.origin, this.destination, this.tomorrowScheduleType)
      .map(shiftedToTomorrow)

    this.trips = [...todayTrips, ...tomorrowTrips]
    this.nextIndex = this.service.nextIndex(this.trips, this.goodTimes.minutes)
    this.userSelected = false
    this.offset = this.clampedOffset(this.nextIndex)
  }

  setOffset (newOffset: number): void {
    this.userSelected = newOffset !== this.nextIndex
    this.offset = newOffset
  }

  /** Falls back to the first trip if there's no service tomorrow and today's trips are all in the past. */
  private clampedOffset (desired: number): number {
    if (desired < this.trips.length) return desired
    const hasTomorrow = this.trips.some((trip) => trip.isFuture)
    if (!hasTomorrow && this.trips.length > 0) return 0
    return Math.max(0, this.trips.length - 1)
  }

  resetToNext (): void {
    this.userSelected = false
    this.offset = this.clampedOffset(this.nextIndex)
  }

  updateNextIndex (): void {
    this.nextIndex = this.service.nextIndex(this.trips, this.goodTimes.minutes)
    if (!this.userSelected) {
      this.offset = this.clampedOffset(this.nextIndex)
    } else if (this.offset >= this.trips.length) {
      this.offset = this.clampedOffset(this.offset)
    }
  }

  offsetUp (): void {
    if (this.offset > 0) this.offset -= 1
  }

  offsetDown (): void {
    if (this.offset < this.trips.length - 1) this.offset += 1
  }

  swapStations (): void {
    [this.origin, this.destination] = [this.destination, this.origin]
    this.saveStops()
    this.refresh()
  }

  saveStops (): void {
    const stations = this.schedule.southStops
    const flipped = TripViewModel.isFlipped()
    const amIdx = stations.indexOf(flipped ? this.destination : this.origin)
    const pmIdx = stations.indexOf(flipped ? this.origin : this.destination)
    if (amIdx !== -1) this.storage.setItem(kStopAM, String(amIdx))
    if (pmIdx !== -1) this.storage.setItem(kStopPM, String(pmIdx))
  }

  // The saved morning and evening stations, falling back to Palo Alto and San Francisco.
  savedStations (): { morning: string, evening: string } {
    const stations = this.schedule.southStops
    const name = (idx: number) => stations[idx < stations.length ? idx : 0]
    return {
      morning: name(savedIndex(this.storage, kStopAM, stations.length) ?? 15),
      evening: name(savedIndex(this.storage, kStopPM, stations.length) ?? 0),
    }
  }

  cycleSchedule (): void {
    this.scheduleType = ((this.scheduleType + 1) % 3) as ScheduleType
    this.refresh()
  }
}

/** Returns `trip` with legs/arrival shifted forward by `dayMinutes`, representing a "tomorrow" trip. */
function shiftedToTomorrow (trip: Trip): Trip {
  return {
    id: trip.id,
    legs: trip.legs.map((leg) => ({ ...leg, depart: leg.depart + TripViewModel.dayMinutes })),
    arrive: trip.arrive + TripViewModel.dayMinutes,
    isFuture: true,
  }
}

function savedIndex (storage: Storage, key: string, count: number): number | null {
  const raw = storage.getItem(key)
  if (raw === null) return null
  const value = Number(raw)
  return Number.isInteger(value) && value >= 0 && value < count ? value : null
}
