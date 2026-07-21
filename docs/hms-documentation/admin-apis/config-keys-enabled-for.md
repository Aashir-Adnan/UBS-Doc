# Config Keys — Enabled-For & Possible Values

Dual-mode CRUD over the `hms_config_keys` configuration system. One route, two distinct behaviours selected by the `mode` query param: toggle each config key's per-scope on/off flags, or manage the actual values a key can hold.

| Operation | Method | Path | Permission (any one) |
|---|---|---|---|
| List | **GET** | `/api/custom/config_keys/enabled_for` | *(none — auth layer only)* |
| View | **GET** | `…?id=<id>` | *(none — auth layer only)* |
| Add | **POST** | `/api/custom/config_keys/enabled_for` | possible_values mode: `add_/update_/delete_hms_config`, `add_/update_/delete_hms_config_possible_values`, `manage_config_possible_values` |
| Update | **PUT** | `/api/custom/config_keys/enabled_for` | enabled_for mode: `update_hms_config_keys`, `manage_config_key_category_flags`, `manage_config_key_user_visibility` · possible_values mode: same set as Add |
| Delete | **DELETE** | `…?id=<id>` | possible_values mode: same set as Add |

Operated by the **SaaS Admin** (framework-tier permissions, editing global originals) and the **Tenant Admin / Tenant Manager** (Group B tenant permissions, editing their cloned copies). Behaviour depends on `mode` and, for possible-values, `target`.

> **Route note.** The URL is resolved to `global.CustomConfig_keysEnabled_for_object` via PascalCase conversion. The path shown is best-inferred from that convention.

---

## Mode × Target Matrix

`mode` defaults to `enabled_for` when absent. `target` is only meaningful when `mode=possible_values`.

| mode | target | Add | List / View | Update | Delete |
|---|---|---|---|---|---|
| `enabled_for` | — | **NOT_SUPPORTED** | Lists/Views `hms_config_keys`, decorated with an `enabled` flag | REPLACE `hms_config_keys.enabled_for` with a sanitized `{ scope: 0\|1 }` map | **NOT_SUPPORTED** |
| `possible_values` | `service` | INSERT/UPSERT `hms_config_possible_values` row tagged `scope_constraint_name='service_categories'`, `scope_constraint_value=<category>` | Lists/Views mirror rows (aliased to the old `hmsConfig_*` shape) | UPDATE `hms_config_possible_values.config_possible_value` | Soft-delete the mirror row |
| `possible_values` | `package` | INSERT/UPSERT `hms_config_possible_values` row tagged `scope_constraint_name='packages'` | Lists/Views mirror rows (sorted by `config_value_num`) | UPDATE `hms_config_possible_values.config_possible_value` | Soft-delete the mirror row |

`Add`/`Delete` in `enabled_for` mode throw `NOT_SUPPORTED` (config-key rows are seeded centrally by migrations). `pageSize: 20`.

> **Storage refactor.** Service **and** package options now live in the **one** table
> `hms_config_possible_values`, distinguished by a **scope tag** (`scope_constraint_name` +
> `scope_constraint_value`), not by table. Service options used to live in `hms_config`
> (`base_table='service_categories'`) — those rows are no longer the source of truth. Values follow
> the **§8.2 split** (bare `en` + `ar`→`translated_entries` for simple labels; whole object for
> structured), and the old `hms_config_keys.possible_values` pointer map is **retired** (readers hit
> the mirror directly). Every write also carries an `apply_on_all` **value-level** fan-out (Add /
> Update / Delete) to tenant clones. See [Config Option Storage Model](../tenant-governance/config-keys/config-storage-model/config-storage-model.md).
>
> **`'*'` (both-scope) options.** A row tagged `scope_constraint_name='*'` is **key-wide** — it applies
> to every service category **and** packages. These List reads include it: **service** →
> `scope_constraint_name IN ('service_categories','*')` (the `'*'` row shows for any category filter);
> **package** → `IN ('packages','*')`. `'*'` options are cloned/propagated to tenants like package
> options. (This is admin-side; guest readers are unchanged.)

