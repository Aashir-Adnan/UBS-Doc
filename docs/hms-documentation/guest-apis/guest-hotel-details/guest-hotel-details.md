# Guest Hotel Details

**GET** `/api/guest/hotel/details`

Returns detailed information about a specific hotel given its `hotelId` (tenant ID). Includes name, logo, contact info, location with coordinates, currency, and guest ratings.

---

## Authentication

Uses **PUBLIC_ENCRYPTED_PLATFORM** — encrypted request/response using the platform key only. No guest JWT required.

---

## Query Parameters

| Parameter | Type | Required | Description |
|---|---|---|---|
| `hotelId` | `number` | Yes | The tenant ID of the hotel to fetch details for. |

---

## Request Example

```
GET /api/guest/hotel/details?hotelId=56
```

---

## Response Example

```json
{
  "id": 56,
  "name": { "en": "Dar Al-Taqwa Hotel", "ar": "Dar Al-Taqwa Hotel" },
  "slug": "dar-al-taqwa-hotel",
  "logo": null,
  "contact": {
    "email": "info@dar-al-taqwa.test",
    "phone": "+966500000000"
  },
  "location": {
    "address": { "en": "King Faisal Road", "ar": "King Faisal Road" },
    "city": { "en": "Madinah", "ar": "Madinah" },
    "state": { "en": "Madinah Region", "ar": "Madinah Region" },
    "country": { "en": "Saudi Arabia", "ar": "Saudi Arabia" },
    "postalCode": "42311",
    "coordinates": {
      "lat": 24.4672,
      "lng": 39.6112
    }
  },
  "currency": "SAR",
  "rating": 4.5,
  "reviewCount": 128,
  "minStayCostPerNight": 350.00
}
```

---

## Response Fields

| Field | Type | Description |
|---|---|---|
| `id` | `number` | Tenant/hotel ID. |
| `name` | `object` | Bilingual hotel name `{ en, ar }`. |
| `slug` | `string\|null` | URL-safe hotel slug. |
| `logo` | `string\|null` | URL to the hotel logo image, or `null` if not set. |
| `contact.email` | `string\|null` | Hotel contact email. |
| `contact.phone` | `string\|null` | Hotel contact phone number. |
| `location.address` | `object` | Bilingual street address `{ en, ar }`. |
| `location.city` | `object` | Bilingual city name `{ en, ar }`. |
| `location.state` | `object` | Bilingual state/region `{ en, ar }`. |
| `location.country` | `object` | Bilingual country name `{ en, ar }`. |
| `location.postalCode` | `string\|null` | Postal/ZIP code. |
| `location.coordinates` | `object\|null` | `{ lat, lng }` if latitude and longitude are set, otherwise `null`. |
| `currency` | `string\|null` | ISO 4217 currency code for this hotel. |
| `rating` | `number` | Average star rating across all services **and** packages for this hotel (0–5, one decimal). `0` if no reviews. |
| `reviewCount` | `number` | Total number of guest reviews/feedback across all services and packages. |
| `minStayCostPerNight` | `number\|null` | Cheapest stay-category service price per night (`catalog_pricing.price / duration`). `null` if no stay services with pricing exist. |

---

## Error Responses

### Missing hotelId (422)

```json
{
  "statusCode": 422,
  "message": "hotelId is required"
}
```

### Hotel Not Found (404)

Returned when the `hotelId` does not match an active hotel tenant.

```json
{
  "statusCode": 404,
  "message": "Hotel not found"
}
```

---

## Notes

- Only returns tenants with `tenant_type` of `'hotel'` or `'branch'`, `status = 'active'`, and `is_active = 1`.
- Bilingual fields attempt to parse JSON `{ en, ar }` from the database value. If the value is plain text, both `en` and `ar` will contain the same string.
- Rating is computed as `AVG(feedback.star_rating)` across all active services **and** packages for the tenant, rounded to 1 decimal place.
- `minStayCostPerNight` is `MIN(catalog_pricing.price / GREATEST(duration, 1))` across all active stay-category services. Duration is read from the service's `hms_config` (`config_key = 'duration'`), defaulting to 1 if unset.

---

## Related Endpoints

- [Guest Hotels](/hms-documentation/guest-apis/guest-search-filter/guest-search-filter) — `GET /api/guest/hotels` returns a list of all hotels (without full details).
- [Filter Options: Hotel Brands](/hms-documentation/guest-apis/filter-options/filter-options) — `GET /api/filter/options/hotelbrands` returns hotel brand options for filtering.

---

## Source Files

| File | Purpose |
|---|---|
| `Src/Apis/ProjectSpecificApis/GuestSpecificApis/GuestHotelDetails/GuestHotelDetails.js` | API object definition |
| `Src/Apis/ProjectSpecificApis/GuestSpecificApis/GuestHotelDetails/CRUD_parameters.js` | Request parameter schema |

---

## Change Log

| Date | Change |
|---|---|
| 2026-07-02 | Initial creation |
| 2026-07-06 | Added `minStayCostPerNight`. Rating now averages across both services and packages. |
