# Services CRUD

| Operation | Method | Path | Permission |
|---|---|---|---|
| List | GET | `/api/custom/services` | `list_services` |
| View | GET | `/api/custom/services?id=<service_id>` | `view_services` |
| Add | POST | `/api/custom/services` | `add_services` |
| Update | PUT | `/api/custom/services?id=<service_id>` | `update_services` |
| Delete | DELETE | `/api/custom/services?id=<service_id>` | `delete_services` |

End-to-end catalog management for a tenant's **services** (the `services` table plus its dependent side-tables: translations, attachments, service-locations, pricing, and dynamic configs). A Tenant Admin or Service Manager uses these endpoints to build and maintain the service catalog offered to guests.

---

## Authentication & Authorization

Each operation is gated by an RBAC permission held in the actor's URDP. The actor is identified by `actionPerformerURDD` and the request's encrypted `actionPerformerURDD` header, from which the tenant context (`tenant_id`) is resolved.

| Operation | Method | Permission |
|---|---|---|
| Add | POST | `add_services` |
| View | GET | `view_services` |
| List | GET | `list_services` |
| Update | PUT | `update_services` |
| Delete | DELETE | `delete_services` |

**Tenant ownership** — Update and Delete run a `requireServicesTenantMatch` guard first. It reads the request's `tenant_id` and rejects with `TENANT_MISMATCH` when the existing service's `created_by` belongs to a URDD outside the caller's tenant, so one tenant cannot modify or delete another tenant's services.

---

## Request Payload

Multilingual fields arrive as `{ "en": "...", "ar": "..." }` objects; the `en` value is stored on the `services` row and every other language is written to `translated_entries`. Arrays (`configs`, `serviceAttachmentIds`, `serviceLocations`, `servicePricing`) are handled by the post-process step and are not persisted to the base row directly.