---

## Authentication & Authorization

`requestMetaData.permission` is `null`. Authorization is enforced by the mode-aware pre-processor `gateByMode`, which routes to the correct RBAC gate, plus per-operation tenant-ownership guards.

| Mode / operation | RBAC permission (any one grants access) | Tenant ownership guard |
|---|---|---|
| `enabled_for` Update | `update_hms_config_keys` · `manage_config_key_category_flags` · `manage_config_key_user_visibility` | `requireConfigKeyTenantMatch` on `hms_config_keys` |
| `possible_values` Add / Update / Delete | `add_/update_/delete_hms_config` · `add_/update_/delete_hms_config_possible_values` · `manage_config_possible_values` | `assertKeyTenantMatch` — resolves the parent key and asserts the requester's tenant owns it (Add-service also checks category scope + category ownership) |
| List / View | — | Fail-closed: with tenancy on and no resolvable acting tenant, the SQL is suffixed with `AND (1 = 0)` (zero rows) |

Errors: `TENANT_MISMATCH` (403), `RECORD_NOT_FOUND` (404), `REQUEST_TENANT_MISSING` (400), `BAD_REQUEST` (400), `NOT_SUPPORTED`.

---

## Request Payload

| Field | Type | Source | Required | Description |
|---|---|---|---|---|
| `mode` | `string` | query | No | `enabled_for` (default) or `possible_values`. |
| `target` | `string` | query | possible_values only | `service` or `package`. |
| `hmsConfigKeys_id` (`id`) | `number` | query | Update/View/Delete | enabled_for: `config_key_id` to patch. possible_values: PK of the value row. |
| `config_key_id` | `number` | body | Add / List filter | Parent config key. |
| `service_category_id` | `number` | query | service Add | Service category (also filters List). |
| `enabled_for` | `object` | body | enabled_for Update | Complete `{ "<category_id>": 0\|1, "package": 0\|1, "<scope>": 0\|1 }` map. Whole-object replace; values coerced to `0`/`1`, keys kept verbatim. |
| `apply_on_all` | `boolean` | body | No | On a **global-original** edit only: `true` propagates the change to tenant clones + emails affected tenant admins. Read in post-process; not bound to SQL. |
| `keep_shared` | `boolean` | body | shared PV Add/Update/Delete | **Add** (service): `true` creates a **Case A `'*'`** key-wide option (no `service_category_id` needed) instead of a per-category row. **Update/Delete** of a shared PV (`isKeyWide > 0`): `true` = change it in place (stays shared); `false`/omitted (with a `service_category_id`) = **split** for that category only (§A.4). Ignored for explicit (`isKeyWide=0`) rows and for package target. |
| `config_value` | `string` \| `object` | body | service Add/Update | Option value → `hms_config_possible_values.config_possible_value` (service scope). §8.2 split: simple `{en,ar}` stores bare `en` + `ar`→`translated_entries`; structured stored whole. |
| `config_possible_value` | `string` \| `object` | body | package Add/Update | Option value → `hms_config_possible_values.config_possible_value` (package scope). Same §8.2 split. |
| `actionPerformerURDD` | `number` | body | Yes | Acting admin's URDD. |
| `language_code` | `string` | query | No | Language hint. |

### Example — enabled_for Update

```json
{
  "id": 8,
  "actionPerformerURDD": 1,
  "apply_on_all": true,
  "enabled_for": { "1": 1, "2": 1, "3": 0, "package": 1, "user": 0 }
}
```

### Example — possible_values / package Add

```json
{
  "actionPerformerURDD": 1,
  "config_key_id": 68,
  "config_possible_value": { "en": "USD", "ar": "دولار", "key": "USD" }
}
```

---

## Response

### enabled_for List (decorated)

