# Repositories & Meeting Tool — Tenant Scoping (Frontend)

**Audience:** Dev Tools Portal (Docusaurus) frontend engineer
**Relationship to prior work:** This is an **additive follow-up** to the tenant
project-access feature you already built. It **reuses** the existing
`useActingUrdd` hook and pending-access gate from that work — do **not** recreate
or modify them. This doc only adds repo + meeting-tool wiring.

---

## 1. What this is

Repositories and meetings are now tenant-scoped on the backend, the same way
projects are: a repo belongs to a tenant (via its owner URDD), and a meeting
carries a tenant. Enforcement is **opt-in and server-side** — it activates only
when you send `actionPerformerURDD`. Until you wire that in, everything behaves
exactly as it does today (fully backward-compatible).

Your job: send the acting URDD on the repo + meeting calls, and swap the "all
repos" picker for the tenant-scoped one.

## 2. Reuse, don't rebuild

- **Identity:** the `actionPerformerURDD` you send is the same `urdd_id` you
  already resolve with `useActingUrdd` (from the portal user record). Reuse it.
- **Pending:** if `urdd_id` is null the user is pending — reuse the existing
  pending state and do **not** call the tenant-scoped repo/meeting endpoints.
- **API helper:** reuse the existing helper that unwraps `payload.return` and
  puts `actionPerformerURDD` on the query string for GETs.

Do not touch the project-tenancy pages/components (`MyProjects`, `tenantAdmin`,
etc.) or the hook. This feature lives in its own files.

## 3. New backend endpoints (repos)

All under `/api`, envelope `{ payload: { return: {...} } }`, send
`actionPerformerURDD`.

**List my tenant's repos** — `GET /api/repos/tenant/list`
```json
{ "repos": [
    { "id": 3, "name": "Badar_HMS_Node", "url": "https://…", "branch": "main",
      "tenant_id": 5, "uses_framework_node": 1, "uses_framework_react": 0 }
  ], "total": 1 }
```
- Admin (sees-all) → every repo. Normal user → only their tenant's. No URDD /
  no tenant → `{ "repos": [], "total": 0 }` (fail-closed). Render what returns.

**Can I access this repo?** — `GET /api/repos/tenant/canaccess?actionPerformerURDD=&repo_id=`
```json
{ "repo_id": 3, "allowed": true }
```

## 4. Existing meeting endpoints — now tenant-aware

These are the **same** meeting-workflow endpoints; adding `actionPerformerURDD`
switches on tenant scoping. Send it on all three:

- **List meetings** — `GET /api/meeting/workflow/list` → only the actor's tenant's
  meetings (admins see all). Add `actionPerformerURDD` to the query.
- **Meeting detail** — `GET /api/meeting/workflow/meeting?meeting_id=&actionPerformerURDD=`
  → returns HTTP **403** (`{ statusCode: 403, message: "This meeting is not in your tenant" }`)
  if a non-admin opens a meeting outside their tenant. Handle it like other 403s.
- **Create meeting** — `POST /api/meeting/workflow/create` → include
  `actionPerformerURDD` in the body. The meeting is stamped with the creator's
  tenant, and any `scope_repo_ids` outside that tenant are **silently dropped**.
  Treat the returned meeting's scope repos as the source of truth (if fewer came
  back than you sent, some were cross-tenant and were removed).

**Repo picker in meeting creation:** feed it from `GET /api/repos/tenant/list`
(§3), not the old "all repos" list. That way the user can only pick repos they're
allowed to, and the backend enforces it anyway.

## 5. Adding a repo

`POST /api/tracked/repos/add` — include `actionPerformerURDD` in the body so the
new repo is stamped to the creator's tenant. Omit it and the repo stays global
(legacy behaviour). No other change to that form.

## 6. Screens to touch (all additive)

| Screen | Change |
|--------|--------|
| Meeting create — repo/feature picker | Source repos from `GET /api/repos/tenant/list`; send `actionPerformerURDD` |
| Meeting list | Add `actionPerformerURDD` to the `list` call; render what returns |
| Meeting detail / open | Add `actionPerformerURDD`; handle 403 (not-in-tenant) with a block message |
| Meeting create submit | Add `actionPerformerURDD` to the body; use the returned scope repos as truth |
| Add-repo form (if present) | Add `actionPerformerURDD` to the body |

No new admin screen is required this pass — repos inherit their creator's tenant.
(A future "assign repo → tenant" admin screen is deferred on the backend.)

## 7. Rollout & data notes

- **Non-breaking:** every endpoint behaves exactly as before when
  `actionPerformerURDD` is omitted. Adopt screen-by-screen.
- **Existing data:** all current repos and meetings were backfilled to the admin
  tenant, so today only admins see them until repos are re-homed (by their creator
  adding them, or the future assign screen). This is expected — don't treat an
  empty repo list for a normal user as a bug.

## 8. Quick reference

| Action | Method + URL | Key params |
|--------|--------------|-----------|
| List my repos | `GET /api/repos/tenant/list` | `actionPerformerURDD` |
| Repo access check | `GET /api/repos/tenant/canaccess` | `actionPerformerURDD`, `repo_id` |
| List meetings | `GET /api/meeting/workflow/list` | `actionPerformerURDD` |
| Meeting detail | `GET /api/meeting/workflow/meeting` | `actionPerformerURDD`, `meeting_id` |
| Create meeting | `POST /api/meeting/workflow/create` | `actionPerformerURDD`, `scope_repo_ids[]`, … |
| Add repo | `POST /api/tracked/repos/add` | `actionPerformerURDD`, `name`, `url` |
