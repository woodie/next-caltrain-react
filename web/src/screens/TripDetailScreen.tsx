import { chevronLeftIcon } from '@progress/kendo-svg-icons'
import { CaltrainService, type Trip } from '../lib/CaltrainService'
import { GoodTimes } from '../lib/GoodTimes'
import type { Schedule, ScheduleType } from '../lib/Schedule'
import { IconButton } from './common'

type StopRole = 'past' | 'origin' | 'destination' | 'transfer' | 'future'

interface TripStop {
  time: number
  station: string
  role: StopRole
}

interface Props {
  trip: Trip
  schedule: Schedule
  origin: string
  destination: string
  scheduleType: ScheduleType
  goodTimes: GoodTimes
  back: () => void
}

export function TripDetailScreen ({ trip, schedule, origin, destination, scheduleType, goodTimes, back }: Props) {
  const service = new CaltrainService(schedule)
  const stops: TripStop[] = []

  trip.legs.forEach((leg, legIndex) => {
    const direction = CaltrainService.direction(leg.station, destination, schedule.southStops)
    const stopList = direction === 'North' ? schedule.northStops : schedule.southStops
    const times = service.select(direction, scheduleType)[String(leg.trainId)]
    if (!times) return

    times.forEach((t, i) => {
      if (t == null || i >= stopList.length) return
      const station = stopList[i]
      // The transfer station closes the first leg; don't repeat it at the top of the second.
      if (legIndex > 0 && station === CaltrainService.transferStation) return

      const isTransfer = trip.legs.length > 1 && legIndex === 0 && station === CaltrainService.transferStation
      let role: StopRole
      if (station === origin && legIndex === 0) role = 'origin'
      else if (station === destination) role = 'destination'
      else if (isTransfer) role = 'transfer'
      else if (goodTimes.inThePast(t)) role = 'past'
      else role = 'future'
      stops.push({ time: t, station, role })
    })
  })

  // The title follows the second leg once its train has left the transfer station.
  const leg = trip.legs.length > 1 && goodTimes.inThePast(trip.legs[1].depart) ? trip.legs[1] : trip.legs[0]
  const dir = leg.trainId % 2 === 0 ? 'Southbound' : 'Northbound'
  const title = `${dir} #${leg.trainId} ${CaltrainService.trainType(leg.trainId)}`

  return (
    <div className="screen trip-detail">
      <div className="toolbar">
        <IconButton icon={chevronLeftIcon} label="Back" onClick={back} />
        <span className="title centered">{title}</span>
        <span className="icon-placeholder" />
      </div>
      <div className="stops">
        {stops.map((stop, index) => (
          <div key={`${stop.station}-${index}`} className={`stop ${stop.role}`}>
            <span className="stop-time">{GoodTimes.fullTime(stop.time)}</span>
            <span className="track">
              {index < stops.length - 1 && <span className="line" />}
              <span className="dot" />
            </span>
            <span className="stop-name">{stop.station}</span>
          </div>
        ))}
      </div>
    </div>
  )
}
