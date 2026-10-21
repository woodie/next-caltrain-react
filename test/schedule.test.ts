import { describe, expect, it } from 'vitest'
import { buildSchedule, feedVersionMs } from '../scripts/schedule/build.ts'
import { changes, check, formatSchedule } from '../scripts/schedule/check.ts'
import { effectiveDate } from '../scripts/schedule/caltrain.ts'
import { liveOn, pacificToday, pacificTomorrow, timetableName } from '../scripts/schedule/files.ts'
import { parseCsv } from '../scripts/schedule/gtfs.ts'

const context = describe

// A tiny Caltrain: San Francisco (70011/70012), Palo Alto (70171/70172) and
// Gilroy (70261/70262); odd stop IDs are northbound platforms.
const gtfs = (extraStopTimes = '') => ({
  'feed_info.txt': 'feed_publisher_name,feed_version,feed_start_date\n"Trillium Solutions, Inc.",UTC: 10-Jun-2026 22:25,20260131\n',
  'stops.txt': [
    'stop_id,stop_name',
    'gilroy,Gilroy Station',
    '70011,San Francisco Caltrain Northbound',
    '70012,San Francisco Caltrain Southbound',
    '70171,Palo Alto Caltrain Northbound',
    '70172,Palo Alto Caltrain Southbound',
    '70261,Gilroy Caltrain Northbound',
    '70262,Gilroy Caltrain Southbound',
    '2537740,Stanford Caltrain Northbound',
  ].join('\n'),
  'calendar.txt': [
    'service_id,monday,tuesday,wednesday,thursday,friday,saturday,sunday',
    'WKND,0,0,0,0,0,1,1',
    'WKDY,1,1,1,1,1,0,0',
  ].join('\n'),
  'calendar_dates.txt': [
    'service_id,date,holiday_name,exception_type',
    'WC,20260616,World Cup,1',
    'MOD,20261127,Day after Thanksgiving,1',
    'WKDY,20261127,Day after Thanksgiving,2',
    'WKND,20261126,Thanksgiving Day,1',
    'WKDY,20261126,Thanksgiving Day,2',
    'WKND,20260525,Memorial Day,1',
  ].join('\n'),
  'trips.txt': [
    'service_id,trip_id,trip_short_name',
    'WKDY,t101,101',
    'WKDY,t102,102',
    'WKND,t601,601',
    'WKND,t602,602',
    'WC,t901,901',
    ...Array.from({ length: 10 }, (_, i) => `MOD,m${i},M${103 + 2 * i}`),
  ].join('\n'),
  'stop_times.txt': [
    'trip_id,departure_time,stop_id',
    't101,23:10:00,70171',
    't101,24:05:00,70011',
    't102,08:00:00,70012',
    't102,08:50:00,70172',
    't102,09:40:00,70262',
    't601,10:00:00,70171',
    't602,11:00:00,70012',
    'm0,06:00:00,70171',
    extraStopTimes,
  ].join('\n'),
})

