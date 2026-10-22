// The app's few icons, drawn inline: 24x24 strokes in the current text color.
interface Props { size?: number }
export type Icon = (props: Props) => React.JSX.Element

function Svg ({ size = 22, children }: Props & { children: React.ReactNode }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {children}
    </svg>
  )
}

export const ChevronLeftIcon = ({ size }: Props) => <Svg size={size}><path d="M15 18l-6-6 6-6" /></Svg>
export const CheckIcon = ({ size }: Props) => <Svg size={size}><path d="M20 6L9 17l-5-5" /></Svg>
export const SwapIcon = ({ size }: Props) => <Svg size={size}><path d="M16 3l4 4-4 4M20 7H4M8 21l-4-4 4-4M4 17h16" /></Svg>
export const ResetIcon = ({ size }: Props) => <Svg size={size}><path d="M3 12a9 9 0 1 0 2.6-6.4M3 4v5h5" /></Svg>
export const CalendarIcon = ({ size }: Props) => <Svg size={size}><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M8 3v4M16 3v4M3 10h18" /></Svg>
export const UpDownIcon = ({ size }: Props) => <Svg size={size}><path d="M8 9l4-4 4 4M8 15l4 4 4-4" /></Svg>
