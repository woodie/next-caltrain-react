import { useRef, useState } from 'react'
import type { PointerEvent } from 'react'

export const rowHeight = 44
const minimumDistance = 10

// Stepping, not scrolling: a vertical drag moves the selection one trip per
// row-height of movement (dragging up shows later trains), kept within the
// list, and commits it on release. Same rules as the apps' DragGesture
// handlers. `suppressTap` stays true for 0.2s after a drag, so letting go
// doesn't also count as a tap on whatever is under the finger.
export function useStepDrag (offset: number, count: number, commit: (offset: number) => void) {
  const [dragShift, setDragShift] = useState(0)
  const start = useRef<{ y: number, id: number } | null>(null)
  const dragging = useRef(false)
  const suppressTap = useRef(false)

  const effectiveOffset = Math.max(0, Math.min(offset + dragShift, Math.max(count - 1, 0)))

  const onPointerDown = (e: PointerEvent) => {
    start.current = { y: e.clientY, id: e.pointerId }
    dragging.current = false
  }

  const onPointerMove = (e: PointerEvent) => {
    if (start.current === null || e.pointerId !== start.current.id) return
    const dy = e.clientY - start.current.y
    if (!dragging.current) {
      if (Math.abs(dy) < minimumDistance) return
      dragging.current = true
      suppressTap.current = true
      ;(e.currentTarget as Element).setPointerCapture(e.pointerId)
    }
    const newShift = -Math.round(dy / rowHeight)
    const proposed = offset + newShift
    if (proposed >= 0 && proposed < count) setDragShift(newShift)
  }

  const onPointerUp = () => {
    if (start.current === null) return
    start.current = null
    if (!dragging.current) return
    dragging.current = false
    commit(effectiveOffset)
    setDragShift(0)
    setTimeout(() => { suppressTap.current = false }, 200)
  }

  return {
    effectiveOffset,
    // A tap handler wrapper that ignores the tap a drag just ended on.
    tap: (action: () => void) => () => { if (!suppressTap.current) action() },
    handlers: { onPointerDown, onPointerMove, onPointerUp, onPointerCancel: onPointerUp },
  }
}