```json
[
  {
    "id": 67,
    "hmsConfigKeys_configKey": "base_price",
    "hmsConfigKeys_configName": "Base Price",
    "hmsConfigKeys_appliesTo": "*",
    "hmsConfigKeys_enabledFor": { "1": 1, "2": 1, "3": 1, "package": 1 },
    "hmsConfigKeys_valueType": "decimal",
    "hmsConfigKeys_possibleValues": { "1": [3066], "2": [3065] },
    "hmsConfigKeys_status": "active",
    "enabled": 1,
    "table_count": 175
  }
]
```

`hmsConfigKeys_enabledFor` is parsed into a real object; `enabled` (`0`/`1`) is computed against the `service_category_id` query param.

### possible_values List (service / package)

Rows carry `hmsConfig_configValue` (service) or `hmsConfigPv_configPossibleValue` (package), each parsed back into the original object.

Each row also carries **`hmsConfig_isKeyWide`** (service) / **`hmsConfigPv_isKeyWide`** (package) — the SHARED-scope marker (§A.4):

| value | meaning |
|---|---|
| `0` | explicit — this one category (or packages) only |
| `1` | **Case A** — `scope_constraint_name='*'`: applies to **every** service category **AND** packages |
| `2` | **Case B** — `scope_constraint_name='service_categories'`, value `'*'`: applies to **every** service category |

When `isKeyWide > 0`, on **edit/delete** the FE shows a dialog offering **"apply to this category only"** vs **"apply to all (keep shared)"**, and sends the choice back via **`keep_shared`** (see Behavior → shared-PV split). Same `'*'` option object (same `id`) can appear in multiple category buckets — treat an edit/delete of it as one key-wide action.

### Write responses

Return the query-resolver metadata. When an `apply_on_all` propagation ran, the response also carries `propagation` (`{ updated, conflicts }`) and `notification` (`{ emailed, tenants }`).

---

## Behavior

**enabled_for = whole-object replace.** The frontend always sends the complete `enabled_for` map; the pre-process sanitizes every value to `0`/`1` and JSON-stringifies it before the `UPDATE hms_config_keys SET enabled_for = {{enabled_for}} …`. Keys are accepted verbatim (no whitelist) so new scope types don't require a backend release.

**possible_values value storage (§8.2 split).** Both targets write `hms_config_possible_values`. `splitConfigValueForWrite` branches on structure: a **simple** `{ en, ar }` label stores the **bare `en`** in `config_possible_value` and mirrors `ar` to `translated_entries`; a **structured** value (`key`/`label`/`group`) stores the **whole object** (plus an object `translated_entries` copy). Reads reconstruct the `{ en, ar, … }` object via `localizedConfigValueSql` — so the wire shape is unchanged.

**Shared-PV edit/delete — split vs keep-shared (§A.4).** When a possible value is **shared**
(`isKeyWide` = 1 Case A / 2 Case B) and the admin edits or deletes it from a per-category screen (a
`service_category_id` is in scope), the `keep_shared` flag decides:
- **`keep_shared = true`** → the shared row is changed/soft-deleted **in place** — it stays shared and the change is key-wide.
- **`keep_shared = false` / omitted** → the backend **splits** (de-collapses) the shared option: it materialises explicit `service_categories` rows for every category the key is `enabled_for` — plus a `packages` row for Case A — where the **target** category gets the edit (or is omitted on delete) and every **other** category (and packages, Case A) keeps the **original** value; the original shared (`'*'`) row is soft-deleted. Net: "edit/remove this option for just Dining" makes Dining diverge while the rest are untouched. Translations are cloned per new row (§8.2). **Add** also honours the flag: a service Add with `keep_shared=true` creates a Case A `'*'` key-wide option directly (no `service_category_id`), rather than a per-category row.

**`syncPossibleValues` — retired pointer map.** `hms_config_keys.possible_values` was a JSON pointer map; readers no longer consult it. `syncPossibleValues` is now a **no-op for service** and only maintains the legacy `["package"]` slot (filtered to `scope_constraint_name='packages'`). Option order + membership come from `hms_config_possible_values` (`config_value_num`, scope tag). The column is frozen pending a drop.

