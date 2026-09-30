import { useEffect, useMemo, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { Link, useLocation, useSearchParams } from 'react-router-dom'
import { c, card, txt, muted, inputCls } from '../../lib'
import { useTheme } from '../../app/ThemeContext'
import type { Theme } from '../../types'
import { addSubtask, checkImport, createTask, type ImportVerdict } from '../../components/discordTasks/api'
import { useActingPermissions } from '../../components/portal/tenantProjects/useActingPermissions'
import { useTeam } from './TeamLayout'
import { projectChoices } from './taskFormLogic'
import {
  FILE_TOO_LARGE_TEXT, FILE_UNREADABLE_TEXT, FORMAT_RULES, FORMAT_SUBTASK_FIELDS, FORMAT_TASK_FIELDS, MAX_IMPORT_BYTES, PARENT_MISSING_TEXT, RUNNING_NOTICE, WAITING_NOTICE, applyStepResult, checkFailure, checkHeadline,
  createInputFor, createdResult, paceDelay, retryDelayFor, entryTitle, importButtonLabel, importSampleFile, importSteps, importSummary, initialRun, leftoverFile,
  nextStep, parentTaskIdFor, parseImportFile, stepFailureResult, type ImportRun, type ImportStep, type StepResult,
} from './importLogic'

// A file of tasks, checked by the bot without creating anything, then created
// one request at a time: each task, then each of its subtasks.
interface Checked { tasks: unknown[]; verdicts: ImportVerdict[]; projectId: string; createIssues: boolean }

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms))

function downloadJson(name: string, data: unknown) {
  const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }))
  const a = document.createElement('a')
  a.href = url
  a.download = name
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}

