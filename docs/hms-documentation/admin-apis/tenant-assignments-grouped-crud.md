# Tenant Assignments Grouped CRUD

**Base route:** `/api/tenantAssignmentsGroupedCrud`  ·  **Version:** `?version=1.0`  ·  Single-step object with verbs overloaded onto CRUD methods.

| Method | Action | Who | Permission (per-resource, inline) | Returns |
|---|---|---|---|---|
| **POST** | **Assign** — deep-clone a SaaS-global row into a tenant (single or **bulk**) | Tenant Manager | `assign_service_categories_to_tenant` / `assign_location_type_to_tenant` | `{ success, clone_id, resource_type, source_id, target_tenant_id, already_existed, reactivated? }` (bulk → per-item report) |
| **DELETE** | **Revoke** — soft-delete a tenant clone after a dependency check (single or **bulk**) | Tenant Manager | `revoke_service_categories_from_tenant` / `revoke_location_type_from_tenant` | `{ success, revoked, clone_id, resource_type, already_inactive }` (+ `reparented_children` / `deferred` for `location_type`; bulk → per-item report) |
| **PUT** | **Propagate** (source-tracked types) or **Re-parent** (`location_type`) | SaaS Admin (propagate) / Tenant Manager (re-parent) | `assign_location_type_to_tenant` on re-parent | propagate → `{ updated[], conflicts[], notification? }`; re-parent → `{ reparented, clone_id, parent_id }` |
| **GET** (`?id=`) | **View** one clone (`?resource_type=` + `?id=`/`?clone_id=`) | admin | (broad envelope) | the clone row |
| **GET** | **List** a tenant's active clones (`?resource_type=` + `?target_tenant_id=`) | Tenant Manager | (broad envelope) | assigned rows (per-type match + clone-id fields) |

The **Phase 8** mechanism of the governance model. A **Tenant Manager** uses it to grant ("assign") a SaaS-global resource to a specific tenant, to **revoke** it, and (SaaS Admin) to **propagate** later edits of the global original into the tenant clones. **Assign = deep-clone the global row into the tenant's ownership** — each clone is stamped `created_by = URDD-B'` (the Tenant Manager's per-tenant URDD), and the existing `created_by`-based tenancy filter then exposes it inside that tenant with no framework change. Assign and revoke are **not** separate routes — they are POST and DELETE on the *same* object.

---

## Authentication & Authorization

Runs on the encrypted **AUTH platform**. `actionPerformerURDD` (URDD-B or URDD-B') is the actor — the permission gate and audit use it. Because the FE transport puts only the encrypted actor in GET headers and strips every DELETE body field except `Id`, **GET/DELETE params ride the query string**: List reads `?resource_type=&target_tenant_id=`, View reads `?id=` (`+ ?resource_type=`), revoke and its permission gate read `?id=` / `?resource_type=` (body still accepted as a fallback everywhere).

### Two-layer permission gate

1. **Static broad envelope** — `requestMetaData.permission: "assign_hms_config_keys_to_tenant"`. A coarse gate at the object level.
2. **Per-resource check (the real one)** — `enforceAssignmentPermission('assign'|'revoke')` runs first in the preProcess chain and looks up the actor's URDP for the **exact** permission for that `resource_type`:

| `resource_type` | Assign permission | Revoke permission |
|---|---|---|
| `service_category` | `assign_service_categories_to_tenant` | `revoke_service_categories_from_tenant` |
| `location_type` | `assign_location_type_to_tenant` | `revoke_location_type_from_tenant` |

> Note the plural/singular mismatch: `service_category` → **plural** permission names, `location_type` → **singular**. If the actor's URDP lacks the exact active permission, the gate throws **403**.

**URDD-B' is mandatory.** `assignResource` first resolves the tenant's URDD-B' (`user_id = 1`, designation `TENANT` + role `Manager`, `tenant_id = target_tenant_id`, active). If absent → **409** "run Phase 7 first". Every clone is owned by it.

---

## Request Payload

All verbs share one field set (`CRUD_parameters.js` → section `tenantAssignment`). Pre-processors read `decryptedPayload.body || decryptedPayload`.

| Field | Type | Used by | Meaning |
|---|---|---|---|
| `resource_type` | select (**required**) | all | `service_category` or `location_type` (see the not-assignable list below). |
| `source_id` | number \| **number[]** | assign, propagate | The **SaaS-global** row id(s) to clone/diff. An array bulk-assigns (alias `source_ids`). |
| `target_tenant_id` | number | assign, List | The tenant to assign to / list for. |
| `clone_id` | number \| **number[]** | revoke, View | The **clone** row PK(s). An array (or comma-separated `?id=4,7,9`) bulk-revokes (alias `clone_ids`). |
| `actionPerformerURDD` | number | all | Acting URDD (URDD-B or URDD-B'). |

### Not assignable / not directly assignable

- **`currency`, `region`, `country`, `supported_payment_method`** — platform-global reference data shared with every tenant via the query resolver's `TENANCY_FILTER_EXEMPT_TABLES`; never cloned. Every verb rejects them with **400**; List returns `[]`.
- **`config_key`** — no longer directly assignable/revocable. Config keys **cascade from their service category** (see the side-effect section). A direct `resource_type: "config_key"` POST/DELETE is rejected with **400**. `config_key` is still **propagatable** (PUT) and **viewable / listable**.

### Examples

```json
// POST — assign a service category (single)
{
  "resource_type": "service_category",
  "source_id": 44,
  "target_tenant_id": 7,
  "actionPerformerURDD": 130
}
```

```json
// POST — bulk assign (one resource_type per request; the shared attrs stay on the wire once)
{
  "resource_type": "location_type",
  "source_id": [101, 102, 103],
  "target_tenant_id": 7,
  "actionPerformerURDD": 130
}
```

```json
// DELETE — revoke a clone (single; params usually ride the query string ?id=&resource_type=)
{
  "resource_type": "service_category",
  "clone_id": 512,
  "actionPerformerURDD": 130
}
```

```json
// PUT — propagate a SaaS-Admin edit of the global original into the tenant clones
{
  "resource_type": "config_key",
  "source_id": 88,
  "actionPerformerURDD": 5
}
```

```json
// PUT — re-parent a location_type clone (dispatched to reparentLocationType)
{
  "resource_type": "location_type",
  "clone_id": 640,
  "parent_id": 631,
  "actionPerformerURDD": 130
}
```

---

## Behavior

Every call runs in a **single local transaction** (`START TRANSACTION` … `COMMIT`/`ROLLBACK`, connection released in `finally`). Each assign/revoke writes an `audit_logs` row (`action = 'assign'|'revoke'`), wrapped so it's non-fatal if the table is absent.

### Assign (POST)

**Deep-clones the global row into the tenant.** Two code paths by `resource_type`:

- **Source-tracked deep clone** (`service_category`) — carries a `source_service_category_id` lineage column; delegated to `deepCloneServiceCategoryForTenant` (parent self-ref + translations).
- **Simple clone** (`location_type`) — no lineage column; tenancy is *only* `created_by = URDD-B'`. Copies all columns except PK/timestamps, rewriting `created_by`/`updated_by` → URDD-B'. Idempotency key = the natural `type` scoped to `created_by`.