describe('Schedule pipeline', () => {
  describe('.parseCsv()', () => {
    it('keeps quoted commas in a field', () => {
      expect(parseCsv('a,b\n"x, y",z\n')).toEqual([{ a: 'x, y', b: 'z' }])
    })
  })

  describe('.buildSchedule()', () => {
    const { schedule, feedVersion, feedStartDate } = buildSchedule(gtfs())

    it('names stations the way the apps do', () => {
      expect(schedule.southStops).toEqual(['San Francisco', 'Palo Alto', 'Gilroy'])
      expect(schedule.northStops).toEqual(['Gilroy', 'Palo Alto', 'San Francisco'])
    })

    it('lists each train once per schedule, with nulls where it skips a stop', () => {
      expect(schedule.southWeekday).toEqual({ 102: [480, 530, 580] })
      expect(schedule.northWeekend).toEqual({ 601: [null, 600, null] })
    })

    it('keeps times past midnight over 1440', () => {
      expect(schedule.northWeekday['101']).toEqual([null, 1390, 1445])
    })

    it('drops the M from holiday train numbers', () => {
      expect(Object.keys(schedule.northHoliday)).toEqual(['103'])
    })

    it('reads the feed version and start date', () => {
      expect(feedVersion).toBe('UTC: 10-Jun-2026 22:25')
      expect(feedStartDate).toBe('2026-01-31')
      expect(schedule.scheduleDate).toBe(Date.UTC(2026, 5, 10, 22, 25))
    })

    context('special dates', () => {
      it('marks weekend and holiday service, ignoring one-off extras', () => {
        expect(schedule.specialDates).toEqual({ '2026-05-25': 1, '2026-11-26': 1, '2026-11-27': 2 })
      })

      it('drops dates before the go-live date', () => {
        expect(buildSchedule(gtfs(), '2026-11-27').schedule.specialDates).toEqual({ '2026-11-27': 2 })
      })
    })
  })

  describe('.feedVersionMs()', () => {
    it('is null for a format it does not know', () => {
      expect(feedVersionMs('version 7')).toBeNull()
    })
  })

  describe('.check()', () => {
    context('for a good schedule', () => {
      const problems = check(buildSchedule(gtfs()).schedule)

      it('finds no problems', () => {
        expect(problems).toEqual({ errors: [], warnings: [] })
      })
    })

    context('for a train that reaches a station before the one it left', () => {
      const problems = check(buildSchedule(gtfs('m0,05:50:00,70011')).schedule)

      it('warns, naming the train and stations', () => {
        expect(problems.warnings).toEqual(['northHoliday #103 reaches San Francisco (5:50am) before leaving Palo Alto (6:00am).'])
      })
    })
  })

  describe('.changes()', () => {
    const before = buildSchedule(gtfs()).schedule
    const after = buildSchedule(gtfs('t601,10:30:00,70011')).schedule

    it('names the retimed trains', () => {
      expect(changes(before, after)).toEqual(['- **northWeekend:** 1 retimed (601)'])
    })
  })

  describe('.formatSchedule()', () => {
    const { schedule } = buildSchedule(gtfs())

    it('writes the same schedule, one train per line', () => {
      const text = formatSchedule(schedule)
      expect(JSON.parse(text)).toEqual(schedule)
      expect(text).toContain('\n    "102": [480,530,580]')
    })
  })

  describe('.timetableName()', () => {
    it('names the file for its GTFS build', () => {
      expect(timetableName(Date.UTC(2026, 5, 10, 22, 25))).toBe('gtfs-20260610-2225.json')
    })
  })

  describe('.liveOn()', () => {
    const dates = {
      'gtfs-20260610-2225.json': '2026-01-31',
      'gtfs-20270112-1840.json': '2027-01-30',
      'gtfs-20270301-0900.json': '2027-03-07',
    }

    it('is the timetable with the latest go-live date that has arrived', () => {
      expect(liveOn('2026-12-01', dates)).toBe('gtfs-20260610-2225.json')
      expect(liveOn('2027-01-30', dates)).toBe('gtfs-20270112-1840.json')
    })

    it('is null before any timetable goes live', () => {
      expect(liveOn('2025-12-31', dates)).toBeNull()
    })

    context('when a date was edited to go live before an older timetable', () => {
      const edited = { ...dates, 'gtfs-20270301-0900.json': '2027-01-15' }

      it('follows the dates, not the file names', () => {
        expect(liveOn('2027-01-20', edited)).toBe('gtfs-20270301-0900.json')
      })
    })
  })

  describe('.effectiveDate()', () => {
    context("on Caltrain's schedules page", () => {
      const html = `<h2>Temporary Schedules</h2>
        <a>Weekend Schedule (PDF)</a> - Effective 7/11-12, 8/8-9, 8/22-23 and 9/19-20, 2026
        <h2>Regular Service Schedules</h2>
        <a>Weekday Schedule (PDF)</a> - Effective January 31, 2026
        <a>Weekend Schedule (PDF)</a> - Effective January 31, 2026
        <a>Weekday Schedule (PDF)</a> - Effective September 21, 2024`

      it("is the current weekday schedule's date, not a temporary or older one", () => {
        expect(effectiveDate(html)).toBe('2026-01-31')
      })
    })

    context('when the page no longer says', () => {
      it('is null', () => { expect(effectiveDate('<p>Schedules</p>')).toBeNull() })
    })
  })

  describe('.pacificToday()', () => {
    it('uses Pacific time, not UTC', () => {
      expect(pacificToday(new Date('2026-10-21T05:00:00Z'))).toBe('2026-10-20')
    })
  })

  describe('.pacificTomorrow()', () => {
    it("is the day after Pacific time's today", () => {
      expect(pacificTomorrow(new Date('2026-10-21T05:00:00Z'))).toBe('2026-10-21')
    })
  })
})
