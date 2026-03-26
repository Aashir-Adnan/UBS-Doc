## Claude GitHub Issues Agent (GitHub Issues → PR workflow)

This project includes an automated “GitHub Issues → Claude → Pull Request” workflow driven by a cron job:

- **Scanner**: `Services/Integrations/CronJobs/issueScannerCron.js`
- **Pipeline**: `Services/SysScripts/AgentScripts/issueProcessor.js`
- **Parsing**: `Services/SysScripts/AgentScripts/issueParser.js`

It is designed to **only act on issues explicitly marked** with **`[Agent Call]`**, so normal issues in your repos are ignored.

---

## Workflow (what actually happens)

The real implemented workflow is:

1. **Issue created** (must be open, not a PR).
2. **Cron scans every 5 minutes** across configured repos.
3. If the issue is tagged **`[Agent Call]`** and the body contains a valid **`Task:`** block, the agent posts an initial comment:
   - **“🤖 Explanation of changes”**: Claude proposes what to change and which files to edit.
4. **User reviews** that proposal.
5. **User replies with one of:**
   - **`!discuss`** (optionally with more detail): Claude posts a **follow-up proposal** (“🤖 Follow-up (discussion)”).
   - **`!commit`**: Claude generates a **branch name + full file contents**, then the agent **creates/updates files on a new branch** and **opens a pull request**.
6. User can iterate with more `!discuss` comments and then `!commit` when ready.

This matches the intended workflow you described:

> Issue created → Claude proposes changes → user reviews → user adds context/prompt → Claude adjusts proposed changes → user may approve or add more → Claude creates a new branch and creates a pull request

Where “approve” is implemented as posting **`!commit`**.

---

## Same machine as the server: API vs local Claude CLI

**You do not need one open terminal per project.** The server already runs the same back-and-forth flow (`!discuss` / `!commit`) by calling Node’s `child_process` (`spawn` / `exec`–equivalent). Setting **`cwd`** to each cloned repo’s path is the same as manually **`cd`**-ing there before running a command.

Two ways to run “Claude” from that process:

| Mode | Env | What it does |
|------|-----|----------------|
| **API** (default) | `CLAUDE_BACKEND=api` or unset | Runs `callClaudeStdio.js`, which calls the **Anthropic HTTP API**. Needs **`CLAUDE_API_KEY`** (or `ANTHROPIC_API_KEY`) in `.env`. |
| **Local CLI** | `CLAUDE_BACKEND=cli` | Runs your installed **`claude`** CLI (or `CLAUDE_CLI`) **inside each repo directory** (`Repos/<name>/...`). Uses whatever login/config the CLI already has on that machine—**no API key in `.env`** required if the CLI is authenticated. |

For **CLI** mode, the process still **embeds** task + file contents in the prompt (same as API mode). The benefit of `cwd` is that tools that read **project files**, **`.claude` config**, or **repo-relative paths** see the correct root.

Customize the CLI invocation if your binary uses different flags than `-p <prompt>`:

- **`CLAUDE_CLI`** – executable (default `claude`), e.g. full path on Windows.
- **`CLAUDE_CLI_ARGS_JSON`** – JSON array; use `"__PROMPT__"` or `"__FILE__"` as placeholders for the prompt text or temp file path (long prompts are written to a temp file automatically).
- **`CLAUDE_CLI_USE_STDIN=true`** – send the combined prompt on **stdin** instead of `-p` (set `CLAUDE_CLI_ARGS_JSON` to the flags you need, e.g. `[]`).
- **`CLAUDE_CLI_SHELL=true`** – run via shell on Windows if `.cmd` wrappers require it.

**Environment file:** variables are loaded from the **project root** `.env` (next to `package.json`), then `Src/Bootstrap/.env`. Restart the server after changes.

---

## Issue gating: `[Agent Call]` is required

The scanner **only processes** an issue if **either** its title or body contains:

- **`[Agent Call]`** (case-insensitive)

If an issue is missing this tag, it will be ignored even if it contains `Task:` / `Context:` fields.

---

## Required issue format (Task/Context/Priority)

After `[Agent Call]`, the issue body must include a **multi-line header style** field block.

### Minimal working example

```text
[Agent Call]

Task:
Fix the login redirect loop when the token is expired.

Context:
Src/Middlewares/TokenValidation/
```

### Supported fields

From `issueParser.js`:

- **`Task:`** (required)
- **`Context:`** (optional but recommended)
  - A **single path** (file or folder) relative to the cloned repo root; folders are read recursively.
  - Or **multiple paths**: use a JSON-style array (e.g. `[ 'path/a.js', 'path/b.js' ]`) or comma-separated list. Each path is read and combined for Claude.
- **`Type:`** (optional): `Code Reviewer` | `Code Writer` | `Code Suggester` (default `Code Writer`). Chooses which task-type prompt (see below) is sent to Claude.
- **`Priority:`** (optional): `Immediate | High | Normal | Low | Minimal` (default `Normal`)
- **`NotifyEmail:`** (optional): used for timeout reminder emails

Notes:

- The parser expects the *key* to be on its own line (example: `Task:`), and the value on subsequent lines until the next `Key:` line.
- If `Task:` is missing/empty, the issue is not processed.

---

## What Claude posts (proposal stage)

On the first pass (when the agent has not yet posted an “Explanation of changes” comment), it will:

- Read the files/folder referenced by `Context:`
- Ask Claude for:
  - a clear explanation
  - a list of files to change + what to change
- Post a comment with:
  - **“🤖 Explanation of changes”**
  - instructions to reply with `!discuss` or `!commit`

After posting, the issue is added to a local pending-reply tracker (see “Timeout emails” below).

---

