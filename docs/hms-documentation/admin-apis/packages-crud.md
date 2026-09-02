# Packages CRUD

| Operation | Method | Path | Permission |
|---|---|---|---|
| List | GET | `/api/custom/packages` | `list_packages` |
| View | GET | `/api/custom/packages?id=<package_id>` | `view_packages` |
| Add | POST | `/api/custom/packages` | `add_packages` |
| Update | PUT | `/api/custom/packages?id=<package_id>` | `update_packages` |
| Delete | DELETE | `/api/custom/packages?id=<package_id>` | `delete_packages` |

End-to-end catalog management for a tenant's **packages** (the `packages` table plus its dependent side-tables: translations, attachments, package-services, pricing, and dynamic configs). A Tenant Admin or Service Manager uses these endpoints to bundle services into sellable packages. This mirrors the Services CRUD, minus `service_locations` and adding `package_services`.

---

## Authentication & Authorization

Each operation is gated by an RBAC permission held in the actor's URDP. The actor is identified by `actionPerformerURDD` and the encrypted `actionPerformerURDD` header, from which the tenant context (`tenant_id`) is resolved.

| Operation | Method | Permission |
|---|---|---|
| Add | POST | `add_packages` |
| View | GET | `view_packages` |
| List | GET | `list_packages` |
| Update | PUT | `update_packages` |
| Delete | DELETE | `delete_packages` |

**Tenant ownership** — Update and Delete run a `requirePackagesTenantMatch` guard first. It reads the request's `tenant_id` and rejects with `TENANT_MISMATCH` when the existing package's `created_by` belongs to a URDD outside the caller's tenant.

---

## Request Payload

Multilingual fields arrive as `{ "en": "...", "ar": "..." }`; `en` is stored on the `packages` row and other languages go to `translated_entries`. Arrays (`configs`, `packageAttachmentIds`, `packagePricing`, `packageServices`) are processed by the post-process step, not persisted on the base row.

