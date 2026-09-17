import { chipRed, chipIndigo, chipMint, chipAmber } from '../../lib'
import type { Theme } from '../../types'
import type { Tone } from '../tasksLogic'

// The one status-tone -> chip mapping for the whole Team section. TasksList,
// TaskDetail and Board all colour status chips the same way, so the map lives
// here rather than being copied into each screen.
export const toneChip: Record<Tone, (t: Theme) => string> = {
  done: chipMint,
  active: chipIndigo,
  idle: chipAmber,
  bad: chipRed,
}
