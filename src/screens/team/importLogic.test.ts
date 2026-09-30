import { describe, it, expect } from 'vitest'
import {
  MAX_IMPORT_TASKS, MAX_IMPORT_BYTES, parseImportFile, importSteps, initialRun, applyStepResult, nextStep,
  importSummary, leftoverFile, importSampleFile, createInputFor, parentTaskIdFor,
  entryTitle, importButtonLabel, checkHeadline, checkFailure, stepFailure, IMPORT_UNAVAILABLE_TEXT, FORMAT_TASK_FIELDS, FORMAT_RULES,
} from './importLogic'
import type { ImportFields, ImportVerdict } from '../../components/discordTasks/api'

const fields = (title: string, subs: string[] = [], over: Partial<ImportFields> = {}): ImportFields => ({
  type: 'feature', title, description: null, scope: null, status: 'open', modules: [], holderIds: [],
  repositoryIds: [], tracks: { apiTests: false, qaTests: false, acceptanceCriteria: false },
  subtasks: subs.map((s) => ({ title: s, description: null, scope: null, status: 'open' as const, holderIds: [] })),
  ...over,
})
const good = (index: number, title: string, subs: string[] = []): ImportVerdict =>
  ({ index, ok: true, errors: [], warnings: [], fields: fields(title, subs) })
const bad = (index: number): ImportVerdict => ({ index, ok: false, errors: ['nope'], warnings: [], fields: null })

describe('parseImportFile', () => {
  it('accepts { tasks } and a bare array, returning entries as-is', () => {
    expect(parseImportFile('{"tasks":[{"a":1},7]}')).toEqual({ tasks: [{ a: 1 }, 7] })
    expect(parseImportFile('[{"a":1}]')).toEqual({ tasks: [{ a: 1 }] })
  })
  it('trims a leading BOM', () => {
    expect(parseImportFile('﻿[{"a":1}]')).toEqual({ tasks: [{ a: 1 }] })
  })
  it('reports invalid JSON with the parser message', () => {
    const r = parseImportFile('{nope')
    expect('error' in r && r.error.startsWith('This is not valid JSON: ')).toBe(true)
  })
  it('needs a tasks list', () => {
    const msg = 'The file needs a "tasks" list.'
    expect(parseImportFile('{"tasks":"x"}')).toEqual({ error: msg })
    expect(parseImportFile('{"other":[]}')).toEqual({ error: msg })
    expect(parseImportFile('5')).toEqual({ error: msg })
    expect(parseImportFile('null')).toEqual({ error: msg })
  })
  it('rejects an empty list', () => {
    expect(parseImportFile('[]')).toEqual({ error: 'The file has no tasks.' })
  })
  it('accepts 50 tasks and rejects 51', () => {
    expect(MAX_IMPORT_TASKS).toBe(50)
    const many = (n: number) => JSON.stringify(Array.from({ length: n }, () => ({})))
    expect('tasks' in parseImportFile(many(50))).toBe(true)
    expect(parseImportFile(many(51))).toEqual({ error: 'A file can hold at most 50 tasks — this one has 51.' })
  })
  it('measures the size cap in UTF-8 bytes, before parsing', () => {
    expect(MAX_IMPORT_BYTES).toBe(90 * 1024)
    const tooBig = 'é'.repeat(MAX_IMPORT_BYTES / 2 + 1) // fewer characters than bytes, still over
    expect(tooBig.length).toBeLessThan(MAX_IMPORT_BYTES)
    expect(parseImportFile(tooBig)).toEqual({ error: 'The file is too large — 90 KB at most.' })
    expect(parseImportFile('x'.repeat(MAX_IMPORT_BYTES + 1))).toEqual({ error: 'The file is too large — 90 KB at most.' })
  })
})

describe('importSteps', () => {
  it('lists each valid task then its subtasks, skipping invalid tasks', () => {
    const steps = importSteps([good(0, 'A', ['a1', 'a2']), bad(1), good(2, 'C', ['c1'])])
    expect(steps.map((s) => s.key)).toEqual(['t0', 't0.s0', 't0.s1', 't2', 't2.s0'])
    expect(steps[1]).toEqual({ key: 't0.s0', kind: 'subtask', taskIndex: 0, subIndex: 0, title: 'a1' })
    expect(steps[0]).toEqual({ key: 't0', kind: 'task', taskIndex: 0, title: 'A' })
  })
})

