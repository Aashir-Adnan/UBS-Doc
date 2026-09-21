// Where the task-preview popover goes. The Board scrolls sideways inside an
// overflow container, which would clip an absolutely positioned popover, so the
// popover is drawn `position: fixed` from the info button's screen rectangle.

export interface Box { left: number; right: number; top: number; bottom: number }
export interface Size { width: number; height: number }

const MARGIN = 8
const GAP = 8

// Right-aligned under the anchor, pulled back inside the viewport; flipped above
// the anchor when there is no room below and more room above.
export function popoverPosition(anchor: Box, viewport: Size, popover: Size): { top: number; left: number } {
  const maxLeft = Math.max(MARGIN, viewport.width - popover.width - MARGIN)
  const left = Math.min(Math.max(MARGIN, anchor.right - popover.width), maxLeft)

  const below = anchor.bottom + GAP
  const fitsBelow = below + popover.height <= viewport.height - MARGIN
  const roomAbove = anchor.top - GAP - MARGIN
  const roomBelow = viewport.height - MARGIN - below
  if (fitsBelow || roomBelow >= roomAbove) return { top: below, left }
  return { top: Math.max(MARGIN, anchor.top - GAP - popover.height), left }
}
