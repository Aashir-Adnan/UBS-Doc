# Users Grouped CRUD

**Base route:** `/api/customUsersGroupedCrud`  ·  **Step selector:** `?step=1` (user) or `?step=2` (role assignments)  ·  **Version:** `?version=1.0`

| Method | Step | Action | Permission | Returns |
|---|---|---|---|---|
| **POST** | 1 | Create a user | none (static) | `{ users_userId, … }` |
| **PUT** | 1 | Update a user (`?id=<user_id>`) | none | user summary |
| **GET** | 1 | List users / View one (`?id=`; `?guests=1` scope) | none | user rows + `tenantUrddMap` |
| **DELETE** | 1 | Soft-delete a user (`?id=`) | none | standard delete result |
| **POST** | 2 | Assign a user's role set (URDDs) + fan out URDPs | none | role-diff report |
| **PUT** | 2 | Re-sync the role set (replace-all) | none | role-diff report |
| **GET** | 2 | List / View a URDD (`?id=`) | none | URDD rows |
| **DELETE** | 2 | Soft-delete one URDD (`?id=`, tenant-ownership gated) | none | standard delete result |

A multi-step grouped CRUD used by a **Tenant Admin** to manage a **user** and that user's **role assignments** in one API. Step 1 owns the `users` row; step 2 owns the user's `user_roles_designations_department` (URDD) set and fans out the `user_role_designation_permissions` (URDP) those assignments grant. A user may hold **multiple** RDDs, so step 2 treats the role field as a **set** with replace-all semantics. Business logic lives in preProcess helpers under `Src/HelperFunctions/PreProcessingFunctions/CustomUsersGroupedCrud/`; the Add/Update `queryPayload` is a `null` no-op.

---

## Authentication & Authorization

Runs on the encrypted **AUTH platform** (platform encryption + access token). `actionPerformerURDD` is the actor — it rides in the encrypted header on every request (including GETs) and may also be in the body. It is used to **derive the acting `tenant_id`** (payload tenant fields are ignored) and to stamp `created_by` / `updated_by`.

Both steps declare `permission: null` — this CRUD does **not** gate on a static RBAC permission. Instead:

- **List / View** — tenant scoping is enforced by the query resolver (`created_by`-based tenancy filter on the top-level `users` rows).
- **Add / Update (step 2)** — tenant scoping and a per-RDD "assignable to this tenant" guard are enforced **inside `syncUserRddSet`**. The `users` row has no per-tenant owner, so there is no tenant-ownership guard on step-1 Update; protection is per-URDD at the role layer.
- **Delete (step 2)** — `requireUrddTenantMatch` blocks cross-tenant deletes. Delete's `{{id}}` is a **URDD id**, the correct key for the ownership guard. (It is deliberately **not** on Update, where `?id=` is a **user_id** — the wrong key for a URDD guard.)

> **Method → operation:** `POST → Add`, `PUT → Update`, `GET → List`, `GET ?id=<n> → View`, `DELETE → Delete`.

---

## Request Payload

### Step 1 — User (`?step=1`)

Section `users`. Key fields (all optional at the schema level; `email` is effectively required for Add — see the duplicate-email gate):

| Field | Type | Notes |
|---|---|---|
| `users_selectUserId` | select | Attach an already-existing user instead of creating one. |
| `users_username` | string | Translatable. |
| `users_password` | string | |
| `users_firstName` / `users_lastName` | string | Translatable. |
| `users_email` | string | Identity key for the duplicate-email gate. |
| `users_phoneNo`, `users_cnic`, `users_passportNumber`, `users_nationality`, `users_gender`, `users_dateOfBirth` | various | Profile fields. |
| `users_address`, `users_city`, `users_country`, `users_postalCode`, `users_preferences` | various | Profile fields. |
| `users_isPrimaryTenant`, `users_imageAttachmentId`, `users_status` | various | |
| `actionPerformerURDD` | int | Actor. |
| `language_code` | string (query) | Language for translated `username` / `first_name` / `last_name`. |

