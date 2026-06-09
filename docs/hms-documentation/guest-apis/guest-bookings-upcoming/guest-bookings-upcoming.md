# Guest Upcoming Bookings

**GET** `/api/guest/bookings/upcoming`

Returns a paginated list of the guest's upcoming bookings — future bookings that are pending, confirmed, or cancelled. This drives the Upcoming, and Cancelled tabs on the Booking History screen.

---

## Authentication

Uses **AUTH_PLATFORM** — requires a valid guest JWT (`accessToken`). The guest's identity is resolved via `ensureGuestUrdd`.

The frontend must send a **tenant-specific URDD** (`tenantUrddMap[tenantId]`) for this endpoint. When `TENANCY_CHECK` is enabled, the query resolver scopes results to the acting tenant.

---

## Request Payload

This endpoint takes no request body parameters. Send an empty encrypted body.

### Query Parameters

| Parameter | Type | Default | Description |
|---|---|---|---|
| `page` | `number` | `1` | Page number (1-based). |
| `pageSize` | `number` | `10` | Number of items per page. |

### Example

```
GET /api/guest/bookings/upcoming?page=1&pageSize=10
```

---

## Behavior

1. Resolves the guest's `urdd_id` from the JWT via `ensureGuestUrdd`.
2. Queries `bookings` where:
   - `urdd_id` matches the authenticated guest.
   - `status` is `active` (not soft-deleted).
   - `booking_status` is `confirmed`, `pending`, or `cancelled`.
   - `check_in_date` is strictly after today (`DATE(check_in_date) > CURDATE()`).
3. Results are ordered by `check_in_date ASC` (soonest first).
4. Results are paginated using `page` and `pageSize` query params.
5. For each booking in the current page, the full v2 booking bundle is built via `buildBookingsBundle`, which:
   - Fetches the master booking record (dates, amounts, package info, currency).
   - Resolves the primary service from `booking_items` (unit assignment — room/table/seat). Only services from **active tenants** (`t.status = 'active' AND t.is_active = 1`) are included.
   - Fetches addon services from `booking_services` with per-slot scheduling from `booking_service_slots`.
   - Enriches with category amenities, duration units, Arabic translations, ratings, form values, and cancellation metadata.
   - Resolves currency codes from both direct config values (`{"en":"SAR"}`) and currency ID references (`[4]` → currencies table lookup).
   - For standalone-service bookings (no unit assignment), promotes the first `booking_services` row as the primary.
6. Returns `{ items: [], pagination: { ... } }` when the guest has no upcoming bookings.

---

## Response

### Success (200)

