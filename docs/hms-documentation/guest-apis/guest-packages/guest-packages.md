# Guest Packages

**GET** `/api/guest/packages`

Fetches the guest-facing packages catalog. Operates in two modes depending on whether a package `id` is provided in the request payload.

---

## Authentication

Uses **PUBLIC_ENCRYPTED_PLATFORM** — encrypted request/response using the platform key only. No guest JWT required.

---

## Modes

### List Mode

When no `id` is provided, returns a paginated list of all published, visible packages.

### Detail Mode

When `id` is provided in the encrypted payload, returns a single detailed package object with its included services.

---

## Request Payload

All fields are optional and sent in the encrypted request body.

| Field | Type | Required | Description |
|---|---|---|---|
| `id` | `number` | No | Package ID for detail mode. |
| `hotelId` | `number` | No | Filter by hotel/tenant ID. |
| `page` | `number` | No | Page number (default: 1). |
| `pageSize` | `number` | No | Items per page (default: 20). |

### Example: List all packages

```json
{}
```

### Example: Get package detail

```json
{
  "id": 10
}
```

---

## Response

### List Mode (200)

```json
{
  "items": [
    {
      "id": 10,
      "hotelId": 3,
      "hotel": {
        "name": { "en": "Grand Hotel", "ar": "الفندق الكبير" },
        "logo": "45",
        "address": "123 Main St",
        "city": "Riyadh",
        "country": "SA",
        "coordinates": { "lat": 24.7136, "lng": 46.6753 }
      },
      "name": { "en": "Weekend Escape", "ar": "عطلة نهاية الأسبوع" },
      "description": { "en": "2-night stay with breakfast", "ar": null },
      "base_price": 1200,
      "current_price": 1200,
      "currency": "SAR",
      "images": [228, 232],
      "duration": 2,
      "duration_units": "nights",
      "type": "Package",
      "view_count": 15,
      "is_featured": true,
      "maxAdults": 2,
      "maxChildren": 1,
      "maxOccupancy": 3,
      "cancellation_info": {
        "margin": { "en": "", "ar": "" },
        "exceptions": { "en": "", "ar": "" }
      },
      "termsAndConditions": { "en": "", "ar": "" },
      "additional_attributes": {
        "tags": [{ "en": "Romantic", "ar": "رومانسي" }]
      },
      "rating": null
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

Returns a single package object with all list fields plus:

```json
{
  "id": 10,
  "hotelId": 3,
  "hotel": {
    "name": { "en": "Grand Hotel", "ar": "الفندق الكبير" },
    "logo": "45",
    "address": "123 Main St",
    "city": "Riyadh",
    "country": "SA",
    "coordinates": { "lat": 24.7136, "lng": 46.6753 }
  },
  "name": { "en": "Weekend Escape", "ar": "عطلة نهاية الأسبوع" },
  "description": { "en": "2-night stay with breakfast", "ar": null },
  "code": "WE-001",
  "type": "standard",
  "images": [228, 232],
  "base_price": 1200,
  "current_price": 1200,
  "currency": "SAR",
  "nights": 2,
  "duration_units": "nights",
  "maxAdults": 2,
  "maxChildren": 1,
  "maxOccupancy": 3,
  "allowedCheckInDays": ["fri", "sat"],
  "is_featured": true,
  "cancellation_info": {
    "margin": { "en": "24 hours", "ar": "٢٤ ساعة" },
    "exceptions": { "en": "", "ar": "" }
  },
  "termsAndConditions": { "en": "Non-refundable after check-in.", "ar": "" },
  "maxQuantityPerBooking": 5,
  "additional_attributes": {
    "tags": [{ "en": "Romantic", "ar": "رومانسي" }]
  },
  "view_count": 15,
  "rating": null,
  "ratingAvg": null,
  "reviewCount": 0,
  "viewers": { "count": 15, "avatars": [] },
  "createdAt": "2026-05-01T00:00:00.000Z",
  "services": [
    {
      "id": 71,
      "hotelId": 3,
      "hotel": {
        "name": { "en": "Grand Hotel", "ar": "الفندق الكبير" },
        "logo": "45",
        "address": "123 Main St",
        "city": "Riyadh",
        "country": "SA",
        "coordinates": { "lat": 24.7136, "lng": 46.6753 }
      },
      "name": { "en": "Deluxe Room", "ar": "غرفة ديلوكس" },
      "packageServiceId": 101,
      "quantity": 1,
      "isConsumable": false,
      "isMandatory": true,
      "standaloneBookable": false,
      "base_price": 450,
      "current_price": 450,
      "currency": "SAR",
      "category": { "id": 1, "name": "Stay" },
      "amenities": [],
      "formSchema": []
    },
    {
      "id": 13,
      "hotelId": 3,
      "hotel": {
        "name": { "en": "Grand Hotel", "ar": "الفندق الكبير" },
        "logo": "45",
        "address": "123 Main St",
        "city": "Riyadh",
        "country": "SA",
        "coordinates": { "lat": 24.7136, "lng": 46.6753 }
      },
      "name": { "en": "Breakfast Buffet", "ar": "بوفيه إفطار" },
      "packageServiceId": 102,
      "quantity": 2,
      "isConsumable": true,
      "isMandatory": true,
      "standaloneBookable": true,
      "base_price": 80,
      "current_price": 80,
      "currency": "SAR",
      "category": { "id": 2, "name": "Dining" },
      "amenities": [],
      "formSchema": []
    }
  ]
}
```

---

## Response Fields

### Package Fields

| Field | Type | Mode | Description |
|---|---|---|---|
| `id` | `number` | Both | Package ID. |
| `hotelId` | `number` | Both | Hotel/tenant ID. |
| `hotel` | `object\|null` | Both | Hotel info object (see below). |
| `hotel.name` | `{ en, ar }` | Both | Hotel name (bilingual). |
| `hotel.logo` | `string\|null` | Both | Hotel logo attachment ID. |
| `hotel.address` | `string` | Both | Hotel address. |
| `hotel.city` | `string` | Both | Hotel city. |
| `hotel.country` | `string` | Both | Hotel country. |
| `hotel.coordinates` | `{ lat, lng }\|null` | Both | Hotel GPS coordinates. |
| `name` | `{ en, ar }` | Both | Localized package name. |
| `description` | `{ en, ar }` | Both | Localized description. |
| `code` | `string` | Detail | Package code. |
| `type` | `string` | Detail | Package type (e.g. `"standard"`). |
| `images` | `number[]` | Both | Attachment IDs for package images. |
| `base_price` | `number` | Both | Base price before pricing rules. |
| `current_price` | `number` | Both | Price after tenant pricing rules. |
| `currency` | `string` | Both | Currency code (e.g. `"SAR"`). |
| `nights` / `duration` | `number` | Both | Fixed duration in nights. |
| `duration_units` | `string` | Both | Duration unit (typically `"nights"`). |
| `maxAdults` | `number\|null` | Both | Maximum adults. |
| `maxChildren` | `number\|null` | Both | Maximum children. |
| `maxOccupancy` | `number\|null` | Both | Maximum total occupancy (adults + children). |
| `allowedCheckInDays` | `string[]\|null` | Detail | Weekdays guests may check in (e.g. `["fri","sat"]`). `null` = any day. |
| `is_featured` | `boolean` | Both | Whether the package is featured. |
| `maxQuantityPerBooking` | `number` | Detail | Maximum bookable quantity per reservation. |
| `cancellation_info` | `object` | Both | Cancellation margin and exceptions (bilingual). |
| `termsAndConditions` | `object` | Both | Terms and conditions (bilingual). |
| `additional_attributes.tags` | `array` | Both | Keyword tags, each `{ en, ar }`. |
| `view_count` | `number` | Both | View count. |
| `rating` | `object\|null` | Both | Detailed rating breakdown. |
| `ratingAvg` | `number\|null` | Detail | Average star rating. |
| `reviewCount` | `number` | Detail | Number of reviews. |
| `services` | `array` | Detail | Included service line items (see below). |

### Service Line Item Fields (Detail Mode)

Each entry in `services[]` is a full detailed service object with additional package-specific fields:

| Field | Type | Description |
|---|---|---|
| `packageServiceId` | `number` | The package_services join ID. |
| `quantity` | `number` | Quantity of this service included in the package. |
| `isConsumable` | `boolean` | Whether consumption tracking applies. |
| `isMandatory` | `boolean` | Whether the service is mandatory (cannot be removed). |
| `standaloneBookable` | `boolean` | Whether this service can be booked separately (non-stay services). |

All other fields match the [Guest Services](../guest-services/guest-services.md) detail format.

---

## Source Files

| File | Purpose |
|---|---|
| `Src/Apis/ProjectSpecificApis/GuestSpecificApis/GuestPackages/GuestPackages.js` | API object definition |
| `Src/Apis/ProjectSpecificApis/GuestSpecificApis/GuestPackages/CRUD_parameters.js` | Request parameter schema |
| `Src/HelperFunctions/Guest/v2/packageObjects.js` | Detailed package object builder |
| `Src/HelperFunctions/Guest/v2/landingObjects.js` | Landing (mini) package object builder |
