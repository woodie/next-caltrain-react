import { type Schedule, ScheduleType, type TimeTable } from './Schedule'

// MARK: - Models

export interface Leg {
  trainId: number
  station: string
  depart: number // minutes since midnight
}

export interface Trip {
  id: number // lead train ID
  legs: Leg[]
  arrive: number // arrival at final destination (minutes since midnight)
  isFuture: boolean // true if this trip belongs to the appended "tomorrow" block
}

export const tripDepart = (trip: Trip) => trip.legs[0].depart
export const isTransfer = (trip: Trip) => trip.legs.length > 1

interface Run {
  trainId: number
  from: number
  to: number
}

// MARK: - Service

export class CaltrainService {
  static readonly southCountyStations = new Set([
    'Gilroy', 'San Martin', 'Morgan Hill', 'Blossom Hill', 'Capitol',
  ])

  static readonly transferStation = 'San Jose Diridon'

  readonly schedule: Schedule

  constructor (schedule: Schedule) {
    this.schedule = schedule
  }

  // MARK: - Public

  routes (depart: string, arrive: string, scheduleType: ScheduleType): Trip[] {
    const departIsSC = CaltrainService.southCountyStations.has(depart)
    const arriveIsSC = CaltrainService.southCountyStations.has(arrive)

    const needsTransfer = scheduleType === ScheduleType.Weekday && departIsSC !== arriveIsSC

    return needsTransfer
      ? this.transferRoutes(depart, arrive, scheduleType)
      : this.directRoutes(depart, arrive, scheduleType)
  }

  nextIndex (trips: Trip[], minutes: number): number {
    const index = trips.findIndex((trip) => tripDepart(trip) >= minutes)
    return index === -1 ? trips.length : index
  }

  // MARK: - Private

  private directRoutes (depart: string, arrive: string, scheduleType: ScheduleType): Trip[] {
    const direction = CaltrainService.direction(depart, arrive, this.schedule.southStops)
    const stops = direction === 'North' ? this.schedule.northStops : this.schedule.southStops
    const departIdx = stops.indexOf(depart)
    const arriveIdx = stops.indexOf(arrive)
    if (departIdx === -1 || arriveIdx === -1) return []

    return CaltrainService.runs(this.select(direction, scheduleType), departIdx, arriveIdx, () => true)
      .map((run) => ({
        id: run.trainId,
        legs: [{ trainId: run.trainId, station: depart, depart: run.from }],
        arrive: run.to,
        isFuture: false,
      }))
      .sort((a, b) => tripDepart(a) - tripDepart(b))
  }

  private transferRoutes (origin: string, destination: string, scheduleType: ScheduleType): Trip[] {
    const direction = CaltrainService.direction(origin, destination, this.schedule.southStops)
    const source = this.select(direction, scheduleType)
    const stops = direction === 'North' ? this.schedule.northStops : this.schedule.southStops
    const originIdx = stops.indexOf(origin)
    const transferIdx = stops.indexOf(CaltrainService.transferStation)
    const destIdx = stops.indexOf(destination)
    if (originIdx === -1 || transferIdx === -1 || destIdx === -1) return []

    const transfer = CaltrainService.transferStation
    const isSC = CaltrainService.isSouthCounty
    const byFrom = (a: Run, b: Run) => a.from - b.from

    if (direction === 'North') {
      // SC trains: origin -> SJD, then electric trains: SJD -> destination
      const scTrains = CaltrainService.runs(source, originIdx, transferIdx, isSC).sort(byFrom)
      const elTrains = CaltrainService.runs(source, transferIdx, destIdx, (id) => !isSC(id)).sort(byFrom)

      // Pair each SC train with the first electric departing SJD >= SC arrival
      const trips: Trip[] = []
      for (const sc of scTrains) {
        const el = elTrains.find((e) => e.from >= sc.to)
        if (!el) continue
        trips.push({
          id: sc.trainId,
          legs: [
            { trainId: sc.trainId, station: origin, depart: sc.from },
            { trainId: el.trainId, station: transfer, depart: el.from },
          ],
          arrive: el.to,
          isFuture: false,
        })
      }
      return trips
    } else {
      // Electric trains: origin -> SJD, then SC trains: SJD -> destination
      const elTrains = CaltrainService.runs(source, originIdx, transferIdx, (id) => !isSC(id)).sort(byFrom)
      const scTrains = CaltrainService.runs(source, transferIdx, destIdx, isSC).sort(byFrom)

      // Pair each SC train with the last electric arriving SJD <= SC departure
      const trips: Trip[] = []
      for (const sc of scTrains) {
        const el = elTrains.filter((e) => e.to <= sc.from).at(-1)
        if (!el) continue
        trips.push({
          id: el.trainId,
          legs: [
            { trainId: el.trainId, station: origin, depart: el.from },
            { trainId: sc.trainId, station: transfer, depart: sc.from },
          ],
          arrive: sc.to,
          isFuture: false,
        })
      }
      return trips.sort((a, b) => tripDepart(a) - tripDepart(b))
    }
  }

  // Trains in `source` (matching `include`) that stop at both indexes.
  private static runs (source: TimeTable, fromIdx: number, toIdx: number, include: (id: number) => boolean): Run[] {
    const out: Run[] = []
    for (const [trainKey, times] of Object.entries(source)) {
      const trainId = Number(trainKey)
      const from = times[fromIdx]
      const to = times[toIdx]
      if (Number.isNaN(trainId) || !include(trainId) || from == null || to == null) continue
      out.push({ trainId, from, to })
    }
    return out
  }

  // MARK: - Helpers

  static direction (depart: string, arrive: string, stops: string[]): 'North' | 'South' {
    const departIdx = Math.max(stops.indexOf(depart), 0)
    const arriveIdx = Math.max(stops.indexOf(arrive), 0)
    return departIdx < arriveIdx ? 'South' : 'North'
  }

  static isSouthCounty (trainId: number): boolean {
    return Math.floor(trainId / 100) === 8
  }

  // Caltrain numbers trains by service: the first digit is the type
  // (100s weekday Local, 600s weekend Local, ...), the last digit's parity the direction.
  static trainType (trainId: number): string {
    switch (Math.floor(trainId / 100)) {
      case 1: case 6: return 'Local'
      case 4: return 'Limited'
      case 5: return 'Express'
      case 8: return 'South County'
      case 9: return 'Special'
      default: return 'Unknown'
    }
  }

  select (direction: 'North' | 'South', scheduleType: ScheduleType): TimeTable {
    const s = this.schedule
    switch (scheduleType) {
      case ScheduleType.Weekday: return direction === 'North' ? s.northWeekday : s.southWeekday
      case ScheduleType.Weekend: return direction === 'North' ? s.northWeekend : s.southWeekend
      case ScheduleType.Holiday: return direction === 'North' ? s.northHoliday : s.southHoliday
    }
  }
}
