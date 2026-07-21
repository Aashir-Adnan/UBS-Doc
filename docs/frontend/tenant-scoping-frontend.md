# Tenant Scoping — Dev Tools Portal (Frontend Implementation)

This page documents how the Dev Tools Portal (`/tools/*`) implements the
tenant-scoping features described in the two integration guides:

- [Tenant-Based Project Access](../FRONTEND_TENANT_PROJECT_ACCESS.md)
- [Repositories & Meeting Tool — Tenant Scoping](../FRONTEND_REPOS_MEETINGS_TENANCY.md)

It is a reference for maintainers — what was added, where enforcement lives, and
the one frontend behaviour worth knowing about (the 403 surfacing).

## Enforcement model

The client **never decides** what a user may see. Every scoped call sends the
acting user's `actionPerformerURDD` and renders exactly what the server returns.
Tenant scoping, per-user project/repo allow-lists, and meeting-by-repo visibility
are all enforced server-side.

- **Identity** is resolved once by the `useActingUrdd` hook
  (`src/components/portal/tenantProjects/useActingUrdd.js`), which calls
  `GET /api/portal/users/me?email=` and exposes `{ status, urdd, me, refetch }`.
- **Pending users** (`urdd_id === null`) are never allowed to hit tenant
  endpoints. They see the shared `PendingAccess` card
  (`src/components/portal/tenantProjects/PendingAccess.jsx`).

## What each screen does

| Screen | Route / File | Call |
|--------|--------------|------|
| My Projects | `/tools/myProjects` | `GET /api/projects/tenant/list` |
| Project detail (guarded) | `/tools/myProjects/view` | `GET /api/projects/tenant/canaccess` |
| Tenant Admin | `/tools/tenantAdmin` | Provision / Assign / Grant projects / **Grant repos** |
| Meeting list | `/tools/meetingWorkflow` | `GET /api/meeting/workflow/list` (sends `actionPerformerURDD`) |
| Meeting detail | (same tool) | `GET /api/meeting/workflow/meeting` (sends `actionPerformerURDD`) |
| Meeting create | (same tool) | repo picker from `GET /api/repos/tenant/list`; `create` body carries `actionPerformerURDD` |
| Add repo | `/tools/repos` | `POST /api/tracked/repos/add` (carries `actionPerformerURDD` when resolved) |

The **Meeting Workflow** tool is gated as a whole: while identity resolves it
shows a loading state, and for pending users it shows `PendingAccess` — so no
list/detail/create call fires until the user is provisioned.

### Tenant Admin tabs

`src/pages/tools/tenantAdmin.jsx` hosts four admin panels (all admin-only,
enforced server-side with HTTP 403; the client gate is cosmetic):

- **Provision user** — `POST /api/portal/users/provision` (authorized by
  `actor_email`, not URDD).
- **Assign tenant** — `POST /api/projects/tenant/assign`.
- **Grant projects** — `POST /api/projects/tenant/grant`.
- **Grant repos** — `POST /api/repos/tenant/grant`, using
  `GET /api/repos/tenant/available` + `GET /api/repos/tenant/grants`. Mirrors the
  Grant-projects UI: unchecked "Restrict" = all tenant repos; the response
  `repo_ids` is the surviving set, so a shrunk result warns that cross-tenant ids
  were skipped.

## Meeting-by-repo visibility

Meetings are filtered by repo access **entirely on the server**:

- `GET /api/meeting/workflow/list` returns only meetings the actor can see — a
  meeting shows if it has **no** scope repos (tenant-visible) **or** the actor can
  access **at least one** of its scope repos. The list already renders whatever
  comes back; there is no client-side intersection (the list rows don't even
  carry scope repos).
- `GET /api/meeting/workflow/meeting` returns **403** with
  `"You don't have access to the repositories in this meeting"` for a non-admin
  opening a meeting outside their repo access.

### The 403 surfacing (frontend fix)

`WorkflowPanel` (`src/components/meetingWorkflow/WorkflowPanel.jsx`) guards the
meeting detail. Because a meeting can be blocked for **two** reasons (not in your
tenant, or repos you can't access), the block message must not be hardcoded.

`readBlock(err)` detects the 403 (matches `statusCode: 403`, or a
`not in your tenant` message) and extracts the server's `message`. The block card
then renders that server reason verbatim, falling back to a generic
"You don't have access to this meeting." This keeps the message correct no matter
which rule the backend blocked on, and requires no change when the backend wording
changes.

## Conventions reused

- API calls unwrap `payload.return ?? payload ?? data`; GETs put
  `actionPerformerURDD` on the query string (the `mwGet`/`mwPost` helpers and the
  `tenantApi.js` `tGet`/`tPost` helpers).
- Portal pages use the standard three-state auth guard (sign-in → wrong-account →
  content) and the `usePortalAccess` gate.
- Styles live in `src/css/custom.css` under the
  `/* ===== Tenant-Based Project Access ===== */` section.
