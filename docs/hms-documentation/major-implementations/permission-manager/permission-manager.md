---
title: "Permission Manager"
sidebar_position: 1
---

# Permission Manager

The Permission Manager lets an admin grant or revoke **individual permissions** for one target role-assignment (URDD), without editing permission groups. It is the per-user override layer on top of group-derived permissions.

Every write passes four independent gates — **capability**, **tenant**, **seniority**, and **persona scope**. A request must clear all four; any one of them can reject it with a `403`.

---

## The write endpoint

**`POST /api/assign/permissions`**

Request — explicit assign/revoke id lists:

```jsonc
{
  "user_id": 87,                 // optional, echoed back for audit
  "urdd_id": 910,                // REQUIRED — the role-assignment being edited
  "actionPerformerURDD": 45,     // REQUIRED — the acting admin's URDD
  "assign": [10, 11, 12],        // permission_ids to make ACTIVE
  "revoke": [22, 23]             // permission_ids to make INACTIVE
}
```

Response:

```jsonc
{
  "success": true,
  "urdd_id": 910,
  "assigned": [10, 11, 12],
  "revoked":  [22, 23],
  "skipped":  [ { "permission_id": 99, "reason": "not_assignable" } ],
  "message": "Applied 5 permission change(s) for URDD 910"
}
```

Permissions are stored in `user_role_designation_permissions` (URDP). A capability is granted **iff** an active URDP row exists — so assign/revoke is simply flipping that row's status. There is no schema change and no row-level scoping.

---

## Gate 1 — Capability

The caller must hold `update_user_role_designation_permissions`. Reads require a corresponding view permission. Client-side sidebar gating on `view_permissions` is **UX only** and is never the authority.

## Gate 2 — Tenant isolation

The target URDD's `tenant_id` must equal the acting URDD's `tenant_id`. There is no cross-tenant exemption: an admin operates through a tenant-scoped URDD, so acting on hotel X requires passing the URDD scoped to X.

> Rejects with: `Forbidden: you can only manage permissions within your own tenant`

## Gate 3 — Seniority scope

> Full model, worked RDD examples and the per-CRUD matrix: **[Seniority Scope](../seniority-scope/seniority-scope.md)**.

An actor may act on targets **at or below its acting leg** — juniors, peers, and guests — but never on **itself** and never on a **senior**.

### No self — for every persona

Self-action is rejected for **all** personas, including SaaS-Admin and Tenant-Manager. "Self" means the same URDD **or any other leg belonging to the same user**, so a person holding two URDDs cannot escalate through their second one.

This is evaluated **before** the persona overrides below, so an override can never re-open self-service.

> Rejects with: `You cannot edit permissions for your own account.`

### Juniors and peers

Seniority lives on `roles_designations_department.senior_rdd_id`, which points **up** at the role a row reports to. "Actor may act on target" means: walking up from the target's **own** role reaches the acting URDD's role.

The walk seeds at the target's own role, so a **peer** sharing that role matches immediately and is allowed. Only genuine **seniors** are rejected.

> Rejects with: `You can only edit permissions for users who report to you.`

### Guests always pass

Guest roles have **no** `senior_rdd_id` — a guest reports to nobody — so the walk can never reach an actor from a guest target. Including guests in the check therefore never *grants* authority, it only *denies*: it made every guest-only user unreachable by anyone but the personas below. A guest target is admitted directly, since a guest is junior to every non-guest role.

This is also what admits a **just-created** user, which holds nothing but the global guest role.

### `senior_rdd_id IS NULL` means two different things

| On a… | It means | Consequence |
|---|---|---|
| **guest** role | reports to nobody — the **bottom** | junior to everyone; always manageable |
| **any other** role | nothing above it — a **root**, the **top** | senior to any target that *does* sit on a chain |

The two are handled by separate branches, never by the chain walk.

### Tenant isolation

Normally the chain supplies it, since a tenant's roles report up to that tenant's Tenant-Manager role. The two branches above don't consult the chain, so they assert tenant equality explicitly instead.

### You cannot assign a role senior to your own

The rules above govern **who you may act on**. This one governs **what you may grant** — without it, the first set is bypassable by proxy: an actor barred from editing a senior could create a user, hand them a senior role, and end up with an account that outranks itself.

Any requested role that is a **strict ancestor** of the acting role is refused:

> Rejects with: `You cannot assign a role that is senior to your own (<DESIGNATION/Role>).`

It is enforced on the shared role-sync engine, so **both** adding roles and updating them carry it — guarding only the create path would leave the same escalation one update away. Your own level stays assignable, and where `senior_rdd_id` is not backfilled the check fails open, so it can only tighten existing behaviour.

### Persona overrides

Applied only after the self check passes:

