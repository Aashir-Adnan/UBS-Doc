# Meeting Workflow — Full Frontend Flow (Debugging Reference)

> **Scope of this document.** This file maps the **entire meeting-workflow feature as it exists in this repository** (the Docusaurus dev-tools portal). Every file, every component, every API call, and the full stage pipeline is covered.
>
> **Important architectural fact:** This repo is the **frontend only**. All actual processing — Whisper transcription, Claude/LLM calls, GitHub issue creation, the autonomous issue→PR agent — runs in a **separate backend service** reached at `API_BASE_URL` (default `http://localhost:3000`). That backend's source code is **not in this repo**. Wherever this doc describes backend behavior, it is **inferred** from:
> - the request/response shapes the frontend sends and consumes, and
> - the two agent docs that *are* checked in here: [`docs/agents/claude-github-issues-agent.md`](agents/claude-github-issues-agent.md) and [`docs/agents/agent-issue-format.md`](agents/agent-issue-format.md).
>
> Backend-side claims are marked **[BACKEND — inferred]** so you know which parts to verify against the actual server when debugging.

---

## 1. File / folder map

Everything for the meeting workflow lives in three places:

| Path | Role |
|---|---|
| [`src/pages/tools/meetingWorkflow.jsx`](../src/pages/tools/meetingWorkflow.jsx) | Route entry (`/tools/meetingWorkflow`). Auth gate + top-level view switch. |
| [`src/components/meetingWorkflow/api.js`](../src/components/meetingWorkflow/api.js) | The 4 fetch helpers (`mwGet`, `mwPost`, `mwPostForm`, `mwDelete`) every component uses. |
| [`src/components/meetingWorkflow/MeetingList.jsx`](../src/components/meetingWorkflow/MeetingList.jsx) | List view — all meetings as cards. |
| [`src/components/meetingWorkflow/CreateMeeting.jsx`](../src/components/meetingWorkflow/CreateMeeting.jsx) | Create view — schedule form, participants, repo/feature scope picker. |
| [`src/components/meetingWorkflow/WorkflowPanel.jsx`](../src/components/meetingWorkflow/WorkflowPanel.jsx) | Meeting view — the 5-stage pipeline panel. **The core of the feature.** |
| [`src/components/meetingWorkflow/LiveTranscribeStage.jsx`](../src/components/meetingWorkflow/LiveTranscribeStage.jsx) | Stage 1 — live mic recording + segment transcription + live analysis. |
| [`src/components/meetingWorkflow/NoteEditor.jsx`](../src/components/meetingWorkflow/NoteEditor.jsx) | Stage 4 helper — edit markdown notes & rebuild HTML report. |

Supporting / shared files referenced by the workflow:

| Path | Role |
|---|---|
| [`src/components/portal/config.js`](../src/components/portal/config.js) | Exports `API_BASE_URL` (window-injected at build, else env, else `localhost:3000`). |
| [`src/components/portal/authStore.jsx`](../src/components/portal/authStore.jsx) | `useAuth()` → `{ user, setUser, signOut }`. |
| [`src/components/portal/GoogleSignIn`](../src/components/portal/GoogleSignIn.jsx) | Sign-in card shown when unauthenticated. |
| [`src/utils/isGranjurEmail.js`](../src/utils/isGranjurEmail.js) | Per-page access gate (`@granjur.com` + hardcoded allow-list). |
| [`docs/agents/claude-github-issues-agent.md`](agents/claude-github-issues-agent.md) | **The downstream agent** that turns issues into PRs (backend, separate). |
| [`docs/agents/agent-issue-format.md`](agents/agent-issue-format.md) | The `[Agent Call]` issue spec the backend must emit for the agent to pick it up. |

There are **no other files** in this repo involved in the meeting workflow. (Verified by grepping `meeting/workflow` and `meetingWorkflow` across `src/`.)

---

## 2. The API transport layer ([`api.js`](../src/components/meetingWorkflow/api.js))

All requests go to `BASE = ${API_BASE_URL}/api`. Four helpers:

```
mwGet(path)              → GET,  no body
mwPost(path, body)       → POST, JSON body
mwPostForm(path, form)   → POST, multipart/form-data (audio + file uploads)
mwDelete(path, body)     → POST (yes, POST), JSON body   ← note: not a real DELETE
```