```json
// POST ?step=1
{
  "users_username": "jdoe",
  "users_firstName": "John",
  "users_lastName": "Doe",
  "users_email": "john.doe@example.com",
  "users_phoneNo": "+971501234567",
  "actionPerformerURDD": 130
}
```

### Step 2 — User Role Designation Department (`?step=2`)

Section `userRolesDesignationsDepartment`:

| Field | Type | Notes |
|---|---|---|
| `userRolesDesignationsDepartment_userId` | int | The user to assign roles to. |
| `userRolesDesignationsDepartment_roleDesignationDepartmentId` | select / **array** | The **set** of RDD ids (the value the RDD dropdown keys on). Tolerates scalar, array, or `[{value}]` option objects. **Empty array removes every role** the user holds in the actor's tenant. |
| `userRolesDesignationsDepartment_additionalAttributes` | string | Optional per-assignment attributes. |
| `userRolesDesignationsDepartment_startDate` / `_endDate` | date | Optional. |
| `actionPerformerURDD` | int | Actor. |

```json
// POST ?step=2
{
  "userRolesDesignationsDepartment_userId": 123,
  "userRolesDesignationsDepartment_roleDesignationDepartmentId": [12, 13],
  "actionPerformerURDD": 130
}
```

---

## Behavior

### Step 1 — user create / edit

- **Add always INSERTs a new `users` row** (+ translations for `username` / `first_name` / `last_name` when `language_code` is present).
- **Duplicate-email gate (reject, not reuse).** If an **active** user with that email already exists (case/space-insensitive), Add **rejects with 409** (`scc: "DUPLICATE"`) rather than reusing them — reusing would route the admin into step 2 against the wrong person. To attach an existing person, use the **"select existing user"** path (`users_selectUserId`). The INSERT path also maps an `ER_DUP_ENTRY` (1062) to the same 409 for the race case. Soft-deleted (`inactive`) emails are free to reuse.
- **Update** patches the existing row; translations are replaced per (record, column, language) so repeated edits don't accumulate duplicates. Update resolves the user by `req.query.id` (the `user_id`).

**`?guests=1` scope (step-1 List/View).** Appending `?guests=1` (or `true`) narrows the result to the **guest persona** — URDDs whose RDD designation is a guest leg (`STANDARD` / `DEFAULT`, the canonical `GUEST_LEG_DESIGNATIONS`). List returns only users holding ≥1 active guest-leg URDD; each row's `tenantUrddMap` is scoped to the user's guest URDDs. View scopes the returned URDD set (and the pre-select array) to guest legs but does **not** hide the user row itself (View is keyed by id). With no param, behavior is unchanged.

### Step 2 — role set (URDD) sync + permission fan-out

Step 2 applies `userRolesDesignationsDepartment_roleDesignationDepartmentId` **replace-all** via the shared `syncUserRddSet` engine:

| Case | Effect |
|---|---|
| New RDD id | `INSERT` URDD + fan out its URDPs |
| Kept RDD | Untouched |
| Dropped RDD | Soft-deleted (`status='inactive'`) with its URDPs removed |
| Empty array | Removes every role the user holds **in the actor's tenant** |

`tenant_id` is derived from the actor's URDD (payload tenant fields ignored) and scopes the sync.

**Permission fan-out — Model B (the RDD owns its permission groups).** `syncUserRddSet` resolves the **set** of permission groups to fan out and materializes URDP as the **deduped UNION** of those groups' active permissions, in this order:

