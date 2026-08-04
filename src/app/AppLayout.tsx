import { Outlet } from 'react-router-dom'
import AnoAI from '../components/ui/animated-shader-background'
import Sidebar from '../components/Sidebar'
import { useTheme } from './ThemeContext'

export default function AppLayout() {
  const { theme, toggleTheme } = useTheme()
  return (
    <div className="min-h-screen relative" style={{ fontFamily: "'Plus Jakarta Sans', system-ui, sans-serif", background: '#04070F' }}>
      <AnoAI className="fixed inset-0 w-full h-full" opacity={theme === 'dark' ? 0.9 : 0.18} />
      {theme === 'light' && <div className="fixed inset-0 pointer-events-none" style={{ background: 'rgba(250,248,255,0.88)' }} />}
      {theme === 'dark' && <div className="fixed inset-0 pointer-events-none" style={{ background: 'rgba(4,7,15,0.38)' }} />}
      <Sidebar theme={theme} toggleTheme={toggleTheme} />
      <div className="ml-[240px] min-h-screen overflow-y-auto relative z-10">
        <Outlet />
      </div>
    </div>
  )
}
