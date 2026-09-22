---
title: "Deployment, Restart and Crash Alert Emails"
sidebar_position: 1
---

# Deployment, Restart and Crash Alert Emails

The HMS backend emails the operators when it is **deployed**, when it **starts or restarts**, and when it **crashes**. The recipients come from the environment, and there can be one or several.

:::note
Backend branch: `backend/feature/deployment-alert-emails` (forked from `staging`). Code: `Src/Bootstrap/lifecycleAlerts.js`, wired in `Src/server.js`. Tests: `Services/SysScripts/TestScripts/lifecycleAlerts.test.js`. The in-repo design record is `backend/docs/deployment-and-crash-alert-emails.md`.
:::

---

## Why it exists

Before this feature the server sent no signal at all about its own lifecycle:

- `start()` ended with `app.listen(...)` and one log line.
- A startup failure was `console.error(err)` + `process.exit(1)`, written to a log nobody watched.
- There were **no** `uncaughtException` / `unhandledRejection` handlers. A crash killed the process silently, and PM2 restarted it just as silently.

Nobody found out that a deployment had happened, that it had failed, or that the service had died and come back.

---

## What gets sent

| Event | When | Subject |
|---|---|---|
| **Deployment** | A boot where the git `HEAD` differs from the commit recorded at the previous boot | `[env] Deployed: instance @ shortsha` |
| **Start / restart** | A boot where the commit is unchanged, or no earlier boot is recorded | `[env] Started: instance @ shortsha` |
| **Crash** | `uncaughtException`, `unhandledRejection`, or an error thrown during startup | `[env] CRASH: instance — source` |

Every email includes:

- **Runtime facts:** instance label, environment, host, PID, port, Node version, timestamp.
- **Release facts** (from git): branch, short commit, commit subject, author, commit date, and whether the working tree is dirty.

:::info Which branch is shown
The dev server keeps a local branch called `main` and deploys with `git reset --hard origin/dev`, so the local branch name is misleading there. Alerts therefore show, in this order:

1. The local branch's upstream, if it points at the running commit.
2. The local branch name, if a remote branch with the same name points at the running commit.
3. Otherwise, the remote branches that point at the running commit (`origin/dev` → `dev`).
4. The local name, if no remote branch points at the running commit.
:::

On top of that:

- A **deployment** email lists the commits between the previous boot and this one (up to 20).
- A **crash** email includes the error message, where it came from, the uptime, and the stack trace (cut to 4 KB).

All values are HTML-escaped before rendering, because an error message can contain text an attacker controls.

```
Event             Deployment
Instance          hms-api-1
Environment       staging
Branch            staging
Commit            d4b9900d
Commit subject    Drop consoles
Previous commit   197483ed
Previous run      started 2026-09-16T06:50:12Z, pid 4820, did NOT shut down cleanly

Commits since the previous boot
  d4b9900 Drop consoles
  5622377 Merge branch 'dev' into staging
```

---

## How it works

### Wiring in `server.js`

```js
require("./Bootstrap/env");
const { installCrashHandlers, notifyServerStarted, notifyStartupFailure } =
  require("./Bootstrap/lifecycleAlerts");
installCrashHandlers();          // before the app is loaded

const app = require("./app");
// ...
app.listen(PORT, () => {
  notifyServerStarted({ port: PORT });
});
// ...
} catch (err) {
  await notifyStartupFailure(err);
}
```

The crash handlers are installed **before** `require("./app")`. This matters for errors thrown while modules load (a `SyntaxError` in any file, for example): if the handlers were installed later, those errors would kill the process before any handler existed, and no email would go out. Crashes during migrations are covered for the same reason.

### Detecting a deployment

Each boot writes `WorkflowData/deployment_state.json` with the current commit. The next boot compares that commit with its own `HEAD`:

- no state file → **first boot**
- same commit → **restart**
- different commit → **deployment**, with `git log previous..current` added to the email

If git isn't available, the boot counts as a restart instead of failing.

The state file is in `.gitignore`. It is never committed or merged, so each server keeps its own copy, and one environment's data can't reach another through a merge.

### Clean-exit marker

- A boot writes `cleanExit: false`.
- `SIGTERM`, `SIGINT` and `SIGUSR2` write `cleanExit: true` before the process exits.

If a process is killed with `SIGKILL`, killed for running out of memory, or the host reboots, it can't send an email. The next boot then finds `cleanExit: false` and says **"did NOT shut down cleanly"** in its start email. So every abnormal exit is reported, either by the process that died or by the one that replaced it.