1. *(single-RDD only)* an explicit per-assignment `permission_group_id` hint — wins;
2. **the RDD's own active assignments** in `roles_designations_department_permissions` (`rddp`, managed by RddCrud step 4) — the source of truth, so adding/removing a PG on the RDD changes what **future** assignees get;
3. **governance fallback** `resolveGovernancePermissionGroup` — maps `(designation_code, role_name)` → the `PG-*` group; used only when the RDD has no `rddp` rows (governance-persona RDDs carry NULL `role_id`/`designation_id`, so without this they'd get 0 URDPs).

> **Scope:** only **new/edited** assignments re-materialize URDP. Existing holders of an RDD are **not** auto-re-synced when that RDD's permission groups later change.

Each step-2 helper wraps its work in a single `START TRANSACTION` / `COMMIT` (rollback on error). The `message` is dynamic — e.g. `"User updated successfully. Role assignments updated: 2 roles added, 1 role removed."`

**Add / Update response** (same shape for both steps — the shared post-process merges `step1*` and `step2*`):

```json
{
  "success": true,
  "message": "User updated successfully. Role assignments updated: 2 roles added, 1 role removed.",
  "users_userId": 123,
  "userRolesDesignationsDepartment_userRoleDesignationDepartmentId": 259,
  "userRolesDesignationsDepartment_userRoleDesignationDepartmentIds": [259, 260],
  "urdp_count": 7,
  "inserted_rdd_ids": [12, 13],
  "removed_rdd_ids": [9]
}
```

**List** returns the rows array, each augmented with `tenantUrddMap` (`{ "global": urddId, "<tenant_id>": urddId, … }` — the same structure returned after guest login); `table_count` per row is preserved so pagination is unaffected. **View** returns the raw user row including `userRolesDesignationsDepartment_roleDesignationDepartmentId` (a JSON array of the user's active RDD ids that drives the FE multi-select pre-selection).

> A failed role sync **throws** (step 2 rolls back), so the failure path never reaches the post-process. The step-2 helpers prefix the thrown error so the client gets a role-attributed message — `"Role assignment failed: <reason>"` (Add) / `"Role assignment update failed: <reason>"` (Update) — preserving the original `statusCode`.

---

## Error Responses

| Status | Condition |
|---|---|
| 400 | Missing required fields for the step. |
| 403 | Step 2 role sync — an RDD is not assignable to the actor's tenant (`assertRddAssignableToTenant`), surfaced as `"Role assignment failed: …"`. |
| 409 | Step 1 Add — an active user with that email already exists (`scc: "DUPLICATE"`), or an `ER_DUP_ENTRY` race. |

---

## Source Files

| File | Purpose |
|---|---|
| `Src/Apis/ProjectSpecificApis/CustomUsersGroupedCrud/CONTEXT.md` | Authoritative design doc (steps, `?guests=1`, Model-B fan-out, invariants). |
| `Src/Apis/ProjectSpecificApis/CustomUsersGroupedCrud/CustomUsersGroupedCrud.js` | API object — two steps, inline List/View SQL, `requireUrddTenantMatch` on step-2 Delete, dynamic-message post-processors. |
| `Src/Apis/ProjectSpecificApis/CustomUsersGroupedCrud/CRUD_parameters.js` | Request schema (sections `users`, `userRolesDesignationsDepartment`). |
| `Src/HelperFunctions/PreProcessingFunctions/CustomUsersGroupedCrud/step1_add_user.js` | Step 1 Add — INSERT user + translations + duplicate-email 409 gate. |
| `Src/HelperFunctions/PreProcessingFunctions/CustomUsersGroupedCrud/step1_update_user.js` | Step 1 Update — patch user row. |
| `Src/HelperFunctions/PreProcessingFunctions/CustomUsersGroupedCrud/step2_add_urdd_and_urdp.js` | Step 2 Add — link RDD set + fan out URDPs. |
| `Src/HelperFunctions/PreProcessingFunctions/CustomUsersGroupedCrud/step2_update_urdd_and_urdp.js` | Step 2 Update — re-sync RDD set + URDPs (replace-all). |
| `Src/HelperFunctions/PreProcessingFunctions/CustomUsersGroupedCrud/syncUserRddSet.js` | Shared engine — diff current-vs-desired URDDs, insert/keep/soft-delete, re-fan URDPs. |
| `Src/HelperFunctions/PreProcessingFunctions/CustomUsersGroupedCrud/resolveGovernancePermissionGroup.js` | Governance-persona fallback — `(designation_code, role_name)` → `PG-*` group. |
| `Src/HelperFunctions/PreProcessingFunctions/Guest/buildGuestUrddList.js` | Builds each listed user's `tenantUrddMap` (guest filter opt-in via `?guests=1`). |
