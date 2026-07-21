# Config Keys & How They're Enabled

The configuration system is how a hotel decides **which settings exist for which kind of service, and what values those settings can hold** — without a code change. A "config key" like `base_price` or `cancellation_margin` is a *definition*; turning it on for the Dining category and giving it allowed values is *configuration*. This guide explains the data model behind that and the single API that drives it.

> **Prerequisite:** read [governance-model.md](../tenant-governance-model/governance-model.md) first — this guide assumes you understand `created_by` tenancy isolation and the SaaS-Admin-owns-the-original / tenant-owns-a-clone split.

**Base route:** `/api/hms_config_keys/enabled_for` — one route whose behaviour changes based on query params (explained in §3).

> **Two APIs over config keys — don't confuse them.** This doc covers the **write/manage** CRUD (`/api/hms_config_keys/enabled_for`): toggling `enabled_for` and managing `possible_values`. There is also a separate **read-only browse** API, `GET /api/hms_config_keys_catalog` (dual-locale List + View), documented in [config-keys-catalog.md → The Catalog API](./config-keys-catalog/config-keys-catalog.md#the-catalog-api). Use the catalog API to *read* key definitions; use this one to *configure* them.

---

## Authentication

Requires an authenticated **admin-platform** JWT carrying a valid `actionPerformerURDD` (sent in the encrypted request header on every request, GETs included; a query param is accepted only as an explicit override).

