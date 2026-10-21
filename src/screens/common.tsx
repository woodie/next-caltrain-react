import { Button } from '@progress/kendo-react-buttons'
import type { SVGIcon } from '@progress/kendo-svg-icons'
import { stationLines } from '../lib/stationLines'

// The apps' round toolbar buttons (back, swap, reset), as a KendoReact Button.
export function IconButton ({ icon, label, onClick, className }: { icon: SVGIcon, label: string, onClick: () => void, className?: string }) {
  return (
    <Button
      className={className ? `icon-button ${className}` : 'icon-button'}
      svgIcon={icon}
      rounded="full"
      fillMode="solid"
      size="large"
      title={label}
      aria-label={label}
      onClick={onClick}
    />
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
