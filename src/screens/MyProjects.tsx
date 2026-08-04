import { useNavigate } from 'react-router-dom'
import { c, card, txt, muted, Breadcrumb } from '../lib'
import { useTheme } from '../app/ThemeContext'
import { useActingUrdd } from '../components/portal/tenantProjects/useActingUrdd'
import MyProjectsList from '../components/portal/tenantProjects/MyProjects'
import ProjectDetail from '../components/portal/tenantProjects/ProjectDetail'

interface Props { view: 'grid' | 'detail' }

// Design markup from design/UBS Dev Tools Portal (1)/src/screens/Projects.tsx
// (MyProjectsView variant), but NOT fed by the design's fake deployment-status
// mock (branch/commits/status don't exist in the tenant-project data model).
// Least-invasive choice per the task brief: mount the real, unmodified
// MyProjects.jsx / ProjectDetail.jsx components (their listMyProjects /
// canAccessProject fetches, loading/error/pending states, and useActingUrdd
// wiring stay exactly as-is) inside the design's aurora/breadcrumb chrome. The
// alternative — lifting the fetch into this screen and rebuilding the card
// markup to match MyProjectsView's status-pill layout — would mean re-deriving
// state machines (idStatus, PendingAccess, tenant-scoped errors) the old
// components already handle correctly, for a data shape the design never
// modeled. MyProjects.jsx already renders via the `.tenant-project-*` classes
// carried into src/styles/portal-compat.css, which read design tokens
// (var(--ifm-*)) so they sit fine inside the new theme.
export default function MyProjects({ view }: Props) {
  const { theme } = useTheme()
  return view === 'detail' ? <MyProjectDetailView theme={theme} /> : <MyProjectsGrid theme={theme} />
}

function MyProjectsGrid({ theme }: { theme: 'light' | 'dark' }) {
  const d = theme === 'dark'
  const { activeOrg } = useActingUrdd()
  const orgLabel = activeOrg?.display_name || activeOrg?.org_name || 'Personal'

  return (
    <div className={c('min-h-full', d ? 'aurora-dark' : 'aurora-light')}>
      <div className="max-w-[900px] mx-auto px-10 py-12">
        <Breadcrumb items={['UBS', 'Dev Tools', 'My Projects']} theme={theme} />
        <h1 className="grad-text font-extrabold mb-2" style={{ fontSize: 40, letterSpacing: '-0.025em' }}>My Projects</h1>
        <p className={c('text-sm font-medium mb-8', muted(theme))}>
          Projects available under <strong className={txt(theme)}>{orgLabel}</strong>.
        </p>
        <MyProjectsList />
      </div>
    </div>
  )
}

function MyProjectDetailView({ theme }: { theme: 'light' | 'dark' }) {
  const d = theme === 'dark'
  const navigate = useNavigate()

  return (
    <div className={c('min-h-full', d ? 'aurora-dark' : 'aurora-light')}>
      <div className="max-w-[900px] mx-auto px-10 py-12">
        <Breadcrumb items={['UBS', 'Dev Tools', 'My Projects', 'Project']} theme={theme} />
        <div className="flex items-center justify-between mb-6">
          <h1 className="grad-text font-extrabold" style={{ fontSize: 40, letterSpacing: '-0.025em' }}>Project</h1>
          <button onClick={() => navigate('/tools/myProjects')}
            className={c('text-xs font-semibold tr', d ? 'text-white/30 hover:text-white/60' : 'text-slate-400 hover:text-indigo-600')}>
            &larr; My Projects
          </button>
        </div>
        <div className={c(card(theme), 'p-6 rounded-2xl')}>
          <ProjectDetail />
        </div>
      </div>
    </div>
  )
}
