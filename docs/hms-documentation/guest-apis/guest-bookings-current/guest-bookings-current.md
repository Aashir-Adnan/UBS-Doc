# Guest Current Booking

**GET** `/api/guest/bookings/current`

Returns the guest's active bookings where today falls within the check-in/check-out window. This is the primary endpoint for the "current stay" screen shown after check-in.

---

## Authentication

Uses **AUTH_PLATFORM** — requires a valid guest JWT (`accessToken`). The guest's identity is resolved via `ensureGuestUrdd`.

The frontend must send a **tenant-specific URDD** (`tenantUrddMap[tenantId]`) for this endpoint. When `TENANCY_CHECK` is enabled, the query resolver scopes results to the acting tenant. See [Multi-Tenant Query Scoping](/docs/backend/tenancy).

---

## Request Payload

This endpoint takes no request parameters. Send an empty encrypted body.

### Example

```json
{}
```

---

## Behavior

1. Resolves the guest's `urdd_id` from the JWT via `ensureGuestUrdd`.
2. Queries `bookings` where:
   - `urdd_id` matches the authenticated guest.
   - `status` is `active` (not soft-deleted).
   - **Either** `booking_status` is `checked_in` **and** `actual_check_out IS NULL` (active stay, regardless of scheduled dates), **or** `booking_status` is `confirmed` **and** today's date falls between `check_in_date` and `check_out_date` (scheduled window).
3. Results are ordered by `check_in_date DESC` (most recent first).
4. For each matching booking, the full v2 booking bundle is built via `buildBookingsBundle`, which:
   - Fetches the master booking record (dates, amounts, package info, currency).
   - Resolves the primary service from `booking_items` (unit assignment — room/table/seat). Only services from **active tenants** (`t.status = 'active' AND t.is_active = 1`) are included.
   - Fetches addon services from `booking_services` with per-slot scheduling from `booking_service_slots`.
   - Enriches with per-service amenities, keyword tags, duration units, Arabic translations, ratings, form values, and cancellation metadata.
   - Resolves currency codes from both direct config values (`{"en":"SAR"}`) and currency ID references (`[4]` → currencies table lookup).
   - For standalone-service bookings (no unit assignment), promotes the first `booking_services` row as the primary.
5. Pagination is disabled — all matching bookings are returned.
6. Returns an empty array if the guest has no current bookings.

---

## Response

### Success (200)

```json
[
  {
    "id": "BK9044",
    "bookingId": 9044,
    "hotelId": 3,
    "bookingType": "room",
    "status": "checked_in",
    "paymentStatus": "paid",
    "amount": 1500,
    "paidAmount": 1500,
    "currency": "SAR",
    "checkIn": "2026-06-04",
    "checkOut": "2026-06-07",
    "actualCheckIn": "2026-06-04T14:00:00.000Z",
    "actualCheckOut": null,
    "createdAt": "2026-06-01T09:00:00.000Z",
    "nights": 3,
    "adults": 2,
    "children": 0,
    "specialRequest": "Late checkout if possible",
    "isMainGuest": null,
    "package": {
      "id": 12,
      "name": "Weekend Getaway",
      "description": "Includes room + breakfast"
    },
    "serviceId": 71,
    "categoryId": 3,
    "tag": "stay",
    "label": { "en": "Deluxe Room", "ar": "غرفة ديلوكس" },
    "shortDescription": "Spacious room with city view",
    "unit": "night",
    "unitPrice": 450,
    "images": [12, 13, 14],
    "amenities": [
      {
        "key": "wifi",
        "icon": "wifi",
        "label": { "en": "Free WiFi", "ar": "واي فاي مجاني" },
        "group": "room_features"
      }
    ],
    "tags": [
      { "en": "City View", "ar": "إطلالة على المدينة" }
    ],
    "room": "Room 301",
    "rating": null,
    "reviewCount": 0,
    "viewers": { "count": 0, "avatars": [] },
    "schedulingStatus": "complete",
    "services": [
      {
        "serviceId": 85,
        "bookingServiceId": 201,
        "categoryId": 5,
        "categorySlug": "dining",
        "label": { "en": "Breakfast Buffet", "ar": "بوفيه إفطار" },
        "unit": "meal",
        "quantity": 3,
        "unitPrice": 75,
        "totalPrice": 225,
        "currency": "SAR",
        "images": [20],
        "amenities": [],
        "tags": [],
        "isConsumable": false,
        "operatingHours": [],
        "status": "confirmed",
        "rating": null,
        "reviewCount": 0,
        "createdAt": "2026-06-01T09:00:00.000Z",
        "meals": [
          {
            "id": 501,
            "date": "2026-06-05",
            "mealType": "breakfast",
            "status": "scheduled",
            "createdAt": "2026-06-01T09:00:00.000Z"
          }
        ]
      }
    ],
    "formValues": null,
    "pricing": {
      "primaryTotal": 1275,
      "addonsTotal": 225,
      "packageDiscount": 0,
      "grandTotal": 1500,
      "amountPaid": 1500,
      "balanceDue": 0,
      "lastPaidAt": null,
      "paymentPolicy": null,
      "currency": "SAR"
    },
    "cancellation": {
      "cancellable": false,
      "nonCancellableReason": "already_checked_in",
      "cancellationFee": null,
      "estimatedRefund": null,
      "freeCancellationUntil": null,
      "cancellationPolicy": null
    }
  }
]
```