| Field | Type | Required | Description |
|---|---|---|---|
| `id` | `number` | View/Update/Delete | Service ID (query param). |
| `actionPerformerURDD` | `number` | Yes | Acting user's URDD; recorded as `created_by`/`updated_by`. |
| `language_code` | `string` | No | Response language (query param; defaults to `en`). |
| `tenant_id` | `number` | Yes (Add) | Owning tenant. |
| `categoryId` | `number` | No | `service_categories` FK. |
| `serviceName` | `object` | No | Service name `{ en, ar }`. |
| `serviceCode` | `object` | No | Service code `{ en, ar }`. |
| `serviceSlug` | `object` | No | URL slug `{ en, ar }`. |
| `serviceNature` | `string` | No | e.g. `in-house`. |
| `serviceDescription` | `object` | No | Long description `{ en, ar }`. |
| `serviceShortDescription` | `object` | No | Short description `{ en, ar }`. |
| `serviceCommonAttributes` | `object`/`array` | No | Shared attributes `{ en, ar }` (serialized to JSON on write). |
| `serviceAttachmentIds` | `number[]` | No | Attachment IDs to link (image gallery). |
| `serviceLocations` | `object[]` | No | `[{ location_id }]` — leaf-zone locations the service is offered in. |
| `servicePricing` | `object[]` | No | `catalog_pricing` rows (price, currencyId, delta, value, type, validFrom, validTo, minQuantity, maxQuantity, customerSegment, region, dayOfWeek, conditions). `price` is stored **post-computed** — see [Pricing](#pricing-price-is-stored-post-computed). On Update, `pricingId` id-targets a row. |
| `configs` | `array`/`object` | No | Dynamic config entries. On **Add** a flat array; on **Update** a `{ added, updated, deleted }` diff object. |
| `serviceStatus` | `string` | No | `active`/`inactive`; on Update applied via `COALESCE` so omitting it preserves the current status. |

### Example (Add)

```json
{
  "actionPerformerURDD": 1,
  "tenant_id": 1,
  "categoryId": 3,
  "serviceName": { "en": "Deep Tissue Massage", "ar": "تدليك الأنسجة العميقة" },
  "serviceCode": { "en": "SVC-DT-60", "ar": "SVC-DT-60" },
  "serviceSlug": { "en": "deep-tissue-massage", "ar": "deep-tissue-massage" },
  "serviceNature": "in-house",
  "serviceDescription": { "en": "60 minute massage", "ar": "تدليك ٦٠ دقيقة" },
  "serviceShortDescription": { "en": "60 min massage", "ar": "تدليك ٦٠ دقيقة" },
  "serviceAttachmentIds": [101, 102],
  "serviceLocations": [{ "location_id": 8 }, { "location_id": 12 }],
  "servicePricing": [
    { "price": 250.0, "currencyId": 1, "type": "flat", "customerSegment": "regular" }
  ],
  "configs": [
    { "config_key_id": 67, "config_key": "base_price", "is_input": 1, "config_value": [{ "en": "250", "ar": "٢٥٠" }] },
    { "config_key_id": 119, "config_key": "base_currency", "is_input": 0, "config_value": [1] }
  ]
}
```

---

## Response

**Add** returns the driver metadata plus the new `service_id`:

```json
{ "insertId": 70, "service_id": 70 }
```

**View** returns one enriched service object; **List** returns an array of the same shape (each carrying `table_count` from the paginator), minus the `hms_config_keys_catalog` block that only View builds.

```json
{
  "id": 70,
  "catalogId": 1,
  "tenant_id": 1,
  "record_id": 70,
  "categoryId": 3,
  "serviceName": { "en": "Deep Tissue Massage", "ar": "تدليك الأنسجة العميقة" },
  "serviceCode": { "en": "SVC-DT-60", "ar": "SVC-DT-60" },
  "serviceSlug": { "en": "deep-tissue-massage", "ar": "deep-tissue-massage" },
  "serviceDescription": { "en": "60 minute massage", "ar": "تدليك ٦٠ دقيقة" },
  "serviceShortDescription": { "en": "60 min massage", "ar": "تدليك ٦٠ دقيقة" },
  "serviceCommonAttributes": { "en": "tags: relax", "ar": "وسوم: استرخاء" },
  "serviceNature": "in-house",
  "serviceStatus": "active",
  "servicePrice": "250",
  "serviceCurrency": "SAR",
  "serviceAttachmentIds": [101, 102],
  "media": [
    { "attachment_id": 101, "attachment_name": "cover.jpg", "attachment_type": "image/jpeg", "attachment_link": "/upload/serve?attachmentId=101", "status": "active" }
  ],
  "serviceLocations": [
    { "service_location_id": 14, "location_id": 8, "code": "EW", "label": "East Wing", "building": {}, "floor": {}, "zone": {} }
  ],
  "servicePricing": [
    { "pricing_id": 31, "price": "250.0000", "currency_id": 1, "type": "flat", "customer_segment": "regular" }
  ],
  "configs": [
    { "config_key_id": 67, "config_key": "base_price", "operator": "=", "is_input": 1, "config_value": [{ "en": "250", "ar": "٢٥٠" }] }
  ],
  "hms_config_keys_catalog": { "en": [], "ar": [] },
  "tenants_tenantName": "Acme Hotel",
  "service_categories_categoryName": "Spa",
  "serviceCreatedAt": "2026-05-14T15:30:00.000Z",
  "serviceUpdatedAt": "2026-05-15T11:04:20.000Z"
}
```

`hms_config_keys_catalog` (View only) is an `{ en, ar }` split of the config-key catalog with each key's selected values hydrated.

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

## `servicePricing` covers only the service's own prices

Every `catalog_pricing` query in this endpoint is scoped to `package_id IS NULL`.

A `catalog_pricing` row for a service that carries a **non-null `package_id`** is a package-scoped
**add-on price** — what that service costs inside one specific package. It is owned by the
[Packages CRUD](./packages-crud.md), written from the package's `add_ons` config. This endpoint
neither returns nor modifies it:

- **Reads** omit it, so it never appears in `servicePricing[]` and `servicePrice` is never derived
  from a discounted in-package price.
- **The Update diff** ignores it. This matters: the diff soft-deletes rows that are in the database
  but absent from the payload, and add-on prices are never in a service payload — without the
  scope, every service update would retire them.
- **Targeted writes** refuse it, so sending a package-scoped `pricingId` cannot mutate or retire a
  row this endpoint does not own.

To change an add-on price, edit the package's `add_ons` config, not the service.

## Behavior

- **Soft delete.** Delete never removes the row. The `enforceDeleteGuard("service")` pre-process probes for live dependents: a **clean delete** (no dependents) sets `services.status = 'archived'` (retired but **kept visible** in admin lists, which filter `status != 'inactive'`); a delete with **live dependents** sets `status = 'probation'`, finalized later by a cron to `archived` once the dependents clear. The row's ID is preserved so a future Update can reactivate it. Side-tables (translations, attachments, locations, pricing, configs) are intentionally left attached — Delete does not cascade.
- **Second delete → `inactive`.** Deleting a service that is **already `archived`** finalizes it the rest of the way to `inactive` — the fully-removed state that drops out of List/View. It skips the probation probe (an archived row is already past the booking gate) and runs the terminal unassign hook (Rule 2). Full lifecycle: `active` → *(delete)* → `archived` → *(delete again)* → `inactive`.
- **Delete response.** Reports `status_set` (`archived`, `probation`, or `inactive`), `deferred`, and the `dependents` list.
- **Status on Update** uses `status = COALESCE({{serviceStatus}}, status)`, so a partial Update that omits `serviceStatus` keeps the existing status.
- **Tenancy.** Update/Delete are blocked across tenants (`TENANT_MISMATCH`); List/View return rows scoped to the caller's tenant context.
- **Multilingual.** Six fields (name, code, slug, description, short description, common attributes) round-trip as `{ en, ar }`; `en` lives on the base row, other languages in `translated_entries`.
- **Delivery-unit reservation.** A `deliver_unit` config reserves each selected free unit (`delivery_units.current_status = 'reserved'`); removing it frees units back to `available`. Only free/held units are touched, never busy ones.
- **Update side-effects** run as diff-style upserts: attachments and service-locations are full-replaced (old rows soft-deactivated then re-inserted); pricing and configs honour id-aware / `{ added, updated, deleted }` diffs.

---

## Source Files

| File | Purpose |
|---|---|
| `Src/Apis/ProjectSpecificApis/CustomServices/Crud_Objects/Services.js` | API object definition, SQL templates, pre/post-process side-effect logic |
| `Src/Apis/ProjectSpecificApis/CustomServices/Crud_Objects/CRUD_parameters.js` | Request parameter schema + colMapper |
| `Src/Apis/ProjectSpecificApis/CustomServices/README.md` | Canonical context: conventions, payload shapes, tables touched |
| `Src/HelperFunctions/PreProcessingFunctions/DeleteGuards/enforceDeleteGuard.js` | Deferred-delete guard (probation vs inactive) |
| `Src/HelperFunctions/PreProcessingFunctions/tenantOwnership.js` | Cross-tenant Update/Delete guard factory |
