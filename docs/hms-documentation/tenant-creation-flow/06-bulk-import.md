---
title: "6 · Bulk Import"
sidebar_position: 6
---

# 6 · Bulk Import

`POST /api/custom/tenant/import` — one endpoint that ingests the ops team's
standard hotel workbook, validates it, fills gaps with documented defaults, and
drives the chapter 1-5 flows in-process to build a fully bookable tenant.

This is the canonical tenant-seeding path. It replaces `POST /api/dev/seed/tenant`
(`DevSeedTenant`), which hand-wrote rows and skipped `unit_availability`,
`translated_entries`, per-service `hms_config`, pricing and media.

---

## Endpoint

| | |
|---|---|
| **Path** | `POST /api/custom/tenant/import` (no IDs in the path) |
| **Transport** | `AUTH_PLATFORM` — two-layer AES: platform key **and** access token. Encrypted request + encrypted response. |
| **Authorization** | valid access token, permission `add_tenants`, and the `requireSystemTenantImportActor` guard (see below). |
| **API object** | `global.CustomTenantImport_object` (aliased `global.TenantImport_object`). |

### Transport

The request is the standard two-layer envelope:

```
inner  reqData          = AES(payload, accessToken + platformEncryptionKey)
outer  encryptedRequest = AES({ reqData, encryptionDetails }, SECRET_KEY)
```

Send the outer envelope in the `encryptedrequest` header **or**, because a
base64 workbook does not fit in an HTTP header, as an `encryptedRequest` field
in the JSON body. The server accepts either. `express.json` is configured with
a `25mb` limit; a decoded workbook larger than 15 MB is rejected with a
blocking `WORKBOOK_TOO_LARGE` problem.

The response `data` is AES-encrypted with the same inner key.

### Authorization

Three independent gates, in pipeline order:

1. **Access token** — missing or invalid → `401`.
2. **Permission** — the object declares `add_tenants`, the same permission
   `TenantProvisioningGroupedCrud` requires. Without it → `403` / `scc: E41`.
3. **System-tenant guard** — see below.

### System-tenant guard

`requireSystemTenantImportActor` runs as the first `Add` preProcess. It reads
`actionPerformerURDD` from the payload, looks up its `tenant_id` in
`user_roles_designations_department` (scoped to `status = 'active'`), and compares
against `getSystemTenantId()`.

All three of these throw `403` with `scc: E31`:

- a URDD that does not exist or is not active,
- a URDD whose `tenant_id` is `NULL`,
- a URDD whose `tenant_id` is not the system tenant.

### Request body

| Field | Required | Meaning |
|---|---|---|
| `actionPerformerURDD` | yes | A system-tenant URDD. A `NULL`-tenant URDD is rejected. |
| `workbookBase64` | yes | Base64 of the `.xlsx` workbook bytes. |
| `dryRun` | no (default `false`) | Validate + default + return the report; write nothing. |

---

## The workbook

`xlsx.read(buffer)`. For each recognised sheet the parser finds the header row by
matching column names, then reads data rows. **Row 1 is the header row, row 2 is a
human-readable descriptions row and is skipped, data starts at row 3.** Unknown
sheets are ignored. A missing **required** sheet (`Hotel Info`, `Locations`,
`Services`) is a blocking problem.

Eight sheets are recognised. Column lists are from
`Src/HelperFunctions/PreProcessingFunctions/TenantImport/workbookSchema.js`.

### `Hotel Info` (required, one data row)

`hotel_name`, `hotel_name_ar`, `hotel_type`, `city`, `address`, `address_ar`,
`country`, `country_ar`, `latitude`, `longitude`, `timezone`, `currency_code`,
`contact_email`, `contact_phone`, `logo_url`

Drives tenant provisioning: the `tenants` row, its columns
(`tenant_timezone`, `tenant_locale`, `address`, `city`, `country`, `latitude`,
`longitude`, `tenant_currency_id`, `tenant_logo`), and the Tenant Admin user
(email = `contact_email`, name split from `hotel_name`).

### `Landmarks` (ignored in v1)

`landmark_name`, `landmark_name_ar`, `landmark_type`, `latitude`, `longitude`,
`radius_km`, `sort_order`

Parsed but not written — there is no target table in the documented flow.

### `Locations` (required)

`location_name`, `location_type`, `parent_location`

Becomes the tenant's `locations` tree via `CustomService_location_facets`
(`entity: "location"`). Rows are topo-sorted so parents are created first.
`location_type` values are dirty in practice, so the type
(`building` / `floor` / `zone`) is inferred from the label keywords and, failing
that, from tree depth.

### `Services` (required)