```json
{
  "success": true,
  "data": {
    "return": {
      "items": [
        {
          "id": "BK220830644232",
          "bookingId": 9111,
          "hotelId": 3,
          "bookingType": "individual_service",
          "status": "pending",
          "paymentStatus": "pending",
          "amount": 1460,
          "paidAmount": 0,
          "currency": "SAR",
          "checkIn": "2026-06-12T00:00:00.000Z",
          "checkOut": "2026-06-15T00:00:00.000Z",
          "actualCheckIn": null,
          "actualCheckOut": null,
          "createdAt": "2026-06-08T12:34:43.000Z",
          "nights": 3,
          "adults": 1,
          "children": 0,
          "specialRequest": null,
          "isMainGuest": null,
          "package": null,
          "serviceId": 74,
          "categoryId": 10,
          "tag": "stay",
          "label": { "en": "Standard Single Room", "ar": "غرفة ستاندرد مفردة" },
          "shortDescription": "Standard single room for solo travellers",
          "unit": "session",
          "unitPrice": 420,
          "images": [],
          "amenities": [
            {
              "id": 6062,
              "key": "standard",
              "label": { "en": "Standard", "ar": "قياسي" },
              "groupOrder": 0,
              "keywordOrder": 1
            }
          ],
          "room": "Room 311",
          "rating": 4.4,
          "reviewCount": 10,
          "viewers": { "count": 0, "avatars": [] },
          "schedulingStatus": "complete",
          "services": [
            {
              "serviceId": 79,
              "bookingServiceId": 66,
              "categoryId": 14,
              "categorySlug": "barber",
              "label": { "en": "Al-Nour Barber", "ar": "صالون النور" },
              "unit": "session",
              "quantity": 1,
              "unitPrice": 80,
              "totalPrice": 80,
              "currency": "SAR",
              "images": [],
              "amenities": [],
              "status": "pending",
              "rating": 4.6,
              "reviewCount": 8,
              "createdAt": "2026-06-08T12:34:43.000Z",
              "sessions": [
                {
                  "id": 59,
                  "date": "2026-06-11",
                  "slot": "10:00-11:00",
                  "status": "scheduled",
                  "createdAt": "2026-06-08T12:34:43.000Z"
                }
              ]
            }
          ],
          "formValues": {
            "full_name": "Afaq Khawar",
            "email": "afaq.khawar@granjur.com",
            "phone": "+966321111111",
            "check_in": "2026-06-12",
            "check_out": "2026-06-15",
            "adults": "1",
            "party_size": "1"
          },
          "pricing": {
            "primaryTotal": 1180,
            "addonsTotal": 280,
            "packageDiscount": 0,
            "grandTotal": 1460,
            "amountPaid": 0,
            "balanceDue": 1460,
            "lastPaidAt": null,
            "paymentPolicy": null,
            "currency": "SAR"
          },
          "cancellation": {
            "cancellable": true,
            "nonCancellableReason": null,
            "cancellationFee": 0,
            "estimatedRefund": 1460,
            "freeCancellationUntil": null,
            "cancellationPolicy": null
          },
          "eligibleForCheckin": true,
          "checkinIneligibleReason": null
        }
      ],
      "pagination": {
        "page": 1,
        "pageSize": 10,
        "totalItems": 1,
        "totalPages": 1
      }
    }
  }
}
```

### No upcoming bookings (200)

```json
{
  "success": true,
  "data": {
    "return": {
      "items": [],
      "pagination": {
        "page": 1,
        "pageSize": 10,
        "totalItems": 0,
        "totalPages": 1
      }
    }
  }
}
```

### Response Field Reference

#### Pagination

| Field | Type | Description |
|---|---|---|
| `pagination.page` | `number` | Current page number. |
| `pagination.pageSize` | `number` | Items per page. |
| `pagination.totalItems` | `number` | Total upcoming bookings across all pages. |
| `pagination.totalPages` | `number` | Total number of pages. |

#### Root Booking Fields (each item)

| Field | Type | Description |
|---|---|---|
| `id` | `string` | Booking number (e.g. `"BK220830644232"`). |
| `bookingId` | `number` | Database `booking_id`. |
| `hotelId` | `number` | Tenant/hotel ID. |
| `bookingType` | `string` | Booking type (`"individual_service"`, `"package"`, `"custom"`). |
| `status` | `string` | Booking status — `"confirmed"`, `"pending"`, or `"cancelled"` for upcoming bookings. |
| `paymentStatus` | `string` | `"paid"`, `"partial"`, or `"pending"` based on `total_amount` vs `paid_amount`. |
| `amount` | `number` | Grand total amount. |
| `paidAmount` | `number` | Amount already paid. |
| `currency` | `string` | Currency code (e.g. `"SAR"`). |
| `checkIn` | `string` | Scheduled check-in date (ISO 8601). |
| `checkOut` | `string` | Scheduled check-out date (ISO 8601). |
| `actualCheckIn` | `string\|null` | Always `null` for upcoming bookings. |
| `actualCheckOut` | `string\|null` | Always `null` for upcoming bookings. |
| `createdAt` | `string` | ISO 8601 booking creation timestamp. |
| `nights` | `number` | Number of nights between check-in and check-out. |
| `adults` | `number` | Number of adult guests. |
| `children` | `number` | Number of child guests. |
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
| `amenities` | `array` | Category amenities (same shape as service-categories endpoint). |
| `room` | `string\|null` | Assigned delivery unit label (e.g. `"Room 311"`). |
| `rating` | `number\|null` | Average rating. |
| `reviewCount` | `number` | Number of reviews. |
| `viewers` | `object` | Stub — `{ count: 0, avatars: [] }`. |

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
| `services[].status` | `string` | Addon status (e.g. `"pending"`, `"confirmed"`, `"cancelled"`). |
| `services[].meals` | `array` | Present when category is `dining` or `room-service`. |
| `services[].sessions` | `array` | Present when category is not dining/transport. |
| `services[].transport` | `object\|null` | Present when category is `transport`. |
| `formValues` | `object\|null` | Booking-level form values from `hms_config`. |

