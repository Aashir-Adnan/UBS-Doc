# Guest Services

**GET** `/api/guest/services`

Fetches the guest-facing services catalog. Operates in two modes depending on whether a `serviceId` is provided in the request payload.

---

## Authentication

Uses **PUBLIC_ENCRYPTED_PLATFORM** — no JWT required, but requests must be encrypted via the standard platform encryption layer.

### Tenancy and actionPerformerURDD

This endpoint's initial SQL passes through the query resolver. When `TENANCY_CHECK` is enabled, the query resolver reads `actionPerformerURDD` from the payload and applies a `created_by` tenant-scoping filter.

To get **cross-tenant** results (the full catalog), the frontend must send the **global URDD** (`tenantUrddMap.global`), which has `tenant_id = NULL`. A null tenant causes the tenancy filter to be skipped. Sending a tenant-specific URDD will scope results to that tenant only.

See [Multi-Tenant Query Scoping](/docs/backend/tenancy) for details.

---

## Modes

### List Mode

When no `serviceId` is provided, returns a paginated list of all published, visible services (excluding hidden categories like `networking` and `room-service`).

### Detail Mode

When `serviceId` is provided in the encrypted payload, returns a single detailed service object. The `serviceId` must be sent in the **decrypted payload body**, not as a URL path parameter.

**Important:** The service must be published and visible to guests. Services in hidden categories (`networking`, `room-service`), unpublished services, or services outside their publish window will return `null` even if the `serviceId` exists in the database.

---

## Request Payload

All fields are optional and sent in the encrypted request body.

| Field | Type | Required | Description |
|---|---|---|---|
| `serviceId` | `number` | No | If provided, returns detail for this specific service. |
| `hotelId` | `number` | No | Filter by hotel/tenant ID. |
| `categoryId` | `number` | No | Filter by service category ID. |
| `tag` | `string` | No | Filter by category slug (e.g. `"stay"`, `"dining"`, `"spa"`). |
| `standaloneOnly` | `boolean` | No | If `true`, excludes stay-category services (which are only bookable as part of a package). |
| `page` | `number` | No | Page number (default: 1). |
| `pageSize` | `number` | No | Items per page (default: 20). |

### Example: List all services

```json
{}
```

### Example: Filter by category

```json
{
  "tag": "stay",
  "page": 1,
  "pageSize": 10
}
```

### Example: Get service detail

```json
{
  "serviceId": 71
}
```

---

## Response

### List Mode (200)

```json
{
  "items": [
    {
      "id": 71,
      "hotelId": 2,
      "name": { "en": "Deluxe Room", "ar": "غرفة ديلوكس" },
      "description": { "en": "Spacious room with city view", "ar": null },
      "base_price": 450,
      "current_price": 450,
      "currency": "SAR",
      "images": [12, 13, 14],
      "duration": 1,
      "duration_units": "night",
      "type": "Service",
      "view_count": 0,
      "is_featured": false,
      "rating": null,
      "additional_attributes": {
        "physical_dimension": { "L": 0, "W": 0, "H": 0 },
        "tags": [{ "en": "luxury", "ar": "فاخر" }]
      }
    }
  ],
  "pagination": {
    "page": 1,
    "pageSize": 20,
    "totalItems": 5,
    "totalPages": 1
  }
}
```

### Detail Mode (200)

Returns a single service object with the same base fields as list items, plus additional detail fields:

```json
{
  "id": 71,
  "hotelId": 2,
  "name": { "en": "Deluxe Room", "ar": "غرفة ديلوكس" },
  "description": { "en": "Spacious room with city view", "ar": null },
  "base_price": 450,
  "current_price": 450,
  "currency": "SAR",
  "images": [12, 13, 14],
  "duration": 1,
  "duration_units": "night",
  "type": "Service",
  "view_count": 0,
  "is_featured": false,
  "rating": null,
  "additional_attributes": {
    "physical_dimension": { "L": 0, "W": 0, "H": 0 },
    "tags": []
  },
  "category": {
    "id": 1,
    "name": "Stay"
  },
  "amenities": [],
  "cancellation_info": {
    "margin": { "en": "", "ar": "" },
    "exceptions": { "en": "", "ar": "" }
  },
  "termsAndConditions": { "en": "", "ar": "" },
  "formSchema": [
    {
      "key": "full_name",
      "label": "Full Name",
      "type": "text",
      "isRequired": true,
      "autoDerivable": true
    },
    {
      "key": "meal_type",
      "label": "Meal Type",
      "type": "dropdown",
      "isRequired": true,
      "autoDerivable": true,
      "options": [
        { "value": "Breakfast", "label": { "en": "Breakfast", "ar": "إفطار" } }
      ]
    }
  ]
}
```