`service_category`, `service_name`, `service_name_ar`, `description`,
`description_ar`, `short_description`, `price`, `currency`, `duration`,
`duration_unit`, `is_featured`, `max_adults`, `max_children`,
`max_quantity_per_booking`, `is_consumable`, `location`, `config_keyword_tags`,
`config_amenities_tags`, `config_physical_dimension`,
`config_cancellation_margin_en`, `config_cancellation_margin_ar`,
`config_cancellation_exceptions_en`, `config_cancellation_exceptions_ar`,
`config_terms_en`, `config_terms_ar`, `config_advance_booking_min_days`,
`config_advance_booking_max_days`, `config_lead_time_hours`,
`config_cutoff_time`, `config_blackout_dates`,
`config_gender_restricted_windows`, `config_publish_start`

Each row becomes a `CustomServices` create — root fields, one `catalog_pricing`
row mirroring `price` / `currency`, and a `configs[]` array built in the
admin-panel wire shape (see [Services](./04-services.md)). `service_category`
codes map: `STAY→stay`, `DINE→dining`, `SPA→spa`, `BARB→barber`, `GYM→gym`,
`KIDS→kids`, `TRANS→transport`, `NET→networking`, `RMSVC→room-service`.

### `Delivery Units`

`service`, `identifier`, `label`, `unit_type`, `capacity`, `location`,
`avail_days`, `avail_time_start`, `avail_time_end`, `avail_slot_duration_min`,
`avail_max_concurrent`

Each row is a bookable unit anchored to the service named in `service` (exact
match, case/space-insensitive — any non-exact row is blocking). Units are grouped
by service and created via the `CustomDeliveryUnits` bulk path (chunked at 200).
`unit_type` is one of `room` / `suite` / `station` / `vehicle`. `avail_days`
`all` expands to all seven days; a CSV of `0..6` selects those. An overnight or
degenerate availability window is clamped to a full day.

### `Packages`

`package_name`, `package_name_ar`, `description`, `description_ar`, `price`,
`currency`, `duration`, `duration_unit`, `is_featured`, `max_adults`,
`max_children`, `service_1`, `service_1_qty`, `service_1_mandatory` … through
`service_6` (`service_6`, `service_6_qty`, `service_6_mandatory`),
`config_keyword_tags`, `config_cancellation_margin_en`,
`config_cancellation_margin_ar`, `config_terms_en`, `config_terms_ar`

Each row is a `CustomPackages` create — `packageType: "predefined"`, one
`packagePricing` row, `packageServices[]` from the `service_N` columns (each must
resolve to a Services row), and a `configs[]` array.

### `Media`

`reference`, `attachment_name`, `attachment_type`, `attachment_link`, `sort_order`

Recorded but **not ingested** in v1 (see limitations). `reference` resolves to
`hotel`, a `service_name`, or a `package_name`.

### `Translations`

`table_name`, `column_name`, `record_name`, `language_code`, `translated_text`

Each row upserts a `translated_entries` row for the resolved record. `record_name`
is matched by name within `table_name` (`services` / `packages`).

---

## The two modes

### `dryRun: true`

Runs parse + validation + defaulting and returns the report. **Nothing is
written. HTTP is always 200**, even when `problems` is non-empty — it is a report
request, not a failure.

### `dryRun: false`

- If **any** problem has `severity: "blocking"`, the response is **HTTP 400** with
  `scc: E22`, the report at `error.details`, and **nothing written**.
- Otherwise the commit phase runs and the response is HTTP 200 with the report and
  `committed: true`.

The commit phase can still attach `warning`-severity problems (a failed slice, an
unresolved category) — those do not block and do not fail the request.

---

## The report

The response body's `data` is the report object.

```jsonc
{
  "dryRun": false,
  "committed": true,
  "partial": true,
  "blockingAfterCommit": 2,
  "tenant": { "id": 94, "code": "LE_MERIDIEN_TOWERS", "urddBPrime": 611 },
  "counts": {
    "locations": 3, "deliveryUnits": 5, "services": 3,
    "packages": 1, "media": 0, "translations": 13
  },
  "parsed": { "locations": 3, "services": 3, "units": 5, "packages": 1 },
  "problems": [
    { "severity": "blocking", "sheet": "Delivery Units", "row": 12,
      "column": "service", "code": "SERVICE_NOT_FOUND",
      "message": "Delivery unit \"30801\" references service \"Standard Royal Suite\" which is not defined in the Services sheet.",
      "hint": "Royal Suite, Executive Suite, ..." }
  ],
  "defaultsApplied": [
    { "sheet": "Services", "row": 7, "field": "duration_unit",
      "value": "session", "reason": "blank; category default" }
  ],
  "skipped": [
    { "sheet": "Media", "row": 3, "reason": "media ingestion not supported in v1 — add images via the admin panel" }
  ],
  "perEntity": {
    "provisioning": { "name": "Le Meridien Towers", "id": 94, "action": "created" },
    "locations": [ { "name": "Tower 1", "id": 501, "action": "created" } ],
    "deliveryUnits": [ { "service": "Deluxe Room", "created": 4, "existing": 0, "action": "created" } ],
    "services": [ { "name": "Deluxe Room", "id": 812, "action": "created" } ],
    "packages": [ { "name": "Honeymoon", "id": 34, "action": "created" } ]
  }
}
```

