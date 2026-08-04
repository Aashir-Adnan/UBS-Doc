import { useEffect, useRef } from 'react'
import { Outlet, useLocation } from 'react-router-dom'
import AnoAI from '../components/ui/animated-shader-background'
import Sidebar from '../components/Sidebar'
import { useTheme } from './ThemeContext'

export default function AppLayout() {
  const { theme, toggleTheme } = useTheme()
  const { pathname, hash } = useLocation()
  const contentRef = useRef<HTMLDivElement>(null)

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
      <Sidebar theme={theme} toggleTheme={toggleTheme} />
      <div ref={contentRef} className="ml-[240px] min-h-screen overflow-y-auto relative z-10">
        <Outlet />
      </div>
    </div>
  )
}
