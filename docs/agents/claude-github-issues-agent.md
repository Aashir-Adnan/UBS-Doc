## Claude GitHub Issues Agent (GitHub Issues → PR workflow)

This project includes an automated “GitHub Issues → Claude → Pull Request” workflow driven by a cron job:

- **Scanner**: `Services/Integrations/CronJobs/issueScannerCron.js`
- **Pipeline**: `Services/SysScripts/AgentScripts/issueAgentFlow.js`
- **Parsing**: `Services/SysScripts/AgentScripts/issueParser.js`

It is designed to **only act on issues explicitly marked** with **`[Agent Call]`**, so normal issues in your repos are ignored.

---

## Workflow

1. **Create an issue** tagged `[Agent Call]` with a `Task:` field (and optionally `Context:` and `NotifyEmail:`).
2. **Cron scans every minute.** On the first pass the agent immediately:
   - Reads the context files.
   - Asks Claude to implement the task.
   - Commits the changes to a new branch and **opens a pull request**.
   - Posts a comment on the issue: `✅ **Committed and PR opened**` with a one-sentence summary and the PR link.
   - Closes the issue.
   - **Sends a notification email** to `NotifyEmail:` (or `ISSUE_NOTIFY_EMAIL_FALLBACK`) telling the author the PR is ready.
3. **Review the PR.** If you want changes:
   - Reopen the issue.
   - Reply with `!discuss <what to change>` — the agent force-pushes to the same branch and updates the existing PR.
   - Another notification email is sent.
4. **Merge when satisfied.**

There is no proposal/approval step — the agent goes straight to code.

---

## Same machine as the server: API vs local Claude CLI

**You do not need one open terminal per project.** The server calls Claude via Node’s `child_process`. Setting **`cwd`** to each cloned repo’s path is the same as manually `cd`-ing there.

| Mode | Env | What it does |
|------|-----|----------------|
| **API** (default) | `CLAUDE_BACKEND=api` or unset | Calls the **Anthropic HTTP API**. Needs `CLAUDE_API_KEY` (or `ANTHROPIC_API_KEY`). |
| **Local CLI** | `CLAUDE_BACKEND=cli` | Runs your installed `claude` CLI inside each repo directory. No API key needed if the CLI is already authenticated. |

Customize the CLI invocation:

- **`CLAUDE_CLI`** – executable path (default `claude`).
- **`CLAUDE_CLI_ARGS_JSON`** – JSON array; use `”__PROMPT__”` or `”__FILE__”` as placeholders.
- **`CLAUDE_CLI_USE_STDIN=true`** – send prompt on stdin instead of `-p`.
- **`CLAUDE_CLI_SHELL=true`** – run via shell on Windows if `.cmd` wrappers require it.

**Environment file:** variables are loaded from the project root `.env`. Restart the server after changes.

---

## Issue gating: `[Agent Call]` is required

The scanner **only processes** an issue if **either** its title or body contains `[Agent Call]` (case-insensitive) and the body has a non-empty `Task:` field. All other issues are ignored.

---

## Issue format

```text
[Agent Call]

Task:
Fix the login redirect loop when the token is expired.

Context:
Src/Middlewares/TokenValidation/

NotifyEmail:
you@example.com
```

### Supported fields

- **`Task:`** (required) — what to implement.
- **`Context:`** (optional) — file or folder path(s) relative to repo root. Folders are read recursively. Multiple paths: comma-separated or array syntax.
- **`Type:`** (optional) — `Code Writer` (default) | `Code Reviewer` | `Code Suggester`.
- **`Priority:`** (optional) — `Immediate` | `High` | `Normal` (default) | `Low` | `Minimal`.
- **`NotifyEmail:`** (optional) — receives the PR-ready and PR-updated emails.

---

## Refining the PR with `!discuss`

After the initial PR is opened, if you want the agent to revise it:

1. Reopen the issue on GitHub.
2. Post a comment starting with `!discuss`, followed by your instructions:

```
!discuss please also add error handling for when the DB is unreachable
```

