# Resource Assignments

When a hotel is first created it is an **empty shell** — it has an org chart (staff personas) but **no config keys, no service categories, no location types**. Resource assignment is how a **Tenant Manager** hands those framework pieces to a specific hotel, one resource at a time, and later revokes them or pushes updated versions in.

> **Prerequisite:** read [governance-model.md](../tenant-governance-model/governance-model.md) (especially the `created_by` isolation rule) and skim [per-tenant-cloning.md](../per-tenant-cloning/per-tenant-cloning.md). "Assign" is just "clone," and everything here builds on that.

**Route (by convention):** `/api/tenantAssignmentsGroupedCrud` — a single grouped CRUD object whose verbs are overloaded onto the standard CRUD methods (POST/DELETE/PUT/GET).

---

## Authentication

Requires an authenticated **admin-platform** JWT with a valid `actionPerformerURDD` (the acting Tenant Manager / system actor). Two permission layers apply — a static broad envelope on the API object plus a per-resource gate (`assign_<type>_to_tenant` / `revoke_<type>_from_tenant`). Full detail in [§9 Permissions](#9-permissions--two-layers).

---

## 1. The core idea: assign = clone into ownership

Recall the one isolation rule: a row is visible to tenant **X** only if its `created_by` is a URDD belonging to X. A SaaS-global resource (a `base_price` config key, say) is owned by the *system* tenant, so Hotel X can't see it.

**Assigning copies that row and stamps `created_by = URDD-B′`** — the Tenant Manager's per-tenant URDD inside Hotel X. The instant that copy exists, the ordinary tenancy filter exposes it to Hotel X. **No framework change, no special-case in the resolver** — just a new owned row. That is the entire mechanism.

Two consequences a newcomer should internalise:

- A clone is **the tenant's own editable copy.** The hotel can change it freely.
- Later edits to the *original* by the SaaS Admin do **not** flow into the clone automatically. Re-syncing is a separate, explicit action — **propagate** (§6).

---

## 2. The lifecycle of an assigned resource

```
        assign (POST)                  edit by tenant            propagate (PUT)            revoke (DELETE)
SaaS-global ───────────► tenant clone ───────────► customised ──────────────► (kept,        ───────────► inactive clone
 original    deep-clone   (created_by=URDD-B′)      clone        diff & flag    flagged        soft-delete   (id kept;
                                                                 needs_review)  if diverged)                 reactivates on re-assign)
```

| Stage | Verb | Who | Effect |
|---|---|---|---|
| Hand the resource to a hotel | **assign** (POST) | Tenant Manager | Deep-clone the global original into the hotel, owned by URDD-B′. |
| Hotel adjusts it | (normal CRUD) | Tenant Admin | Edits the clone — diverges from the original. |
| Roll out an updated original | **propagate** (PUT) | SaaS Admin | Diff the original vs each clone; auto-update untouched clones, flag customised ones. |
| Take the resource away | **revoke** (DELETE) | Tenant Manager | Soft-delete the clone (after a dependency check). Re-assigning later reactivates the same row. |

---

## 3. The verbs

| Method | Action | Returns (single) |
|---|---|---|
| **POST** (`Add`) | **assign** — clone a global row into a tenant | `{ success, clone_id, resource_type, source_id, target_tenant_id, already_existed }` (+ `reactivated: true` on re-assign-after-revoke) |
| **DELETE** (`Delete`) | **revoke** — soft-delete a clone after a dependency check | `{ success, revoked, clone_id, resource_type, already_inactive }` |
| **PUT** (`Update`) | **propagate** — push edits of a global original into its clones | `{ success, resource_type, source_id, updated[], conflicts[], notification }` |
| **GET** (`View`, `?id=`) | read one clone | the clone row |
| **GET** (`List`) | list a tenant's active clones for one `resource_type` | rows, each with its match field + clone-id field |

> `assign` and `revoke` are **not** separate routes — they are POST and DELETE on the *same* object. The "verb" is the HTTP method.

---

## 4. Request payload

All verbs share one field set:

| Field | Type | Used by | Meaning |
|---|---|---|---|
| `resource_type` | string (**required**) | all | one of the resource types in §5 |
| `source_id` | number \| number[] | assign, propagate | the **SaaS-global** row id(s) to clone / diff (array = bulk; alias `source_ids`) |
| `target_tenant_id` | number | assign, List | the tenant to assign to / list for |
| `clone_id` | number \| number[] | revoke, View | the **clone** PK(s) (array, or `?id=4,7,9` = bulk; alias `clone_ids`) |
| `actionPerformerURDD` | number | all | the acting URDD — the permission gate and audit log use it |

```json
{
  "resource_type": "config_key",
  "source_id": 67,
  "target_tenant_id": 12,
  "actionPerformerURDD": 5
}
```

> **`source_id` vs `clone_id` — don't mix them up.** `source_id` is the id of the *global original* (used to assign/propagate). `clone_id` is the PK of the *tenant's copy* (used to revoke/view). Assigning by clone id, or revoking by source id, is a common first mistake.

> **Transport note.** GET/DELETE params ride the **query string** (the FE strips DELETE bodies down to `Id` and sends only the encrypted actor in GET headers). So: List reads `?resource_type=&target_tenant_id=`; View reads `?id=&resource_type=`; revoke reads `?id=&resource_type=` (a body is still accepted as a fallback everywhere).

---

## 5. Resource types and the two clone paths

`resource_type` selects one of two code paths:

| Path | Types | Lineage column | What's special |
|---|---|---|---|
| **Source-tracked deep clone** | `config_key`, `service_category`, `scenario_config` | `source_*_id` | Carries a lineage column pointing back to the global original, so `propagate` can re-sync it later. Each delegates to a dedicated deep-clone helper. |
| **Simple clone** | `location_type` | — | No lineage; tenancy is *only* `created_by = URDD-B′`. Copies all columns except PK/timestamps. The admin may override `parent_id` at assign time. |

**Not assignable — shared reference data.** `currency`, `region`, `country`, and `supported_payment_method` are platform-global reference data (tenancy-exempt — shared with every tenant via the resolver, never cloned). Every verb rejects them with a **400**, and List returns `[]`. The old per-tenant clones of these were retired by a migration. (See the exempt-tables list in [governance-model.md](../tenant-governance-model/governance-model.md#45-exempt-tables-shared-reference-data).)

> Why two paths? Source-tracked types are *configuration* that the platform keeps improving, so they need a lineage link to support re-sync. `location_type` is a simple lookup with no such need — copying it plainly is enough.

---

## 6. Assign — step by step

When a `POST` arrives:

1. **Resolve URDD-B′.** Find the tenant's per-tenant Tenant-Manager URDD (user 1, designation `TENANT` + role `Manager`, `tenant_id = target_tenant_id`, active). If it doesn't exist → **409 "run provisioning first"** (the hotel was never provisioned). Every clone will be owned by this URDD.
2. **Idempotency check.** If an active clone already exists (source-tracked: by `source_id + created_by`; simple: by natural key + `created_by`) → return `already_existed: true` instead of creating a duplicate.
3. **Reactivate-after-revoke.** If the existing clone is `inactive`, flip it back to `active` in place — keeping its id and any tenant edits — and return `reactivated: true`.
4. **Clone.** Deep-clone (or simple-copy) the row, stamping `created_by = URDD-B′`.

### 6.1 Worked example — assign a config key

```http
POST /api/tenantAssignmentsGroupedCrud
{ "resource_type": "config_key", "source_id": 67,
  "target_tenant_id": 12, "actionPerformerURDD": 5 }
```

Response (first time):

```json
{ "success": true, "clone_id": 412, "resource_type": "config_key",
  "source_id": 67, "target_tenant_id": 12, "already_existed": false }
```

Now Hotel 12 owns clone `412` of the `base_price` key, and the Tenant Admin can configure it via the [config-keys API](../config-keys/config-keys.md). Calling the same assign again returns `already_existed: true` with the same `clone_id`.

### 6.2 Bulk assign / revoke

Pass an **id array** to assign or revoke many at once; the shared attributes (`resource_type`, `target_tenant_id`, `actionPerformerURDD`) stay on the wire once. Each item runs in its **own transaction**, so one bad id (404, a guard 409, a revoke blocked by dependents) is reported in its own slot without rolling back or blocking the others:

```json
{ "success": true, "bulk": true, "resource_type": "config_key",
  "total": 3, "succeeded": 2, "failed": 1,
  "results": [
    { "success": true,  "clone_id": 412, "source_id": 67, "already_existed": false },
    { "success": true,  "clone_id": 413, "source_id": 68, "already_existed": true  },
    { "success": false, "source_id": 99, "statusCode": 404, "error": "source not found" }
  ] }
```

Top-level `success` is `failed === 0`. A **single** id returns the familiar single-object shape, byte-for-byte unchanged — so callers that send one id never have to handle the bulk envelope.

### 6.3 Side effect — assigning a `service_category`

Assigning a `service_category` also, **in the same transaction**, eagerly clones the per-category **Service Manager RDD** (`Manager` / `<category>` designation / the hotel's department `TENANT_<code>`, owned by URDD-B′). This means the Service Manager persona shows up in RDD pickers **immediately**, before any Service Manager is actually provisioned. (The lazy provisioning path later dedups onto this same RDD.)

> This is the re-modelled shape: the category lives on the **designation**, and the SM's department is the hotel. There is no longer a per-category `DEPT_<code>` department.

### 6.4 Config-key clone specifics

The `config_key` deep clone is scoped to the tenant's **owned categories** and is order-independent:

- **`applies_to`** — the bare `*` sentinel is preserved as `*`; an explicit id array is filtered to the tenant's owned category ids.
- **Values** — service-scope possible values (`hms_config`) are cloned **only for owned categories ∩ `applies_to`**, remapped to the tenant's category ids. `possible_values` is **rebuilt** from the cloned rows (never copied); `enabled_for` is **pruned** to owned categories. Applied-value data in `services`/`packages` is **never** cloned.
- **D5 guard** — assigning a category-scoped key when the tenant owns *no* in-scope category → **409 "assign the relevant service categories first"** (package-only keys are exempt).
- **Back-sync** — assigning a `service_category` *after* its configs already exist back-fills that category's possible values and `enabled_for` flag.
- **`category_id` is copied verbatim, not remapped.** A key's `category_id` is a FK to the framework-global `hms_config_categories` lookup (the admin-UI grouping), **not** `service_categories`. Remapping it through the category-id map would point it at a non-existent row and break the FK. (The id-remap *does* apply to the genuine `service_categories` references — `applies_to`, `enabled_for`, `hms_config.record_id`.)

---

## 7. Revoke — take a resource away

Revoke is a **soft-delete** (`status = 'inactive'`) gated by a **dependency check** so you can't pull a resource still in use:

| Type | Blocked by active… |
|---|---|
| `service_category` | `services` / `packages` / `delivery_units` |
| `location_type` | `service_locations` |
| `config_key` / `scenario_config` | nothing (no hard FK) — never blocked |

A blocked revoke returns **409** with a `dependents` array listing what's in the way. Source-tracked types also require a non-null `source_*_id` (it refuses to revoke a row that isn't actually a clone). Revoking a `service_category` **cascades**: its value rows are soft-deleted and the category is pruned from every clone key's `possible_values` / `enabled_for` / `applies_to`.

Revoking is reversible: a later assign of the same resource **reactivates** the inactive clone in place (§6 step 3), preserving its id and the tenant's edits.

---

## 8. Propagate — re-sync an updated original

Clones never auto-update. **Propagate** is the SaaS Admin's *explicit* re-sync of an edited global original into its clones. This `PUT` diffs the original against each clone and:

- **auto-updates** clones that haven't diverged → returned in `updated[]`
- **flags** clones the tenant has already customised for manual review → returned in `conflicts[]`

```http
PUT /api/tenantAssignmentsGroupedCrud
{ "resource_type": "config_key", "source_id": 67, "actionPerformerURDD": 1 }
```

It accepts a `source_id` **array** to batch several originals (one transaction per item, like bulk assign). For `config_key`, the Tenant Admin(s) of every tenant whose clone was auto-updated get **one** consolidated, plain-language email per request (up to 3 config names spelled out, the rest folded into "and N more").

> Propagate is the same machinery `apply_on_all` uses in the [config-keys API](../config-keys/config-keys.md#apply_on_all--propagate-a-system-level-change-to-tenants) — there it is triggered as a side effect of editing the original's `enabled_for`; here it is the primary action.

---

## 9. Permissions — two layers

1. A **static broad envelope** declared on the API object (`requestMetaData.permission`, e.g. `assign_hms_config_keys_to_tenant`) — a coarse gate.
2. The **real per-resource check** — `enforceAssignmentPermission('assign'|'revoke')` runs before assign/revoke and looks up the actor's exact `assign_<type>_to_tenant` / `revoke_<type>_from_tenant` permission in URDP.

> **Singular vs plural — a real footgun.** `resource_type` strings are **singular**, but most permission names are **plural**: `service_category` → `assign_service_categories_to_tenant`, yet `location_type` → `assign_location_type_to_tenant` (singular!). The exact mapping lives in `enforceAssignmentPermission.js` — consult it rather than guessing.

---

## 10. Other behaviours worth knowing

- **Audit.** Each assign/revoke writes an `audit_logs` row (`action = 'assign'|'revoke'`), wrapped so a missing `audit_logs` table is non-fatal.
- **List is a cross-tenant admin read.** A Tenant Manager listing a *target* tenant's clones can't go through the generic List path — the tenancy filter would inject the *acting* tenant's URDDs and empty the result. So `listAssignedResources` resolves the scope explicitly (`created_by → URDD → tenant_id`) on its own connection. It excludes revoked clones (`status != 'inactive'`) but keeps `needs_review` rows. Per type, the match/revoke fields differ: `config_key`/`service_category`/`scenario_config` → `source_id` + `clone_id`; `location_type` → `type` + `id`.
- **One local transaction per call** (`START TRANSACTION` … `COMMIT`/`ROLLBACK`, connection released in `finally`). Bulk wraps one transaction *per item*.

---

## Response

All responses use the standard envelope: `{ success, data, meta, error }`. The per-verb `data` shapes are listed in [§3 The verbs](#3-the-verbs); bulk shapes in [§6.2](#62-bulk-assign--revoke).

### Success (200)

| Verb | `data` shape |
|---|---|
| assign | `{ success, clone_id, resource_type, source_id, target_tenant_id, already_existed }` (+ `reactivated: true` on re-assign-after-revoke). |
| revoke | `{ success, revoked, clone_id, resource_type, already_inactive }`. |
| propagate | `{ success, resource_type, source_id, updated[], conflicts[], notification }`. |
| assign/revoke (bulk) | `{ success, bulk: true, resource_type, total, succeeded, failed, results[] }`. |

### Error Responses

| Status | Message | Condition |
|---|---|---|
| 400 | `resource_type is shared reference data` | `currency` / `region` / `country` / `supported_payment_method` — not assignable. |
| 400 | `BAD_REQUEST` | Missing/invalid `resource_type`, `source_id`, or `clone_id`; `location_type` `parent_id` not owned. |
| 403 | Forbidden (`E41`) | The actor lacks the `assign_*`/`revoke_*` permission. |
| 404 | source / clone not found | `source_id` is not a SaaS-global original, or `clone_id` does not exist. |
| 409 | `run provisioning first` | The tenant has no URDD-B′ — it was never provisioned. |
| 409 | `assign the relevant service categories first` | **D5 guard** — a category-scoped `config_key` assigned with no owned in-scope category. |
| 409 | revoke blocked (`{ dependents: [...] }`) | The clone still has active dependents (services / packages / delivery units / service locations). |

---

## Database Changes

| Table | Written when |
|---|---|
| `hms_config_keys` | `config_key` assign (clone INSERT / reactivate); propagate (clone UPDATE); revoke (soft-delete + cascade prune of `possible_values`/`enabled_for`/`applies_to`). |
| `hms_config` / `hms_config_possible_values` | `config_key` assign (cloned value rows); `service_category` revoke (cascade soft-delete). |
| `service_categories` | `service_category` assign (clone INSERT); revoke (soft-delete). |
| `hms_scenario_config` | `scenario_config` assign (clone INSERT, remapped `hms_config.id` refs). |
| `location_type` | `location_type` assign (simple clone INSERT). |
| `roles_designations_department` | `service_category` assign — eager per-category Service-Manager RDD clone. |
| `audit_logs` | Every assign / revoke (`action='assign'|'revoke'`; non-fatal if absent). |

All clones are stamped `created_by = URDD-B′`.

---

## Change Log

| Date | Change |
|---|---|
| 2026-06-10 | Initial documentation of the assign / revoke / propagate API. |
| 2026-06-09 | Persona re-model — the Service-Manager category moved onto the **designation**; the eager SM RDD now uses the tenant's hotel department `TENANT_<code>` (the per-category `DEPT_<code>` department is no longer created). |
| 2026-06-05 | `currency` / `region` / `country` / `supported_payment_method` reclassified as shared reference data (no longer assignable); pre-existing clones deactivated by migration `20260605_6`. |

---

## Source references

| Topic | Source |
|---|---|
| Full pre-processor reference (assign/revoke/propagate internals, gotchas) | `Src/Apis/ProjectSpecificApis/TenantAssignmentsGroupedCrud/CONTEXT.md` |
| Deep-clone helpers | `Src/HelperFunctions/PayloadFunctions/Governance/deepClone*ForTenant.js` |
| Governance strategy (§8 assignment, §14 resolutions) | `docs/strategies/superadmin_tenant_governance_strategy.md` |
| What gets cloned, when | [per-tenant-cloning.md](../per-tenant-cloning/per-tenant-cloning.md) |
| Config-key clone correctness | `docs/strategies/tenant_config_value_sync_strategy.md` |
