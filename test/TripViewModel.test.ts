import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { justBeforeEach } from 'penultimate'
import { tripDepart } from '../src/lib/CaltrainService'
import { GoodTimes } from '../src/lib/GoodTimes'
import { type Schedule, ScheduleType } from '../src/lib/Schedule'
import { TripViewModel } from '../src/lib/TripViewModel'
import { SpecFixtures } from './SpecFixtures'

const context = describe

// GoodTimes' seeds must be set before the view model is built, since it reads the clock then.
function viewModelFor (schedule: Schedule, origin: string, destination: string): TripViewModel {
  const viewModel = new TripViewModel(schedule)
  viewModel.origin = origin
  viewModel.destination = destination
  viewModel.refresh()
  return viewModel
}

describe('TripViewModel', () => {
  afterEach(() => { GoodTimes.minutesSeed = null; GoodTimes.dotwSeed = null })

  context('for a route with no service tomorrow', () => {
    // Weekday-only schedule. Friday -> Saturday, so tomorrowScheduleType is Weekend.
    let viewModel: TripViewModel
    let mins: number

    justBeforeEach(() => {
      GoodTimes.minutesSeed = mins
      GoodTimes.dotwSeed = 5 // Friday
      viewModel = viewModelFor(SpecFixtures.weekdayOnlySchedule(), SpecFixtures.sanFrancisco, SpecFixtures.gilroy)
    })

    context("and all of today's trips have already departed", () => {
      // After the diesel southbound train's 545 arrival.
      beforeEach(() => { mins = 1000 })

      it("still has today's trips available", () => {
        expect(viewModel.trips).not.toEqual([])
      })

      it('has no future (tomorrow) trips appended', () => {
        expect(viewModel.trips.some((trip) => trip.isFuture)).toBe(false)
      })

      it('selects the first trip of the day, not the last', () => {
        expect(viewModel.offset).toBe(0)
      })

      it('keeps the selection at 0 on subsequent ticks', () => {
        viewModel.updateNextIndex()
        expect(viewModel.offset).toBe(0)
      })
    })

    context("and some of today's trips are still upcoming", () => {
      // Before the electric southbound train departs SF at 480.
      beforeEach(() => { mins = 100 })

      it('selects the next upcoming trip', () => {
        expect(viewModel.offset).toBe(viewModel.nextIndex)
        expect(viewModel.offset).toBe(0)
      })
    })
  })

  context('for a route with service every day', () => {
    // Monday -> Tuesday, both Weekday, so normal rollover applies.
    let viewModel: TripViewModel

    beforeEach(() => { GoodTimes.dotwSeed = 1 }) // Monday

    context("and all of today's trips have already departed", () => {
      beforeEach(() => {
        GoodTimes.minutesSeed = 1000
        viewModel = viewModelFor(SpecFixtures.schedule('weekday', 'weekend'), SpecFixtures.sanFrancisco, SpecFixtures.sanJoseDiridon)
      })

      it("appends tomorrow's trips, marked as future", () => {
        expect(viewModel.trips.some((trip) => trip.isFuture)).toBe(true)
      })

      it("rolls the selection into tomorrow's first trip", () => {
        expect(viewModel.trips[viewModel.offset].isFuture).toBe(true)
      })

      it("shifts tomorrow's depart time by a full day", () => {
        expect(tripDepart(viewModel.trips[viewModel.offset])).toBe(480 + TripViewModel.dayMinutes)
      })
    })

    context("and some of today's trips are still upcoming", () => {
      beforeEach(() => {
        GoodTimes.minutesSeed = 100
        viewModel = viewModelFor(SpecFixtures.schedule('weekday', 'weekend'), SpecFixtures.sanFrancisco, SpecFixtures.sanJoseDiridon)
      })

      it("selects today's trip, not a future one", () => {
        expect(viewModel.trips[viewModel.offset].isFuture).toBe(false)
      })
    })
  })

  context('for a route with no service on any day', () => {
    // Nothing configured at all: every table is empty.
    let viewModel: TripViewModel

    beforeEach(() => {
      GoodTimes.dotwSeed = 1 // Monday
      GoodTimes.minutesSeed = 100
      viewModel = viewModelFor(SpecFixtures.schedule(), SpecFixtures.sanFrancisco, SpecFixtures.gilroy)
    })

    it('has no trips', () => {
      expect(viewModel.trips).toEqual([])
    })

    it('selects offset 0 without crashing', () => {
      expect(viewModel.offset).toBe(0)
    })

    it('remains at offset 0 after a timer tick', () => {
      viewModel.updateNextIndex()
      expect(viewModel.offset).toBe(0)
    })
  })

  context("for a future trip's schedule type (Friday -> Saturday)", () => {
    // Friday with weekday+weekend service: today's trips all departed, tomorrow is Saturday (Weekend).
    let viewModel: TripViewModel

    beforeEach(() => {
      GoodTimes.dotwSeed = 5 // Friday
      GoodTimes.minutesSeed = 1000 // after all today's trips
      viewModel = viewModelFor(SpecFixtures.schedule('weekday', 'weekend'), SpecFixtures.sanFrancisco, SpecFixtures.sanJoseDiridon)
    })

    it('has a future trip selected', () => {
      expect(viewModel.trips[viewModel.offset].isFuture).toBe(true)
    })

    it('isFutureSelected is true', () => {
      expect(viewModel.isFutureSelected).toBe(true)
    })

    it('today is weekday, tomorrow is weekend', () => {
      expect(viewModel.scheduleType).toBe(ScheduleType.Weekday)
      expect(viewModel.tomorrowScheduleType).toBe(ScheduleType.Weekend)
    })

    it('correct schedule type for detail view is tomorrowScheduleType', () => {
      const trip = viewModel.trips[viewModel.offset]
      const detailScheduleType = trip.isFuture ? viewModel.tomorrowScheduleType : viewModel.scheduleType
      expect(detailScheduleType).toBe(ScheduleType.Weekend)
    })
  })

  context('manual selection via setOffset', () => {
    // Regression coverage for the reset button staying on: dragging back to the next train clears hasManualSelection.
    let viewModel: TripViewModel

    beforeEach(() => {
      GoodTimes.dotwSeed = 1 // Monday
      GoodTimes.minutesSeed = 100
      viewModel = viewModelFor(SpecFixtures.schedule('weekday', 'weekend'), SpecFixtures.sanFrancisco, SpecFixtures.sanJoseDiridon)
    })

    it('flags manual selection when dragging to an offset other than nextIndex', () => {
      viewModel.setOffset(viewModel.nextIndex + 1)
      expect(viewModel.hasManualSelection).toBe(true)
    })

    it('clears manual selection when dragging back to the next train', () => {
      viewModel.setOffset(viewModel.nextIndex + 1)
      expect(viewModel.hasManualSelection).toBe(true)

      viewModel.setOffset(viewModel.nextIndex)
      expect(viewModel.hasManualSelection).toBe(false)
    })

    it('resetToNext() also clears manual selection', () => {
      viewModel.setOffset(viewModel.nextIndex + 1)
      viewModel.resetToNext()
      expect(viewModel.hasManualSelection).toBe(false)
    })
  })
})
