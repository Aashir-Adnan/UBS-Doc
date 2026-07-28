# Tenant Configs (tenant-scoped settings)

This is the reference for **the config keys that apply to the hotel/tenant itself** — not to a
service, package or category — and the API that reads and writes them:
`/api/tenant/configs`.

> **Prerequisite:** read [config-keys.md](../config-keys/config-keys.md) and
> [config-storage-model.md](../config-keys/config-storage-model/config-storage-model.md) first. This
> page assumes you know the difference between a config **key**, a **possible value** (a selectable
> option) and an **applied value** (what an entity actually picked), plus the SaaS-original /
> tenant-clone split.

---

## 1. What is tenant-scoped

A config key declares where it applies via `hms_config_keys.target_table`. Four keys were repointed
to `target_table='tenants'` (migration `20260720_2`), meaning their applied value belongs to the
**hotel**, once, rather than to each service or package:

| Config key | `value_type` | Stored as | Multiple values? |
|---|---|---|---|
| `payment_timing` | `dropdown` (`is_multi_value=1`) | `is_input=0` **reference** — one row per option id | **Yes**, as rows |
| `tax_profile` | `tax_profile_api_form` | `is_input=1` **authored form**, kept whole | **Yes**, inside the value |
| `pricing_rules` | `pricing_rules_api_form` | `is_input=1` **`pricing_rule_id`(s)**, kept whole | **Yes**, inside the value |
| `deposit_amount` | `deposit_form` | `is_input=1` **authored form**, kept whole | No |

Only `payment_timing` is a possible-value reference set. The `*_api_form` keys carry their
multiplicity **inside** the stored value (an id collection, a `profiles` collection) in a **single**
row — they are not exploded.

The applied values live in `hms_config` with `base_table='tenants'` and
`record_id = <tenant_id>` (see §3).

:::caution `value_type` is not uniform across clones
`deposit_amount` is `deposit_form` on most tenant clones but `text_area` on a couple. Always render
from the `value_type` returned **for that tenant**; never hardcode it per key name.
:::

### What `is_input` actually means

`is_input` describes **where the stored value comes from**, and it is the single flag that decides
how you read and write a config:

- **`is_input = 0` — selected.** The stored value is an **`hms_config_possible_values` id**. The user
  picked an option from the key's `possibleValues[]`; the row holds the id, and the read resolves it
  back to its label.
- **`is_input = 1` — entered.** The stored value is **what the user actually typed / built** — a
  number, a text, a filled-in form, a collection. There is no option id to resolve, so the value is
  stored and returned **whole and unexamined**.

### `tax_profile` and `pricing_rules` relate to the `pricing_rules` table

Both keys relate to the **`pricing_rules`** table, told apart by its `rule_type` column
(`'tax'` vs `seasonal` / `segment` / `dynamic` / `base`) — but they are consumed **differently**:

- **`pricing_rules` — the admin selects existing rules.** The applied value is one or more
  **`pricing_rules.pricing_rule_id`**, obtained from the pricing-rules endpoint.
- **`tax_profile` — the admin authors the value.** Its single possible value is the `fields`
  **schema** (there is nothing selectable), so the applied value is a filled-in form instance.

Both are therefore `is_input = 1`: neither stores a possible-value id.

:::danger `pricing_rule_id`s are not possible-value ids
A `pricing_rule_id` must **never** be resolved against `hms_config_possible_values` — the two id
spaces overlap. Pricing rule `39` ("Season") is also possible value `39` of
`inventory_capacity_per_age_group` (`"2-4"`), so resolving it as an option silently returns a
different key's label. This API stores and returns pricing rule ids verbatim.
:::

---

## 2. The API

| Operation | Call | Permission |
|---|---|---|
| List | `GET /api/tenant/configs` | `list_hms_config` |
| View | `GET /api/tenant/configs?id=<config_key_id>` | `view_hms_config` |
| Save | `POST /api/tenant/configs` | `add_hms_config` |
| Remove | `DELETE /api/tenant/configs?id=<hms_config id>` | `delete_hms_config` |

**Read** returns the key **plus** its possible values **plus** the tenant's applied value — one call
populates a whole settings screen, with no second request for options.

**Write** touches the applied value in `hms_config` only. Keys and possible values are never modified
by this API — use the config-keys / possible-values admin APIs for those.

**Tenancy.** The tenant is resolved from the acting `actionPerformerURDD`; callers never send a
tenant id. A save is rejected if the key is not tenant-scoped or belongs to a different tenant.

### Read shape

