---
title: "4 · Services"
sidebar_position: 4
---

# 4 · Services

`/api/custom/services` — what a guest actually books.

A service pulls the whole model together: a category, multilingual text, media, pricing, a set of
`hms_config` values, the locations it is offered at, and the delivery units that fulfil it.

| Method | Operation | Permission |
|---|---|---|
| `GET` | List | `list_services` |
| `GET ?id=` | View | `view_services` |
| `POST` | Add | `add_services` |
| `PUT` | Update | `update_services` |
| `DELETE` | Delete | `delete_services` |

Tenant ownership is enforced on top of the permission on Update and Delete. All operations accept
`language_code` (defaults to `en`); List defaults to `page_size` 10.

:::info Who this chapter is for
The write contract below is only half the story. Every id in a real payload —
`categoryId`, `catalogId`, `config_key_id`, and **every** number inside a
`config_value` for an `is_input: 0` key — is resolved by the admin panel from a
**different** endpoint before the POST is assembled. A seed script that invents
those ids writes rows the reader cannot resolve.

[**The authoring cycle**](#the-authoring-cycle--every-call-behind-one-post) lists
every one of those calls, its response shape, and which field of the payload it
feeds. [**Encoding a config value**](#encoding-a-config-value--the-parsers-rules)
is the exact per-`valueType` wire shape the panel produces, which is what
"seeded exactly as the admin panel posts it" actually means.
:::

---

## The authoring cycle — every call behind one POST

The Hotel Package Studio (`frontend/src/root/Pages/HotelPackageStudio`) never posts
from a static form. It builds the form from the backend's own config catalog, then
projects the filled tree back onto the wire. One `POST /custom/services` is the tail
of this sequence:

```
BOOT (listing screen)
  GET  /catalogs                          → catalogId
  GET  /crud/service/categories           → categoryId  (+ the slug the UI filters on)
  GET  /custom/services                   → the listing (also the option source for
  GET  /custom/packages                     services_as_amenities)

FIRST MODAL OPEN (deferred until the admin clicks Create/Edit)
  GET  /hms_config_keys_catalog           → WHICH config keys exist, and their valueType
  GET  /hmsconfig/possiblevalues/crud     → every option id an is_input:0 key may hold
  GET  /config/constraints                → numeric bounds between configs
  GET  /crud/currencies                   → base_currency options
  GET  /crud/pricing/rules                → pricing-rule options
  GET  /custom/service_location_facets    → buildings / floors / zones / locations

WHILE THE ADMIN FILLS THE FORM (per widget, on demand)
  POST /custom/delivery/units?step=2      → the units of the picked category
  POST /consolidate-all-possible-values   → which `duration` values the picked units allow
  GET  /custom/region/countries           → allowed_regions map
  GET  /custom/pricing/rules?version=1.0  → pricing_rules / tax_profile multiselects
  GET  /guest/hotel-services?hotelId=     → packages only (add_ons); see chapter 5

ON SAVE
  GET  /get/file/url/local?step=1         → one per newly picked file
  POST <uploadUrl>                        → the file body; yields the attachment id
  POST /custom/services                   → the payload this chapter documents
```

| Call | Fires | Feeds |
|---|---|---|
| `GET /catalogs` | boot | root `catalogId` |
| `GET /crud/service/categories` | boot | root `categoryId`, `serviceType` |
| `GET /custom/services` | boot | `services_as_amenities` options |
| `GET /hms_config_keys_catalog` | modal open | every `config_key_id` + `config_key` + `is_input` |
| `GET /hmsconfig/possiblevalues/crud` | modal open | every id inside an `is_input: 0` `config_value` |
| `GET /config/constraints` | modal open | which numeric configs bound each other |
| `GET /crud/currencies` | modal open | `base_currency`, `servicePricing[].currencyId` |
| `GET /crud/pricing/rules` | modal open | `servicePricing[].pricingRuleId` |
| `GET /custom/service_location_facets` | modal open | the unit picker's building/floor/zone strips |
| `POST /custom/delivery/units?step=2` | category picked | `deliverUnitIds`, `serviceLocations`, capacity bound |
| `POST /consolidate-all-possible-values` | units picked | the `duration` option set |
| `GET /custom/region/countries` | `allowed_regions` opens | the `{regionId: [countryId]}` map |
| `GET /custom/pricing/rules?version=1.0` | multiselect mounts | `pricing_rules` / `tax_profile` id arrays |
| `GET /get/file/url/local?step=1` | save | `media`, `serviceAttachmentIds` |

---

## The supporting APIs

### `GET /catalogs` → `catalogId`

Rows carry `catalog_catalogKey` as a **JSON string** shaped `{ key, label: { en, ar } }`.
The panel parses it, dedupes by `key`, and keeps the numeric id from the first of
`catalog_id` / `catalog_catalogId` / `id`.

```json
{ "return": [
  { "catalog_id": 1, "catalog_catalogKey": "{\"key\":\"service\",\"label\":{\"en\":\"Service\",\"ar\":\"خدمة\"}}" },
  { "catalog_id": 2, "catalog_catalogKey": "{\"key\":\"package\",\"label\":{\"en\":\"Package\",\"ar\":\"باقة\"}}" }
] }
```

The payload's `catalogId` is the row whose parsed `key` equals the **singular kind** —
`"service"` for a service POST, `"package"` for a package POST. In the sample payloads
that is `catalogId: 1` for services and `catalogId: 2` for packages.

### `GET /crud/service/categories` → `categoryId`

```json
{ "return": [
  { "serviceCategories_categoryId": 490,
    "serviceCategories_slug": "stay",
    "serviceCategories_categoryName": "Stay",
    "serviceCategories_label": "{\"en\":\"Stay\",\"ar\":\"إقامة\"}",
    "serviceCategories_icon": "hotel",
    "serviceCategories_createdAt": "2026-04-11T09:00:00Z" }
] }
```

Two ids come out of one row and they are **not** interchangeable:

- `serviceCategories_slug` (`"stay"`, `"dining"`, `"transport"`…) is what the form
  stores and what the payload echoes as `serviceType`.
- `serviceCategories_categoryId` (numeric) is what the payload sends as `categoryId`,
  resolved from the slug at submit time (`resolveServiceCategoryId`).

The slug is also the axis every catalog row's `appliesTo` is expressed against, so it
decides **which config keys are even offered** for the service being authored.

### `GET /hms_config_keys_catalog` → which keys exist

The response is **bilingual**: `{ en: [...], ar: [...] }`, one row per config key per
language, paired by `hmsConfigKeys_id`. A flat array is accepted and mirrored into both
languages.

Fields the parser reads off a row:

| Column | Use |
|---|---|
| `hmsConfigKeys_id` | the payload's `config_key_id` |
| `hmsConfigKeys_configKey` | the payload's `config_key` |
| `hmsConfigKeys_configName` | field label (en/ar from their own rows) |
| `hmsConfigKeys_description` | helper text |
| `hmsConfigKeys_valueType` | **decides the wire shape and `is_input`** — see the encoding table |
| `hmsConfigKeys_targetTable` | `"services"` / `"packages"` / `"services,packages"`; anything else is dropped |
| `hmsConfigKeys_isMultiValue` | repeatable schema forms; array containers |
| `hmsConfigKeys_isRequired` | save gate |
| `hmsConfigKeys_hasConstraint` | pairs with `/config/constraints` |
| `hmsConfigKeys_groupOrder` | JSON string; its `group` may be a plain string or an `{en,ar}` bag |
| `hmsConfigKeys_possibleValues` | JSON id array, e.g. `"[1,2]"`; `"{}"` means none |
| `hmsConfigKeys_selectedValues` | pre-selected ids for `*_api_form` keys, `[{ en: "[1,2]", ar: "" }]` |

**`targetTable` is an allowlist, not an exclusion list.** Only `services` and `packages`
are authored here; a row targeting `tenants` (Hotel Settings) is dropped entirely and
reaches no tab, no tree and no payload.

**Keys the Studio never emits as configs** (`EXCLUDED_CONFIG_KEYS`) — they are handled
by hardcoded fields instead, so a seeded `hms_config` row for one of them will not
round-trip through the editor:

```
services_list, form_values, record_kind, service_type, category_tags,
display_name, short_description, long_description, deliver_unit
```

`form_values` is additionally blacklisted from the wire (`CONFIG_KEYS_BLACKLISTED_FROM_WIRE`),
mirroring the backend's own `CONFIG_BLACKLIST`.

### `GET /hmsconfig/possiblevalues/crud` → every `is_input: 0` id

This is the endpoint a seed script cannot skip. **Every bare number inside an
`is_input: 0` `config_value` is an `hmsConfigPossibleValues_id` from here** — `23852` for
`visibility`, `25568` for `duration_unit`, `28130` for
`additional_package_nights_price_discount_type`, and so on.

```json
{ "return": [
  { "hmsConfigPossibleValues_id": 23852,
    "hmsConfigPossibleValues_configId": 7295,
    "hmsConfigPossibleValues_configValueNum": 1,
    "hmsConfigPossibleValues_status": "active",
    "hmsConfigPossibleValues_configPossibleValue":
      "{\"slug\":\"public\",\"key\":\"public\",\"en\":\"Public\",\"ar\":\"عام\"}" }
] }
```

Parsing rules (`parsePossibleValueRow` / `optionsForConfig`):

- `configPossibleValue` is a **JSON string**. Its `slug ?? key ?? String(id)` becomes the
  option's `value`; `en ?? value` and `ar` become the label bag.
- Rows are matched by `hmsConfigPossibleValues_configId === hmsConfigKeys_id`.
- **Status filter is `!== 'inactive'`, not `=== 'active'`** — a `probation` value stays
  selectable so an existing record can still display and re-save it.
- Ordering is by `configValueNum` ascending. That order is the dropdown order, and for a
  single-select `dropdown` **the first option is preselected** — so `configValueNum`
  decides the default a seeded record will match.
- A row flagged `is_category: 1` is skipped for `keyword_chips` (legacy category rows).

Three other things ride on this endpoint:

- **Schema forms.** For a `*_form` key, the parser scans this endpoint's rows for the
  first one whose parsed value carries a `fields` array — that is the form's schema, not
  an option. So `cancellation_margin`'s `{"rules":[…],"name":{…}}` shape is defined by a
  possible-values row, per context.
- **`keyword_chips`.** Every row is one chip. `amenities_tags` rows carry
  `{ key, group: {en,ar,key}, label: {en,ar}, group_order, keyword_order }`; `keyword_tags`
  rows currently carry a bare `{ en, ar }` with **no key and no label bag** (and `ar: ""`
  on all rows today — the panel falls back to the English label).
- **A lenient JSON parser** is used, because these payloads legitimately contain regex
  sources (`\s`, `\d`) inside `form_inputs` patterns that strict `JSON.parse` rejects.

### `GET /config/constraints` → the numeric bounds

One row per constrained config. `configConstraint_constraints` is **polymorphic** — an
array, a single object, or null — and is normalised to an array, indexed by
`configConstraint_configKeyId`.

```json
{ "return": [
  { "configConstraint_configKeyId": 7364,
    "configConstraint_configKey": "max_adults",
    "configConstraint_hasConstraint": 1,
    "configConstraint_constraints": [
      { "constraint_operator": "<=",
        "constraint_reference": "service.basics.service_location.delivery_unit.capacity" },
      { "constraint_operator": ">=",
        "constraint_reference": { "key": "service.basics.service_location.delivery_unit.capacity",
                                  "op": "-",
                                  "ref": "service.availability.max_children" } }
    ] },
  { "configConstraint_configKeyId": 7373,
    "configConstraint_configKey": "max_guests_age",
    "configConstraint_hasConstraint": 1,
    "configConstraint_constraints": { "constraint_operator": ">=",
                                      "constraint_reference": "min_guests_age" } }
] }
```

A `constraint_reference` is either a **dotted path string** (a bare, dotless configKey
counts — `"min_guests_age"` resolves to that sibling) or a **`{ key, op, ref }` compound**.
Exactly one dotted path is registered as a special kind today:

```js
"service.basics.service_location.delivery_unit.capacity" → delivery_unit_capacity
```

Everything else resolves as a **peer field** — the last dotted segment is the sibling's
configKey. The operator is data: `<= < >= > = ==` are handled, anything unknown **fails
open**. Enforcement is **per field** — there is no summing across fields — and the
capacity bound is the **minimum non-zero capacity of the selected delivery units**.

A failed fetch yields `{}` and every field ends up with `constraints: []`, i.e. inert.

### `GET /crud/currencies` → `base_currency`

`base_currency` ships `currencies_api_dropdown`, so its options are these rows, not
possible-values. The row's `currencies_currencyName` is the English label; the numeric
`id` is what gets stored.

**It is written with `is_input: 1` and a bare id** — `"config_value": [4]` — because API
dropdowns count as raw input (`isInputValueType` returns 1 for `*_api_dropdown`). Do not
seed it as an `is_input: 0` reference: the reader resolves these ids against the
`currencies` table and returns them shaped like a unit (`key` / `en` / `ar` /
`currency_name` / `currency_symbol`).

### `GET /crud/pricing/rules` and `GET /custom/pricing/rules?version=1.0`

Two endpoints over the same table.

- `/crud/pricing/rules` (boot) feeds the per-row `pricing_rule` dropdown inside a
  `servicePricing` / `packagePricing` segment.
- `/custom/pricing/rules?version=1.0` feeds the `pricing_rules_api_form` and
  `tax_profile_api_form` multiselects, **and is also the write endpoint** for the inline
  create/edit dialog those widgets open.

Rows:

```json
{ "pricingRules_pricingRuleId": 10,
  "pricingRules_ruleName": { "en": "Ramadan", "ar": "رمضان" },
  "pricingRules_ruleType": "seasonal",
  "pricingRules_delta": "-",
  "pricingRules_value": 15.00,
  "pricingRules_type": "percentage",
  "pricingRules_condition": "{\"from\":\"2026-03-01\",\"to\":\"2026-03-30\",\"recurrence\":\"once\"}" }
```

:::warning The two multiselects split on `rule_type` **client-side**
Both hit the same URL and fetch **all** rows; the backend's `rule_type` query filters
were unreliable, so the widget scopes them:
`pricing_rules_api_form` **excludes** `rule_type === "tax"`, `tax_profile_api_form`
**includes only** it. A tax profile is persisted with `pricingRules_ruleType: "tax"` and
`pricingRules_delta: "+"` (both fields hidden in the dialog but still submitted), which
is what keeps it round-tripping under that filter. Seed tax rows with exactly those two
values or they will surface in the wrong picker.
:::

The inline dialog also refuses to save a rule whose `condition` date range **overlaps an
existing rule's** — a seeded set with overlapping windows is un-editable from the UI.

### `GET /custom/service_location_facets`

```json
{ "return": { "locations": [], "floors": [], "buildings": [], "zones": [] } }
```

Four flat arrays. They drive the unit picker's building / floor / zone strips only; none
of the four is written back by this endpoint. What *is* written back is derived from the
units and zones the admin ticks — see [Root-level fields the panel derives](#root-level-fields-the-panel-derives).

### `POST /custom/delivery/units?step=2`

Fired when a service category is chosen, and re-fired on every change of it.

```json
{ "filters": { "categoryId": [490], "current_status": ["available"] } }
```

(One variant of the picker sends `service_categoryId` instead of `categoryId`; both are
in use.) The response rows are enriched units:

```json
{ "return": [
  { "id": 4961,
    "identifier": { "en": "STAY-101" },
    "capacity": 2,
    "current_status": "available",
    "serviceLocation": { "locationId": 3071, "building": 12, "floor": 3, "zone": 3071 } }
] }
```

Three consequences for seeding:

1. **Only `current_status: "available"` units are offerable.** In edit mode the record's
   own already-reserved units are merged back in from the saved payload so they still
   render checked — but a fresh create can only pick available ones.
2. **`capacity` is the bound** behind every `delivery_unit_capacity` constraint. The
   picker also **locks the selection to one capacity class**: once a unit of capacity 2 is
   ticked, units of any other capacity are disabled. This is the client-side twin of the
   `DELIVERY_UNIT_CAPACITY_MISMATCH` error below — seed a service's units with a uniform
   `capacity` or the record cannot be edited without re-picking.
3. `serviceLocation.zone` is what becomes `serviceLocations[].location_id`; `id` is what
   becomes `deliverUnitIds[]`.

### `POST /consolidate-all-possible-values` — the `duration` gate

Body: `{ "delivery_units": [4961, 4962] }` — sorted, de-duplicated, numeric. No units
picked → **no call**. Debounced 300 ms.

Rows come back in the **same shape as the possible-values slice**, plus per-row verdicts:

```json
{ "return": [
  { "hmsConfigKeys_configKey": "duration",
    "hmsConfigPossibleValues_id": 28118,
    "hmsConfigPossibleValues_configPossibleValue": "{\"en\":\"30 minutes\",\"key\":\"30\"}",
    "hmsConfigPossibleValues_durationMinutes": 30,
    "hmsConfigPossibleValues_divisibilityChecked": true },
  { "hmsConfigKeys_configKey": "duration",
    "hmsConfigPossibleValues_id": 28119,
    "hmsConfigPossibleValues_durationMinutes": 60,
    "hmsConfigPossibleValues_divisibilityChecked": true,
    "hmsConfigPossibleValues_rejectionReason": "REMAINDER",
    "hmsConfigPossibleValues_offendingWindow":
      { "unit_id": 4961, "time_start": "09:00", "time_end": "10:30",
        "window_minutes": 90, "remainder": 30 } }
] }
```

- The rows **name their own config key**, so the mechanism is not `duration`-specific —
  a second governed key needs no client change. (`GOVERNED_CONFIG_KEYS = ["duration"]`
  exists only because the *error* path names no key.)
- A row with a `rejectionReason` is **kept and greyed**, not dropped.
- `divisibilityChecked: false` (or absent) means the rule could not run — non-clock
  duration unit, no anchored units, no published availability window. The list is then
  the plain category slice and is not presented as verified.
- **HTTP 400 with a message** = *nothing* fits. The dropdown is deliberately **emptied**
  rather than falling back to the catalog, and the server's own sentence is shown.
- An empty `[]` array is **never** "nothing is valid" — it means unconfigured or fenced
  out by tenancy, and the catalog options stand.

:::note This is where `duration` gets its two different wire shapes
`duration` ships as valueType **`dropdown_number`**: a dropdown when options exist,
a plain number input when they do not.

| Situation | `is_input` | `config_value` | Seen in |
|---|---|---|---|
| Options exist (catalog or consolidate) | `0` | `[28118]` — a possible-value id | Stay, Dining, Spa, Barber, Transport |
| No options at all | `1` | `[2]` — a raw number | Kids, Room Service, and packages |

Both are valid and both round-trip. A seeder must pick the branch that matches whether
that tenant/category actually has `duration` possible-values, or the editor will show a
number box holding a possible-value id.
:::

The same promotion applies to the flag: a `dropdown_number` promoted to a dropdown gets
`is_input` **recomputed** from the resulting type, so the flag and the type can never
disagree.

### `GET /custom/region/countries` — `allowed_regions`

```json
{ "return": {
  "regions": [ { "id": 1, "name": { "en": "Asia", "ar": "آسيا" } } ],
  "regionCountries": { "1": [ { "id": 10, "name": { "en": "Saudi Arabia" } } ] }
} }
```

The stored value is a map of **region id → array of country ids** —
`{ "1": [1,2,3], "2": [15,16] }` — array-wrapped as `config_value[0]`, `is_input: 1`
(valueType `region_countries_api_form`). An **empty map ships nothing at all**: the key is
omitted, which reads as "allow everywhere".

### Attachments — `GET /get/file/url/local?step=1`, then POST the body

Two steps, run once per newly picked file, immediately before the service POST:

```
GET  /get/file/url/local?step=1     → { uploadUrl, attachmentId }
POST <uploadUrl>   body = raw File  → 200; the id from step 1 is now valid
```

The second call posts the **raw bytes** with no Content-Type of its own and is not
encrypted (the URL is one-time-token secured). Reads serve through
`GET /upload/serve?attachmentId=<id>`.

An attachment already carrying a numeric id (an edit) is left alone. The **duplicate**
flow is the exception: every already-uploaded attachment is re-fetched from its serve URL
and re-uploaded so the copy owns fresh ids and never points at the source's media.

For seeding, this is the only way to obtain an id that `media` / `serviceAttachmentIds`
can legally reference.

---

## POST · Add

```
POST /api/custom/services
```

```json
{
  "actionPerformerURDD": 587,
  "tenant_id": 88,
  "categoryId": 3,

  "serviceName":             { "en": "Deep Tissue Massage", "ar": "تدليك الأنسجة العميقة" },
  "serviceCode":             { "en": "SVC-DT-60",           "ar": "SVC-DT-60" },
  "serviceSlug":             { "en": "deep-tissue-massage", "ar": "deep-tissue-massage" },
  "serviceNature":           "in-house",
  "serviceDescription":      { "en": "60 minute massage…",  "ar": "تدليك ٦٠ دقيقة…" },
  "serviceShortDescription": { "en": "60 min massage",      "ar": "تدليك ٦٠ دقيقة" },
  "serviceCommonAttributes": { "en": "tags: relax",         "ar": "وسوم: استرخاء" },

  "serviceImageUrl": "[]",
  "serviceAttachmentIds": [101, 102, 103],

  "serviceLocations": [ { "location_id": 8 }, { "location_id": 12 } ],

  "deliverUnitIds": [12, 13],

  "servicePricing": [
    {
      "price": 250.00,
      "currencyId": 1,
      "delta": "+",
      "value": 0,
      "type": "flat",
      "validFrom": "2026-06-01T00:00:00Z",
      "validTo":   "2026-12-31T23:59:59Z",
      "minQuantity": 1,
      "maxQuantity": 10,
      "customerSegment": "regular",
      "region": ["SA"],
      "dayOfWeek": "mon,tue,wed",
      "conditions": { "min_age": 18 }
    }
  ],

  "configs": [
    { "config_key_id": 67,  "config_key": "base_price",    "operator": "=", "is_input": 1, "config_value": [{ "en": "250", "ar": "٢٥٠" }] },
    { "config_key_id": 85,  "config_key": "extension_unit", "is_input": 0,  "config_value": [3273] },
    { "config_key_id": 119, "config_key": "base_currency", "is_input": 1,   "config_value": [1] },
    { "config_key_id": 111, "config_key": "form_inputs",   "is_input": 0,   "config_value": [ { "name": "full_name", "type": "text", "required": true } ] }
  ],

  "serviceStatus": "active"
}
```

**Success — 200**

```json
{
  "success": true,
  "data": { "insertId": 70, "service_id": 70 },
  "meta": { "message": "Service created.", "status": 200, "priority": 1 }
}
```

:::note Add is atomic — a failed create leaves no orphan
The `services` row commits first, then **every** side-effect (translations, attachments,
`service_locations` anchors and delivery-unit repoints, pricing, configs) runs inside **one
transaction on a single held connection**. If any step throws, all side-effects roll back **and**
the just-created `services` row is compensating-deleted. You never get a half-built service.
:::

### Field notes that matter

**`serviceSlug` is overridden on Add.** The slug is taken from the **`service_categories` row named
by `categoryId`**, not from what you send — send it anyway for older clients, but expect the
category's slug back. This applies to `POST` only; on `PUT` the slug you send is kept. If
`categoryId` is missing or its category has no slug, your value survives as a fallback.

**`deliverUnitIds` is the full desired set**, not a delta. `[]` clears every assignment; omitting
the key leaves assignments untouched. It is **not** a config — assignment is anchor-driven, and no
`hms_config` row is written for it. On Update the set is diffed against the units currently
anchored to the service: still-desired units are assigned, dropped ones unassigned.
`current_status` on the units is never touched.

**`configs` are typed by `is_input`.** `is_input: 1` means a value the manager typed, stored
per-language; `is_input: 0` means a reference to an option id or a structured JSON blob. Send
`config_value` as an array either way — see [How config values are stored](#how-config-values-are-stored)
for the storage side and [Encoding a config value](#encoding-a-config-value--the-parsers-rules)
for the exact shape the admin panel produces per `valueType`.

**`serviceLocations` is a full replace** of the *offered* locations. It deliberately **excludes
delivery-unit anchors**, so editing a service can never deactivate the anchor row a unit points at.

**`serviceAttachmentIds`** are ids from the attachment upload flow, linked into
`dynamic_attachments`. On read they come back as ready-to-render served URLs. Prefer sending images
through the `media` config instead — see [Media](#media--two-stores-kept-in-sync).

**`actionPerformerURDD`** is the acting user's `user_role_designation_department_id`. It is
required on every write, and the backend also uses it as the default `created_by` for any
`configs[]` entry that does not carry one — which is exactly what the panel relies on
(it stamps `created_by` on every entry from the same value).

### Errors

| Status | `scc` | `error.details` | Cause |
|---|---|---|---|
| 400 | `E10` | `Service Name is required` | missing required field |
| **400** | `E10` | `DELIVERY_UNIT_CAPACITY_MISMATCH` | the units in `deliverUnitIds` do not all share one `capacity` |
| 403 | `E41` | `You do not have permission to access this resource.` | actor lacks `add_services` |
| 403 | `E31` | `Record belongs to another tenant` | a referenced location/unit is not this tenant's |

```json
{
  "success": false,
  "data": null,
  "meta": {
    "message": "The selected units do not have the same capacity.",
    "status": 400,
    "detail": "DELIVERY_UNIT_CAPACITY_MISMATCH: units 12 (capacity 2), 13 (capacity 4)",
    "priority": 2,
    "source": "Pre-Process",
    "scc": "E10"
  },
  "error": {
    "message": "DELIVERY_UNIT_CAPACITY_MISMATCH: units 12 (capacity 2), 13 (capacity 4)",
    "detail": "The selected units do not have the same capacity.",
    "code": "E10",
    "source": "Pre-Process"
  }
}
```

:::warning Capacity must be uniform across a service's units
A service advertises **one** occupancy bound, so a mix of capacities would make `max_adults` /
`max_children` ambiguous. The check runs before any write — nothing is persisted on failure. Zero
or one unit is always allowed; a `NULL` capacity mixed with a numeric one also counts as a
mismatch. It runs on **both** Add and Update.
:::

:::note Duration tiling is validated upstream, not here
The chosen `duration` must divide **every** availability window of **every** assigned unit with
remainder 0 — a unit open 09:00–10:30 can take 30- or 90-minute slots, but a 60-minute slot strands
30 minutes. That rule lives in `Consolidate_all_possible_values`, which the frontend calls **as
units are picked**, before the service exists, and which only ever offers durations that already
tile. By the time a write arrives here the duration came from that filtered list. It is
deliberately not re-checked on write: doing so could archive a service over availability drift the
writer never touched.

**A seed script bypasses that gate.** Seeding a `duration` that does not tile the seeded
units' windows produces a service that is valid in the database and *un-editable* in the
admin panel: the dropdown greys the held value and refuses to save until it is re-picked.
Seed the pair together, or seed `duration` from a real consolidate response.
:::

---

## Encoding a config value — the parser's rules

Everything above produces a form tree; this is how one field of it becomes one entry of
`configs[]`. Reproduce this table and a seeded row is byte-identical to an admin POST.

Each entry is emitted as:

```jsonc
{ "config_key_id": <hmsConfigKeys_id>,
  "config_key":    "<hmsConfigKeys_configKey>",
  "operator":      "=",
  "config_value":  <see table>,
  "is_input":      <see below>,
  "created_by":    <actionPerformerURDD> }
```

### `is_input` is derived, never authored

```
is_input = 0  for: dropdown, dropdown_multiselect, multi_checkbox, keyword_chips,
                   attachment, form, segments, cron_job_form, readonly_mirror,
                   service_unit_dropdown, service_location_row, multi_chips, *_label
is_input = 1  for: everything else — text, text_area, number, decimal, datetime,
                   *_api_dropdown, *_api_form, *_form (schema forms)

then three overrides:
  checkbox        → 1   (forced at build time, so 0/1 is not looked up against
                         possible_values rows that were never seeded for it)
  media           → 1   (an `attachment` valueType, but the backend wants its ids
                         as a raw input value)
  blackout_dates  → 1   (a `cron_job_form`, but the whole config ships as input)
```

### The wire shape, per `valueType`

| valueType / key | `config_value` | `is_input` | Live example |
|---|---|---|---|
| `text`, `text_area` (bilingual) | `[{ en, ar }]` | 1 | `terms_and_conditions` |
| `number` | `[<int>]` — `parseInt`, cleared → omitted | 1 | `advance_booking_max_days: [30]` |
| `decimal`, plain scalar | `[<value>]` | 1 | `base_price: [100]` |
| `datetime` | `["YYYY-MM-DD HH:MM:SS"]` | 1 | `publish_start_datetime` |
| `checkbox` | `[{ en: "1", ar: "1" }]` — **both sides**, `"0"` when off | 1 | `is_featured`, `is_consumable` |
| `dropdown` | `[<possibleValueId>]` | 0 | `visibility: [23852]` |
| `dropdown_number` **with** options | `[<possibleValueId>]` | 0 | `duration: [28118]` |
| `dropdown_number` **without** options | `[<number>]` | 1 | `duration: [2]` |
| `dropdown_multiselect`, `multi_checkbox` | `[id, id, …]` — flat | 0 | — |
| `keyword_chips` | `[id, id, …]` — flat chip PV ids | 0 | `amenities_tags: [22223, 22224]` |
| `attachment` | `[id, id, …]` — flat attachment ids | 0 (1 for `media`) | `media: [1473]` |
| `*_api_dropdown` (single) | `[<row id>]` | 1 | `base_currency: [4]` |
| `services_api_dropdown` (multi) | `[serviceId, …]` — flat | 1 | `services_as_amenities: [485]` |
| `pricing_rules_api_form`, `tax_profile_api_form` | `[ruleId, …]` — flat | 1 | — |
| `region_countries_api_form` | `[{ "<regionId>": [countryId, …] }]` | 1 | `allowed_regions` |
| `*_form` (schema, single) | **a bare JSON string** — `JSON.stringify(obj)` | 1 | `cancellation_margin`, `schedule_identifier`, `gender_restricted_windows` |
| `*_form` (schema, `is_multi_value: 1`) | **array of plain objects**, one per entry | 1 | `pickup_dropoff_locations`, `add_ons` |
| `physical_dimension` | **a plain object** `{length,width,height}` — not array-wrapped | 1 | `physical_dimension` |
| `form` | array of sub-field definitions | 0 | `form_inputs` |
| `segments`, `cron_job_form` | `[{ subKey: value }, …]` — flat rows | 0 (1 for `blackout_dates`) | `blackout_dates` |
| `service_nature` | `["in-house"]` / `["outsource"]` | 1 | mapped from `internal`/`external` |

Three shapes in that table are **not** array-wrapped and are easy to get wrong when
seeding, because they break the "always an array" intuition:

```jsonc
"config_value": "{\"name\":{\"en\":\"abc\",\"ar\":\"abc\"},\"rules\":[{\"hours_before\":111,\"charge_pct\":11}]}"
"config_value": { "length": 4, "width": 4, "height": 4 }
"config_value": [ { "location_name": { "en": "Kababjees", "ar": "Kababjees" }, "order": 1 } ]
```

### Rules that apply on top of the shape

**Datetime normalisation.** `"2026-09-02T13:12"` → `"2026-09-02 13:12:00"`. A value already
in the second form passes through untouched.

**Bilingual completion.** If only one side of an `{en, ar}` bag is filled at submit time
(the Arabic auto-translate lost the race), the filled side is **mirrored into the empty
one** — the wire never carries a half-empty bag. A both-empty bag stays cleared.

**Complex configs never carry a `null` leaf.** The DB's JSON validation rejects it, so
every complex encoder runs `nullLeavesToEmptyString`: `null`/`undefined` leaves become
`""` while `false`, `0`, empty arrays and nested structure are preserved. Applies to
`physical_dimension`, `blackout_dates`, every schema `*_form`, generic `form`, and
config-tab `segments`.

**Empty configs are omitted, not nulled.** An absent key means "not set". A wrapped value
counts as empty — and is dropped from `configs[]` — when it is `null`, an `[]` for a
form-like type, or a single empty slot (`[null]`, `[{}]`, `[{en:"",ar:""}]`). Checkboxes
(`[{en:"0",…}]`) and zeroes (`[0]`) are **not** empty.

**Repeatable schema forms write their own order.** The `order` / `sort_order` / `sequence`
/ `position` sub-field is never edited by hand: the list position `1..n` is written on
submit and the load sorts by it. That is why the `pickup_dropoff_locations` sample carries
`"order": 1` nobody typed.

**Schema leaves are validated before they can reach the wire.** `required`, `pattern`
(machine text and `alpha-numeric` only) and numeric `min`/`max` are enforced per leaf, and
the editor will not commit an entry that fails — so a seeded value outside those bounds is
one the admin cannot re-save without fixing.

**Machine text stores a plain string, not a bag.** A schema `text` sub-field that ships a
`pattern` (e.g. `location_latitude`) renders as one LTR input and stores `"24.7136"`. A
`text` without a pattern (e.g. `location_name`) stays bilingual `{en, ar}`.

---

## How config values are stored

Worth understanding before you send `configs`, because the write shape and the storage shape differ.

**One entity per row, stored bare.** A multi-value config is exploded so each selected or entered
entity becomes its **own** `hms_config` row holding a **bare** id or a **bare** JSON object — never
an array-wrapped `[…]` cell. On read, the rows for a `(record, config_key)` pair are re-aggregated
back into the array you sent, so a save → load → save cycle round-trips unchanged.

| Case | Stored as |
|---|---|
| `config_key` is `form_inputs` | The raw JSON field-definition doc — the one exception that stays a **single** row, never exploded. |
| `is_input: 0` (reference) | One bare row per element: an id as a bare scalar, a structured value (`allowed_regions`, `blackout_dates`) as a bare JSON object. An empty selection writes **no row at all** — it clear-retires; no `NULL`, no `'[]'`. |
| `is_input: 1` (multilingual) | One row: `en` on the row, `ar` mirrored into `translated_entries`. A multi-value entered array (`media`, `*_api_form`, `keyword_chips`) explodes to one bare row per element, each with its own `ar`. |
| `is_input: 1` (scalar) | The one-element wrapper collapses to a bare scalar — `[7]` is stored as `"7"`. |

`base_currency` is a special case: its ids resolve against the `currencies` table, and it comes back
shaped like a unit so the frontend can render `key` / `en` / `ar` / `currency_name` /
`currency_symbol` directly.

`form_values` is server-side only and is never returned to the frontend.

:::info A value in `probation` still resolves
When a possible value is retired while a booked service still references it, it is parked in
`probation` rather than deleted. Selected-value reads filter `status != 'inactive'` — **not**
`= 'active'` — so the service's current selection keeps rendering; only a finalized `inactive` value
drops out. The View catalog goes further and **offers** probation values as options too, so an
admin editing the service still sees the winding-down value in the dropdown. Booking-time reads stay
clean: the stored option map remains active-only.
:::

---

## Root-level fields the panel derives

Four root keys in a real payload have **no form field behind them**. A seeder that fills
them by hand has to reproduce the derivation, because the reader and the editor both
assume it.

### `serviceLocations` + `deliverUnitIds` come from ONE picker

The unit picker holds `{ buildings, floors, zones, units }`. On submit it splits into two
independent root inputs, because zones and units play different roles in
`service_locations` — an offered-zone link versus a unit's anchor row:

```js
serviceLocations = value.zones.map(id => ({ location_id: Number(id) }))   // full replace; [] clears
deliverUnitIds   = value.units.map(Number)                               // full replace; [] clears
```

Both are **always emitted** when the picker resolved a value, including `[]` — omitting
them was the bug that made "clear all locations" a silent no-op. For a category that
hides the picker entirely (transport), both keys are **absent**, which means "leave units
untouched".

`deliverUnitIds` **replaces** the retired `deliver_unit` config. That config key is on the
exclusion list and is explicitly filtered out of `configs[]` before the wire; the backend
tolerates it only as a legacy fallback. **Do not seed a `deliver_unit` hms_config row.**

### `publishStartDateTime` / `publishEndDateTime` are sent twice

`publish_start_datetime` and `publish_end_datetime` live in the catalog config tabs, so
they are serialised into `configs[]` like any other datetime — **and** copied to the root
as camelCase `publishStartDateTime` / `publishEndDateTime`, normalised the same way. The
backend reads the root copy. Seed both or the publish window may read as unset.

### `categoryId` is resolved from the slug

`serviceType` carries the slug (`"stay"`); `categoryId` is the numeric id looked up from
the `/crud/service/categories` row with that slug. Both ride on the payload — the backend
ignores the extra root `serviceType`, but the panel's own lookup needs it, and the read
path prefills the type dropdown from it.

### Config keys that are lifted out of `configs[]`

`service_pricing` and `deliver_unit` are **filtered out** of the configs array on services
(`package_pricing` and `package_composition` on packages) because they are emitted as root
arrays instead. Tracking them as configs would queue them for deletion on every save.

---

## Price calculation

### `base_price` and `base_currency` are the source; the pricing rows mirror them

For a **service**, `base_price` is a plain user value: whatever the admin types is the
value. There is no cap, no derivation, and **no tax** — tax computation was removed
entirely, and a catalog-shipped `tax_profile` picker renders but does not affect
`base_price`. The backend stores and returns the number verbatim.

Each `servicePricing[]` row's `price` is **not** independently authored. It is a
`readonly_mirror` of `base_price`, and `currencyId` is a mirror of `base_currency`:

```
servicePricing[i].price      ← base_price       (every row, on every save)
servicePricing[i].currencyId ← base_currency    (every row, on every save)
```

That is why every sample payload in this chapter shows `price` equal to the `base_price`
config and `currencyId` equal to `base_currency` — Dining is `120`/`4` in both places,
Spa is `70`/`4`, Stay/Kids/Barber/Room-service/Transport are `100`/`4`. **A seeded row
whose `price` disagrees with its `base_price` config will be silently rewritten to the
config's value the first time an admin saves the service.**

At least one pricing row is required (`servicePricing` is a required field, and `price`
is required within it).

### What a pricing row means

Projected from the segment through `PACKAGE_PRICING_SEGMENT_KEY_MAP` (services reuse the
same map, plus `servicePricingId`):

| Sub-field | Wire key | Meaning |
|---|---|---|
| `price` | `price` | the list price this row applies to — mirror of `base_price` |
| `currency` | `currencyId` | mirror of `base_currency` |
| `delta` | `delta` | `"+"` (surcharge) or `"-"` (discount) |
| `value` | `value` | the magnitude of that delta; `null` on a plain list-price row |
| `type` | `type` | `"flat"` or `"percentage"` — how `value` is applied |
| `valid_from` / `valid_to` | `validFrom` / `validTo` | the window; `null` = always |
| `min_quantity` / `max_quantity` | `minQuantity` / `maxQuantity` | quantity band |
| `customer_segment` | `customerSegment` | e.g. `regular` |
| `region` | `region` | the `{regionId: [countryId]}` map, passed through |
| `days_of_week` | `dayOfWeek` | e.g. `"Sunday"` |
| `recurrence` | `recurrence` | plain enum column — `once`, `every-day`, `every-week`, `every-month`, `every-year` |
| `pricing_rule` | `pricingRuleId` | a `/crud/pricing/rules` id |

**The reader applies the delta; the row stores the undiscounted price.** The Dining sample
is the canonical two-row shape: a plain list row (`delta:"+"`, `value:null`) plus a dated
discount row (`delta:"-"`, `value:"40"`, `type:"flat"`, one-day window). Both carry
`price: "120"` — `120 − 40 = 80` is computed at read time, never stored.

Row-level nulls are real SQL nulls (these persist as relational columns), **not** empty
strings — the one exception is the `conditions` JSON blob, which keeps the empty-string
treatment because a null leaf inside it fails the DB's validation.

### Booking-time totals are computed elsewhere

`servicePricing` is the catalog price. What a guest is actually charged is computed by
`backend/Src/HelperFunctions/Guest/v2/catalogPricing.js` → `computeBookingPricing`, which
is the single source of truth for booking totals. For a Stay service it reads the
`duration` config and charges:

```
duration set    → ceil(nights / duration) × roomCount  blocks at basePrice
duration unset  → nights × roomCount                   at basePrice   (legacy per-night)
```

Package totals — including the extra-nights discount — are in
[chapter 5](./05-packages.md#extra-nights--the-three-configs-and-the-math-behind-them).

---

## Constraints a seeded row must satisfy

None of these are enforced by the write endpoint. All of them are enforced by the admin
panel, which means a row that breaks one is *stored but not editable*.

| Rule | Source | Symptom if violated |
|---|---|---|
| all `deliverUnitIds` share one `capacity` | write endpoint **and** picker | 400 on write; picker disables the odd units |
| `max_adults` ≤ min unit capacity | `/config/constraints` | Save disabled, field flagged out of range |
| `max_adults` ≥ capacity − `max_children` | `/config/constraints` (compound) | as above |
| `max_guests_age` ≥ `min_guests_age` | `/config/constraints` (peer) | as above |
| `min_persons_per_booking` ≤ `max_persons_per_booking` | numeric peer-range link | input bounded, Save blocked |
| `duration` tiles every unit availability window | `/consolidate-all-possible-values` | value greys out; must be re-picked before save |
| `duration`'s `is_input` matches whether options exist | `dropdown_number` resolution | a PV id rendered inside a number box |
| a service is not its own `services_as_amenities` entry | widget filter | the id is pruned from value and display |
| every `services_as_amenities` target has `is_amenity = 1` | widget filter | the id is pruned on load |
| pricing rule windows do not overlap | inline dialog | rules cannot be edited from the UI |
| `serviceStatus` reachable — see below | status guard | — |

`services_as_amenities` is the one place a stale id is **pruned** rather than kept; the
package `add_ons` service id is deliberately kept (dropping it would silently delete a
pricing rule nobody touched).

---

## `pickup_dropoff_locations` — the hotel's own stop is server-owned

A transport service's stops serve **both directions**: any location can be a pickup point or a
drop-off point. The old `pickup_locations` / `dropoff_locations` pair was merged into one key,
**`pickup_dropoff_locations`**, and `dropoff_locations` is retired — its stored values were moved
onto the merged key first, so the list is the union of both.

The hotel's own address is always one of those stops, and it is **not the admin's to type or
maintain**. This CRUD owns it:

| | |
|---|---|
| **Write** (Add + Update) | Whenever the payload carries this key, the tenant's own address is appended as one more entry, flagged `is_default: 1` and carrying **no `order`** — it is not part of the admin's ordering. |
| **Read** (View + List) | That entry is stripped back out, so the admin form shows only the rows the admin owns and a save → load → save cycle round-trips unchanged. |

The entry is shaped exactly like an admin-entered one, so no downstream reader needs a special case:

```json
{
  "is_default": 1,
  "location_name": { "en": "Le Meridien Makkah", "ar": "فندق مريديان مكة" },
  "location_latitude": "21.42025",
  "location_longitude": "39.82918"
}
```

`location_name` is bilingual because the key is `is_input: 1`; the Arabic side comes from the
tenant's translation mirror and falls back to the English name.

:::danger Do not send the hotel entry yourself
An `is_default` entry echoed back from a previous read is **dropped** before a fresh one is
appended — so echoing it is harmless, but sending your own is pointless. Two layers guarantee
exactly one active hotel row: the payload guard, and a database reconcile that runs after **every**
config write on both Add and Update. If more than one active hotel row exists, all but the **oldest**
are retired.

The oldest is kept deliberately: the guest dropdown's option `value` **is** the `hms_config.id`, and
bookings store it — so retiring the newest duplicates leaves every existing booking's reference
intact. Duplicates are retired (`status = 'inactive'`), never deleted.
:::

On the guest side the default is offered like any other option — it is usually the most common stop
— still flagged `is_default: 1` so a client can badge or preselect it. Both `guest_pickup_location`
and `guest_dropoff_location` draw from this one list.

**Client shape.** The admin-authored entries are a repeatable schema form (`location_form`,
`is_multi_value: 1`), so the config value is an **array of plain objects** written under
`is_input: 1`, and the backend explodes it to one row per entry. `order` is written from
the list position, never typed. A schema carrying a latitude/longitude pair gets a Google
map picker automatically — detection is by key suffix (`…lat`/`…latitude`,
`…lng`/`…lon`/`…longitude`), never by config name.

---

## Media — two stores kept in sync

A service's images live in two places, and writes keep them aligned:

1. **`hms_config` under `config_key: "media"`** — the newer contract. Send the attachment ids as a
   normal multi-value config. This is what guest-side reads consume.
2. **`dynamic_attachments`** — the generic attachment join that View and List hydrate from.

On both Add and Update, the ids in the `media` config are mirrored into `dynamic_attachments`:

- **`media` present** → authoritative **full replace**. An **empty** `media` set clears the links.
- **`media` absent** → links untouched, so a partial edit is safe.

The legacy top-level `serviceAttachmentIds` array still works for older callers, but the media-config
mirror runs **after** it and wins.

:::warning Pick one — do not send images in both places
Sending the same images via `serviceAttachmentIds` **and** the `media` config double-writes the
`media` `hms_config` rows. Prefer the `media` config.
:::

The admin panel sends `media` as a **flat id array under `is_input: 1`**
(`"config_value": [1473]`) — the one `attachment`-typed key with that override. Ids come
from the two-step upload flow above; nothing else produces a valid one.

---

## Pricing ownership — this endpoint owns only unscoped rows

Every pricing query here is scoped to rows with **no package**. A pricing row for a service that
*does* carry a package reference is a **package-scoped add-on price** — what that service costs when
attached to that one package — and it is written and owned by
[Packages](./05-packages.md#add_ons--add-on-services-priced-inside-the-package). This endpoint
neither shows it nor touches it.

| Where | Why the scope matters |
|---|---|
| **Read** (View / List) | Package add-on prices must not appear in `servicePricing[]`, and `servicePrice` must not be derived from one — a discounted in-package price would masquerade as the list price. |
| **Update diff** | **Load-bearing.** The diff drives *"in the DB but not in the payload → retire"*. Package add-on prices are never in a service payload, so without the scope **every service Update would retire all of them.** |
| **Targeted writes** | A payload that sends a package-scoped `pricingId`, by mistake or otherwise, cannot mutate or retire a price this endpoint does not own. |

---

## GET · View

```
GET /api/custom/services?id=70&language_code=en
```

Returns the service with everything hydrated — `deliverUnits` as enriched objects (derived from the
anchors, the single source of truth), media as served URLs, `configs` as applied values, plus
`hms_config_keys_catalog`: the full catalog of keys and their currently-valid options, which is what
lets an editor screen render without a second round trip.

```json
{
  "success": true,
  "data": {
    "id": 70,
    "serviceId": 70,
    "categoryId": 3,
    "serviceName": { "en": "Deep Tissue Massage", "ar": "تدليك الأنسجة العميقة" },
    "serviceNature": "in-house",
    "serviceStatus": "active",
    "servicePrice": "250.0000",
    "serviceCurrency": "SAR",
    "media": [
      { "attachment_id": 101, "attachment_link": "/api/upload/serve?encryptedRequest=U2FsdGVkX1..." }
    ],
    "deliverUnits": [
      { "unitId": 12, "identifier": { "en": "SPA-1" }, "capacity": 2, "serviceLocation": { "locationId": 41 } }
    ],
    "serviceLocations": [ { "service_location_id": 14, "location_id": 8, "label": "East Wing" } ],
    "servicePricing": [ { "pricing_id": 31, "price": "250.0000", "currency_id": 1, "type": "flat" } ],
    "configs": [ { "config_key": "base_price", "is_input": 1, "config_value": [{ "en": "250", "ar": "٢٥٠" }] } ],
    "hms_config_keys_catalog": { "en": [], "ar": [] }
  },
  "meta": { "message": "Service fetched.", "status": 200, "priority": 0 }
}
```

`servicePrice` is the first active unscoped pricing row — `null` if the service has none.

**How the panel reads it back.** `deliverUnits` (full objects) is re-collapsed into the
picker's `{ buildings, floors, zones, units }`; `media` is resolved by attachment id back
into the `media` config field; every `configs[]` entry is unwrapped by the **inverse** of
the encoding table (`unwrapConfigValueForField`), which is why a shape not in that table
silently loads as empty. A saved value whose possible-value row has since gone `inactive`
disappears from the form on load — the read filter is `!= 'inactive'`, so `probation`
survives but `inactive` does not.

## GET · List

```
GET /api/custom/services?page_no=1&page_size=10
GET /api/custom/services?page_no=1&page_size=10&filter_columns_and=services_serviceNature&filter_values_and=in-house
```

Same row shape as View **except `hms_config_keys_catalog` is omitted** — per-row it is far too
expensive for a list. Each row carries `table_count`, the unpaginated total.

:::warning Filter keys must use the mapped prefix
Filter columns go through the object's `colMapper`: `services_serviceNature`, `services_status`,
`services_tenantId` and so on. An unmapped key passes through raw and produces
`ER_BAD_FIELD_ERROR`.
:::

---

## PUT · Update

```
PUT /api/custom/services?id=70
```

Mostly mirrors Add, but the collection fields change shape.

:::danger `configs` MUST be a diff object on Update
Add takes a **flat array**. Update expects `{ added, updated, deleted }`:

```json
{
  "configs": {
    "added":   [ { "config_key_id": 85, "config_key": "extension_unit", "is_input": 0, "config_value": [3273] } ],
    "updated": [ { "config_key_id": 67, "config_key": "base_price", "is_input": 1, "config_value": [{ "en": "270", "ar": "٢٧٠" }] } ],
    "deleted": [ 412, 413 ]
  }
}
```

`deleted` takes `hms_config.id` values. **Sending a flat array on Update is silently a no-op** — a
guard skips anything that is not a non-array object. Nothing errors; your config edit simply does
not happen.
:::

### How the panel computes that diff

`categorizeConfigs(currentConfigs, originalByKeyId, hmsConfigIdByKeyId, formMeta)`:

- keyed by **`config_key_id`**, not by `hms_config.id`;
- present in both and **value changed** → `updated`; unchanged → **emitted nowhere**
  (idempotent re-saves write nothing);
- present only in current → `added`;
- present only in original → `deleted`, carrying the **`hms_config.id`** from
  `hmsConfigIdByKeyId` (which is why the read must return it);
- `package_pricing` / `package_composition` / `service_pricing` / `deliver_unit` are
  excluded from the original index entirely — they are root arrays, and indexing them
  would queue a spurious delete on every save.

**A cleared config is `updated` with an empty value, not `deleted`** — as long as the key
is still in the form. The empty value branches on `is_input`, per the backend's JSON
contract:

| `is_input` | Cleared value | Why |
|---|---|---|
| `0` | `[]` | read via `JSON.parse`; `null` would crash |
| `1` | `null` | read bare; `[]` would store the literal `"[]"` |

A config that is no longer in the form at all falls through to `deleted`. A config that
was **never set** is skipped entirely.

**Row-per-entry configs need canonicalisation before comparison.** `blackout_dates` and
every repeatable schema form (`pickup_dropoff_locations`, `add_ons`) are sent as an array
of plain objects but come **back** one row per entry, wrapped as
`[{ en: "<JSON row>", ar: "" }, …]`. A naive `JSON.stringify` comparison can never see
those as equal, so they would land in `updated` on every save and rewrite rows nobody
touched. `canonicalizeWrappedRows` unwraps, normalises `""`/`null`/`undefined` to one
value and sorts keys on both sides first.

**`servicePricing` is an id-aware diff.** Send the complete desired state as a flat array: a row
**with** `pricingId` is updated, a row **without** one is inserted, and anything active in the
database that is *not* in the list is retired.

```json
{
  "servicePricing": [
    { "pricingId": 31, "price": 270.00 },
    {                  "price": 320.00 }
  ]
}
```

The `{ added, updated, deleted }` shape is also still accepted here.

**`serviceAttachmentIds` and `serviceLocations` are full replacements.** **`deliverUnitIds` is
diffed** against the currently-anchored units, as described under Add.

Side-effects run in this order: the `services` row, translations, attachments (legacy array sweep,
then the `media` mirror), offered locations, pricing, configs, then delivery-unit assignment.

---

## Status transitions and Delete

A service carries **both** its publishing state and its delete lifecycle in one `status` enum:
`active`, `inactive`, `archived`, `scheduled`, `draft`, `probation`.

:::info The guard never blocks — it reroutes
Every Update that moves a service **off `active`** is gated on one question: does it have an active
booking?

- **Booked** → the request succeeds, but the status is rewritten to **`probation`**. A daily
  finalizer cron flips it to `archived` once the booking clears.
- **Not booked** → the status you asked for is applied **verbatim**.

Either way, **all other edited fields save normally** — no frontend change is needed. The response
carries `deferred`, `status_set` and `dependents`.

Transitions that do not start from `active` (`archived → inactive`, `draft → scheduled`) and any
change **to** `active` pass straight through. To reactivate a parked service, send
`serviceStatus: "archived"` and then `"active"`.
:::

The admin panel's Restore is exactly that: a **full-row republish**, not a status-only
verb — it re-sends the whole record with the new status. There is no PATCH-status
endpoint to seed against.

### DELETE

```
DELETE /api/custom/services?id=70
```

```json
{
  "success": true,
  "resource": "service",
  "id": 70,
  "status_set": "archived",
  "deferred": false,
  "dependents": [],
  "message": "Service archived."
}
```

With active bookings it parks instead:

```json
{
  "success": true,
  "resource": "service",
  "id": 70,
  "status_set": "probation",
  "deferred": true,
  "dependents": [ { "check": "active_bookings", "count": 2, "sample_ids": [9001, 9002] } ],
  "message": "Service moved to probation — 2 active bookings still reference it."
}
```

Side tables — translations, attachments, locations, pricing, configs — are **deliberately left
attached** to the parked row, so reactivating is trivial. The finalizer cron cascades them only
once the row is actually finalized.

:::note Delete twice to remove it completely
`archived` keeps a retired service **visible** to admins, because List and View filter on
`status != 'inactive'`. A second `DELETE` on an already-archived service finalizes it the rest of
the way to `inactive`, at which point it drops out of both.

So the full path is: `active` → *DELETE* → `archived` → *DELETE again* → `inactive`.
:::

:::warning Terminal removal unassigns the delivery units
When a service reaches a terminal state immediately — DELETE with no bookings, or an Update
straight to `inactive` / `archived` — its delivery units are unassigned: the anchor rows stay
**active** (so the units keep their location) but no longer reference the service. A later
reactivation therefore starts with **no assigned units**; re-send `deliverUnitIds`.

A mere unpublish (`draft` / `scheduled`) does **not** unassign, and a transition into `probation`
defers the unassign to the finalizer cron.
:::

---

## Seeding recipe

The order matters — each step consumes ids the previous one produced.

1. **Resolve `catalogId`** from `/catalogs` where the parsed `catalog_catalogKey.key` is
   `"service"`.
2. **Resolve `categoryId` and the slug** from `/crud/service/categories` for the category
   being seeded. The slug is `serviceType`.
3. **Load the config catalog** `/hms_config_keys_catalog` and keep, for this category, the
   rows whose `targetTable` includes `services` and whose `appliesTo` admits the slug.
   That set is exactly the keys the seeded service may carry — no more, no fewer.
   Index `configKey → { config_key_id, valueType, isMultiValue }`.
4. **Load `/hmsconfig/possiblevalues/crud`** and index by `configId`, dropping `inactive`
   rows and sorting by `configValueNum`. Every `is_input: 0` value must be an id from this
   index, under the matching `configId`.
5. **Upload media** (two-step) and keep the ids.
6. **Pick delivery units** from `POST /custom/delivery/units?step=2` with
   `current_status: ["available"]`. They must share one `capacity`. Their `id`s are
   `deliverUnitIds`; their `serviceLocation.zone`s are `serviceLocations[].location_id`.
7. **Resolve `duration`** from `POST /consolidate-all-possible-values` with those unit
   ids. Use a row with **no** `rejectionReason`. If the response is empty or the key has
   no options, `duration` is `is_input: 1` with a raw number instead.
8. **Check `/config/constraints`** and make the numeric configs satisfy every bound
   against the chosen capacity and their peers.
9. **Encode every config** with the table in
   [Encoding a config value](#encoding-a-config-value--the-parsers-rules). Omit empty
   ones. Stamp `created_by` = `actionPerformerURDD` on each.
10. **Build the pricing rows** with `price` = the `base_price` config and `currencyId` =
    the `base_currency` config, on every row.
11. **Copy the publish window to the root** as `publishStartDateTime` /
    `publishEndDateTime` in addition to its `configs[]` entries.
12. **POST**, then re-`GET ?id=` and diff the returned `configs[]` against what you sent.
    A key that comes back missing or reshaped is one whose encoding is wrong — that
    round-trip is the only reliable check that a seeded row is editable.

---

## Per service category — real POST payloads

The payloads below are captured verbatim from the admin panel. They are the reference for
"seeded exactly as the admin panel posts it": note the per-category config sets, the
`duration` `is_input` split, the checkbox `{en,ar}` pairs, the bare-JSON-string schema
forms, and `physical_dimension` as a bare object.

Stay:
```json
{
    "id": null,
    "catalogId": 1,
    "categoryId": 490,
    "actionPerformerURDD": 643,
    "serviceType": "stay",
    "serviceNature": "in-house",
    "serviceName": { "en": "Test Stay", "ar": "اختبار البقاء" },
    "serviceDescription": { "en": "ABC", "ar": "ABC" },
    "serviceShortDescription": { "en": "ABC", "ar": "ABC" },
    "serviceStatus": "active",
    "configs": [
        { "config_key_id": 7295, "config_key": "visibility", "operator": "=", "config_value": [23852], "is_input": 0, "created_by": 643 },
        { "config_key_id": 7327, "config_key": "is_featured", "operator": "=", "config_value": [{ "en": "1", "ar": "1" }], "is_input": 1, "created_by": 643 },
        { "config_key_id": 7293, "config_key": "media", "operator": "=", "config_value": [1473], "is_input": 1, "created_by": 643 },
        { "config_key_id": 7299, "config_key": "publish_start_datetime", "operator": "=", "config_value": ["2026-09-02 13:12:00"], "is_input": 1, "created_by": 643 },
        { "config_key_id": 7300, "config_key": "publish_end_datetime", "operator": "=", "config_value": ["2026-09-25 00:00:00"], "is_input": 1, "created_by": 643 },
        { "config_key_id": 7296, "config_key": "advance_booking_min_days", "operator": "=", "config_value": [0], "is_input": 1, "created_by": 643 },
        { "config_key_id": 7297, "config_key": "advance_booking_max_days", "operator": "=", "config_value": [30], "is_input": 1, "created_by": 643 },
        { "config_key_id": 7309, "config_key": "allowed_regions", "operator": "=", "config_value": [{ "1": [1,2,3,4,5,6,7,8,9,10,11,12,13,14], "2": [15,16,17,18,19,20,21,22], "3": [23,24,25,26,27,28,29,30,31,32,33], "4": [34,35,36,37,38,39,40,41], "5": [42,43,44,45,46], "6": [47,48,49,50,51,52,53], "7": [54,55,56,57,58,59,60,61,62,63,64,65,66,67,68], "8": [69,70,71,72,73,74,75,76,77], "9": [78,79,80,81,82,83,84,85,86,87,88,89,90,91,92,93,94,95], "10": [96,97,98,99,100], "11": [101,102,103,104,105,106,107,108,109,110,111,112,113,114,115,116,117,118,119,120,121,122,123,124,125,126,127,128,129,130,131,132,133,134,135,136,137,138,139,140,141,142,143,144,145,146,147], "12": [148,149,150], "13": [151,152,153,154,155,156,157], "14": [158,159,160,161,162,163,164,165,166,167,168,169,170,171], "15": [172,173,174,175,176,177,178,179,180,181,182,183], "16": [184,185,186,187,188,189,190,191,192,193,194,195,196,197] }], "is_input": 1, "created_by": 643 },
        { "config_key_id": 7337, "config_key": "duration_unit", "operator": "=", "config_value": [25568], "is_input": 0, "created_by": 643 },
        { "config_key_id": 7349, "config_key": "duration", "operator": "=", "config_value": [28118], "is_input": 0, "created_by": 643 },
        { "config_key_id": 7372, "config_key": "min_guests_age", "operator": "=", "config_value": [0], "is_input": 1, "created_by": 643 },
        { "config_key_id": 7373, "config_key": "max_guests_age", "operator": "=", "config_value": [0], "is_input": 1, "created_by": 643 },
        { "config_key_id": 7302, "config_key": "min_persons_per_booking", "operator": "=", "config_value": [1], "is_input": 1, "created_by": 643 },
        { "config_key_id": 7303, "config_key": "max_persons_per_booking", "operator": "=", "config_value": [10], "is_input": 1, "created_by": 643 },
        { "config_key_id": 7364, "config_key": "max_adults", "operator": "=", "config_value": [2], "is_input": 1, "created_by": 643 },
        { "config_key_id": 7365, "config_key": "max_children", "operator": "=", "config_value": [0], "is_input": 1, "created_by": 643 },
        { "config_key_id": 7304, "config_key": "min_stay_nights", "operator": "=", "config_value": [1], "is_input": 1, "created_by": 643 },
        { "config_key_id": 7366, "config_key": "max_quantity_per_booking", "operator": "=", "config_value": [3], "is_input": 1, "created_by": 643 },
        { "config_key_id": 7305, "config_key": "max_stay_nights", "operator": "=", "config_value": [30], "is_input": 1, "created_by": 643 },
        { "config_key_id": 7367, "config_key": "is_consumable", "operator": "=", "config_value": [{ "en": "1", "ar": "1" }], "is_input": 1, "created_by": 643 },
        { "config_key_id": 7294, "config_key": "terms_and_conditions", "operator": "=", "config_value": [{ "en": "terms and conditions", "ar": "الشروط والأحكام" }], "is_input": 1, "created_by": 643 },
        { "config_key_id": 7335, "config_key": "physical_dimension", "operator": "=", "config_value": { "length": 4, "width": 4, "height": 4 }, "is_input": 1, "created_by": 643 },
        { "config_key_id": 7332, "config_key": "is_amenity", "operator": "=", "config_value": [{ "en": "1", "ar": "1" }], "is_input": 1, "created_by": 643 },
        { "config_key_id": 7331, "config_key": "services_as_amenities", "operator": "=", "config_value": [485], "is_input": 1, "created_by": 643 },
        { "config_key_id": 7363, "config_key": "keyword_tags", "operator": "=", "config_value": [24154], "is_input": 0, "created_by": 643 },
        { "config_key_id": 7336, "config_key": "amenities_tags", "operator": "=", "config_value": [23968], "is_input": 0, "created_by": 643 },
        { "config_key_id": 7312, "config_key": "base_price", "operator": "=", "config_value": [100], "is_input": 1, "created_by": 643 },
        { "config_key_id": 7329, "config_key": "base_currency", "operator": "=", "config_value": [4], "is_input": 1, "created_by": 643 },
        { "config_key_id": 7318, "config_key": "cancellation_margin", "operator": "=", "config_value": "{\"name\":{\"en\":\"abc\",\"ar\":\"abc\"},\"rules\":[{\"hours_before\":111,\"charge_pct\":11}]}", "is_input": 1, "created_by": 643 },
        { "config_key_id": 7319, "config_key": "extension_allowed", "operator": "=", "config_value": [{ "en": "1", "ar": "1" }], "is_input": 1, "created_by": 643 },
        { "config_key_id": 7321, "config_key": "max_extension_length", "operator": "=", "config_value": [7], "is_input": 1, "created_by": 643 },
        { "config_key_id": 7322, "config_key": "extension_pricing_rule", "operator": "=", "config_value": [10], "is_input": 1, "created_by": 643 }
    ],
    "servicePricing": [
        { "price": 100, "currencyId": 4, "delta": "+", "value": null, "type": "flat", "validFrom": null, "validTo": null, "minQuantity": null, "maxQuantity": null, "customerSegment": "regular", "recurrence": "once", "dayOfWeek": null }
    ],
    "serviceLocations": [ { "location_id": 3071 } ],
    "deliverUnitIds": [4961],
    "userId": 1,
    "tenantId": 88
}
```

Dining:
```json
{
    "id": null,
    "catalogId": 1,
    "categoryId": 473,
    "actionPerformerURDD": 587,
    "serviceType": "dining",
    "serviceNature": "in-house",
    "serviceName": { "en": "Dining service", "ar": "خدمة تناول الطعام" },
    "serviceDescription": { "en": "Dining service with free cold drink", "ar": "خدمة تناول الطعام مع مشروب بارد مجاني" },
    "serviceShortDescription": { "en": "Dining service with drink", "ar": "خدمة تناول الطعام مع الشراب" },
    "serviceStatus": "active",
    "configs": [
        { "config_key_id": 7093, "config_key": "visibility", "operator": "=", "config_value": [22104], "is_input": 0, "created_by": 587 },
        { "config_key_id": 7125, "config_key": "is_featured", "operator": "=", "config_value": [{ "en": "1", "ar": "1" }], "is_input": 1, "created_by": 587 },
        { "config_key_id": 7091, "config_key": "media", "operator": "=", "config_value": [1474], "is_input": 1, "created_by": 587 },
        { "config_key_id": 7122, "config_key": "consumption_type", "operator": "=", "config_value": [22149], "is_input": 0, "created_by": 587 },
        { "config_key_id": 7097, "config_key": "publish_start_datetime", "operator": "=", "config_value": ["2026-09-02 14:30:00"], "is_input": 1, "created_by": 587 },
        { "config_key_id": 7098, "config_key": "publish_end_datetime", "operator": "=", "config_value": ["2026-09-30 23:59:00"], "is_input": 1, "created_by": 587 },
        { "config_key_id": 7094, "config_key": "advance_booking_min_days", "operator": "=", "config_value": [3], "is_input": 1, "created_by": 587 },
        { "config_key_id": 7095, "config_key": "advance_booking_max_days", "operator": "=", "config_value": [30], "is_input": 1, "created_by": 587 },
        { "config_key_id": 7107, "config_key": "allowed_regions", "operator": "=", "config_value": [{ "1": [1,2,3,4,5,6,7,8,9,10,11,12,13,14], "2": [15,16,17,18,19,20,21,22], "3": [23,24,25,26,27,28,29,30,31,32,33], "4": [34,35,36,37,38,39,40,41], "5": [42,43,44,45,46], "6": [47,48,49,50,51,52,53], "7": [54,55,56,57,58,59,60,61,62,63,64,65,66,67,68], "8": [69,70,71,72,73,74,75,76,77], "9": [78,79,80,81,82,83,84,85,86,87,88,89,90,91,92,93,94,95], "10": [96,97,98,99,100], "11": [101,102,103,104,105,106,107,108,109,110,111,112,113,114,115,116,117,118,119,120,121,122,123,124,125,126,127,128,129,130,131,132,133,134,135,136,137,138,139,140,141,142,143,144,145,146,147], "12": [148,149,150], "13": [151,152,153,154,155,156,157], "14": [158,159,160,161,162,163,164,165,166,167,168,169,170,171], "15": [172,173,174,175,176,177,178,179,180,181,182,183], "16": [184,185,186,187,188,189,190,191,192,193,194,195,196,197] }], "is_input": 1, "created_by": 587 },
        { "config_key_id": 7135, "config_key": "duration_unit", "operator": "=", "config_value": [25848], "is_input": 0, "created_by": 587 },
        { "config_key_id": 7148, "config_key": "duration", "operator": "=", "config_value": [24782], "is_input": 0, "created_by": 587 },
        { "config_key_id": 7171, "config_key": "min_guests_age", "operator": "=", "config_value": [0], "is_input": 1, "created_by": 587 },
        { "config_key_id": 7172, "config_key": "max_guests_age", "operator": "=", "config_value": [100], "is_input": 1, "created_by": 587 },
        { "config_key_id": 7163, "config_key": "max_adults", "operator": "=", "config_value": [2], "is_input": 1, "created_by": 587 },
        { "config_key_id": 7164, "config_key": "max_children", "operator": "=", "config_value": [2], "is_input": 1, "created_by": 587 },
        { "config_key_id": 7165, "config_key": "max_quantity_per_booking", "operator": "=", "config_value": [3], "is_input": 1, "created_by": 587 },
        { "config_key_id": 7166, "config_key": "is_consumable", "operator": "=", "config_value": [{ "en": "1", "ar": "1" }], "is_input": 1, "created_by": 587 },
        { "config_key_id": 7126, "config_key": "requires_booking", "operator": "=", "config_value": [{ "en": "1", "ar": "1" }], "is_input": 1, "created_by": 587 },
        { "config_key_id": 7092, "config_key": "terms_and_conditions", "operator": "=", "config_value": [{ "en": "No smoking is allowed", "ar": "التدخين مسموح __________؟" }], "is_input": 1, "created_by": 587 },
        { "config_key_id": 7133, "config_key": "physical_dimension", "operator": "=", "config_value": { "length": 8, "width": 5, "height": 4 }, "is_input": 1, "created_by": 587 },
        { "config_key_id": 7130, "config_key": "is_amenity", "operator": "=", "config_value": [{ "en": "1", "ar": "1" }], "is_input": 1, "created_by": 587 },
        { "config_key_id": 7162, "config_key": "keyword_tags", "operator": "=", "config_value": [22377], "is_input": 0, "created_by": 587 },
        { "config_key_id": 7134, "config_key": "amenities_tags", "operator": "=", "config_value": [22223,22224,22225,22236,22227,22226,22228,22232,22234], "is_input": 0, "created_by": 587 },
        { "config_key_id": 7110, "config_key": "base_price", "operator": "=", "config_value": ["120"], "is_input": 1, "created_by": 587 },
        { "config_key_id": 7127, "config_key": "base_currency", "operator": "=", "config_value": [4], "is_input": 1, "created_by": 587 },
        { "config_key_id": 7116, "config_key": "cancellation_margin", "operator": "=", "config_value": "{\"rules\":[{\"hours_before\":1,\"charge_pct\":10}],\"name\":{\"en\":\"Cancellation\",\"ar\":\"الإلغاء\"}}", "is_input": 1, "created_by": 587 }
    ],
    "servicePricing": [
        { "price": "120", "currencyId": 4, "delta": "+", "value": null, "type": "flat", "validFrom": null, "validTo": null, "minQuantity": null, "maxQuantity": null, "customerSegment": "regular", "recurrence": "once", "dayOfWeek": null },
        { "price": "120", "currencyId": 4, "delta": "-", "value": "40", "type": "flat", "validFrom": "2026-09-06 00:00:00", "validTo": "2026-09-06 23:59:00", "minQuantity": null, "maxQuantity": null, "customerSegment": "regular", "recurrence": "once", "dayOfWeek": "Sunday" }
    ],
    "serviceLocations": [ { "location_id": 1727 } ],
    "deliverUnitIds": [7885],
    "userId": 1,
    "tenantId": 86
}
```

Spa:
```json
{
    "id": null,
    "catalogId": 1,
    "categoryId": 474,
    "actionPerformerURDD": 587,
    "serviceType": "spa",
    "serviceNature": "in-house",
    "serviceName": { "en": "Spa service", "ar": "خدمة المنتجع الصحي" },
    "serviceDescription": { "en": "Spa service", "ar": "خدمة المنتجع الصحي" },
    "serviceShortDescription": { "en": "Spa service", "ar": "خدمة المنتجع الصحي" },
    "serviceStatus": "active",
    "configs": [
        { "config_key_id": 7093, "config_key": "visibility", "operator": "=", "config_value": [22104], "is_input": 0, "created_by": 587 },
        { "config_key_id": 7125, "config_key": "is_featured", "operator": "=", "config_value": [{ "en": "0", "ar": "0" }], "is_input": 1, "created_by": 587 },
        { "config_key_id": 7091, "config_key": "media", "operator": "=", "config_value": [1475], "is_input": 1, "created_by": 587 },
        { "config_key_id": 7122, "config_key": "consumption_type", "operator": "=", "config_value": [22149], "is_input": 0, "created_by": 587 },
        { "config_key_id": 7097, "config_key": "publish_start_datetime", "operator": "=", "config_value": ["2026-09-02 14:48:00"], "is_input": 1, "created_by": 587 },
        { "config_key_id": 7098, "config_key": "publish_end_datetime", "operator": "=", "config_value": ["2026-09-30 23:59:00"], "is_input": 1, "created_by": 587 },
        { "config_key_id": 7094, "config_key": "advance_booking_min_days", "operator": "=", "config_value": [3], "is_input": 1, "created_by": 587 },
        { "config_key_id": 7095, "config_key": "advance_booking_max_days", "operator": "=", "config_value": [30], "is_input": 1, "created_by": 587 },
        { "config_key_id": 7107, "config_key": "allowed_regions", "operator": "=", "config_value": [{ "1": [1,2,3,4,5,6,7,8,9,10,11,12,13,14], "2": [15,16,17,18,19,20,21,22], "3": [23,24,25,26,27,28,29,30,31,32,33], "4": [34,35,36,37,38,39,40,41], "5": [42,43,44,45,46], "6": [47,48,49,50,51,52,53], "7": [54,55,56,57,58,59,60,61,62,63,64,65,66,67,68], "8": [69,70,71,72,73,74,75,76,77], "9": [78,79,80,81,82,83,84,85,86,87,88,89,90,91,92,93,94,95], "10": [96,97,98,99,100], "11": [101,102,103,104,105,106,107,108,109,110,111,112,113,114,115,116,117,118,119,120,121,122,123,124,125,126,127,128,129,130,131,132,133,134,135,136,137,138,139,140,141,142,143,144,145,146,147], "12": [148,149,150], "13": [151,152,153,154,155,156,157], "14": [158,159,160,161,162,163,164,165,166,167,168,169,170,171], "15": [172,173,174,175,176,177,178,179,180,181,182,183], "16": [184,185,186,187,188,189,190,191,192,193,194,195,196,197] }], "is_input": 1, "created_by": 587 },
        { "config_key_id": 7135, "config_key": "duration_unit", "operator": "=", "config_value": [25875], "is_input": 0, "created_by": 587 },
        { "config_key_id": 7148, "config_key": "duration", "operator": "=", "config_value": [24787], "is_input": 0, "created_by": 587 },
        { "config_key_id": 7171, "config_key": "min_guests_age", "operator": "=", "config_value": [18], "is_input": 1, "created_by": 587 },
        { "config_key_id": 7172, "config_key": "max_guests_age", "operator": "=", "config_value": [80], "is_input": 1, "created_by": 587 },
        { "config_key_id": 7163, "config_key": "max_adults", "operator": "=", "config_value": [2], "is_input": 1, "created_by": 587 },
        { "config_key_id": 7164, "config_key": "max_children", "operator": "=", "config_value": [0], "is_input": 1, "created_by": 587 },
        { "config_key_id": 7165, "config_key": "max_quantity_per_booking", "operator": "=", "config_value": [3], "is_input": 1, "created_by": 587 },
        { "config_key_id": 7166, "config_key": "is_consumable", "operator": "=", "config_value": [{ "en": "0", "ar": "0" }], "is_input": 1, "created_by": 587 },
        { "config_key_id": 7126, "config_key": "requires_booking", "operator": "=", "config_value": [{ "en": "0", "ar": "0" }], "is_input": 1, "created_by": 587 },
        { "config_key_id": 7109, "config_key": "gender_restricted_windows", "operator": "=", "config_value": "{\"enabled\":true,\"schedule\":[{\"day\":\"sun\",\"gender\":\"men\",\"open\":{\"en\":\"20:00\",\"ar\":\"20:00\"},\"close\":{\"en\":\"22:00\",\"ar\":\"22:00\"}}]}", "is_input": 1, "created_by": 587 },
        { "config_key_id": 7092, "config_key": "terms_and_conditions", "operator": "=", "config_value": [{ "en": "Not specified", "ar": "غير محددة" }], "is_input": 1, "created_by": 587 },
        { "config_key_id": 7133, "config_key": "physical_dimension", "operator": "=", "config_value": { "length": 4, "height": 4, "width": 4 }, "is_input": 1, "created_by": 587 },
        { "config_key_id": 7130, "config_key": "is_amenity", "operator": "=", "config_value": [{ "en": "1", "ar": "1" }], "is_input": 1, "created_by": 587 },
        { "config_key_id": 7129, "config_key": "services_as_amenities", "operator": "=", "config_value": [490], "is_input": 1, "created_by": 587 },
        { "config_key_id": 7162, "config_key": "keyword_tags", "operator": "=", "config_value": [22384,22385,22386], "is_input": 0, "created_by": 587 },
        { "config_key_id": 7134, "config_key": "amenities_tags", "operator": "=", "config_value": [22239,22240,22241,22246], "is_input": 0, "created_by": 587 },
        { "config_key_id": 7570, "config_key": "preferred_caretaker_gender", "operator": "=", "config_value": [26311], "is_input": 0, "created_by": 587 },
        { "config_key_id": 7110, "config_key": "base_price", "operator": "=", "config_value": ["70"], "is_input": 1, "created_by": 587 },
        { "config_key_id": 7127, "config_key": "base_currency", "operator": "=", "config_value": [4], "is_input": 1, "created_by": 587 },
        { "config_key_id": 7116, "config_key": "cancellation_margin", "operator": "=", "config_value": "{\"name\":{\"en\":\"Cancellation\",\"ar\":\"الإلغاء\"},\"rules\":[{\"hours_before\":2,\"charge_pct\":5}]}", "is_input": 1, "created_by": 587 }
    ],
    "servicePricing": [
        { "price": "70", "currencyId": 4, "delta": "+", "value": null, "type": "flat", "validFrom": null, "validTo": null, "minQuantity": null, "maxQuantity": null, "customerSegment": "regular", "recurrence": "once", "dayOfWeek": null },
        { "price": "70", "currencyId": 4, "delta": "-", "value": "20", "type": "flat", "validFrom": "2026-09-20 00:00:00", "validTo": "2026-09-20 23:59:00", "minQuantity": null, "maxQuantity": null, "customerSegment": "regular", "recurrence": "once", "dayOfWeek": "Sunday" }
    ],
    "serviceLocations": [ { "location_id": 2802 } ],
    "deliverUnitIds": [7892],
    "userId": 1,
    "tenantId": 86
}
```

Kids:
```json
{
    "id": null,
    "catalogId": 1,
    "categoryId": 495,
    "actionPerformerURDD": 643,
    "serviceType": "kids",
    "serviceNature": "in-house",
    "serviceName": { "en": "Test Kids", "ar": "اختبار الأطفال" },
    "serviceDescription": { "en": "abc", "ar": "abc" },
    "serviceShortDescription": { "en": "abc", "ar": "abc" },
    "serviceStatus": "active",
    "configs": [
        { "config_key_id": 7295, "config_key": "visibility", "operator": "=", "config_value": [23852], "is_input": 0, "created_by": 643 },
        { "config_key_id": 7327, "config_key": "is_featured", "operator": "=", "config_value": [{ "en": "1", "ar": "1" }], "is_input": 1, "created_by": 643 },
        { "config_key_id": 7293, "config_key": "media", "operator": "=", "config_value": [1476], "is_input": 1, "created_by": 643 },
        { "config_key_id": 7324, "config_key": "consumption_type", "operator": "=", "config_value": [23897], "is_input": 0, "created_by": 643 },
        { "config_key_id": 7299, "config_key": "publish_start_datetime", "operator": "=", "config_value": ["2026-09-02 15:28:00"], "is_input": 1, "created_by": 643 },
        { "config_key_id": 7300, "config_key": "publish_end_datetime", "operator": "=", "config_value": ["2026-09-25 00:00:00"], "is_input": 1, "created_by": 643 },
        { "config_key_id": 7296, "config_key": "advance_booking_min_days", "operator": "=", "config_value": [0], "is_input": 1, "created_by": 643 },
        { "config_key_id": 7297, "config_key": "advance_booking_max_days", "operator": "=", "config_value": [30], "is_input": 1, "created_by": 643 },
        { "config_key_id": 7309, "config_key": "allowed_regions", "operator": "=", "config_value": [{ "1": [1,2,3,4,5,6,7,8,9,10,11,12,13,14], "2": [15,16,17,18,19,20,21,22], "3": [23,24,25,26,27,28,29,30,31,32,33], "4": [34,35,36,37,38,39,40,41], "5": [42,43,44,45,46], "6": [47,48,49,50,51,52,53], "7": [54,55,56,57,58,59,60,61,62,63,64,65,66,67,68], "8": [69,70,71,72,73,74,75,76,77], "9": [78,79,80,81,82,83,84,85,86,87,88,89,90,91,92,93,94,95], "10": [96,97,98,99,100], "11": [101,102,103,104,105,106,107,108,109,110,111,112,113,114,115,116,117,118,119,120,121,122,123,124,125,126,127,128,129,130,131,132,133,134,135,136,137,138,139,140,141,142,143,144,145,146,147], "12": [148,149,150], "13": [151,152,153,154,155,156,157], "14": [158,159,160,161,162,163,164,165,166,167,168,169,170,171], "15": [172,173,174,175,176,177,178,179,180,181,182,183], "16": [184,185,186,187,188,189,190,191,192,193,194,195,196,197] }], "is_input": 1, "created_by": 643 },
        { "config_key_id": 7337, "config_key": "duration_unit", "operator": "=", "config_value": [25570], "is_input": 0, "created_by": 643 },
        { "config_key_id": 7349, "config_key": "duration", "operator": "=", "config_value": [2], "is_input": 1, "created_by": 643 },
        { "config_key_id": 7372, "config_key": "min_guests_age", "operator": "=", "config_value": [0], "is_input": 1, "created_by": 643 },
        { "config_key_id": 7373, "config_key": "max_guests_age", "operator": "=", "config_value": [0], "is_input": 1, "created_by": 643 },
        { "config_key_id": 7371, "config_key": "guardian_required", "operator": "=", "config_value": [{ "en": "1", "ar": "1" }], "is_input": 1, "created_by": 643 },
        { "config_key_id": 7364, "config_key": "max_adults", "operator": "=", "config_value": [4], "is_input": 1, "created_by": 643 },
        { "config_key_id": 7365, "config_key": "max_children", "operator": "=", "config_value": [3], "is_input": 1, "created_by": 643 },
        { "config_key_id": 7366, "config_key": "max_quantity_per_booking", "operator": "=", "config_value": [2], "is_input": 1, "created_by": 643 },
        { "config_key_id": 7367, "config_key": "is_consumable", "operator": "=", "config_value": [{ "en": "1", "ar": "1" }], "is_input": 1, "created_by": 643 },
        { "config_key_id": 7328, "config_key": "requires_booking", "operator": "=", "config_value": [{ "en": "1", "ar": "1" }], "is_input": 1, "created_by": 643 },
        { "config_key_id": 7294, "config_key": "terms_and_conditions", "operator": "=", "config_value": [{ "en": "terms and conditions", "ar": "الشروط والأحكام" }], "is_input": 1, "created_by": 643 },
        { "config_key_id": 7335, "config_key": "physical_dimension", "operator": "=", "config_value": { "length": 2, "width": 2, "height": 2 }, "is_input": 1, "created_by": 643 },
        { "config_key_id": 7332, "config_key": "is_amenity", "operator": "=", "config_value": [{ "en": "1", "ar": "1" }], "is_input": 1, "created_by": 643 },
        { "config_key_id": 7331, "config_key": "services_as_amenities", "operator": "=", "config_value": [485], "is_input": 1, "created_by": 643 },
        { "config_key_id": 7363, "config_key": "keyword_tags", "operator": "=", "config_value": [24191], "is_input": 0, "created_by": 643 },
        { "config_key_id": 7336, "config_key": "amenities_tags", "operator": "=", "config_value": [24059], "is_input": 0, "created_by": 643 },
        { "config_key_id": 7353, "config_key": "parent_name", "operator": "=", "config_value": [{ "en": "Parent/Guardian Name", "ar": "اسم ولي الأمر" }], "is_input": 1, "created_by": 643 },
        { "config_key_id": 7312, "config_key": "base_price", "operator": "=", "config_value": [100], "is_input": 1, "created_by": 643 },
        { "config_key_id": 7329, "config_key": "base_currency", "operator": "=", "config_value": [4], "is_input": 1, "created_by": 643 },
        { "config_key_id": 7318, "config_key": "cancellation_margin", "operator": "=", "config_value": "{\"name\":{\"en\":\"2\",\"ar\":\"\"},\"rules\":[{\"hours_before\":2,\"charge_pct\":2}]}", "is_input": 1, "created_by": 643 }
    ],
    "servicePricing": [
        { "price": 100, "currencyId": 4, "delta": "+", "value": null, "type": "flat", "validFrom": null, "validTo": null, "minQuantity": null, "maxQuantity": null, "customerSegment": "regular", "recurrence": "once", "dayOfWeek": null }
    ],
    "serviceLocations": [ { "location_id": 3040 } ],
    "deliverUnitIds": [4957],
    "userId": 1,
    "tenantId": 88
}
```

Barber:
```json
{
    "id": null,
    "catalogId": 1,
    "categoryId": 493,
    "actionPerformerURDD": 643,
    "serviceType": "barber",
    "serviceNature": "in-house",
    "serviceName": { "en": "Test Barber", "ar": "اختبار الحلاق" },
    "serviceDescription": { "en": "abc", "ar": "abc" },
    "serviceShortDescription": { "en": "abc", "ar": "abc" },
    "serviceStatus": "active",
    "configs": [
        { "config_key_id": 7295, "config_key": "visibility", "operator": "=", "config_value": [23852], "is_input": 0, "created_by": 643 },
        { "config_key_id": 7327, "config_key": "is_featured", "operator": "=", "config_value": [{ "en": "1", "ar": "1" }], "is_input": 1, "created_by": 643 },
        { "config_key_id": 7293, "config_key": "media", "operator": "=", "config_value": [1477], "is_input": 1, "created_by": 643 },
        { "config_key_id": 7324, "config_key": "consumption_type", "operator": "=", "config_value": [23897], "is_input": 0, "created_by": 643 },
        { "config_key_id": 7299, "config_key": "publish_start_datetime", "operator": "=", "config_value": ["2026-09-02 15:44:00"], "is_input": 1, "created_by": 643 },
        { "config_key_id": 7300, "config_key": "publish_end_datetime", "operator": "=", "config_value": ["2026-09-25 00:00:00"], "is_input": 1, "created_by": 643 },
        { "config_key_id": 7296, "config_key": "advance_booking_min_days", "operator": "=", "config_value": [0], "is_input": 1, "created_by": 643 },
        { "config_key_id": 7297, "config_key": "advance_booking_max_days", "operator": "=", "config_value": [30], "is_input": 1, "created_by": 643 },
        { "config_key_id": 7309, "config_key": "allowed_regions", "operator": "=", "config_value": [{ "1": [1,2,3,4,5,6,7,8,9,10,11,12,13,14], "2": [15,16,17,18,19,20,21,22], "3": [23,24,25,26,27,28,29,30,31,32,33], "4": [34,35,36,37,38,39,40,41], "5": [42,43,44,45,46], "6": [47,48,49,50,51,52,53], "7": [54,55,56,57,58,59,60,61,62,63,64,65,66,67,68], "8": [69,70,71,72,73,74,75,76,77], "9": [78,79,80,81,82,83,84,85,86,87,88,89,90,91,92,93,94,95], "10": [96,97,98,99,100], "11": [101,102,103,104,105,106,107,108,109,110,111,112,113,114,115,116,117,118,119,120,121,122,123,124,125,126,127,128,129,130,131,132,133,134,135,136,137,138,139,140,141,142,143,144,145,146,147], "12": [148,149,150], "13": [151,152,153,154,155,156,157], "14": [158,159,160,161,162,163,164,165,166,167,168,169,170,171], "15": [172,173,174,175,176,177,178,179,180,181,182,183], "16": [184,185,186,187,188,189,190,191,192,193,194,195,196,197] }], "is_input": 1, "created_by": 643 },
        { "config_key_id": 7337, "config_key": "duration_unit", "operator": "=", "config_value": [25904], "is_input": 0, "created_by": 643 },
        { "config_key_id": 7349, "config_key": "duration", "operator": "=", "config_value": [24831], "is_input": 0, "created_by": 643 },
        { "config_key_id": 7372, "config_key": "min_guests_age", "operator": "=", "config_value": [0], "is_input": 1, "created_by": 643 },
        { "config_key_id": 7373, "config_key": "max_guests_age", "operator": "=", "config_value": [0], "is_input": 1, "created_by": 643 },
        { "config_key_id": 7310, "config_key": "guardian_required_age_cutoff", "operator": "=", "config_value": [12], "is_input": 1, "created_by": 643 },
        { "config_key_id": 7364, "config_key": "max_adults", "operator": "=", "config_value": [2], "is_input": 1, "created_by": 643 },
        { "config_key_id": 7365, "config_key": "max_children", "operator": "=", "config_value": [0], "is_input": 1, "created_by": 643 },
        { "config_key_id": 7366, "config_key": "max_quantity_per_booking", "operator": "=", "config_value": [2], "is_input": 1, "created_by": 643 },
        { "config_key_id": 7367, "config_key": "is_consumable", "operator": "=", "config_value": [{ "en": "1", "ar": "1" }], "is_input": 1, "created_by": 643 },
        { "config_key_id": 7328, "config_key": "requires_booking", "operator": "=", "config_value": [{ "en": "1", "ar": "1" }], "is_input": 1, "created_by": 643 },
        { "config_key_id": 7294, "config_key": "terms_and_conditions", "operator": "=", "config_value": [{ "en": "terms and conditions", "ar": "الشروط والأحكام" }], "is_input": 1, "created_by": 643 },
        { "config_key_id": 7335, "config_key": "physical_dimension", "operator": "=", "config_value": { "length": 2, "width": 2, "height": 2 }, "is_input": 1, "created_by": 643 },
        { "config_key_id": 7332, "config_key": "is_amenity", "operator": "=", "config_value": [{ "en": "1", "ar": "1" }], "is_input": 1, "created_by": 643 },
        { "config_key_id": 7363, "config_key": "keyword_tags", "operator": "=", "config_value": [24175], "is_input": 0, "created_by": 643 },
        { "config_key_id": 7336, "config_key": "amenities_tags", "operator": "=", "config_value": [24032], "is_input": 0, "created_by": 643 },
        { "config_key_id": 7312, "config_key": "base_price", "operator": "=", "config_value": [100], "is_input": 1, "created_by": 643 },
        { "config_key_id": 7329, "config_key": "base_currency", "operator": "=", "config_value": [4], "is_input": 1, "created_by": 643 }
    ],
    "servicePricing": [
        { "price": 100, "currencyId": 4, "delta": "+", "value": null, "type": "flat", "validFrom": null, "validTo": null, "minQuantity": null, "maxQuantity": null, "customerSegment": "regular", "recurrence": "once", "dayOfWeek": null }
    ],
    "serviceLocations": [ { "location_id": 3040 } ],
    "deliverUnitIds": [7943],
    "userId": 1,
    "tenantId": 88
}
```

Room service:
```json
{
    "id": null,
    "catalogId": 1,
    "categoryId": 498,
    "actionPerformerURDD": 643,
    "serviceType": "room-service",
    "serviceNature": "in-house",
    "serviceName": { "en": "Test RS", "ar": "اختبار RS" },
    "serviceDescription": { "en": "ABC", "ar": "ABC" },
    "serviceShortDescription": { "en": "aaa", "ar": "aaa" },
    "serviceStatus": "active",
    "configs": [
        { "config_key_id": 7295, "config_key": "visibility", "operator": "=", "config_value": [23852], "is_input": 0, "created_by": 643 },
        { "config_key_id": 7327, "config_key": "is_featured", "operator": "=", "config_value": [{ "en": "1", "ar": "1" }], "is_input": 1, "created_by": 643 },
        { "config_key_id": 7293, "config_key": "media", "operator": "=", "config_value": [1479], "is_input": 1, "created_by": 643 },
        { "config_key_id": 7324, "config_key": "consumption_type", "operator": "=", "config_value": [23897], "is_input": 0, "created_by": 643 },
        { "config_key_id": 7299, "config_key": "publish_start_datetime", "operator": "=", "config_value": ["2026-09-02 15:56:00"], "is_input": 1, "created_by": 643 },
        { "config_key_id": 7300, "config_key": "publish_end_datetime", "operator": "=", "config_value": ["2026-09-25 00:00:00"], "is_input": 1, "created_by": 643 },
        { "config_key_id": 7296, "config_key": "advance_booking_min_days", "operator": "=", "config_value": [0], "is_input": 1, "created_by": 643 },
        { "config_key_id": 7297, "config_key": "advance_booking_max_days", "operator": "=", "config_value": [30], "is_input": 1, "created_by": 643 },
        { "config_key_id": 7301, "config_key": "queue_depth_max_orders", "operator": "=", "config_value": [10], "is_input": 1, "created_by": 643 },
        { "config_key_id": 7309, "config_key": "allowed_regions", "operator": "=", "config_value": [{ "1": [1,2,3,4,5,6,7,8,9,10,11,12,13,14], "2": [15,16,17,18,19,20,21,22], "3": [23,24,25,26,27,28,29,30,31,32,33], "4": [34,35,36,37,38,39,40,41], "5": [42,43,44,45,46], "6": [47,48,49,50,51,52,53], "7": [54,55,56,57,58,59,60,61,62,63,64,65,66,67,68], "8": [69,70,71,72,73,74,75,76,77], "9": [78,79,80,81,82,83,84,85,86,87,88,89,90,91,92,93,94,95], "10": [96,97,98,99,100], "11": [101,102,103,104,105,106,107,108,109,110,111,112,113,114,115,116,117,118,119,120,121,122,123,124,125,126,127,128,129,130,131,132,133,134,135,136,137,138,139,140,141,142,143,144,145,146,147], "12": [148,149,150], "13": [151,152,153,154,155,156,157], "14": [158,159,160,161,162,163,164,165,166,167,168,169,170,171], "15": [172,173,174,175,176,177,178,179,180,181,182,183], "16": [184,185,186,187,188,189,190,191,192,193,194,195,196,197] }], "is_input": 1, "created_by": 643 },
        { "config_key_id": 7337, "config_key": "duration_unit", "operator": "=", "config_value": [24110], "is_input": 0, "created_by": 643 },
        { "config_key_id": 7349, "config_key": "duration", "operator": "=", "config_value": [0], "is_input": 1, "created_by": 643 },
        { "config_key_id": 7372, "config_key": "min_guests_age", "operator": "=", "config_value": [0], "is_input": 1, "created_by": 643 },
        { "config_key_id": 7373, "config_key": "max_guests_age", "operator": "=", "config_value": [0], "is_input": 1, "created_by": 643 },
        { "config_key_id": 7308, "config_key": "acknowledge_sla_minutes", "operator": "=", "config_value": [5], "is_input": 1, "created_by": 643 },
        { "config_key_id": 7364, "config_key": "max_adults", "operator": "=", "config_value": [4], "is_input": 1, "created_by": 643 },
        { "config_key_id": 7365, "config_key": "max_children", "operator": "=", "config_value": [0], "is_input": 1, "created_by": 643 },
        { "config_key_id": 7367, "config_key": "is_consumable", "operator": "=", "config_value": [{ "en": "1", "ar": "1" }], "is_input": 1, "created_by": 643 },
        { "config_key_id": 7328, "config_key": "requires_booking", "operator": "=", "config_value": [{ "en": "1", "ar": "1" }], "is_input": 1, "created_by": 643 },
        { "config_key_id": 7294, "config_key": "terms_and_conditions", "operator": "=", "config_value": [{ "en": "terms and conditions", "ar": "الشروط والأحكام" }], "is_input": 1, "created_by": 643 },
        { "config_key_id": 7332, "config_key": "is_amenity", "operator": "=", "config_value": [{ "en": "1", "ar": "1" }], "is_input": 1, "created_by": 643 },
        { "config_key_id": 7363, "config_key": "keyword_tags", "operator": "=", "config_value": [24208,24209], "is_input": 0, "created_by": 643 },
        { "config_key_id": 7336, "config_key": "amenities_tags", "operator": "=", "config_value": [24092,24089], "is_input": 0, "created_by": 643 },
        { "config_key_id": 7312, "config_key": "base_price", "operator": "=", "config_value": [100], "is_input": 1, "created_by": 643 },
        { "config_key_id": 7329, "config_key": "base_currency", "operator": "=", "config_value": [4], "is_input": 1, "created_by": 643 }
    ],
    "servicePricing": [
        { "price": 100, "currencyId": 4, "delta": "+", "value": null, "type": "flat", "validFrom": null, "validTo": null, "minQuantity": null, "maxQuantity": null, "customerSegment": "regular", "recurrence": "once", "dayOfWeek": null }
    ],
    "serviceLocations": [ { "location_id": 3040 } ],
    "deliverUnitIds": [7946],
    "userId": 1,
    "tenantId": 88
}
```

Transport:
```json
{
    "id": null,
    "catalogId": 1,
    "categoryId": 496,
    "actionPerformerURDD": 643,
    "serviceType": "transport",
    "serviceNature": "in-house",
    "serviceName": { "en": "Test transport", "ar": "اختبار النقل" },
    "serviceDescription": { "en": "abc", "ar": "abc" },
    "serviceShortDescription": { "en": "abc", "ar": "abc" },
    "serviceStatus": "active",
    "configs": [
        { "config_key_id": 7295, "config_key": "visibility", "operator": "=", "config_value": [23852], "is_input": 0, "created_by": 643 },
        { "config_key_id": 7327, "config_key": "is_featured", "operator": "=", "config_value": [{ "en": "1", "ar": "1" }], "is_input": 1, "created_by": 643 },
        { "config_key_id": 7293, "config_key": "media", "operator": "=", "config_value": [1480], "is_input": 1, "created_by": 643 },
        { "config_key_id": 7324, "config_key": "consumption_type", "operator": "=", "config_value": [23897], "is_input": 0, "created_by": 643 },
        { "config_key_id": 7299, "config_key": "publish_start_datetime", "operator": "=", "config_value": ["2026-09-02 16:30:00"], "is_input": 1, "created_by": 643 },
        { "config_key_id": 7296, "config_key": "advance_booking_min_days", "operator": "=", "config_value": [0], "is_input": 1, "created_by": 643 },
        { "config_key_id": 7297, "config_key": "advance_booking_max_days", "operator": "=", "config_value": [30], "is_input": 1, "created_by": 643 },
        { "config_key_id": 7309, "config_key": "allowed_regions", "operator": "=", "config_value": [{ "1": [1,2,3,4,5,6,7,8,9,10,11,12,13,14], "2": [15,16,17,18,19,20,21,22], "3": [23,24,25,26,27,28,29,30,31,32,33], "4": [34,35,36,37,38,39,40,41], "5": [42,43,44,45,46], "6": [47,48,49,50,51,52,53], "7": [54,55,56,57,58,59,60,61,62,63,64,65,66,67,68], "8": [69,70,71,72,73,74,75,76,77], "9": [78,79,80,81,82,83,84,85,86,87,88,89,90,91,92,93,94,95], "10": [96,97,98,99,100], "11": [101,102,103,104,105,106,107,108,109,110,111,112,113,114,115,116,117,118,119,120,121,122,123,124,125,126,127,128,129,130,131,132,133,134,135,136,137,138,139,140,141,142,143,144,145,146,147], "12": [148,149,150], "13": [151,152,153,154,155,156,157], "14": [158,159,160,161,162,163,164,165,166,167,168,169,170,171], "15": [172,173,174,175,176,177,178,179,180,181,182,183], "16": [184,185,186,187,188,189,190,191,192,193,194,195,196,197] }], "is_input": 1, "created_by": 643 },
        { "config_key_id": 7337, "config_key": "duration_unit", "operator": "=", "config_value": [25958], "is_input": 0, "created_by": 643 },
        { "config_key_id": 7349, "config_key": "duration", "operator": "=", "config_value": [24839], "is_input": 0, "created_by": 643 },
        { "config_key_id": 7372, "config_key": "min_guests_age", "operator": "=", "config_value": [0], "is_input": 1, "created_by": 643 },
        { "config_key_id": 7373, "config_key": "max_guests_age", "operator": "=", "config_value": [0], "is_input": 1, "created_by": 643 },
        { "config_key_id": 7307, "config_key": "schedule_identifier", "operator": "=", "config_value": "{\"transport_type\":\"bus\"}", "is_input": 1, "created_by": 643 },
        { "config_key_id": 7302, "config_key": "min_persons_per_booking", "operator": "=", "config_value": [1], "is_input": 1, "created_by": 643 },
        { "config_key_id": 7303, "config_key": "max_persons_per_booking", "operator": "=", "config_value": [10], "is_input": 1, "created_by": 643 },
        { "config_key_id": 7364, "config_key": "max_adults", "operator": "=", "config_value": [4], "is_input": 1, "created_by": 643 },
        { "config_key_id": 7365, "config_key": "max_children", "operator": "=", "config_value": [0], "is_input": 1, "created_by": 643 },
        { "config_key_id": 7367, "config_key": "is_consumable", "operator": "=", "config_value": [{ "en": "1", "ar": "1" }], "is_input": 1, "created_by": 643 },
        { "config_key_id": 7328, "config_key": "requires_booking", "operator": "=", "config_value": [{ "en": "1", "ar": "1" }], "is_input": 1, "created_by": 643 },
        { "config_key_id": 7294, "config_key": "terms_and_conditions", "operator": "=", "config_value": [{ "en": "terms and conditions", "ar": "الشروط والأحكام" }], "is_input": 1, "created_by": 643 },
        { "config_key_id": 7332, "config_key": "is_amenity", "operator": "=", "config_value": [{ "en": "1", "ar": "1" }], "is_input": 1, "created_by": 643 },
        { "config_key_id": 8071, "config_key": "pickup_dropoff_locations", "operator": "=", "config_value": [{ "location_name": { "en": "Kababjees", "ar": "Kababjees" }, "order": 1 }], "is_input": 1, "created_by": 643 },
        { "config_key_id": 7363, "config_key": "keyword_tags", "operator": "=", "config_value": [24199,24200], "is_input": 0, "created_by": 643 },
        { "config_key_id": 7336, "config_key": "amenities_tags", "operator": "=", "config_value": [24069,24073], "is_input": 0, "created_by": 643 },
        { "config_key_id": 8106, "config_key": "destination_type", "operator": "=", "config_value": [28142], "is_input": 0, "created_by": 643 },
        { "config_key_id": 7312, "config_key": "base_price", "operator": "=", "config_value": [100], "is_input": 1, "created_by": 643 },
        { "config_key_id": 7329, "config_key": "base_currency", "operator": "=", "config_value": [4], "is_input": 1, "created_by": 643 },
        { "config_key_id": 7323, "config_key": "extension_behaviour_auto", "operator": "=", "config_value": [{ "en": "1", "ar": "1" }], "is_input": 1, "created_by": 643 }
    ],
    "servicePricing": [
        { "price": 100, "currencyId": 4, "delta": "+", "value": null, "type": "flat", "validFrom": null, "validTo": null, "minQuantity": null, "maxQuantity": null, "customerSegment": "regular", "recurrence": "once", "dayOfWeek": null }
    ],
    "serviceLocations": [ { "location_id": 3040 } ],
    "deliverUnitIds": [7944],
    "userId": 1,
    "tenantId": 88
}
```

:::note What differs between the categories
Everything above is the *same* mechanism with a different key set. The differences worth
copying into a seeder:

- **`duration`** — Stay / Dining / Spa / Barber / Transport carry a possible-value id
  (`is_input: 0`); Kids and Room Service carry a raw number (`is_input: 1`).
- **Category-only keys** — `min_stay_nights` / `max_stay_nights` / `extension_*` (Stay),
  `guardian_required` / `parent_name` (Kids), `guardian_required_age_cutoff` (Barber),
  `queue_depth_max_orders` / `acknowledge_sla_minutes` (Room Service),
  `schedule_identifier` / `pickup_dropoff_locations` / `destination_type` /
  `extension_behaviour_auto` (Transport), `gender_restricted_windows` /
  `preferred_caretaker_gender` (Spa), `consumption_type` (everything except Stay).
- **`physical_dimension`** is absent on Room Service and Transport.
- **Transport sends no `publish_end_datetime`** — an omitted key is "not set", not an
  error.
- **Config key ids differ per tenant** — tenant 86 uses the `70xx`/`71xx` block, tenant 88
  the `72xx`/`73xx` block, for the *same* `config_key`. Never hardcode a `config_key_id`;
  always resolve it from `/hms_config_keys_catalog` for the tenant being seeded.
:::

---

## After this endpoint

Individual services are bookable. [Packages](./05-packages.md) bundle several into one sellable unit.
