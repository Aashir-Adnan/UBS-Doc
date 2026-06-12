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
      "rating": {
        "total_stars": 14,
        "total_ratings": 3,
        "5_stars": 2,
        "4_stars": 1,
        "3_stars": 0,
        "2_stars": 0,
        "1_stars": 0,
        "reviews": [
          { "title": "Excellent experience", "description": "Really enjoyed Deluxe Room." },
          { "title": "Very good", "description": "Great stay overall." }
        ]
      },
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

Returns a single service object with the same base fields as list items, plus additional detail fields. `formSchema` is **always** an array (empty `[]` when the category has no form fields configured).

```json
{
  "id": 13,
  "hotelId": 3,
  "name": { "en": "Fine Dining", "ar": "مطعم فاخر" },
  "description": { "en": "Exquisite dining experience", "ar": null },
  "base_price": 200,
  "current_price": 200,
  "currency": "SAR",
  "images": [42, 43],
  "duration": 2,
  "duration_units": "hour",
  "type": "Service",
  "view_count": 5,
  "is_featured": false,
  "rating": {
    "total_stars": 14,
    "total_ratings": 3,
    "5_stars": 2,
    "4_stars": 1,
    "3_stars": 0,
    "2_stars": 0,
    "1_stars": 0,
    "reviews": [
      { "title": "Excellent experience", "description": "Really enjoyed Fine Dining." }
    ]
  },
  "additional_attributes": {
    "physical_dimension": { "L": 0, "W": 0, "H": 0 },
    "tags": [{ "en": "premium", "ar": "متميز" }]
  },
  "maxAdults": 4,
  "maxChildren": 2,
  "minAdults": 1,
  "minNights": null,
  "maxNights": null,
  "sessionDurationMinutes": 120,
  "category": {
    "id": 2,
    "name": "Dining"
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
      "key": "email",
      "label": "Email",
      "type": "text",
      "isRequired": true,
      "autoDerivable": true
    },
    {
      "key": "phone",
      "label": "Phone",
      "type": "text",
      "isRequired": true,
      "autoDerivable": true
    },
    {
      "key": "reservation_date",
      "label": "Reservation Date",
      "type": "datetime",
      "isRequired": true,
      "autoDerivable": true
    },
    {
      "key": "party_size",
      "label": "Party Size",
      "type": "number",
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
        { "value": "breakfast", "label": { "en": "breakfast", "ar": "فطور" } },
        { "value": "lunch", "label": { "en": "lunch", "ar": "غداء" } },
        { "value": "dinner", "label": { "en": "dinner", "ar": "عشاء" } }
      ]
    }
  ]
}
```

Returns `null` if the service does not exist, is not published, or belongs to a hidden category.

#### Form Schema (Detail Mode)

`formSchema` is **always present** on detail objects — it is an empty array `[]` when the category has no form fields, never `undefined` or `null`. This was fixed on 2026-06-10; previously it was only attached when non-empty.

Each field has the following shape:

| Field | Type | Description |
|---|---|---|
| `key` | `string` | Machine-readable field key (e.g. `"full_name"`, `"meal_type"`). |
| `label` | `string` | Human-readable display label. |
| `type` | `string` | Input type: `"text"`, `"number"`, `"checkbox"`, `"datetime"`, `"dropdown"`. |
| `isRequired` | `boolean` | Whether the field is required for booking. |
| `autoDerivable` | `boolean` | Whether the server auto-fills this from the guest profile (client should not prompt for input). |
| `options` | `array` | **Dropdown only.** Array of selectable values. Absent for non-dropdown types. |

#### Dropdown Options Resolution

For `type: "dropdown"` fields, `options` is always a non-empty array. Each option has:

```json
{ "value": "breakfast", "label": { "en": "breakfast", "ar": "فطور" } }
```

| Field | Type | Description |
|---|---|---|
| `value` | `string` | The value to submit in `formData` when booking. |
| `label.en` | `string` | English display label. |
| `label.ar` | `string` | Arabic display label. |