| Persona | Scope of override |
|---|---|
| **SaaS-Admin / SYSTEM** | Senior to everyone, unconditionally |
| **Tenant-Manager** | Senior to everyone **inside its own tenant only** (tenant equality required) — **except a SaaS-Admin (SYSTEM) target**: the base Tenant-Manager shares the SYSTEM tenant with the SaaS-Admin, so this carve-out stops it from editing a genuine senior. |

**Why these exist:** `senior_rdd_id` is not consistently backfilled across tenants. Measured on the dev database, the raw chain alone rejected **263 of 287** legitimate Tenant-Manager operations and **50 of 50** SaaS-Admin ones — i.e. it locked platform and tenant admins out of their own tooling. The overrides restore intended authority; the tenant-equality requirement keeps the Tenant-Manager override from becoming a cross-tenant escape hatch.

The long-term fix is a seniority backfill so every tenant role chains up to its Tenant-Manager role, after which the Tenant-Manager override could be removed.

## Gate 4 — Persona-bound assignable set

An actor can only touch permissions inside its persona's assignable set:

| Persona | Assignable set |
|---|---|
| System / SaaS Admin | All active permissions |
| Tenant Manager | All active **except** framework-exclusive ones |
| Everyone else | Only permissions from its own role's linked permission groups |

Ids outside the set are **not written** — they come back in `skipped` with reason `not_assignable` (which also covers unknown or nonexistent ids, since those are simply not in the set). An actor whose persona resolves to an **empty** set cannot administer permissions at all and gets a `403` — it fails safe.

The same resolver powers the permission picker in the UI, so what the UI offers and what the backend accepts cannot diverge.

---

## Write algorithm

All gates run **before** any write. The apply step is a single transaction on one connection.

```
INPUT: urdd_id, actionPerformerURDD, assign[], revoke[]

1. Validate presence: urdd_id, actionPerformerURDD, and a non-empty assign ∪ revoke.
2. Tenant guard      — actorTenant must equal targetTenant, else 403.
3. Seniority guard   — self → 403; guest target → pass (same tenant); root actor → pass
                       (same tenant); else persona override; else walk up from the target's
                       own role (peers included), else 403.
4. Persona set       — resolve assignable ids; empty → 403.
5. Partition         — ids outside the assignable set go to skipped[], never written.
6. Apply (txn):
     assign → reactivate an inactive URDP row, else insert a new active one
     revoke → set the existing active row to inactive
7. COMMIT.
8. Signal sessions   — flag needs_refresh for the target user (best-effort, post-commit).
9. Audit             — one audit_logs row (best-effort).
10. Return assigned / revoked / skipped.
```

Duplicate-safe by design: there is no unique key on the URDD/permission pair, so the assign path is *update-any-status-else-insert*. `tenant_id` on new rows is stamped from the **target** URDD.

---

## Session refresh side effect

A successful change flags `needs_refresh = 1` on **every active device of the target user** — not the admin's. On that user's next authenticated request the response carries `needs_refresh: true`, and the client reacts by calling `POST /api/auth/session/refresh`, which returns a fresh login payload and clears the flag.

The acting admin's own session is **never** affected, because self-edits are rejected by the seniority gate — the target is always someone else.

See [Access Token Security](../access-token-security/access-token-security.md) for the full mechanism.

---

## One rule, several call sites

The seniority scope is implemented once, in `Src/HelperFunctions/PayloadFunctions/Governance/seniorityScope.js`, and enforced by every write path that touches users, roles, or permissions:

| Write path | Enforced |
|---|---|
| Permission Manager (`assignPermissionsToUser`) | ✅ act-on |
| Grouped user CRUD — step 1 Update (profile) | ✅ act-on |
| Grouped user CRUD — step 2 Update (roles) | ✅ act-on + can't-grant-senior |
| Grouped user CRUD — step 2 Add (attaching roles to a user) | ✅ act-on + can't-grant-senior |
| Users CRUD — Delete | ✅ can't-delete-senior *(narrower — seniors only)* |

**No special case for user creation.** A just-created user holds only the global guest role, so the guest branch admits it. An earlier version instead skipped the step-2 Add check whenever an in-request step-1 artifact was present — but the grouped CRUD is driven as **two sequential requests**, so that artifact is absent on the real creation path, the skip never fired, and **every user creation was rejected with a 403**. Gate on the target's own state, never on an in-request artifact.

Because they share one helper, the Permission Manager can never drift from the user and role write paths.

The **Users CRUD Add / Update are not call sites** — that CRUD is not used for add/update. Its **Delete** carries the narrower "can't delete a senior" variant (Rule 3 in [Seniority Scope](../seniority-scope/seniority-scope.md)) on top of the self-delete block and the `delete_users` permission.

---

## Accepted caveat

URDP carries no "manual override" marker. Consequently:

- A manually **revoked** group-derived permission can be **re-granted** by a later group-materialization migration.
- A manually **granted** permission can be **deactivated** by a group-revoke migration targeting that persona signature.

This is accepted: group migrations are the system of record for group-derived permissions, and manual overrides are a per-user layer on top of them.