**Response unwrapping (critical for debugging):** every helper returns
```js
data.payload?.return ?? data.payload ?? data
```
So the backend's canonical envelope is `{ payload: { return: <actual data> } }`. If you ever see the frontend reading `undefined` fields, check whether the backend wrapped (or failed to wrap) the response in `payload.return`. `mwGet` throws on `!r.ok` using the raw response text; `mwPost/Form/Delete` try to `JSON.parse` the body and throw `data.error || text || statusText`.

---

## 3. Page entry & gating ([`meetingWorkflow.jsx`](../src/pages/tools/meetingWorkflow.jsx))

`MeetingWorkflowPage` → `MeetingWorkflowContent`. Two gates run before any workflow UI:

1. **Not signed in** (`!user`) → renders `<GoogleSignIn />` card. Nothing else loads.
2. **Signed in but wrong domain** (`!isGranjurEmail(user.email)`) → "Access restricted" card.
3. **Authorized** → the three-view shell.

State machine (single `view` state, `'list' | 'create' | 'meeting'`):

```
        ┌─────────────────────────── + New Meeting ──────────────────────────┐
        │                                                                      ▼
   ┌─────────┐   select card    ┌───────────┐   onCreated() ┌────────┐   Create Meeting ┌────────┐
   │  list   │ ───────────────► │  meeting  │               │  list  │ ◄─────────────── │ create │
   │ Meeting │                  │ Workflow  │               │(reload)│                  │ form   │
   │ List    │ ◄─ ← Meetings ── │  Panel    │               └────────┘                  └────────┘
   └─────────┘                  └───────────┘
```

- `handleCreated` (after create) bumps `listKey` (forces `MeetingList` remount/refetch) and returns to `list`.
- `handleSelectMeeting(meeting)` stores the selected meeting object and switches to `meeting`.
- `handleStageComplete` bumps `listKey` so the list reflects new stage/status when you go back.
- The selected `meeting` object passed into `WorkflowPanel` is the **list row** (summary), not the full detail — the panel fetches detail itself (see §6).

---

## 4. List view ([`MeetingList.jsx`](../src/components/meetingWorkflow/MeetingList.jsx))

**API call:** `GET /api/meeting/workflow/list` on mount (and on Refresh).

- Reads `data.meetings` (with fallbacks `Array.isArray(data) ? data : data.return`).
- Renders each meeting as a card: title, status badge (`STATUS_LABEL` map), scheduled date, and a 5-pip progress bar driven by `m.current_stage` (`STAGE_LABELS = ['Pre-Meeting','Transcribe','Analyze','Tasks','Report']`).
- Client-side title search only. No pagination.

**Meeting row fields the frontend depends on:** `meeting_id`, `title`, `status`, `current_stage`, `scheduled_at`. (Plus anything `WorkflowPanel` reads off the summary: `agenda`, `transcript`, `pre_meeting_notes`, `pre_meeting_html` — though these are normally hydrated by the detail fetch.)

---

## 5. Create view ([`CreateMeeting.jsx`](../src/components/meetingWorkflow/CreateMeeting.jsx))

Three **GET** calls fire on mount to populate the form:

| Call | Endpoint | Reads |
|---|---|---|
| `fetchRepos()` | `GET /api/tracked/repos/list?version=1` | `data.repos[]` → `{ id, name, branch }` |
| `fetchAllFeatures()` | `GET /api/tracked/repos/features/list?version=1` | `data.features[]` → `{ id, repo_id, repo_name, feature_name, source, category, status }` |
| `fetchPortalUsers()` | `GET /api/portal/users/list?version=1` | `data.users[]` → `{ name, email, photo_url }` |

UI building blocks:
- **`DigitalClock`** — date input + HH/MM number fields (arrow-key increment). Produces `scheduled_at` only if a date is set.
- **`ParticipantsPicker`** — searchable user tiles. Current user is auto-included and locked (`useEffect` seeds `selectedParticipants` with `userEmail`).
- **`ScopePicker` / `CheckList`** — two columns: **Repositories** and **Features**. Features are filtered to the selected repos (`f.repo_id ∈ selectedRepoIds`); when no repo selected, *all* features show. Features split into **manual** (`source !== 'project-status'`) and **framework** (`source === 'project-status'`, grouped by `category`).

