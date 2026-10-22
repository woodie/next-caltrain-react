import { SvgIcon } from '@progress/kendo-react-common'
import { Calendar } from '@progress/kendo-react-dateinputs'
import { Popup } from '@progress/kendo-react-popup'
import { caretAltExpandIcon, checkIcon, chevronLeftIcon } from '@progress/kendo-svg-icons'
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

// The calendar planner: when to travel, then a prefilled Google Calendar event.
export function CalendarScreen ({ vm, back, showStationSelection }: Props) {
  const [mode, setMode] = useState(modes[0])
  const [time, setTime] = useState(() => initialTime(vm))
  const [date, setDate] = useState(() => initialDate(vm))
  const [showModes, setShowModes] = useState(false)
  const [showCalendar, setShowCalendar] = useState(false)
  // Callback refs into state, so the popups' anchors aren't read from refs during render.
  const [modeButton, setModeButton] = useState<HTMLButtonElement | null>(null)
  const [dateButton, setDateButton] = useState<HTMLButtonElement | null>(null)
  // The long date doesn't fit next to the other two on the narrowest phones.
  const narrow = window.innerWidth < 390
  const dateText = date.toLocaleDateString('en-US',
    narrow ? { month: 'numeric', day: 'numeric', year: '2-digit' } : { month: 'short', day: 'numeric', year: 'numeric' })

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
    const location = CalendarTrip.location(vm.origin)
    window.open(CalendarTrip.googleUrl(CalendarTrip.title(vm.destination), isoDate, planned, details, location), '_blank', 'noopener')
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
        {/* Pills, not text fields; Kendo's DropDownButton and TimePicker are paid. */}
        <div className="calendar-row">
          <button type="button" ref={setModeButton} className="pill" onClick={() => setShowModes(!showModes)}>
            {mode.text} <SvgIcon icon={caretAltExpandIcon} />
          </button>
          <Popup
            anchor={modeButton}
            show={showModes}
            onMouseDownOutside={(e) => { if (!modeButton?.contains(e.event.target as Node)) setShowModes(false) }}
          >
            <div className="mode-menu">
              {modes.map((m) => (
                <button type="button" key={m.value} onClick={() => { setMode(m); setShowModes(false) }}>
                  <SvgIcon icon={checkIcon} style={{ visibility: m === mode ? 'visible' : 'hidden' }} /> {m.text}
                </button>
              ))}
            </div>
          </Popup>
          <button type="button" ref={setDateButton} className="pill" onClick={() => setShowCalendar(!showCalendar)}>
            {dateText}
          </button>
          <Popup
            anchor={dateButton}
            show={showCalendar}
            anchorAlign={{ horizontal: 'center', vertical: 'bottom' }}
            popupAlign={{ horizontal: 'center', vertical: 'top' }}
            onMouseDownOutside={(e) => { if (!dateButton?.contains(e.event.target as Node)) setShowCalendar(false) }}
          >
            <Calendar value={date} onChange={(e) => { setDate(e.value); setShowCalendar(false) }} />
          </Popup>
          <input
            type="time"
            className="pill time-input"
            aria-label="Time"
            value={timeValue(time)}
            onChange={(e) => e.target.value && setTime(parseTime(e.target.value))}
          />
        </div>
        {/* The event as it lands in the calendar: the title, then the notes. */}
        <div className="event">
          {planned
            ? <>
                <div className="titled">
                  <span>{CalendarTrip.title(vm.destination)}</span>
                  <hr />
                  <span>{CalendarTrip.location(vm.origin)}</span>
                </div>
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
