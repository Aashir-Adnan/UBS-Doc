# Config Possible Values

Admin CRUD over the `hms_config_possible_values` table — the option rows behind dropdown / multi-select style config keys, plus each key's default value.

| Operation | Method | Path | Permission |
|---|---|---|---|
| List | **GET** | `/api/custom/config_possible_values` | *(none — auth layer only)* |
| View | **GET** | `/api/custom/config_possible_values?id=<id>` | *(none — auth layer only)* |
| Add | **POST** | `/api/custom/config_possible_values` | one of `add_hms_config_possible_values`, `update_hms_config_possible_values`, `delete_hms_config_possible_values`, `manage_config_possible_values` |
| Update | **PUT** | `/api/custom/config_possible_values` | same set as Add |
| Delete | **DELETE** | `/api/custom/config_possible_values?id=<id>` | same set as Add |

Operated by the **Tenant Admin / Tenant Manager** (via `manage_config_possible_values`) or the **SaaS Admin** (via the framework-tier `*_hms_config_possible_values` permissions). This API manages the selectable values of a config key and which one is the default.

> **Route note.** There are no hardcoded routes — the URL path is converted to PascalCase to resolve `global.CustomConfig_possible_values_object` (`config.js#getApiObject`). The path above is the best inference from that convention; confirm against your gateway if unsure.

---

## Authentication & Authorization

Runs behind the standard authenticated pipeline (access-token validation + tenant resolution). The actor is identified by `actionPerformerURDD`, which the frontend sends in the encrypted request header on every request (GETs included).

`requestMetaData.permission` is `null` — there is **no per-operation permission declared on the object**. Instead, the write operations are gated by a pre-process permission check (`requireAnyConfigKeyPermission`) and a tenant-ownership guard.

| Operation | RBAC permission (any one grants access) | Tenant ownership guard |
|---|---|---|
| List | — | — (SELECT-only tenancy filter applies) |
| View | — | — |
| Add | `add_hms_config_possible_values` · `update_hms_config_possible_values` · `delete_hms_config_possible_values` · `manage_config_possible_values` | — |
| Update | same set | `makeTenantOwnershipPreProcess` on `hms_config_possible_values` (row must belong to the requester's tenant) |
| Delete | same set | same guard |

A permission failure returns **403**; a missing `actionPerformerURDD` returns **400**.

---

## Request Payload

| Field | Type | Required | Description |
|---|---|---|---|
| `hmsConfigPossibleValues_id` (`id`) | `number` | View / Update / Delete | PK of the possible-value row (sent as `?id=` query param). |
| `config_id` | `number` | Add | Parent `hms_config_keys.config_key_id` this value belongs to. |
| `config_possible_value` | `string` \| `object` | Add (required); Update (optional) | The displayed value. A multilingual object `{ "en": …, "ar": … }` or a scalar; normalized to JSON-valid text on write. |
| `config_value_num` | `number` | No | Ordinal / sort key. Managed by the server (see Behavior); not usually sent by the client. |
| `is_default` | `boolean` | No | When truthy, makes this row the default (moves it to `config_value_num = 1`, swapping the current default out). |
| `actionPerformerURDD` | `number` | Yes | Acting admin's URDD (identity + `created_by` / `updated_by`). |
| `language_code` | `string` | No | Language hint (query param). |

### Example — Add

```json
{
  "actionPerformerURDD": 42,
  "config_id": 68,
  "config_possible_value": { "en": "USD", "ar": "دولار", "key": "USD" },
  "is_default": false
}
```

---

## Response

Writes return the query-resolver metadata (insert/update result). List/View return decorated rows.

### List (decorated rows)

```json
[
  {
    "id": 105,
    "hmsConfigPossibleValues_id": 105,
    "hmsConfigPossibleValues_configId": 68,
    "hmsConfigPossibleValues_configValueNum": 1,
    "hmsConfigPossibleValues_configPossibleValue": { "en": "SAR", "ar": "ر.س", "key": "SAR" },
    "hmsConfigPossibleValues_status": "active",
    "hmsConfigKeys_configKey": "currency",
    "hmsConfigKeys_configName": "Currency",
    "hmsConfigKeys_valueType": "dropdown",
    "hmsConfigKeys_isMultiValue": 0,
    "is_default": true,
    "can_add_more_to_config": true,
    "can_delete": false,
    "table_count": 4
  }
]
```

| Field | Type | Description |
|---|---|---|
| `hmsConfigPossibleValues_configPossibleValue` | `object` \| `string` | Parsed back into a real object (not a JSON string). |
| `hmsConfigPossibleValues_configValueNum` | `number` | Ordinal; `1` marks the default. |
| `hmsConfigKeys_valueType` | `string` | Parent key's value type (e.g. `dropdown`). |
| `is_default` | `boolean` | `true` when `config_value_num === 1`. |
| `can_add_more_to_config` | `boolean` | `true` if the parent key's `value_type` permits adding more values. |
| `can_delete` | `boolean` | `true` only if the parent config has more than one active value (else deletion is blocked). |
| `table_count` | `number` | Total row count (List only, for pagination — `pageSize: 50`). |

`View` returns a single decorated row (same shape, without `table_count`).

---

## Behavior

**Add is gated by `value_type`.** A value can only be added when the parent `hms_config_keys.value_type` is one of `dropdown`, `dropdown_multiselect`, `multi_checkbox`, `cron_job_form` — the config types that semantically accept multiple options. Anything else throws `NOT_SUPPORTED`.

**`is_default` and `config_value_num`.** The row with `config_value_num = 1` is the default.
- On **Add** with `is_default = true`, the new row takes slot `1` and the previous default is shifted to `MAX + 1` (completed in a post-process UPDATE). Without `is_default`, the new row gets `MAX + 1`.
- On **Update** with `is_default = true`, the target row is swapped into slot `1` and the current default takes the target's old number (done via an intermediate `-1` parking value to avoid collisions).

**Delete is a soft-delete** (`status = 'inactive'`) and is **blocked when the parent config has only one active value** — every config must keep at least one row for the form generator to bind to. Attempting it throws `MIN_POSSIBLE_VALUES`. Deleting an already-inactive row is a no-op.

**Value normalization.** `config_possible_value` is always stored as JSON-valid text via the shared `toEmbeddedConfigValue` normalizer (multilingual → `{ "en": …, "ar": … }`, scalar → JSON-encoded), so reads parse cleanly.

**Read decoration.** List/View post-processes parse the stored JSON and add `is_default`, `can_add_more_to_config`, and `can_delete` flags so the frontend needs no extra queries.

**Tenant isolation.** Update / Delete run `makeTenantOwnershipPreProcess` so a tenant cannot mutate another tenant's rows (resolved via the row's `created_by` URDD → tenant chain).

---

## Source Files

| File | Purpose |
|---|---|
| `Src/Apis/ProjectSpecificApis/CustomConfigPossibleValues/CustomConfigPossibleValues.js` | API object; Add/Update/Delete pre-processes, default-swap logic, read decoration, SQL |
| `Src/Apis/ProjectSpecificApis/CustomConfigPossibleValues/CRUD_parameters.js` | Request field schema + `colMapper` |
| `Src/HelperFunctions/PreProcessingFunctions/configKeyManagementPermission.js` | `requireAnyConfigKeyPermission` — RBAC gate for writes |
| `Src/HelperFunctions/PreProcessingFunctions/tenantOwnership.js` | `makeTenantOwnershipPreProcess` — cross-tenant write guard |
| `Src/HelperFunctions/PayloadFunctions/Governance/normalizeConfigValue.js` | `toEmbeddedConfigValue` — JSON-valid value normalization |