### Response Field Reference

#### Root Booking Fields

| Field | Type | Description |
|---|---|---|
| `id` | `string` | Booking number (e.g. `"BK9044"`). Falls back to `BK{booking_id}` if no number assigned. |
| `bookingId` | `number` | Database `booking_id`. |
| `hotelId` | `number` | Tenant/hotel ID. |
| `bookingType` | `string` | Booking type (e.g. `"room"`, `"service"`, `"package"`). |
| `status` | `string` | Normalized booking status. `checked_out` is mapped to `completed`. |
| `paymentStatus` | `string` | `"paid"`, `"partial"`, or `"pending"` based on `total_amount` vs `paid_amount`. |
| `amount` | `number` | Grand total amount. |
| `paidAmount` | `number` | Amount already paid. |
| `currency` | `string` | Currency code (e.g. `"SAR"`). |
| `checkIn` | `string` | Scheduled check-in date. |
| `checkOut` | `string` | Scheduled check-out date. |
| `actualCheckIn` | `string\|null` | Actual check-in timestamp (ISO 8601). `null` if not yet checked in. |
| `actualCheckOut` | `string\|null` | Actual check-out timestamp. `null` during active stay. |
| `createdAt` | `string` | ISO 8601 booking creation timestamp. |
| `nights` | `number` | Number of nights between check-in and check-out. |
| `adults` | `number` | Number of adult guests. |
| `children` | `number` | Number of child guests (currently always `0` — stub). |
| `specialRequest` | `string\|null` | Free-text special requests from the guest. |
| `isMainGuest` | `null` | Stub — `null` until `bookings.is_main_guest` column is added. |

#### Package Fields

| Field | Type | Description |
|---|---|---|
| `package` | `object\|null` | `null` if not a package booking. |
| `package.id` | `number` | Package ID. |
| `package.name` | `string` | Package name. |
| `package.description` | `string` | Package description. |

#### Primary Service Fields

| Field | Type | Description |
|---|---|---|
| `serviceId` | `number\|null` | Primary service ID from the unit assignment. |
| `categoryId` | `number\|null` | Service category ID. |
| `tag` | `string\|null` | Category slug (e.g. `"stay"`, `"dining"`, `"spa"`). |
| `label` | `{ en, ar }\|null` | Localized service name. |
| `shortDescription` | `string\|null` | Brief service description. |
| `unit` | `string\|null` | Duration unit (e.g. `"night"`, `"session"`). |
| `unitPrice` | `number` | Catalog price per unit. |
| `images` | `number[]` | Array of attachment IDs for service images. |
| `amenities` | `array` | Per-service amenities from `amenities_tags` config. Each: `{ key, icon, label: { en, ar }, group }`. |
| `tags` | `array` | Per-service keyword tags from `keyword_tags` config. Each: `{ en, ar }`. |
| `room` | `string\|null` | Assigned delivery unit label (e.g. `"Room 301"`). |
| `rating` | `object\|null` | Rating breakdown (stub — `null` until `service_reviews` table exists). |
| `reviewCount` | `number` | Number of reviews (stub — `0`). |
| `viewers` | `object` | Stub — `{ count: 0, avatars: [] }` until presence service is built. |

#### Scheduling & Addons

