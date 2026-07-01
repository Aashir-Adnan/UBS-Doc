# Permission Groups Grouped CRUD

**Base route:** `/api/customPermissionGroupsGroupedCrud`  ·  **Step selector:** `?step=1` (group) or `?step=2` (permissions)  ·  **Version:** `?version=1.0`

| Method | Step | Action | Permission | Returns |
|---|---|---|---|---|
| **POST** | 1 | Create a permission group | none (static) | `{ permissionGroups_permissionGroupId, … }` |
| **PUT** | 1 | Edit a permission group (`?id=<group_id>`) | none | updated group summary |
| **GET** | 1 | List groups / View one (`?id=`) | none | group rows (View also returns active permission ids) |
| **DELETE** | 1 | Soft-delete a group (`?id=`) | none | standard delete result |
| **POST** | 2 | Assign permissions to a group (replace-all) | none | sync report (`inserted/reactivated/removed`) |
| **PUT** | 2 | Re-sync permissions (replace-all) | none | sync report |
| **GET** | 2 | List a group's mappings (`?group_id=`) / View one (`?id=`) | none | mapping rows |
| **DELETE** | 2 | Soft-revoke one mapping (`?id=`) | none | standard delete result |

A two-step grouped CRUD used by a **Tenant Admin** (or SaaS Admin) to define a **permission group** and attach a set of **permissions** to it. Step 1 owns the `permission_groups` row; step 2 owns the group's `permission_groups_permissions` join set, applied with **replace-all** semantics. The client drives the sequence: step 1 (POST) returns the new `permissionGroups_permissionGroupId`, which the client forwards into the step-2 request. Each step runs in its own transaction — there is **no cross-step atomicity** (if the client stops after step 1 the group exists with no permissions; just re-run step 2).

---

## Authentication & Authorization

Runs on the standard **encrypted AUTH platform** (platform encryption + access token), like every authenticated dashboard call. `actionPerformerURDD` is the actor identity — it travels in the encrypted request header on every request (including GETs) and may also be sent in the body. It is used to **derive `tenant_id`** (a payload `tenant_id` is ignored) and to stamp `created_by` / `updated_by`.

Both steps declare `requestMetaData.permission: null`, so this object does **not** gate on a static RBAC permission at the object level. Tenant scoping is derived from the actor's URDD: a group created with `permissionGroups_isGlobal = false` is scoped to the actor's tenant; a global group (`isGlobal = true`) is tenant-less.

> **Method → operation:** `POST → Add`, `PUT → Update`, `GET → List`, `GET ?id=<n> → View`, `DELETE → Delete`.

---

## Request Payload

### Step 1 — Permission Group (`?step=1`)

| Field | Type | Required | Notes |
|---|---|---|---|
| `permissionGroups_groupName` | string | Yes (Add) | Group name (translatable). |
| `permissionGroups_groupDescription` | string | No | Description (translatable). |
| `permissionGroups_isGlobal` | bool | No | `true` → tenant-less global group; else tenant-scoped to the actor's tenant. |
| `permissionGroups_roleId` | int | No | Optional role linkage. |
| `permissionGroups_designationId` | int | No | Optional designation linkage. |
| `actionPerformerURDD` | int | Yes | Actor (header and/or body). |
| `language_code` | string (query) | No | Language for the translated `group_name` / `group_description`. |

On **Update** (`PUT ?step=1&id=<group_id>`) all fields are optional; omitted fields are left unchanged, not nulled.

```json
// POST ?step=1
{
  "permissionGroups_groupName": "Front Desk Managers",
  "permissionGroups_groupDescription": "Desk staff with manager rights",
  "permissionGroups_isGlobal": false,
  "permissionGroups_roleId": 12,
  "permissionGroups_designationId": 7,
  "actionPerformerURDD": 130
}
```

### Step 2 — Permissions on the group (`?step=2`)

| Field | Type | Required | Notes |
|---|---|---|---|
| `permissionGroups_permissionGroupId` | int | Yes | The id returned by step 1. Falls back to the same-request stash when both steps ran together. |
| `permissionGroupsPermissions_permissionId` | int[] | Yes | Array of permission ids (e.g. `[3,5,9,21]`). Accepts `[{value}]` option objects. May be `[]` to clear all. |
| `actionPerformerURDD` | int | Yes | Actor. |

```json
// POST ?step=2
{
  "permissionGroups_permissionGroupId": 42,
  "permissionGroupsPermissions_permissionId": [3, 5, 9, 21],
  "actionPerformerURDD": 130
}
```

---

## Behavior

Both steps are **helper-driven**: the Add/Update `queryPayload` is a `null` no-op and the real work lives in preProcess helpers under `Src/HelperFunctions/PreProcessingFunctions/CustomPermissionGroupsGroupedCrud/`.

