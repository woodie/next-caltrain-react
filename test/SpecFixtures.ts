import type { Schedule, TimeTable } from '../src/lib/Schedule'

// The apps' SpecFixtures: 16 stops, SF=0 ... Gilroy=15 (south = increasing index).
const stopCount = 16
const sanFranciscoIndex = 0
const sanJoseDiridonIndex = 7
const morganHillIndex = 14
const gilroyIndex = 15

const stops = Array.from({ length: stopCount }, (_, i) => `Stop ${i}`)
stops[sanFranciscoIndex] = 'San Francisco'
stops[sanJoseDiridonIndex] = 'San Jose Diridon'
stops[morganHillIndex] = 'Morgan Hill'
stops[gilroyIndex] = 'Gilroy'

const electricSouthTrainId = 101
const electricNorthTrainId = 102
const dieselSouthTrainId = 801
const dieselNorthTrainId = 802

// A row of stopCount times; `north` reverses the indexes to match northStops.
function row (times: [number, number][], north = false): (number | null)[] {
  const result: (number | null)[] = Array(stopCount).fill(null)
  for (const [southIndex, time] of times) {
    result[north ? stopCount - 1 - southIndex : southIndex] = time
  }
  return result
}

// Electric: SF 480 -> SJ 510 south, SJ 520 -> SF 550 north.
// Diesel: SJ 515 -> Morgan Hill 535 -> Gilroy 545 south, Gilroy 420 -> Morgan Hill 430 -> SJ 450 north.
const south: TimeTable = {
  [electricSouthTrainId]: row([[sanFranciscoIndex, 480], [sanJoseDiridonIndex, 510]]),
  [dieselSouthTrainId]: row([[sanJoseDiridonIndex, 515], [morganHillIndex, 535], [gilroyIndex, 545]]),
}
const north: TimeTable = {
  [electricNorthTrainId]: row([[sanJoseDiridonIndex, 520], [sanFranciscoIndex, 550]], true),
  [dieselNorthTrainId]: row([[gilroyIndex, 420], [morganHillIndex, 430], [sanJoseDiridonIndex, 450]], true),
}

type ServiceDay = 'weekday' | 'weekend' | 'holiday'

export const SpecFixtures = {
  sanFrancisco: stops[sanFranciscoIndex],
  sanJoseDiridon: stops[sanJoseDiridonIndex],
  morganHill: stops[morganHillIndex],
  gilroy: stops[gilroyIndex],
  stops,
  electricSouthTrainId,
  electricNorthTrainId,
  dieselSouthTrainId,
  dieselNorthTrainId,

  // Normal electric and diesel service on the given days; the other tables are empty.
  schedule (...days: ServiceDay[]): Schedule {
    const table = (day: ServiceDay, times: TimeTable) => (days.includes(day) ? { ...times } : {})
    return {
      specialDates: {},
      northStops: [...stops].reverse(),
      southStops: stops,
      northWeekday: table('weekday', north),
      northWeekend: table('weekend', north),
      northHoliday: table('holiday', north),
      southWeekday: table('weekday', south),
      southWeekend: table('weekend', south),
      southHoliday: table('holiday', south),
      scheduleDate: null,
    }
  },

  weekdayOnlySchedule (): Schedule {
    return SpecFixtures.schedule('weekday')
  },
}
