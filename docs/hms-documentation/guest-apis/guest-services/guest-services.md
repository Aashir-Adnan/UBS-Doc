# Guest Services

**GET** `/api/guest/services`

Fetches the guest-facing services catalog. Operates in two modes depending on whether a `serviceId` is provided in the request payload.

---

## Authentication

Uses **PUBLIC_ENCRYPTED_PLATFORM** — no JWT required, but requests must be encrypted via the standard platform encryption layer.

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
  "termsAndConditions": { "en": "", "ar": "" }
}
```

Returns `null` if the service does not exist, is not published, or belongs to a hidden category.

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

---

## Query Behavior

The endpoint applies several filters beyond the request parameters:

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