Returns `null` if the service does not exist, is not published, or belongs to a hidden category.

#### Form Schema (Detail Mode)

When a service's category has booking form fields configured (category 12 config keys), the detail response includes a `formSchema` array describing the fields the guest should fill in:

```json
{
  "formSchema": [
    {
      "key": "full_name",
      "label": "Full Name",
      "type": "text",
      "isRequired": true,
      "autoDerivable": true
    },
    {
      "key": "meal_type",
      "label": "Meal Type",
      "type": "dropdown",
      "isRequired": true,
      "autoDerivable": true,
      "options": [
        { "value": "Breakfast", "label": { "en": "Breakfast", "ar": "إفطار" } },
        { "value": "Lunch", "label": { "en": "Lunch", "ar": "غداء" } },
        { "value": "Dinner", "label": { "en": "Dinner", "ar": "عشاء" } }
      ]
    },
    {
      "key": "party_size",
      "label": "Party Size",
      "type": "number",
      "isRequired": true,
      "autoDerivable": true
    }
  ]
}
```

**Auto-derivable fields** (`autoDerivable: true`) are fields the server can fill automatically from the guest's profile or the request context. The client should not require the guest to manually enter these. The auto-derivable keys are: `full_name`, `email`, `phone`, `party_size`, `reservation_date`, `meal_type`.

**Dropdown options** are resolved from `hms_config_possible_values` for each service category. The `options` array is only present for `type: "dropdown"` fields that have possible values configured for the service's category.

### Response Field Reference

| Field | Type | Mode | Description |
|---|---|---|---|
| `id` | `number` | Both | Service ID. |
| `hotelId` | `number` | Both | Hotel/tenant ID. |
| `name` | `{ en, ar }` | Both | Localized service name. |
| `description` | `{ en, ar }` | Both | Localized description. |
| `base_price` | `number` | Both | Original price before pricing rules. |
| `current_price` | `number` | Both | Price after active pricing rules applied. |
| `currency` | `string` | Both | Currency code (e.g. `"SAR"`). |
| `images` | `number[]` | Both | Array of attachment IDs for service images. |
| `duration` | `number` | Both | Duration value (from config). |
| `duration_units` | `string` | Both | Duration unit (e.g. `"night"`, `"hour"`). |
| `type` | `string` | Both | Always `"Service"`. |
| `view_count` | `number` | Both | Number of views. |
| `is_featured` | `boolean` | Both | Whether the service is featured. |
| `rating` | `object\|null` | Both | Rating breakdown (null if no reviews). |
| `additional_attributes` | `object` | Both | Physical dimensions and keyword tags. |
| `category` | `{ id, name }` | Detail | Service category info. |
| `amenities` | `array` | Detail | Category amenities list. |
| `cancellation_info` | `object` | Detail | Cancellation margin and exceptions. |
| `termsAndConditions` | `{ en, ar }` | Detail | Terms and conditions text. |
| `formSchema` | `array` | Detail | Booking form fields for this service's category. Empty array if none configured. |
| `formSchema[].key` | `string` | Detail | Machine-readable field key (e.g. `"full_name"`, `"meal_type"`). |
| `formSchema[].label` | `string` | Detail | Human-readable field label. |
| `formSchema[].type` | `string` | Detail | Field type: `"text"`, `"number"`, `"checkbox"`, `"datetime"`, `"dropdown"`. |
| `formSchema[].isRequired` | `boolean` | Detail | Whether the field is required for booking. |
| `formSchema[].autoDerivable` | `boolean` | Detail | Whether the server can auto-fill this field from the guest profile. |
| `formSchema[].options` | `array\|undefined` | Detail | Dropdown options (only for `type: "dropdown"` fields with configured possible values). |