#### Pricing Block

| Field | Type | Description |
|---|---|---|
| `pricing.primaryTotal` | `number` | Primary service total (`grandTotal - addonsTotal`). |
| `pricing.addonsTotal` | `number` | Sum of all addon `total_price` values. |
| `pricing.packageDiscount` | `number` | Package discount (currently `0`). |
| `pricing.grandTotal` | `number` | Total booking amount. |
| `pricing.amountPaid` | `number` | Amount paid so far. |
| `pricing.balanceDue` | `number` | Remaining balance (`grandTotal - amountPaid`, min `0`). |
| `pricing.lastPaidAt` | `null` | Stub — `null` until transactions table is wired in. |
| `pricing.paymentPolicy` | `null` | Stub — `null` until payment-policies table is wired in. |
| `pricing.currency` | `string` | Currency code. |

#### Cancellation Block

| Field | Type | Description |
|---|---|---|
| `cancellation.cancellable` | `boolean` | Whether the booking can still be cancelled. |
| `cancellation.nonCancellableReason` | `string\|null` | Reason code if not cancellable: `"cancelled"`, `"already_checked_in"`, `"completed"`, `"after_cutoff"`, etc. |
| `cancellation.cancellationFee` | `number\|null` | Estimated fee if cancelled now. |
| `cancellation.estimatedRefund` | `number\|null` | Estimated refund after fee deduction. |
| `cancellation.freeCancellationUntil` | `string\|null` | ISO 8601 deadline for free cancellation. |
| `cancellation.cancellationPolicy` | `string\|null` | Human-readable policy summary. |

#### Check-in Eligibility

| Field | Type | Description |
|---|---|---|
| `eligibleForCheckin` | `boolean` | Whether the guest can check in right now. `true` when `status` is `confirmed` or `pending` AND `checkIn` is within 1 day from today. |
| `checkinIneligibleReason` | `string\|null` | `null` when eligible. Otherwise one of: `"already_checked_in"`, `"cancelled"`, `"completed"`, `"too_early"`. |

---

## Query Filter Summary

| Filter | Value | Description |
|---|---|---|
| `urdd_id` | From JWT | Only the authenticated guest's bookings. |
| `status` | `active` | Excludes soft-deleted bookings. |
| `booking_status` | `confirmed`, `pending`, `cancelled` | Confirmed, pending, or cancelled bookings. |
| Date filter | `DATE(check_in_date) > CURDATE()` | Only future bookings (check-in strictly after today). |
| Order | `check_in_date ASC` | Soonest upcoming booking first. |

---

## Error Responses

| Status | Message | Condition |
|---|---|---|
| 401 | Unauthenticated | Missing or invalid access token. |
| 500 | `Failed to fetch upcoming bookings` | Internal query or processing error. |

---

## Change Log

| Date | Change |
|---|---|
| 2026-06-08 | Changed from returning a single booking (LIMIT 1) to a paginated list of all upcoming bookings. Response shape changed from a single v2 booking object (or `null`) to `{ items, pagination }`. |
| 2026-06-09 | Added `cancelled` to the `booking_status` filter so cancelled bookings remain visible after page reload (fixes [#250](https://github.com/UBS-Dev-Org/hms/issues/250)). |
| 2026-06-09 | Added `eligibleForCheckin` and `checkinIneligibleReason` fields to every booking object in the bundle (implements [#254](https://github.com/UBS-Dev-Org/hms/issues/254)). |
| 2026-06-09 | Added `checked_out` and `completed` to the `booking_status` filter so completed bookings are visible in the Completed tab ([#253](https://github.com/UBS-Dev-Org/hms/issues/253)). |
