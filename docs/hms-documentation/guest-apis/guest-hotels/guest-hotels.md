# Guest Hotels

**GET** `/api/guest/hotels`

Returns a list of all active hotels (tenants) with basic info, rating, review count, and minimum stay cost per night. Used for hotel discovery and listing screens.

---

## Authentication

Uses **PUBLIC_ENCRYPTED_PLATFORM** — encrypted request/response using the platform key only. No guest JWT required.

---

## Query Parameters

| Parameter | Type | Required | Default | Description |
|---|---|---|---|---|
| `q` | `string` | No | — | Free-text search. Matches against the hotel's denormalized `search_text` column (includes hotel name, city, address, translations). |
| `cityId` | `number` | No | — | Filter hotels by city FK. Use the `cityId` returned from the landmarks CRUD endpoint. |

---

## Request Examples

### All hotels

```
GET /api/guest/hotels
```

### Hotels in a specific city

```
GET /api/guest/hotels?cityId=1
```

### Text search

```
GET /api/guest/hotels?q=Makkah
```

---

## Response Example

```json
[
  {
    "id": 16,
    "key": "al-madinah-hilton",
    "label": { "en": "Al Madinah Hilton", "ar": "هيلتون المدينة" },
    "city": { "en": "Madinah", "ar": "المدينة المنورة" },
    "cityId": 2,
    "country": { "en": "Saudi Arabia", "ar": "المملكة العربية السعودية" },
    "address": { "en": "King Faisal Road", "ar": "طريق الملك فيصل" },
    "images": ["https://cdn.example.com/logos/hilton.png"],
    "rating": 4.3,
    "reviewCount": 215,
    "minStayCostPerNight": 350.00,
    "coordinates": { "lat": 24.4672, "lng": 39.6112 }
  }
]
```

---

## Response Fields

| Field | Type | Description |
|---|---|---|
| `id` | `number` | Tenant/hotel ID. |
| `key` | `string` | Tenant slug, or stringified tenant ID if no slug. |
| `label` | `object` | Bilingual hotel name `{ en, ar }`. |
| `city` | `object` | Bilingual city name `{ en, ar }`. |
| `cityId` | `number\|null` | City FK. Can be used to filter search results by city. |
| `country` | `object` | Bilingual country name `{ en, ar }`. |
| `address` | `object` | Bilingual street address `{ en, ar }`. |
| `images` | `string[]` | Array of image URLs. Currently contains the tenant logo if set, otherwise empty. |
| `rating` | `number` | Average star rating across all services **and** packages for this hotel (0–5, one decimal). `0` if no reviews. |
| `reviewCount` | `number` | Total number of guest reviews/feedback across all services and packages. |
| `minStayCostPerNight` | `number\|null` | Cheapest stay-category service price per night (`catalog_pricing.price / duration`). `null` if no stay services with pricing exist. |
| `coordinates` | `object` | `{ lat, lng }` GPS coordinates. Omitted entirely if latitude/longitude are not set. |

---

## Notes

- Only returns tenants with `tenant_type` of `'hotel'` or `'branch'`, `status = 'active'`, and `is_active = 1`.
- Results are sorted by `rating DESC`, then `tenant_name ASC`.
- Rating is computed as `AVG(feedback.star_rating)` across all active services **and** packages for the tenant, rounded to 1 decimal place.
- `minStayCostPerNight` is `MIN(catalog_pricing.price / GREATEST(duration, 1))` across all active stay-category services. Duration is read from the service's `hms_config` (`config_key = 'duration'`), defaulting to 1 if unset.
- Bilingual fields attempt to parse JSON `{ en, ar }` from the database value. If the value is plain text, both `en` and `ar` will contain the same string.

---

## Related Endpoints

- [Guest Hotel Details](/hms-documentation/guest-apis/guest-hotel-details/guest-hotel-details) — `GET /api/guest/hotel/details?hotelId=<id>` returns full details for a single hotel.
- [Filter Options: Hotel Brands](/hms-documentation/guest-apis/filter-options/filter-options) — `GET /api/filter/options/hotelbrands` returns hotel brand options for filtering.

---

## Source Files

| File | Purpose |
|---|---|
| `Src/Apis/ProjectSpecificApis/GuestSpecificApis/GuestHotels/GuestHotels.js` | API object definition |
| `Src/Apis/ProjectSpecificApis/GuestSpecificApis/GuestHotels/CRUD_parameters.js` | Request parameter schema |
| `Src/HelperFunctions/Guest/v2/guestDiscoveryData.js` | `listGuestHotels()` query and response builder |

---

## Change Log

| Date | Change |
|---|---|
| 2026-07-06 | Initial creation. Includes `rating` (services + packages), `reviewCount`, and `minStayCostPerNight`. |
| 2026-07-12 | Added `q` and `cityId` query parameters. Added `cityId` to response fields. |
