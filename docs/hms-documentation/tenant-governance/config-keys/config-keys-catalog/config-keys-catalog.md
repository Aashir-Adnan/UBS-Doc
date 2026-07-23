# Config Keys Catalog

The complete inventory of system-tenant `hms_config_keys` — every active configuration key the framework defines, grouped by its admin-UI category.

This is the **data inventory**. For *how* keys are created, toggled, and given values, see [config-keys.md](../config-keys.md) — read it first if you haven't, since the terms below (`applies_to`, `enabled_for`, `possible_values`, value types) are explained there.

**Scope:** the SaaS-global key set (`tenant_id = "all"`, owned by the SaaS Admin). Per-tenant clones are not enumerated here — see [Tenant clones](#tenant-clones).

---

## How to read this catalog

Each key in §Catalog is one row of `hms_config_keys`. To understand a key fully you look at it across a few tables. Worked example — key **67 `base_price`**:

1. **The definition** (this catalog / `hms_config_keys`): target `svc,pkg`, phase `booking`, `applies_to = *` (usable by any category), value type `decimal`. So: a price field, rendered as a decimal input, available everywhere.
2. **Where it's switched on** (`enabled_for` on the key): e.g. `{"1":1,"2":1,"package":1}` → on for Stay, Dining, and Packages.
3. **The allowed option values** (`hms_config_possible_values`, scope-tagged): the preset options an admin defined, e.g. `{"en":"100",…}`. Service options are tagged `scope_constraint_name='service_categories'` + `scope_constraint_value=<category>`, package options `='packages'`; both ordered by `config_value_num`. Simple `{en,ar}` labels store bare `en` + `ar` in `translated_entries` (§8.2). See [config-storage-model.md](../config-storage-model/config-storage-model.md).

> The old `hms_config_keys.possible_values` **pointer map** (`{"1":[3066],"package":[104]}`) is **retired** — no longer read; option order/membership come from the scope tag + `config_value_num`. The column is frozen pending a drop.

So a single "config key" is a definition here, a set of on/off flags, and a set of scope-tagged option rows in `hms_config_possible_values` — all tied together by `config_key_id`.

---

## The Catalog API

A **read-only** API to browse these config-key definitions at runtime — their scope, type, category, and (on View) full detail including `possible_values` and `description`. Two operations, both `GET`. Every response is **dual-locale**: an `en` and `ar` view of the same rows side by side, with translations resolved via `translated_entries` (requested locale → seeded `en` → live column).

> This is the **browse / read** API. To *toggle* a key per scope or *manage its values*, use the separate `/api/hms_config_keys/enabled_for` CRUD documented in [config-keys.md](../config-keys.md).

**Base route:** `GET /api/hms_config_keys_catalog` — List and View only (`Add`/`Update`/`Delete` are not exposed).

### Authentication

Requires a valid **accessToken** JWT plus the AES-encrypted request envelope. Requests and responses are encrypted on **both** the platform key and the accessToken (`encryptionKey = accessToken + platform.encryption_key`).

There is **no permission gate** (`permission: null`, `providedPermissions: false`). Access is governed by valid auth plus tenancy scoping (see [Tenancy](#tenancy-scoping)). The acting `actionPerformerURDD` rides in the encrypted request header on every request (GETs included); a query param is an explicit override.

| Header | Required | Description |
|---|---|---|
| `accesstoken` | Yes | JWT access token. |
| `encryptedrequest` | Yes | AES-encrypted envelope carrying `PlatformName`, `PlatformVersion`. |

### List — all config keys

```
GET /api/hms_config_keys_catalog
```

**Request Payload** (query params — all optional):

| Field | Type | Required | Description |
|---|---|---|---|
| `language_code` | `string` | No | Locale for translated columns (e.g. `en`, `ar`). |
| `actionPerformerURDD` | `number` | No | Acting URDD — explicit override; normally resolved from the encrypted header. |
| `page` | `number` | No | Page number (default `1`). |
| `pageSize` | `number` | No | Results per page (default `50`). |

#### Example (decrypted payload)

```json
{ "language_code": "en", "page": 1, "pageSize": 50 }
```

#### Response — Success (200)

Dual-locale; each locale holds an **array** of rows:

```json
{ "en": [ { "...row" } ], "ar": [ { "...row" } ] }
```

Row fields (each `hms_config_keys` column, translated where applicable):

| Field | Description |
|---|---|
| `table_count` | Total matching records (`COUNT(*) OVER ()`). |
| `hmsConfigKeys_id` / `id` | Primary key (`config_key_id`), aliased twice. |
| `hmsConfigKeys_configKey` | Key slug (e.g. `operating_hours`). |
| `hmsConfigKeys_configName` | Display name (translated). |
| `hmsConfigKeys_targetTable` | Target table (translated). |
| `hmsConfigKeys_scopeTypeId` | FK → `hms_scope_types`. |
| `hmsConfigKeys_categoryId` | FK → `hms_config_categories`. |
| `hmsConfigKeys_phase` | `viewing` / `booking` / `consumption` (translated). |
| `hmsConfigKeys_appliesTo` | Comma-separated service slugs or `all`. |
| `hmsConfigKeys_valueType` | Value/widget type (translated). |
| `hmsConfigKeys_isRequired` / `hmsConfigKeys_isMultiValue` | `1`/`0` flags. |
| `hmsConfigKeys_hasConstraint` | `1` = the applied value is bounded by an external constraint; call `GET /api/config/constraints?config_key_id=<id>` for the bound. `0` = free. Currently `1` only for `max_adults` / `max_children`. See [Config Constraints](../../config-constraints/config-constraints.md). |
| `hmsConfigKeys_possibleValues` | JSON array of allowed values or example shapes (NULL if unconstrained). |
| `hmsConfigKeys_enabledFor` | JSON map of category / `package` / `user` enablement flags. |
| `hmsConfigKeys_groupOrder` | Display ordering hint. |
| `hmsScopeTypes_name` / `hmsScopeTypes_label` | Scope name + label (translated). |
| `hmsConfigCategories_name` / `hmsConfigCategories_label` / `hmsConfigCategories_phase` | Category name, label, phase (translated). |

### View — single config key detail

```
GET /api/hms_config_keys_catalog?id={config_key_id}
```

**Request Payload** (query params):

| Field | Type | Required | Description |
|---|---|---|---|
| `id` | `number` | Yes | `config_key_id` of the key to retrieve. |
| `language_code` | `string` | No | Locale for translated columns. |
| `actionPerformerURDD` | `number` | No | Acting URDD — explicit override. |

#### Example (decrypted payload)

```json
{ "id": 12, "language_code": "en" }
```

#### Response — Success (200)

Dual-locale; each locale holds a **single object** (`null` if not found / not visible to the tenant):

```json
{
  "en": {
    "hmsConfigKeys_id": 12, "id": 12,
    "hmsConfigKeys_configKey": "operating_hours",
    "hmsConfigKeys_configName": "Operating Hours",
    "hmsConfigKeys_targetTable": "services",
    "hmsConfigKeys_phase": "viewing",
    "hmsConfigKeys_appliesTo": "all",
    "hmsConfigKeys_valueType": "json",
    "hmsConfigKeys_possibleValues": [
      { "mon": { "open": "09:00", "close": "22:00" } }
    ],
    "hmsConfigKeys_isRequired": 0,
    "hmsConfigKeys_isMultiValue": 0,
    "hmsConfigKeys_enabledFor": { "1": 1, "2": 0, "package": 1, "user": 1 },
    "hmsConfigKeys_description": "Weekly operating schedule per meal period or shift.",
    "hmsScopeTypes_name": "service", "hmsScopeTypes_label": "Service",
    "hmsConfigCategories_name": "availability", "hmsConfigCategories_label": "Availability"
  },
  "ar": { "...": "same shape, Arabic where translations exist" }
}
```

View returns every List row field (except `table_count`), **plus**: `hmsConfigKeys_description`, `hmsConfigKeys_status`, `hmsConfigKeys_createdAt`, `hmsConfigKeys_updatedAt`, `hmsScopeTypes_scopeTypeId`, `hmsScopeTypes_description`, `hmsConfigCategories_categoryId`, `hmsConfigCategories_description` (all translated where applicable).

### Error Responses

| Status | Message | Condition |
|---|---|---|
| 400 | `E10` invalid headers / decryption failure | The encrypted request envelope is missing or cannot be decrypted. |
| 401 | invalid or expired accessToken | The JWT fails `accessTokenValidator`. |
| 404 | `E50` API object not found | Route resolves to no API object. |
| 500 | `E99` generic middleware error | Unhandled server error. |

Two notable **non-error** responses:

| Status | Body | Condition |
|---|---|---|
| 200 | `{ "en": [], "ar": [] }` | Tenancy on but no acting tenant resolved — the catalog **fails closed** (List). |
| 200 | `{ "en": null, "ar": null }` | View: `id` not found, or the key is not owned by the acting tenant. |

### Tenancy scoping

When `TENANCY_CHECK` is enabled, the catalog is scoped to the acting URDD's tenant. The dual-locale post-process builds its SQL directly and applies the same `created_by` filter as the main resolver:

```sql
hms_config_keys.created_by IN (
  SELECT user_role_designation_department_id
  FROM user_roles_designations_department
  WHERE tenant_id = <acting tenant>
)
```

- **Strict ownership** — a tenant sees only the keys **cloned into its ownership**; there is no `created_by IS NULL` / SaaS-Admin pass-through branch.
- **Globally-seeded keys** (owned by a system-tenant URDD) are visible to the **system tenant** only.
- The joined lookups `hms_scope_types` and `hms_config_categories` are framework-global reference data and are **exempt** from the filter (otherwise the join would empty for non-system tenants).
- **Fail closed** — tenancy on but no actor resolved → SQL suffixed `AND (1 = 0)` → zero rows (List) / `null` (View), never cross-tenant data.
- Tenancy disabled → the filter is a no-op and the full catalog is returned.

#### Service Manager category scope

On top of the tenant filter, when the acting URDD is a **Service Manager** (its RDD designation is a service-category code), the catalog post-process applies the **same per-category predicate the main query resolver appends** — it reuses the resolver's exported `applyServiceManagerScope`, keyed on the catalog's `hms_config_keys` primary table:

```sql
hms_config_keys.applies_to = '*'
  OR (JSON_VALID(hms_config_keys.applies_to)
      AND JSON_CONTAINS(hms_config_keys.applies_to, '<his service_categories.category_id>'))
```

A Service Manager therefore sees only:
- keys that apply to **all** categories (`applies_to = '*'`), and
- keys whose `applies_to` **includes his category** — even if they also apply to other categories (e.g. `[47,"package"]`, `[47,48,…]`).

He does **not** see keys scoped only to *other* categories, nor **package-only keys** (`applies_to = ["package"]` — neither `'*'` nor containing his category id, so he never browses configs that apply to packages alone — consistent with the package surface being hidden from him elsewhere). The predicate is a **no-op** for every other persona (Tenant Admin / Manager, SaaS Admin), and it applies to **both List and View** (a Service Manager Viewing a package-only or other-category key by id gets an empty result). *(Added 2026-06-15.)*

### Database Tables

| Table | Read |
|---|---|
| `hms_config_keys` | The catalog rows (primary; tenancy-scoped). |
| `hms_scope_types` | Scope name/label join (exempt reference data). |
| `hms_config_categories` | Category name/label/phase join (exempt reference data). |
| `translated_entries` | Locale resolution for translated columns. |

> Source: `Src/Apis/GeneratedApis/Default/Hms_config_keys_catalog/` (`API.md`, `Hms_config_keys_catalog.js`, `hmsConfigKeysCatalogDualLocalePostProcess.js`).

---

## The storage tables

`hms_config_keys` is the master registry of *what a config key is*. Its sibling tables hold *the values*:

| Table | Holds | Linked from |
|---|---|---|
| `hms_config_keys` | Registry: name, display name, target table, category, phase, applies-to scopes, enabled-for flags, value type, required/multi flags, description. *(`possible_values` — the old pointer map — is a frozen legacy column.)* | — (authoritative) |
| `hms_config_possible_values` | **All option (possible) values — service AND package**, scope-tagged: `scope_constraint_name='service_categories'` + `scope_constraint_value=<category>` (explicit), `='packages'`, or **SHARED** — Case A `='*'` (every category **and** packages) / Case B `='service_categories'`+value `'*'` (every service category). Value in `config_possible_value`, ordered by `config_value_num`; each read row carries `isKeyWide` (0/1/2). Admin readers fold shared rows into both scopes (edit/delete via `keep_shared` = in-place vs split); guest readers read explicit only. | `config_id` → `hms_config_keys.config_key_id` |
| `translated_entries` | The Arabic side of simple option labels (`en` stored bare on the option row). | `record_id` → `hms_config_possible_values.id` |
| `hms_config` | **Applied** values — what a specific service/package *instance* picked (`base_table='services'`/`'packages'`). Value in `config_value`. Written by the CustomServices/CustomPackages APIs. | `config_key_id` → `hms_config_keys.config_key_id` |
| `hms_config_categories` | The grouping categories that organise keys in the admin UI. | `hms_config_keys.category_id` → `hms_config_categories.category_id` |

> **Storage refactor.** Service option values used to live in `hms_config` (`base_table='service_categories'`) and the `hms_config_keys.possible_values` JSON pointer map tracked which rows belonged to which scope. Both are **retired** — all option values now live in `hms_config_possible_values`, scope-tagged and ordered by `config_value_num`; the pointer map is no longer read. Full detail: [config-storage-model.md](../config-storage-model/config-storage-model.md).

---

## Lookup tables

### Scope types (`scope_type_id`)

| id | name | Meaning |
|---|---|---|
| 1 | `service` | A bookable service record |
| 2 | `location` | A property or branch location |
| 3 | `unit` | A room, table, bay, or other bookable unit |
| 4 | `package` | A bundled multi-service package |
| 5 | `booking` | A top-level booking header |
| 6 | `booking_item` | A single service line within a booking |
| 7 | `membership` | A guest membership record |

Almost all keys are scope `1` (service); package-anchored keys use `4`.

### Service categories (`category_id` — used in `applies_to`, `enabled_for`, and `scope_constraint_value`)

| id | slug | Label (EN) |
|---|---|---|
| 1 | `stay` | Stay |
| 2 | `dining` | Dining |
| 3 | `spa` | Spa |
| 4 | `barber` | Barber |
| 5 | `gym` | Gym |
| 6 | `kids` | Kids Center |
| 7 | `transport` | Transport |
| 8 | `networking` | Networking |
| 9 | `room-service` | Room Service |

> `"package"` in `applies_to` / `enabled_for` is a literal string slot for package-scope flags — **not** a `service_categories` row.

### Config UI categories (`hms_config_categories.category_id` — groups keys in the admin UI)

| id | name | Label | phase | Purpose |
|---|---|---|---|---|
| 1 | `general` | Basics | viewing | Record kind, service type, display name, media |
| 2 | `display` | Availability | viewing | Time windows, calendar, capacity, booking flow |
| 3 | `availability` | Audience | viewing | Region, guest type, access scope, loyalty gates |
| 4 | `pricing` | Pricing Model | booking | Pricing model + base price |
| 5 | `fulfilment` | Taxes and Fees | booking | Tax profiles, service charge |
| 6 | `operations` | Payment | booking | Payment timing, deposit, methods |
| 7 | `cancellation` | Cancellation and Refunds | booking | Cancellation templates, refund rules |
| 8 | `extension` | Extension | consumption | Stay/session extension rules |
| 9 | `consumption` | Consumption Model | consumption | How included services are consumed/reset |
| 10 | `package_composition` | Package Composition | booking | Per-service overrides within a package |
| 11 | `view_for_user` | Viewable for User | booking | Fields the user can input during booking |
| 12 | `user_form` | Guest Display | booking | Configurations visible to guests during booking |
| 13 | `user_form_values` | User Form Values | viewing | Values captured from the guest |
| 14 | `service_details` | Service Details | viewing | Service-specific detail fields |
| 15 | `amenities` | Amenities | viewing | Per-amenity toggles per service category |

### Catalog (`catalog_id` — used by `hms_config.catalog_id`)

| id | key |
|---|---|
| 1 | service |
| 2 | package |

---

## Field glossary

| Column | Type | Meaning |
|---|---|---|
| `config_key_id` | int PK | Surrogate id. |
| `tenant_id` | JSON | `"all"` for SaaS-global rows; `[<tenant_id>]` for clones. |
| `config_key` | slug | Stable machine name (e.g. `base_price`). The same slug may exist in two categories (disambiguate by `category_id`). |
| `config_name` | string | Human display label. |
| `target_table` | csv | Where the value is written: `services`, `packages`, `services,packages`, or `service_categories`. |
| `scope_type_id` | FK | From scope types. |
| `category_id` | FK | From config UI categories — drives the admin UI section. |
| `phase` | enum | `viewing` (admin setup), `booking` (capture time), `consumption` (run-time). |
| `applies_to` | JSON | `*` = all service categories; otherwise an array of category ids plus literal `"package"`. |
| `enabled_for` | JSON | `{ "<scope>": 0\|1 }` on/off map per category + `package`. |
| `value_type` | string | The widget the frontend renders. Option values follow the §8.2 split (simple → bare `en` + `ar` in `translated_entries`; structured → whole object). |
| `possible_values` | JSON | **Legacy** pointer map — frozen, no longer read (see above). |
| `is_required` | 0/1 | Mandatory at write time. |
| `is_multi_value` | 0/1 | `1` = stored as selectable options; `0` = single value / placeholder schema. |
| `has_constraint` | 0/1 | Added `20260722_2` (after `is_multi_value`). `1` = the value is bounded by an external constraint — call `GET /api/config/constraints?config_key_id=<id>` for the bound. `0` = free. Currently `1` only for `max_adults` / `max_children`. See [Config Constraints](../../config-constraints/config-constraints.md). |
| `description` | text | Freeform note or `{ "en": …, "ar": … }` localised label. |
| `status` | enum | `active` / `inactive`. |
| `source_hms_config_key_id` | int | NULL for originals; set on tenant clones. |

### Value types

| Group | Values |
|---|---|
| Native inputs | `text`, `text_area`, `number`, `decimal`, `checkbox`, `email`, `tel`, `date`, `datetime` |
| Selection | `dropdown`, `dropdown_multiselect`, `multi_checkbox`, `region` |
| Special widgets | `attachment`, `cron_job_form`, `gender_restricted_windows_form`, `tax_profile_api_form`, `deposit_form`, `cancellation_form`, `tier_savings_badge_form`, `tier_discount_form`, `overage_rate_form`, `savings_badge_form`, `max_extension_length_label`, `number_spinner`, `mm:dd:hh`, `base_price_label`, `form`, `pricing_rules_api_form`, `keyword_chips` |
| External API | `currencies_api_dropdown`, `delivery-units_api_dropdown` |

### Reused slugs

Two slugs deliberately exist twice — disambiguate by `id` / `category_id`:

| slug | Admin row | Guest-form row |
|---|---|---|
| `service_type` | id 2 (Basics, all categories) | id 171 (Guest Display, Barber `[4]`) |
| `pickup_datetime` | id 46 (admin, deprecated) | id 182 (Guest Display, Transport `[7]`) |

---

## Catalog

**Legend** — **Target:** `svc,pkg` = services,packages · `svc` = services · `pkg` = packages · `svc_cat` = service_categories. **R/M:** required / multi-value (✓ = yes, — = no).

### Basics (category 1)

| id | config_key | Display name | Target | Phase | applies_to | value_type | R/M | Description |
|---|---|---|---|---|---|---|---|---|
| 1 | `record_kind` | Record Kind | svc,pkg | viewing | `*` | dropdown | ✓/— | Whether the record is a standalone service or a bundled package. |
| 2 | `service_type` | Service Type | svc,pkg | viewing | `*` | dropdown | ✓/— | Service delivery model: stay (room-night), slot (appointment), or request (on-demand). Drives which sub-fields render. |
| 3 | `category_tags` | Category Tags | svc,pkg | viewing | `*` | dropdown | —/✓ | Category slug plus multi-select tags from the global taxonomy. |
| 4 | `display_name` | Display Name | svc,pkg | viewing | `*` | text | ✓/— | Localized display name (AR primary + EN required). |
| 5 | `short_description` | Short Description | svc,pkg | viewing | `*` | text_area | —/— | Localized short description shown on listing cards. |
| 6 | `long_description` | Long Description | svc,pkg | viewing | `*` | text_area | —/— | Localized rich-text long description shown on the detail page. |
| 7 | `media` | Media | svc,pkg | viewing | `*` | attachment | —/✓ | Ordered array of media assets (cover + gallery images/videos). |
| 9 | `visibility` | Visibility | svc,pkg | viewing | `*` | dropdown | ✓/— | Record lifecycle / publication state. Options `draft` + `published` — `published` was added by `20260709_2` to every `visibility` key (SaaS-global `"all"` + all clones), which also backfilled a `visibility = published` config for every active hotel/branch service & package that had none (so an unset item reads as *published*, not *draft*). |
| 93 | `consumption_type` | Consumption Type | svc,pkg | consumption | `[2,3,4,5,6,7,8,9,"package"]` | dropdown | —/— | How the service is consumed when bundled or used. |
| 94 | `consumption_reset_cadence` | Consumption Reset Cadence | pkg | consumption | `["package"]` | dropdown | —/— | When included-capped counters reset within the package. |
| 110 | `services_list` | Services List | svc_cat | viewing | `*` | dropdown | —/✓ | The list of service types. |
| 114 | `is_featured` | Is Featured | svc,pkg | viewing | `*` | checkbox | —/— | Marks the record as featured for promoted placement. Default: false. |
| 120 | `deliver_unit` | Delivery Unit | svc,pkg | booking | `*` | delivery-units_api_dropdown | —/— | Unit of measurement for delivery (km, kg, pieces, room…). Sourced from the external delivery-units API. |

### Availability (category 2)

| id | config_key | Display name | Target | Phase | applies_to | value_type | R/M | Description |
|---|---|---|---|---|---|---|---|---|
| 13 | `advance_booking_min_days` | Advance Booking Minimum Days | svc,pkg | viewing | `*` | number | —/— | Minimum days ahead a booking can be made. 0 = same-day allowed. |
| 14 | `advance_booking_max_days` | Advance Booking Maximum Days | svc,pkg | viewing | `*` | number | —/— | Maximum days ahead a booking can be made. |
| 15 | `blackout_dates` | Blackout Dates | svc,pkg | viewing | `*` | cron_job_form | —/✓ | Revenue/marketing blackout windows. Array of `{name,blackout_type,start_date,end_date,frequency,cron_expression,active}`. |
| 16 | `operating_hours` | Operating Hours | svc | viewing | `[2,3,4,5,6,7]` | text_area | —/— | Weekly operating schedule per meal period or shift. |
| 17 | `slot_duration_minutes` | Slot Duration Minutes | svc | viewing | `[2,3,4,5,6]` | dropdown | —/✓ | Allowed slot durations in minutes. |
| 18 | `buffer_between_slots_minutes` | Buffer Between Slots Minutes | svc | viewing | `[2,3,4,6]` | number | —/— | Buffer between consecutive slots for turnaround or cleaning. |
| 19 | `lead_time_hours` | Lead Time Hours | svc | viewing | `[2,3,4]` | number | —/— | Minimum lead time in hours before a slot can be booked. |
| 20 | `lead_time_minutes` | Lead Time Minutes | svc | viewing | `[4]` | number | —/— | Minimum lead time in minutes for barber slot bookings. |
| 21 | `cutoff_time` | Cutoff Time | svc | viewing | `[2,3,4]` | text | —/— | Latest same-day booking cut-off (HH:MM or hours-before-slot). |
| 22 | `return_request_lead_time_minutes` | Return Request Lead Time Minutes | svc | viewing | `[7]` | number | —/— | Minutes a guest must request their car before it arrives. Default: 10. |
| 23 | `modification_cancellation_cutoff_hours` | Modification Cancellation Cutoff Hours | svc | viewing | `[7]` | number | —/— | Hours before pickup within which modifications/cancellations are refused. Default: 2. |
| 24 | `publish_start_datetime` | Publish Start Date Time | svc,pkg | viewing | `*` | datetime | —/— | Datetime from which the card is visible to guests. NULL = always on. |
| 25 | `publish_end_datetime` | Publish End Date Time | svc,pkg | viewing | `*` | datetime | —/— | Datetime after which the service is auto-archived. NULL = always on. |
| 26 | `inventory_treatment_rooms` | Inventory Treatment Rooms | svc | viewing | `[3]` | text_area | —/— | Treatment rooms per zone. JSON `{unisex,women_floor,men_floor,couples_suite}`. |
| 28 | `inventory_capacity_per_age_group` | Inventory Capacity Per Age Group | svc | viewing | `[6]` | text_area | —/— | Max children per age bracket. JSON `{"2-4":N,"5-12":N}`. |
| 29 | `staff_to_child_ratio` | Staff to Child Ratio | svc | viewing | `[6]` | text_area | —/— | Staff-to-child ratio per age bracket. Default 1:4 (2-4), 1:8 (5-12). |
| 30 | `inventory_barber_chairs` | Inventory Barber Chairs | svc | viewing | `[4]` | number | —/— | Total number of barber chairs available. |
| 31 | `inventory_floor_capacity` | Inventory Floor Capacity | svc | viewing | `[5]` | text_area | —/— | Concurrent floor capacity per zone. JSON `{cardio,weights,studio}`. |
| 32 | `inventory_parking_slots` | Inventory Parking Slots | svc | viewing | `[7]` | number | —/— | Total assigned valet parking spots. |
| 33 | `queue_depth_max_orders` | Queue Depth Maximum Orders | svc | viewing | `[9]` | number | —/— | Max concurrently open orders before new requests are queued. |
| 44 | `destination_location_type` | Destination Location Type | svc | booking | `[7]` | dropdown | —/— | Type of destination for a transport trip. Default: hotel. |
| 45 | `schedule_identifier` | Schedule Identifier | svc | booking | `[7]` | text | —/— | External schedule reference (flight_no, train_no, ship_id, route_no). |
| 47 | `passenger_luggage_vehicle_preference` | Passenger Luggage Vehicle Preference | svc | booking | `[7]` | text_area | —/— | Passenger count, luggage count, and vehicle class. JSON `{passengers,luggage,vehicle_class}`. |
| 48 | `weekday_arrival_restriction` | Weekday Arrival Restriction | pkg | booking | `["package"]` | dropdown | —/✓ | Allowed arrival weekdays. NULL = unrestricted. |
| 50 | `staff_routing` | Staff Routing | svc | booking | `[7,9]` | text_area | —/— | Department/pool routing rules. JSON map of category to department. |
| 51 | `acknowledge_sla_minutes` | Acknowledge SLA Minutes | svc | booking | `[9]` | number | —/— | Target minutes for staff to acknowledge a request. Default: 5. |
| 52 | `fulfil_sla_per_category_minutes` | Fulfil SLA Per Category Minutes | svc | booking | `[9]` | text_area | —/— | Fulfilment SLA per category in minutes. JSON `{"fb":30,"linen":15,…}`. |
| 53 | `vehicle_delivery_sla_minutes` | Vehicle Delivery SLA Minutes | svc | booking | `[7]` | number | —/— | Target minutes from return-request to car at forecourt. Default: 10. |
| 54 | `allowed_regions` | Allowed Regions | svc,pkg | viewing | `*` | region | —/✓ | ISO-3166 country codes allowed to book. Empty = all regions. |
| 55 | `adult_age_cutoff` | Adult Age Cutoff | svc | viewing | `*` | number | —/— | Minimum age to be classified as an adult. Default: 18 (spa/gym: 16). |
| 56 | `child_age_brackets` | Child Age Brackets | svc,pkg | viewing | `[6]` | dropdown | —/✓ | Age bracket definitions for child pricing. JSON `{label,min,max,rate_type}`. |
| 57 | `guardian_rule` | Guardian Rule | svc | booking | `[6]` | checkbox | —/— | Whether unaccompanied minors require a guardian. Default: true. |
| 58 | `guardian_required_age_bracket` | Guardian Required Age Bracket | svc | booking | `[3]` | text_area | —/— | Age range requiring guardian consent at spa. Default 12-15. |
| 59 | `guardian_required_age_cutoff` | Guardian Required Age Cutoff | svc | booking | `[4]` | number | —/— | Children under this age require a guardian present. Default: 8. |
| 62 | `age_bracket_mandatory` | Age Bracket Mandatory | svc | viewing | `[6]` | text_area | ✓/— | Mandatory age eligibility bracket for Kids Center. Default `{min:2,max:12}`. |
| 113 | `requires_approval` | Requires Approval | svc,pkg | booking | `*` | checkbox | —/— | Whether the booking requires manual approval. Default: false. |
| 116 | `sort_order` | Display Order | svc,pkg | viewing | `*` | number | —/— | Display sort order on listings (lower = earlier). Default: 0. |
| 117 | `validity_days` | Validity Days | svc,pkg | booking | `*` | number | —/— | Days the booking/voucher remains valid after issuance. |

### Audience (category 3)

| id | config_key | Display name | Target | Phase | applies_to | value_type | R/M | Description |
|---|---|---|---|---|---|---|---|---|
| 10 | `scheduling_mode` | Scheduling Mode | svc | viewing | `[7,9]` | dropdown | —/— | How service delivery events are scheduled. Applies to request-type services. |
| 27 | `per_slot_capacity` | Guests served simultaneously per time slot | svc | viewing | `[2,3,4,5,6]` | number | —/— | Guests or vehicles served simultaneously per slot. Renamed from "Per Slot Capacity" and re-scoped from `[1,3,7]` to Dining/Spa/Barber/Gym/Kids (services-only, `package`=0) — `20260610_*`, originals only. |
| 34 | `confirmation_mode` | Confirmation Mode | svc,pkg | booking | `*` | dropdown | ✓/— | **RETIRED** — soft-deleted (`status='inactive'`, `20260720_2`); no longer in the active set. Was superseded by `requires_approval` (id 113): bookings default to `confirmed`, only `requires_approval = true` produces `pending`. |
| 35 | `min_persons_per_booking` | Minimum allowed party size per booking | svc,pkg | booking | `[1,7,"package"]` | number | —/— | Minimum persons or children per booking. Renamed from "Minimum Persons Per Booking" and re-scoped from `[1,2,3,6,"package"]` to Stay/Transport + Package — `20260610_*`, originals only. |
| 36 | `max_persons_per_booking` | Maximum allowed party size per booking | svc,pkg | booking | `[1,7,"package"]` | number | —/— | Maximum persons per booking. Renamed from "Maximum Persons Per Booking" and re-scoped from `[1,2,3,"package"]` to Stay/Transport + Package — `20260610_*`, originals only. |
| 37 | `max_children_per_guardian` | Maximum Children Per Guardian | svc | booking | `[6]` | number | —/— | Max children per guardian in one Kids Center booking. Default: 4. |
| 874 | `max_adults` | Maximum Adults | svc,pkg | viewing | `*` | number | —/— | Maximum adults per booking. **`has_constraint=1`** — value ≤ delivery unit capacity; fetch the bound from `GET /api/config/constraints?config_key_id=874`. |
| 875 | `max_children` | Maximum Children | svc,pkg | viewing | `*` | number | —/— | Maximum children per booking. **`has_constraint=1`** — value ≤ delivery unit capacity (see `GET /api/config/constraints?config_key_id=875`). |
| 2033 | `max_quantity_per_booking` | Maximum Quantity Per Booking | svc,pkg | viewing | `*` | number | —/— | Maximum times this service/package can be booked in one reservation. Default: 1. Controls `quantity` in booking APIs; exposed as `maxQuantityPerBooking` / `additional_attributes.maxQuantityPerBooking` in guest responses. |
| 2332 | `is_consumable` | Is Consumable | svc | viewing | `*` | checkbox | —/— | Whether this service is consumable (drives consumption-tracking behaviour). |
| 38 | `min_stay_nights` | Minimum Stay Nights | svc | booking | `[1]` | number | —/— | Minimum stay length in nights. Default: 1. |
| 39 | `max_stay_nights` | Maximum Stay Nights | svc | booking | `[1]` | number | —/— | Maximum stay length in nights. Default: 30. |
| 40 | `appointment_required` | Appointment Required | svc | booking | `[9]` | checkbox | —/— | Whether an appointment slot is required. |
| 41 | `walk_in_accepted` | Walk-in Accepted | svc | booking | `[7]` | checkbox | —/— | Whether walk-in use is accepted without a booking. Default: true. |
| 42 | `required_guest_inputs` | Required Guest Inputs | svc | booking | `[7]` | dropdown | —/✓ | Custom input fields required at drop (license_plate, car_type, …). |
| 43 | `required_documents` | Required Documents | svc | booking | `[3,5,6,7]` | checkbox | —/✓ | Documents or consents required at booking. |
| 49 | `stay_boundary_rule` | Stay Boundary Rule | pkg | booking | `["package"]` | dropdown | —/— | How the stay period relates to the package publish window. |
| 60 | `guest_of_guest_allowed` | Guest of Guest Allowed | svc | booking | `[1]` | checkbox | —/— | Whether a guest may bring an external visitor. Default: false. |
| 61 | `gender_restricted_windows` | Gender Restricted Windows | svc | viewing | `[3,4,5]` | gender_restricted_windows_form | —/— | Gender-restricted time windows. |
| 63 | `access_scope` | Access Scope | svc | viewing | `[1,2,3,4,5,6,7,8,9]` | dropdown | ✓/— | Who can access and book this service. Re-scoped from `*` to the explicit service-category list (no `package`; package `enabled_for`=0) — `20260716_4`. Options ordered **public → mixed → guests-only → members-only**, so the first-option default is **public** — `20260611_1`, parent key only. |
| 64 | `tier_extra_savings_badge` | Tier Extra Savings Badge | pkg | viewing | `["package"]` | tier_savings_badge_form | —/— | Optional per-tier extra-savings badge. |
| 65 | `membership_gate` | Membership Gate | svc | booking | `[5]` | dropdown | —/✓ | Required membership SKUs to access the service. |
| 74 | `savings_badge` | Savings Badge | pkg | booking | `["package"]` | savings_badge_form | —/— | Auto-computed savings badge ("Save X%") above a threshold. |
| 83 | `partial_consumption_refund_rule` | Partial Consumption Refund Rule | pkg | booking | `["package"]` | dropdown | —/— | How consumed-but-cancelled package components are refunded. |
| 96 | `loyalty_earn_rate` | Loyalty Earn Rate | pkg | booking | `["package"]` | decimal | —/— | Loyalty points earned per currency unit (pre-tax). |
| 97 | `loyalty_redemption_enabled` | Loyalty Redemption Enabled | pkg | booking | `["package"]` | checkbox | —/— | Whether loyalty points can be redeemed against this service. |
| 98 | `loyalty_redemption_cap_pct` | Loyalty Redemption Cap Percentage | pkg | booking | `["package"]` | decimal | —/— | Max percentage of the total covered by loyalty redemption. |
| 99 | `member_extra_discount_per_tier` | Member Extra Discount Per Tier | pkg | booking | `["package"]` | tier_discount_form | —/— | Additional member discount per loyalty tier. |
| 115 | `requires_booking` | Requires Booking | svc,pkg | booking | `*` | checkbox | —/— | Whether a booking is required to consume this service. Default: true. |

### Pricing, Taxes, Payment, Cancellation (category 4)

| id | config_key | Display name | Target | Phase | applies_to | value_type | R/M | Description |
|---|---|---|---|---|---|---|---|---|
| 67 | `base_price` | Base Price | svc,pkg | booking | `*` | decimal | —/— | Base price in the configured currency. |
| 72 | `package_bundle_mode` | Package Bundle Mode | pkg | booking | `["package"]` | dropdown | —/— | Fixed = all services included; flexible = guest picks N of M. Default: fixed. |
| 76 | `primary_service_type_anchor` | Primary Service Type Anchor | pkg | booking | `["package"]` | dropdown | —/— | Dominant included service type that anchors the package. |
| 77 | `tax_profile` | Tax Applied | **tenants** | booking | `*` | tax_profile_api_form | —/— | Repointed to `target_table='tenants'` (`20260720_2`) — the applied value now belongs to the hotel/tenant, read/written via [Tenant Configs](../../tenant-configs/tenant-configs.md). Tax profile schema; default `vat_15_ksa` (ZATCA-compliant). |
| 78 | `service_charge_pct` | Service Charge Percentage | svc,pkg | booking | `*` | decimal | —/— | Service charge percentage on top of base price. Default: 10%. |
| 79 | `payment_timing` | Payment Timing | **tenants** | booking | `*` | dropdown | —/✓ | Repointed to `tenants` (`20260720_2`); tenant-scoped (see [Tenant Configs](../../tenant-configs/tenant-configs.md)). When payment is collected (at booking, at service, partial deposit). |
| 80 | `deposit_amount` | Deposit Amount | **tenants** | booking | `[1,"package"]` | deposit_form | —/— | Repointed to `tenants` (`20260720_2`); tenant-scoped. Deposit collected at booking. JSON `{type:"percent"\|"fixed",value}`. |
| 81 | `accepted_payment_methods` | Accepted Payment Methods | svc,pkg | booking | `*` | multi_checkbox | —/✓ | Accepted payment methods (mada, apple_pay, visa, …). |
| 82 | `cancellation_margin` | Cancellation Margin | svc,pkg | booking | `*` | cancellation_form | —/— | Cancellation policy template (`free >72h, 50% 24-72h, 100% <24h` by default). |
| 84 | `extension_allowed` | Extension Allowed | svc,pkg | consumption | `[1,6,7,"package"]` | checkbox | —/— | Whether the stay or session can be extended. Default: true for Stay. |
| 85 | `extension_unit` | Extension Unit | svc | consumption | `[1,"package"]` | max_extension_length_label | —/— | Unit for stay extension. Default: night. |
| 86 | `max_extension_length` | Maximum Extension Length | svc | consumption | `[1,"package"]` | number | —/— | Max extension length in the configured unit. |
| 87 | `extension_pricing_rule` | Extension Price Adjustment (%) | svc | consumption | `[1,"package"]` | number_spinner | —/— | Percentage adjustment to base price for extensions (+ increase, − discount). |
| 89 | `extension_cutoff_time` | Extension Cutoff Time | svc | consumption | `[1,"package"]` | mm:dd:hh | —/— | Latest time on the final day to request an extension. Default: 10:00. |
| 90 | `extension_requires_availability_recheck` | Extension Requires Availability Recheck | svc | consumption | `[1]` | checkbox | —/— | Whether extending requires a real-time availability re-check. Default: true. |
| 91 | `extension_behaviour_auto` | Extension Behaviour Auto | svc | consumption | `[7]` | checkbox | —/— | Whether valet parking auto-extends with an active guest stay. Default: true. |
| 92 | `honour_on_extension_per_service` | Honour on Extension Per Service | pkg | consumption | `["package"]` | dropdown | —/✓ | Per-included-service extension behaviour (scales / fixed / billed-separately). |
| 95 | `overage_rate` | Overage Rate | pkg | consumption | `["package"]` | overage_rate_form | —/— | Overage charge when capped consumption is exceeded. |
| 118 | `cancellation_exceptions` | Cancellation Exceptions | svc,pkg | booking | `*` | dropdown_multiselect | —/✓ | Cancellation reasons that qualify for exception handling (override standard policy). |
| 119 | `base_currency` | Base Currency | svc,pkg | booking | `*` | currencies_api_dropdown | ✓/— | Base currency for pricing and transactions across the system. |
| 128 | `pricing_rules` | Pricing Rules | **tenants** | consumption | `*` | pricing_rules_api_form | —/— | Repointed to `tenants` (`20260720_2`); tenant-scoped (see [Tenant Configs](../../tenant-configs/tenant-configs.md)). Value is one or more `pricing_rules.pricing_rule_id` (NOT possible-value ids). |
| 129 | `duration_unit` | Duration Unit | svc,pkg | booking | `[1,2,3,4,5,6,7,8,9,"package"]` | base_price_label | —/— | Duration unit for the service or package. |

### Package Composition (category 10)

| id | config_key | Display name | Target | Phase | applies_to | value_type | R/M | Description |
|---|---|---|---|---|---|---|---|---|
| 102 | `pkg_quantity_override` | Package Quantity Override | pkg | booking | `["package"]` | text_area | —/— | Quantity/duration override per included service. JSON `{service_id,quantity,unit}`. |
| 103 | `pkg_consumption_override` | Package Consumption Override | pkg | consumption | `["package"]` | dropdown | —/— | Overrides the default consumption model for a bundled service. |
| 104 | `pkg_reset_cadence_override` | Package Reset Cadence Override | pkg | consumption | `["package"]` | dropdown | —/— | Overrides the reset cadence for capped consumption of a bundled service. |

### Guest Display — booking-time guest form (category 12)

These describe what the guest sees and fills in during booking.

> **Card ids reconciled to the current dump.** These ids were previously off by a fixed offset
> (numbered 155–179 against an older snapshot); the live `config_key_id`s are 159–184. `phone`,
> `preferred_time` and `parent_phone` are **optional** in the current DB.

| id | config_key | Display name | Target | applies_to | value_type | R/M | Group |
|---|---|---|---|---|---|---|---|
| 159 | `full_name` | Full Name | svc | `[1,2,3,4,5,7]` | text | ✓/— | Contact |
| 160 | `email` | Email Address | svc | `[1,2,3,5]` | email | ✓/— | Contact |
| 161 | `phone` | Phone Number | svc | `[1,2,3,4,5,7]` | tel | —/— | Contact |
| 162 | `preferred_time` | Preferred Time | svc | `[3,4]` | datetime | —/— | Dates |
| 163 | `check_in` | Check-in Date | svc | `[1]` | date | ✓/— | Dates |
| 164 | `check_out` | Check-out Date | svc | `[1]` | date | ✓/— | Dates |
| 165 | `adults` | Adults | svc | `[1]` | number | ✓/— | Party Size |
| 166 | `children` | Children | svc | `[1]` | number | —/— | Party Size |
| 167 | `reservation_date` | Reservation Date & Time | svc | `[2]` | datetime | ✓/— | Dates |
| 168 | `party_size` | Number of Guests | svc | `[2]` | number | ✓/— | Party Size |
| 184 | `meal_type` | Meal Type | svc | `[2]` | dropdown | ✓/✓ | Service Details |
| 169 | `treatment_type` | Treatment Type | svc | `[3]` | dropdown | ✓/— | Service Details |
| 170 | `duration` | Duration | svc | `[3]` | dropdown | ✓/— | Service Details |
| 171 | `service_type` | Service Type | svc | `[4]` | dropdown | ✓/— | Service Details |
| 172 | `pass_type` | Pass Type | svc | `[5]` | dropdown | ✓/— | Service Details |
| 173 | `visit_date` | Visit Date | svc | `[5]` | date | ✓/— | Dates |
| 174 | `parent_name` | Parent/Guardian Name | svc | `[6]` | text | ✓/— | Child |
| 175 | `parent_phone` | Parent Phone Number | svc | `[6]` | tel | —/— | Child |
| 176 | `child_name` | Child's Name | svc | `[6]` | text | ✓/— | Child |
| 177 | `child_age` | Child's Age | svc | `[6]` | number | ✓/— | Child |
| 178 | `booking_date` | Booking Date | svc | `[6]` | date | ✓/— | Dates |
| 179 | `session_duration` | Session Duration | svc | `[6]` | dropdown | ✓/— | Service Details |
| 180 | `pickup_location` | Pickup Location | svc | `[7]` | text | ✓/— | Transport |
| 181 | `dropoff_location` | Dropoff Location | svc | `[7]` | text | ✓/— | Transport |
| 182 | `pickup_datetime` | Pickup Date & Time | svc | `[7]` | datetime | ✓/— | Dates |
| 183 | `passengers` | Number of Passengers | svc | `[7]` | number | ✓/— | Party Size |

All Guest Display rows are phase `booking`.

### User Form Values (category 13)

| id | config_key | Display name | Target | Phase | applies_to | value_type | R/M | Description |
|---|---|---|---|---|---|---|---|---|
| 112 | `form_values` | Form Values | svc,pkg | booking | `*` | form | —/✓ | Possible user input fields displayed during booking. |

### Service Details (category 14)

| id | config_key | Display name | Target | Phase | applies_to | value_type | R/M | Description |
|---|---|---|---|---|---|---|---|---|
| 8 | `terms_and_conditions` | Terms and Conditions | svc,pkg | viewing | `*` | text_area | —/— | Localized rich-text terms & conditions. |
| 75 | `non_transferable_flag` | Non-transferable Flag | pkg | booking | `["package"]` | checkbox | —/— | Packages are bound to the original guest/booking. Default: true. |
| 100 | `linked_addons` | Linked Add-ons | svc,pkg | booking | `[5,6,7,"package"]` | dropdown | —/✓ | Linked add-on service or SKU IDs offered at checkout. |
| 123 | `is_amenity` | Is Amenity | svc | viewing | `*` | checkbox | —/— | Whether this service can be offered as an amenity for another service. |
| 124 | `wifi_name` | WiFi Name | svc | viewing | `[8]` | text | —/— | WiFi network name (SSID) for the networking service. |
| 125 | `wifi_password` | WiFi Password | svc | viewing | `[8]` | text | —/— | WiFi network password for the networking service. |
| 126 | `physical_dimension` | Physical Dimension | svc | viewing | `[1,2,3,4,5,6]` | form | —/— | Physical dimensions (length, width, height) of the service or its delivered unit. |

### Amenities (category 15)

Per-service-category amenity toggles. All target `services`, scope `service`, phase `viewing`, required `—`. The `description` column stores the bilingual label. Value type is `checkbox` unless noted.

| id | config_key | Display name | applies_to | Group | Note |
|---|---|---|---|---|---|
| 130 | `meal_plan` | Meal Plan | `[1]` | Rooms | dropdown_multiselect |
| 132 | `early_checkin` | Early Check-in | `[1]` | Rooms | |
| 133 | `late_checkout` | Late Check-out | `[1]` | Rooms | |
| 134 | `in_room_dining` | In-Room Dining Access | `[1]` | Rooms | |
| 135 | `spa_voucher` | Spa Treatment Voucher | `[1]` | Rooms | |
| 136 | `spa_access` | Spa / Sauna / Steam Access | `[1]` | Rooms | |
| 137 | `gym_access` | Gym Access | `[1]` | Rooms | |
| 138 | `kids_club_access` | Kids Club Access | `[1]` | Rooms | |
| 139 | `laundry` | Laundry (X pieces included) | `[1]` | Rooms | number |
| 140 | `valet_parking` | Valet Parking | `[1,2]` | Shared | |
| 141 | `locker` | Locker | `[3,5]` | Shared | |
| 142 | `private_room` | Private Room Available | `[2]` | Restaurants | |
| 143 | `birthday_package` | Birthday/Anniversary Package | `[2]` | Restaurants | |
| 144 | `herbal_tea` | Complimentary Herbal Tea | `[3]` | Spa | |
| 145 | `towel_robe` | Towel & Robe | `[3]` | Spa | |
| 146 | `sauna_steam_access` | Sauna & Steam Access | `[3]` | Spa | |
| 147 | `hair_wash` | Hair Wash Included | `[4]` | Barber | |
| 148 | `beard_oil` | Beard Oil Treatment | `[4]` | Barber | |
| 149 | `coffee_tea` | Complimentary Coffee/Tea | `[4]` | Barber | |
| 150 | `towel` | Towel Service | `[5]` | Gym | |
| 151 | `water_bottle` | Complimentary Water Bottle | `[5]` | Gym | |
| 152 | `personal_trainer` | Personal Trainer Session | `[5]` | Gym | |
| 153 | `snacks` | Snacks Included | `[6]` | Kids | |
| 154 | `art_supplies` | Art Supplies | `[6]` | Kids | |
| 155 | `nanny_service` | Nanny Service | `[6]` | Kids | |
| 156 | `water_bottles` | Complimentary Water Bottles | `[7]` | Transport | |
| 157 | `wifi` | Onboard WiFi | `[7]` | Transport | |
| 158 | `child_seat` | Child Seat Available | `[7]` | Transport | |

(Ids reconciled to the current dump — this table was previously numbered 126–154, off by −4 from the live `config_key_id`s 130–158.)

Two tag keys (value type `keyword_chips`, `applies_to = *`, enabled for all categories + package):

| id | config_key | Display name | Description |
|---|---|---|---|
| 127 | `amenities_tags` | Amenities Tags | Amenity tags per service category, grouped for display (Beds, Bathroom, Comfort, …). Each value stores `{key, group:{en,ar,key}, label:{en,ar}, group_order, keyword_order}`. |
| 186 | `keyword_tags` | Keyword Tags | Classification keyword tags per service category (room class, dining style, treatment type, vehicle class, …). A flat list of selectable chips. |

---

## Deprecated keys

Inactive (`status='inactive'`) keys and their active replacement. Their ids are retained for FK integrity — do not reuse or repurpose them.

| id | config_key | Replaced by |
|---|---|---|
| 11 | `checkin_anchor` | folded into stay/extension config |
| 12 | `checkout_anchor` | folded into stay/extension config |
| 46 | `pickup_datetime` (admin) | guest-side `pickup_datetime` (182) |
| 66 | `pricing_model` | `base_currency` (119) + `pricing_rules` (128) |
| 68 | `currency` | `base_currency` (119) |
| 69 | `peak_offpeak_multipliers` | `pricing_rules` (128) |
| 70 | `express_multiplier` | `pricing_rules` (128) |
| 71 | `sibling_discount` | `member_extra_discount_per_tier` (99) |
| 73 | `package_price` | `base_price` (67) under packages |
| 88 | `extension_discount_pct` | `extension_pricing_rule` (87) |
| 101 | `pkg_service_ref` | direct service relation |
| 105 | `pkg_overage_rate_override` | `overage_rate` (95) |
| 111 | `form_inputs` | `form_values` (112) |
| 121 | `delivery_unit_inventory` | `deliver_unit` (120) |
| 122 | `amenities` | per-amenity rows 130–158 |
| 131 | `airport_transfer` | rolled into room amenities |
| 34 | `confirmation_mode` | `requires_approval` (113); soft-deleted `20260720_2` |
| 116 | `sort_order` | listing sort handled elsewhere |
| 185 | `unit` | `duration_unit` (129) |

---

## Tenant clones

This catalog covers the **system tenant** only. Every other `hms_config_keys` row is a per-tenant **clone**: `source_hms_config_key_id` points back to a system-tenant original, `tenant_id` is `[<tenant_id>]`, and `created_by` is the onboarding tenant admin.

A clone is the same key with a tenant-specific scope override (`applies_to` / `enabled_for`) — there is no other content drift. To read a clone, look up its `source_hms_config_key_id` in the catalog above, then inspect the clone's `applies_to` / `enabled_for`. Query a tenant's clones directly rather than enumerating them here. How clones are produced is covered in [per-tenant-cloning.md](../../per-tenant-cloning/per-tenant-cloning.md) and [resource-assignments.md](../../per-tenant-resource-assignment/resource-assignments.md).

---

## Where this data is consumed

| Surface | Reads |
|---|---|
| **Catalog API** (`GET /api/hms_config_keys_catalog`) | `hms_config_keys` (+ scope/category joins) — dual-locale browse. See [The Catalog API](#the-catalog-api). |
| Admin "Enabled For" CRUD | `hms_config_keys` — toggles `enabled_for` per scope. |
| Admin "Possible Values" CRUD (service) | `hms_config_possible_values` rows, `scope_constraint_name IN ('service_categories','*')` (`'*'` = both-scope). |
| Admin "Possible Values" CRUD (package) | `hms_config_possible_values` rows, `scope_constraint_name IN ('packages','*')`. |
| Applied values (a service/package instance's picks) | `hms_config` rows, `base_table='services'`/`'packages'` — written by CustomServices/CustomPackages. |
| Guest-side form render | Category 12 and 13 rows, filtered by service category and ordered by `group_order`. |

See [config-keys.md](../config-keys.md) for the CRUD contract behind the first four.

---

## Change Log

| Date | Change |
|---|---|
| 2026-06-14 | Added `max_quantity_per_booking` config key (availability category, booking group, `applies_to = *`). Controls multi-quantity service bookings. Migration `20260614_1`. |
| 2026-06-11 | Added `max_adults` and `max_children` config keys (Audience category, party group, `applies_to = *`). Migration `20260611_3`. |
| 2026-06-11 | Synced keys `27`/`35`/`36` (rename + `applies_to` re-scope, `20260610_*`) and `63` `access_scope` (option order → default public, `20260611_1`) — originals only; tenant clones untouched (issue #229 B/D). |
| 2026-06-10 | Documented the read-only Catalog API (List + View, dual-locale, tenancy-scoped). |
| 2026-06-10 | Initial catalog — inventory of active system-tenant config keys reconciled against `hms_db_1.9`, grouped by admin-UI category, plus lookup tables, value types, deprecated keys, and clone notes. |