## Task-type prompts (Code Reviewer / Code Writer / Code Suggester)

The pipeline can send different **system instructions** to Claude based on the issue’s **`Type:`** field. Prompt text is loaded from:

- `Services/SysScripts/AgentScripts/prompts/CodeReviewer.md` — **Code Reviewer**: verify integrity, syntax, and logical flow with respect to the repo.
- `Services/SysScripts/AgentScripts/prompts/CodeWriter.md` — **Code Writer**: technical, syntax-correct, concrete edits (default).
- `Services/SysScripts/AgentScripts/prompts/CodeSuggester.md` — **Code Suggester**: higher-level repository context with technical details mixed in.

If `Type:` is omitted, **Code Writer** is used. You can edit these `.md` files to change how Claude behaves for each task type.

---

## Discussion loop (`!discuss`)

If the user replies with one or more comments that start with:

- `!discuss`

…the agent will compile the discussion after the last bot comment and ask Claude to update the proposal, then post:

- **“🤖 Follow-up (discussion)”**

This is the “user adds context or prompt → Claude adjusts proposed changes” loop.

---

## Implementation stage (`!commit` → branch + PR)

When the **latest** issue comment starts with:

- `!commit`

…the agent will:

1. Ask Claude to return a **single JSON object** containing:
   - branch name
   - PR title/body
   - an array of files with full contents
2. Create a branch off the configured base branch.
3. Create/update each file in the JSON using GitHub’s “createOrUpdateFileContents” API.
4. Open a pull request.
5. Post a comment:
   - **“✅ Committed and PR opened”**
   - branch name and PR URL

### Base branch selection

The base branch comes from the tracked repo configuration:

- `repoSpec.branch` if present
- otherwise `main`

### Important behavior: branch overwrite

If a branch with the same name already exists, the implementation currently deletes it and recreates it:

- `issueProcessor.createBranchAndPR()` tries `getRef` then `deleteRef` (best-effort), then `createRef`.

If you want “never delete existing branches”, that would be a follow-up change.

---

## Cron schedule and scanning behavior

`IssueScannerCron.start()` schedules:

- **Scan**: every 5 minutes (`*/5 * * * *`)
- **Pending reply timeout check**: every `PENDING_REPLY_CHECK_MINUTES` (default 5)

For each configured repo, it lists open issues (up to 100 per scan), filters them, sorts by priority, then processes each in order.

---

## Timeout emails (waiting for user reply)

When the agent posts an “Explanation” or “Follow-up”, it records the issue in:

- `WorkflowData/pending_reply_tracker.json` (default)

If the user does not reply with `!discuss` or `!commit` within:

- `PENDING_REPLY_TIMEOUT_MS` (default 15 minutes)

…the cron sends a reminder email (if email is configured).

---

## Configuration (env vars you’ll care about)

### GitHub

- `GITHUB_TOKEN` (or `GH_TOKEN` / `GIT_PERSONAL_ACCESS_TOKEN`): required to read issues, post comments, and open PRs
- `GITHUB_BOT_LOGIN`: used to detect bot comments (defaults to `github-actions[bot]`)

### Claude

- **`CLAUDE_BACKEND`**: `api` (default) or `cli` — see [Same machine as the server](#same-machine-as-the-server-api-vs-local-claude-cli).
- **API mode:** `CLAUDE_API_KEY` (or `ANTHROPIC_API_KEY`), optional `CLAUDE_API_KEY_FILE` / `ANTHROPIC_API_KEY_FILE`
- **`CLAUDE_MODEL`**: optional (default in code: `claude-3-5-sonnet-20241022`)
- **`CLAUDE_BASE_URL` / `CLAUDE_API_URL`**: optional (defaults to `https://api.anthropic.com`)
- **CLI mode:** `CLAUDE_CLI`, `CLAUDE_CLI_ARGS_JSON`, `CLAUDE_CLI_USE_STDIN`, `CLAUDE_CLI_SHELL` (see section above)

### Repo cloning

- `REPOS_CLONE_BASE_DIR`: where repos are cloned/pulled (default: `./Repos`)

### Pending reply reminders

- `PENDING_REPLY_TIMEOUT_MS`: how long before reminder email (default 15 minutes)
- `PENDING_REPLY_CHECK_MINUTES`: how often to check for expired items (default 5)
- `PENDING_REPLY_TRACKER_PATH`: custom path for the tracker JSON (default `WorkflowData/pending_reply_tracker.json`)
- `ISSUE_NOTIFY_EMAIL_FALLBACK`: email address if `NotifyEmail:` isn’t set in the issue
- `EMAIL_USER`: if not set, email reminders are skipped

---

## Operational checklist

1. Ensure repo(s) are in the tracked projects list (and cloned/pulled).
2. Set `GITHUB_TOKEN` with repo permissions:
   - read issues, write comments
   - create branches, create/update files, open PRs
3. Set **`CLAUDE_API_KEY`** (API mode), **or** set **`CLAUDE_BACKEND=cli`** and ensure the **`claude`** CLI works in that environment (logged in as on your dev machine).
4. Create a GitHub issue in a tracked repo with:
   - `[Agent Call]`
   - `Task:` (required)
   - `Context:` (recommended)
5. Wait for the bot “Explanation of changes” comment.
6. Use `!discuss` to refine; use `!commit` to generate a PR.

---

## Limitations and expectations

- The proposal stage is **advisory** (text only). Code changes are only pushed when you post `!commit`.
- The implementation stage uses **full-file contents** per file in Claude’s JSON output. It does not apply diffs.
- The scanner reads context only from the path in `Context:`. If you want broader context, set `Context:` to a folder (or add more specifics via `!discuss`).

