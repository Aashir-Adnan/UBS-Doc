# Config Option Storage Model (Possible Values)

This is the reference for **where a config key's selectable option values actually live, and how they're read and written** after the storage refactor. If [config-keys.md](../config-keys.md) answers *"what is a config key and how do I enable it,"* this page answers *"when a key like `visibility` offers `draft`/`published`, or `amenities_tags` offers a list of chips — where are those option rows, and what shape do they have on the wire?"*

> **Prerequisite:** read [config-keys.md](../config-keys.md) first — this page assumes you know the difference between a config **key** (definition), a **possible value** (a selectable option), and an **applied value** (what an entity picked), plus the SaaS-Admin-owns-the-original / tenant-owns-a-clone split.

---

## 1. The one-table rule

**Every selectable option — for both service categories and packages — lives in `hms_config_possible_values`.** There is no longer a per-category pointer array on `hms_config_keys`, and service options are no longer stored in `hms_config`.

Each option row is tagged with **which scope it applies to** via two columns:

| Column | Values | Meaning |
|---|---|---|
| `scope_constraint_name` | `service_categories` \| `packages` \| `*` | Which entity scope this option belongs to. **`*` = both-scope / key-wide**: the option applies to **every** service category **and** packages (see §1.1). |
| `scope_constraint_value` | `<service_category_id>` \| `*` | The specific service category the option is for; `*` = key-wide (used for the `packages` scope and for `*`-name rows). |
| `config_value_num` | integer (nullable) | Display order within `(config_id, scope)`. Curated order was baked in by the migration; new options **append** (`MAX+1`). |

So the options for key `K`:

```sql
-- service-category options, per category, in display order
SELECT id, scope_constraint_value AS category_id, config_possible_value, config_value_num, status
FROM hms_config_possible_values
WHERE config_id = K AND scope_constraint_name = 'service_categories' AND status <> 'inactive'
ORDER BY CAST(scope_constraint_value AS UNSIGNED), config_value_num;

-- package options (key-wide)
SELECT id, config_possible_value, config_value_num, status
FROM hms_config_possible_values
WHERE config_id = K AND scope_constraint_name = 'packages' AND status <> 'inactive'
ORDER BY config_value_num;
```

> Service options are usually stored **explicitly per category** (one row per category, literal `scope_constraint_value`). An option can instead be stored **once** as a **shared** row — Case A (`scope_constraint_name='*'`) or Case B (`service_categories` + value `'*'`) — see §1.1.

### 1.1 SHARED options — two "key-wide" shapes (Case A / Case B)

An option can be stored **explicitly per category** (one `service_categories` row per category, + a `packages` row) **or collapsed** into a single **shared** row. There are **two** shared shapes:

| Shape | Storage tag | Applies to | `isKeyWide` |
|---|---|---|---|
| **explicit** | `scope_constraint_name='service_categories'`, `scope_constraint_value=<catId>` — or `='packages'` | that one category (or packages) | `0` |
| **Case A — both-scope** | `scope_constraint_name='*'` | **every** service category **AND** packages | `1` |
| **Case B — all-service-categories** | `scope_constraint_name='service_categories'`, `scope_constraint_value='*'` | **every** service category (NOT packages) | `2` |

> **Which shape is valid for a key** follows its `hms_config_keys.target_table`: a `'*'` (Case A) row is only correct when the key targets **both** `services` **and** `packages`; a services-only key uses **Case B**; a packages-only key uses `scope_constraint_name='packages'`. (Migration `20260716_1_fix_star_scope_by_target_table.sql` retags legacy `'*'` rows that violated this.)

**Read flag.** Every possible-value object from the admin PV APIs carries **`isKeyWide`** (`hmsConfig_isKeyWide` / `hmsConfigPv_isKeyWide` / `hmsConfigPossibleValues_isKeyWide`) with the value above, so the FE knows the option is shared.

**Admin-side readers honor both shared shapes:**

```sql
-- service-scope read (admin): explicit category rows PLUS Case A ('*') AND Case B (svc_cat + '*')
WHERE config_id = K AND status <> 'inactive'
  AND ( (scope_constraint_name = 'service_categories' [AND scope_constraint_value = <cat>])
        OR scope_constraint_name = '*' )
-- package-scope read (admin): package rows plus Case A only (Case B is service-only)
WHERE config_id = K AND status <> 'inactive' AND scope_constraint_name IN ('packages', '*')
```