export default function TaskImport() {
  const { theme } = useTheme()
  const d = theme === 'dark'
  const { search } = useLocation()
  const [params] = useSearchParams()
  const { payload, loading, refresh } = useTeam()
  const { hasOnAnyRole, loaded } = useActingPermissions()
  const [projectId, setProjectId] = useState(params.get('projectId') ?? '')
  const [text, setText] = useState('')
  const [createIssues, setCreateIssues] = useState(true)
  const [checking, setChecking] = useState(false)
  const [checkError, setCheckError] = useState<string | null>(null)
  const [checked, setChecked] = useState<Checked | null>(null)
  const [run, setRun] = useState<ImportRun>({})
  const [running, setRunning] = useState(false)
  const [finished, setFinished] = useState(false)
  const [waitingKey, setWaitingKey] = useState<string | null>(null)
  const mounted = useRef(true)
  const runningRef = useRef(false)
  const checkSeq = useRef(0)
  const pickSeq = useRef(0)
  const dialogRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    mounted.current = true
    return () => { mounted.current = false }
  }, [])

  const projects = projectChoices(payload?.projects ?? [])
  const steps = useMemo(() => (checked ? importSteps(checked.verdicts) : []), [checked])

  // `?project=<docsSlug>` (the Tasks list's filter) preselects once the payload has the slugs.
  useEffect(() => {
    if (projectId || !payload) return
    const slug = params.get('project')
    const match = slug ? payload.projects.find((p) => p.docsSlug === slug && p.id) : null
    if (match?.id) setProjectId(match.id)
  }, [payload, params, projectId])

  // The app's root container sits behind the overlay: make it inert so keyboard focus
  // cannot reach the sidebar or tabs. The overlay is portalled to document.body, a
  // sibling of #root, so it stays interactive.
  useEffect(() => {
    if (!running) return
    const root = document.getElementById('root')
    root?.setAttribute('inert', '')
    return () => root?.removeAttribute('inert')
  }, [running])

  // The overlay is a modal: move focus into it when the import starts.
  useEffect(() => { if (running) dialogRef.current?.focus() }, [running])

  // Leaving the page mid-import abandons the rest of the queue.
  useEffect(() => {
    if (!running) return
    const guard = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = '' }
    window.addEventListener('beforeunload', guard)
    return () => window.removeEventListener('beforeunload', guard)
  }, [running])

  if (!loaded || (loading && !payload)) {
    return <div className={c(card(theme), 'rounded-2xl px-8 py-14 text-center')}><p className={c('text-sm font-medium m-0', muted(theme))}>Loading…</p></div>
  }
  if (!hasOnAnyRole('update_discord_tasks')) {
    return (
      <div className={c(card(theme), 'rounded-2xl px-8 py-14 text-center')}>
        <p className={c('text-sm font-medium mb-4', muted(theme))}>You need the update_discord_tasks permission to create tasks. Ask an admin.</p>
        <Link to="/tools/team/tasks" className="btn-primary px-5 py-2.5 text-sm no-underline">Back to tasks</Link>
      </div>
    )
  }
  if (!payload) return null

  const locked = running || finished || checking
  const clearCheck = () => { setChecked(null); setCheckError(null) }

  async function pickFile(file: File | undefined) {
    if (!file) return
    if (file.size > MAX_IMPORT_BYTES) { setChecked(null); setCheckError(FILE_TOO_LARGE_TEXT); return }
    const seq = checkSeq.current
    const pick = ++pickSeq.current
    let content: string
    try {
      content = await file.text()
    } catch {
      if (mounted.current && seq === checkSeq.current && pick === pickSeq.current) { setChecked(null); setCheckError(FILE_UNREADABLE_TEXT) }
      return
    }
    if (!mounted.current || seq !== checkSeq.current || pick !== pickSeq.current) return
    setText(content)
    clearCheck()
  }

  async function check() {
    checkSeq.current += 1
    const parsed = parseImportFile(text)
    if ('error' in parsed) { setChecked(null); setCheckError(parsed.error); return }
    setChecking(true)
    setCheckError(null)
    setChecked(null)
    try {
      const res = await checkImport(projectId, parsed.tasks, createIssues)
      if (mounted.current) setChecked({ tasks: parsed.tasks, verdicts: res.tasks, projectId, createIssues })
    } catch (err) {
      if (mounted.current) setCheckError(checkFailure(err as { status?: number; message?: string }))
    } finally {
      if (mounted.current) setChecking(false)
    }
  }

  async function runStep(step: ImportStep, r: ImportRun, verdicts: ImportVerdict[], pid: string, issues: boolean): Promise<StepResult> {
    const fields = verdicts.find((v) => v.index === step.taskIndex)?.fields
    if (!fields) return { ok: false, message: PARENT_MISSING_TEXT }
    const send = async (): Promise<StepResult> => {
      if (step.kind === 'task') {
        const res = await createTask(createInputFor(fields, pid, issues))
        return createdResult(res.task.id, res.note)
      }
      const parentId = parentTaskIdFor(r, step)
      if (!parentId) return { ok: false, message: PARENT_MISSING_TEXT }
      const sub = fields.subtasks[step.subIndex ?? 0]
      const res = await addSubtask(parentId, sub.title, sub.holderIds, { description: sub.description, scope: sub.scope, status: sub.status })
      return { ok: true, taskId: res.task.id }
    }
    // A 429 is rejected before any handler runs, so sending the same step again after a wait is safe.
    for (let attempt = 0; ; attempt++) {
      try {
        return await send()
      } catch (err) {
        const wait = retryDelayFor(err, attempt)
        if (wait === null) return stepFailureResult(err as { status?: number; message?: string }, step.kind)
        if (mounted.current) setWaitingKey(step.key)
        await sleep(wait)
        if (mounted.current) setWaitingKey(null)
      }
    }
  }

  // Strictly one request at a time, always to the end of the queue.
  async function startImport() {
    if (!checked || runningRef.current) return
    runningRef.current = true
    const { verdicts, projectId: pid, createIssues: issues } = checked
    setRunning(true)
    let r = initialRun(steps)
    setRun(r)
    try {
      let step: ImportStep | null
      let lastStart = -Infinity
      while ((step = nextStep(r, steps))) {
        const pace = paceDelay(lastStart, Date.now())
        if (pace > 0) await sleep(pace)
        lastStart = Date.now()
        r ={ ...r, [step.key]: { state: 'running' } }
        if (mounted.current) setRun(r)
        const result = await runStep(step, r, verdicts, pid, issues)
        r = applyStepResult(r, steps, step.key, result)
        if (mounted.current) setRun(r)
      }
    } finally {
      runningRef.current = false
      void refresh()
      if (mounted.current) { setWaitingKey(null); setRunning(false); setFinished(true) }
    }
  }

  function reset() {
    clearCheck()
    setText('')
    setRun({})
    setFinished(false)
  }

  const validCount = checked ? checked.verdicts.filter((v) => v.ok).length : 0
  const leftover = checked && finished ? leftoverFile(checked.tasks, checked.verdicts, run, steps) : null

  const list = checked && (
      <ul className="list-none p-0 m-0 flex flex-col gap-2">
        {checked.verdicts.map((v) => (
          <li key={v.index} className={c('rounded-xl border px-4 py-3', d ? 'border-white/10' : 'border-slate-200')}>
            <Row label={v.fields?.title ?? entryTitle(checked.tasks[v.index], v.index)}
              meta={v.fields ? `${v.fields.type} · ${v.fields.status.replace('_', ' ')}` : null}
              verdict={v} state={run[`t${v.index}`]} waiting={waitingKey === `t${v.index}`} live={running} theme={theme} />
            {v.fields && v.fields.subtasks.length > 0 && (
              <ul className="list-none p-0 m-0 mt-2 ml-5 flex flex-col gap-1.5">
                {v.fields.subtasks.map((s, i) => (
                  <li key={i}>
                    <Row label={s.title} meta={s.status.replace('_', ' ')} verdict={null} state={run[`t${v.index}.s${i}`]} waiting={waitingKey === `t${v.index}.s${i}`} live={running} theme={theme} />
                  </li>
                ))}
              </ul>
            )}
          </li>
        ))}
      </ul>
  )

  return (
    <>
      {/* In a portal on document.body: inside the layout's `relative z-10` content
          column the overlay would rank as z-10 and the fixed sidebar (z-40) would stay clickable. */}
      {running && checked && createPortal(
        <div ref={dialogRef} tabIndex={-1} role="dialog" aria-modal="true" aria-label="Import in progress"
          className={c('fixed inset-0 z-[2000] overflow-auto px-4 py-8 outline-none', d ? 'bg-slate-950' : 'bg-white')}>
          <div className="mx-auto max-w-[900px] flex flex-col gap-4">
            <h2 className={c('font-extrabold text-xl m-0', txt(theme))}>Import tasks</h2>
            <p role="status" className="text-sm font-semibold text-amber-500 m-0">{RUNNING_NOTICE}</p>
            {list}
          </div>
        </div>,
        document.body,
      )}
      <Link to={`/tools/team/tasks${search}`} className={c('inline-block text-sm font-semibold no-underline mb-4 tr',
        d ? 'text-white/40 hover:text-white/70' : 'text-slate-400 hover:text-indigo-600')}>&larr; Back to tasks</Link>
      <article className={c(card(theme), 'rounded-2xl p-5 sm:p-7')}>
        <h2 className={c('font-extrabold text-xl sm:text-2xl m-0 mb-5', txt(theme))}>Import tasks</h2>
        <div className="flex flex-col gap-5">
          <Labeled label="Project" theme={theme}>
            <select className={inputCls(theme)} value={projectId} disabled={locked}
              onChange={(e) => { setProjectId(e.target.value); clearCheck() }}>
              <option value="">Pick a project…</option>
              {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </Labeled>
          <Labeled label="File" theme={theme}>
            <input type="file" accept=".json,application/json" disabled={locked}
              className={c('text-sm', txt(theme))}
              onChange={(e) => { const input = e.target; void pickFile(input.files?.[0]).then(() => { input.value = '' }) }} />
          </Labeled>
          <Labeled label="Or paste the JSON" theme={theme}>
            <textarea className={inputCls(theme, 'min-h-[140px] font-mono text-xs')} value={text} disabled={locked}
              onChange={(e) => { setText(e.target.value); clearCheck() }} />
          </Labeled>
          <label className={c('inline-flex items-center gap-2 text-sm', txt(theme))}>
            <input type="checkbox" checked={createIssues} disabled={locked}
              onChange={(e) => { setCreateIssues(e.target.checked); clearCheck() }} />
            Open GitHub issues
          </label>
          <div>
            <button type="button" className="btn-primary px-5 py-2.5 text-sm" disabled={locked || !projectId || !text.trim()} onClick={() => void check()}>
              {checking ? 'Checking…' : 'Check file'}
            </button>
          </div>

          {checkError && <p role="alert" className="text-sm font-semibold text-red-500 m-0">{checkError}</p>}

          {checked && (
            <section className="flex flex-col gap-3">
              <p className={c('text-sm font-semibold m-0', txt(theme))}>{checkHeadline(checked.verdicts)}</p>
              {!running && list}
              <div className="flex flex-wrap gap-3 items-center">
                <button type="button" className="btn-primary px-5 py-2.5 text-sm" disabled={validCount === 0 || running || finished} onClick={() => void startImport()}>
                  {running ? 'Importing…' : importButtonLabel(validCount)}
                </button>
                {finished && <button type="button" className={c('btn-outline-indigo px-5 py-2.5 text-sm', d ? 'dark-variant' : '')} onClick={reset}>Start another import</button>}
              </div>
              {finished && (
                <div className="flex flex-col gap-2" role="status">
                  <p className={c('text-sm font-semibold m-0', txt(theme))}>{importSummary(checked.verdicts, run, steps)}</p>
                  {leftover && leftover.tasks.length > 0 && (
                    <div>
                      <button type="button" className={c('btn-outline-indigo px-4 py-2 text-sm', d ? 'dark-variant' : '')}
                        onClick={() => downloadJson('tasks-not-imported.json', leftover)}>Download the tasks that were not imported</button>
                    </div>
                  )}
                </div>
              )}
            </section>
          )}

          <details className={c('rounded-xl border px-4 py-3', d ? 'border-white/10' : 'border-slate-200')}>
            <summary className={c('cursor-pointer text-sm font-semibold', txt(theme))}>File format</summary>
            <div className={c('mt-3 flex flex-col gap-4 text-sm', txt(theme))}>
              <FieldTable title="Task fields" rows={FORMAT_TASK_FIELDS} theme={theme} />
              <FieldTable title="Subtask fields" rows={FORMAT_SUBTASK_FIELDS} theme={theme} />
              <div>
                <p className={c('text-[11px] font-bold uppercase tracking-wide mb-1.5', muted(theme))}>Rules</p>
                <ul className="m-0 pl-5 flex flex-col gap-1">{FORMAT_RULES.map((r) => <li key={r}>{r}</li>)}</ul>
              </div>
              <div>
                <button type="button" className={c('btn-outline-indigo px-4 py-2 text-sm', d ? 'dark-variant' : '')}
                  onClick={() => downloadJson('task-import-sample.json', importSampleFile())}>Download a sample file</button>
              </div>
            </div>
          </details>
        </div>
      </article>
    </>
  )
}

