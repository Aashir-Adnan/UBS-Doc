import { useEffect, useRef, useState } from 'react'
import { Outlet, useLocation } from 'react-router-dom'
import { Menu } from 'lucide-react'
import AnoAI from '../components/ui/animated-shader-background'
import Sidebar from '../components/Sidebar'
import { c } from '../lib'
import { useTheme } from './ThemeContext'

export default function AppLayout() {
  const { theme, toggleTheme } = useTheme()
  const { pathname, hash } = useLocation()
  const contentRef = useRef<HTMLDivElement>(null)
  // Below lg the sidebar is an off-canvas drawer; at lg+ it is the permanent
  // 240px rail and this state is inert.
  const [navOpen, setNavOpen] = useState(false)

  // Any navigation closes the drawer — otherwise it would cover the page the
  // user just asked for.
  useEffect(() => { setNavOpen(false) }, [pathname])

  // Escape closes it too, matching the dropdowns elsewhere in the app.
  useEffect(() => {
    if (!navOpen) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setNavOpen(false) }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [navOpen])

  // `min-h-screen` on the content div is a floor, not a cap, so it never
  // actually constrains height — the window is what scrolls in practice.
  // Reset both anyway so this keeps working if that div ever does grow a
  // fixed/max height. Skip entirely when a hash is present: DocsPage owns
  // scrolling to the target heading in that case (see its hash effect).
  useEffect(() => {
    if (hash) return
    window.scrollTo(0, 0)
    contentRef.current?.scrollTo(0, 0)
  }, [pathname, hash])

  return (
    <div className="min-h-screen relative" style={{ fontFamily: "'Plus Jakarta Sans', system-ui, sans-serif", background: '#04070F' }}>
      <AnoAI className="fixed inset-0 w-full h-full" opacity={theme === 'dark' ? 0.9 : 0.18} />
      {theme === 'light' && <div className="fixed inset-0 pointer-events-none" style={{ background: 'rgba(250,248,255,0.88)' }} />}
      {theme === 'dark' && <div className="fixed inset-0 pointer-events-none" style={{ background: 'rgba(4,7,15,0.38)' }} />}
      <Sidebar theme={theme} toggleTheme={toggleTheme} open={navOpen} onClose={() => setNavOpen(false)} />

      {/* Scrim — only rendered while the drawer is open, so it can never
          swallow clicks at desktop width. */}
      {navOpen && (
        <div
          className="fixed inset-0 z-30 lg:hidden"
          style={{ background: 'rgba(4,7,15,0.6)', backdropFilter: 'blur(2px)' }}
          onClick={() => setNavOpen(false)}
          aria-hidden="true"
        />
      )}

      <div ref={contentRef} className="lg:ml-[240px] min-h-screen overflow-y-auto relative z-10">
        {/* Mobile top bar: the only way to reach the nav below lg. */}
        <div className={c(
          'lg:hidden sticky top-0 z-20 flex items-center gap-3 px-4 py-3 border-b',
          theme === 'dark'
            ? 'aurora-panel-dark border-sky-500/10'
            : 'bg-white/90 backdrop-blur border-slate-100',
        )}>
          <button
            type="button"
            onClick={() => setNavOpen(true)}
            aria-label="Open navigation"
            aria-expanded={navOpen}
            className={c(
              'p-2 -ml-1 rounded-xl tr',
              theme === 'dark' ? 'text-white/70 hover:bg-white/8' : 'text-slate-600 hover:bg-slate-100',
            )}
          >
            <Menu size={20} />
          </button>
          <div className="w-7 h-7 rounded-lg flex items-center justify-center text-white font-extrabold text-xs shrink-0"
            style={{ background: '#4F46E5' }}>
            U
          </div>
          <span className={c('font-extrabold text-sm tracking-tight',
            theme === 'dark' ? 'text-white' : 'text-[#0F172A]')}>
            UBS
          </span>
        </div>
        <Outlet />
      </div>
    </div>
  )
}
