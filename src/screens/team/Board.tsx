import { c, card, muted } from '../../lib'
import { useTheme } from '../../app/ThemeContext'

// Placeholder — Task 9 replaces this with the drag-and-drop board.
export default function Board() {
  const { theme } = useTheme()
  return (
    <div className={c(card(theme), 'rounded-2xl px-8 py-14 text-center')}>
      <p className={c('text-sm font-medium', muted(theme))}>Board — coming next</p>
    </div>
  )
}
