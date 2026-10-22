import { stationLines } from '../lib/stationLines'
import type { Icon } from './icons'

// The apps' round toolbar buttons (back, swap, reset).
export function IconButton ({ icon: IconImage, label, onClick, className }: { icon: Icon, label: string, onClick: () => void, className?: string }) {
  return (
    <button type="button" className={className ? `icon-button ${className}` : 'icon-button'} title={label} aria-label={label} onClick={onClick}>
      <IconImage />
    </button>
  )
}

export function StationNames ({ origin, destination, onTap }: { origin: string, destination: string, onTap: () => void }) {
  const [line1, line2] = stationLines(origin, destination)
  return (
    <button type="button" className="station-names" onClick={(e) => { e.stopPropagation(); onTap() }}>
      <span>{line1}</span>
      <span>{line2}</span>
    </button>
  )
}
