import { Suspense, lazy, useEffect, useMemo, useState, type ComponentType } from 'react'
import { Link, useParams } from 'react-router-dom'
import { MDXProvider } from '@mdx-js/react'
import { ArrowLeft, ArrowRight, FileQuestion } from 'lucide-react'
import DocsSidebar from '../components/docs/DocsSidebar'
import { MDX_COMPONENTS } from '../components/docs/CodeBlock'
import { DOC_MODULES } from '../docs/docsIndex'
import { flattenSidebar, docLabel } from '../docs/sidebar'
import { c, card, txt, muted, sub, Breadcrumb } from '../lib'
import { useTheme } from '../app/ThemeContext'
import type { Theme } from '../types'

const ORDER = flattenSidebar()

function NotFound({ id, theme }: { id: string; theme: Theme }) {
  return (
    <div className={c(card(theme), 'p-10 text-center')}>
      <FileQuestion size={28} className={c('mx-auto mb-4', theme === 'dark' ? 'text-white/25' : 'text-slate-300')} />
      <h1 className={c('font-extrabold mb-2', txt(theme))} style={{ fontSize: 22, letterSpacing: '-0.02em' }}>
        Document not found
      </h1>
      <p className={c('text-sm mb-6', muted(theme))}>
        No document is published at <span className="mono">{id || '/'}</span>.
      </p>
      <Link to={`/docs/${ORDER[0]}`} className="btn-primary inline-flex items-center gap-2 px-5 py-2.5 text-sm">
        Back to the docs
      </Link>
    </div>
  )
}

function Pager({ id, theme }: { id: string; theme: Theme }) {
  const i = ORDER.indexOf(id)
  if (i === -1) return null
  const prev = i > 0 ? ORDER[i - 1] : null
  const next = i < ORDER.length - 1 ? ORDER[i + 1] : null
  if (!prev && !next) return null
  const d = theme === 'dark'

  const btn = c('flex-1 flex flex-col gap-1 rounded-xl border px-4 py-3 tr capitalize',
    d ? 'border-[rgba(14,165,233,0.14)] hover:bg-white/5' : 'border-slate-200 hover:bg-slate-50')

  return (
    <div className="flex gap-3 mt-10">
      {prev && (
        <Link to={`/docs/${prev}`} className={c(btn, 'items-start text-left')}>
          <span className={c('text-[10px] font-bold tracking-wider uppercase flex items-center gap-1', muted(theme))}>
            <ArrowLeft size={11} /> Previous
          </span>
          <span className={c('text-sm font-semibold', txt(theme))}>{docLabel(prev)}</span>
        </Link>
      )}
      {next && (
        <Link to={`/docs/${next}`} className={c(btn, 'items-end text-right')}>
          <span className={c('text-[10px] font-bold tracking-wider uppercase flex items-center gap-1', muted(theme))}>
            Next <ArrowRight size={11} />
          </span>
          <span className={c('text-sm font-semibold', txt(theme))}>{docLabel(next)}</span>
        </Link>
      )}
    </div>
  )
}

export default function DocsPage() {
  const { theme } = useTheme()
  const d = theme === 'dark'
  const id = (useParams()['*'] || '').replace(/\/+$/, '')
  const loader = DOC_MODULES[id]

  const Doc = useMemo<ComponentType | null>(
    () => (loader ? lazy(async () => ({ default: (await loader()).default })) : null),
    [id],
  )

  // Frontmatter comes from the same (bundler-cached) module the lazy component
  // resolves, so this costs one extra promise, not a second download.
  const [title, setTitle] = useState<string | null>(null)
  useEffect(() => {
    let live = true
    setTitle(null)
    if (!loader) return
    loader().then(mod => {
      if (!live) return
      const fm = mod.frontmatter
      setTitle(typeof fm?.title === 'string' ? fm.title : null)
    }).catch(() => {})
    return () => { live = false }
  }, [id])

  useEffect(() => {
    if (title) document.title = `${title} | UBS Docs`
  }, [title])

  const crumbs = useMemo(
    () => ['Docs', ...(id ? id.split('/').map(docLabel) : [])],
    [id],
  )

  return (
    <div className={c('min-h-full', d ? 'aurora-dark' : 'aurora-light')}>
      <div className="max-w-[1480px] mx-auto px-10 py-12 flex gap-8 items-start">
        <DocsSidebar activeId={id} theme={theme} />

        <div className="min-w-0 flex-1">
          <Breadcrumb items={crumbs} theme={theme} />
          {Doc ? (
            <>
              <div className={c(card(theme), 'p-9')}>
                <MDXProvider components={MDX_COMPONENTS}>
                  <article className="docs-prose">
                    <Suspense fallback={<p className={c('text-sm', sub(theme))}>Loading…</p>}>
                      <Doc />
                    </Suspense>
                  </article>
                </MDXProvider>
              </div>
              <Pager id={id} theme={theme} />
            </>
          ) : (
            <NotFound id={id} theme={theme} />
          )}
        </div>
      </div>
    </div>
  )
}
