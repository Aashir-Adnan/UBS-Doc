# Tenant-Based Project Access — Frontend Integration Guide

**Audience:** Dev Tools Portal (Docusaurus) frontend engineer
**Backend branch:** `tenant-based-approach`
**Status:** Backend endpoints live; supporting read endpoints still to be added (see §7)

---

## 1. What this feature does (in one paragraph)

A user is now attached to a **tenant**. When they open the portal they should see
only the **projects that belong to their tenant** — not every project in the
system. An admin can further narrow a user down to **specific projects** inside
that tenant (an allow-list), or block specific ones (a block-list). Every one of
these decisions is enforced **on the server by a database query** — the frontend
no longer decides what a user may see; it asks the backend and renders the
answer.

Your job on the frontend is to (a) call the list/access endpoints instead of
showing everything, and (b) build a small admin surface to assign a user to a
tenant and grant them specific projects.

---

## 2. The mental model (so the UI makes sense)

- A **tenant** is a company/organisation bucket.
- A **URDD** (`user_role_designation_department_id`) is the backend's id for
  "this user acting in this role". **Every access decision keys off the URDD, not
  the raw user id.** The portal must send the logged-in user's URDD as
  `actionPerformerURDD` on every call (see §6).
- A **project** is owned by a URDD (`created_by`) and tagged with a `tenant_id`.
- "Projects under my tenant" = every project whose owner URDD is in my tenant.
- **Specific-project access** = an allow-list/block-list of project ids stored
  against the user's `list_projects` permission. Empty allow-list = "all projects
  in my tenant".
- **Admins** (a configured email list) see **all** projects across all tenants.

You never compute any of this on the client. You send the URDD, the server
returns the scoped result.

---

## 3. The endpoints you call

All endpoints are plain REST under `/api`. They currently run with **encryption
off and access-token off** (see the security note in §6) — a normal JSON
request works. Every call must include `actionPerformerURDD`.

### 3.1 List my projects — `GET /api/projects/tenant/list`

Returns the tenant-scoped, allow/block-narrowed project list for the acting user.
This **replaces** any "fetch all projects" call on the dashboard.

**Request** (query string or body):
```json
{ "actionPerformerURDD": 7 }
```

**Response** (`payload.return`):
```json
{
  "projects": [
    { "project_id": 22, "project_name": "Beta One", "tenant_id": 5, "deployment_status": "deployed" },
    { "project_id": 23, "project_name": "Beta Two", "tenant_id": 5, "deployment_status": "pending" }
  ],
  "total": 2
}
```

- Admin URDD → every project.
- Normal URDD with no allow-list → all projects in their tenant.
- Normal URDD with an allow-list → only those project ids (still inside the tenant).
- URDD with no tenant → `{ "projects": [], "total": 0 }` (fail-closed: shows nothing, never everything).

**Render rule:** show exactly what comes back. If `total` is 0, show an empty
state, not an error.

### 3.2 Can I open this project? — `GET /api/projects/tenant/canaccess`

Call this before navigating into a project detail page (guards deep links /
bookmarked URLs).

**Request:**
```json
{ "actionPerformerURDD": 7, "project_id": 22 }
```

**Response:**
```json
{ "project_id": 22, "allowed": true }
```

If `allowed` is `false`, block the route and show "You don't have access to this
project."

### 3.3 Assign a user to a tenant — `POST /api/projects/tenant/assign` *(admin only)*

Sets which tenant a user's URDD belongs to. **Only an admin actor may call
this** — a non-admin gets HTTP 403.

**Request:**
```json
{ "actionPerformerURDD": 1, "target_urdd_id": 7, "tenant_id": 5 }
```

**Response:**
```json
{ "ok": true, "target_urdd_id": 7, "tenant_id": 5 }
```

### 3.4 Grant specific projects — `POST /api/projects/tenant/grant` *(admin only)*

Writes the allow-list of project ids for a user. **You send a plain array of
project ids** — the backend stores it in the correct internal format; the
frontend never deals with that format.

**Request — grant a specific set:**
```json
{ "actionPerformerURDD": 1, "target_urdd_id": 7, "project_ids": [22, 23] }
```

**Request — clear the restriction (give access to ALL projects in the tenant):**
```json
{ "actionPerformerURDD": 1, "target_urdd_id": 7 }
```
(Omit `project_ids`, or send an empty array meaning "no projects" — see the
important distinction below.)

**Response:**
```json
{ "ok": true, "target_urdd_id": 7, "project_ids": [22, 23] }
```

**Important semantics to reflect in the UI:**
- **Omit `project_ids`** entirely → clears the allow-list → user sees **all**
  projects in their tenant.
