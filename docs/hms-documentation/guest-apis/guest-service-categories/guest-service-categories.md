# Guest Service Categories

**GET** `/api/guest/service-categories`

Returns the list of active service categories available to guests, along with their duration units and amenity chips.

---

## Authentication

Uses **PUBLIC_ENCRYPTED_PLATFORM** — no JWT required, but requests must be encrypted via the standard platform encryption layer.

### Tenancy and actionPerformerURDD

This endpoint's initial SQL passes through the query resolver. When `TENANCY_CHECK` is enabled, sending a tenant-specific URDD will scope results to that tenant's categories only. To get the full cross-tenant list, the frontend must send the **global URDD** (`tenantUrddMap.global`, which has `tenant_id = NULL`).

See [Multi-Tenant Query Scoping](/docs/backend/tenancy) for details.

---

## Request Payload

This endpoint takes no request parameters. Send an empty encrypted body.

### Example

```json
{}
```

---

## Behavior

1. Fetches all rows from `service_categories` where `status = 'active'`. Only categories linked to services from **active tenants** (`t.status = 'active' AND t.is_active = 1`) are considered.
2. Excludes hidden categories (`networking`, `room-service`) which are internal-only per Phase 6.
3. Deduplicates by `slug` — if multiple rows share the same slug, only one entry is returned (lowest `category_id` wins).
4. For each category, resolves the `duration_unit` from `hms_config` (key: `duration_unit`). Falls back to `"session"` when no config row exists.
5. For each category, batch-fetches amenity chips from `hms_config` (key: `keyword_tags`), deduplicating chips by key within each category.
6. Derives `standaloneBookable` — all categories are standalone-bookable except `stay`, which is the unit-assignment anchor and can only be booked as part of a package or room flow.
7. Parses the `label` column as JSON (`{ en, ar }`). If it's a plain string, wraps it as `{ en: value, ar: "" }`.
8. Results are ordered by `sort_order ASC`, then `category_id ASC`.
9. Pagination is disabled — the full list is always returned.

---

## Response

### Success (200)

```json
[
  {
    "id": "stay",
    "categoryId": 3,
    "label": { "en": "Stay", "ar": "إقامة" },
    "icon": "bed",
    "unit": "night",
    "standaloneBookable": false,
    "amenities": [
      {
        "id": 42,
        "key": "wifi",
        "label": { "en": "Free WiFi", "ar": "واي فاي مجاني" },
        "groupOrder": 1,
        "keywordOrder": 1
      }
    ],
    "createdAt": "2026-01-15T10:30:00.000Z"
  },
  {
    "id": "dining",
    "categoryId": 5,
    "label": { "en": "Dining", "ar": "مطاعم" },
    "icon": "utensils",
    "unit": "meal",
    "standaloneBookable": true,
    "amenities": [],
    "createdAt": "2026-01-15T10:30:00.000Z"
  }
]
```

### Response Field Reference

| Field | Type | Description |
|---|---|---|
| `id` | `string` | Category slug (e.g. `"stay"`, `"dining"`, `"spa"`). Used as the unique identifier. |
| `categoryId` | `number` | Database `category_id` from `service_categories`. |
| `label` | `{ en, ar }` | Localized category name. |
| `icon` | `string\|null` | Icon identifier for the category. |
| `unit` | `string` | Duration unit for services in this category (`"night"`, `"meal"`, `"session"`, `"ride"`, `"visit"`). |
| `standaloneBookable` | `boolean` | `true` for all categories except `stay`. Stay services require a room/package booking flow. |
| `amenities` | `array` | Amenity chips associated with this category (from `keyword_tags` config). |
| `amenities[].id` | `number` | `hms_config.id` of the chip row. |
| `amenities[].key` | `string` | Machine-readable amenity key (e.g. `"wifi"`, `"pool"`). |
| `amenities[].label` | `{ en, ar }` | Localized amenity label. |
| `amenities[].groupOrder` | `number` | 1-based index of the chip's header group within the category. |
| `amenities[].keywordOrder` | `number` | 1-based index of the chip within its header group. |
| `createdAt` | `string\|null` | ISO 8601 timestamp of category creation. |

---

## Hidden Categories

The following category slugs are always excluded from this endpoint:

| Slug | Reason |
|---|---|
| `networking` | Internal-only, not guest-facing (Phase 6). |
| `room-service` | Handled through a separate in-room flow (Phase 6). |

---

## Error Responses

| Status | Message | Condition |
|---|---|---|
| 500 | `Failed to fetch service categories` | Internal query or processing error. |