```jsonc
{
  "tenantConfig_configKeyId": 4079,
  "tenantConfig_configKey": "payment_timing",
  "tenantConfig_valueType": "dropdown",
  "tenantConfig_isMultiValue": 1,

  "tenantConfig_possibleValues": [
    { "hmsConfigPossibleValues_id": 11547,
      "hmsConfigPossibleValues_configPossibleValue": { "en": "At booking", "ar": "عند الحجز" },
      "hmsConfigPossibleValues_status": "active" }
  ],

  "tenantConfig_applied": {
    "hmsConfig_ids": [98765, 98766],
    "hmsConfigPossibleValues_ids": [11547, 11548],
    "hmsConfig_isInput": 0,
    "hmsConfig_configValue": [
      { "en": "At booking", "ar": "عند الحجز" },
      { "en": "At service", "ar": "عند تقديم الخدمة" }
    ]
  }
}
```

Two guarantees:

1. **`tenantConfig_applied` is always present.** For a key the tenant has never configured, the block
   is empty **but `hmsConfig_isInput` is still filled in** (derived from `value_type`), so a first
   save can never choose the wrong "empty" shape.
2. **`hmsConfigPossibleValues_ids` gives the selected option ids verbatim** (reference keys only).
   The stored rows *are* those ids, so consumers should never reverse-match display labels back to
   options — label matching is fuzzy (duplicate, renamed or re-localized labels) and, combined with
   replace-style saves, a missed match would silently drop the selection.

Possible-value payloads are **polymorphic** — a bilingual object, a flat `value`/`key` option, a rich
object, or an inline `fields` form schema. Render by the value's shape, not by `value_type` alone:
`tax_profile` is typed `*_api_form` yet carries an inline schema, while `pricing_rules` carries only
a label (its options come from the pricing-rules endpoint).

---

## 3. Writing a value

```jsonc
{
  "config_key_id": 4079,        // required — identifies the key
  "config_value": "<see table>",
  "is_input": 0,                // required — 0 selected / 1 entered; stored exactly as sent
  "actionPerformerURDD": 220
}
```

Only these fields are read. **`config_key` is never sent** — the backend derives it from
`config_key_id`. **`is_input` is required and stored verbatim** — the backend does **not** derive it
on write; a save that omits it is rejected. Send the `hmsConfig_isInput` value the read handed you
(it's a pre-save hint for keys not yet configured, and the stored value once they are).

The value's shape is driven by **`is_input`**, which the read hands you:

| `is_input` | Keys | Send |
|---|---|---|
| **0** — selected | `payment_timing` | the possible-value ids — `[11547, 11548]`, or `11547` for one |
| **1** — entered | `tax_profile`, `pricing_rules`, `deposit_amount` | the value itself, wrapped once: `[{ "en": "<stringified value>", "ar": "" }]` |

For `is_input = 1` the backend does **not** interpret the value, so its internal shape is entirely
the caller's: `{"profiles":[…]}` for several tax profiles, an id collection for several pricing
rules. Whatever you send is what you read back.

:::tip Clearing is uniform
To clear a setting, send **any** empty value — `[]`, `null`, an empty string, an empty object, or a
blank bilingual bag. They are all treated the same, so callers do **not** need to branch on
`is_input` just to clear a field.
:::

**Reads give labels, writes take ids.** Feed `hmsConfigPossibleValues_ids` straight back into the
save.

**A save carries the key's full value.** Unselecting one option means re-sending the remaining ids —
there is no "remove one option" call.

### How the save is persisted — update in place

The save **reuses the tenant's existing rows** for that key, in id order:

- values that overlap → the existing row is **updated in place**, keeping its id, creation time and
  its Arabic translation;
- extra values → **inserted**;
- surplus rows → **retired** (`status='inactive'`).

So editing an existing setting edits its row rather than leaving an inactive tombstone behind and
creating a new id. Shrinking a selection retires only the surplus. If an updated value no longer
carries Arabic text, the stale translation is retired with it.

### How values are stored

- A **single value is stored bare** — never wrapped in an array. Selecting one option persists `39`,
  not `[39]`.
- **No `NULL` and no empty-array placeholder row is ever written.**
- **Clearing retires the rows** rather than parking an empty one, so an unset setting simply has no
  active row. Reads then return an empty applied value and an empty list of selected ids.

### Emptying vs removing

Both end with no active row for that key; they differ only in how you express it:

- **Save with an empty value** — the natural "the admin emptied this field" path.
- **Delete** — retires the whole `(tenant, key)` row-set. Pass any one of `hmsConfig_ids`; a
  multi-value selection spans several rows and all of them are retired.

---

## 4. Storage rules recap

Everything above follows the shared model in
[config-storage-model.md](../config-keys/config-storage-model/config-storage-model.md):

- **One value per row.** A reference set (`is_input=0`) explodes to one row per selected id; an
  entered value (`is_input=1`) stays a **single** row with the value kept whole. An empty selection
  writes **no** row at all — the existing rows are retired.
- **Translations externalised.** A simple bilingual value stores the bare English on the row and
  mirrors the Arabic into `translated_entries`; structured values are stored whole.