There is **no per-operation permission gate** beyond the auth layer (`permission: null` on the API object). Access is constrained instead by **tenant-ownership guards** that run in the pre-process — see [Tenancy & ownership](#5-tenancy--ownership). In short:

| Caller | What they may edit |
|---|---|
| SaaS Admin (system-tenant URDD) | The **global originals** (`tenant_id = "all"`). |
| Tenant Manager / Tenant Admin (tenant URDD) | Only that tenant's **clones**. |

---

## 1. The mental model (read this first)

Three ideas trip up every newcomer. Get them straight up front:

1. **A config key is a definition, not a value.** `hms_config_keys` answers *"does a setting called `base_price` exist, what widget renders it, which service categories may use it?"* The actual numbers/options live in **other tables**.
2. **`enabled_for` is a switchboard.** It is a small JSON map on the key that says *"this key is ON for service category 1 and 2, OFF for 3, ON for packages."* It does **not** hold values — only on/off flags per scope.
3. **Option values live in `hms_config_possible_values`, scope-tagged.** Both service and package options are rows in that one table, tagged by `scope_constraint_name` (+ `scope_constraint_value` for a service category) and ordered by `config_value_num`. *(The old `hms_config_keys.possible_values` pointer map is retired — see §2.2.)*

If you remember nothing else: **the key is metadata; the option values live in `hms_config_possible_values`; `enabled_for` is just flags.**

---

## 2. The data model

Four tables work together. (The lookup tables and the full per-key inventory are in [config-keys-catalog.md](./config-keys-catalog/config-keys-catalog.md); this is the structural view.)

> **Storage refactor.** Both service **and** package option values now live in **one** table,
> `hms_config_possible_values`, distinguished by a **scope tag** — not by table. The old split
> (service in `hms_config`, package in `hms_config_possible_values`) and the `hms_config_keys.possible_values`
> pointer map are retired. This section is the structural overview; the authoritative reference for
> where option values live and how they're read/written is
> [config-storage-model.md](./config-storage-model/config-storage-model.md).

| Table | Holds | Think of it as |
|---|---|---|
| `hms_config_keys` | The **key definitions**: name, display name, target table, category, `applies_to` (which service categories may use it), `enabled_for` (on/off flags), `value_type` (which widget). Seeded centrally by migrations. *(`possible_values` — the old pointer map — is a frozen legacy column, no longer read.)* | The catalog of *what settings can exist*. |
| `hms_config_possible_values` | **All option values — service AND package.** Scope-tagged: `scope_constraint_name='service_categories'` + `scope_constraint_value=<category_id>` for a service option, `='packages'` for a package option, or **`='*'` for a both-scope / key-wide option** (applies to every category *and* packages; see §2.2). Value in `config_possible_value`, ordered by `config_value_num`. | "The allowed values of this key, per scope." |
| `translated_entries` | The **Arabic** side of simple option labels (`en` is stored bare on the option row; `ar` lives here). Structured values keep their object inline. | "The other-language text for a value." |
| `hms_config` | **Applied** values — what a specific *service/package instance* picked (`base_table='services'`/`'packages'`). Written by the CustomServices/CustomPackages APIs, **not** this one. | "This service chose value X for key K." |
| `hms_config_categories` | The admin-UI grouping categories (Basics, Pricing, …). | The section headers in the admin UI. |

### 2.1 `enabled_for` — the switchboard

A JSON map of `{ "<scope>": 0|1 }` on each key. Scope keys are usually `"1"`–`"9"` (the service category ids) plus the literal `"package"`:

```json
{ "1": 1, "2": 1, "3": 0, "package": 1, "user": 0 }
```

The frontend always sends the **complete** object on an update; the backend sanitises every value to `0` or `1` and replaces the whole map (it never merges). Keys are accepted **verbatim** — there is no whitelist — so a new scope type (`tenant`, `room`, …) needs no backend release, but a typo silently becomes a new key in the stored JSON.

### 2.2 Where option values live (`hms_config_possible_values`)

Every selectable option — service or package — is a row in `hms_config_possible_values`, tagged with the scope it applies to:

```sql
-- service-category options for key K, one row per category, in display order
SELECT id, scope_constraint_value AS category_id, config_possible_value, config_value_num
FROM hms_config_possible_values
WHERE config_id = K AND scope_constraint_name = 'service_categories' AND status <> 'inactive'
ORDER BY CAST(scope_constraint_value AS UNSIGNED), config_value_num;

-- package options for key K (key-wide)
SELECT id, config_possible_value, config_value_num
FROM hms_config_possible_values
WHERE config_id = K AND scope_constraint_name = 'packages' AND status <> 'inactive'
ORDER BY config_value_num;
```

> **Retired:** the old `hms_config_keys.possible_values` pointer map (`{ "<cat>": [ids], "package": [ids] }`) is **no longer read** — order and membership come from `config_value_num` + the scope tag. `syncPossibleValues` is a no-op for service and only touches the legacy `["package"]` slot. The column is frozen pending a drop; never rely on it.

> **SHARED options (`'*'`).** An option can be stored **once** as a key-wide *shared* row instead of per category — two shapes: **Case A** `scope_constraint_name='*'` (every service category **and** packages) and **Case B** `scope_constraint_name='service_categories'` + value `'*'` (every service category). Each PV response carries **`isKeyWide`** (`0` explicit · `1` Case A · `2` Case B). **Admin-side** readers fold shared rows into both scopes and fan them server-side into every `enabled_for` category (Case A also into packages; helper `Governance/scopeStarFanout.js`). On edit/delete the FE sends **`keep_shared`**: `true` = change in place (stays shared); `false`/omitted = **split** for the target category only. Add with `keep_shared=true` creates a Case A `'*'` option directly. Tenant cloning/propagation mirror shared rows too. **Guest-side readers are unchanged** (explicit only). Full detail: [config-storage-model.md §1.1](./config-storage-model/config-storage-model.md).

### 2.3 How values are stored (§8.2 split)

An option's `config_possible_value` is stored in one of two forms (decided by structure), so translations of simple labels are externalised:

- **Simple** (`{ en, ar }`, no `key`/`label`/`group`) → the **bare `en` string** is stored on the row; the Arabic goes to `translated_entries` (`table_name='hms_config_possible_values'`, `column_name='config_possible_value'`, `record_id=<option id>`, `language_code='ar'`).
- **Structured** (carries `key`/`label`/`group`) → the **whole object** is stored inline (the `key` slug survives), plus an object copy in `translated_entries`.

On read the API reconstructs a real `{ en, ar, … }` object either way (`localizedConfigValueSql`) — the wire shape is unchanged. Full detail: [config-storage-model.md](./config-storage-model/config-storage-model.md).

### 2.4 How it all links — one diagram

```
hms_config_keys (id 67, "base_price")
  ├─ applies_to:  "*"                       ← may be used by all categories
  └─ enabled_for: {"1":1,"2":1,"package":1} ← ON for Stay, Dining, Package

hms_config_possible_values (options for key 67)
  ├─ row 3066  scope=service_categories value=1  config_possible_value="100"   (+ ar in translated_entries)
  ├─ row 3065  scope=service_categories value=2  config_possible_value="120"
  └─ row 104   scope=packages           value=*  config_possible_value={"en":"fixed","key":"fixed",…}
```

---

## 3. One route, two modes

The endpoint is a CRUD object, but **each operation behaves differently depending on `?mode=` and `?target=`**:

| `mode` | `target` | Manages |
|---|---|---|
| `enabled_for` *(default)* | — | The on/off flags on `hms_config_keys.enabled_for`. |
| `possible_values` | `service` | Option rows in `hms_config_possible_values` tagged `scope_constraint_name='service_categories'`, `scope_constraint_value=<category>`. |
| `possible_values` | `package` | Option rows in `hms_config_possible_values` tagged `scope_constraint_name='packages'`. |

`target` is only meaningful when `mode=possible_values`.

### Operation matrix

| mode | target | Add | List / View | Update | Delete |
|---|---|---|---|---|---|
| `enabled_for` | — | **not supported** (seeded centrally) | Lists/views keys, each decorated with an `enabled` flag | Replace `enabled_for` with the sanitised map | **not supported** |
| `possible_values` | `service` | INSERT/UPSERT `hms_config_possible_values` row (scope `service_categories`) + `ar`→`translated_entries` + `apply_on_all` fan-out | Option rows for a category | UPDATE `config_possible_value` (§8.2 split) | Soft-delete + delete fan-out |
| `possible_values` | `package` | INSERT/UPSERT `hms_config_possible_values` row (scope `packages`) + `ar`→`translated_entries` + fan-out | Option rows for a key | UPDATE `config_possible_value` (§8.2 split) | Soft-delete + delete fan-out |

`pageSize: 20`. **Add/Delete in `enabled_for` mode throw `NOT_SUPPORTED`** — keys are seeded by migration, not created or removed at runtime. Both possible_values targets write `hms_config_possible_values` (scope tag differs); `apply_on_all` on a global-original Add/Update/Delete fans the change out to tenant clones (§5).

> **Why one route?** The three jobs all revolve around a single key and share validation, tenancy guards, and response shaping. Folding them into one object keeps that logic in one place; the `mode`/`target` params pick the branch.

---

## 4. The three operations in detail

### 4.1 `enabled_for` Update — toggling where a key applies

**`PUT /api/hms_config_keys/enabled_for?mode=enabled_for`**

| Field | Type | Required | Description |
|---|---|---|---|
| `id` | `number` | Yes | The `config_key_id` to update. |
| `actionPerformerURDD` | `number` | Yes | Acting admin URDD; resolves the tenant for the ownership guard. |
| `tenant_id` | `number` | Yes | Acting tenant; must own the key. Missing → `REQUEST_TENANT_MISSING`. |
| `enabled_for` | `object` | Yes | Complete `{ "<scope>": 0\|1 }` map. Sent whole; replaces the stored map. |
| `apply_on_all` | `boolean` | No | On a **global original** only — propagate the change to clones + notify. Default `false`. |

### Example

```json
{
  "id": 8,
  "actionPerformerURDD": 1,
  "tenant_id": 1,
  "apply_on_all": true,
  "enabled_for": { "1": 1, "2": 1, "3": 0, "package": 1, "user": 0 }
}
```

What runs, in order:

1. **Ownership guard** (`requireConfigKeyTenantMatch`) — rejects cross-tenant edits (§5).
2. **Sanitise** — every value coerced to `0`/`1` (`true`/`"true"`/`1`/`"1"` → `1`, anything else → `0`); the whole map is JSON-stringified.
3. **Write** — `UPDATE hms_config_keys SET enabled_for = …, updated_by = … WHERE config_key_id = {{id}}`.
4. **Optional propagation** — if the edited row is a **global original** *and* `apply_on_all` is truthy → push the change into the tenant clones and email their admins (§4.2).

#### `apply_on_all` — propagate a system-level change to tenants

Only meaningful when the **Tenant Manager** edits a **global original** (a SaaS-level key). It decides how far the change reaches:

| `apply_on_all` | Effect |
|---|---|
| `false` / omitted | **Original only.** Every tenant clone keeps its current values. |
| `true` | After saving the original, push the change into every active clone, then email each affected tenant's admin(s). |

When propagating (full algorithm in [original-to-clone-propagation.md](../original-to-clone-propagation/original-to-clone-propagation.md)):

- An **unedited** clone (not edited by a tenant Admin since creation — `updated_by` is NULL or equals the owning Tenant-Manager `created_by`) has the change merged in (category keys remapped to the tenant's own category ids; clone-only keys like `parent_id`/`user` preserved).
- A clone the tenant **has already customised** is **left exactly as-is** — never overwritten, no status change — and reported in the propagation's `conflicts`; it is **not** emailed (its value didn't change).

For each tenant whose clone was actually updated, the active **Tenant Admin(s)** (`designation_code='TENANT'`, role Admin) get a deliberately **non-technical** email: it names the config and the hotel, says the setting was updated and is active, and points them to *Service & Package Configurations*. No scope keys, JSON, or "clone" wording. Both propagation and the emails are **best-effort** — the original is already committed, so a failure in either is logged and never fails the save. Editing a **clone** never propagates (clones are leaves).

### 4.2 `possible_values` Add (service target) — `hms_config_possible_values`

**`POST /api/hms_config_keys/enabled_for?mode=possible_values&target=service`**

| Field | Type | Required | Description |
|---|---|---|---|
| `actionPerformerURDD` | `number` | Yes | Acting admin URDD. |
| `tenant_id` | `number` | Yes | Acting tenant; must own the parent key. |
| `config_key_id` | `number` | Yes | The parent key the value belongs to. |
| `service_category_id` | `number` | Yes | The category this value is scoped to. Must be in the key's `applies_to` **and** tenant-owned. |
| `config_value` | `object` | Yes | The option payload. §8.2 split: simple `{en,ar}` → bare `en` stored + `ar`→`translated_entries`; structured → whole object. |

### Example

```json
{
  "actionPerformerURDD": 1,
  "tenant_id": 1,
  "config_key_id": 67,
  "service_category_id": 1,
  "config_value": { "en": "100", "ar": "١٠٠", "key": "stay-base" }
}
```

It validates that the requester's tenant owns the parent key, that `service_category_id` is in the key's `applies_to` (or `applies_to='*'`) **and** is itself tenant-owned, then inserts (or upserts, for a single-scalar key) the `hms_config_possible_values` row tagged `scope_constraint_name='service_categories'`, `scope_constraint_value=<category>`, mirrors the `ar` to `translated_entries`, and — for a global original with `apply_on_all` — fans the new option out to tenant clones (`propagateConfigValueAdds`).

- **Update** changes `config_possible_value` only (re-mirroring `ar`); **no `syncPossibleValues`** (row id unchanged); global-original edits fan out via `propagateConfigValueUpdates`.
- **Delete** soft-deletes (`status='inactive'`); global-original deletes fan out via `propagateConfigValueDeletes`.

### 4.3 `possible_values` Add (package target) — `hms_config_possible_values`

**`POST /api/hms_config_keys/enabled_for?mode=possible_values&target=package`**

| Field | Type | Required | Description |
|---|---|---|---|
| `actionPerformerURDD` | `number` | Yes | Acting admin URDD. |
| `tenant_id` | `number` | Yes | Acting tenant; must own the parent key. |
| `config_key_id` | `number` | Yes | The parent key the value belongs to. |
| `config_possible_value` | `object` | Yes | The option payload (same §8.2 split as service). |

### Example

```json
{
  "actionPerformerURDD": 1,
  "tenant_id": 1,
  "config_key_id": 68,
  "config_possible_value": { "en": "USD", "ar": "دولار", "key": "USD" }
}
```

Auto-numbers the row (`config_value_num = MAX(config_value_num) + 1` for the key), inserts it tagged `scope_constraint_name='packages'`, mirrors `ar` to `translated_entries`, and maintains the legacy `possible_values["package"]` slot. **Update** changes the value only (re-mirrors `ar`); **Delete** soft-deletes. `apply_on_all` fans Add/Update/Delete out to clones. List rows come back ordered by `config_value_num ASC`.

> **`syncPossibleValues` is now mostly legacy.** Readers no longer consult `hms_config_keys.possible_values`; the sync is a **no-op for service** and only maintains the frozen `["package"]` slot (filtered to `scope_constraint_name='packages'`). Option order/membership come from `config_value_num` + the scope tag.

---

## 5. Tenancy & ownership

Reads and writes are both tenant-scoped, but by **different mechanisms** — this is a direct consequence of "the tenancy filter only rewrites SELECTs" from the [governance model](../tenant-governance-model/governance-model.md#46-writes-are-not-filtered):

| Operation | Guard | What it does |
|---|---|---|
| **List / View** | Query-resolver tenancy filter (SELECT-only) | Scopes rows to the acting tenant. If tenancy is on but **no actor resolved**, the SQL is suffixed `AND (1 = 0)` → **zero rows** (fail-closed), so an actor-less read never leaks every tenant's rows. |
| **List / View by a Service Manager** | Query-resolver category scope (SELECT-only) | On top of the tenant filter, a Service Manager's config-key reads are narrowed to keys that apply to **all** categories (`applies_to = '*'`) or **include his** category (even if they also apply to others). Keys scoped to *other* categories only — and **package-only keys** (`applies_to = ["package"]`) — are hidden. Applies to the resolver-routed config APIs **and** the direct-query [config-keys catalog](./config-keys-catalog/config-keys-catalog.md#service-manager-category-scope). |
| **`enabled_for` Update** | `requireConfigKeyTenantMatch` | The acting tenant (from `actionPerformerURDD`) must own the key. The **system-tenant author** edits the global originals; a tenant-scoped manager edits only its own clones. |
| **`possible_values` Add/Update/Delete** | `assertKeyTenantMatch` | Resolves the parent `config_key_id` and asserts the requester's tenant owns it. |

> **Why the explicit write guards exist.** The resolver's tenancy filter rewrites `SELECT`s only, so without these guards an INSERT/UPDATE/DELETE into `hms_config_possible_values` would be reachable **cross-tenant by id**. `assertKeyTenantMatch` closes that hole: a tenant may only mutate option rows under a key its own URDD owns.

The acting tenant is resolved from `actionPerformerURDD` (the system-tenant SaaS-Admin URDD resolves to the system tenant, so it edits the global originals). Writes **require** `tenant_id` on the payload (config-decrypt sets it from the requester's URDD); a missing one is `REQUEST_TENANT_MISSING` (400), not a silent cross-tenant write.

---

## 6. A worked example, end to end

**Goal:** a Tenant Admin at Hotel X wants the **Stay** category to offer two base-price presets, and to make sure the `base_price` key is switched on for Stay.

Assume Hotel X already has a clone of the `base_price` key (cloned automatically when the **Stay service category** was assigned — config keys cascade from their category; see [resource-assignments.md](../per-tenant-resource-assignment/resource-assignments.md#63-side-effects--assigning-a-service_category)). Its clone `config_key_id` is `412`, and Hotel X's local Stay category id is `31`.

**Step 1 — make sure the key is enabled for Stay.**

```http
PUT /api/hms_config_keys/enabled_for?mode=enabled_for
{ "id": 412, "actionPerformerURDD": <Hotel X admin URDD>, "tenant_id": <Hotel X>,
  "enabled_for": { "31": 1, "package": 0 } }
```
The ownership guard confirms Hotel X owns key 412; the map is stored with Stay = on.

**Step 2 — add the first preset value for Stay.**

```http
POST /api/hms_config_keys/enabled_for?mode=possible_values&target=service
{ "actionPerformerURDD": <admin URDD>, "tenant_id": <Hotel X>,
  "config_key_id": 412, "service_category_id": 31,
  "config_value": { "en": "100", "ar": "١٠٠", "key": "stay-base" } }
```
It checks category 31 is in key 412's `applies_to` and is owned by Hotel X, then inserts the `hms_config_possible_values` row (say id `9001`) tagged `scope_constraint_name='service_categories'`, `scope_constraint_value=31`, `config_value_num=1`, and mirrors the `ar` (`١٠٠`) to `translated_entries`.

**Step 3 — add a second preset.** Same call with `config_value = {"en":"150",…}` → inserts id `9002` with `config_value_num=2` (appended after the first).

**Step 4 — the admin removes the first preset.**

```http
DELETE /api/hms_config_keys/enabled_for?mode=possible_values&target=service&id=9001
```
Row `9001` → `status='inactive'`; it drops out of the offered list (readers query `status <> 'inactive'`), leaving `9002` as the sole active option.

The offered options are always exactly the active `hms_config_possible_values` rows for `(key 412, category 31)`, ordered by `config_value_num` — no pointer map to keep in sync. Every call was tenant-checked against key 412's ownership. That is the entire lifecycle.

---

## 7. Response

All responses use the standard envelope: `{ success, data, meta, error }`.

### Success (200)

| Operation | `data` shape |
|---|---|
| `enabled_for` List / View | Config-key rows, each with `enabled_for` parsed to an object and an `enabled` flag (`0`/`1`) computed for the requested `service_category_id`. |
| `enabled_for` Update | The update result. On an `apply_on_all` propagation, clones are updated and Tenant Admins emailed (best-effort). |
| `possible_values` List / View | Option rows with `config_value` / `config_possible_value` reconstructed into `{en,ar,…}` objects (via `localizedConfigValueSql`). |
| `possible_values` Add / Update / Delete | Insert/update metadata. On a global-original edit with `apply_on_all`, also `{ propagation, notification }` (clones fanned out + Tenant Admins emailed, best-effort). |

### Error Responses

| Status | Message | Condition |
|---|---|---|
| 400 | `BAD_REQUEST` | `possible_values` with `target` missing/unknown; a missing required field; category out of the key's `applies_to` scope. |
| 400 | `REQUEST_TENANT_MISSING` | `tenant_id` absent from a write payload. |
| 403 | `TENANT_MISMATCH` | The requester's tenant doesn't own the parent key (or, on a service Add, the category). |
| 404 | `RECORD_NOT_FOUND` | Delete referencing an id that doesn't exist. |
| — | `NOT_SUPPORTED` | `enabled_for` Add or Delete; Add with no `target`. |

---

## 8. Gotchas

- **Add/Delete don't exist for `enabled_for`.** Keys are seeded by migration; both throw `NOT_SUPPORTED`. Runtime row creation, if ever needed, belongs in a migration-style API, not here.
- **Both targets write `hms_config_possible_values` — the difference is the scope tag, not the table.** `service` → `scope_constraint_name='service_categories'` + `scope_constraint_value=<catId>`; `package` → `='packages'`. The `target` query param is authoritative; the service SELECT is aliased to the `hmsConfig_*` shape and the package one to `hmsConfigPv_*`, but both come from the same mirror.
- **`service_category_id` means different things per mode.** In `enabled_for` mode it filters keys by `applies_to` (JSON_CONTAINS). In `possible_values service` mode it filters option rows by `scope_constraint_value`. Same query key, different semantics — be deliberate.
- **Simple option values read back BARE `en` + `ar` from `translated_entries`** (§8.2); only structured values (`key`/`label`/`group`) are whole objects. A bare-string read is correct — `localizedConfigValueSql` rebuilds `{en,ar}`.
- **Object payloads must be JSON-stringified before SQL binding.** An object passed raw becomes `[object Object]`; the pre-process always stringifies first. (Field name = payload key = SQL placeholder must all match, or the resolver writes `NULL`.)
- **The `possible_values` pointer map is retired** — no longer read; don't rely on it (worth repeating — it was the #1 confusion).
- When a key is **cloned** to a tenant, its options + their `translated_entries` are inserted into the tenant's `hms_config_possible_values` (scope-tagged, lineage preserved) — see [per-tenant-cloning.md](../per-tenant-cloning/per-tenant-cloning.md), [config-storage-model.md](./config-storage-model/config-storage-model.md), and `docs/strategies/tenant_config_value_sync_strategy.md`.

---

## Database Changes

| Table | Written when | Read when |
|---|---|---|
| `hms_config_keys` | `enabled_for` Update (writes `enabled_for`); package `possible_values` Add/Delete maintains the **legacy** `possible_values["package"]` slot (frozen column; service sync is a no-op). | `enabled_for` List/View; ownership guards resolve the owning tenant; service Add reads `applies_to`. |
| `hms_config_possible_values` | **Both** service (scope `service_categories`) and package (scope `packages`) `possible_values` Add/Update (INSERT/UPSERT); Delete (soft). | `possible_values` List/View (both targets); Update/Delete pre-process lookup. |
| `translated_entries` | `possible_values` Add/Update — SIMPLE values mirror `ar` here. | `possible_values` List/View — `localizedConfigValueSql` rebuilds `{en,ar}`. |
| `service_categories` | — | Service Add — category ownership check. |

SIMPLE option values are stored as **bare `en`** with `ar` in `translated_entries`; STRUCTURED values (`key`/`label`/`group`) are stored as a whole JSON object (§8.2 split).

---

## Change Log

| Date | Change |
|---|---|
| 2026-06-15 | **Service Manager config-key read scope.** A Service Manager's List/View is now narrowed to keys that apply to `*` or include his category (other-category-only and **package-only** `["package"]` keys hidden) — on the resolver-routed APIs and the direct-query [config-keys catalog](./config-keys-catalog/config-keys-catalog.md#service-manager-category-scope) (which reuses the exported `applyServiceManagerScope`). Packages themselves are also hidden from a Service Manager (`packages`/`package_services`/`package_pricing` → no rows). |
| 2026-06-12 | `apply_on_all` propagation no longer writes `status='needs_review'` (the enum has no such value — the write threw under strict SQL mode and rolled back the whole propagation). Tenant-edited clones are now left as-is and reported as conflicts. Full algorithm extracted to [original-to-clone-propagation.md](../original-to-clone-propagation/original-to-clone-propagation.md). |
| 2026-06-10 | Initial documentation of the config-key system and the dual-mode `enabled_for` CRUD. |
| 2026-06-09 | Ownership guards extended to **all** `possible_values` writes (`assertKeyTenantMatch`), closing the cross-tenant write hole; List/View fail closed when no actor resolves; `apply_on_all` propagation + Tenant-Admin notification added. |

---

## Source references

| Topic | Source |
|---|---|
| Canonical CRUD reference (SQL templates, helper inventory, field/placeholder alignment) | `Src/Apis/ProjectSpecificApis/HmsConfigKeysEnabledForCrud/README.md` |
| Full per-key inventory + lookup tables | [config-keys-catalog.md](./config-keys-catalog/config-keys-catalog.md) |
| Read-only browse API (List/View, dual-locale) | [config-keys-catalog.md → The Catalog API](./config-keys-catalog/config-keys-catalog.md#the-catalog-api); `Src/Apis/GeneratedApis/Default/Hms_config_keys_catalog/` |
| Clone-time value materialisation | `docs/strategies/tenant_config_value_sync_strategy.md`; `Governance/materializeConfigValuesForCategory.js` |
| Tenancy filter (why writes need explicit guards) | [governance-model.md](../tenant-governance-model/governance-model.md#4-tenant-isolation--one-database-many-hotels) |
