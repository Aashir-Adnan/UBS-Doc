# Filter Options (Split APIs)

Individual endpoints that return one filter category each, instead of the unified `GET /api/guest/filterOptions`.

All endpoints use **GET** and **PUBLIC_ENCRYPTED_PLATFORM** (encrypted, no JWT required).

---

## Filter Options Keys

**GET** `/api/filter/options/keys`

Returns an array of all available filter option path segments. Use each value to call `GET /api/filter/options/<key>`.

### Response Example

```json
[
  "pricerange",
  "views",
  "sort",
  "hotelbrands",
  "roomtypes",
  "amenities",
  "rating",
  "stayduration"
]
```

---

## Price Range

**GET** `/api/filter/options/pricerange`

Returns the global min/max price across all active services and packages.

### Query Parameters

| Parameter | Type | Required | Description |
|---|---|---|---|
| `hotelId` | `string` | No | Comma-separated hotel IDs to scope the price range. |

### Response Example

```json
{
  "param": { "min": "minPrice", "max": "maxPrice" },
  "min": 50,
  "max": 5000,
  "currency": "SAR"
}
```

### Response Fields

| Field | Type | Description |
|---|---|---|
| `param` | `object` | Query parameter names for the search/filter API. |
| `min` | `number` | Lowest active catalog price. |
| `max` | `number` | Highest active catalog price. |
| `currency` | `string` | ISO 4217 currency code. |

---

## Views

**GET** `/api/filter/options/views`

Returns available view types (e.g. sea, garden, city, pool) with service counts.

### Query Parameters

| Parameter | Type | Required | Description |
|---|---|---|---|
| `hotelId` | `string` | No | Comma-separated hotel IDs to scope counts. |

### Response Example

```json
{
  "param": "viewType",
  "options": [
    { "id": 1, "key": "sea", "label": { "en": "Sea View", "ar": "إطلالة بحرية" }, "count": 12 },
    { "id": 2, "key": "garden", "label": { "en": "Garden", "ar": "حديقة" }, "count": 8 },
    { "id": 3, "key": "city", "label": { "en": "City", "ar": "مدينة" }, "count": 15 },
    { "id": 4, "key": "pool", "label": { "en": "Pool", "ar": "مسبح" }, "count": 5 }
  ]
}
```

### Response Fields

| Field | Type | Description |
|---|---|---|
| `param` | `string` | Query parameter name for the search/filter API. |
| `options[].id` | `number` | Option identifier. |
| `options[].key` | `string` | Machine key for filtering. |
| `options[].label` | `object` | Bilingual display label `{ en, ar }`. |
| `options[].count` | `number` | Number of services matching this view type. |

---

## Sort

**GET** `/api/filter/options/sort`

Returns available sort options.

### Response Example

```json
{
  "param": "sort",
  "options": [
    { "id": 1, "key": "recommended", "label": { "en": "Recommended", "ar": "موصى به" }, "default": true },
    { "id": 2, "key": "priceAsc", "label": { "en": "Price: Low To High", "ar": "السعر: من الأقل" } },
    { "id": 3, "key": "priceDesc", "label": { "en": "Price: High To Low", "ar": "السعر: من الأعلى" } },
    { "id": 4, "key": "highestRated", "label": { "en": "Highest Rated", "ar": "الأعلى تقييماً" } },
    { "id": 5, "key": "newest", "label": { "en": "Newest", "ar": "الأحدث" } }
  ]
}
```

---

## Hotel Brands

**GET** `/api/filter/options/hotelbrands`

Returns all active hotel/tenant brands.

### Query Parameters

| Parameter | Type | Required | Description |
|---|---|---|---|
| `hotelId` | `string` | No | Comma-separated hotel IDs to scope results. |

### Response Example

```json
{
  "param": "hotelId",
  "options": [
    { "id": 1, "key": "makkah-royal-suites", "label": { "en": "Makkah Royal Suites", "ar": "Makkah Royal Suites" } },
    { "id": 56, "key": "dar-al-taqwa-hotel", "label": { "en": "Dar Al-Taqwa Hotel", "ar": "Dar Al-Taqwa Hotel" } }
  ]
}
```

---

## Room Types

**GET** `/api/filter/options/roomtypes`

Returns available room type categories with service counts.

### Query Parameters

| Parameter | Type | Required | Description |
|---|---|---|---|
| `hotelId` | `string` | No | Comma-separated hotel IDs to scope counts. |

### Response Example

