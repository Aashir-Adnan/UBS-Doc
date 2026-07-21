# Config Possible Values (Grouped Effective Values)

CRUD over the `hms_config_possible_values` table — the bank of selectable option values the frontend offers for HMS config keys. The distinctive part is **List**, whose post-process rebuilds the *effective* possible values for every config key, grouped by the entity they apply to.

| Operation | Method | Path | Permission (any one) |
|---|---|---|---|
| List | **GET** | `/api/hmsconfig/possiblevalues/crud` | *(none — auth layer only)* |
| View | **GET** | `…?id=<id>` | *(none — auth layer only)* |
| Add | **POST** | `/api/hmsconfig/possiblevalues/crud` | `add_hms_config_possible_values` · `update_hms_config_possible_values` · `delete_hms_config_possible_values` · `manage_config_possible_values` |
| Update | **PUT** | `/api/hmsconfig/possiblevalues/crud` | same set as Add |
| Delete | **DELETE** | `…?id=<id>` | same set as Add |

Operated by the **Tenant Admin / Tenant Manager** (via `manage_config_possible_values`) or the **SaaS Admin** (framework-tier `*_hms_config_possible_values`). Add/Update/Delete are plain single-row writes; all the interesting behaviour lives in List.

> **Route note.** The URL resolves to `global.HmsconfigPossiblevaluesCrud_object` via PascalCase conversion; the path shown is best-inferred from that convention. This is a **different API** from `CustomConfigPossibleValues` — it produces a grouped effective-values map rather than plain decorated rows.

---

## Authentication & Authorization

`requestMetaData.permission` is `null`. Writes are gated by the pre-process `requireWritePermission` (`requireAnyConfigKeyPermission`); List/View are open beyond the auth layer.

| Operation | RBAC permission (any one grants access) |
|---|---|
| List | — |
| View | — |
| Add | `add_hms_config_possible_values` · `update_hms_config_possible_values` · `delete_hms_config_possible_values` · `manage_config_possible_values` |
| Update | same set |
| Delete | same set |

A permission failure returns **403**; a missing `actionPerformerURDD` returns **400**.

---

## Request Payload

| Field | Type | Source | Required | Description |
|---|---|---|---|---|
| `hmsConfigPossibleValues_id` (`id`) | `number` | query | View / Update / Delete | PK of the row. |
| `config_id` (`hmsConfigPossibleValues_configId`) | `number` | body | Add / Update | Parent `hms_config_keys.config_key_id` this value belongs to. |
| `config_value_num` (`hmsConfigPossibleValues_configValueNum`) | `number` | body | Add / Update | Numeric sort key for ordering options. |
| `config_possible_value` (`hmsConfigPossibleValues_configPossibleValue`) | `string` \| `object` | body | Add / Update | The displayed value (usually a bilingual JSON object); normalized to JSON-valid text on write. |
| `actionPerformerURDD` | `number` | body | Yes | Acting admin's URDD (`created_by` / `updated_by`). |
| `language_code` | `string` | query | No | Language hint. |

### Example — Add

```json
{
  "actionPerformerURDD": 1,
  "hmsConfigPossibleValues_configId": 68,
  "hmsConfigPossibleValues_configValueNum": 3,
  "hmsConfigPossibleValues_configPossibleValue": { "en": "USD", "ar": "دولار", "key": "USD" }
}
```

---

## Response

### List — grouped effective values

List **ignores its raw SQL rows** and rebuilds the response as a map keyed by `service_category_id`, plus a `package` key:

```json
{
  "196": [
    {
      "id": 3312,
      "hmsConfigPossibleValues_id": 3312,
      "hmsConfigPossibleValues_configId": 116,
      "hmsConfigPossibleValues_configPossibleValue": { "en": "0", "ar": "٠" },
      "hmsConfigPossibleValues_status": "active"
    }
  ],
  "package": [
    {
      "id": 105,
      "hmsConfigPossibleValues_id": 105,
      "hmsConfigPossibleValues_configId": 68,
      "hmsConfigPossibleValues_configPossibleValue": { "en": "SAR", "ar": "ر.س" },
      "hmsConfigPossibleValues_status": "active"
    }
  ]
}
```

Every row also carries **`hmsConfigPossibleValues_isKeyWide`** — the SHARED marker (§A.4): `0` explicit · `1` Case A (`'*'` name → every category **and** packages) · `2` Case B (`service_categories` + value `'*'` → every service category). Case A/B rows are **fanned** into every enabled category bucket (Case A also into `package`), so the *same* option object (same `id`, `isKeyWide > 0`) appears in multiple buckets — treat an edit/delete of it as **one** action. The FE shows the **apply-to-this-category vs keep-shared** dialog when `isKeyWide > 0` and sends `keep_shared` on the write (see [Config Keys — Enabled-For](./config-keys-enabled-for.md)). The frontend filters a bucket by `hmsConfigPossibleValues_configId` to find one key's options. (The grouped object is **not** paginated even though `pageSize: 10` is configured.)

