import { arrowRotateCcwIcon, arrowsLeftRightIcon, calendarIcon, chevronLeftIcon } from '@progress/kendo-svg-icons'
import { useLayoutEffect, useRef, useState } from 'react'
import { CaltrainService, type Trip, tripDepart } from '../lib/CaltrainService'
import { GoodTimes } from '../lib/GoodTimes'
import { scheduleLabel } from '../lib/Schedule'
import type { TripViewModel } from '../lib/TripViewModel'
import { useBlink } from '../useTripViewModel'
import { rowHeight, useStepDrag } from '../useStepDrag'
import { IconButton, StationNames } from './common'

interface Props {
  vm: TripViewModel
  act: (change: (vm: TripViewModel) => void) => void
  back: () => void
  showTrip: (trip: Trip) => void
  showStationSelection: () => void
  showCalendar: () => void
}

export function TripListScreen ({ vm, act, back, showTrip, showStationSelection, showCalendar }: Props) {
  const drag = useStepDrag(vm.offset, vm.trips.length, (offset) => act((vm) => vm.setOffset(offset)))
  const listRef = useRef<HTMLDivElement>(null)
  const [rowCount, setRowCount] = useState(1)

  // As many fixed rows as fit below the header; the rows never scroll.
  useLayoutEffect(() => {
    const measure = () => {
      const height = listRef.current?.clientHeight ?? 0
      setRowCount(Math.max(1, Math.floor(height / rowHeight)))
    }
    measure()
    window.addEventListener('resize', measure)
    return () => window.removeEventListener('resize', measure)
  }, [])

  const offset = drag.effectiveOffset
  const selected = vm.trips[offset] ?? null
  const isSelectedPast = selected !== null && vm.goodTimes.inThePast(tripDepart(selected))
  const isSelectedFuture = selected?.isFuture ?? false
  const isSelectedDeparting = selected !== null && vm.goodTimes.departing(tripDepart(selected))
  const noTrains = vm.trips.length === 0
  const blinkOn = useBlink(isSelectedDeparting || noTrains)

  let statusColor = 'var(--cal-arrive)'
  if (noTrains) statusColor = 'var(--cal-past)'
  else if (vm.swapped) statusColor = 'var(--cal-swapped)'
  else if (isSelectedPast || isSelectedFuture) statusColor = 'var(--cal-past)'
  else if (isSelectedDeparting) statusColor = 'var(--cal-depart)'

  let statusText = ''
  if (noTrains) statusText = 'NO TRAINS'
  else if (isSelectedFuture) statusText = `${scheduleLabel[vm.tomorrowScheduleType]} Schedule`
  else if (vm.swapped || isSelectedPast) statusText = `${scheduleLabel[vm.scheduleType]} Schedule`
  else if (isSelectedDeparting) statusText = 'DEPARTING'
  else if (selected) statusText = vm.goodTimes.countdown(tripDepart(selected))

  const serviceLabel = selected ? `${CaltrainService.trainType(selected.legs[0].trainId)} Service` : ''
  const slots = Array.from({ length: Math.min(rowCount, vm.trips.length) }, (_, slot) => slot)

  return (
    <div className="screen trip-list">
      <div className="toolbar">
        <span className="title">{serviceLabel}</span>
        <span className="spacer" />
        {vm.hasManualSelection && (
          <IconButton icon={arrowRotateCcwIcon} label="Back to the next train" onClick={() => act((vm) => vm.resetToNext())} />
        )}
        <IconButton icon={arrowsLeftRightIcon} label="Swap stations" onClick={() => act((vm) => vm.swapStations())} />
      </div>
      <div className="toolbar second-row">
        <IconButton icon={chevronLeftIcon} label="Back" onClick={back} />
        <span className="spacer" />
        <StationNames origin={vm.origin} destination={vm.destination} onTap={showStationSelection} />
        <span className="spacer" />
        {/* Below swap, mirroring the back button; the same spot as on the home screen. */}
        <IconButton icon={calendarIcon} label="Create calendar event" onClick={showCalendar} />
      </div>
      <button
        type="button"
        className="status"
        style={{ color: statusColor, opacity: (isSelectedDeparting || noTrains) && !blinkOn ? 0 : 1 }}
        onClick={() => act((vm) => vm.cycleSchedule())}
      >
        {statusText || ' '}
      </button>

      <div className="rows" ref={listRef} {...drag.handlers}>
        {slots.map((slot) => {
          const trip = vm.trips[offset + slot]
          if (!trip) return null
          const isNext = slot === 0 && !vm.swapped
          const isInactive = !vm.swapped && (trip.isFuture || vm.goodTimes.inThePast(tripDepart(trip)))
          return (
            <TripRow
              key={slot}
              trip={trip}
              isNext={isNext}
              isInactive={isInactive}
              isDeparting={slot === 0 && isSelectedDeparting}
              swapped={vm.swapped}
              onTap={drag.tap(() => showTrip(trip))}
            />
          )
        })}
      </div>
    </div>
  )
}

interface RowProps {
  trip: Trip
  isNext: boolean
  isInactive: boolean
  isDeparting: boolean
  swapped: boolean
  onTap: () => void
}

function TripRow ({ trip, isNext, isInactive, isDeparting, swapped, onTap }: RowProps) {
  const textColor = isInactive || swapped ? 'var(--cal-past)' : 'var(--app-text)'
  let borderColor = 'transparent'
  if (isNext && isDeparting) borderColor = 'var(--cal-depart)'
  else if (isNext && (trip.isFuture || isInactive || swapped)) borderColor = 'var(--cal-swapped)'
  else if (isNext) borderColor = 'var(--cal-arrive)'

  return (
    <button type="button" className="trip-row" style={{ color: textColor, borderColor }} onClick={onTap}>
      <span className="train">#{trip.legs[0].trainId}</span>
      <Time minutes={tripDepart(trip)} />
      <Time minutes={trip.arrive} />
    </button>
  )
}

function Time ({ minutes }: { minutes: number }) {
  const [time, mer] = GoodTimes.partTime(minutes)
  return <span className="row-time">{time}<span className="meridiem">{mer}</span></span>
}
