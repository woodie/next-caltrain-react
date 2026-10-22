import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { TripViewModel } from '../lib/TripViewModel'
import { IconButton } from './common'
import { CheckIcon, ChevronLeftIcon, ResetIcon } from './icons'

interface Props {
  vm: TripViewModel
  act: (change: (vm: TripViewModel) => void) => void
  back: () => void
}

// Morning and evening stations, which map onto origin and destination by
// time of day: after noon, the evening station is where you leave from.
export function StationSelectionScreen ({ vm, act, back }: Props) {
  const [confirming, setConfirming] = useState(false)
  const flipped = TripViewModel.isFlipped()
  const morning = flipped ? vm.destination : vm.origin
  const evening = flipped ? vm.origin : vm.destination

  const setMorning = (station: string) => act((vm) => {
    if (flipped) vm.destination = station
    else vm.origin = station
    vm.refresh()
  })
  const setEvening = (station: string) => act((vm) => {
    if (flipped) vm.origin = station
    else vm.destination = station
    vm.refresh()
  })

  const saved = vm.savedStations()
  const isAlreadyDefault = morning === saved.morning && evening === saved.evening
  const restoreDefaults = () => {
    setMorning(saved.morning)
    setEvening(saved.evening)
  }

  return (
    <div className="screen station-selection">
      <div className="toolbar">
        <IconButton icon={ChevronLeftIcon} label="Back" onClick={back} />
        <span className="spacer" />
        {!isAlreadyDefault && (
          <>
            <IconButton icon={ResetIcon} label="Restore default stations" onClick={restoreDefaults} />
            <IconButton icon={CheckIcon} label="Save as default stations" onClick={() => setConfirming(true)} />
          </>
        )}
      </div>
      <StationList title="Morning Station" stations={vm.schedule.southStops} selected={morning} onSelect={setMorning} />
      <hr />
      <StationList title="Evening Station" stations={vm.schedule.southStops} selected={evening} onSelect={setEvening} />

      {confirming && (
        <ConfirmDialog
          title="Station Defaults"
          message={`Save ${morning} as morning and ${evening} as evening default stations?`}
          onCancel={() => { setConfirming(false); back() }}
          onConfirm={() => { act((vm) => vm.saveStops()); setConfirming(false); back() }}
        />
      )}
    </div>
  )
}

interface ListProps {
  title: string
  stations: string[]
  selected: string
  onSelect: (station: string) => void
}

function StationList ({ title, stations, selected, onSelect }: ListProps) {
  const listRef = useRef<HTMLDivElement>(null)

  // Bring the selected station into view, like the apps' scrollTo(selected, anchor: .center).
  useLayoutEffect(() => {
    listRef.current?.querySelector('.selected')?.scrollIntoView({ block: 'center' })
  }, [selected])

  return (
    <section className="station-list">
      <h2>{title}</h2>
      <div className="stations" ref={listRef}>
        {stations.map((station) => (
          <button
            type="button"
            key={station}
            className={station === selected ? 'station selected' : 'station'}
            onClick={() => onSelect(station)}
          >
            <span className="check">{station === selected ? '✓' : ''}</span>
            {station}
          </button>
        ))}
      </div>
    </section>
  )
}

// An iOS-style alert, in the browser's own modal <dialog>.
function ConfirmDialog ({ title, message, onCancel, onConfirm }: { title: string, message: string, onCancel: () => void, onConfirm: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null)
  useEffect(() => { dialog.current?.showModal() }, [])
  return (
    <dialog ref={dialog} className="alert" onCancel={onCancel}>
      <h2>{title}</h2>
      <p>{message}</p>
      <div className="actions">
        <button type="button" className="cancel" onClick={onCancel}>Cancel</button>
        <button type="button" onClick={onConfirm}>Save</button>
      </div>
    </dialog>
  )
}
