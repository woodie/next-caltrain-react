import { useCallback, useEffect, useReducer, useState } from 'react'
import type { Schedule } from './lib/Schedule'
import { TripViewModel } from './lib/TripViewModel'

// Owns one TripViewModel for the app's lifetime and re-renders after each
// change: `act(vm => vm.swapStations())`, plus a tick every second.
export function useTripViewModel (schedule: Schedule) {
  const [vm] = useState(() => new TripViewModel(schedule))
  const [, rerender] = useReducer((n: number) => n + 1, 0)

  const act = useCallback((change: (vm: TripViewModel) => void) => {
    change(vm)
    rerender()
  }, [vm])

  useEffect(() => {
    const timer = setInterval(() => act((vm) => vm.tick()), 1000)
    return () => clearInterval(timer)
  }, [act])

  return { vm, act }
}

// Toggles every half second while `blinking`, like the apps' DEPARTING and NO TRAINS.
export function useBlink (blinking: boolean): boolean {
  const [on, toggle] = useReducer((on: boolean) => !on, true)
  useEffect(() => {
    if (!blinking) return
    const timer = setInterval(toggle, 500)
    return () => clearInterval(timer)
  }, [blinking])
  return blinking ? on : true
}