### Throttling

A crash loop restarts the process every few seconds. To keep that from flooding the inbox, a second alert of the same kind within `OPS_ALERT_THROTTLE_SECONDS` (default 300) is suppressed. The timestamps are kept in the state file.

- **Deployments are never throttled.**
- **Crash and start are throttled separately**, so a crash straight after a throttled restart still sends an email.

Throttling only limits emails. It does **not** restart the server; restarts are PM2's job (or nodemon's, locally).

### Never hanging a dying process

A crash email is raced against `OPS_ALERT_SEND_TIMEOUT_MS` (default 8 s). If SMTP doesn't answer in time, the process exits anyway. A missed email is better than a process that won't die.

### What it does to git

The feature **only reads from git**. It never commits, resets, checks out, fetches, pulls or pushes, so it can't change a server's branch, commits or working tree.

| Command | Used for |
|---|---|
| `git rev-parse HEAD` | The running commit |
| `git rev-parse --abbrev-ref HEAD` | The local branch name |
| `git rev-parse --abbrev-ref --symbolic-full-name @{upstream}` | The local branch's upstream (e.g. `origin/dev`) |
| `git branch -r --points-at HEAD` | Remote branches at the running commit (list only) |
| `git log -1 --pretty=…` | The commit subject, author and date |
| `git status --porcelain` | Whether the working tree has uncommitted changes |
| `git log <previous>..<current>` | The commits since the last boot |

- Commands run through `execFileSync("git", [...])` with **no shell**, so nothing in them can be run as a shell command.
- Each call has a 5-second timeout. Any failure returns nothing instead of throwing, so a git problem can't crash the server.
- `git status` may refresh git's internal file-timestamp cache (`.git/index`), as git does routinely. Staged and committed content is unaffected.

The only file the feature writes is `WorkflowData/deployment_state.json`. It is in `.gitignore` and in nodemon's ignore list.

:::note Hardening
The previous commit for `git log <previous>..<current>` is read from the state file. Only the app writes that file, but checking that the stored value is a 40-character commit hash before using it would stop a hand-edited value starting with `--` from being read as a git option.
:::

---

## Options considered

| Question | Chosen | Rejected, and why |
|---|---|---|
| How to detect a deployment | **Compare `HEAD` with the commit recorded at the last boot.** It needs no pipeline changes, works for manual deployments, and gives the commit range. | *Every start is a deployment:* a crash loop would send a "deployment" email every few seconds. *A `BUILD_ID` from CI:* useless until every pipeline passes it. |
| Where to store the previous commit | **A JSON file in `WorkflowData/`.** It has no dependencies and survives restarts. | *A database table:* the crash email must work when the database is what's broken. *An env var from the deploy script:* depends on the pipeline again. |
| How to send | **The existing `handleSendEmail`:** same transport, template and `email_log`. All recipients go in one message. | A second mail transport: one more thing to configure and one more thing to break. |
| Email on graceful shutdown? | **No.** A normal deployment would send twice as many emails. The marker is still written. | — |

---

## Configuration

```bash
OPS_ALERT_EMAILS=ops@example.com,dev@example.com   # comma-separated recipients
OPS_ALERT_ENABLED=true                             # false stops sending but keeps the recipients
APP_INSTANCE_NAME=hms-api-1                        # defaults to the hostname
OPS_ALERT_THROTTLE_SECONDS=300                     # 0 turns throttling off
OPS_ALERT_SEND_TIMEOUT_MS=8000
DEPLOYMENT_STATE_PATH=WorkflowData/deployment_state.json
```

- If `OPS_ALERT_EMAILS` is unset or empty, alerts go to a **built-in fallback list** in `lifecycleAlerts.js`. To stop sending, use `OPS_ALERT_ENABLED=false`.
- Malformed addresses are dropped with a warning, the rest are still used, and duplicates are collapsed.
- Alerts use the shared mail transport, so `EMAIL_USER` / `EMAIL_PASS` must be set. [Startup Environment Validation](../startup-env-validation/startup-env-validation.md) makes that pair a hard requirement at startup.
- **Local development:** `nodemon.json` ignores `WorkflowData/deployment_state.json`. Otherwise every boot writes the file, nodemon sees the change, and it restarts in an endless loop.

