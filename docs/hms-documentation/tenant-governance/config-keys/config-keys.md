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
3. **`possible_values` (on the key) is a pointer map, not a list of values.** It is a JSON map of *row ids* pointing into the value tables. The real values live in `hms_config` (service scope) or `hms_config_possible_values` (package scope). The pointer map is maintained automatically — you never hand-edit it.

If you remember nothing else: **the key is metadata; the values live elsewhere; `enabled_for` is just flags.**

---

## 2. The data model

Four tables work together. (The lookup tables and the full per-key inventory are in [config-keys-catalog.md](./config-keys-catalog/config-keys-catalog.md); this is the structural view.)

| Table | Holds | Think of it as |
|---|---|---|
| `hms_config_keys` | The **key definitions**: name, display name, target table, category, `applies_to` (which service categories may use it), `enabled_for` (on/off flags), `value_type` (which widget), `possible_values` (pointer map). Seeded centrally by migrations. | The catalog of *what settings can exist*. |
| `hms_config` | **Service-scoped values** — rows where `base_table='service_categories'` and `record_id=<category_id>`. Value stored in `config_value`. | "For the Stay category, the allowed values of this key are …" |
| `hms_config_possible_values` | **Package-scoped values** — rows where `config_id=<key_id>`. Value in `config_possible_value`, auto-numbered by `config_value_num`. | "For packages, the allowed values of this key are …" |
| `hms_config_categories` | The admin-UI grouping categories (Basics, Pricing, …). | The section headers in the admin UI. |

### 2.1 `enabled_for` — the switchboard

A JSON map of `{ "<scope>": 0|1 }` on each key. Scope keys are usually `"1"`–`"9"` (the service category ids) plus the literal `"package"`:

```json
{ "1": 1, "2": 1, "3": 0, "package": 1, "user": 0 }
```

The frontend always sends the **complete** object on an update; the backend sanitises every value to `0` or `1` and replaces the whole map (it never merges). Keys are accepted **verbatim** — there is no whitelist — so a new scope type (`tenant`, `room`, …) needs no backend release, but a typo silently becomes a new key in the stored JSON.

### 2.2 `possible_values` — the pointer map

A JSON map from scope → array of **row ids** in the value tables:

```json
{
  "1":  [3273, 3272],   // service category 1 → hms_config.id[]
  "2":  [3271],
  "package": [148, 149] // hms_config_possible_values.id[]
}
```

> **The single most common confusion:** this column is *not* a list of values. The values live in `hms_config` / `hms_config_possible_values`; this is a map of *which rows belong to which scope*. It is rebuilt automatically (`syncPossibleValues`) on every value Add/Delete, so it self-heals against the live active rows — **never write it by hand.**

### 2.3 How values are stored

Each value row stores its payload **verbatim as a JSON-stringified object**. A multilingual value like `{ "en": "100", "ar": "١٠٠", "key": "stay-base" }` is written as-is — there is **no** fan-out to the `translated_entries` system. On read, the API parses the string back into a real object so the frontend receives an object, not a string.

### 2.4 How it all links — one diagram

```
hms_config_keys (id 67, "base_price")
  ├─ applies_to:     "*"                      ← may be used by all categories
  ├─ enabled_for:    {"1":1,"2":1,"package":1}← ON for Stay, Dining, Package
  └─ possible_values:{"1":[3066],"2":[3065],"package":[104]}
                         │         │              │
       hms_config row 3066 ◄──────┘         hms_config_possible_values row 104
       (Stay, config_value={"en":"100",…})  (package, config_possible_value={"en":"fixed",…})
```

---

## 3. One route, two modes

The endpoint is a CRUD object, but **each operation behaves differently depending on `?mode=` and `?target=`**:

| `mode` | `target` | Manages |
|---|---|---|
| `enabled_for` *(default)* | — | The on/off flags on `hms_config_keys.enabled_for`. |
| `possible_values` | `service` | Value rows in `hms_config`, scoped to a service category. |
| `possible_values` | `package` | Value rows in `hms_config_possible_values`, scoped to a config key. |

