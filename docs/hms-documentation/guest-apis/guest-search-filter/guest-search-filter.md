# Guest Search & Filter

**GET** `/api/guest/search/filter`

Unified search and filter endpoint for discovering rooms, services, and packages. Returns paginated results in the same landing-card format as the GuestLanding endpoint. Supports free-text search, price range, rating, availability dates, occupancy, room/amenity/view type filters, stay duration buckets, and arbitrary config-based filters.

---

## Authentication

Uses **PUBLIC_ENCRYPTED_PLATFORM** — encrypted request/response using the platform key only. No guest JWT required.

---

## Query Parameters

All parameters are passed as query string values.

### Core Filters

| Parameter | Type | Required | Default | Description |
|---|---|---|---|---|
| `q` | `string` | No | — | Free-text search. Matches against service name, description, and short description (LIKE match). |
| `hotelId` | `string` | No | all hotels | Comma-separated hotel/tenant IDs. Example: `"3,16"`. |
| `include` | `string` | No | `"rooms,services,packages"` | Comma-separated entity types to return. Valid values: `rooms`, `services`, `packages`. |
| `tag` | `string` | No | — | Category slug filter (e.g. `"stay"`, `"dining"`, `"spa"`). When `include=rooms` only, defaults to `"stay"` internally. |

### Price & Rating

| Parameter | Type | Required | Default | Description |
|---|---|---|---|---|
| `minPrice` | `number` | No | — | Minimum `current_price` (after pricing rules). Items below this are excluded. |
| `maxPrice` | `number` | No | — | Maximum `current_price`. Items above this are excluded. |
| `minRating` | `number` | No | — | Minimum average star rating (0–5). |

### Sorting

| Parameter | Type | Required | Default | Description |
|---|---|---|---|---|
| `sort` | `string` | No | `"recommended"` | Sort order for results. See sort options below. |

**Sort options:**

| Value | Aliases | Description |
|---|---|---|
| `recommended` | *(default)* | Featured items first, then by ID. |
| `priceAsc` | `priceLow`, `price_low` | Lowest `current_price` first. |
| `priceDesc` | `priceHigh`, `price_high` | Highest `current_price` first. |
| `highestRated` | `ratingHigh`, `rating`, `topRated` | Highest average rating first. |
| `newest` | `latest` | Most recently created first. |

### Availability & Occupancy

| Parameter | Type | Required | Default | Description |
|---|---|---|---|---|
| `checkIn` | `string` | No | — | Check-in date (`YYYY-MM-DD`). Filters rooms/packages to only those with available units for this date range. |
| `checkOut` | `string` | No | — | Check-out date (`YYYY-MM-DD`). Must be used together with `checkIn`. |
| `adults` | `number` | No | — | Number of adults. Services/packages must support at least this many (`max_adults >= adults`). |
| `children` | `number` | No | — | Number of children. Services/packages must support at least this many (`max_children >= children`). |
| `maxOccupancy` | `number` | No | — | Total occupancy. Services/packages must support at least this total (`max_adults + max_children >= maxOccupancy`). |

### Attribute Filters

| Parameter | Type | Required | Default | Description |
|---|---|---|---|---|
| `roomType` | `string` | No | — | Comma-separated room-type keyword keys. Example: `"deluxe,suite"`. Matches against `keyword_tags` config where `$.key` matches. |
| `viewType` | `string` | No | — | Comma-separated view keyword keys. Example: `"city-view,sea-view"`. Matches against `keyword_tags` config. |
| `amenity` | `string` | No | — | Comma-separated amenity keyword keys. Example: `"wifi,pool,gym"`. Matches against `amenities_tags` config. |
| `stayDuration` | `string` | No | — | Stay duration bucket. Filters packages by their configured duration or stay service min/max nights. |

**Stay duration buckets:**

| Value | Range |
|---|---|
| `1-3` | 1–3 nights |
| `4-7` | 4–7 nights |
| `8-14` | 8–14 nights |
| `15+` | 15+ nights |

### Config-Based Filters

| Parameter | Type | Required | Default | Description |
|---|---|---|---|---|
| `filters` | `string` | No | — | JSON-encoded array of `{key, value}` objects. Matches `hms_config` rows where `config_key = key` AND `config_value LIKE '%value%'`. All filters are ANDed together. |

**Example:**

```
filters=[{"key":"is_featured","value":"true"},{"key":"keyword_tags","value":"luxury"}]
```

### Pagination

| Parameter | Type | Required | Default | Description |
|---|---|---|---|---|
| `page` | `number` | No | `1` | Page number (1-based). |
| `pageSize` | `number` | No | `20` | Items per page (max 100). |

### Response Mode

| Parameter | Type | Required | Default | Description |
|---|---|---|---|---|
| `detailed` | `boolean` | No | `false` | When `true`, returns full detailed objects (with `formSchema`, `operatingHours`, etc.) instead of minimal landing cards. |

---

## Example Requests

### Basic text search

```
GET /api/guest/search/filter?q=spa&hotelId=16
```

### Rooms with price range and availability

```
GET /api/guest/search/filter?include=rooms&hotelId=16&minPrice=200&maxPrice=1500&checkIn=2026-07-01&checkOut=2026-07-04&adults=2
```

### Packages sorted by price

```
GET /api/guest/search/filter?include=packages&hotelId=16&sort=priceAsc
```

### Filtered by amenity and room type

```
GET /api/guest/search/filter?include=rooms&hotelId=16&amenity=wifi,pool&roomType=suite&viewType=city-view
```

### Config-based filter for featured items

```
GET /api/guest/search/filter?hotelId=16&filters=[{"key":"is_featured","value":"true"}]
```