:::tip Environment label
`NODE_ENV` is left unset on the live servers, so subjects currently read `[unset]`. The planned `DEPLOY_ENVIRONMENT` variable (see below) fixes this.
:::

---

## Environments

| Environment | Runs on | Deploys via | Works as-is? |
|---|---|---|---|
| Development | GCP VM, PM2 | `.github/workflows/dev-gcp-server.yml` | Yes |
| Production | Azure VM, PM2 | `backend/.github/workflows/main.yml` | Yes |
| Preproduction | **Cloud Run** (Docker image) | `.github/workflows/staging-gcp-deploy-backend.yml` | **No — needs the changes below** |

---

## Preproduction (Cloud Run): required changes

:::warning Not yet implemented
This section describes changes that are planned but not made yet.
:::

### Why preproduction is different

| The design assumes | On Cloud Run | Effect today |
|---|---|---|
| A `.git` directory next to the code | The image is built from `backend/` with `COPY . .` and has no `.git`. | No commit in any email, and no deployment is ever detected. |
| The state file survives restarts | The container disk is wiped on every start, scale-out and redeploy. | **Every container start sends a "first boot" email.** The throttle resets with the file, so it can't help. |
| One long-lived process | Instances start and stop with traffic and scale to zero. | "Started" emails track traffic, not releases. |

**Main reason for the changes:** without them, preproduction sends an email on every cold start. The missing commit history is secondary.

### What each file needs

**1. `backend/Dockerfile`: write the release into the image.**

```dockerfile
ARG RELEASE_SHA=""
ARG RELEASE_BRANCH=""
ARG RELEASE_SUBJECT=""
ENV RELEASE_SHA=$RELEASE_SHA RELEASE_BRANCH=$RELEASE_BRANCH RELEASE_SUBJECT=$RELEASE_SUBJECT
```

The image has no git history, so the build has to give the container its commit. This has no effect on the VMs.

**2. `Src/Bootstrap/lifecycleAlerts.js`: three small changes.**

1. `describeRelease()` falls back to `RELEASE_*` when git isn't available, so crash emails show the commit.
2. `notifyServerStarted()` still records the boot facts, but returns without sending an email or touching the state file when `process.env.K_SERVICE` is set. Cloud Run sets that variable itself, and the VMs never have it, so the check needs no configuration.
3. `environment: process.env.DEPLOY_ENVIRONMENT || process.env.NODE_ENV || "unknown"` gives each environment a real label without touching `NODE_ENV`.

Crash handling doesn't change. On Cloud Run the crash throttle just lasts per container.

**3. New `Services/SysScripts/ServerScripts/notifyDeployment.js`: the deployment email, sent from CI.**

- **What it does:** sends the "Deployed" email, with the commit range, through `handleSendEmail`.
- **Inputs:** `OPS_ALERT_EMAILS`, `EMAIL_USER`, `EMAIL_PASS`, `DEPLOY_ENVIRONMENT`, `RELEASE_SHA`, `PREVIOUS_SHA`, `SERVICE_NAME`, `REVISION`, `COMMITS`.
- **Always exits 0,** so a failed email never fails a deployment.
- **Why CI:** the pipeline is the only place that knows both the previous and the new revision, and it runs exactly once per release.

**4. `.github/workflows/staging-gcp-deploy-backend.yml`: pass the release in and send the email.**

```yaml
- uses: actions/checkout@v4
  with:
    fetch-depth: 0

- name: Record currently deployed commit
  run: |
    PREV_IMAGE=$(gcloud run services describe "${{ vars.PREPROD_CLOUD_RUN_SERVICE }}" \
      --region="${{ vars.GCP_REGION }}" --project="${{ vars.GCP_PROJECT_ID }}" \
      --format='value(spec.template.spec.containers[0].image)' || true)
    echo "PREVIOUS_SHA=${PREV_IMAGE##*:}" >> "$GITHUB_ENV"

# in "Build and push immutable image":
docker build \
  --build-arg RELEASE_SHA="$GITHUB_SHA" \
  --build-arg RELEASE_BRANCH="$GITHUB_REF_NAME" \
  --build-arg RELEASE_SUBJECT="$(git log -1 --pretty=%s)" \
  -t "$IMAGE" .

# after "Deploy Cloud Run revision":
- uses: actions/setup-node@v4
  with: { node-version: 20 }

- name: Email deployment notice
  if: success()
  working-directory: backend
  env:
    OPS_ALERT_EMAILS: ${{ secrets.OPS_ALERT_EMAILS }}
    EMAIL_USER: ${{ secrets.EMAIL_USER }}
    EMAIL_PASS: ${{ secrets.EMAIL_PASS }}
    DEPLOY_ENVIRONMENT: preproduction
    RELEASE_SHA: ${{ github.sha }}
    SERVICE_NAME: ${{ vars.PREPROD_CLOUD_RUN_SERVICE }}
  run: |
    npm ci --omit=dev
    export COMMITS=$(git log --pretty='%h %s' -20 "${PREVIOUS_SHA}..${GITHUB_SHA}" 2>/dev/null || true)
    node Services/SysScripts/ServerScripts/notifyDeployment.js
```