**Submit → `POST /api/meeting/workflow/create`** with body:
```json
{
  "title": "…",
  "scheduled_at": "YYYY-MM-DD HH:MM:00" | null,
  "participants": [{ "email": "…", "display_name": "…"|null }],
  "created_by": "<userEmail>" | null,
  "agenda": "<text>" | null,
  "scope_repo_ids": [<id>, …],
  "scope_feature_ids": [<id>, …]
}
```
On success → `onCreated()` → back to list. The `scope_*` arrays are what later let **[BACKEND]** scope the Pre-Meeting brief and analysis to the right repos/features.

---

## 6. Meeting view — the stage pipeline ([`WorkflowPanel.jsx`](../src/components/meetingWorkflow/WorkflowPanel.jsx))

This is the heart of the feature. Five stages:

```
STAGES = [
  0  📋 Pre-Meeting
  1  🎙️ Transcribe
  2  🔍 Analyze
  3  📝 Tasks      (Tasks + Approval merged — Approve creates GitHub issues here)
  4  📄 Report
]
```

> Note the code comment: the old **Approve** and **Issue Sync** stages were removed/merged. GitHub-issue creation now happens **inside Stage 3 (Tasks)** on approval — there is no separate sync stage anymore.

### 6.0 Panel lifecycle

On mount / when `meeting.meeting_id` changes:
- `activeStage` and `completedStage` initialize from `meeting.current_stage ?? 0`.
- **Detail fetch:** `GET /api/meeting/workflow/meeting?meeting_id=<id>` → stored in `detail`. This `detail` object is threaded into **every** stage component and is the source of persisted state. Observed shape (from how stages read it):
  ```
  detail = {
    meeting: {
      pre_meeting_notes, pre_meeting_html,
      transcript, timed_notes_json[], analysis_json,
      ...
    },
    tasks: [ … ],            // for Stage 3
    notes: { raw_notes, edited_notes },   // for Stage 4
    latestHtml: "<html…>"   // for Stage 4
  }
  ```
- `handleDone()` (passed to every stage as `onDone`): increments `completedStage`, calls `onStageComplete()` (bubbles to the page to refresh the list), and **re-fetches the detail** so the next stage sees fresh data.

`StageNav` lets the user click any stage freely (not locked to a linear order). Stage body is `stageComponents[activeStage]`.

---

### Stage 0 — Pre-Meeting (`PreMeetingStage`)

Purpose (from UI copy): Claude queries the DB for the scoped repos/features, searches the codebase, and writes a brief on "what's already built and where."

**Context files sub-panel (`ContextFilesPanel`)** — runs independently:
| Action | API |
|---|---|
| Load list | `GET /api/meeting/workflow/context-files?meeting_id=<id>` → `data.files[]` (`{ file_id, filename, file_size, has_text }`) |
| Upload | `POST /api/meeting/workflow/context-files` (multipart: `meeting_id` + `files[]`) → `data.uploaded[]`, then re-fetches list |
| Delete | `POST /api/meeting/workflow/context-files/delete` (`{ file_id, meeting_id }`) |

> **[BACKEND — inferred]** Uploaded files' extracted text is injected into Claude prompts ("uploaded text is injected into Claude prompts").

**Generate → `POST /api/meeting/workflow/premeeting`** `{ meeting_id }` → response read as:
```
{ preMeetingNotes, preMeetingHtml, keyTopics[], openItems[] }
```
Markdown/HTML tab viewer; `keyTopics` and `openItems` (open items from previous meetings) listed below. Calls `onDone()`.

---

### Stage 1 — Transcribe (`LiveTranscribeStage`) — **the live recording engine**

This is the most complex client component. It records the mic, slices it into **1-minute segments**, and transcribes each segment as it completes.

**Constants & timers:**
- `SEGMENT_MS = 60_000` — one segment per minute.
- `timerRef` — ticks `elapsedSec` every 1s.
- `segmentTimerRef` — fires `rotateSegment()` every 60s.