| Field | Type | Description |
|---|---|---|
| `schedulingStatus` | `string` | Overall addon scheduling: `"complete"`, `"partial"`, `"unscheduled"`, or `"none"`. |
| `services` | `array` | Addon services attached to this booking. |
| `services[].serviceId` | `number` | Addon service ID. |
| `services[].bookingServiceId` | `number` | `booking_services.booking_service_id`. |
| `services[].categorySlug` | `string` | Category slug — determines slot shape. |
| `services[].label` | `{ en, ar }` | Localized addon name. |
| `services[].unit` | `string` | Duration unit for this addon's category. |
| `services[].quantity` | `number` | Booked quantity. |
| `services[].unitPrice` | `number` | Price per unit. |
| `services[].totalPrice` | `number` | Total price for this addon. |
| `services[].amenities` | `array` | Per-service amenities. Each: `{ key, icon, label: { en, ar }, group }`. |
| `services[].tags` | `array` | Per-service keyword tags. Each: `{ en, ar }`. |
| `services[].isConsumable` | `boolean` | Whether the service is consumable (from `is_consumable` config). |
| `services[].operatingHours` | `array` | Operating hours for the service. |
| `services[].status` | `string` | Addon status (e.g. `"confirmed"`, `"cancelled"`). |
| `services[].meals` | `array` | Present when category is `dining` or `room-service`. |
| `services[].sessions` | `array` | Present when category is not dining/transport. |
| `services[].transport` | `object\|null` | Present when category is `transport`. |
| `formValues` | `object\|null` | Booking-level form values from `hms_config`. |

#### Pricing Block

| Field | Type | Description |
|---|---|---|
| `pricing.primaryTotal` | `number` | Primary service total (`grandTotal - addonsTotal`). |
| `pricing.addonsTotal` | `number` | Sum of all addon `total_price` values. |
| `pricing.packageDiscount` | `number` | Package discount (currently `0` — derived at quote time). |
| `pricing.grandTotal` | `number` | Total booking amount. |
| `pricing.amountPaid` | `number` | Amount paid so far. |
| `pricing.balanceDue` | `number` | Remaining balance (`grandTotal - amountPaid`, min `0`). |
| `pricing.lastPaidAt` | `null` | Stub — `null` until transactions table is wired in. |
| `pricing.paymentPolicy` | `null` | Stub — `null` until payment-policies table is wired in. |
| `pricing.currency` | `string` | Currency code. |

#### Cancellation Block

| Field | Type | Description |
|---|---|---|
| `cancellation.cancellable` | `boolean` | Whether the booking can still be cancelled. Always `false` for `checked_in` bookings. |
| `cancellation.nonCancellableReason` | `string\|null` | Reason code: `"already_checked_in"`, `"completed"`, `"cancelled"`, `"after_cutoff"`. |
| `cancellation.cancellationFee` | `number\|null` | Estimated fee if cancellation were allowed. |
| `cancellation.estimatedRefund` | `number\|null` | Estimated refund after fee deduction. |
| `cancellation.freeCancellationUntil` | `string\|null` | ISO 8601 deadline for free cancellation. |
| `cancellation.cancellationPolicy` | `string\|null` | Human-readable policy summary. |

---

## Query Filter Summary

| Filter | Value | Description |
|---|---|---|
| `urdd_id` | From JWT | Only the authenticated guest's bookings. |
| `status` | `active` | Excludes soft-deleted bookings. |
| `booking_status` | `checked_in`, `confirmed` | Active or confirmed stays. |
| Checked-in gate | `booking_status = 'checked_in' AND actual_check_out IS NULL` | Any active stay (no date constraint — covers early check-in). |
| Confirmed gate | `booking_status = 'confirmed' AND CURDATE() BETWEEN check_in_date AND check_out_date` | Confirmed bookings whose scheduled window includes today. |
| Tenant | `t.status = 'active' AND t.is_active = 1` | Only bookings from active tenants. |

---

## Error Responses

| Status | Message | Condition |
|---|---|---|
| 401 | Unauthenticated | Missing or invalid access token. |
| 500 | `Failed to fetch current booking` | Internal query or processing error. |

---

## Change Log

| Date | Change |
|---|---|
| 2026-06-09 | Fixed query so `checked_in` bookings always appear regardless of scheduled dates (previously required `CURDATE() BETWEEN check_in_date AND check_out_date` for all statuses, causing early check-ins to vanish). Fixes [#248](https://github.com/UBS-Dev-Org/hms/issues/248). |
| 2026-06-09 | After checkout (`POST /guest/booking/checkout`), bookings with `booking_status = 'checked_out'` no longer appear here because the query requires `actual_check_out IS NULL` for checked-in bookings ([#253](https://github.com/UBS-Dev-Org/hms/issues/253)). |
