# Permission Manager

| Operation | Method | Path | Permission |
|---|---|---|---|
| The user's RDDs (role picker) | GET | `/api/roles_designations_department/dropdown?targetUserId=<id>` | None |
| RDD + current grants (read) | GET | `/api/user/role/permission/array?userId=<id>` | `view_user_role_designation_permissions` |
| Assignable catalog (picker) | GET | `/api/permissions/dropdown` | None (persona-filtered) |
| Assign / Revoke (write) | POST | `/api/assign/permissions` | `update_user_role_designation_permissions` |

A dual-pane admin tool that turns individual permissions **on/off for one user's RDD (URDD)**, independent of which permission group originally granted them. The FE picks a user, then one of that user's **RDDs**; the tool reads that RDD's currently-assigned permissions, offers the assignable catalog (scoped to what the acting admin may grant), and writes the result by toggling `user_role_designation_permissions` (URDP) rows.

There is **no row-level record scoping** — a permission is simply active or inactive for a URDD. The runtime permission check grants a capability **iff an active URDP row exists**, so flipping `urdp.status` *is* the grant/revoke mechanism.

---

## Authentication & Authorization

All three endpoints use **platform encryption + access token** (`platformEncryption: true`, `accessToken: true`). The acting identity is `actionPerformerURDD` (sent in the encrypted header on every request).

### The assignable set — 3 persona rules

Which permissions an admin may **see, assign, or revoke** is decided by the **action performer's persona** (its own RDD). The same resolver bounds both the picker (dropdown) and the write endpoint, so the UI and server enforcement can never diverge.

| Actor persona | Detected by | May assign |
|---|---|---|
| **System / SaaS Admin** | `designation_code = 'SYSTEM'` (or the `system` role) | **All** active permissions |
| **Tenant Manager** | `TENANT` + `Manager` | **All** active permissions **except** those *solely* owned by the global `PG-FRAMEWORK` group (framework-exclusive). Framework perms shared with another group stay assignable. |
| **Any other persona** (Tenant Admin, Service Manager, Booking Manager, …) | anything else | **Only** the permissions in the group(s) linked to the actor's **own RDD** (dynamic via `roles_designations_department_permissions`) |

This is **permission-driven, not group-name driven**: the actor's persona comes from its RDD (`designation_code` / `role_name`), and Rule 3 follows the actor's own `RDD → group → permissions` links — so it handles every current and future persona with no hardcoded group name and survives group renames. An actor that resolves to an **empty** assignable set (unresolved, or a legacy RDD with no group links) is denied (**403**).

**Tenant isolation:** an admin may only edit URDDs in **its own tenant** — the target URDD's `tenant_id` must equal the acting URDD's `tenant_id` (no cross-tenant exemption; the acting URDD is tenant-scoped).

> The picker's persona filter is **UX bounding only**. The write endpoint re-validates every id against the same resolver, so anything outside the actor's set is refused server-side.

---

## 1. The user's RDDs + current grants (read)

**Role picker** — `GET /api/roles_designations_department/dropdown?version=1.0&targetUserId=<id>` returns the RDDs the user holds (`{ value: role_designation_department_id, label }[]`); the FE shows these as the "role" selector (the user picks an **RDD**). Use the param **`targetUserId`** (not `userId`) — this dropdown is shared, and the ambient `userId` present on every request would otherwise wrongly narrow it.

**Grants** — `GET /api/user/role/permission/array?version=1.0&userId=<id>` returns each of the user's RDDs (URDDs) with its **currently active** permissions — seeds the "Assigned" pane. Match the RDD picked above by `role_designation_department_id`.

### Response

```json
{
  "return": [
    {
      "role_designation_department_id": 1243,
      "role_name": "Manager",
      "user_role_designation_department_id": 910,
      "permissions": [
        { "permission_id": 41, "permission_name": "list_bookings" },
        { "permission_id": 42, "permission_name": "view_bookings" }
      ]
    }
  ],
  "message": "User roles and permissions retrieved successfully"
}
```

- **`role_designation_department_id`** — the **RDD** id; the FE matches the RDD it picked against this.
- **`user_role_designation_department_id`** — the **URDD** id, used as `urdd_id` on write.
- Only **active** URDP grants are returned (`urdp.status = 'active'`).

---

## 2. Assignable catalog (picker)

`GET /api/permissions/dropdown?version=1.0` — pass the acting `actionPerformerURDD` (already in the encrypted header). Returns the permissions the **current admin may assign** (the 3 rules above), for the "Unassigned" pane.

### Response

An array of option rows:

```json
[
  { "value": 41, "label": "List Bookings", "description": "List all bookings" },
  { "value": 42, "label": "View Bookings", "description": "View a booking" }
]
```

- `value` = `permission_id`, `label` / `description` are locale-resolved (`?language_code=` optional, default `en`).
- The **left (Unassigned) pane** = this list minus the permissions already active in the Assigned pane (from endpoint 1).
- Do **not** bound the catalog by permission-group name or `permission_category` on the client — the endpoint already scopes it.

---

## 3. Assign / Revoke (write)

`POST /api/assign/permissions?version=1.0`

> **Route note:** the router PascalCases **each path segment** (`assign` → `Assign`, `permissions` → `Permissions` → `AssignPermissions_object`). Use the **two-segment** path `/api/assign/permissions`; a single camelCase segment `/api/assignPermissions` would not resolve.

