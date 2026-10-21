import { useEffect, useState } from 'react'
import type { Trip } from './lib/CaltrainService'
import { fetchedToday, fetchFromNetwork, loadCached, type Schedule } from './lib/Schedule'
import { AboutScreen } from './screens/AboutScreen'
import { HomeScreen } from './screens/HomeScreen'
import { StationSelectionScreen } from './screens/StationSelectionScreen'
import { TripDetailScreen } from './screens/TripDetailScreen'
import { TripListScreen } from './screens/TripListScreen'
import { useTripViewModel } from './useTripViewModel'

type Screen =
  | { name: 'home' }
  | { name: 'tripList' }
  | { name: 'tripDetail', trip: Trip }
  | { name: 'stationSelection' }
  | { name: 'about' }

export function App () {
  const [schedule, setSchedule] = useState<Schedule | null>(null)
  const [loadFailed, setLoadFailed] = useState(false)

  useEffect(() => {
    loadSchedule().then(setSchedule, () => setLoadFailed(true))
  }, [])

  if (schedule === null) return <AboutScreen scheduleDate={null} isLoading loadFailed={loadFailed} />
  return <Navigator schedule={schedule} />
}

// A cached schedule from today's schedule-day is used as is; otherwise try
// the network for up to 10 seconds and fall back to the cache.
async function loadSchedule (): Promise<Schedule> {
  const cached = loadCached()
  if (cached === null) return fetchFromNetwork()
  if (fetchedToday()) return cached
  const timeout = new Promise<never>((_, reject) => setTimeout(() => reject(new Error('timed out')), 10000))
  return Promise.race([fetchFromNetwork(), timeout]).catch(() => cached)
}

// A stack of screens, mirrored into browser history so the phone's back
// gesture (and back button) pops it, like the apps' navigation stacks.
function Navigator ({ schedule }: { schedule: Schedule }) {
  const { vm, act } = useTripViewModel(schedule)
  const [stack, setStack] = useState<Screen[]>([{ name: 'home' }])

  useEffect(() => {
    const onPop = () => setStack((stack) => (stack.length > 1 ? stack.slice(0, -1) : stack))
    window.addEventListener('popstate', onPop)
    return () => window.removeEventListener('popstate', onPop)
  }, [])

  const push = (screen: Screen) => {
    window.history.pushState(null, '')
    setStack((stack) => [...stack, screen])
  }
  const back = () => window.history.back()

  const screen = stack[stack.length - 1]
  switch (screen.name) {
    case 'home':
      return (
        <HomeScreen
          vm={vm}
          act={act}
          showTripList={() => push({ name: 'tripList' })}
          showStationSelection={() => push({ name: 'stationSelection' })}
          showAbout={() => push({ name: 'about' })}
        />
      )
    case 'tripList':
      return (
        <TripListScreen
          vm={vm}
          act={act}
          back={back}
          showTrip={(trip) => push({ name: 'tripDetail', trip })}
          showStationSelection={() => push({ name: 'stationSelection' })}
        />
      )
    case 'tripDetail':
      return (
        <TripDetailScreen
          trip={screen.trip}
          schedule={schedule}
          origin={vm.origin}
          destination={vm.destination}
          scheduleType={screen.trip.isFuture ? vm.tomorrowScheduleType : vm.scheduleType}
          goodTimes={vm.goodTimes}
          back={back}
        />
      )
    case 'stationSelection':
      return <StationSelectionScreen vm={vm} act={act} back={back} />
    case 'about':
      return <AboutScreen scheduleDate={schedule.scheduleDate} back={back} />
  }
}