describe('run reducer', () => {
  const verdicts = [good(0, 'A', ['a1', 'a2']), good(1, 'B')]
  const steps = importSteps(verdicts)

  it('starts everything pending', () => {
    expect(Object.values(initialRun(steps)).every((s) => s.state === 'pending')).toBe(true)
    expect(Object.keys(initialRun(steps))).toEqual(steps.map((s) => s.key))
  })
  it('a created task stores its id', () => {
    const run = applyStepResult(initialRun(steps), steps, 't0', { ok: true, taskId: 'X1' })
    expect(run.t0).toEqual({ state: 'created', taskId: 'X1' })
  })
  it('a failed task skips its subtasks only', () => {
    const run = applyStepResult(initialRun(steps), steps, 't0', { ok: false, message: 'boom' })
    expect(run.t0).toEqual({ state: 'failed', message: 'boom' })
    expect(run['t0.s0']).toEqual({ state: 'skipped', message: 'The task was not created.' })
    expect(run['t0.s1']).toEqual({ state: 'skipped', message: 'The task was not created.' })
    expect(run.t1.state).toBe('pending')
  })
  it('a failed subtask leaves its siblings pending', () => {
    const run = applyStepResult(initialRun(steps), steps, 't0.s0', { ok: false, message: 'bad sub' })
    expect(run['t0.s0']).toEqual({ state: 'failed', message: 'bad sub' })
    expect(run['t0.s1'].state).toBe('pending')
  })
  it('does not mutate the run it is given', () => {
    const run = initialRun(steps)
    applyStepResult(run, steps, 't1', { ok: true, taskId: 'X' })
    expect(run.t1.state).toBe('pending')
  })
  it('nextStep returns the first pending step, then null', () => {
    let run = initialRun(steps)
    expect(nextStep(run, steps)?.key).toBe('t0')
    run = applyStepResult(run, steps, 't0', { ok: false, message: 'x' })
    expect(nextStep(run, steps)?.key).toBe('t1')
    run = { ...run, t1: { state: 'running' } }
    expect(nextStep(run, steps)).toBeNull()
  })
  it('parentTaskIdFor gives the created parent id, else null', () => {
    let run = initialRun(steps)
    expect(parentTaskIdFor(run, steps[1])).toBeNull()
    run = applyStepResult(run, steps, 't0', { ok: true, taskId: 'X1' })
    expect(parentTaskIdFor(run, steps[1])).toBe('X1')
    expect(parentTaskIdFor(run, steps[0])).toBeNull()
  })
})

describe('importSummary', () => {
  const make = (n: number, invalidAt: number[]) =>
    Array.from({ length: n }, (_, i) => (invalidAt.includes(i) ? bad(i) : good(i, `T${i}`)))
  const finish = (verdicts: ImportVerdict[], failed: string[] = []) => {
    const steps = importSteps(verdicts)
    let run = initialRun(steps)
    for (const s of steps) {
      run = applyStepResult(run, steps, s.key, failed.includes(s.key) ? { ok: false, message: 'x' } : { ok: true, taskId: s.key })
    }
    return importSummary(verdicts, run, steps)
  }

  it('all imported', () => expect(finish(make(15, []))).toBe('Imported 15 of 15 tasks.'))
  it('invalid and failed', () => {
    expect(finish(make(15, [3, 4]), ['t0'])).toBe('Imported 12 of 15 tasks. 2 were invalid and 1 failed.')
  })
  it('invalid only', () => expect(finish(make(15, [3, 4]))).toBe('Imported 13 of 15 tasks. 2 were invalid.'))
  it('failed only', () => expect(finish(make(15, []), ['t1'])).toBe('Imported 14 of 15 tasks. 1 failed.'))
  it('one invalid uses was', () => expect(finish(make(3, [1]))).toBe('Imported 2 of 3 tasks. 1 was invalid.'))
  it('a single-task file says task', () => expect(finish(make(1, []))).toBe('Imported 1 of 1 task.'))
  it('appends failed subtasks', () => {
    const v = [good(0, 'A', ['a', 'b', 'c', 'd'])]
    expect(finish(v, ['t0.s0', 't0.s1', 't0.s2'])).toBe('Imported 1 of 1 task. 3 subtasks failed.')
    expect(finish(v, ['t0.s1'])).toBe('Imported 1 of 1 task. 1 subtask failed.')
  })
  it('a failed task with subtasks counts once, not its skipped subtasks', () => {
    expect(finish([good(0, 'A', ['a'])], ['t0'])).toBe('Imported 0 of 1 task. 1 failed.')
  })
})