For the **offered-options map** (`hmsConfigKeys_possibleValues`), a shared option can't sit in one category bucket, so the backend **fans it out server-side** into every category the key is `enabled_for` — Case A also into the `package` bucket, Case B into categories only — via `Governance/scopeStarFanout.js` (`getEnabledCategoriesByKey` + `fanStarIntoMap({ includePackage })`). The `{ "<catId>":[ids], "package":[ids] }` contract is unchanged (no FE change).

**Write — split vs keep-shared (Add / Update / Delete).** The FE reads `isKeyWide` and, on a shared option, sends a **`keep_shared`** boolean:

- **Add** (service): `keep_shared=true` creates a **Case A `'*'`** option directly (no `service_category_id`); omitted → a per-category row.
- **Update / Delete** of a shared option (`isKeyWide > 0`) from a per-category screen:
  - `keep_shared=true` → change/soft-delete the shared row **in place** (stays shared, key-wide).
  - `keep_shared=false` / omitted → **split (de-collapse)**: materialise explicit `service_categories` rows for every `enabled_for` category (+ a `packages` row for Case A); the **target** category gets the edit (or is omitted on delete), every **other** keeps the **original** value, and the shared row is soft-deleted. Net: "change/remove this option for just Dining" — Dining diverges, the rest are untouched. (`Governance/splitSharedPv.js`.)

> **Guest-side readers are NOT changed** — they still read explicit `service_categories`/`packages` rows only. Shared-shape honoring is an **admin-side** behavior (catalog CRUD + service/package edit catalog + governance clone/propagation). If a DB stores options under a shared tag, ensure the guest path has the explicit rows it needs, or extend guest readers separately.

---

## 2. Value shape: simple vs structured (translations)

An option's `config_possible_value` is stored in **one of two forms**, decided by whether the value carries structure. Translations for the simple form are externalised to `translated_entries`.

**Simple** — the value is only a label (`{en, ar}` with no `key`/`label`/`group`):
- `config_possible_value` holds the **bare English string** (JSON-invalid on purpose, e.g. `published`).
- The Arabic text lives in `translated_entries`:
  `table_name='hms_config_possible_values'`, `column_name='config_possible_value'`, `record_id=<option id>`, `language_code_id=<ar>`.

**Structured** — the value carries a slug/structure (`key`, `label`, or `group` — e.g. `amenities_tags`, `access_scope`, `service_type`):
- `config_possible_value` keeps the **whole object** intact (the `key` slug is preserved for matching).
- A whole-object copy is also mirrored into `translated_entries`.

**Reader contract** (use the shared helper — do not re-implement): if `config_possible_value` is a JSON **object**, return it as-is; otherwise it's simple, so return `{ en: <column>, ar: <translated_entries ar> }`. In SQL this is `localizedConfigValueSql(pvAlias)`; in JS it's `reconstructConfigValue(raw, arText)` (both in `Governance/configValueLocalization.js`).

> **One translation per `(record_id, language_code_id)`.** The `ar` lookup uses `LIMIT 1` with no `ORDER BY`, so there must be exactly **one active** `translated_entries` row per option per language — two active Arabic rows for one option would render an arbitrary label. The write path never creates duplicates (`applyArTranslation` is UPDATE-if-present-else-INSERT), but a legacy data condition can. Migration `20260716_2_dedup_duplicate_config_pv_translations.sql` enforces the invariant: keep the newest per `(record_id, language_code_id)`, soft-delete the rest (natural-key targeted → clone-safe and reversible).

**On the wire, nothing changed for consumers:** every option-returning endpoint still returns the same `{ "en": …, "ar": …, … }` object — simple values are reconstructed from the column + `translated_entries`, structured values pass through unchanged. Row **ids** differ from the pre-refactor data (options were re-homed), but they remain opaque handles.

---

## 3. Writing option values

The write APIs (`/api/hms_config_keys/enabled_for` in possible-values mode, and the possible-value CRUD endpoints) split the incoming value by the same structure rule:

- **Simple** → store the bare `en` in `config_possible_value`; upsert the `ar` into `translated_entries` (UPDATE-if-present, else INSERT).
- **Structured** → store the whole object (+ the `translated_entries` object copy).

`config_value_num` is computed as `MAX+1` within the `(config_id, scope)` so a new option appends. Deletes are soft (`status='inactive'`); the row and its `translated_entries` stay (harmless).

