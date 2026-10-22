import { useState } from 'react'
import { CalendarTrip, type PlanMode } from '../lib/CalendarTrip'
import { tripDepart } from '../lib/CaltrainService'
import { CaltrainSchedule } from '../lib/Schedule'
import type { TripViewModel } from '../lib/TripViewModel'
import { IconButton } from './common'
import { CheckIcon, ChevronLeftIcon, UpDownIcon } from './icons'

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

  const isoDate = CalendarTrip.isoDate(date)
  const dateText = date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
  const timeText = time.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
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
        <IconButton icon={ChevronLeftIcon} label="Back" onClick={back} />
        <span className="title centered">Create Calendar Event</span>
        {/* Adds the event, the same green check as the station screen's Save. */}
        {planned
          ? <IconButton icon={CheckIcon} label="Add to Google Calendar" onClick={addToCalendar} className="confirm" />
          : <span className="icon-placeholder" />}
      </div>
      <div className="calendar-content">
        <button type="button" className="pill" onClick={showStationSelection}>
          {vm.origin} to {vm.destination}
        </button>
        {/* Native controls as pills, so iPhone shows its own pickers. */}
        <div className="calendar-row">
          <label className="pill select-pill">
            <select aria-label="Leave at or arrive by" value={mode.value} onChange={(e) => setMode(modes.find((m) => m.value === e.target.value) ?? modes[0])}>
              {modes.map((m) => <option key={m.value} value={m.value}>{m.text}</option>)}
            </select>
            <UpDownIcon size={14} />
          </label>
          <PickerPill type="date" label="Date" text={dateText} value={isoDate} onChange={(v) => setDate(parseDate(v))} />
          <PickerPill type="time" label="Time" text={timeText} value={timeValue(time)} onChange={(v) => setTime(parseTime(v))} />
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

// A pill showing our text, with the native input invisibly on top, so a tap
// opens the phone's own picker without the browser's wide field.
function PickerPill ({ type, label, text, value, onChange }: { type: 'date' | 'time', label: string, text: string, value: string, onChange: (value: string) => void }) {
  return (
    <span className="pill picker-pill">
      {text}
      <input
        type={type}
        aria-label={label}
        value={value}
        onClick={(e) => { try { e.currentTarget.showPicker() } catch { /* tap already opened it */ } }}
        onChange={(e) => e.target.value && onChange(e.target.value)}
      />
    </span>
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

function parseDate (value: string): Date {
  const [y, m, d] = value.split('-').map(Number)
  return new Date(y, m - 1, d)
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