The agent will re-run Claude with your instruction as additional context, **force-push** to the same branch, and **update the existing PR**. Another notification email is sent.

You can do this as many times as needed. Each `!discuss` updates the same PR rather than creating a new one.

---

## Task-type prompts

The pipeline sends different system instructions to Claude based on `Type:`:

- `CodeWriter.md` — technical, syntax-correct, concrete edits (default).
- `CodeReviewer.md` — verify integrity, syntax, and logical flow.
- `CodeSuggester.md` — higher-level context with technical details.

Files live in `Services/SysScripts/AgentScripts/prompts/`. Edit them to change Claude’s behaviour per type.

---

## Notification emails

Emails are sent to `NotifyEmail:` (or `ISSUE_NOTIFY_EMAIL_FALLBACK`) in two situations:

| Event | Subject |
|---|---|
| Initial PR created | `PR ready for issue #N in owner/repo` |
| PR updated via `!discuss` | `PR updated for issue #N in owner/repo` |

Email sending requires `EMAIL_USER` to be set. If it is not set, emails are silently skipped.

---

## Context size limits

If the context files are too large for a single prompt, the agent posts a `⚠️ **Context too large**` comment and pauses. To resume:

1. Edit the issue to reduce the `Context:` paths.
2. Post `!continue`.

---

## Cron schedule and scanning behavior

`IssueScannerCron.start()` schedules:

- **Scan**: every minute (`* * * * *`).
- **Pending reply timeout check**: every `PENDING_REPLY_CHECK_MINUTES` (default 5).

Repos to scan are filtered by `ISSUE_AGENT_ENABLED_REPOS` (comma-separated repo names). If unset, all tracked repos are scanned.

---

## Configuration (env vars)

### GitHub

- `GITHUB_TOKEN` (or `GH_TOKEN` / `GIT_PERSONAL_ACCESS_TOKEN`) — required.
- `GITHUB_BOT_LOGIN` — bot comment detection (default `github-actions[bot]`).

### Claude

- `CLAUDE_BACKEND` — `api` (default) or `cli`.
- `CLAUDE_API_KEY` / `ANTHROPIC_API_KEY` — API mode.
- `CLAUDE_MODEL` — optional model override.
- `CLAUDE_CLI`, `CLAUDE_CLI_ARGS_JSON`, `CLAUDE_CLI_USE_STDIN`, `CLAUDE_CLI_SHELL` — CLI mode.

### Repos

- `REPOS_CLONE_BASE_DIR` — where repos are cloned (default `./Repos`).
- `ISSUE_AGENT_ENABLED_REPOS` — comma-separated repo names to scan. Empty = all.

### Email

- `EMAIL_USER` — if not set, no emails are sent.
- `ISSUE_NOTIFY_EMAIL_FALLBACK` — fallback email if `NotifyEmail:` isn’t in the issue.

### Context limits

- `ISSUE_AGENT_MAX_CONTEXT_CHARS` — max context chars before blocking (default 120 000).
- `ISSUE_AGENT_MAX_PROMPT_CHARS_GATE` — max prompt chars before blocking (default 180 000).

### PR behaviour

- `ISSUE_AGENT_CLOSE_ON_PR` — close the issue after opening a PR (default `true`).

---

## Operational checklist

1. Ensure repo(s) are in the tracked projects list (`tracked_projects` DB table) and have been cloned/pulled.
2. Set `GITHUB_TOKEN` with repo read/write, comment, branch, and PR permissions.
3. Set `CLAUDE_API_KEY` (API mode) **or** set `CLAUDE_BACKEND=cli` with the CLI authenticated.
4. Optionally set `EMAIL_USER` and `ISSUE_NOTIFY_EMAIL_FALLBACK` for PR notifications.
5. Create a GitHub issue with `[Agent Call]` and a `Task:` field.
6. Wait for the `✅ Committed and PR opened` comment and the notification email.
7. To refine: reopen the issue, post `!discuss <instructions>`.