`target` is only meaningful when `mode=possible_values`.

### Operation matrix

| mode | target | Add | List / View | Update | Delete |
|---|---|---|---|---|---|
| `enabled_for` | — | **not supported** (seeded centrally) | Lists/views keys, each decorated with an `enabled` flag | Replace `enabled_for` with the sanitised map | **not supported** |
| `possible_values` | `service` | INSERT `hms_config` row → re-sync | Value rows for a category | UPDATE `config_value` | Soft-delete → re-sync |
| `possible_values` | `package` | INSERT `hms_config_possible_values` row → re-sync | Value rows for a key | UPDATE `config_possible_value` | Soft-delete → re-sync |

`pageSize: 20`. **Add/Delete in `enabled_for` mode throw `NOT_SUPPORTED`** — keys are seeded by migration, not created or removed at runtime.

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

### 4.2 `possible_values` Add (service target) — `hms_config`

**`POST /api/hms_config_keys/enabled_for?mode=possible_values&target=service`**

| Field | Type | Required | Description |
|---|---|---|---|
| `actionPerformerURDD` | `number` | Yes | Acting admin URDD. |
| `tenant_id` | `number` | Yes | Acting tenant; must own the parent key. |
| `config_key_id` | `number` | Yes | The parent key the value belongs to. |
| `service_category_id` | `number` | Yes | The category this value is scoped to. Must be in the key's `applies_to` **and** tenant-owned. |
| `config_value` | `object` | Yes | The value payload (stored verbatim as JSON). |

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

It validates that the requester's tenant owns the parent key, that `service_category_id` is in the key's `applies_to` (or `applies_to='*'`) **and** is itself tenant-owned, then inserts the `hms_config` row and re-syncs `possible_values["1"]`.

- **Update** changes `config_value` only — **no re-sync** (the row id is unchanged).
- **Delete** soft-deletes (`status='inactive'`) and re-syncs (dropping the id from the map).

### 4.3 `possible_values` Add (package target) — `hms_config_possible_values`

**`POST /api/hms_config_keys/enabled_for?mode=possible_values&target=package`**

| Field | Type | Required | Description |
|---|---|---|---|
| `actionPerformerURDD` | `number` | Yes | Acting admin URDD. |
| `tenant_id` | `number` | Yes | Acting tenant; must own the parent key. |
| `config_key_id` | `number` | Yes | The parent key the value belongs to. |
| `config_possible_value` | `object` | Yes | The value payload (stored verbatim as JSON). |

### Example

```json
{
  "actionPerformerURDD": 1,
  "tenant_id": 1,
  "config_key_id": 68,
  "config_possible_value": { "en": "USD", "ar": "دولار", "key": "USD" }
}
```

Auto-numbers the row (`config_value_num = MAX(config_value_num) + 1` for the key), inserts, and re-syncs `possible_values["package"]`. **Update** changes the value only; **Delete** soft-deletes and re-syncs. List rows come back ordered by `config_value_num ASC`.