Options are resolved from `hms_config_possible_values` in two ways:
1. **Primary**: The `hms_config_keys.possible_values` column stores a JSON object keyed by `category_id` mapping to arrays of `hms_config_possible_values.id` — this gives category-specific option sets.
2. **Fallback**: If the `possible_values` column is NULL or has no entries for the category, all `hms_config_possible_values` rows linked via `config_id` FK are returned.

Possible value JSON supports three shapes:
- `{"en": "breakfast", "ar": "فطور"}` — value = `en` string
- `{"label": {"en": "Stay", "ar": "إقامة"}, "key": "stay"}` — value = `key` string
- Plain string — value = the string itself

**Auto-derivable fields** (`autoDerivable: true`) are fields the server can fill automatically from the guest's profile or the request context. The client should not require the guest to manually enter these. The auto-derivable keys are: `full_name`, `email`, `phone`, `party_size`, `reservation_date`, `meal_type`.

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
| `maxAdults` | `number\|null` | Detail | Maximum adults allowed per booking. From `max_adults` config, falls back to `max_persons_per_booking`. |
| `maxChildren` | `number\|null` | Detail | Maximum children allowed per booking. From `max_children` config, falls back to `max_children_per_guardian`. |
| `minAdults` | `number\|null` | Detail | Minimum adults per booking (from `min_persons_per_booking`). |
| `minNights` | `number\|null` | Detail | Minimum stay nights (stay category only). |
| `maxNights` | `number\|null` | Detail | Maximum stay nights (stay category only). |
| `sessionDurationMinutes` | `number\|null` | Detail | Session duration in minutes (from `slot_duration_minutes`). |
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

### `guestFormSchemaDropdownCheck.js` — FormSchema dropdown validation

Verifies that every dropdown field in `formSchema` has a non-empty `options[]` array with valid `{value, label:{en,ar}}` entries.

| Step | What it proves |
|---|---|
| 1: DB audit | Every dropdown `hms_config_keys` row (category_id=12) has possible values via the `possible_values` column or `config_id` FK fallback. |
| 2: Service formSchema | Each category's dropdown fields return resolved `options[]` arrays. Validates field shape (`key`, `label`, `type`, `isRequired`). |
| 3: Summary | Reports all dropdown fields and their option counts. |
| 4: Package line items | Dropdown options also resolve in `services[].formSchema` inside package detail responses. |

### Running the tests

```bash
# Consistency test (read-only, no DB writes)
node Services/SysScripts/TestScripts/sim/guestLandingDetailConsistency.js

# FormSchema dropdown validation
node Services/SysScripts/TestScripts/sim/guestFormSchemaDropdownCheck.js

# Data audit + seed (writes missing config/feedback rows)
node Services/SysScripts/TestScripts/sim/guestDataAuditAndSeed.js
```

---

## Change Log

| Date | Change |
|---|---|
| 2026-06-11 | Added `maxAdults`, `maxChildren`, `minAdults`, `minNights`, `maxNights`, `sessionDurationMinutes` to the detail response field reference. `maxAdults` and `maxChildren` use the new dedicated config keys, falling back to `max_persons_per_booking` and `max_children_per_guardian` respectively. |
| 2026-06-10 | `formSchema` is now always `[]` (never undefined) on detail objects when a category has no form fields. Previously only attached when non-empty. |
| 2026-06-10 | `fetchFormSchema` dropdown resolution now falls back to `hms_config_possible_values.config_id` FK when `hms_config_keys.possible_values` column is NULL or has no entries for the requested category. Also handles `{label:{en,ar}, key}` possible value shape. |
| 2026-06-10 | Fixed publish date filter mismatch between detail SQL and searchQueries.js. Detail SQL now uses `COALESCE($.en, $[0])` to handle both config value shapes, matching the landing/search queries. Harmonized visibility subquery to `CAST(id AS JSON)`. Added consistency tests and data audit/seed script. |
