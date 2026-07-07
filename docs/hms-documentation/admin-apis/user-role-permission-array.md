# User Roles & Permissions (array)

| Operation | Method | Path | Permission |
|---|---|---|---|
| Read a user's roles + active permissions | GET | `/api/user/role/permission/array?userId=<id>` | `view_user_role_designation_permissions` |

Returns every **RDD (URDD)** a user holds, each with its **currently active** permissions. It is the read side of the [Permission Manager](./permission-manager.md) flow — the FE selects the user's **RDD** (from the [RDD dropdown](./permissions-dropdown.md), matched by `role_designation_department_id`) and this endpoint seeds the "Assigned" pane (what that RDD already has) so the picker can show the remaining, unassigned permissions.

---

## Authentication & Authorization

Encrypted with **platform encryption + access token** (`platformEncryption: true`, `accessToken: true`).

Gated by the RBAC permission **`view_user_role_designation_permissions`** — the acting `actionPerformerURDD` (sent in the encrypted header) must hold it.

---

## Request Payload

Query parameters:

| Param | Type | Required | Description |
|---|---|---|---|
| `userId` | `number` | Yes | The user whose roles + permissions to read. |
| `version` | `string` | Yes | API version (e.g. `1.0`). |

```
GET /api/user/role/permission/array?version=1.0&userId=87
```

---

## Response

An object with a `return` array — one entry per **URDD** the user holds, each carrying its active permissions:

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

| Field | Type | Description |
|---|---|---|
| `role_designation_department_id` | `number` | The **RDD** id of this URDD — the FE matches the RDD it picked (from the RDD dropdown) against this. |
| `role_name` | `string` | Role display name. |
| `user_role_designation_department_id` | `number` | The **URDD** id — the unit the Permission Manager edits (`urdd_id`, the write target). |
| `permissions[]` | `array` | The URDD's **active** grants: `{ permission_id, permission_name }`. |

---

## Behavior

- **Keyed by URDD, not role.** A user with the same role across multiple tenants yields **distinct** entries (one per URDD), so each is independently editable.
- **Active grants only.** The query filters `urdp.status = 'active'` and `urdd.status != 'inactive'`, so the result reflects live capabilities (a revoked permission disappears).
- **No row-level scope.** Row-level `included_id`/`excluded_id` scoping is retired; each permission is simply present (active) or absent.
- **Shape is minimal by design** — only `{ permission_id, permission_name }` per grant, which is all the picker needs.

---

## Error Responses

| Status | When |
|---|---|
| **403** | The actor does not hold `view_user_role_designation_permissions`. |

A `userId` with no roles returns an empty `return` array.

---

## Source Files

| File | Role |
|---|---|
| `Src/Apis/GeneratedApis/Custom/UserRolePermissionsarray/Custom_Objects/userRolePermissionArray.js` | `UserRolePermissionArray_object` + the `getuserrolepermissionsarray` post-process that builds the nested response. |

> Part of the [Permission Manager](./permission-manager.md) flow. Backend strategy: `backend/docs/strategies/permission_manager_flow.md`.

---

## Change Log

| Date | Change |
|---|---|
| 2026-07-02 | Documented. Read now returns **active** grants only, keyed by URDD, trimmed to `{permission_id, permission_name}`; gated `view_user_role_designation_permissions`. Legacy `included_id`/`excluded_id` scoping removed. |
| 2026-07-02 | Entry now carries **`role_designation_department_id`** (RDD id) instead of `role_id` — the FE selects by RDD (from the RDD dropdown) and matches on it; `user_role_designation_department_id` stays the write target. |