---

## 4. The retired pointer map

`hms_config_keys.possible_values` (the old `{"<catId>":[ids], "package":[ids]}` JSON pointer) is **decommissioned**: no reader consults it and no writer maintains it (`syncPossibleValues` is a no-op; the probation-finalizer no longer rebuilds it). Ordering now lives in `config_value_num`. The column itself has not been dropped yet — that step is coordinated with the guest-side migration and is out of scope here — so treat it as **frozen and non-authoritative**.

---

## 5. Governance (clone / materialise / propagate)

When a config key is cloned or materialised for a tenant, its options are inserted into the tenant's `hms_config_possible_values` (scope-tagged, `source_hms_config_possible_value_id` lineage preserved), and each option's `translated_entries` row is cloned alongside it. **All shared / key-wide shapes are mirrored** — the deep-clone copies the `packages`, Case A `'*'`, **and Case B (`service_categories` + value `'*'`)** rows **once** (each is key-wide), preserving their scope; the tenant's shared-aware readers then fan them into the clone's owned categories. The per-category **explicit** rows (`service_categories` with a numeric value) are materialised separately by `materializeConfigValuesForCategory` — so a **Case-B-only** key (e.g. `access_scope`, `laundry`, whose option set is one shared master applying to every category) is cloned by the deep-clone step, **not** the per-category materialiser; without cloning Case B there, the tenant's option list would come up **empty**. The `apply_on_all` Add/Update/Delete propagation likewise carries a `'*'` branch so a shared option edit reaches every clone's shared row regardless of the edited `target`.

**`apply_on_all` fan-out (SaaS-global original → tenant clones).** When a SaaS Admin edits a **global original** key's options with `apply_on_all` set, the admin API fans the change out to eligible clones — for **all three** write verbs, not just updates:

| Op | Helper | Effect on clones |
|---|---|---|
| **Add** | `propagateConfigValueAdds` | inserts the new option into each eligible clone (category-owning + not-already-customised gates), with a cloned `translated_entries` row and signature dedup; customised clones → `conflicts`, non-owning → `skipped`. |
| **Update** | `propagateConfigValueUpdates` | updates the matching option in unedited clones (also syncs its `ar`); tenant-customised clones left as-is (`conflicts`). |
| **Delete** | `propagateConfigValueDeletes` | soft-deletes the matching option in unedited clones. |

In short: options + their translations travel together through the governance layer, and a global-original change reaches every unedited clone while never overwriting a tenant's customisation.

---

## 6. Applied values (what an entity picked)

Applied values on services/packages live in `hms_config` (`base_table='services'|'packages'`), written by the **CustomServices / CustomPackages** APIs (not the config-key admin API). The storage rule is **one scalar per row** — a selection of several values becomes several rows, never a JSON array — with the exact shape decided by the value's `is_input` flag and `value_type`:

| Kind | `is_input` | Stored shape |
|---|---|---|
| **Reference set** — a selection of option ids (`is_input=0`: dropdowns, checkboxes, keyword chips, `deliver_unit`, `base_currency`, …) | 0 | **exploded** — one bare id per row. Empty selection → a single `'[]'` row (never NULL — the read `JSON.parse`s it). |
| **Single scalar** — `number` / `decimal` / `datetime` / `date` / `time` / `mm:dd:hh` / `number_spinner` / `*_api_dropdown` | 1 | the FE's one-element wrapper **collapses to a bare scalar** (`[7]` → `7`); one row. |
| **Free text** — `text` / `text_area` / `email` / `tel` | 1 | bare `en`; `ar` mirrored to `translated_entries`; one row. |
| **Wrapped** — `attachment`/media, `*_api_form` (`tax_profile`, `pricing_rules`), object-valued forms (`blackout_dates`, `allowed_regions`) | 1 | stays a **single wrapped array/object row** — `is_input=1` is a one-row read contract, so these are NOT exploded or unwrapped (e.g. media `[149,150]` → one `"[149,150]"` row). |

Readers re-aggregate the exploded `is_input=0` rows per `(record_id, config_key_id)` back into a value array and resolve each id to its option value via the reader contract in §2; `is_input=1` reads the single representative row. This is the write-side counterpart to the option-storage model above — see the `normalizeConfigValue` / `splitConfigValueToRows` helpers in the CustomServices/CustomPackages writers.