**Recording loop (`startRecording`):**
1. `navigator.mediaDevices.getUserMedia({ audio:true })`. On deny → error, abort.
2. Picks a mime type: `audio/webm;codecs=opus` → `audio/webm` → `''`.
3. `createRecorder(segIdx, startSec)` builds a `MediaRecorder`, pushes a placeholder segment `{ index, startSec, transcript:'', status:'recording' }`, and sets:
   - `ondataavailable` → collect chunks.
   - `onstop` → assemble `Blob`, call `transcribeSegment(blob, segIdx, startSec)` **in the background**, then — if still recording — spin up the next recorder and `start()` it. This is a self-chaining recorder; each segment's stop boots the next.
4. `rotateSegment()` every 60s: stops the current recorder (triggers its `onstop` → transcribe + chain), bumps `segmentIndexRef`, resets `segmentStartSecRef`.

**Per-segment transcription → `POST /api/meeting/workflow/transcribe`** (multipart):
```
audio:          <blob>  (segment_<idx>.webm)
meeting_id:     <id>
segment_index:  <idx>
```
Reads `data.transcriptPreview || data.transcript || '(no speech detected)'` and writes it into that segment's row (status `done`/`error`).
> **[BACKEND — inferred]** This is where **Whisper** (or equivalent STT) runs, and where the backend accumulates the full `transcript` for the meeting (later read in Stage 2/4).

**Timed notes:** while recording, the user can type notes via `NoteInput`; each note is `{ text, at: elapsedSec }`. They're rendered inline per segment (notes whose `at` falls inside `[startSec, startSec+60)`).

**Stop (`stopRecording`):** clears both timers, nulls `streamRef`/`recorderRef` (so `onstop` does **not** chain a new recorder), stops the recorder and all tracks, phase → `stopped`.

**Analyze (`runAnalysis` → `submitAnalysis`):**
1. Waits 1.5s for in-flight transcriptions to settle.
2. `buildPayload(currentSegments)` builds:
   ```json
   {
     "meeting_id": "<id>",
     "meeting_notes": {
       "segment_1": { "time_range":"0:00 – 1:00", "transcription":"…", "user_notes":"[0:12] …"|null },
       …
     },
     "timed_notes": [ { "text":"…", "at": <sec> }, … ],
     "total_duration_sec": <sec>
   }
   ```
3. **`POST /api/meeting/workflow/analyze-live`** → `data` read as the analysis object:
   ```
   { summary, clarificationQuestions[], featuresIdentified[], markdown, html }
   ```
   Renders summary, clarification questions, feature chips, and a markdown/HTML viewer. Calls `onDone()`.

**Re-visiting an old meeting:** if `detail.meeting.transcript` / `timed_notes_json` / `analysis_json` exist, they're restored on load (saved transcript, saved notes, saved analysis shown without re-recording).

> ⚠️ **Two analysis paths exist.** Stage 1 calls **`/analyze-live`** (operates on the in-memory segment payload). Stage 2 calls **`/analyze`** (operates on the persisted transcript). They are different endpoints producing similar-but-not-identical shapes — a common source of confusion when debugging "why does the analysis look different."

---

### Stage 2 — Analyze (`AnalyzeStage`) — "MTA Analysis"

Operates on the **persisted transcript** (warns if `meeting.transcript`/`detail.meeting.transcript` is empty).

| Action | API | Reads |
|---|---|---|
| Run / Re-run | `POST /api/meeting/workflow/analyze` `{ meeting_id }` | `data.analysis ?? data` |
| Prompt for Clarity | `POST /api/meeting/workflow/clarify` `{ meeting_id }` | `data.questions[]` → `{ id, question }` |
| Revise | `POST /api/meeting/workflow/clarify/revise` `{ meeting_id, answered_questions:[{question,answer}] }` | `data.analysis` |

Analysis object shape consumed:
```
{ summary, projectsDiscussed[], platformsDiscussed[],
  decisionsMade[], actionItems[], codeReferences[] }
```
Clarify flow: generate questions → user answers each in a textarea → "Revise Analysis" (enabled only when **all** answered) re-submits answers and replaces `result` with the revised analysis.

---