| Step | Why |
|---|---|
| `fetch-depth: 0` | The default checkout has only one commit, so the commit range would be empty. |
| Record the currently deployed commit | Images are tagged with the commit, so the tag of the running image *is* the previous commit. `\|\| true` covers the very first deployment. |
| `--build-arg RELEASE_*` | Passes the commit into the image for change 1. |
| `setup-node` + `npm ci` | The script needs the runtime dependencies (`nodemailer`). |
| Email deployment notice | One email per successful release. |

**5. Settings outside the repository.**

| Where | Setting | Why |
|---|---|---|
| GitHub → Environments → `preproduction` → Secrets | `OPS_ALERT_EMAILS`, `EMAIL_USER`, `EMAIL_PASS` | The CI step can't see the Cloud Run environment variables. |
| Cloud Run service variables | `OPS_ALERT_EMAILS` | Crash emails are sent from inside the container. |
| Cloud Run service variables | `DEPLOY_ENVIRONMENT=preproduction` | The subject label. |
| Cloud Run service variables | `APP_INSTANCE_NAME=hms-preprod` | Otherwise the instance name is a random container hostname. |

**6. Development and production `.env`:** add `DEPLOY_ENVIRONMENT=development` / `DEPLOY_ENVIRONMENT=production`. Nothing else changes on the VMs.

### Rollout in order of value

| Tier | Changes | Result |
|---|---|---|
| 1 — stop the noise | The `K_SERVICE` skip + `OPS_ALERT_EMAILS` on the service | No email on cold starts; crash emails still arrive. **Enough to merge to `staging` safely.** |
| 2 — know what crashed | + Dockerfile args, `RELEASE_*` fallback, the `--build-arg` lines | Crash emails show the commit. |
| 3 — deployment notices | + `notifyDeployment.js`, the rest of the workflow, the GitHub secrets | One "Deployed" email per release, with the commit range. |
| Labels | `DEPLOY_ENVIRONMENT` in all three environments | Subjects name the environment. |

### Still not covered on Cloud Run

- The crash throttle only lasts per container. A crash loop across new containers can send one email per container.
- There is no "did not shut down cleanly" warning, because no disk survives restarts. Use a log-based alert in Cloud Monitoring for OOM kills and forced stops.

### Confirming that preproduction is on Cloud Run

Current evidence: the workflow runs `gcloud run deploy` on pushes to `staging`, and `api-preprod` responses carry `x-cloud-trace-context` and `via: 1.1 google`. To confirm:

- GitHub Actions → *Staging GCP Deploy Backend*: the latest run has a successful *Deploy Cloud Run revision* step.
- `gcloud run services list --project=<GCP_PROJECT_ID>` shows the service.
- Cloud Console → Cloud Run → the service → *Revisions*: the newest revision's image tag is the latest `staging` commit.

---

## Tests

```bash
node --test Services/SysScripts/TestScripts/lifecycleAlerts.test.js
```

The 27 cases cover:

- recipient parsing (trimming, duplicates, malformed entries, the disable switch)
- boot classification (first boot, restart, deployment, git unavailable)
- throttling (window, custom window, disabled, per kind)
- the state file (round trip, corrupt file, clean-exit marker, carrying the previous boot forward)
- release description
- HTML escaping

Four paths were also run end to end against a stubbed mailer: first boot, restart with the same commit, deployment with a commit range, and a crash. A crash from a load-time `SyntaxError` was checked too: the crash email was attempted and the process exited with code 1.

---

## Known limits

- **`SIGKILL` / out-of-memory kills can't report themselves.** The next boot reports them through the clean-exit marker.
- **No email on a graceful shutdown.** It would double every deployment email.
- **Alerts use the product's Gmail transport.** If Gmail is down, no alert goes out.