### Step 1 — group create / edit

- **Add** inserts the `permission_groups` row and returns `permission_group_id`. `tenant_id` is derived from the actor's URDD (never trusted from the payload); global groups are tenant-less.
- **Update** patches the row in place (omitted fields untouched).
- Translations for `group_name` / `group_description` are written idempotently per (record, column, language) by `upsertPermissionGroupTranslations.js` — a **replace**, not a blind re-insert, so repeated edits don't accumulate duplicate `translated_entries` rows. List/View read the translated value via `COALESCE(translation, base_column)` keyed on `?language_code`.

### Step 2 — replace-all permission sync

`permission_groups_permissions` is a status-flagged join table (`active`/`inactive`), so the sync toggles status instead of hard-deleting. The array you send becomes the group's **complete** active permission set:

| Case | Effect |
|---|---|
| New permission id | `INSERT` (`status='active'`) |
| Already active | Kept |
| Previously revoked | Reactivated |
| Dropped from the array | Soft-revoked (`status='inactive'`) |

Every requested id is validated against `permissions` (active) first; an **unknown or inactive id throws 400 and the whole step rolls back**. An **empty array revokes all** of the group's permissions (a valid update).

The response `message` is dynamic — e.g. `"Permission group updated successfully. Permissions updated: 1 added, 2 removed."` — built from the actual diff.

**Add / Update response (`res.return`):**

```json
{
  "success": true,
  "message": "Permission group created successfully. Permissions updated: 4 added.",
  "permissionGroups_permissionGroupId": 42,
  "active_permission_count": 4,
  "inserted_permission_ids": [3, 5, 9, 21],
  "reactivated_permission_ids": [],
  "removed_permission_ids": []
}
```

**Step-1 View** additionally returns the group's currently-active permission ids as a JSON array (`permissionGroupsPermissions_permissionId`) so the edit form can pre-select them in the step-2 multi-select. **Step-2 List** accepts `?group_id=<id>` to list one group's mappings (omit it to list across all groups).

> **Caveat — URDP materialization on edit.** Creating a group and assigning permissions is safe on its own: a brand-new group has no users attached. **Editing an existing group's permission set does NOT re-materialize `user_role_designation_permissions` (URDP) for users already assigned via that group.** `permissionChecker` reads URDP, so if this object is later used to mutate the permission set of a group that already has assignees, a follow-up URDP materialization step is required for the change to take effect (see the `group_grants_need_urdp_materialization` convention).

---

## Error Responses

| Status | Condition |
|---|---|
| 400 | Step 2 contains an unknown or inactive permission id — `"Permission assignment failed: Unknown or inactive permission id(s): …"` (whole step rolls back). |
| 400 | Missing required fields for the step. |

On failure the request throws and the thrown message surfaces as the error; the static `errorMessage` from the step's `response` block is only a last-resort fallback.

---

## Source Files

| File | Purpose |
|---|---|
| `Src/Apis/ProjectSpecificApis/CustomPermissionGroupsGroupedCrud/CONTEXT.md` | Authoritative design doc (steps, replace-all semantics, caveats). |
| `Src/Apis/ProjectSpecificApis/CustomPermissionGroupsGroupedCrud/FE_CONTRACT.md` | Wire contract (per-step request/response shapes). |
| `Src/Apis/ProjectSpecificApis/CustomPermissionGroupsGroupedCrud/CustomPermissionGroupsGroupedCrud.js` | API object — two steps, inline List/View/Delete SQL, dynamic-message post-processors. |
| `Src/Apis/ProjectSpecificApis/CustomPermissionGroupsGroupedCrud/CRUD_parameters.js` | Request parameter schema (sections `permissionGroups`, `permissionGroupsPermissions`). |
| `Src/HelperFunctions/PreProcessingFunctions/CustomPermissionGroupsGroupedCrud/step1_add_permission_group.js` | Step 1 Add — insert group, derive tenant, write translations. |
| `Src/HelperFunctions/PreProcessingFunctions/CustomPermissionGroupsGroupedCrud/step1_update_permission_group.js` | Step 1 Update — patch group in place. |
| `Src/HelperFunctions/PreProcessingFunctions/CustomPermissionGroupsGroupedCrud/step2_assign_permissions.js` | Step 2 Add/Update — replace-all permission sync entry point. |
| `Src/HelperFunctions/PreProcessingFunctions/CustomPermissionGroupsGroupedCrud/syncGroupPermissions.js` | The replace-all engine (insert / keep / reactivate / soft-revoke). |
| `Src/HelperFunctions/PreProcessingFunctions/CustomPermissionGroupsGroupedCrud/upsertPermissionGroupTranslations.js` | Idempotent translation writer for `group_name` / `group_description`. |