- **Send `project_ids: [ids]`** → user sees **only** those ids.
- The backend **drops any id that isn't in the target user's own tenant** (you
  cannot grant cross-tenant). So the response `project_ids` may be **shorter**
  than what you sent — render the returned list as the source of truth, and if it
  shrank, tell the admin "some projects were outside the user's tenant and were
  skipped."
- If you send ids but **none** survive the tenant filter, the user ends up with
  an **empty** allow-list (sees zero projects) — this is deliberate fail-closed
  behaviour. Confirm with the admin before submitting an all-cross-tenant set.

---

## 4. The screens to build

| Screen | Endpoint | Who sees it |
|--------|----------|-------------|
| **My Projects** dashboard | `GET /projects/tenant/list` | every logged-in portal user |
| **Project route guard** (before detail page) | `GET /projects/tenant/canaccess` | every user |
| **Admin → Assign tenant** (pick a user, pick a tenant) | `POST /projects/tenant/assign` | admins only |
| **Admin → Grant projects** (pick a user, checkbox the projects) | `POST /projects/tenant/grant` | admins only |

The **Grant projects** screen is the include/exclude UI: a list of the target
user's tenant projects with checkboxes; checked ids go into `project_ids`.

**Gating the admin screens:** don't rely on hiding buttons. The `assign`/`grant`
endpoints already 403 a non-admin, so the client guard is only cosmetic — the
server is the real gate. Still hide the screens for non-admins for UX.

---

## 5. Where the data comes from (backend, for your awareness)

- `list` / `canaccess` resolve the acting URDD's tenant, then run
  `projects.created_by IN (URDDs of that tenant)`, then apply the allow/block
  list. All server-side.
- `grant` writes the allow-list onto the user's `list_projects` /`view_projects`
  permission and mirrors it into the legacy `portal_user_project_access` table if
  that user is bridged, so older screens keep working during transition.
- Admin "sees all" is decided by a configured email list on the backend
  (`ADMIN_EMAILS`) — not something the frontend sets.

---

## 6. The identity contract — read this carefully

**The portal must send the acting user's URDD as `actionPerformerURDD`.** Not
their `user_id`, not their portal id. The whole feature keys off the URDD.

The Dev Tools Portal logs in with Google (`portal_users`). The bridge from a
Google identity to a URDD is `portal_users.urdd_id`. So on login the portal
needs to resolve `portal_users.urdd_id` for the signed-in account and use that
value as `actionPerformerURDD`.

**How a portal user gets a URDD (approval-gated provisioning):**

1. On Google sign-in the user is created **pending** (`role_id = NULL`, no URDD) —
   they can log in but see nothing tenant-scoped yet.
2. An admin **approves** them by assigning a tenant, calling
   **`POST /api/portal/users/provision`** (see §7). That one call provisions the
   whole chain: a passwordless `users` row, a URDD on a dedicated **Portal**
   role/designation/department, homed to the chosen tenant, granted
   `list_projects`/`view_projects`, and it stamps `portal_users.urdd_id` (the
   bridge). It is idempotent — calling it again with a different `tenant_id`
   re-homes the same URDD.
3. After provisioning, `getMe`/the sign-in record carry `urdd_id`; the portal
   sends **that** as `actionPerformerURDD` on every §3/§7 call.

A one-time backfill also links any existing portal user whose email
(case-insensitively) matches an existing active URDD, so those don't need manual
provisioning.

> ⚠️ **Until an admin provisions (or backfill links) a portal user, `urdd_id` is
> null and every tenant call fails closed** (empty list / not allowed). That's by
> design — pending users get nothing. The portal should show a "pending access"
> state when `urdd_id` is null.

> ⚠️ **Security note (please raise with backend):** the four endpoints currently
> have **access-token verification OFF**. That means `assign` and `grant` —
> which mutate access control — are callable with just an `actionPerformerURDD`
> and a matching permission, no token. This is fine for wiring/testing but
> **should be turned on (accessToken: true, encryption to match the platform)
> before production.** The frontend should be built to send the platform headers
> and access token as it does for other authenticated calls, so flipping the flag
> later is a backend-only change.

---

## 7. Admin read endpoints (BUILT — use these for the admin screens)

The four action endpoints in §3 cover enforcement and writes. The admin
Assign/Grant screens also need read endpoints to populate dropdowns and
pre-check boxes. **These are now implemented and live** — all four are
**admin-only** (a non-admin actor gets HTTP 403) and take `actionPerformerURDD`.

1. **List tenants** — `GET /api/tenants/list` — for the "assign tenant" dropdown.
   ```json
   { "tenants": [ { "tenant_id": 5, "tenant_name": "Beta Org", "tenant_slug": "beta-org", "plan_id": null, "status": "active" } ], "total": 1 }
   ```
