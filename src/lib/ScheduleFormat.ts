// The schedule.json format the iOS, Android and web apps read. Types only,
// with no imports, so the schedule scripts (run directly by Node) can share it.

export type TimeTable = Record<string, (number | null)[]>

export interface Schedule {
  specialDates: Record<string, number>
  northStops: string[]
  southStops: string[]
  northWeekday: TimeTable
  northWeekend: TimeTable
  northHoliday: TimeTable
  southWeekday: TimeTable
  southWeekend: TimeTable
  southHoliday: TimeTable
  scheduleDate: number | null // epoch ms
}