---

## Query Behavior

The endpoint applies several filters beyond the request parameters:

### Tenant Filter

Only services belonging to an **active tenant** are returned. The query joins `tenants` and requires `t.status = 'active' AND t.is_active = 1`. Services from inactive or pending tenants are silently excluded.

### Currency Resolution

Service currency is resolved in two steps. If the `base_currency` config is stored as `{"en":"SAR"}` (direct input), the code string is extracted directly. If it is stored as `[4]` (a currency ID reference), the system looks up the `currencies` table to resolve the code (e.g. `currency_id=4` → `"SAR"`). The client always receives a plain currency code string.

### Visibility Filter

Only services with a `visibility` config set to `published` (or no visibility config at all) are returned.

### Publish Window

Services with `publish_start_datetime` or `publish_end_datetime` configs are only shown when the current time falls within that window.

### Hidden Categories

Services in the `networking` and `room-service` categories are always excluded from guest-facing results.

### Sort Order

Results are ordered by:
1. Featured services first (`is_featured` config)
2. Custom sort order (`sort_order` config)
3. Category sort order
4. Service ID (ascending)

---

## Error Responses

| Status | Message | Condition |
|---|---|---|
| 500 | `Failed to fetch services` | Internal query or processing error. |

---

## Test Coverage

### `guestLandingDetailConsistency.js` — Landing/detail consistency (251 tests)

Fetches the landing feed, then individually fetches the detail for every package and service to verify nothing returns null and all fields are present.

| Step | Tests | What it proves |
|---|---|---|
| 1: Fetch landing | 1 | Landing returns items (packages + services). |
| 2: Landing shapes | ~72 | Every landing object has valid `name.en`, `images[]` (number array), `additional_attributes.tags[]` ({en,ar} pairs), `rating` (star breakdown + reviews array with title/description), `base_price`, `current_price`, `currency`. |
| 3: Package detail | ~100 | Every landing package fetched via `GET /guest/packages` with `{id}` in body returns a non-null detail with `services[]` line items, each having `id`, `name`, `packageServiceId`, `images`, `category`, `amenities`, `cancellation_info`, `termsAndConditions`. |
| 4: Service detail | ~75 | Every landing service fetched via `GET /guest/services` with `{serviceId}` in body returns a non-null detail with `category`, `amenities`, `cancellation_info`, `termsAndConditions`. |
| 5: Search consistency | 1 | Every landing item also appears in `GET /guest/search/filter` results — no filter divergence. |
| 6: Package list→detail | 1 | Every item from the paginated package list can be fetched as detail (no null). |
| 7: Service list→detail | 1 | Every item from the paginated service list can be fetched as detail (no null). |

### `guestDataAuditAndSeed.js` — Data completeness

Audits all published packages and services for required data fields. Seeds missing values so the response objects are always populated:

| Field | Config key | Seeded value |
|---|---|---|
| `images` | `media` | Reuses existing attachment IDs from other configs. |
| `tags` | `keyword_tags` | Reuses existing tag from another config, or `{en:"Popular", ar:"شائع"}`. |
| `base_price` | `base_price` | `{"en":"500"}` |
| `currency` | `base_currency` | SAR currency ID reference. |
| `rating/reviews` | `feedback` table | 3 sample reviews (5-star, 4-star, 5-star). |

### Running the tests

```bash
# Consistency test (read-only, no DB writes)
node Services/SysScripts/TestScripts/sim/guestLandingDetailConsistency.js

# Data audit + seed (writes missing config/feedback rows)
node Services/SysScripts/TestScripts/sim/guestDataAuditAndSeed.js
```

---

## Change Log

| Date | Change |
|---|---|
| 2026-06-10 | Fixed publish date filter mismatch between detail SQL and searchQueries.js. Detail SQL now uses `COALESCE($.en, $[0])` to handle both config value shapes, matching the landing/search queries. Harmonized visibility subquery to `CAST(id AS JSON)`. Added consistency tests and data audit/seed script. |