---

## Response

### Success (200)

```json
{
  "items": [
    {
      "id": 345,
      "hotelId": 16,
      "name": { "en": "Family Fun Package", "ar": "باقة المرح العائلي" },
      "description": { "en": "Stay with kids club access and daily breakfast", "ar": "إقامة مع نادي أطفال وإفطار يومي" },
      "images": [228, 238, 232],
      "base_price": 1800,
      "current_price": 1800,
      "currency": "SAR",
      "is_featured": true,
      "additional_attributes": {
        "tags": [
          { "en": "Family", "ar": "عائلي" }
        ]
      },
      "rating": { "total_stars": 0, "total_ratings": 0 },
      "ratingAvg": null,
      "reviewCount": 0,
      "viewers": { "count": 0, "avatars": [] }
    },
    {
      "id": 346,
      "hotelId": 16,
      "name": { "en": "Wellness Retreat", "ar": "باقة الاسترخاء" },
      "base_price": 2000,
      "current_price": 2000,
      "currency": "SAR"
    },
    {
      "id": 344,
      "hotelId": 16,
      "name": { "en": "Romantic Getaway", "ar": "عطلة رومانسية" },
      "base_price": 2500,
      "current_price": 2500,
      "currency": "SAR"
    }
  ],
  "pagination": {
    "page": 1,
    "pageSize": 20,
    "totalItems": 3,
    "totalPages": 1
  }
}
```

Items are returned in the same shape as the [Guest Landing](../guest-landing/guest-landing.md) endpoint. When `detailed=true`, each item includes the full detail shape (formSchema, operatingHours, cancellation_info, termsAndConditions, etc.).

### Empty Results (200)

```json
{
  "items": [],
  "pagination": {
    "page": 1,
    "pageSize": 20,
    "totalItems": 0,
    "totalPages": 1
  }
}
```

---

## Response Fields

### Pagination

| Field | Type | Description |
|---|---|---|
| `pagination.page` | `number` | Current page number. |
| `pagination.pageSize` | `number` | Items per page. |
| `pagination.totalItems` | `number` | Total matching items across all pages. |
| `pagination.totalPages` | `number` | Total number of pages. |

### Item Fields

Each item is a landing-card object. Key fields:

| Field | Type | Description |
|---|---|---|
| `id` | `number` | Service or package ID. |
| `hotelId` | `number` | Hotel/tenant ID. |
| `name` | `{ en, ar }` | Localized name. |
| `description` | `{ en, ar }` | Localized description. |
| `images` | `number[]` | Attachment IDs for images. |
| `base_price` | `number` | Base price before pricing rules. |
| `current_price` | `number` | Price after tenant pricing rules are applied. |
| `currency` | `string` | Currency code (e.g. `"SAR"`). |
| `is_featured` | `boolean` | Whether the item is featured. |
| `additional_attributes.tags` | `array` | Keyword tags. Each: `{ en, ar }`. |
| `rating` | `object` | Rating breakdown (total_stars, total_ratings, star counts). |
| `ratingAvg` | `number\|null` | Average star rating. |
| `reviewCount` | `number` | Number of reviews. |
| `viewers` | `object` | View count stub: `{ count, avatars }`. |

For packages, additional fields include `nights`, `duration_units`, `maxAdults`, `maxChildren`, `services[]` (nested service objects).

---

## How Filtering Works

### Visibility Gate

Only services/packages that are published are returned:
- If no `visibility` config exists, the item is included (default visible).
- If `visibility` config exists, it must contain the `published` possible value.
- If `publish_start_datetime` is set, it must be in the past.
- If `publish_end_datetime` is set, it must be in the future.

### Price Filtering

Price filtering is applied in two stages:
1. **SQL-level**: Raw base price used for initial candidate selection.
2. **Post-filter**: After pricing rules are applied, `current_price` is checked against `minPrice`/`maxPrice`.

This ensures the displayed price matches what was filtered on.

### Attribute Matching (roomType, viewType, amenity)

These filters match against `hms_config` keyword tags:
- `roomType` matches `keyword_tags` entries where `$.key` equals the provided key.
- `viewType` matches `keyword_tags` entries where `$.key` equals the provided key.
- `amenity` matches `amenities_tags` entries where `$.key` equals the provided key.

Multiple values within the same filter are ORed (any match passes). Filters across different types are ANDed.

### Availability Filtering

When `checkIn` and `checkOut` are provided:
- For services: checks that at least one delivery unit is free for the date range (no overlapping `booking_items` with active bookings).
- For packages: checks the stay service within the package for unit availability.

### Stay Duration Filtering (packages only)

Filters packages based on their configured stay duration:
1. If the package has a `duration` config, that value is used directly.
2. Otherwise, the stay service's `min_stay_nights`/`max_stay_nights` configs determine the range.
3. The bucket range must overlap with the package's allowed range.

---

## Error Responses

| Status | Message | Condition |
|---|---|---|
| 500 | `Failed to fetch search results` | Internal query or processing error. |

---

## Source Files

| File | Purpose |
|---|---|
| `Src/Apis/ProjectSpecificApis/GuestSpecificApis/GuestSearchFilter/GuestSearchFilter.js` | API object + query param parsing |
| `Src/HelperFunctions/Guest/v2/searchFilterHelper.js` | Orchestrator: combines search + config filters + pagination + post-sort |
| `Src/HelperFunctions/Guest/v2/searchQueries.js` | SQL search logic for services and packages |
| `Src/HelperFunctions/Guest/v2/landingObjects.js` | Builds full landing-card objects from IDs |
| `Src/HelperFunctions/Guest/v2/packageObjects.js` | Builds detailed package objects |