| Field | Type | Required | Description |
|---|---|---|---|
| `id` | `number` | View/Update/Delete | Package ID (query param). |
| `actionPerformerURDD` | `number` | Yes | Acting user's URDD; recorded as `created_by`/`updated_by`. |
| `language_code` | `string` | No | Response language (query param; defaults to `en`). |
| `tenant_id` | `number` | Yes (Add) | Owning tenant. |
| `packageName` | `object` | No | Package name `{ en, ar }`. |
| `packageCode` | `object` | No | Package code `{ en, ar }`. |
| `packageType` | `string` | No | e.g. `stay`. |
| `packageDescription` | `object` | No | Description `{ en, ar }`. |
| `packageImageUrl` | `string` | No | JSON-string of attachment IDs (auto-filled from `packageAttachmentIds`). |
| `packageAttachmentIds` | `number[]` | No | Attachment IDs to link (image gallery). |
| `packagePricing` | `object[]` | No | `catalog_pricing` rows (price, currencyId, delta, value, type, validFrom, validTo, minQuantity, maxQuantity, customerSegment, region, dayOfWeek, conditions). `price` is stored **post-computed** — see [Pricing](#pricing-price-is-stored-post-computed). On Update, `pricingId` id-targets a row. |
| `packageServices` | `object[]` | No | `[{ serviceId, quantity, isConsumable, consumptionLimit, isMandatory, priceOverride, displayOrder }]`. |
| `configs` | `array`/`object` | No | Dynamic config entries. On **Add** a flat array; on **Update** a `{ added, updated, deleted }` diff object. |
| `packageStatus` | `string` | No | `active`/`inactive`; on Update applied via `COALESCE` so omitting it preserves the current status. |

### Example (Add)

```json
{
  "actionPerformerURDD": 1,
  "tenant_id": 1,
  "packageType": "stay",
  "packageName": { "en": "Honeymoon Getaway", "ar": "عطلة شهر العسل" },
  "packageCode": { "en": "PKG-HONEY-3N", "ar": "PKG-HONEY-3N" },
  "packageDescription": { "en": "3 nights with spa + dinner", "ar": "٣ ليالٍ مع سبا وعشاء" },
  "packageAttachmentIds": [201, 202],
  "packagePricing": [
    { "price": 1500.0, "currencyId": 1, "type": "flat", "customerSegment": "regular" }
  ],
  "packageServices": [
    { "serviceId": 13, "quantity": 1, "isMandatory": 1, "displayOrder": 1 },
    { "serviceId": 67, "quantity": 1, "isConsumable": 1, "consumptionLimit": 1, "displayOrder": 2 }
  ],
  "configs": [
    { "config_key_id": 67, "config_key": "base_price", "is_input": 1, "config_value": [{ "en": "1500", "ar": "١٥٠٠" }] },
    { "config_key_id": 119, "config_key": "base_currency", "is_input": 0, "config_value": [1] }
  ]
}
```

---

## Response

**Add** returns driver metadata plus the new `package_id`:

```json
{ "insertId": 25, "package_id": 25 }
```

**View** returns one enriched package object; **List** returns an array of the same shape (each with `table_count`), minus the `hms_config_keys_catalog` block that only View builds.

```json
{
  "id": 25,
  "catalogId": 1,
  "record_id": 25,
  "tenantId": 1,
  "packageName": { "en": "Honeymoon Getaway", "ar": "عطلة شهر العسل" },
  "packageCode": { "en": "PKG-HONEY-3N", "ar": "PKG-HONEY-3N" },
  "packageDescription": { "en": "3 nights with spa + dinner", "ar": "٣ ليالٍ مع سبا وعشاء" },
  "packageType": "stay",
  "packageStatus": "active",
  "packageAttachmentIds": [201, 202],
  "media": [
    { "attachment_id": 201, "attachment_name": "honeymoon-cover.jpg", "attachment_link": "/upload/serve?attachmentId=201", "status": "active" }
  ],
  "packagePricing": [
    { "pricing_id": 11, "price": "1500.0000", "currency_id": 1, "type": "flat", "customer_segment": "regular" }
  ],
  "packageServices": [
    { "package_service_id": 41, "service_id": 13, "quantity": 1, "is_mandatory": 1, "display_order": 1 }
  ],
  "configs": [
    { "config_key_id": 67, "config_key": "base_price", "operator": "=", "is_input": 1, "config_value": [{ "en": "1500", "ar": "١٥٠٠" }] }
  ],
  "hms_config_keys_catalog": { "en": [], "ar": [] },
  "tenants_tenantName": "Acme Hotel",
  "packageCreatedAt": "2026-05-14T15:30:00.000Z",
  "packageUpdatedAt": "2026-05-15T11:04:20.000Z"
}
```

---

## Pricing: `price` is stored post-computed

A pricing row carries a base amount **and** an adjustment: `price` is what you send, and
`delta` / `value` / `type` describe a discount or surcharge on it. The server applies the
adjustment **once, at write time**, and stores the result in `catalog_pricing.price`. Readers never
re-apply it; `delta`/`value`/`type` remain as the record of how the number was reached.

| Submitted | Stored `price` |
|---|---|
| `price: "120", delta: "+", value: null, type: "flat"` | `120.0000` — no usable adjustment |
| `price: "120", delta: "-", value: "40", type: "flat"` | `80.0000` |
| `price: "120", delta: "-", value: 20, type: "percentage"` | `96.0000` |
| `price: "120", delta: "+", value: 10, type: "percentage"` | `132.0000` |

The price is stored **unchanged** when the row has no usable adjustment — `value` null, empty,
zero or non-numeric; `delta` anything but `+`/`-`; or `type` anything but `flat`/`percentage`.
That is the ordinary list-price case, which sends `delta: "+"` with `value: null`. A discount
larger than the price floors at `0` rather than going negative, and results are rounded to
`DECIMAL(19,4)`.

:::caution Do not echo a stored price back with the same adjustment
Because `price` is stored post-computed, sending `120 / - / 40 / flat` stores `80`. If a client
reads that row back and re-submits it **unchanged**, it sends `price: 80` with the same
`- / 40 / flat` and the row becomes `40` — the adjustment applies a second time.

An edit form must resubmit the **original base** price, not the value it read back. When only the
stored row is available, the base is recoverable: `flat` → `price + value` (or `price - value` when
`delta` is `+`); `percentage` → `price / (1 - value/100)` (or `/ (1 + value/100)`).
:::

## `add_ons` config → package-scoped service prices

The `add_ons` config records which add-on **services** a guest may attach at booking time — after
the package is already booked — and at what discount. Each entry is one bare row:

```json
{"add_on_service": 378, "discount_pct": 20}
```

On Add and Update, every entry is projected into a **package-scoped `catalog_pricing` row for the
service**, so pricing readers need no new join:

| Column | Value |
|---|---|
| `base_table` | `services` |
| `record_id` | the entry's `add_on_service` |
| `package_id` | this package |
| `price` | the service's standalone price with `discount_pct` applied (post-computed) |
| `currency_id` | the package's currency |
| `delta` / `value` / `type` | `'-'` / `discount_pct` / `'percentage'` |
| `customer_segment` / `recurrence` | `regular` / `once` |
| everything else | `NULL` |

So `{"add_on_service": 378, "discount_pct": 20}` on a package priced in currency `4`, where service
378 lists at `35.0000`, writes `price = 28.0000, delta = '-', value = 20.00, type = 'percentage'`.

Reconcile rules:

- The discount comes off the service's **standalone** price (its `catalog_pricing` row with no
  `package_id`). A service with no standalone price is **skipped**, not written at `0`.