| Field | Meaning |
|---|---|
| `dryRun` | echoes the request flag |
| `committed` | `true` only after the commit phase ran to completion |
| `tenant` | `{ id, code, urddBPrime }` once provisioned, otherwise `null` |
| `counts` | rows created per entity (`media` is always `0` in v1) |
| `parsed` | row counts read from the workbook (committed responses only) |
| `problems` | `{ severity, sheet, row, column, code, message, hint? }` — `severity` is `"blocking"` or `"warning"` |
| `defaultsApplied` | `{ sheet, row, field, value, reason }` — every gap-fill |
| `skipped` | `{ sheet, row, reason }` — rows deliberately not written |
| `perEntity` | per-record outcome, `action` one of `created` / `exists` / `reused` |

### Problem collapse

When more than 20 problems share the same `code`, the report keeps the first 20
and appends one summary line: `… and N more rows with "CODE"`. A raw workbook with
900+ unmatched delivery-unit rows collapses to 21 entries.

---

## Problem code catalog

### Parse and structure (blocking)

| `code` | Meaning |
|---|---|
| `NO_WORKBOOK` | `workbookBase64` missing or not valid base64. |
| `PARSE_FAILED` | `xlsx` could not read the buffer. |
| `WORKBOOK_TOO_LARGE` | the decoded workbook exceeds 15 MB. |
| `MISSING_SHEET` | a required sheet (`Hotel Info` / `Locations` / `Services`) is absent. |
| `NO_HOTEL_ROW` | the `Hotel Info` sheet has a header but no data row. |
| `BAD_ENUM` | `hotel_type` not in `hotel`/`branch`, or `unit_type` not in `room`/`suite`/`station`/`vehicle`. |
| `UNKNOWN_CATEGORY` | `service_category` is not one of the nine known codes. |
| `BAD_GENDER_WINDOW` | a `config_gender_restricted_windows` token is not `day|start|end|gender` with a valid gender. |

### Cross-sheet references

| `code` | Severity | Meaning |
|---|---|---|
| `SERVICE_NOT_FOUND` | blocking | a `Delivery Units` `service` does not exactly match a Services `service_name`. |
| `PACKAGE_SERVICE_NOT_FOUND` | blocking | a `Packages` `service_N` does not match a Services row. |
| `LOCATION_NOT_FOUND` | blocking | a `Services` / `Delivery Units` `location` does not match a Locations row. |
| `LOCATION_PARENT_NOT_FOUND` | blocking | a `Locations` `parent_location` does not match another Locations row. |
| `LOCATION_CYCLE` | blocking | the Locations `parent_location` chain contains a cycle. |
| `MEDIA_REF_NOT_FOUND` | warning | a `Media` `reference` resolves to neither the hotel, a service, nor a package (row skipped). |
| `TRANSLATION_RECORD_NOT_FOUND` | warning | a `Translations` `record_name` was not found in its `table_name` (row skipped). |

### Capacity and tiling (blocking)

| `code` | Meaning |
|---|---|
| `CAPACITY_MISMATCH` | units grouped under one service hold more than one distinct `capacity`. Ops fixes the sheet — never auto-normalised. |
| `DURATION_TILING` | a non-stay service's `duration` does not evenly divide a unit's availability window. |

### Payload build (warning)

| `code` | Meaning |
|---|---|
| `UNRESOLVABLE_REF` | an operator-typed `is_input: 0` config value did not resolve to a known option. |
| `TAG_UNMATCHED` | a `keyword_tags` / `amenities_tags` chip had no matching option for the tenant. |
| `DURATION_NOT_IN_OPTIONS` | the service `duration` is not among the tenant's cloned `duration` possible-values; the service may need its duration re-picked in the admin editor. Currently fires for every service on a fresh-clone tenant. |
| `CUTOFF_TIME_SKIPPED` | `config_cutoff_time` was present but its wire shape is unverified; not imported. |
| `BLACKOUT_DATES_SKIPPED` | `config_blackout_dates` was present but its wire shape is unverified; not imported. |
| `GENDER_WINDOWS_SKIPPED` | `config_gender_restricted_windows` was present but its wire shape is unverified; not imported. |
| `PACKAGE_NO_STAY` | the package composes no Stay-category service; it will block its own next edit in the admin panel. |

