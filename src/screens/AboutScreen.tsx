import { IconButton } from './common'
import { ChevronLeftIcon } from './icons'

interface Props {
  scheduleDate: number | null
  isLoading?: boolean
  loadFailed?: boolean
  back?: () => void
}

export function AboutScreen ({ scheduleDate, isLoading = false, loadFailed = false, back }: Props) {
  const scheduleDateText = scheduleDate === null
    ? 'Unknown'
    : new Date(scheduleDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }).replace(',', '')

  return (
    <div className="screen about">
      <div className="toolbar">
        {back && <IconButton icon={ChevronLeftIcon} label="Back" onClick={back} />}
      </div>
      <div className="about-content">
        <img src="/icon.png" alt="" width={96} height={96} />
        <div className="blurb">Next Caltrain</div>
        <div>for the web</div>
        <div className="spaced">© 2026 John Woodell</div>
        {isLoading
          ? <div className="spaced">{loadFailed ? 'Unable to load schedule' : 'Loading schedule data'}</div>
          : <div className="spaced">Schedule data:<br />{scheduleDateText}</div>}
      </div>
    </div>
  )
}
