import { beforeEach, describe, expect, it } from 'vitest'
import { justBeforeEach } from 'penultimate'
import { GoodTimes } from '../src/lib/GoodTimes'

const context = describe

describe('GoodTimes', () => {
  let gt: GoodTimes
  let minutes: number

  describe('.partTime()', () => {
    let result: [string, string]

    context('when given a morning time', () => {
      beforeEach(() => { result = GoodTimes.partTime(330) }) // 5:30am

      it("returns the time and 'am'", () => {
        expect(result).toEqual(['5:30', 'am'])
      })
    })

    context('when given noon', () => {
      beforeEach(() => { result = GoodTimes.partTime(720) })

      it("returns 12:00 and 'pm'", () => {
        expect(result).toEqual(['12:00', 'pm'])
      })
    })

    context('when given midnight', () => {
      beforeEach(() => { result = GoodTimes.partTime(0) })

      it("returns 12:00 and 'am'", () => {
        expect(result).toEqual(['12:00', 'am'])
      })
    })

    context("when given a today's-schedule post-midnight time (24:00-25:59 range)", () => {
      beforeEach(() => { result = GoodTimes.partTime(1445) }) // 24:05

      it('formats 24:05 as 12:05am', () => {
        expect(result).toEqual(['12:05', 'am'])
      })
    })

    context('when given a tomorrow-shifted time (>= 1440)', () => {
      context('at 1740 (29:00)', () => {
        beforeEach(() => { result = GoodTimes.partTime(1740) })

        it('wraps to 5:00am', () => {
          expect(result).toEqual(['5:00', 'am'])
        })
      })

      context('at 1620 (27:00)', () => {
        beforeEach(() => { result = GoodTimes.partTime(1620) })

        it('wraps to 3:00am', () => {
          expect(result).toEqual(['3:00', 'am'])
        })
      })
    })
  })

  describe('.fullTime()', () => {
    let result: string

    context('when given noon', () => {
      beforeEach(() => { result = GoodTimes.fullTime(720) })

      it("returns '12:00pm'", () => {
        expect(result).toBe('12:00pm')
      })
    })
  })

  context("when 'now' is fixed via GoodTimes.seeded", () => {
    beforeEach(() => { gt = GoodTimes.seeded(null, 720) })

    describe('#inThePast()', () => {
      context('when the target is before now', () => {
        beforeEach(() => { minutes = gt.minutes - 2 })

        it('returns true', () => {
          expect(gt.inThePast(minutes)).toBe(true)
        })
      })

      context('when the target is after now', () => {
        beforeEach(() => { minutes = gt.minutes + 2 })

        it('returns false', () => {
          expect(gt.inThePast(minutes)).toBe(false)
        })
      })
    })

    describe('#departing()', () => {
      context('when the target equals now', () => {
        beforeEach(() => { minutes = gt.minutes })

        it('returns true', () => {
          expect(gt.departing(minutes)).toBe(true)
        })
      })

      context('when the target does not equal now', () => {
        beforeEach(() => { minutes = gt.minutes + 1 })

        it('returns false', () => {
          expect(gt.departing(minutes)).toBe(false)
        })
      })
    })

    describe('#countdown()', () => {
      context('when the target is in the past', () => {
        beforeEach(() => { minutes = gt.minutes - 1 })

        it('returns an empty string', () => {
          expect(gt.countdown(minutes)).toBe('')
        })
      })

      context('when the target is more than an hour away', () => {
        beforeEach(() => { minutes = gt.minutes + 66 })

        it("formats as 'in N hr M min'", () => {
          expect(gt.countdown(minutes)).toBe('in 1 hr 5 min')
        })
      })

      context('when the target is less than an hour away', () => {
        beforeEach(() => { minutes = gt.minutes + 5 })

        it("formats as 'in N min M sec'", () => {
          expect(gt.countdown(minutes)).toMatch(/^in 4 min \d+ sec$/)
        })
      })
    })
  })

  context("when 'today' is fixed via GoodTimes.seeded", () => {
    let dotw: number

    justBeforeEach(() => { gt = GoodTimes.seeded(dotw) })

    context('and today is Friday (5)', () => {
      beforeEach(() => { dotw = 5 })

      it('computes tomorrow as Saturday (6)', () => {
        expect(gt.dotw).toBe(5)
        expect(gt.tomorrowDotw).toBe(6)
      })
    })

    context('and today is Saturday (6)', () => {
      beforeEach(() => { dotw = 6 })

      it('computes tomorrow as Sunday (0), wrapping the week', () => {
        expect(gt.tomorrowDotw).toBe(0)
      })
    })

    context('and today is Sunday (0)', () => {
      beforeEach(() => { dotw = 0 })

      it('computes tomorrow as Monday (1)', () => {
        expect(gt.tomorrowDotw).toBe(1)
      })
    })
  })

  describe('.scheduleDateFor()', () => {
    // Local times, like the apps' Calendar.current, so the comparison holds in any time zone.
    it('returns the same schedule-day for two instants on the same calendar day, both after 2am', () => {
      const morning = new Date(2026, 5, 15, 10)
      const night = new Date(2026, 5, 15, 23)

      expect(GoodTimes.scheduleDateFor(morning)).toBe(GoodTimes.scheduleDateFor(night))
    })

    it('treats 1am as still belonging to the previous schedule-day', () => {
      const lateNight = new Date(2026, 5, 15, 23)
      const earlyMorning = new Date(2026, 5, 16, 1)

      expect(GoodTimes.scheduleDateFor(earlyMorning)).toBe(GoodTimes.scheduleDateFor(lateNight))
    })

    it('rolls over to the next schedule-day right at the 2am boundary', () => {
      const before = new Date(2026, 5, 16, 1, 59)
      const after = new Date(2026, 5, 16, 2, 1)

      expect(GoodTimes.scheduleDateFor(after)).not.toBe(GoodTimes.scheduleDateFor(before))
    })
  })
})