**Idempotent.** Before cloning it checks for an existing clone (`status != 'inactive'`, so `needs_review` clones don't duplicate) and returns `already_existed: true` instead of duplicating.

**Re-assign after revoke reactivates in place — every path.** If the existing clone is `inactive`, it is flipped back to `active` keeping the clone id and any tenant edits. Simple types return `already_existed: false, reactivated: true`; source-tracked types reactivate inside the deep-clone helper (status-aware idempotency), and the caller's side-effects re-run to restore what a revoke pruned.

**Bulk assign.** An id **array** returns `{ bulk: true, resource_type, total, succeeded, failed, results[] }`. Each item runs in its **own transaction** (the wrapper loops `assignOne`), so one bad id — 404, D5 409 — is reported in its slot without rolling back or blocking the others. The permission gate runs once per request. Top-level `success` is `failed === 0`.

#### `location_type` hierarchy (assign)

`parent_id` is a self-reference (building > floor > zone; root = `null`), **not** a lineage column.

- **Assign-time override** — the admin may set `parent_id` to one of the tenant's **own** active location_types, or `null` = root. Validated **tenant-local** (active + `created_by = URDD-B'`); a global id or another tenant's clone is rejected **400**.
- **No override** (e.g. the create-time bulk auto-assign) — inserted at **root**; a `reconcileLocationTypeHierarchy` post-pass then mirrors the global shape by matching on `type` and **never clobbers** a manager-customised parent (idempotent).

#### Side effect on `service_category` assign (important)

Assigning a `service_category` also, in the same transaction:

1. **Cascade-clones config keys.** `assignConfigKeysForCategory` clones every SaaS-global config key whose `applies_to` includes this category (or is the bare `*` sentinel). `deepCloneConfigKeyForTenant` is idempotent + status-aware. `backfillCategoryAcrossConfigKeys` then materializes this category's possible values into keys cloned for an *earlier* category.
2. **Clones package-only config keys.** `assignPackageScopedConfigKeys` clones every SaaS-global **package-only** key (`applies_to = ["package"]`, no service category) — these ride on owning *any* category (cloned alongside the first, a no-op thereafter).
3. **Eagerly clones the per-category Service Manager RDD** via `cloneServiceManagerRddForTenant` (`manager` / `<category>` designation / the tenant's staff department, owned by URDD-B') so the Service Manager persona shows in RDD pickers immediately.

> **D5 guard:** a category-scoped config key assigned when the tenant owns no in-scope category → **409** "assign the relevant service categories first" (package-only keys exempt).

### Revoke (DELETE)

**Soft-delete (`status='inactive'`) gated by a dependency check** (`findDependents`). `service_category` deps are active `services` / `packages` / `delivery_units`; `location_type` uses the shared **in-use-services subtree probe** (`inUseServicesProbe`) — any location of that type or its descendants (recursive over `locations.parent_id`) still linked via an active `service_locations` row to a service whose status is `active`/`probation`/`archived`. Source-tracked types also require a non-null `source_*_id` (refuses to revoke a non-clone).

**Deferred-delete "probation" (both revocable types).** With **live deps**, revoke no longer 409s — it parks the clone in **`probation`** and **defers its child cascade**, returning `{ revoked:false, deferred:true, status_set:'probation', dependents }`. The **probation-finalizer cron** re-checks the same probes and, once they clear, flips the clone to `inactive` **and** runs the deferred work (`SPECIAL_FINALIZE.<table>`):

- `service_category` → the **config-key cascade** (below);
- `location_type` → the **promote/splice** of children.

With **no** live deps, revoke finalizes to `inactive` and runs the cascade/promote **immediately**, exactly as before.

#### `location_type` revoke = promote / splice

Revoking a node re-parents its direct **active** children to the revoked node's **parent** (grandparent), so a child is never left under an inactive parent. Revoking a **root** makes its children roots (`parent_id NULL`). The immediate (no-deps) revoke does this in the same transaction and returns `reparented_children: <n>`; the deferred (probation) path does it at cron finalize. The node's **former children are NOT auto-restored** on a later re-assign.

#### `service_category` config-key cascade (revoke)

`cascadeCategoryRevoke` prunes the category's values / `enabled_for` / `applies_to` from the clone keys, then `cascadeRevokeOrphanedConfigKeys` soft-deletes only the keys this leaves orphaned. Orphaning rule by the clone's `applies_to`:

- `*` clone → orphaned iff the tenant owns **0** active categories;
- **package-only** clone (`["package"]`) → treated like `*` (survives until the **last** category goes);
- explicit-array clone → orphaned iff none of its `applies_to` ids is still an owned-active category.

### Propagate / Re-parent (PUT)

The PUT is **dispatched by `resource_type`** (`updateAssignment`): `location_type` → **re-parent** (`reparentLocationType`, gated by the assign permission, tenant-local + cycle guards); everything else → **propagate**.

**Propagate** applies later SaaS-Admin edits of the global original into existing clones (diff-and-flag), returning `{ updated, conflicts }`: `updated` = clone ids auto-synced from the source; `conflicts` = clones the tenant has edited since creation, which are **left untouched** (reported, not overwritten, no status change). Clones do **not** auto-update — this is the SaaS-Admin's explicit re-sync. Accepts a `source_id` **array** to batch several originals (one transaction per item). For `config_key`, the Tenant Admin(s) of every tenant whose clone was auto-updated get **one** consolidated plain-language email per request (`notifyTenantAdminsOfConfigChange`).

### View / List (GET)

- **View** (`?id=` present) reads one clone by `?clone_id=`/`?id=` + `?resource_type=` (inline SQL over the type's table). The shared-global reference types are not viewable here.
- **List** is a **pre-processor** (`listAssignedResources`), not the generic query path — because it is a *cross-tenant* admin read (a Tenant Manager listing a *target* tenant's clones) and the generic path both injects the acting tenant's `created_by` filter (emptying the read) and never sees the query-string `target_tenant_id` (#219). It resolves the scope explicitly (`created_by → URDD → tenant_id`), excludes revoked clones (`status != 'inactive'`), and returns each row with the per-type **match field** + **clone-id field**: `service_category` → `source_id` + `clone_id`; `location_type` → `type` + `id`.

---

## Response Shapes

**Assign (single):**

```json
{
  "success": true,
  "clone_id": 512,
  "resource_type": "service_category",
  "source_id": 44,
  "target_tenant_id": 7,
  "already_existed": false,
  "reactivated": false
}
```

**Bulk assign / revoke / propagate:**

```json
{
  "success": true,
  "bulk": true,
  "resource_type": "location_type",
  "total": 3,
  "succeeded": 2,
  "failed": 1,
  "results": [
    { "success": true, "clone_id": 640, "source_id": 101, "resource_type": "location_type", "target_tenant_id": 7, "already_existed": false },
    { "success": false, "source_id": 102, "statusCode": 404, "error": "source row not found" }
  ]
}
```

**Revoke (single, `location_type`, immediate):**

```json
{
  "success": true,
  "revoked": true,
  "clone_id": 640,
  "resource_type": "location_type",
  "already_inactive": false,
  "reparented_children": 2
}
```

**Revoke (deferred — live deps):**

```json
{
  "success": true,
  "revoked": false,
  "deferred": true,
  "status_set": "probation",
  "clone_id": 512,
  "resource_type": "service_category",
  "dependents": { "services": 3, "packages": 1 }
}
```

**Propagate:**

```json
{
  "success": true,
  "resource_type": "config_key",
  "source_id": 88,
  "updated": [512, 613],
  "conflicts": [720],
  "notification": { "tenants_notified": 2 }
}
```

---

## Error Responses

| Status | Condition |
|---|---|
| 400 | Missing `resource_type`. |
| 400 | `resource_type` is a shared-global type (`currency` / `region` / `country` / `supported_payment_method`) — no assign/revoke needed. |
| 400 | Direct `config_key` assign/revoke — "assign/revoke the service category instead". |
| 400 | `location_type` `parent_id` override points at a global id or another tenant's clone (not tenant-local). |
| 403 | Actor's URDP lacks the exact `assign_*_to_tenant` / `revoke_*_from_tenant` permission for the resource. |
| 404 | Source/clone row not found (per-item in bulk). |
| 409 | URDD-B' absent for the target tenant — "run Phase 7 first". |
| 409 | D5 — a category-scoped config key assigned when the tenant owns no in-scope category ("assign the relevant service categories first"). |

---

## Source Files

| File | Purpose |
|---|---|
| `Src/Apis/ProjectSpecificApis/TenantAssignmentsGroupedCrud/CONTEXT.md` | Authoritative design doc (verbs, clone paths, probation, cascades, invariants). |
| `Src/Apis/ProjectSpecificApis/TenantAssignmentsGroupedCrud/TenantAssignmentsGroupedCrud.js` | API object — verb overloading, PUT dispatcher (`updateAssignment`), inline View SQL, per-verb post-processors. |
| `Src/Apis/ProjectSpecificApis/TenantAssignmentsGroupedCrud/CRUD_parameters.js` | Shared request schema (section `tenantAssignment`). |
| `Src/HelperFunctions/PreProcessingFunctions/TenantAssignmentsGroupedCrud/enforceAssignmentPermission.js` | Per-resource permission gate (factory); rejects shared-global & cascade-only types. |
| `Src/HelperFunctions/PreProcessingFunctions/TenantAssignmentsGroupedCrud/assignResource.js` | Assign — deep/simple clone, idempotency, reactivation, bulk, `service_category` side-effects. |
| `Src/HelperFunctions/PreProcessingFunctions/TenantAssignmentsGroupedCrud/revokeResource.js` | Revoke — dependency check, probation deferral, cascades, promote/splice, bulk. |
| `Src/HelperFunctions/PreProcessingFunctions/TenantAssignmentsGroupedCrud/propagateAssignment.js` | Propagate — SaaS-Admin re-sync of global edits into clones (updated/conflicts). |
| `Src/HelperFunctions/PreProcessingFunctions/TenantAssignmentsGroupedCrud/reparentLocationType.js` | Re-parent a `location_type` clone (tenant-local + cycle guards). |
| `Src/HelperFunctions/PreProcessingFunctions/TenantAssignmentsGroupedCrud/listAssignedResources.js` | List a tenant's active clones (cross-tenant admin read; resolves scope itself). |
| `Src/HelperFunctions/PayloadFunctions/Governance/deepCloneServiceCategoryForTenant.js` | Deep-clone helper for `service_category` (status-aware idempotency). |
| `Src/HelperFunctions/PayloadFunctions/Governance/deepCloneConfigKeyForTenant.js` | Deep-clone helper for config keys (two-pass id-remap; invoked via category cascades). |
| `Src/HelperFunctions/PayloadFunctions/Governance/materializeConfigValuesForCategory.js` | Config-key cascade helpers (assign/backfill/cascade-revoke). |
| `Src/HelperFunctions/PayloadFunctions/Governance/cloneServiceManagerRddForTenant.js` | Eager per-tenant Service-Manager RDD clone on category assign. |
| `Src/HelperFunctions/PayloadFunctions/Governance/propagateAssignmentUpdates.js` | The propagation engine (diff, conflict detection, notifications). |