### Stage 3 — Tasks & Approval (`TasksStage`) — **where GitHub issues are born**

This stage turns analysis → discrete tasks, lets you edit them, then **approve to auto-create GitHub issues.**

**Load tasks (mount):** `GET /api/meeting/workflow/tasks?meeting_id=<id>` → `data.tasks[]`. Each task:
```
{ task_id, project, platform, feature, sub_feature,
  code_residence, goal_of_task, status }   // status ∈ pending|approved|rejected
```

| Action | API | Notes |
|---|---|---|
| Generate / Regenerate | `POST /api/meeting/workflow/tasks` `{ meeting_id }` | Claude converts analysis → tasks. **[BACKEND]** |
| Refresh | `GET /api/meeting/workflow/tasks?meeting_id=<id>` | re-read |
| Add manual task | `POST /api/meeting/workflow/tasks/add` `{ meeting_id, project, platform, feature, sub_feature, code_residence, goal_of_task }` | `goal_of_task` required |
| Inline edit a cell | `POST /api/meeting/workflow/tasks/update` `{ task_id, meeting_id, <field>:<value> }` | via `EditableCell`; returns `data.task` |
| Delete | `POST /api/meeting/workflow/tasks/delete` `{ task_id, meeting_id }` | |

**Approve / Reject → `POST /api/meeting/workflow/approve`**:
```json
{ "meeting_id":"<id>", "decision":"approved"|"rejected", "approved_by":"human" }
```
Response consumed:
```
{ tasks:[…], issueResults:[ {
    task_id,
    issue_number, issue_url,                 // success
    skipped, duplicate_of, duplicate_url, match_ratio,   // duplicate-skip
    error                                    // failure
} ] }
```
The UI renders, per task: a link to the created issue **(`#<issue_number>`)**, OR a "skipped — duplicate of #N" with keyword-overlap %, OR an error.

> **[BACKEND — inferred, key handoff]** On `approved`, the backend creates a **GitHub issue per task**, formatting the body to the **`[Agent Call]` spec** in [`agent-issue-format.md`](agents/agent-issue-format.md):
> - Title: `[Agent Call] <task title>`
> - Body: `Task:` (from `goal_of_task` + feature/sub-feature), `Context:` (from `code_residence` — paths relative to repo root), optional `Type:`/`Priority:`/`NotifyEmail:`.
> - It also does **duplicate detection** (the `skipped`/`match_ratio`/`duplicate_of` fields) by keyword-overlapping against existing issues.
> - Requires `GITHUB_PAT`/`GITHUB_TOKEN` to be configured server-side (UI copy: "if GITHUB_PAT is configured").

**This is the bridge from "meeting" to "autonomous coding agent" — see §7.**

---

### Stage 4 — Report (`ReportStage` + `NoteEditor`)

**Load existing (mount):** uses `detail.latestHtml`/`detail.notes`, else `GET /api/meeting/workflow/notes?meeting_id=<id>` → `{ notes: { raw_notes, edited_notes }, latestHtml }`.

**Generate → `POST /api/meeting/workflow/report`** `{ meeting_id }` → `{ notes, html }`. UI copy: Claude writes concise notes and fills a fixed HTML template **including the full transcript**.

**`NoteEditor`** (the editing surface): HTML-preview tab (sandboxed `<iframe srcDoc>`) + Edit-Notes tab (textarea). **Rebuild → `POST /api/meeting/workflow/updatenotes`**:
```json
{ "meeting_id":"<id>", "edited_notes":"<md>", "edited_by":"human" }
```
Returns `{ html }`, re-renders the preview. This is the only write in Stage 4.

---

## 7. Downstream: how tasks become PRs (the autonomous agent)

Stage 3 approval hands off to a **completely separate backend subsystem** documented in [`claude-github-issues-agent.md`](agents/claude-github-issues-agent.md). The frontend's job ends when the issue is created; everything below is **server-side cron automation**, included here so the end-to-end picture is complete.

