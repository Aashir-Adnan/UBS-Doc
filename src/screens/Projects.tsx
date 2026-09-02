import { Suspense } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { FolderOpen, ExternalLink } from 'lucide-react'
import { c, card, txt, muted, Breadcrumb } from '../lib'
import { useTheme } from '../app/ThemeContext'
import AccessState from '../components/guards/AccessState'
import AuroraText from '../components/ui/aurora-text'
import { projects, getProjectComponent } from '../data/projectsConfig'

interface Props { view: 'grid' | 'detail' }

// Design markup from design/UBS Dev Tools Portal (1)/src/screens/Projects.tsx
// (ProjectsGrid variant) fed by the real static registry — src/data/projectsConfig.js
// — instead of the design's hardcoded PROJECTS mock (no fake tags/tech-stack
// chips: the registry carries no such field). The `Documentation` action is a
// real router Link to project.docPath (a /docs/* route — the docs engine lands
// in Task 16, so these 404 onto the placeholder route until then, same as
// every other /docs/* link in the app right now). `Open ↗` only renders when
// hasCustomView, linking to /tools/projects/view?project=<slug>.
//
// The `detail` view is old projects/view.jsx's resolution logic (project
// lookup, not-found / no-custom-view fallbacks) ported into a design
// breadcrumb + card panel. getProjectComponent now returns React.lazy
// components (see projectsConfig.js), so the custom view render is wrapped in
// <Suspense fallback={<AccessState kind="loading" />}> here, at the render site.
export default function Projects({ view }: Props) {
  const { theme } = useTheme()
  return view === 'detail' ? <ProjectView theme={theme} /> : <ProjectsGrid theme={theme} />
}

function ProjectsGrid({ theme }: { theme: 'light' | 'dark' }) {
  const d = theme === 'dark'
  return (
    <div className={c('min-h-full', d ? 'aurora-dark' : 'aurora-light')}>
      <div className="max-w-[1240px] mx-auto px-4 sm:px-6 lg:px-10 py-8 lg:py-12">
        <Breadcrumb items={['UBS', 'Dev Tools', 'Projects']} theme={theme} />
        <h1 className="font-extrabold mb-8 screen-title"><AuroraText>Projects</AuroraText></h1>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-5">
          {projects.map((p) => (
            <div key={p.slug} className={c(card(theme), 'p-6 group tr rounded-2xl', d ? 'card-hover-dark' : 'card-hover-light')}>
              <div className="flex items-center gap-3 mb-4">
                <div className={c('w-9 h-9 rounded-xl flex items-center justify-center shrink-0',
                  d ? 'bg-indigo-500/12 border border-indigo-500/20' : 'bg-indigo-50 border border-indigo-100')}>
                  <FolderOpen size={17} className="text-indigo-500" />
                </div>
                <span className={c('font-bold text-sm', txt(theme))}>{p.name}</span>
              </div>
              {p.description && (
                <p className={c('text-xs leading-relaxed mb-4', muted(theme))}>{p.description}</p>
              )}
              <div className="flex gap-2 opacity-0 group-hover:opacity-100 tr">
                <Link to={p.docPath}
                  className={c('flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl text-xs font-bold tr no-underline',
                    d ? 'bg-indigo-500/14 text-indigo-400 hover:bg-indigo-500/22' : 'bg-indigo-50 text-indigo-600 hover:bg-indigo-100')}>
                  {p.docLabel || 'Documentation'}
                </Link>
                {p.hasCustomView && (
                  <Link to={`/tools/projects/view?project=${encodeURIComponent(p.slug)}`}
                    className={c('flex items-center gap-1 px-3 py-2 rounded-xl text-xs font-bold border tr no-underline',
                      d ? 'border-white/8 text-white/45 hover:text-white hover:border-white/18' : 'border-slate-200 text-slate-500 hover:text-slate-700')}>
                    Open <ExternalLink size={11} />
                  </Link>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

function useProjectSlug() {
  const { search } = useLocation()
  return new URLSearchParams(search).get('project')
}

function ProjectView({ theme }: { theme: 'light' | 'dark' }) {
  const d = theme === 'dark'
  const navigate = useNavigate()
  const slug = useProjectSlug()
  const project = slug ? projects.find((p) => p.slug === slug) : null
  const CustomComponent = project ? getProjectComponent(project.slug) : null

  const crumb = ['UBS', 'Dev Tools', 'Projects', project?.name ?? 'View']

  if (!project) {
    return (
      <div className={c('min-h-full flex items-center justify-center p-8', d ? 'aurora-dark' : 'aurora-light')}>
        <div className={c('w-full max-w-[420px] text-center', card(theme), 'rounded-3xl px-4 sm:px-6 lg:px-10 py-8 lg:py-12')}>
          <h2 className={c('font-extrabold text-xl mb-2.5', txt(theme))}>Project not found</h2>
          <p className={c('text-sm leading-relaxed mb-6', muted(theme))}>
            {slug ? `No project with slug "${slug}".` : 'Specify a project with ?project=<slug>.'}
          </p>
          <button onClick={() => navigate('/tools/projects')} className="btn-primary px-5 py-2.5 rounded-xl text-sm">
            Back to Projects
          </button>
        </div>
      </div>
    )
  }

  if (!CustomComponent) {
    return (
      <div className={c('min-h-full', d ? 'aurora-dark' : 'aurora-light')}>
        <div className="max-w-[900px] mx-auto px-4 sm:px-6 lg:px-10 py-8 lg:py-12">
          <Breadcrumb items={crumb} theme={theme} />
          <div className={c(card(theme), 'rounded-3xl px-4 sm:px-6 lg:px-10 py-8 lg:py-12 text-center')}>
            <h2 className={c('font-extrabold text-xl mb-2.5', txt(theme))}>{project.name}</h2>
            <p className={c('text-sm leading-relaxed mb-6', muted(theme))}>
              This project does not have a custom view yet.
            </p>
            <div className="flex items-center justify-center gap-3">
              <Link to={project.docPath}
                className="btn-primary px-5 py-2.5 rounded-xl text-sm no-underline">
                View documentation
              </Link>
              <button onClick={() => navigate('/tools/projects')}
                className={c('px-5 py-2.5 rounded-xl text-sm font-bold border tr',
                  d ? 'border-white/8 text-white/45 hover:text-white hover:border-white/18' : 'border-slate-200 text-slate-500 hover:text-slate-700')}>
                Back to Projects
              </button>
            </div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className={c('min-h-full', d ? 'aurora-dark' : 'aurora-light')}>
      <div className="max-w-[1240px] mx-auto px-4 sm:px-6 lg:px-10 py-8 lg:py-12">
        <Breadcrumb items={crumb} theme={theme} />
        <div className={c(card(theme), 'p-6 rounded-2xl')}>
          <Suspense fallback={<AccessState kind="loading" />}>
            <CustomComponent project={project} />
          </Suspense>
        </div>
      </div>
    </div>
  )
}
