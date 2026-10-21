import { DatePicker } from '@progress/kendo-react-dateinputs'
import { DropDownList } from '@progress/kendo-react-dropdowns'
import { checkIcon, chevronLeftIcon } from '@progress/kendo-svg-icons'
import { useState } from 'react'
import { CalendarTrip, type PlanMode } from '../lib/CalendarTrip'
import { tripDepart } from '../lib/CaltrainService'
import { CaltrainSchedule } from '../lib/Schedule'
import type { TripViewModel } from '../lib/TripViewModel'
import { IconButton } from './common'

const modes: { text: string, value: PlanMode }[] = [
  { text: 'Leave at', value: 'leave' },
  { text: 'Arrive by', value: 'arrive' },
]

// A schedule day starts at 2:00 AM, so a time before then means late that
// night (12:05 AM is 1445 minutes), the same rule as GoodTimes.
const scheduleDayStart = 120

interface Props {
  vm: TripViewModel
  back: () => void
  showStationSelection: () => void
}

// Plan a trip for the calendar, like Google Maps: Leave at / Arrive by, a
// date and a time, then a prefilled Google Calendar event.
export function CalendarScreen ({ vm, back, showStationSelection }: Props) {
  const [mode, setMode] = useState(modes[0])
  const [time, setTime] = useState(() => initialTime(vm))
  const [date, setDate] = useState(() => initialDate(vm))
  // The long date doesn't fit next to the other two on the narrowest phones.
  const narrow = window.innerWidth < 390

  const isoDate = CalendarTrip.isoDate(date)
  const scheduleType = CaltrainSchedule.optionIndex(isoDate, date.getDay(), vm.schedule.specialDates)
  const trips = vm.service.routes(vm.origin, vm.destination, scheduleType)
  let minutes = time.getHours() * 60 + time.getMinutes()
  if (minutes < scheduleDayStart) minutes += 1440
  const index = CalendarTrip.find(trips, mode.value, minutes)
  const trains = index === -1 ? [] : CalendarTrip.neighbors(trips, index)
  const planned = trains.find((train) => train.selected)

  const addToCalendar = () => {
    if (!planned) return
    const details = CalendarTrip.notes(vm.origin, vm.destination, trains)
    window.open(CalendarTrip.googleUrl(CalendarTrip.title(vm.destination), isoDate, planned, details), '_blank', 'noopener')
  }

  return (
    <div className="screen calendar">
      <div className="toolbar">
        <IconButton icon={chevronLeftIcon} label="Back" onClick={back} />
        <span className="title centered">Create Calendar Event</span>
        {/* Adds the event, the same green check as the station screen's Save. */}
        {planned
          ? <IconButton icon={checkIcon} label="Add to Google Calendar" onClick={addToCalendar} className="confirm" />
          : <span className="icon-placeholder" />}
      </div>
      <div className="calendar-content">
        <button type="button" className="pill" onClick={showStationSelection}>
          {vm.origin} to {vm.destination}
        </button>
        {/* One line: (Leave at) (Oct 21, 2026) (4:20 PM), date then time like
            a calendar's own start row, or (10/21/26) on a narrow phone. */}
        <div className="calendar-row">
          <DropDownList data={modes} textField="text" dataItemKey="value" value={mode} rounded="full" onChange={(e) => setMode(e.value)} />
          <DatePicker value={date} onChange={(e) => e.value && setDate(e.value)} format={narrow ? 'M/d/yy' : 'MMM d, yyyy'} rounded="full" className={narrow ? 'narrow' : undefined} />
          <span className="k-input k-input-md k-rounded-full k-input-solid time">
            <input type="time" className="k-input-inner" aria-label="Time" value={timeValue(time)} onChange={(e) => e.target.value && setTime(parseTime(e.target.value))} />
          </span>
        </div>
        {/* The event as it lands in the calendar: the title, then the notes. */}
        <div className="event">
          {planned
            ? <>
                <div>{CalendarTrip.title(vm.destination)}</div>
                <div>{CalendarTrip.notes(vm.origin, vm.destination, trains)}</div>
              </>
            : <div>No train fits that time.</div>}
        </div>
      </div>
    </div>
  )
}

// The selected train's departure, or now if there's no train.
function initialTime (vm: TripViewModel): Date {
  const trip = vm.trips[vm.offset]
  const minutes = trip ? tripDepart(trip) % 1440 : vm.goodTimes.minutes % 1440
  const d = new Date()
  d.setHours(Math.floor(minutes / 60), minutes % 60, 0, 0)
  return d
}

function timeValue (d: Date): string {
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

function parseTime (value: string): Date {
  const [hours, minutes] = value.split(':').map(Number)
  const d = new Date()
  d.setHours(hours, minutes, 0, 0)
  return d
}

// The next date (today first, or tomorrow for tomorrow's trips) whose schedule
// matches the one on screen, so viewing Weekend on a Tuesday plans a Saturday.
function initialDate (vm: TripViewModel): Date {
  const trip = vm.trips[vm.offset]
  const isFuture = trip?.isFuture ?? false
  const wanted = isFuture ? vm.tomorrowScheduleType : vm.scheduleType
  const today = new Date()
  // Before 2:00 AM it's still the previous schedule day.
  if (today.getHours() * 60 + today.getMinutes() < scheduleDayStart) today.setDate(today.getDate() - 1)
  for (let days = isFuture ? 1 : 0; days < 14; days++) {
    const d = new Date(today.getFullYear(), today.getMonth(), today.getDate() + days)
    const type = CaltrainSchedule.optionIndex(CalendarTrip.isoDate(d), d.getDay(), vm.schedule.specialDates)
    if (type === wanted) return d
  }
  return new Date(today.getFullYear(), today.getMonth(), today.getDate() + (isFuture ? 1 : 0))
}
