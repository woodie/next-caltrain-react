import { arrowRotateCcwIcon, arrowsLeftRightIcon, calendarIcon } from '@progress/kendo-svg-icons'
import { CaltrainService, tripDepart } from '../lib/CaltrainService'
import { GoodTimes } from '../lib/GoodTimes'
import { scheduleLabel } from '../lib/Schedule'
import type { TripViewModel } from '../lib/TripViewModel'
import { useBlink } from '../useTripViewModel'
import { useStepDrag } from '../useStepDrag'
import { IconButton, StationNames } from './common'

interface Props {
  vm: TripViewModel
  act: (change: (vm: TripViewModel) => void) => void
  showTripList: () => void
  showStationSelection: () => void
  showCalendar: () => void
  showAbout: () => void
}

export function HomeScreen ({ vm, act, showTripList, showStationSelection, showAbout, showCalendar }: Props) {
  const drag = useStepDrag(vm.offset, vm.trips.length, (offset) => act((vm) => vm.setOffset(offset)))
  const trip = vm.trips[drag.effectiveOffset] ?? null
  const noTrainsAtAll = vm.trips.length === 0
  const isSelectedPast = trip !== null && vm.goodTimes.inThePast(tripDepart(trip))
  const isSelectedFuture = trip?.isFuture ?? false
  const isSelectedDeparting = trip !== null && vm.goodTimes.departing(tripDepart(trip))
  const blinkOn = useBlink(isSelectedDeparting || noTrainsAtAll)

  let ring = 'var(--cal-arrive)'
  if (noTrainsAtAll || isSelectedFuture || vm.swapped || isSelectedPast) ring = 'var(--cal-swapped)'
  else if (isSelectedDeparting) ring = 'var(--cal-depart)'

  let blurb: { text: string, color: string, blink?: boolean } | null = null
  if (noTrainsAtAll) {
    blurb = { text: 'NO TRAINS', color: 'var(--cal-past)', blink: true }
  } else if (isSelectedFuture) {
    blurb = { text: scheduleLabel[vm.tomorrowScheduleType], color: 'var(--cal-past)' }
  } else if (isSelectedDeparting) {
    blurb = { text: 'DEPARTING', color: 'var(--cal-depart)', blink: true }
  } else if (vm.swapped || isSelectedPast) {
    blurb = { text: scheduleLabel[vm.scheduleType], color: 'var(--cal-past)' }
  } else if (trip !== null) {
    const c = vm.goodTimes.countdown(tripDepart(trip))
    if (c !== '') blurb = { text: c, color: 'var(--cal-arrive)' }
  }

  const trainColor = vm.swapped || isSelectedPast || isSelectedFuture ? 'var(--cal-past)' : 'var(--app-text)'

  return (
    <div className="screen home">
      <div className="toolbar">
        <button type="button" className="title" onClick={showAbout}>Next Caltrain</button>
        <span className="spacer" />
        {vm.hasManualSelection && (
          <IconButton icon={arrowRotateCcwIcon} label="Back to the next train" onClick={() => act((vm) => vm.resetToNext())} />
        )}
        <IconButton icon={arrowsLeftRightIcon} label="Swap stations" onClick={() => act((vm) => vm.swapStations())} />
      </div>
      {/* Below swap, where the trip list has it too. */}
      <div className="toolbar second-row">
        <span className="spacer" />
        <IconButton icon={calendarIcon} label="Create calendar event" onClick={showCalendar} />
      </div>

      <div
        className="circle"
        style={{ borderColor: ring }}
        onClick={drag.tap(showTripList)}
        {...drag.handlers}
      >
        <div className="circle-content">
          <StationNames
            origin={vm.origin}
            destination={vm.destination}
            onTap={drag.tap(showStationSelection)}
          />
          {blurb && (
            <div className="blurb" style={{ color: blurb.color, opacity: blurb.blink && !blinkOn ? 0 : 1 }}>
              {blurb.text}
            </div>
          )}
          {trip && (
            <>
              <div className="hero-time" style={{ color: trainColor }}>
                <span className="train">#{trip.legs[0].trainId}</span>
                <span className="time">{GoodTimes.partTime(tripDepart(trip))[0]}</span>
                <span className="meridiem">{GoodTimes.partTime(tripDepart(trip))[1]}</span>
              </div>
              <div className="train">{CaltrainService.trainType(trip.legs[0].trainId)}</div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