function Row({ label, meta, verdict, state, waiting, live, theme }: {
  label: string; meta: string | null; verdict: ImportVerdict | null; state: ImportRun[string] | undefined; waiting: boolean; live: boolean; theme: Theme
}) {
  return (
    <div className="text-sm">
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <span className={c('font-semibold', txt(theme))}>{label}</span>
        {meta && <span className={c('text-xs', muted(theme))}>{meta}</span>}
        {verdict?.ok && !state && <span className="text-emerald-500 font-semibold" aria-label="Valid">&#10003;</span>}
        {state?.state === 'running' && <span className={c('text-xs font-semibold', muted(theme))}>{waiting ? WAITING_NOTICE : 'Creating…'}</span>}
        {state?.state === 'created' && state.taskId && (live
          ? <span className="text-xs font-semibold text-emerald-500">Created</span>
          : <Link to={`/tools/team/tasks/${state.taskId}`} className="text-xs font-semibold text-emerald-500">Created</Link>)}
        {state?.state === 'failed' && <span className="text-xs font-semibold text-red-500">Failed: {state.message}</span>}
        {state?.state === 'unconfirmed' && <span className="text-xs font-semibold text-amber-500">{state.message}</span>}
        {state?.state === 'skipped' && <span className="text-xs font-semibold text-amber-500">Skipped: {state.message}</span>}
      </div>
      {state?.state === 'created' && state.note && <p className="text-xs font-semibold text-amber-500 m-0 mt-1">{state.note}</p>}
      {verdict?.errors.map((e, i) => <p key={`e${i}`} className="text-xs font-semibold text-red-500 m-0 mt-1">{e}</p>)}
      {verdict?.warnings.map((w, i) => <p key={`w${i}`} className="text-xs font-semibold text-amber-500 m-0 mt-1">{w}</p>)}
    </div>
  )
}

function FieldTable({ title, rows, theme }: { title: string; rows: { name: string; rule: string }[]; theme: Theme }) {
  return (
    <div>
      <p className={c('text-[11px] font-bold uppercase tracking-wide mb-1.5', muted(theme))}>{title}</p>
      <table className="w-full text-left border-collapse">
        <tbody>
          {rows.map((r) => (
            <tr key={r.name}>
              <td className="py-1 pr-4 align-top font-mono text-xs whitespace-nowrap">{r.name}</td>
              <td className="py-1">{r.rule}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function Labeled({ label, theme, children }: { label: string; theme: Theme; children: ReactNode }) {
  return (
    <div>
      <p className={c('text-[11px] font-bold uppercase tracking-wide mb-1.5', muted(theme))}>{label}</p>
      {children}
    </div>
  )
}