2. **List members** — `GET /api/tenants/members` (optional `?tenant_id=5`) — to
   pick `target_urdd_id` and show tenant membership. Omit `tenant_id` for all users.
   ```json
   { "members": [ { "urdd_id": 7, "tenant_id": 5, "user_id": 2, "username": "beta", "first_name": "Beta", "last_name": "User", "email": "beta@test.com" } ], "total": 1, "tenant_id": 5 }
   ```
3. **Projects available in a tenant** — `GET /api/projects/tenant/available?tenant_id=5`
   — the checkbox list for granting to a user in that tenant (the §3.1 `list`
   endpoint only returns the *caller's* own scope). Same row shape as `list`.
   ```json
   { "projects": [ { "project_id": 22, "project_name": "Beta One", "tenant_id": 5, "deployment_status": "deployed" } ], "total": 1, "tenant_id": 5 }
   ```
4. **A user's current grants** — `GET /api/projects/tenant/grants?target_urdd_id=7`
   — to pre-check the boxes when editing. `mode: "all"` means no restriction
   (sees every project in the tenant); `mode: "specific"` means the allow-list applies.
   ```json
   { "target_urdd_id": 7, "mode": "specific", "project_ids": [22], "excluded_ids": [] }
   ```

5. **Provision / approve a portal user** — `POST /api/projects` … actually
   `POST /api/portal/users/provision` — the "approve" action that gives a pending
   portal user a tenant-scoped URDD (see §6). **Admin-only.**
   Body: `{ "actor_email": "<admin google email>", "email": "<target portal email>", "tenant_id": 5 }`
   (or `portal_user_id` instead of `email`). Returns:
   ```json
   { "ok": true, "portal_user_id": 12, "email": "dev@granjur.com", "user_id": 44, "urdd_id": 31, "tenant_id": 5 }
   ```
   The admin is authorized by `actor_email` being a portal Admin (or an env-admin
   email) — this endpoint does not use `actionPerformerURDD`, because the person
   being provisioned may not have a URDD yet.

For the **include/exclude ids** specifically: **no new format work is needed on
your side.** You send a plain `project_ids: [22, 23]` array to `grant` (§3.4);
the backend owns the storage format, and endpoint #4 above reads it back for you
in the same plain-array shape.

---

## 8. Can the `ubs-portal-frontend` Claude agent build this?

**Yes** — now that the target is the Docusaurus Dev Tools Portal, that agent is
the right tool. Its scope is exactly `/tools/*` portal pages with the three-state
auth guard, the account allowlist, the `useAuth` context, and backend API helpers
that unwrap `payload.return`. It can scaffold:

- a **My Projects** page calling `/projects/tenant/list`,
- a **route guard** using `/projects/tenant/canaccess`,
- an **admin Assign/Grant** page calling `/projects/tenant/assign` and `/grant`,

all following the portal's existing conventions and CSS.

What it **cannot** do for you: it won't invent the missing read endpoints (§7) —
those are backend work — and it can't fix the `portal_users.urdd_id` bridge (§6),
which is a data/provisioning task. Give it this document plus the go-ahead on the
§7 endpoints and it can build the pages.

> Note: the `Permissions/` React+Redux+MUI folder is a **different** frontend
> stack and is **out of scope** here per your direction — this guide targets the
> Docusaurus portal only.

---

## 9. Quick reference

| Action | Method + URL | Auth | Key fields |
|--------|--------------|------|-----------|
| List my projects | `GET /api/projects/tenant/list` | URDD | `actionPerformerURDD` |
| Check access | `GET /api/projects/tenant/canaccess` | URDD | `actionPerformerURDD`, `project_id` |
| Assign tenant | `POST /api/projects/tenant/assign` | URDD + admin | `target_urdd_id`, `tenant_id` |
| Grant projects | `POST /api/projects/tenant/grant` | URDD + admin | `target_urdd_id`, `project_ids[]` |
| List tenants | `GET /api/tenants/list` | URDD + admin | `actionPerformerURDD` |
| List members | `GET /api/tenants/members` | URDD + admin | `actionPerformerURDD`, `tenant_id?` |
| Projects in tenant | `GET /api/projects/tenant/available` | URDD + admin | `actionPerformerURDD`, `tenant_id` |
| Current grants | `GET /api/projects/tenant/grants` | URDD + admin | `actionPerformerURDD`, `target_urdd_id` |
| Provision portal user | `POST /api/portal/users/provision` | portal Admin (by `actor_email`) | `actor_email`, `email`\|`portal_user_id`, `tenant_id` |

Response envelope for all: `{ "payload": { "return": { ... } } }`.