```json
{
  "param": "roomType",
  "options": [
    { "id": 100, "key": "deluxe", "label": { "en": "Deluxe", "ar": "ديلوكس" }, "count": 10 },
    { "id": 101, "key": "suite", "label": { "en": "Suite", "ar": "جناح" }, "count": 6 }
  ]
}
```

---

## Amenities

**GET** `/api/filter/options/amenities`

Returns available amenity filters with service counts. Only returns amenities from the allowed set: `wifi`, `pool`, `spa`, `gym`, `breakfast`, `room-service`, `parking`, `kids-club`, `laundry`, `airport-transfer`.

### Query Parameters

| Parameter | Type | Required | Description |
|---|---|---|---|
| `hotelId` | `string` | No | Comma-separated hotel IDs to scope counts. |

### Response Example

```json
{
  "param": "amenity",
  "options": [
    { "id": 200, "key": "wifi", "label": { "en": "WiFi", "ar": "واي فاي" }, "count": 20 },
    { "id": 201, "key": "pool", "label": { "en": "Pool", "ar": "مسبح" }, "count": 5 },
    { "id": 202, "key": "spa", "label": { "en": "Spa", "ar": "سبا" }, "count": 8 }
  ]
}
```

---

## Rating

**GET** `/api/filter/options/rating`

Returns the rating filter configuration.

### Response Example

```json
{
  "param": "minRating",
  "min": 3,
  "max": 5,
  "step": 0.5
}
```

### Response Fields

| Field | Type | Description |
|---|---|---|
| `param` | `string` | Query parameter name for the search/filter API. |
| `min` | `number` | Minimum selectable rating. |
| `max` | `number` | Maximum selectable rating. |
| `step` | `number` | Step increment between ratings. |

---

## Stay Duration

**GET** `/api/filter/options/stayduration`

Returns stay duration bucket options.

### Response Example

```json
{
  "param": "stayDuration",
  "options": [
    { "id": 1, "key": "1-3", "label": { "en": "1-3 Nights", "ar": "١–٣ ليال" } },
    { "id": 2, "key": "4-7", "label": { "en": "4-7 Nights", "ar": "٤–٧ ليال" } },
    { "id": 3, "key": "8-14", "label": { "en": "8-14 Nights", "ar": "٨–١٤ ليلة" } },
    { "id": 4, "key": "15+", "label": { "en": "15+ Nights", "ar": "١٥+ ليلة" } }
  ]
}
```

---

## Error Responses

All endpoints return standard HMS error format on failure:

```json
{
  "statusCode": 500,
  "message": "Failed to fetch <option type>"
}
```

---

## Related Endpoints

- [Guest Filter Options (unified)](/hms-documentation/guest-apis/guest-search-filter/guest-search-filter) — `GET /api/guest/filterOptions` returns all filter options in a single call.
- [Guest Search & Filter](/hms-documentation/guest-apis/guest-search-filter/guest-search-filter) — `GET /api/guest/search/filter` uses the `param` values from these responses as query parameters.

---

## Source Files

| File | Purpose |
|---|---|
| `Src/Apis/ProjectSpecificApis/GuestSpecificApis/FilterOptionsKeys/FilterOptionsKeys.js` | Keys API object |
| `Src/Apis/ProjectSpecificApis/GuestSpecificApis/FilterOptionsPricerange/FilterOptionsPricerange.js` | Price range API object |
| `Src/Apis/ProjectSpecificApis/GuestSpecificApis/FilterOptionsViews/FilterOptionsViews.js` | Views API object |
| `Src/Apis/ProjectSpecificApis/GuestSpecificApis/FilterOptionsSort/FilterOptionsSort.js` | Sort API object |
| `Src/Apis/ProjectSpecificApis/GuestSpecificApis/FilterOptionsHotelbrands/FilterOptionsHotelbrands.js` | Hotel brands API object |
| `Src/Apis/ProjectSpecificApis/GuestSpecificApis/FilterOptionsRoomtypes/FilterOptionsRoomtypes.js` | Room types API object |
| `Src/Apis/ProjectSpecificApis/GuestSpecificApis/FilterOptionsAmenities/FilterOptionsAmenities.js` | Amenities API object |
| `Src/Apis/ProjectSpecificApis/GuestSpecificApis/FilterOptionsRating/FilterOptionsRating.js` | Rating API object |
| `Src/Apis/ProjectSpecificApis/GuestSpecificApis/FilterOptionsStayduration/FilterOptionsStayduration.js` | Stay duration API object |
| `Src/HelperFunctions/Guest/v2/guestDiscoveryData.js` | Shared filter data fetching functions |

---

## Change Log

| Date | Change |
|---|---|
| 2026-07-02 | Initial creation — split filter options into individual endpoints |