> **`syncPossibleValues` runs on every Add and Delete, never on Update** (Update never changes a row's PK). It rewrites the *full* live id list for that slot via a `JSON_SET` + subquery, so any drift between a row's `status` and the pointer map self-heals on the next Add/Delete in that slot.

---

## 5. Tenancy & ownership

Reads and writes are both tenant-scoped, but by **different mechanisms** — this is a direct consequence of "the tenancy filter only rewrites SELECTs" from the [governance model](../tenant-governance-model/governance-model.md#46-writes-are-not-filtered):

| Operation | Guard | What it does |
|---|---|---|
| **List / View** | Query-resolver tenancy filter (SELECT-only) | Scopes rows to the acting tenant. If tenancy is on but **no actor resolved**, the SQL is suffixed `AND (1 = 0)` → **zero rows** (fail-closed), so an actor-less read never leaks every tenant's rows. |
| **`enabled_for` Update** | `requireConfigKeyTenantMatch` | The acting tenant (from `actionPerformerURDD`) must own the key. The **system-tenant author** edits the global originals; a tenant-scoped manager edits only its own clones. |
| **`possible_values` Add/Update/Delete** | `assertKeyTenantMatch` | Resolves the parent `config_key_id` and asserts the requester's tenant owns it. |

> **Why the explicit write guards exist.** The resolver's tenancy filter rewrites `SELECT`s only, so without these guards an INSERT/UPDATE/DELETE into `hms_config` / `hms_config_possible_values` would be reachable **cross-tenant by id**. `assertKeyTenantMatch` closes that hole: a tenant may only mutate value rows under a key its own URDD owns.

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
It checks category 31 is in key 412's `applies_to` and is owned by Hotel X, inserts the `hms_config` row (say id `9001`), and re-syncs → `possible_values["31"] = [9001]`.

**Step 3 — add a second preset.** Same call with `config_value = {"en":"150",…}` → inserts id `9002`, re-syncs → `possible_values["31"] = [9001, 9002]`.

**Step 4 — the admin removes the first preset.**

```http
DELETE /api/hms_config_keys/enabled_for?mode=possible_values&target=service&id=9001
```
Row `9001` → `status='inactive'`, re-sync → `possible_values["31"] = [9002]`.

At no point did anyone touch `possible_values` directly — every Add/Delete kept it in sync. And every call was tenant-checked against key 412's ownership. That is the entire lifecycle.

---

## 7. Response

All responses use the standard envelope: `{ success, data, meta, error }`.

### Success (200)

| Operation | `data` shape |
|---|---|
| `enabled_for` List / View | Config-key rows, each with `enabled_for` parsed to an object and an `enabled` flag (`0`/`1`) computed for the requested `service_category_id`. |
| `enabled_for` Update | The update result. On an `apply_on_all` propagation, clones are updated and Tenant Admins emailed (best-effort). |
| `possible_values` List / View | Value rows with `config_value` / `config_possible_value` parsed back into objects. |
| `possible_values` Add / Update / Delete | Insert/update metadata; on Add & Delete the key's `possible_values` pointer map is re-synced. |

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
- **Service target uses `hms_config`; package target uses `hms_config_possible_values`.** The `target` query param is authoritative; the response alias prefix (`hmsConfig_…` vs `hmsConfigPv_…`) helps you tell them apart.
- **`service_category_id` means different things per mode.** In `enabled_for` mode it filters keys by `applies_to` (JSON_CONTAINS). In `possible_values service` mode it filters value rows by `hms_config.record_id`. Same query key, different semantics — be deliberate.
- **Object payloads must be JSON-stringified before SQL binding.** An object passed raw becomes `[object Object]`; the pre-process always `JSON.stringify`s first. (This also means field name = payload key = SQL placeholder must all match, or the resolver writes `NULL`.)
- **`possible_values` is a pointer map, not values** (worth repeating — it's the #1 confusion).
- A sibling routine rebuilds the *whole* `possible_values` map (not one slot) when a key is **cloned** to a tenant — see [per-tenant-cloning.md](../per-tenant-cloning/per-tenant-cloning.md) and `docs/strategies/tenant_config_value_sync_strategy.md`.

---

## Database Changes

| Table | Written when | Read when |
|---|---|---|
| `hms_config_keys` | `enabled_for` Update (writes `enabled_for`); every `possible_values` Add/Delete via `syncPossibleValues` (writes `possible_values`). | `enabled_for` List/View; ownership guards resolve the owning tenant; service Add reads `applies_to`. |
| `hms_config` | `possible_values` service Add/Update (INSERT/UPDATE); Delete (soft `status='inactive'`). | `possible_values` service List/View; sync pulls active ids; Update/Delete pre-process lookup. |
| `hms_config_possible_values` | `possible_values` package Add/Update (INSERT/UPDATE); Delete (soft). | `possible_values` package List/View; sync pulls active ids; Update/Delete pre-process lookup. |
| `service_categories` | — | Service Add — category ownership check. |

Values are stored as embedded JSON; there is **no** fan-out to `translated_entries`.

---

## Change Log

| Date | Change |
|---|---|
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
