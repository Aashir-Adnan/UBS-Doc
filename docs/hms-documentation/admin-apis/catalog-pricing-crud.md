# Catalog Pricing CRUD

| Operation | Method | Path | Permission |
|---|---|---|---|
| List | **GET** | `/api/catalog/pricing/crud` | — |
| View | **GET** | `/api/catalog/pricing/crud?id=<id>` | — |
| Add | **POST** | `/api/catalog/pricing/crud` | — |
| Update | **PUT** | `/api/catalog/pricing/crud?id=<id>` | — |
| Delete | **DELETE** | `/api/catalog/pricing/crud?id=<id>` | — |

Manages the `catalog_pricing` table — polymorphic pricing rows that attach a price and adjustment logic to any record in a source table (`base_table` + `record_id`, e.g. a service or package). Supports flat/percentage deltas, validity windows, quantity tiers, customer segments, regions, day-of-week, and free-form JSON conditions. Maintained by a **SaaS Admin** / platform pricing operator.

> **Base path** is inferred from the object name `global.CatalogPricingCrud_object`. The resource is `catalog_pricing`; the CRUD verbs below apply regardless of the exact mount path.

---

## Authentication & Authorization

No RBAC permission is enforced — `requestMetaData.permission` is `null` and `providedPermissions` is `false`. Access is governed by the platform/transport layer only.

| Operation | Method | Permission |
|---|---|---|
| Add | POST | none (`null`) |
| View | GET (`?id=`) | none (`null`) |
| Update | PUT | none (`null`) |
| Delete | DELETE | none (`null`) |
| List | GET | none (`null`) |

---

## Request Payload

| Field | Type | Required | Description |
|---|---|---|---|
| `id` | number | No | Pricing primary key. Supplied as `?id=` (query) for View / Update / Delete. |
| `actionPerformerURDD` | number | No | Acting user's URDD. Stored as `created_by` (Add) and `updated_by` (Add/Update/Delete). |
| `tenant_id` | number | No | Tenant scope (present in the schema; not written by the current SQL). |
| `catalogPricing_baseTable` | string | No | Name of the source table this price applies to (e.g. `services`, `packages`). |
| `catalogPricing_recordId` | number | No | Primary key of the row in `base_table`. |
| `catalogPricing_price` | decimal | No | Base price (DECIMAL 19,4). |
| `catalogPricing_currencyId` | number | No | Currency reference. |
| `catalogPricing_delta` | string | No | `'+'` to add or `'-'` to subtract the adjustment `value`. |
| `catalogPricing_value` | decimal | No | Adjustment amount (DECIMAL 10,2). |
| `catalogPricing_type` | string | No | `'flat'` or `'percentage'`. |
| `catalogPricing_validFrom` | datetime | No | Start of this pricing rule's validity window. |
| `catalogPricing_validTo` | datetime | No | End of this pricing rule's validity window. |
| `catalogPricing_minQuantity` | number | No | Minimum quantity for the rule to apply. |
| `catalogPricing_maxQuantity` | number | No | Maximum quantity for the rule to apply. |
| `catalogPricing_customerSegment` | string | No | `'regular'`, `'vip'`, `'corporate'`, or `'group'`. |
| `catalogPricing_region` | JSON | No | Region filter object (serialized to a JSON string on write, parsed back on read). |
| `catalogPricing_dayOfWeek` | string | No | Comma-separated days, e.g. `'monday,friday'`. |
| `catalogPricing_conditions` | JSON | No | Free-form conditions object (serialized on write, parsed back on read). |

### Example — Add (POST)

```json
{
  "actionPerformerURDD": 42,
  "catalogPricing_baseTable": "services",
  "catalogPricing_recordId": 15,
  "catalogPricing_price": 120.0000,
  "catalogPricing_currencyId": 1,
  "catalogPricing_delta": "+",
  "catalogPricing_value": 10.00,
  "catalogPricing_type": "percentage",
  "catalogPricing_validFrom": "2026-07-01 00:00:00",
  "catalogPricing_validTo": "2026-12-31 23:59:59",
  "catalogPricing_minQuantity": 1,
  "catalogPricing_maxQuantity": 5,
  "catalogPricing_customerSegment": "vip",
  "catalogPricing_region": { "country": "AE" },
  "catalogPricing_dayOfWeek": "friday,saturday",
  "catalogPricing_conditions": { "channel": "online" }
}
```

---

## Response

List returns an array of pricing rows plus `table_count` (page size 10), ordered by `pricing_id DESC`; View returns the single matching row. On reads, `catalogPricing_region` and `catalogPricing_conditions` are parsed from their stored JSON strings back into objects.

```json
{
  "id": 31,
  "catalogPricing_pricingId": 31,
  "catalogPricing_baseTable": "services",
  "catalogPricing_recordId": 15,
  "catalogPricing_price": "120.0000",
  "catalogPricing_currencyId": 1,
  "catalogPricing_delta": "+",
  "catalogPricing_value": "10.00",
  "catalogPricing_type": "percentage",
  "catalogPricing_validFrom": "2026-07-01T00:00:00.000Z",
  "catalogPricing_validTo": "2026-12-31T23:59:59.000Z",
  "catalogPricing_minQuantity": 1,
  "catalogPricing_maxQuantity": 5,
  "catalogPricing_customerSegment": "vip",
  "catalogPricing_region": { "country": "AE" },
  "catalogPricing_dayOfWeek": "friday,saturday",
  "catalogPricing_conditions": { "channel": "online" },
  "catalogPricing_status": "active",
  "catalogPricing_createdBy": 42,
  "catalogPricing_updatedBy": 42,
  "catalogPricing_createdAt": "2026-07-01T10:00:00.000Z",
  "catalogPricing_updatedAt": "2026-07-01T10:00:00.000Z"
}
```

---

## Behavior

- **JSON serialization on write.** A pre-process function (`catalogPricingWritePreProcess`) runs on **Add** and **Update**: `catalogPricing_region` and `catalogPricing_conditions` are `JSON.stringify`-ed (if not already strings) before the INSERT/UPDATE, so the driver receives plain strings.
- **JSON parse on read.** A post-process function (`catalogPricingReadPostProcess`) runs on **List** and **View**: the same two fields are parsed back into objects (falls back to the raw value if parsing fails).
- **Soft delete.** Delete sets `status = 'inactive'` and updates `updated_by`; the row is retained.
- **List filtering & order.** List returns only `status != 'inactive'`, newest first (`ORDER BY pricing_id DESC`).
- **Add defaults `status = 'active'`.**

---

## Source Files

| File | Purpose |
|---|---|
| `Src/Apis/ProjectSpecificApis/CatalogPricingCrud/CatalogPricingCrud.js` | API object (`global.CatalogPricingCrud_object`) — CRUD SQL, JSON serialize/parse pre/post processors |
| `Src/Apis/ProjectSpecificApis/CatalogPricingCrud/CRUD_parameters.js` | Request parameter schema + `colMapper` |
