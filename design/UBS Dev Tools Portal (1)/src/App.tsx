import { useState } from 'react'
import type { Screen, Theme } from './types'
import AnoAI from './components/ui/animated-shader-background'
import Sidebar from './components/Sidebar'
import SignIn from './screens/SignIn'
import Home from './screens/Home'
import ToolsHub from './screens/ToolsHub'
import Meetings from './screens/Meetings'
import CreateMeeting from './screens/CreateMeeting'
import MeetingTranscribe from './screens/MeetingTranscribe'
import MeetingAnalyze from './screens/MeetingAnalyze'
import GitHub from './screens/GitHub'
import DatabaseTools from './screens/DatabaseTools'
import APIBuilder from './screens/APIBuilder'
import NotifyScreen from './screens/Notify'
import ProjectsScreen from './screens/Projects'
import TenantAdmin from './screens/TenantAdmin'

const SIDEBAR_SCREENS: Screen[] = [
  'home', 'tools', 'meetings', 'meetings-create', 'meetings-transcribe', 'meetings-analyze',
  'github', 'database', 'api-builder', 'notify', 'lucid-sanitize',
  'projects', 'my-projects', 'repositories', 'tenant-admin',
  'access-restricted', 'loading-state', 'pending-state',
]

export default function App() {
  const [screen, setScreen] = useState<Screen>('signin')
  const [theme, setTheme] = useState<Theme>('dark')

  const navigate = (s: Screen) => setScreen(s)
  const toggleTheme = () => setTheme(t => t === 'dark' ? 'light' : 'dark')

  const hasSidebar = SIDEBAR_SCREENS.includes(screen)

  return (
    <div className="min-h-screen relative" style={{ fontFamily: "'Plus Jakarta Sans', system-ui, sans-serif", background: '#04070F' }}>
      {/* Shader — fixed, behind everything */}
      <AnoAI className="fixed inset-0 w-full h-full" opacity={theme === 'dark' ? 0.9 : 0.18} />

      {/* Light mode tint overlay */}
      {theme === 'light' && (
        <div className="fixed inset-0 pointer-events-none" style={{ background: 'rgba(250,248,255,0.88)' }} />
      )}

      {/* Dark mode depth overlay — keeps text readable */}
      {theme === 'dark' && (
        <div className="fixed inset-0 pointer-events-none" style={{ background: 'rgba(4,7,15,0.38)' }} />
      )}

      {hasSidebar && (
        <Sidebar current={screen} navigate={navigate} theme={theme} toggleTheme={toggleTheme} />
      )}

      <div className={hasSidebar ? 'ml-[240px] min-h-screen overflow-y-auto relative z-10' : 'min-h-screen relative z-10'}>
        {screen === 'signin' && <SignIn navigate={navigate} theme={theme} />}
        {screen === 'home' && <Home navigate={navigate} theme={theme} />}
        {screen === 'tools' && <ToolsHub navigate={navigate} theme={theme} />}
        {screen === 'meetings' && <Meetings navigate={navigate} theme={theme} />}
        {screen === 'meetings-create' && <CreateMeeting navigate={navigate} theme={theme} />}
        {screen === 'meetings-transcribe' && <MeetingTranscribe navigate={navigate} theme={theme} />}
        {screen === 'meetings-analyze' && <MeetingAnalyze navigate={navigate} theme={theme} />}
        {screen === 'github' && <GitHub navigate={navigate} theme={theme} />}
        {screen === 'database' && <DatabaseTools theme={theme} />}
        {screen === 'api-builder' && <APIBuilder theme={theme} />}
        {screen === 'notify' && <NotifyScreen theme={theme} screen="notify" />}
        {screen === 'lucid-sanitize' && <NotifyScreen theme={theme} screen="lucid-sanitize" />}
        {screen === 'projects' && <ProjectsScreen navigate={navigate} theme={theme} screen="projects" />}
        {screen === 'my-projects' && <ProjectsScreen navigate={navigate} theme={theme} screen="my-projects" />}
        {screen === 'repositories' && <ProjectsScreen navigate={navigate} theme={theme} screen="repositories" />}
        {screen === 'tenant-admin' && <TenantAdmin navigate={navigate} theme={theme} screen="tenant-admin" />}
        {screen === 'access-restricted' && <TenantAdmin navigate={navigate} theme={theme} screen="access-restricted" />}
        {screen === 'loading-state' && <TenantAdmin navigate={navigate} theme={theme} screen="loading-state" />}
        {screen === 'pending-state' && <TenantAdmin navigate={navigate} theme={theme} screen="pending-state" />}
      </div>
    </div>
  )
}