```
[Frontend] Stage 3 "Approve All"
      │  POST /meeting/workflow/approve
      ▼
[BACKEND] create one GitHub issue per task, body = [Agent Call] spec
      │  (issue lives in the task's scoped repo)
      ▼
[ISSUE AGENT — separate cron service, NOT this repo]
  Services/Integrations/CronJobs/issueScannerCron.js   ← scans every minute (* * * * *)
      │  gate: title OR body contains [Agent Call]  AND  Task: is non-empty
      ▼
  Services/SysScripts/AgentScripts/issueAgentFlow.js   ← the pipeline
  Services/SysScripts/AgentScripts/issueParser.js      ← parses Task/Context/Type/Priority/NotifyEmail
      │  1. read Context: files (folders read recursively)
      │  2. ask Claude to implement (API mode default, or local CLI mode)
      │     - prompt varies by Type: CodeWriter.md | CodeReviewer.md | CodeSuggester.md
      │  3. commit to a NEW branch
      │  4. open a Pull Request
      │  5. comment on issue: "✅ Committed and PR opened" + summary + PR link
      │  6. close the issue (ISSUE_AGENT_CLOSE_ON_PR=true)
      │  7. email NotifyEmail: (or ISSUE_NOTIFY_EMAIL_FALLBACK) — "PR ready for issue #N"
      ▼
[Human] review the PR
      │  want changes? reopen issue, comment:  !discuss <instructions>
      ▼
  agent re-runs Claude, FORCE-PUSHES same branch, updates same PR, emails "PR updated"
      │  (repeat !discuss as many times as needed)
      ▼
[Human] merge when satisfied
```

Key gating / safety facts (for debugging "why didn't my issue get picked up"):
- **Hard gate:** the issue is ignored unless `[Agent Call]` appears in title **or** body **and** `Task:` is non-empty. If Stage 3's backend doesn't emit a correct `[Agent Call]` body, the agent silently skips it.
- **Repo filter:** `ISSUE_AGENT_ENABLED_REPOS` (comma-separated) limits which repos are scanned; empty = all tracked repos.
- **Context-size guard:** if `Context:` files exceed `ISSUE_AGENT_MAX_CONTEXT_CHARS` (120k) / prompt exceeds `ISSUE_AGENT_MAX_PROMPT_CHARS_GATE` (180k), the agent posts `⚠️ Context too large` and pauses until you shrink `Context:` and post `!continue`.
- **No proposal/approval step in the agent** — it commits immediately on first scan. The human approval gate is the Stage 3 "Approve All" in *this* UI; once the issue exists, the agent acts autonomously.
- **Claude backend:** `CLAUDE_BACKEND=api` (default, needs `CLAUDE_API_KEY`) or `cli` (runs local `claude` per repo `cwd`).
- **Emails** only sent if `EMAIL_USER` is set.

---

## 8. Complete API endpoint index

Every backend endpoint the frontend touches, grouped. All are under `${API_BASE_URL}/api`.

### Meeting workflow (the feature)
| Method | Endpoint | Caller | Body / Query |
|---|---|---|---|
| GET | `/meeting/workflow/list` | MeetingList | — |
| GET | `/meeting/workflow/meeting?meeting_id=` | WorkflowPanel (detail) | query |
| POST | `/meeting/workflow/create` | CreateMeeting | title, scheduled_at, participants, created_by, agenda, scope_repo_ids, scope_feature_ids |
| POST | `/meeting/workflow/premeeting` | Stage 0 | meeting_id |
| GET | `/meeting/workflow/context-files?meeting_id=` | Stage 0 | query |
| POST | `/meeting/workflow/context-files` | Stage 0 | multipart: meeting_id, files[] |
| POST | `/meeting/workflow/context-files/delete` | Stage 0 | file_id, meeting_id |
| POST | `/meeting/workflow/transcribe` | Stage 1 | multipart: audio, meeting_id, segment_index |
| POST | `/meeting/workflow/analyze-live` | Stage 1 | meeting_id, meeting_notes, timed_notes, total_duration_sec |
| POST | `/meeting/workflow/analyze` | Stage 2 | meeting_id |
| POST | `/meeting/workflow/clarify` | Stage 2 | meeting_id |
| POST | `/meeting/workflow/clarify/revise` | Stage 2 | meeting_id, answered_questions[] |
| GET | `/meeting/workflow/tasks?meeting_id=` | Stage 3 | query |
| POST | `/meeting/workflow/tasks` | Stage 3 | meeting_id (generate) |
| POST | `/meeting/workflow/tasks/add` | Stage 3 | meeting_id + task fields |
| POST | `/meeting/workflow/tasks/update` | Stage 3 | task_id, meeting_id, \<field\> |
| POST | `/meeting/workflow/tasks/delete` | Stage 3 | task_id, meeting_id |
| POST | `/meeting/workflow/approve` | Stage 3 | meeting_id, decision, approved_by → **creates GitHub issues** |
| GET | `/meeting/workflow/notes?meeting_id=` | Stage 4 | query |
| POST | `/meeting/workflow/report` | Stage 4 | meeting_id |
| POST | `/meeting/workflow/updatenotes` | Stage 4 (NoteEditor) | meeting_id, edited_notes, edited_by |

