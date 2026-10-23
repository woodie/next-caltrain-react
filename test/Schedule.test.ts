import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { cacheKey, fetchedToday, fetchFromNetwork, lastFetchKey, ScheduleError } from '../src/lib/Schedule'

const context = describe

// fetchFromNetwork's act stays inside each `it`: a throwing call belongs inside its own assertion.
describe('Schedule.fetchedToday', () => {
  // Fixed noon, well clear of the 2am schedule-day boundary.
  const now = new Date(2026, 0, 15, 12)

  afterEach(() => { localStorage.clear() })

  context('when nothing has ever been fetched', () => {
    beforeEach(() => { localStorage.removeItem(lastFetchKey) })

    it('returns false', () => {
      expect(fetchedToday(localStorage, now)).toBe(false)
    })
  })

  context('when the last fetch was a few minutes ago', () => {
    beforeEach(() => { localStorage.setItem(lastFetchKey, String(now.getTime() - 5 * 60 * 1000)) })

    it('returns true', () => {
      expect(fetchedToday(localStorage, now)).toBe(true)
    })
  })

  context('when the last fetch was more than a day ago', () => {
    beforeEach(() => { localStorage.setItem(lastFetchKey, String(now.getTime() - 26 * 3600 * 1000)) })

    it('returns false', () => {
      expect(fetchedToday(localStorage, now)).toBe(false)
    })
  })
})

describe('Schedule.fetchFromNetwork()', () => {
  const validJSON = JSON.stringify({
    northStops: ['A', 'B'], southStops: ['A', 'B'],
    northWeekday: {}, northWeekend: {}, northHoliday: {}, southWeekday: {}, southWeekend: {}, southHoliday: {},
  })
  // northStops is empty, which fails isValid without needing a malformed-JSON case too.
  const invalidJSON = JSON.stringify({
    northStops: [], southStops: ['A', 'B'],
    northWeekday: {}, northWeekend: {}, northHoliday: {}, southWeekday: {}, southWeekend: {}, southHoliday: {},
  })

  let status: number
  let body: string
  const fakeFetch = (async () => new Response(body, { status })) as unknown as typeof fetch

  afterEach(() => { localStorage.clear() })

  context('when the server responds with 200 and valid schedule data', () => {
    beforeEach(() => { status = 200; body = validJSON })

    it('parses and returns the schedule, caching it for next launch', async () => {
      const schedule = await fetchFromNetwork(fakeFetch)

      expect(schedule.northStops).toEqual(['A', 'B'])
      expect(localStorage.getItem(cacheKey)).toBe(validJSON)
    })
  })

  context('when the server responds with a non-2xx status', () => {
    beforeEach(() => { status = 500; body = '' })

    it('throws ScheduleError with that status code, without caching anything', async () => {
      const fetching = fetchFromNetwork(fakeFetch)

      await expect(fetching).rejects.toThrow(ScheduleError)
      await expect(fetching).rejects.toThrow('status 500')
      expect(localStorage.getItem(cacheKey)).toBeNull()
    })
  })

  context('when the server responds with 200 but invalid schedule data', () => {
    beforeEach(() => { status = 200; body = invalidJSON })

    it('throws ScheduleError instead of returning or caching it', async () => {
      await expect(fetchFromNetwork(fakeFetch)).rejects.toThrow(ScheduleError)
      expect(localStorage.getItem(cacheKey)).toBeNull()
    })
  })
})