### Commit phase (warning unless noted)

| `code` | Meaning |
|---|---|
| `RESOURCE_CLONE_PARTIAL` | an RBAC / service-category / config-key clone step threw; provisioning continued. |
| `LOCATION_CREATE_FAILED` | one `CustomService_location_facets` create threw. |
| `SERVICE_CATEGORY_UNRESOLVED` | a service's category did not resolve; its delivery units were skipped. |
| `NO_LOCATION_FOR_UNITS` | no locations were created, so a service's delivery units were skipped. |
| `DELIVERY_UNITS_SLICE_FAILED` | one bulk delivery-unit slice threw; other slices continued. |
| `SERVICE_CREATE_FAILED` | one `CustomServices` create threw. |
| `PACKAGE_BUILD_FAILED` | `buildPackagePayload` threw for a row. |
| `PACKAGE_EMPTY` | a package resolved to zero services; not created. |
| `PACKAGE_CREATE_FAILED` | one `CustomPackages` create threw. |
| `MEDIA_INGEST_FAILED` | the media-parsing step threw. |
| `COMMIT_FAILED` | **blocking** — the commit phase threw unexpectedly (DB constraint, dispatcher edge case). Response is HTTP 500 / `scc E22`; whatever landed is recorded in `perEntity` / `counts`. Fix the workbook and re-run to resume. |

---

## Defaults

Every gap-fill is recorded in `defaultsApplied[]`. The important ones:

| Entity | Field | Default |
|---|---|---|
| service | `duration_unit` | `session` — `DINE→meal`, `TRANS→ride`, `STAY→night` |
| service | `duration` | `1` when the unit is `night`, else `60` |
| service | `price` | `0` — also emits a `PRICE_MISSING` warning |
| service | `currency` | `Hotel Info` `currency_code` |
| service | `is_featured` | `false` |
| service | `is_consumable` | `true` for `DINE` / `TRANS` / `RMSVC`, else `false` |
| service | `max_adults` / `max_children` | `2` / `0` (also for the literal `"NON"`) |
| service | `max_quantity_per_booking` | `10` |
| service | `serviceCode` | `SVC-<SLUG-OF-NAME>` |
| service | translations | missing `_ar` mirrors the `en` value |
| unit | `label` | the `identifier` |
| unit | `avail_days` | `all` |
| unit | `avail_time_start` / `end` | `00:00` / `23:59` |
| unit | `avail_slot_duration_min` | `480` for `STAY`, else `60` |
| unit | `avail_max_concurrent` | `1` |
| unit | availability window | overnight / degenerate windows clamped to `00:00`–`23:59` |
| location | `code` | slug of `location_name` |
| location | `location_type` | inferred from label keyword, else tree depth (`building` / `floor` / `zone`) |
| package | `duration_unit` | `nights` |
| package | `currency` | `Hotel Info` `currency_code` |
| tenant | `status` | `active` |
| tenant | `tenant_locale` | `en` |
| tenant | admin name | split of `hotel_name` (`contact_email` becomes the admin email) |

---

## Idempotent re-run (v1 = skip-if-exists)

Re-POSTing the same workbook is safe. The importer matches:

- the tenant by `tenant_code` (derived from `hotel_name`),
- services / packages / locations by name,
- delivery units by `identifier`.

An already-existing record is recorded with `action: "exists"` (or `"reused"` /
`"created"` for the tenant row) and is **not** recreated or updated. A re-run
creates only what is missing and never duplicates.

Full update-in-place — re-dispatching every record through its flow's Update
operation (including the package `configs` diff object) — is a v2 follow-up.

---

## v1 limitations

- **Landmarks** sheet is ignored (no target table).
- **Media images are not ingested.** Every `Media` row is recorded in `skipped`;
  add images through the admin panel.
- **Package `keyword_tags` / `amenities_tags`** are skipped (needs a per-category
  chip possible-value map).
- **`config_cutoff_time`, `config_blackout_dates`,
  `config_gender_restricted_windows`** are recorded as skipped / warning notes,
  not written.
- **The commit phase is not globally transactional.** Services and packages
  self-commit their parent row; delivery units are row-per-row. A mid-phase
  failure leaves a partially-populated tenant — re-run the same workbook to
  resume (see `COMMIT_FAILED`).
- **Each fresh tenant triggers one provisioning welcome email** to the
  `contact_email` address from `Hotel Info`.

---

## After this endpoint

The tenant has locations, delivery units, services (with `catalog_pricing` and
`hms_config`), packages, and translations — the same end state as running
chapters 1-5 by hand. Guests can browse and book it.

The in-repo companion doc is
`backend/Src/Apis/ProjectSpecificApis/TenantImport/README.md` (internal phase
behaviour). This page is the FE-facing contract.