### Shared lookups (used by CreateMeeting)
| Method | Endpoint | Reads |
|---|---|---|
| GET | `/tracked/repos/list?version=1` | repos[] |
| GET | `/tracked/repos/features/list?version=1` | features[] |
| GET | `/portal/users/list?version=1` | users[] |

---

## 9. End-to-end happy path (one line per step)

1. User opens `/tools/meetingWorkflow`, passes Google + `@granjur.com` gate.
2. **Create:** picks repos/features/participants → `POST /create` → meeting row at `current_stage=0`.
3. **Stage 0 Pre-Meeting:** (optionally upload context files) → `POST /premeeting` → brief on what exists.
4. **Stage 1 Transcribe:** record mic → per-minute `POST /transcribe` (Whisper) → `POST /analyze-live` → live summary + clarifications.
5. **Stage 2 Analyze:** `POST /analyze` on persisted transcript → projects/platforms/decisions/action items; optional `clarify` → `clarify/revise`.
6. **Stage 3 Tasks:** `POST /tasks` generates tasks → edit/add/delete → **Approve** → `POST /approve` → **one GitHub `[Agent Call]` issue per task** (with duplicate-skip).
7. **[Agent, off-platform]** cron scanner picks up each `[Agent Call]` issue → Claude implements → new branch → **PR opened** → issue closed → notify email.
8. **Human** reviews PR; `!discuss` to revise (same branch/PR); merge when done.
9. **Stage 4 Report:** `POST /report` → markdown + HTML report (incl. full transcript) → edit notes → `POST /updatenotes` rebuilds HTML.

---

## 10. Things most likely to bite you while debugging

- **Response envelope:** if a stage shows blank data, confirm the backend wrapped it in `{ payload: { return: … } }` — the helpers unwrap exactly that path.
- **`/analyze` vs `/analyze-live`:** Stage 1 and Stage 2 use different endpoints and slightly different result shapes (`clarificationQuestions` vs `clarify` endpoint; `featuresIdentified` vs `projectsDiscussed/platformsDiscussed`). Don't assume one populates the other.
- **Transcript persistence:** Stage 1 transcribes segment-by-segment client-side, but Stage 2/4 read a single persisted `transcript`. If `/analyze` says "no transcript," the backend never accumulated/saved segments from `/transcribe`.
- **Stage gating is cosmetic:** `StageNav` lets you jump to any stage; the backend, not the UI, enforces prerequisites. A stage can be opened before its inputs exist.
- **GitHub issue creation is silent-fail-prone:** needs `GITHUB_PAT` server-side; check `issueResults[].error` and the `skipped`/duplicate fields in the `/approve` response.
- **Agent pickup gate:** the created issue body **must** contain `[Agent Call]` + non-empty `Task:`, and the repo must be in `ISSUE_AGENT_ENABLED_REPOS` (or that var unset), or the cron agent ignores it entirely.
- **`mwDelete` is a POST.** Don't look for a DELETE verb in network logs.
- **Detail re-fetch on `onDone`:** after each stage completes, the panel re-GETs `/meeting`. If that fetch fails, the next stage may render stale `detail`.

---

*Generated as a debugging reference. Frontend facts are verified against the source in `src/`; backend behavior marked **[BACKEND]** is inferred from request/response shapes and the agent docs in `docs/agents/` — verify against the actual server when chasing a backend bug.*