**Single-value scalar upsert.** For scalar key types (`text`, `number`, `date`, etc. with `is_multi_value = 0`), Add upserts the single placeholder row in place — by natural key (`config_id` + scope) — reactivating a soft-deleted one rather than inserting duplicates.

**`apply_on_all` propagation (now value-level too).** When a Tenant Manager edits a **global original** (`source_hms_config_key_id IS NULL`) with `apply_on_all = true`, the change fans out to eligible tenant clones — **not just for `enabled_for`**:
- `enabled_for` Update → `propagateAssignmentUpdates`;
- possible_values **Add** → `propagateConfigValueAdds` (inserts the new option into clones, with cloned `translated_entries`; category-owning + not-already-customised gates);
- possible_values **Update** → `propagateConfigValueUpdates`;
- possible_values **Delete** → `propagateConfigValueDeletes`.

Unedited clones receive the change; tenant-customised clones are left as-is and reported as `conflicts`. Each updated tenant's active Tenant Admin(s) then get a plain-language email. All steps are best-effort — the original save is already committed.

### Booked-dependency guards

Both modes check whether a **booked** service/package still depends on the config before letting it change. The recurring primitive is the **active booking** (`booking_status` NOT IN `checked_out` / `no_show` / `cancelled`). A service is "booked" when it is a `booking_services` line **or** — for a **Stay** service — one of its **rooms** is on an active booking. A room belongs to the service when the unit's `service_locations` **anchor** (the row `delivery_units.location_id` points at) carries this `service_id` — `du.location_id = sl.id AND sl.service_id = <service>`, **not** merely a shared physical location. (See [Deferred delete & probation](../tenant-governance/deferred-delete-probation/deferred-delete-probation.md).)

- **enabled_for Update — turning a scope OFF is a hard 409.** If a scope currently ON is being set to `0`/omitted while a booked service (in that `service_category`) or package still uses the key, the Update is **refused** with `CONFIG_KEY_SCOPE_IN_USE` (`409`) — an `enabled_for` flag is a JSON map with no status row to defer, so it can't be parked. Turning a scope **on** (`0 → 1`) is always allowed. Only the exact id-based dependency is considered.
- **possible_values Delete — deferred (probation), not blocked.** Deleting a value that a booked service/package still references **by id** parks it in `probation` instead of `inactive`: it drops out of new-consumer pickers (`syncPossibleValues` rebuilds the map from `active` rows only) but stays resolvable for the live reservation, the finalizer cron flips it to `inactive` once those bookings close, and it can be **restored** meanwhile (Update `status: 'active'` with no value). With no booked reference it inactivates immediately. The response carries `status_set` (`probation`/`inactive`), `deferred`, and a `dependents` array.

---

## Source Files

| File | Purpose |
|---|---|
| `Src/Apis/ProjectSpecificApis/HmsConfigKeysEnabledForCrud/HmsConfigKeysEnabledForCrud.js` | Dual-mode API object; mode/target dispatch, pre/post-processes, SQL builders |
| `Src/Apis/ProjectSpecificApis/HmsConfigKeysEnabledForCrud/CRUD_parameters.js` | Request field schema + `colMapper` |
| `Src/Apis/ProjectSpecificApis/HmsConfigKeysEnabledForCrud/README.md` | Canonical backend reference (matrix, SQL templates, pitfalls) |
| `Src/HelperFunctions/PreProcessingFunctions/configKeyManagementPermission.js` | `requireAnyConfigKeyPermission` — RBAC gates |
| `Src/HelperFunctions/PreProcessingFunctions/tenantOwnership.js` | Tenant-ownership guards (`makeTenantOwnershipPreProcess`, `assertRecordTenantMatch`) |
| `Src/HelperFunctions/PayloadFunctions/Governance/propagateAssignmentUpdates.js` · `propagateConfigValueUpdates.js` · `notifyTenantAdminsOfConfigChange.js` | `apply_on_all` propagation + tenant-admin notification |
