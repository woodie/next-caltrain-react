import { describe, expect, it } from 'vitest'
import { cacheKey, loadCached } from '../src/lib/Schedule'

describe('Schedule.loadCached()', () => {
  it('spells out South San Francisco', () => {
    const json = JSON.stringify({
      northStops: ['A', 'B'], southStops: ['A', 'So San Francisco'],
      northWeekday: {}, northWeekend: {}, northHoliday: {}, southWeekday: {}, southWeekend: {}, southHoliday: {},
    })
    const storage = { getItem: (key: string) => key === cacheKey ? json : null } as Storage
    expect(loadCached(storage)?.southStops).toEqual(['A', 'South San Francisco'])
  })
})
