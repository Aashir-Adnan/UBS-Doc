---
title: "5 · Packages"
sidebar_position: 5
---

# 5 · Packages

`/api/custom/packages` — several services bundled and sold as one.

A package is a wrapper: it owns its own name, media, pricing and config, and references the
services that make it up. It never owns delivery units — those belong to the services inside it.

| Method | Operation | Permission |
|---|---|---|
| `GET` | List | `list_packages` |
| `GET ?id=` | View | `view_packages` |
| `POST` | Add | `add_packages` |
| `PUT` | Update | `update_packages` |
| `DELETE` | Delete | `delete_packages` |

Tenant ownership is enforced on top of the permission on Update and Delete. All operations accept
`language_code` (defaults to `en`); List defaults to `page_size` 10.

:::note Packages never touch delivery units
A delivery-unit anchor points at a **service**, never a package. Packages therefore assign no units,
and there is no capacity guard here. Unit assignment is a
[services-only feature](./04-services.md). If a unit looks stale after a package edit, check the
linked services — this endpoint did not write it.
:::

:::info Read chapter 4 first
The config machinery is shared. [How the admin panel encodes a config
value](./04-services.md#encoding-a-config-value--the-parsers-rules), the `is_input`
derivation, the empty-value rules, the update diff and the attachment upload flow are
documented once, in [Services](./04-services.md), and apply here **unchanged**.

This chapter covers only what is package-specific: a different catalog scope, a
composition instead of delivery units, a `base_price` that derives from that composition,
the `add_ons` pricing projection, and the extra-nights configs.
:::

---

## The authoring cycle — what differs from a service

```
BOOT
  GET  /catalogs                          → catalogId  (the row whose key is "package")
  GET  /custom/services                   → the option source for packageServices[]
  GET  /crud/service/categories           → each option's category (the Stay rule)
  GET  /custom/packages                   → the listing

FIRST MODAL OPEN
  GET  /hms_config_keys_catalog           → rows whose targetTable includes "packages"
  GET  /hmsconfig/possiblevalues/crud     → option ids  (see the note on scoping below)
  GET  /config/constraints
  GET  /crud/currencies
  GET  /crud/pricing/rules
  GET  /custom/service_location_facets     (fetched, unused by packages)

WHILE FILLING
  GET  /guest/hotel-services?hotelId=     → add_ons option list          ← package-only
  GET  /custom/region/countries           → allowed_regions
  GET  /custom/pricing/rules?version=1.0  → pricing_rules / tax_profile multiselects

ON SAVE
  GET  /get/file/url/local?step=1  +  POST <uploadUrl>   → media ids
  POST /custom/packages
```

Three calls a service makes that a package does **not**: `POST /custom/delivery/units?step=2`,
`POST /consolidate-all-possible-values`, and the category-scoped catalog filter. A package
has no `service_unit` picker, so there are no units to consolidate against — which is
exactly why a package's `duration` is always the plain-number branch
(`is_input: 1`, `"config_value": [2]`) rather than a possible-value id.

One call a package makes that a service does not: `GET /guest/hotel-services`.

### `GET /guest/hotel-services?hotelId=<tenant>` — the `add_ons` option source

```
GET /guest/hotel-services?hotelId=88
```

Encrypted with the platform key only — **no access-token layer** — because it is the
public guest endpoint. The response list is read from the first of `res.return`,
`res.payload`, `res`, or `root.items`.

| | |
|---|---|
| **Why the guest endpoint** | `add_ons` prices services a guest attaches **at booking time**, so the options must be exactly what a guest can reach. `/custom/services` is the tenant-side authoring list and includes records a guest never sees. |
| **Which hotel** | the acting tenant — `userSelectedRole.tenant_id`. The Studio has no tenant picker. A platform-wide leg (`tenant_id === "all"`) addresses no hotel: nothing is fetched. |
| **Caching** | module-level, keyed by hotel id, 5-minute TTL, one in-flight request shared. Fetched **once per schema form**, not once per entry. |
| **Stored value** | the service `id`, as a number. |

:::warning An `add_ons` service id is never pruned
Unlike `services_as_amenities` (which drops an id the catalog no longer offers), a saved
`add_on_service` id that is not in the guest list is **kept**, rendered as
`#<id> — unavailable`, stays selected and round-trips. Silently dropping it would delete a
pricing rule nobody touched. A seeded id pointing at a non-guest-visible service therefore
persists — it just cannot be re-picked.
:::

`add_on_service` is also **unique across entries**: at most one entry per service. The
widget hides already-used services, and the save gate rejects a duplicate written any
other way — including by a seeder.

### `GET /custom/services` — the composition option source

The listing already fetched at boot is what the `packageServices` dropdown offers. Each
option is stamped with its `categoryId` and `categoryLabel` (joined via
`/crud/service/categories`), which is what makes the Stay rule and the
category-grouped dropdown possible.

Two rules ride on it:

- **`serviceId` is unique across composition rows** — a picked service is removed from the
  other rows' option lists.
- **At least one row must be a Stay-category service** — see
  [the Stay rule](#package-composition--the-stay-rule).

---

## POST · Add

```
POST /api/custom/packages
```

```json
{
    "catalogId": 2,
    "actionPerformerURDD": 643,
    "packageName": { "en": "Test Pkg", "ar": "عبوة الاختبار" },
    "packageDescription": { "en": "abc", "ar": "abc" },
    "packageStatus": "active",
    "packageType": "predefined",
    "packagePricing": [
        { "price": 100, "currencyId": 4, "delta": "+", "value": null, "type": "flat",
          "validFrom": null, "validTo": null, "minQuantity": null, "maxQuantity": null,
          "customerSegment": "regular", "recurrence": "once", "dayOfWeek": null }
    ],
    "packageServices": [
        { "serviceId": 439, "isConsumable": 1, "isMandatory": 1, "quantity": "1", "displayOrder": null },
        { "serviceId": 468, "isConsumable": 1, "isMandatory": 1, "quantity": "1", "displayOrder": null }
    ],
    "configs": [
        { "config_key_id": 7295, "config_key": "visibility", "operator": "=", "config_value": [23852], "is_input": 0 },
        { "config_key_id": 7327, "config_key": "is_featured", "operator": "=", "config_value": [{ "en": "1", "ar": "1" }], "is_input": 1 },
        { "config_key_id": 7293, "config_key": "media", "operator": "=", "config_value": [1481], "is_input": 1 },
        { "config_key_id": 7324, "config_key": "consumption_type", "operator": "=", "config_value": [23897], "is_input": 0 },
        { "config_key_id": 7299, "config_key": "publish_start_datetime", "operator": "=", "config_value": ["2026-09-02 16:39:00"], "is_input": 1 },
        { "config_key_id": 7296, "config_key": "advance_booking_min_days", "operator": "=", "config_value": [0], "is_input": 1 },
        { "config_key_id": 7297, "config_key": "advance_booking_max_days", "operator": "=", "config_value": [30], "is_input": 1 },
        { "config_key_id": 7309, "config_key": "allowed_regions", "operator": "=", "config_value": [{ "1": [1,2,3,4,5,6,7,8,9,10,11,12,13,14], "2": [15,16,17,18,19,20,21,22], "3": [23,24,25,26,27,28,29,30,31,32,33], "4": [34,35,36,37,38,39,40,41], "5": [42,43,44,45,46], "6": [47,48,49,50,51,52,53], "7": [54,55,56,57,58,59,60,61,62,63,64,65,66,67,68], "8": [69,70,71,72,73,74,75,76,77], "9": [78,79,80,81,82,83,84,85,86,87,88,89,90,91,92,93,94,95], "10": [96,97,98,99,100], "11": [101,102,103,104,105,106,107,108,109,110,111,112,113,114,115,116,117,118,119,120,121,122,123,124,125,126,127,128,129,130,131,132,133,134,135,136,137,138,139,140,141,142,143,144,145,146,147], "12": [148,149,150], "13": [151,152,153,154,155,156,157], "14": [158,159,160,161,162,163,164,165,166,167,168,169,170,171], "15": [172,173,174,175,176,177,178,179,180,181,182,183], "16": [184,185,186,187,188,189,190,191,192,193,194,195,196,197] }], "is_input": 1 },
        { "config_key_id": 7337, "config_key": "duration_unit", "operator": "=", "config_value": [24102], "is_input": 0 },
        { "config_key_id": 7349, "config_key": "duration", "operator": "=", "config_value": [2], "is_input": 1 },
        { "config_key_id": 7372, "config_key": "min_guests_age", "operator": "=", "config_value": [0], "is_input": 1 },
        { "config_key_id": 7373, "config_key": "max_guests_age", "operator": "=", "config_value": [0], "is_input": 1 },
        { "config_key_id": 7302, "config_key": "min_persons_per_booking", "operator": "=", "config_value": [1], "is_input": 1 },
        { "config_key_id": 7303, "config_key": "max_persons_per_booking", "operator": "=", "config_value": [10], "is_input": 1 },
        { "config_key_id": 7364, "config_key": "max_adults", "operator": "=", "config_value": [1], "is_input": 1 },
        { "config_key_id": 8089, "config_key": "additional_package_nights_allowed", "operator": "=", "config_value": [{ "en": "1", "ar": "1" }], "is_input": 1 },
        { "config_key_id": 8091, "config_key": "max_additional_package_nights", "operator": "=", "config_value": [2], "is_input": 1 },
        { "config_key_id": 7363, "config_key": "keyword_tags", "operator": "=", "config_value": [24155,24157], "is_input": 0 },
        { "config_key_id": 7336, "config_key": "amenities_tags", "operator": "=", "config_value": [23970,23966], "is_input": 0 },
        { "config_key_id": 7312, "config_key": "base_price", "operator": "=", "config_value": [100], "is_input": 1 },
        { "config_key_id": 7329, "config_key": "base_currency", "operator": "=", "config_value": [4], "is_input": 1 },
        { "config_key_id": 8095, "config_key": "additional_package_nights_price_discount_type", "operator": "=", "config_value": [28130], "is_input": 0 },
        { "config_key_id": 8093, "config_key": "additional_package_nights_price_discount_value", "operator": "=", "config_value": [10], "is_input": 1 },
        { "config_key_id": 8109, "config_key": "add_ons", "operator": "=", "config_value": [{ "add_on_service": 466, "discount_pct": 10 }], "is_input": 1 }
    ],
    "userId": 1,
    "tenantId": 88
}
```

**Success — 200**

```json
{
  "success": true,
  "data": { "insertId": 34, "package_id": 34 },
  "meta": { "message": "Package created.", "status": 200, "priority": 1 }
}
```

:::note Add is atomic — a failed create leaves no orphan
The `packages` row commits first, then **every** side-effect (translations, attachments, pricing,
bundled services, configs) runs inside **one transaction on a single held connection**. If any step
throws, all side-effects roll back **and** the just-created `packages` row is compensating-deleted.
You never get a half-built package.
:::

### Root keys that have no form field behind them

| Key | Source |
|---|---|
| `catalogId` | the `/catalogs` row whose parsed `catalog_catalogKey.key` is `"package"` — `2` in the sample |
| `packageType` | **always `"predefined"`.** The field was removed from the form; a stable value is still shipped on every create and edit so the wire contract is unchanged. Do not seed any other value. |
| `actionPerformerURDD` | the acting user's URDD; also the default `created_by` for `configs[]` entries |
| `packagePricing` / `packageServices` | lifted out of `configs[]` — see below |

Note the package payload's `configs[]` entries carry **no `created_by`** (unlike services);
the backend defaults them from `actionPerformerURDD`.

### `packageServices` field meanings

| Field | Meaning |
|---|---|
| `serviceId` | the service being bundled — must belong to this tenant |
| `quantity` | how many of it the package includes |
| `isMandatory` | `1` = always included; `0` = the guest may opt out |
| `isConsumable` | `1` = drawn down as it is used (e.g. 1 dinner of 3) |
| `consumptionLimit` | cap when consumable |
| `priceOverride` | overrides the service's own price inside this package; `null` keeps it |
| `displayOrder` | render order in the package detail screen |

`consumptionLimit` and `priceOverride` are still accepted by the wire but **the admin panel
no longer authors either** — the `consumption_limit` field and the per-service
`price_override` were removed. A seeded value survives; nothing in the UI will show or
preserve it on the next save. Discounts belong on the package total, not per bundled
service.

The panel emits these rows through `PACKAGE_SERVICES_SEGMENT_KEY_MAP`:

```
service_id → serviceId   quantity → quantity   is_consumable → isConsumable
is_mandatory → isMandatory   display_order → displayOrder
```

`quantity` ships as the **string** the input produced (`"1"`), which is why the sample
shows it quoted.

### Package composition — the Stay rule

A package must include **at least one Stay-category service**. It is a package-level rule
across all rows, not a per-row constraint: any mix of dining, transport, spa is fine as
long as one Stay is in there, and additional Stays are allowed.

Enforcement in the panel is three-layer — the Next gate, a forward-navigation lock, and a
data-layer net — so a package without a Stay cannot be saved from the UI. **The write
endpoint does not enforce it.** A seeded package with no Stay service is stored, renders,
and blocks its own next edit.

The Stay category id is resolved from the `stay` slug in `/crud/service/categories`; the
composition dropdown groups its options by category using each option's `categoryId`.

### How config values are stored

Identical to [Services](./04-services.md#how-config-values-are-stored): **one entity per row, stored
bare**. Each selected or entered id or object becomes its own `hms_config` row — never an
array-wrapped cell — and the reader re-aggregates the rows back into the array you sent.
`form_inputs` is the one exception that stays a single row. An empty `is_input: 0` selection writes
**no row**, which clear-retires the key. `base_currency` ids resolve against the `currencies` table.

One difference from services worth knowing if you ever port logic between the two: the package read
path resolves `is_input: 0` ids against the shared possible-values table, whereas the service read
path resolves them against category-scoped config rows.

A value in `probation` still resolves here too — selected-value reads filter `status != 'inactive'`
rather than `= 'active'`, and the View catalog offers probation values as options so an admin
editing the package still sees a winding-down value.

:::warning `keyword_tags` / `amenities_tags` chips are **not** shipped under a package context
The backend ships chip possible-values only under each **service-category** context, never
under `"package"`. A package's chip options are therefore derived client-side from the
**categories of the services it composes**: one chip group per composed category, pooled and
re-bucketed by the chips' own `group`.

Consequences for seeding:

- A seeded package's `keyword_tags` / `amenities_tags` ids must come from the
  possible-values rows of a category that package actually composes. An id from an
  uncomposed category is **pruned** the moment the composition is edited.
- The stored shape is unchanged — a flat array of chip PV ids, `is_input: 0` — identical
  to a service's.
- Ids are emitted **Stay-category first**.
:::

### Media

The same two-store model as services: `hms_config` under `config_key: "media"` (the newer contract,
consumed by guest reads) mirrored into `dynamic_attachments` (what View and List hydrate from).
**`media` present** is an authoritative full replace and an empty set clears the links; **`media`
absent** leaves them untouched. The legacy `packageAttachmentIds` array still works, but the
media-config mirror runs after it and wins — do not send images in both places or the `media` rows
are double-written.

### Errors

| Status | `scc` | `error.details` | Cause |
|---|---|---|---|
| 400 | `E10` | `Package Name is required` | missing required field |
| 403 | `E41` | `You do not have permission to access this resource.` | actor lacks `add_packages` |
| 403 | `E31` | `Record belongs to another tenant` | a `serviceId` is not this tenant's |
| 404 | `E50` | `Service not found` | a `serviceId` does not exist |

---

## Price calculation

### `base_price` defaults to the composition sum, then is freely editable

The composition sum is the **default**, not a cap. The admin may set `base_price` above or
below it; the old ceiling clamp was removed.

- **never touched** → `base_price` tracks the composition sum live as the composition changes;
- **deliberately set** → kept exactly as typed, above or below the sum. It is not clamped
  down when the sum drops; clearing the field makes the package track the sum again.

**The composition sum** (`sumPackageCompositionPrice`) is the **plain sum of each row's
unit price** — the selected service's own price:

```
sum = Σ  row.service_price      (falling back to the picked service option's `price`)
```

`quantity` and `is_consumable` are inventory facts and do **not** multiply it. There is no
per-service discount. There is **no tax** anywhere in this calculation — tax computation
was removed entirely, and a catalog-shipped `tax_profile` picker renders but does not feed
`base_price`. The backend stores and returns `base_price` verbatim.

A "Services total" badge next to the Base Price label always shows the untouched
composition total as a reference, so the admin can see it even after typing a custom base.

### The pricing rows mirror `base_price` and `base_currency`

Exactly as on a service:

```
packagePricing[i].price      ← base_price      (every row, on every save)
packagePricing[i].currencyId ← base_currency   (every row, on every save)
```

`price` is a `readonly_mirror` sub-field, not an independently authored number. In the
sample payload `base_price: [100]` and `base_currency: [4]` are why the single pricing row
reads `price: 100, currencyId: 4`. **A seeded row whose `price` disagrees with its
`base_price` config will be rewritten to the config's value on the first admin save.**

At least one pricing row is required, and `price` is required within it (the rule's
`value` is not).

Row semantics — `delta` / `value` / `type` / `validFrom` / `validTo` / `minQuantity` /
`maxQuantity` / `customerSegment` / `region` / `dayOfWeek` / `recurrence` /
`pricingRuleId` — are identical to
[the services table](./04-services.md#what-a-pricing-row-means). Row nulls are real SQL
nulls; the `conditions` JSON blob is the one field that keeps the empty-string treatment.

---

## `add_ons` — add-on services priced inside the package

`packageServices` says what the package **contains**. `add_ons` says what a guest may **attach at
booking time** — after the package is already booked — and at what discount.

It is a multi-value config, so each entry is stored as its own bare row:

```json
{ "add_on_service": 378, "discount_pct": 20 }
```

Its schema is a repeatable `*_form` (`add_ons_form`, `is_multi_value: 1`, packages only):

```jsonc
{ "fields": [
  { "key": "add_on_service", "type": "guest_hotel_services_dropdown",
    "label": { "en": "Add on Service", "ar": "خدمة إضافية" }, "required": true },
  { "key": "discount_pct", "type": "number", "min": 0, "max": 100,
    "label": { "en": "Discount %", "ar": "نسبة الخصم" }, "required": true }
] }
```

So the wire value is an **array of plain objects under `is_input: 1`**, and the backend
explodes it to one `hms_config` row per entry.

A config row alone is not enough, because prices are read from the pricing table. So on **both Add
and Update**, every `add_ons` entry is projected into a **package-scoped pricing row** for that
service — a row that already models *"this price applies only inside this package"*. Readers need no
new join.

| Column | Value |
|---|---|
| base table | `services` |
| record | the entry's `add_on_service` |
| package | the package being created or updated |
| `price` | the service's standalone list price, **undiscounted** |
| `currency_id` | the package's currency |
| `delta` / `value` / `type` | `'-'` / `discount_pct` / `'percentage'` |
| `customer_segment` | `regular` |
| `recurrence` | `once` |

So `{ "add_on_service": 378, "discount_pct": 20 }` on a package in currency `4`, where service 378
lists at `35.0000`, writes `price = 35.0000, delta = '-', value = 20.00, type = 'percentage'`.
**The reader applies the discount**: `35.0000 - 20% = 28.0000`.

:::info `price` is the price *before* the discount
The discount is not multiplied in. It lives in `delta` / `value` / `type` — the same shape every
other discount row in this table uses — so a reader applies it the one way it always does, instead
of special-casing these rows.

It also keeps the row honest over time: `price` stays a faithful snapshot of what the service listed
at when the package was configured, and the discount stays a separate, editable fact. Changing
`discount_pct` later rewrites `value` and leaves `price` alone. A pre-multiplied number would
collapse the two and lose which was which.
:::

### Reconcile semantics

- `price` is copied from the service's **standalone** list price and stored as-is. **A service with
  no standalone price is skipped**, not written at `0` — which would read as "this add-on is free".
- `currency_id` comes from the package's own active price row, falling back to the service's
  currency when the package has no price yet.
- **One row per (package, service).** Re-sending the same service **updates in place**; listing a
  service twice in one payload keeps the last entry.
- Removing an add-on **retires** its row, never deletes it, so a booking that referenced that price
  keeps a readable history.
- `discount_pct` is clamped to `0..100`. A missing or non-numeric value is treated as `0` — list
  price — rather than dropping the row, since the admin did choose the service.

:::warning Omitting `add_ons` and sending an empty `add_ons` are different
A payload that **does not mention** `add_ons` leaves existing add-on rows untouched — so an Update
that only changes the package name cannot wipe its add-on pricing. Sending an **empty** list clears
them.
:::

:::info These rows are invisible to the services endpoint
Package-scoped add-on prices belong to this endpoint. The
[services endpoint](./04-services.md#pricing-ownership--this-endpoint-owns-only-unscoped-rows)
scopes every pricing query to unscoped rows precisely so a service Update cannot retire them, and so
a discounted in-package price never masquerades as the service's list price.
:::

:::note Seeding `add_ons`
Both halves must be written together, and the panel writes only the config half — the
pricing projection is the backend's job on Add/Update. A seeder that writes the
`hms_config` rows directly, bypassing the endpoint, must also write the package-scoped
pricing rows itself, or the add-on will show in the admin form and be un-priced at booking
time. Prefer POSTing the payload.

Also: `add_on_service` must be a service the **guest catalog** returns for this hotel, and
each service may appear at most once (`unique` across entries — enforced by the save gate,
not by the write endpoint).
:::

---

## Extra nights — the three configs and the math behind them

A package covers a fixed block of nights (`duration`). It used to be sellable only in
whole multiples of that block. Four configs now let the **last** block run over:

| `config_key` | Type | Wire shape | Meaning |
|---|---|---|---|
| `duration` | number (no options → plain input) | `[2]`, `is_input: 1` | nights in one block |
| `additional_package_nights_allowed` | checkbox | `[{ "en": "1", "ar": "1" }]`, `is_input: 1` | the feature switch |
| `max_additional_package_nights` | number | `[2]`, `is_input: 1` | extra nights past the last whole block |
| `additional_package_nights_price_discount_type` | dropdown | `[28130]`, `is_input: 0` | a possible-value id resolving to `percentage` or `flat` |
| `additional_package_nights_price_discount_value` | number | `[10]`, `is_input: 1` | the magnitude |

:::warning `allowed` is truthy on **any positive number**
The key briefly shipped as a number spinner, so a row written in that window holds a night
*count* (`"3"`) where a flag was meant. The backend enforces and prices those rows as ON.
Seed it as the checkbox shape (`[{en:"1",ar:"1"}]`) — but be aware a legacy `[3]` is read
as enabled, not as "3".
:::

:::warning `discount_type` is a possible-value id, not the word
`28130` is an `hmsConfigPossibleValues_id` whose parsed `slug`/`key` is `percentage` or
`flat`. The reader resolves it. An absent or empty type defaults to `percentage`. Seeding
the literal string `"percentage"` under `is_input: 0` writes a reference the reader cannot
resolve.
:::

### How a stay is split — fill-extra-first

Authoritative implementation: `backend/Src/HelperFunctions/Guest/v2/catalogPricing.js` →
`validateExtraNights`.

```
periods = max(1, ceil((N - maxExtra) / block))
extra   = N - periods * block
valid  ⇔  0 <= extra <= maxExtra
```

**Not `extra = N % block`.** The two agree on *validity* and disagree on the *split* — and
therefore on the price — the moment the allowance reaches the block length. A 2-night
package at 500, 50 flat discount, 2 extra allowed, booked for 4 nights: the remainder rule
sees `4 % 2 === 0`, charges two full periods, quotes 1,000. Fill-extra-first charges one
period plus two discounted nights: 900. **The backend does the latter.**

A stay with no legal decomposition is rejected (400); the figures returned alongside it are
whole blocks, so a rejected stay is never quoted below what it would cost.

### What the extra nights cost

`computeBookingPricing`:

```
basePerNight     = basePrice / duration
discountedNight  = type === 'flat'
                     ? max(0, basePerNight - discountValue)
                     : max(0, basePerNight * (1 - discountValue / 100))
extraSubtotal    = round(discountedNight * extraNights * rooms * 100) / 100
subtotal         = basePrice * (fullPeriods * rooms) + extraSubtotal
```

The **subtotal** is rounded to 2dp, not the per-night rate — round the rate and the quote
drifts from the charge.

:::danger Known backend inconsistency in the room multiplier
`computeBookingPricing` multiplies the extra-night charge by the room count, and the edit
and stage paths pass it — but **`createPackageBooking` does not**, so it defaults to `1`.
A *new* booking is therefore charged its extra nights once however many parallel packages
it holds, and creating then editing the same stay changes its price. Quote with `rooms = 1`
to match what creation charges today; switch to the real count once creation is fixed.
:::

The frontend mirror of all of the above, with tests including a full parity sweep against
the backend function, is
`frontend/src/root/Pages/General/MoonlitPage/booking-flow/packageNights.js`.

---

## GET · View

```
GET /api/custom/packages?id=34&language_code=en
```

Returns the package with media as served URLs, its pricing rows, its services hydrated, its applied
configs, and `hms_config_keys_catalog` for the editor screen.

```json
{
  "success": true,
  "data": {
    "id": 34,
    "packageId": 34,
    "packageName": { "en": "Honeymoon Getaway", "ar": "عطلة شهر العسل" },
    "packageType": "stay",
    "packageStatus": "active",
    "packagePrice": "1500.0000",
    "media": [
      { "attachment_id": 201, "attachment_link": "/api/upload/serve?encryptedRequest=U2FsdGVkX1..." }
    ],
    "packageServices": [
      { "package_service_id": 55, "service_id": 13, "quantity": 1, "is_mandatory": 1, "display_order": 1 }
    ],
    "packagePricing": [ { "pricing_id": 88, "price": "1500.0000", "currency_id": 1, "type": "flat" } ],
    "configs": [ { "config_key": "base_price", "is_input": 1, "config_value": [{ "en": "1500", "ar": "١٥٠٠" }] } ],
    "hms_config_keys_catalog": { "en": [], "ar": [] }
  },
  "meta": { "message": "Package fetched.", "status": 200, "priority": 0 }
}
```

`packagePrice` is the first active pricing row — `null` if the package has none.
`hms_config_keys_catalog` is **View-only** — building it per row in List would N+1 every row's
translations.

**`package_service_id` is the PK you need for an Update** — not `service_id`. See the
Update section.

## GET · List

```
GET /api/custom/packages?page_no=1&page_size=10&filter_columns_and=packageType&filter_values_and=stay
```

Same shape as View minus the catalog, with `table_count` on each row. Filter keys must exist in the
object's `colMapper` (`packageName`, `packageType`, `tenantId`, `packageStatus`, …) or the query
fails with `ER_BAD_FIELD_ERROR`.

:::warning Some filter keys hit an ambiguous column
The mapper's values are **not** qualified with the table name, and the List query joins `tenants` —
which has its own `status`, `created_by`, `created_at` and so on. Filtering on any of those keys
produces `ER_NON_UNIQ_ERROR` rather than a result. Filtering on package-specific keys is safe.
:::

---

## PUT · Update

```
PUT /api/custom/packages?id=34
```

Mirrors Add, with three differences that are easy to get wrong:

:::danger An empty array deletes everything
`"packagePricing": []` deletes **every** active pricing row. `"packageServices": []` does the same
to the bundled services — the flat path soft-deletes first, then re-inserts what was sent.

To keep rows, send them back **with their ids**: `pricingId` for pricing, `packageServiceId` (the
PK — *not* `serviceId`) for services.
:::

:::warning `configs` changes shape on Update
Add takes a **flat array**. Update expects a **diff object**:

```json
{
  "configs": {
    "added":   [ { "config_key_id": 119, "config_key": "base_currency", "is_input": 1, "config_value": [1] } ],
    "updated": [ { "config_key_id": 67, "config_key": "base_price", "is_input": 1, "config_value": [{ "en": "1600", "ar": "١٦٠٠" }] } ],
    "deleted": [ 318 ]
  }
}
```

`deleted` takes `hms_config.id` values. Sending a flat array on Update is silently a **no-op** — a
guard skips anything that is not a non-array object. Nothing errors; your config edit simply does
not happen.
:::

The diff itself is computed exactly as on services — keyed by `config_key_id`, unchanged
values emitted nowhere, a cleared-but-still-applicable config routed to `updated` with an
`is_input`-branched empty value (`[]` for `0`, `null` for `1`), and row-per-entry configs
canonicalised before comparison. See
[the services chapter](./04-services.md#how-the-panel-computes-that-diff) for the full
rules.

**`package_pricing` and `package_composition` are excluded from the diff entirely.** They
live at `packagePricing[]` / `packageServices[]`, and indexing them as configs would queue
a spurious delete on every save. `add_ons`, by contrast, **is** an ordinary config and does
go through the diff — as a repeatable schema form, which is why it needs the canonicalising
comparison (without it, every save would rewrite add-on rows nobody touched).

`packagePricing` is an **id-aware diff**: send the complete desired state as a flat array, and a row
**with** `pricingId` is updated, a row **without** one is inserted, and anything active that is not
in the list is retired. `packageServices` sent as a flat array is a full replace instead. Both also
still accept the `{ added, updated, deleted }` shape.

Side-effects run in this order: the `packages` row, translations, attachments (legacy array sweep,
then the `media` mirror), pricing, bundled services, configs.

**Status transitions** are gated when moving away from `active`. If the package has live bookings it
is held in `probation` regardless of what was asked for; if it does not, the requested status
applies verbatim. Every other edited field still saves either way. Transitions that do not start
from `active`, and any change **to** `active`, pass through untouched. To reactivate a retired
package, send `packageStatus` `"archived"` → `"active"`.

---

## DELETE

```
DELETE /api/custom/packages?id=34
```

```json
{
  "success": true,
  "resource": "package",
  "id": 34,
  "status_set": "archived",
  "deferred": false,
  "dependents": [],
  "message": "Package archived."
}
```

Or, with live bookings:

```json
{
  "success": true,
  "resource": "package",
  "id": 34,
  "status_set": "probation",
  "deferred": true,
  "dependents": [ { "check": "active_bookings", "count": 1, "sample_ids": [9007] } ],
  "message": "Package moved to probation — 1 active booking still references it."
}
```

:::info Only the package's own bookings hold it
The probation probe looks at bookings **of the package itself**. A bundled service being booked
separately does **not** hold the package — the services are independent entities, and they are never
deleted along with it.
:::

:::note A deleted package is still visible to admins
Delete sets `probation` or `archived`, **never `inactive`** — and admin List/View filter on
`status != 'inactive'`, so the row stays on screen in its retired state. Its side tables stay live
until the finalizer cron finalizes it, at which point the bundled-service membership and the pricing
cascade to `inactive`. The `services` rows themselves are never touched.

A second `DELETE` on an already-archived package finalizes it the rest of the way to `inactive`, at
which point it drops out of List and View. So the full path is: `active` → *DELETE* → `archived` →
*DELETE again* → `inactive`.

The practical consequence: **Delete + re-Add with the same name does not give you a clean slate.**
Reactivate the existing row instead.
:::

---

## Seeding recipe

Packages depend on services, so seed services first.

1. **Resolve `catalogId`** from `/catalogs` where the parsed key is `"package"`.
2. **Load the config catalog** `/hms_config_keys_catalog`, keeping rows whose
   `targetTable` includes `packages`. Index `configKey → config_key_id` **per tenant** —
   the ids differ between tenants for the same key.
3. **Load `/hmsconfig/possiblevalues/crud`** and index by `configId` for every `is_input: 0`
   value you intend to write, including
   `additional_package_nights_price_discount_type`.
4. **Choose the composition** from already-seeded services. At least one must be in the
   Stay category. `serviceId` must be unique across rows.
5. **Compute `base_price`**: either the plain sum of the composed services' prices (the
   panel's default) or a deliberate value. Set `base_currency` alongside it.
6. **Pick the chip ids** for `keyword_tags` / `amenities_tags` from the possible-values of
   the **categories the composition actually contains**, Stay first.
7. **Upload media** (two-step, see chapter 4) and reference the ids in the `media` config.
8. **Build `packagePricing`** with `price` = `base_price` and `currencyId` =
   `base_currency` on every row.
9. **Extra nights, if any**: write all four configs consistently — checkbox shape for
   `allowed`, a raw number for `max` and `discount_value`, a possible-value id for
   `discount_type` — and make sure `duration` is set, since the split is meaningless
   without a block length.
10. **`add_ons`**: each `add_on_service` must be in `GET /guest/hotel-services?hotelId=` for
    this tenant, must appear at most once, and its service must have a standalone price
    (one without is skipped by the projection).
11. **`packageType`** is always `"predefined"`.
12. **POST**, then re-`GET ?id=` and diff the returned `configs[]`, `packagePricing[]` and
    `packageServices[]` against what you sent. Also check that the package-scoped pricing
    rows for the `add_ons` services exist. A key that comes back missing or reshaped is one
    whose encoding is wrong.

---

## Flow complete

The tenant now has a map, bookable units, services and packages. Guests can browse and book it.
