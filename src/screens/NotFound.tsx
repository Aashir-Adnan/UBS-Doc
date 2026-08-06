import { Compass } from 'lucide-react'
import { Link } from 'react-router-dom'
import { c, card, txt, muted } from '../lib'
import { useTheme } from '../app/ThemeContext'

// App-wide 404 for the `*` route in routes.tsx. Matches AccessState's
// centered-card pattern (src/components/guards/AccessState.tsx) so an
// unmatched route reads as part of the same design system, not a placeholder.
export default function NotFound() {
  const { theme } = useTheme()
  const d = theme === 'dark'

  return (
    <div className={c('min-h-full flex items-center justify-center p-8', d ? 'aurora-dark' : 'aurora-light')}>
      <div className={c('w-full max-w-[380px] text-center', card(theme), 'rounded-3xl px-4 sm:px-6 lg:px-10 py-8 lg:py-12')}>
        <div className="flex justify-center mb-5">
          <div className={c('w-12 h-12 rounded-2xl flex items-center justify-center',
            d ? 'bg-indigo-500/14 border border-indigo-500/22' : 'bg-indigo-50 border border-indigo-200')}>
            <Compass size={22} className={d ? 'text-indigo-400' : 'text-indigo-600'} />
          </div>
        </div>
        <h2 className={c('font-extrabold text-xl mb-2.5', txt(theme))}>Page not found</h2>
        <p className={c('text-sm leading-relaxed', muted(theme))}>
          The page you're looking for doesn't exist or may have moved.
        </p>
        <Link to="/" className="btn-primary inline-flex items-center gap-2 px-5 py-2.5 text-sm mt-5">
          Back to home
        </Link>
      </div>
    </div>
  )
}