### Request Payload

| Field | Type | Required | Description |
|---|---|---|---|
| `urdd_id` | `number` | Yes | Target URDD whose permissions are edited. |
| `actionPerformerURDD` | `number` | Yes | Acting admin's URDD (drives the persona bound + tenant check). |
| `assign` | `number[]` | No | `permission_id`s to make **active** (reactivate an inactive row, else insert). |
| `revoke` | `number[]` | No | `permission_id`s to make **inactive**. |
| `user_id` | `number` | No | Target user id — optional echo for the response/audit. |

```json
{
  "urdd_id": 910,
  "actionPerformerURDD": 905,
  "assign": [10, 11, 12],
  "revoke": [22, 23],
  "user_id": 87
}
```

### Response

```json
{
  "success": true,
  "urdd_id": 910,
  "assigned": [10, 11, 12],
  "revoked": [22, 23],
  "skipped": [ { "permission_id": 99, "reason": "not_assignable" } ],
  "message": "Applied 5 permission change(s) for URDD 910"
}
```

- `skipped[]` — ids **outside the actor's assignable set** (also covers unknown/nonexistent ids). Every `reason` is `not_assignable`; these are reported, never written.

---

## Behavior

- **Toggle semantics.** `assign` ensures an **active** URDP row for `(urdd_id, permission_id)` — reactivating an existing inactive row or inserting a new one; `revoke` sets the existing row to **inactive**. No row-level `included_id`/`excluded_id` scoping.
- **Group-agnostic + local.** A revoke only ever affects the target URDD's own row; it never edits permission groups or any other user.
- **Idempotent & duplicate-safe.** There is no unique key on `(urdd, permission)`, so the write updates any existing row (any status) or inserts one — re-assigning a previously revoked permission simply re-activates the same row (no duplicate).
- **One transaction.** All assigns/revokes for a request commit together; any failure rolls back. `tenant_id` is stamped from the target URDD.
- **Audit.** A best-effort `audit_logs` row (`log_type='crud'`, `action='update'`, `new_values` = the applied `{assigned, revoked}`) is written per successful call; a logging failure never fails the operation.
- **Override durability (accepted).** URDP has no manual-override marker, so a manual change here can later be re-applied by a group-materialization migration. This is accepted; durable overrides are out of scope.

---

## Error Responses

| Status | When |
|---|---|
| **400** | Missing `urdd_id` / `actionPerformerURDD`, or both `assign` and `revoke` empty. |
| **403** | Actor persona resolves to no assignable permissions; or target URDD is in a different tenant than the acting URDD; or the RBAC gate (`update_...` / `view_...`) is not held. |
| **404** | Target URDD not found or inactive. |

Ids the actor may not assign are **not** an error — they come back in `skipped[]` with `reason: "not_assignable"`.

---

## Source Files

| File | Role |
|---|---|
| `Src/HelperFunctions/PayloadFunctions/AssignPermissions/assignablePermissions.js` | Shared persona resolver — the 3 rules; `getAssignablePermissionIds()` (Set) + `buildAssignableScopeSql()` (SQL fragment). Single source of truth for picker + write. |
| `Src/Apis/GeneratedApis/Custom/AssignPermissions/Custom_Objects/assignPermissions.js` | `AssignPermissions_object` — `POST /api/assign/permissions`, gated `update_user_role_designation_permissions`. |
| `Src/HelperFunctions/PayloadFunctions/AssignPermissions/assignPermissionsToUser.js` | Write path — transactional assign/revoke diff, own-tenant guard, persona bound, audit. |
| `Src/Apis/GeneratedApis/Custom/UserRolePermissionsarray/Custom_Objects/userRolePermissionArray.js` | `UserRolePermissionArray_object` — roles + active grants read, gated `view_user_role_designation_permissions`. |
| `Src/Apis/GeneratedApis/Default/Permissions/Dropdown_Objects/Permissions_dropdown.js` | Persona-filtered permissions picker (uses the shared resolver). |
| `Src/Apis/GeneratedApis/Default/Roles/Dropdown_Objects/Roles_designations_department_dropdown.js` | RDD picker; optional `userId` filter returns only the RDDs a user holds. |
| `data/migrations/pending/20260702_1_set_signature_dashboard_permission_categories.sql` | Sets tier-accurate `permission_category` on the signature dashboard permissions (data hygiene; not required for gating). |

> Backend strategy & design: `backend/docs/strategies/permission_manager_flow.md`.

---

## Change Log

| Date | Change |
|---|---|
| 2026-07-02 | Initial docs — per-URDD URDP toggle model; persona-based assignable set (System→all, Tenant Manager→all-minus-`PG-FRAMEWORK`-exclusive, else→own-RDD groups); own-tenant isolation; route `POST /api/assign/permissions`. |
| 2026-07-02 | FE selects the user's **RDD** (via the RDD dropdown filtered by `userId`); read endpoint surfaces `role_designation_department_id` (not `role_id`). Write target `user_role_designation_department_id` unchanged. |
| 2026-07-03 | RDD-picker filter param renamed `userId` → **`targetUserId`** (the shared dropdown was being emptied by the ambient `userId` on unrelated calls, e.g. the tenant RDD listing). |