describe('leftoverFile', () => {
  it('holds invalid and failed originals, unchanged and in file order', () => {
    const original = [{ n: 'a' }, { n: 'b' }, { n: 'c' }, { n: 'd' }]
    const verdicts = [good(0, 'a', ['s']), bad(1), good(2, 'c'), good(3, 'd')]
    const steps = importSteps(verdicts)
    let run = initialRun(steps)
    run = applyStepResult(run, steps, 't0', { ok: true, taskId: 'X' })
    run = applyStepResult(run, steps, 't0.s0', { ok: false, message: 'sub failed' })
    run = applyStepResult(run, steps, 't2', { ok: false, message: 'x' })
    run = applyStepResult(run, steps, 't3', { ok: true, taskId: 'Y' })
    expect(leftoverFile(original, verdicts, run, steps)).toEqual({ tasks: [{ n: 'b' }, { n: 'c' }] })
  })
})

describe('importSampleFile', () => {
  it('parses through parseImportFile', () => {
    const r = parseImportFile(JSON.stringify(importSampleFile()))
    expect('tasks' in r && r.tasks.length).toBeGreaterThan(0)
  })
})

describe('createInputFor', () => {
  it('maps a verdict onto the create wrapper input', () => {
    const f = fields('Search', [], { type: 'bug', description: 'd', scope: 'backend', status: 'done', modules: ['M'], holderIds: ['u1'], repositoryIds: ['R1'] })
    expect(createInputFor(f, 'P1', true)).toEqual({
      type: 'bug', title: 'Search', description: 'd', project_id: 'P1', scope: 'backend', modules: ['M'],
      holder_ids: ['u1'], create_issue: true, status: 'done',
    })
  })
})

describe('screen texts', () => {
  const verdict = (index: number, ok: boolean): ImportVerdict => ({ index, ok, errors: [], warnings: [], fields: ok ? fields(`t${index}`) : null })

  it('labels the import button, singular for one', () => {
    expect(importButtonLabel(1)).toBe('Import 1 task')
    expect(importButtonLabel(0)).toBe('Import 0 tasks')
    expect(importButtonLabel(3)).toBe('Import 3 tasks')
  })

  it('counts the importable tasks in the headline', () => {
    expect(checkHeadline([verdict(0, true), verdict(1, false), verdict(2, true)])).toBe('2 of 3 tasks can be imported.')
    expect(checkHeadline([verdict(0, true)])).toBe('1 of 1 task can be imported.')
  })

  it('says the import is unavailable on 404 and 503, and gives the server sentence otherwise', () => {
    expect(checkFailure({ status: 404, message: 'nope' })).toBe(IMPORT_UNAVAILABLE_TEXT)
    expect(checkFailure({ status: 503, message: 'down' })).toBe(IMPORT_UNAVAILABLE_TEXT)
    expect(checkFailure({ status: 400, message: '**Bad**\nfile' })).toBe('Bad file')
    expect(checkFailure({ status: 500 })).toBe('The check failed.')
  })

  it('gives a step failure the server sentence or a fallback', () => {
    expect(stepFailure({ message: 'Title is required.' })).toBe('Title is required.')
    expect(stepFailure({ message: '' })).toBe('The request failed.')
    expect(stepFailure(null)).toBe('The request failed.')
  })

  it('carries the format contract', () => {
    expect(FORMAT_TASK_FIELDS.map((f) => f.name)).toEqual(['type', 'title', 'description', 'scope', 'status', 'modules', 'assignees', 'subtasks'])
    expect(FORMAT_RULES[0]).toContain('90 KB')
  })
})

describe('entryTitle', () => {
  it('uses the entry title, else its position', () => {
    expect(entryTitle({ title: 'Login' }, 0)).toBe('Login')
    expect(entryTitle({ title: '  ' }, 1)).toBe('Task 2')
    expect(entryTitle({ title: 5 }, 2)).toBe('Task 3')
    expect(entryTitle('x', 3)).toBe('Task 4')
    expect(entryTitle(null, 4)).toBe('Task 5')
  })
})