- One row per (package, service). Re-sending a service updates it in place; listing the same
  service twice keeps the last entry.
- Removing an add-on **retires** its row (`status = 'inactive'`), never deletes it.
- `discount_pct` is clamped to `0..100`; missing or non-numeric is treated as `0`.
- **A payload that does not mention `add_ons` leaves existing rows untouched** — distinct from
  sending an empty list, which clears them. An update that only renames the package must not wipe
  its add-on pricing.

## Behavior

- **Soft delete.** Delete never removes the row. The `enforceDeleteGuard("package")` pre-process probes for live dependents: a **clean delete** (no dependents) sets `packages.status = 'archived'` (retired but **kept visible** in admin lists, which filter `status != 'inactive'`); a delete with **live dependents** sets `status = 'probation'`, finalized later by a cron to `archived` once dependents clear. The ID is preserved so a future Update can reactivate it. Side-tables (translations, attachments, pricing, package-services, configs) are intentionally left attached — Delete does not cascade.
- **Second delete → `inactive`.** Deleting a package that is **already `archived`** finalizes it the rest of the way to `inactive` — the fully-removed state that drops out of List/View. It skips the probation probe (an archived row is already past the booking gate). Full lifecycle: `active` → *(delete)* → `archived` → *(delete again)* → `inactive`.
- **Delete response.** Reports `status_set` (`archived`, `probation`, or `inactive`), `deferred`, and the `dependents` list.
- **Status on Update** uses `status = COALESCE({{packageStatus}}, status)`, so a partial Update that omits `packageStatus` keeps the existing status.
- **Tenancy.** Update/Delete are blocked across tenants (`TENANT_MISMATCH`).
- **Multilingual.** Three fields (name, code, description) round-trip as `{ en, ar }`; `en` on the base row, other languages in `translated_entries`.
- **Update side-effects** run in order: attachments full-replaced; pricing id-aware diff (or legacy `{ added, updated, deleted }`); package-services flat-array full-replace (or legacy diff keyed on `packageServiceId`); configs `{ added, updated, deleted }`. Note: unlike Services, packages do **not** write delivery-unit statuses (only Services CRUD does).

---

## Source Files

| File | Purpose |
|---|---|
| `Src/Apis/ProjectSpecificApis/CustomPackages/Crud_Objects/Packages.js` | API object definition, SQL templates, pre/post-process side-effect logic |
| `Src/Apis/ProjectSpecificApis/CustomPackages/Crud_Objects/CRUD_parameters.js` | Request parameter schema + colMapper |
| `Src/Apis/ProjectSpecificApis/CustomPackages/README.md` | Canonical context: conventions, payload shapes, tables touched |
| `Src/HelperFunctions/PreProcessingFunctions/DeleteGuards/enforceDeleteGuard.js` | Deferred-delete guard (probation vs inactive) |
| `Src/HelperFunctions/PreProcessingFunctions/tenantOwnership.js` | Cross-tenant Update/Delete guard factory |