### View — single plain row

```json
{
  "id": 105,
  "hmsConfigPossibleValues_id": 105,
  "hmsConfigPossibleValues_configId": 68,
  "hmsConfigPossibleValues_configValueNum": 1,
  "hmsConfigPossibleValues_configPossibleValue": { "en": "SAR", "ar": "ر.س" },
  "hmsConfigPossibleValues_status": "active",
  "hmsConfigPossibleValues_createdBy": 1,
  "hmsConfigPossibleValues_updatedBy": 1
}
```

Write operations return the query-resolver metadata.

---

## Behavior

**List builds an effective-values map from two base queries** (both now over `hms_config_possible_values` — storage refactor Phase 4/5):
1. **Service buckets** ← `hms_config_possible_values` where `scope_constraint_name = 'service_categories'`, grouped by `scope_constraint_value` (= `service_category_id`). *(Historically these lived in `hms_config`, `base_table='service_categories'` — no longer.)*
2. **`package` bucket** ← `hms_config_possible_values` where `scope_constraint_name = 'packages'`, joined to `hms_config_keys` where the key `applies_to = '*'` or `target_table LIKE '%packages%'`. The `scope_constraint_name='packages'` filter keeps co-resident service mirrors out of the package bucket.
3. **`'*'` (both-scope) options** ← rows where `scope_constraint_name = '*'` (key-wide — apply to every category **and** packages). Because a `'*'` row has no single category, it's **fanned server-side** into every category the key is `enabled_for` (added to those category buckets) **and** the `package` bucket. It's tenant-scoped by `created_by`/`applies_to` (a dedicated `starTenancyFilter`), not by `scope_constraint_value`, so a Service Manager's category filter doesn't drop it.

**Per-request tenancy scoping (List).** This post-process bypasses the query resolver, so it scopes both reads itself by the actor resolved from `actionPerformerURDD`:
- **Service Manager** → his tenant + his service category.
- **Tenant Admin / Tenant Manager / SaaS Admin** → his tenant only (rows whose `created_by` URDD belongs to his tenant).
- Tenancy on but no resolvable tenant → **fail closed** (`AND 1 = 0`, no tenant-specific rows). Tenancy off → no extra filter.

**Curated ordering.** Both buckets are ordered by `config_value_num` — the curated sequence (e.g. `access_scope`'s public-first order) was baked into `config_value_num` by the storage-refactor migration. The old `orderServiceBucketsByPointerMap` step (which followed `hms_config_keys.possible_values`) was **removed** — that pointer map is retired.

**`sort_order` prefill augment (currently DISABLED).** The helpers that would overwrite each `sort_order` ("Display Order") row with the next free position (`max + 1`, scoped to the acting tenant) are kept intact but their invocation is commented out. Today List returns the plain grouped buckets with `sort_order` rows keeping their stored value.

**Value normalization on write (§8.2 split).** `config_possible_value` is written through `splitConfigValueForWrite`: a simple `{en,ar}` label stores the **bare `en`** and mirrors `ar` to `translated_entries` (`applyArTranslation`); a structured value (`key`/`label`/`group`) is stored whole. Reads reconstruct the object via `localizedConfigValueSql`. Delete is a soft-delete (`status = 'inactive'`).

> **Known cross-tenant breadth caveat:** the two base List queries are otherwise not tenant-scoped at the SQL level (the per-request filters above narrow them); the frontend only reads its own clone's `config_id`, so it is benign in practice but noted as an open follow-up.

---

## Source Files

| File | Purpose |
|---|---|
| `Src/Apis/ProjectSpecificApis/HmsConfigPossibleValuesCrud/HmsConfigPossibleValuesCrud.js` | API object; `listPostProcess` grouped map, ordering + `sort_order` augment helpers, SQL |
| `Src/Apis/ProjectSpecificApis/HmsConfigPossibleValuesCrud/CRUD_parameters.js` | Request field schema + `colMapper` |
| `Src/Apis/ProjectSpecificApis/HmsConfigPossibleValuesCrud/CONTEXT.md` | Design notes (grouped map, tenancy, disabled `sort_order` augment) |
| `Src/HelperFunctions/PreProcessingFunctions/configKeyManagementPermission.js` | `requireAnyConfigKeyPermission` — RBAC gate for writes |
| `Src/HelperFunctions/PayloadFunctions/Governance/configValueLocalization.js` | `splitConfigValueForWrite` / `applyArTranslation` / `localizedConfigValueSql` — §8.2 value split, `ar`→`translated_entries`, read reconstruction |
