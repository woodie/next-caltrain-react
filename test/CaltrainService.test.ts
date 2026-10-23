import { beforeEach, describe, expect, it } from 'vitest'
import { justBeforeEach } from 'penultimate'
import { CaltrainService, isTransfer, type Trip, tripDepart } from '../src/lib/CaltrainService'
import { ScheduleType } from '../src/lib/Schedule'
import { SpecFixtures } from './SpecFixtures'

const context = describe

describe('CaltrainService', () => {
  let service: CaltrainService

  beforeEach(() => { service = new CaltrainService(SpecFixtures.weekdayOnlySchedule()) })

  describe('.isSouthCounty()', () => {
    it('returns true for South County trains (the 800s)', () => {
      expect([801, 814, 899].map(CaltrainService.isSouthCounty)).toEqual([true, true, true])
    })

    it('returns false for electric trains', () => {
      expect([101, 514, 601].map(CaltrainService.isSouthCounty)).toEqual([false, false, false])
    })

    it('returns false for Special trains (the 900s)', () => {
      expect([900, 901].map(CaltrainService.isSouthCounty)).toEqual([false, false])
    })
  })

  describe('.trainType()', () => {
    let trainId = 0
    let type: string

    justBeforeEach(() => { type = CaltrainService.trainType(trainId) })

    context('for a Local train (101)', () => {
      beforeEach(() => { trainId = 101 })
      it('returns Local', () => { expect(type).toBe('Local') })
    })

    context('for a Limited train (401)', () => {
      beforeEach(() => { trainId = 401 })
      it('returns Limited', () => { expect(type).toBe('Limited') })
    })

    context('for an Express train (501)', () => {
      beforeEach(() => { trainId = 501 })
      it('returns Express', () => { expect(type).toBe('Express') })
    })

    context('for a weekend Local train (601)', () => {
      beforeEach(() => { trainId = 601 })
      it('returns Local', () => { expect(type).toBe('Local') })
    })

    context('for a South County train (801)', () => {
      beforeEach(() => { trainId = 801 })
      it('returns South County', () => { expect(type).toBe('South County') })
    })

    context('for a Special train (901)', () => {
      beforeEach(() => { trainId = 901 })
      it('returns Special', () => { expect(type).toBe('Special') })
    })

    context('for a number outside any series (701)', () => {
      beforeEach(() => { trainId = 701 })
      it('returns Unknown', () => { expect(type).toBe('Unknown') })
    })
  })

  describe('.direction()', () => {
    let origin: string
    let destin: string
    let direction: string

    justBeforeEach(() => { direction = CaltrainService.direction(origin, destin, SpecFixtures.stops) })

    context('when traveling from San Francisco to Gilroy', () => {
      beforeEach(() => { origin = SpecFixtures.sanFrancisco; destin = SpecFixtures.gilroy })

      it('is South', () => {
        expect(direction).toBe('South')
      })
    })

    context('when traveling from Gilroy to San Francisco', () => {
      beforeEach(() => { origin = SpecFixtures.gilroy; destin = SpecFixtures.sanFrancisco })

      it('is North', () => {
        expect(direction).toBe('North')
      })
    })
  })

  describe('#routes()', () => {
    let from: string
    let to: string
    let scheduleType: ScheduleType
    let trips: Trip[]

    justBeforeEach(() => { trips = service.routes(from, to, scheduleType) })

    context('for a direct electric trip (San Francisco to San Jose Diridon)', () => {
      beforeEach(() => {
        from = SpecFixtures.sanFrancisco
        to = SpecFixtures.sanJoseDiridon
        scheduleType = ScheduleType.Weekday
      })

      it('returns one direct trip', () => {
        expect(trips).toHaveLength(1)
      })

      it('is not a transfer', () => {
        expect(isTransfer(trips[0])).toBe(false)
      })

      it('uses the electric southbound train', () => {
        expect(trips[0].id).toBe(SpecFixtures.electricSouthTrainId)
      })

      it('departs and arrives at the scheduled times', () => {
        expect(tripDepart(trips[0])).toBe(480)
        expect(trips[0].arrive).toBe(510)
      })
    })

    context('for a direct diesel trip (Morgan Hill to Gilroy)', () => {
      beforeEach(() => {
        from = SpecFixtures.morganHill
        to = SpecFixtures.gilroy
        scheduleType = ScheduleType.Weekday
      })

      it('returns one direct trip', () => {
        expect(trips).toHaveLength(1)
      })

      it('is not a transfer, since both endpoints are South County', () => {
        expect(isTransfer(trips[0])).toBe(false)
      })

      it('uses the diesel southbound train', () => {
        expect(trips[0].id).toBe(SpecFixtures.dieselSouthTrainId)
      })
    })

    context('for an unknown station', () => {
      beforeEach(() => {
        from = 'Unknown'
        to = SpecFixtures.gilroy
        scheduleType = ScheduleType.Weekday
      })

      it('returns no trips', () => {
        expect(trips).toEqual([])
      })
    })

    context('for a transfer trip (San Francisco to Gilroy)', () => {
      beforeEach(() => {
        from = SpecFixtures.sanFrancisco
        to = SpecFixtures.gilroy
        scheduleType = ScheduleType.Weekday
      })

      it('returns one trip', () => {
        expect(trips).toHaveLength(1)
      })

      it('is a transfer', () => {
        expect(isTransfer(trips[0])).toBe(true)
      })

      it('has two legs', () => {
        expect(trips[0].legs).toHaveLength(2)
      })

      it('starts with the electric train from San Francisco', () => {
        expect(trips[0].legs[0]).toEqual({ trainId: SpecFixtures.electricSouthTrainId, station: SpecFixtures.sanFrancisco, depart: 480 })
      })

      it('connects to the diesel train at San Jose Diridon', () => {
        expect(trips[0].legs[1]).toEqual({ trainId: SpecFixtures.dieselSouthTrainId, station: SpecFixtures.sanJoseDiridon, depart: 515 })
      })

      it("arrives in Gilroy at the diesel train's scheduled time", () => {
        expect(trips[0].arrive).toBe(545)
      })
    })

    context('for a transfer trip (Gilroy to San Francisco)', () => {
      beforeEach(() => {
        from = SpecFixtures.gilroy
        to = SpecFixtures.sanFrancisco
        scheduleType = ScheduleType.Weekday
      })

      it('returns one trip', () => {
        expect(trips).toHaveLength(1)
      })

      it('is a transfer', () => {
        expect(isTransfer(trips[0])).toBe(true)
      })

      it('starts with the diesel train from Gilroy', () => {
        expect(trips[0].legs[0]).toEqual({ trainId: SpecFixtures.dieselNorthTrainId, station: SpecFixtures.gilroy, depart: 420 })
      })

      it('connects to the electric train at San Jose Diridon', () => {
        expect(trips[0].legs[1]).toEqual({ trainId: SpecFixtures.electricNorthTrainId, station: SpecFixtures.sanJoseDiridon, depart: 520 })
      })

      it("arrives in San Francisco at the electric train's scheduled time", () => {
        expect(trips[0].arrive).toBe(550)
      })
    })

    context('for a route with no service (weekend, empty fixture tables)', () => {
      beforeEach(() => {
        from = SpecFixtures.sanFrancisco
        to = SpecFixtures.gilroy
        scheduleType = ScheduleType.Weekend
      })

      it('returns no trips', () => {
        expect(trips).toEqual([])
      })
    })
  })

  describe('#nextIndex()', () => {
    let trips: Trip[]

    beforeEach(() => {
      trips = service.routes(SpecFixtures.sanFrancisco, SpecFixtures.sanJoseDiridon, ScheduleType.Weekday)
    })

    context('when no trips have departed yet', () => {
      it('returns 0', () => {
        expect(service.nextIndex(trips, 0)).toBe(0)
      })
    })

    context('when all trips have already departed', () => {
      it('returns the trip count', () => {
        expect(service.nextIndex(trips, 1000)).toBe(trips.length)
      })
    })

    context('when given an empty trip list', () => {
      it('returns 0', () => {
        expect(service.nextIndex([], 500)).toBe(0)
      })
    })

    context("when the current time is exactly at the first trip's departure", () => {
      it('returns the index of that trip', () => {
        expect(service.nextIndex(trips, tripDepart(trips[0]))).toBe(0)
      })

      it('returns the next index one minute later', () => {
        expect(service.nextIndex(trips, tripDepart(trips[0]) + 1)).toBe(1)
      })
    })
  })
})
