import { c, card, muted } from '../../lib'
import { useTheme } from '../../app/ThemeContext'

// Placeholder — Task 8 replaces this with the people directory.
export default function People() {
  const { theme } = useTheme()
  return (
    <div className={c(card(theme), 'rounded-2xl px-8 py-14 text-center')}>
      <p className={c('text-sm font-medium', muted(theme))}>People — coming next</p>
    </div>
  )
}
