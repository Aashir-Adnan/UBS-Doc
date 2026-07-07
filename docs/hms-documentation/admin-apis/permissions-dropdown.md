# Permissions Dropdown

| Operation | Method | Path | Permission |
|---|---|---|---|
| List assignable permissions (persona-filtered) | GET | `/api/permissions/dropdown` | None (persona-filtered) |

A permissions picker that returns the set of permissions **the acting admin is allowed to assign**, scoped to the actor's persona. It is the assignable-catalog source for the [Permission Manager](./permission-manager.md) flow (the "Unassigned" pane), and doubles as the general permissions picker anywhere a persona-correct permission list is needed.

---

## Authentication & Authorization

Encrypted with **platform encryption + access token** (`platformEncryption: true`, `accessToken: true`). No RBAC gate (`permission: null`) — visibility is bounded by **persona filtering** instead.

### Persona filtering — 3 rules

The list is scoped by the **action performer's persona** (its own RDD), resolved from `actionPerformerURDD` (sent in the encrypted header):

| Actor persona | Detected by | Sees |
|---|---|---|
| **System / SaaS Admin** | `designation_code = 'SYSTEM'` (or the `system` role) | **All** active permissions |
| **Tenant Manager** | `TENANT` + `Manager` | **All** active permissions **except** those *solely* owned by the global `PG-FRAMEWORK` group (framework-exclusive). Shared framework perms remain. |
| **Any other persona** (Tenant Admin, Service Manager, Booking Manager, …) | anything else | **Only** the permissions in the group(s) linked to the actor's **own RDD** (dynamic via `roles_designations_department_permissions`) |

This is permission-driven, not group-name driven — Rule 3 follows the actor's own `RDD → group → permissions` links, so it handles every current and future persona with no hardcoded group name and survives group renames. An **unresolved** actor (or a legacy RDD with no group links) receives an **empty** list (fail-safe).

> The same resolver bounds the Permission Manager's **write** endpoint, so the picker and server-side enforcement never diverge.

---

## Request Payload

Query parameters:

| Param | Type | Required | Description |
|---|---|---|---|
| `actionPerformerURDD` | `number` | Yes | Acting URDD — determines the persona filter. (Also read from the encrypted header.) |
| `version` | `string` | Yes | API version (e.g. `1.0`). |
| `language_code` | `string` | No | Locale for `label` / `description` (default `en`). |

```
GET /api/permissions/dropdown?version=1.0&actionPerformerURDD=905&language_code=en
```

---

## Response

An array of option rows:

```json
[
  { "value": 41, "label": "List Bookings", "description": "List all bookings" },
  { "value": 42, "label": "View Bookings", "description": "View a booking" }
]
```

| Field | Type | Description |
|---|---|---|
| `value` | `number` | `permission_id` (option value). |
| `label` | `string` | Locale-resolved permission name (falls back to `permission_name`). |
| `description` | `string` | Locale-resolved permission description (falls back to `permission_description`). |

Inactive permissions (`status = 'inactive'`) are always excluded.

---

## Behavior

- **Persona scope is applied as a SQL fragment** built by the shared resolver (`buildAssignableScopeSql`) — System gets no filter, Tenant Manager a `NOT IN` framework-exclusive fragment, everyone else an `IN own-RDD-groups` fragment, and an unresolved actor a deny (`1 = 0`).
- **`PG-FRAMEWORK` is resolved as the GLOBAL original** (`created_by` = SaaS-Admin URDD, `status = 'active'`) — the group isn't cloned per tenant and has an inactive duplicate, so this excludes clones/dead rows.
- **Locale resolution** joins `translated_entries` for `label`/`description`, falling back to the base `permissions` columns.

---

## Source Files

| File | Role |
|---|---|
| `Src/Apis/GeneratedApis/Default/Permissions/Dropdown_Objects/Permissions_dropdown.js` | `PermissionsDropdown_object` — the picker; delegates persona scoping to the shared resolver. |
| `Src/HelperFunctions/PayloadFunctions/AssignPermissions/assignablePermissions.js` | Shared persona resolver (`resolveActorPersona`, `buildAssignableScopeSql`) — the 3 rules, shared with the Permission Manager write path. |

> Part of the [Permission Manager](./permission-manager.md) flow. Backend strategy: `backend/docs/strategies/permission_manager_flow.md`.

---

## Change Log

| Date | Change |
|---|---|
| 2026-07-02 | Persona filter extended to **3 rules** (added System→all and everyone-else→own-RDD groups; Tenant Manager now excludes only `PG-FRAMEWORK`-exclusive perms). Logic moved to the shared `assignablePermissions.js` resolver so the picker and the assign endpoint stay in sync. |
