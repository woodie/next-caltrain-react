import { beforeEach, describe, expect, it } from 'vitest'
import { justBeforeEach } from 'penultimate'
import { GoodTimes } from '../src/lib/GoodTimes'
import { CaltrainSchedule, ScheduleType } from '../src/lib/Schedule'

const context = describe

describe('CaltrainSchedule', () => {
  describe('.optionIndex()', () => {
    let result: ScheduleType
    let date: string
    let dotw: number
    let specialDates: Record<string, number>

    justBeforeEach(() => { result = CaltrainSchedule.optionIndex(date, dotw, specialDates) })

    context('with no special dates', () => {
      beforeEach(() => { specialDates = {} })

      context('on a weekday (Wednesday, dotw=3)', () => {
        beforeEach(() => { date = '2026-06-17'; dotw = 3 })

        it('returns Weekday', () => {
          expect(result).toBe(ScheduleType.Weekday)
        })
      })

      context('on Sunday (dotw=0)', () => {
        beforeEach(() => { date = '2026-06-14'; dotw = 0 })

        it('returns Weekend', () => {
          expect(result).toBe(ScheduleType.Weekend)
        })
      })

      context('on Saturday (dotw=6)', () => {
        beforeEach(() => { date = '2026-06-13'; dotw = 6 })

        it('returns Weekend', () => {
          expect(result).toBe(ScheduleType.Weekend)
        })
      })
    })

    context('with a special date matching today', () => {
      beforeEach(() => {
        specialDates = { '2026-07-04': ScheduleType.Weekend, '2026-12-25': ScheduleType.Holiday }
      })

      context('when the special date maps to Weekend', () => {
        beforeEach(() => { date = '2026-07-04'; dotw = 3 })

        it('overrides a weekday dotw', () => {
          expect(result).toBe(ScheduleType.Weekend)
        })
      })

      context('when the special date maps to Holiday', () => {
        beforeEach(() => { date = '2026-12-25'; dotw = 5 })

        it('returns Holiday regardless of dotw', () => {
          expect(result).toBe(ScheduleType.Holiday)
        })
      })

      context('on a date not in specialDates', () => {
        beforeEach(() => { date = '2026-06-17'; dotw = 3 })

        it('falls back to dotw-based logic', () => {
          expect(result).toBe(ScheduleType.Weekday)
        })
      })
    })

    context('with a special date containing an invalid raw value', () => {
      beforeEach(() => { date = '2026-06-17'; dotw = 3; specialDates = { '2026-06-17': 99 } })

      it('falls back to Weekday', () => {
        expect(result).toBe(ScheduleType.Weekday)
      })
    })
  })

  describe('.forTomorrow()', () => {
    let result: ScheduleType
    let dotw: number

    justBeforeEach(() => {
      const goodTimes = GoodTimes.seeded(dotw)
      result = CaltrainSchedule.optionIndex(goodTimes.tomorrowDate, goodTimes.tomorrowDotw, {})
    })

    context('when today is Friday (5)', () => {
      beforeEach(() => { dotw = 5 })

      it('returns Weekend for tomorrow (Saturday)', () => {
        expect(result).toBe(ScheduleType.Weekend)
      })
    })

    context('when today is Sunday (0)', () => {
      beforeEach(() => { dotw = 0 })

      it('returns Weekday for tomorrow (Monday)', () => {
        expect(result).toBe(ScheduleType.Weekday)
      })
    })

    context('when today is Thursday (4)', () => {
      beforeEach(() => { dotw = 4 })

      it('returns Weekday for tomorrow (Friday)', () => {
        expect(result).toBe(ScheduleType.Weekday)
      })
    })
  })
})
