# Guest Booking Flow (End-to-End)

This document describes the complete guest room booking flow from hotel discovery through booking creation and verification.

---

## Flow Overview

| Step | Endpoint | Method | Platform | Purpose |
|------|----------|--------|----------|---------|
| 1 | `/api/guest/hotels` | GET | PUBLIC_ENCRYPTED | Fetch list of available hotels |
| 2 | `/api/guest/search/filter?include=rooms` | GET | PUBLIC_ENCRYPTED | Search for available rooms |
| 3 | `/api/guest/search/filter?include=packages` | GET | PUBLIC_ENCRYPTED | Search for available packages |
| 4 | `/api/guest/hotel-services?hotelId={id}` | GET | PUBLIC_ENCRYPTED | Fetch add-on service catalog |
| 5 | `/api/guest/bookings/room` | POST | AUTH | Create the room booking |
| 6 | `/api/guest/bookings/upcoming` | GET | AUTH | Verify booking in upcoming list |
| 7 | `/api/guest/bookings` | GET | AUTH | Verify booking in full list |

Steps 1-4 are public (no authentication required, platform encryption only). Steps 5-7 require a valid guest JWT access token.

---

## Step 1: Fetch Hotels

**GET** `/api/guest/hotels`

Returns all active hotel tenants. Each hotel object contains:

```json
{
  "id": 3,
  "key": "hotel-slug",
  "label": { "en": "Hotel Name", "ar": "..." },
  "city": { "en": "City", "ar": "..." },
  "country": { "en": "Country", "ar": "..." },
  "address": { "en": "Address", "ar": "..." },
  "images": [],
  "rating": 4.5,
  "reviewCount": 42,
  "coordinates": { "lat": 24.7136, "lng": 46.6753 }
}
```

The `id` field is the `tenant_id` used as `hotelId` in subsequent calls.

---

## Step 2: Search Rooms

**GET** `/api/guest/search/filter?detailed=true&hotelId={id}&checkIn=YYYY-MM-DD&checkOut=YYYY-MM-DD&adults=1&children=0&include=rooms`

Returns available rooms for the specified dates. Query parameters:

| Parameter | Type | Description |
|-----------|------|-------------|
| `hotelId` | `number` | Hotel/tenant ID from step 1 |
| `checkIn` | `string` | Check-in date (YYYY-MM-DD) |
| `checkOut` | `string` | Check-out date (YYYY-MM-DD) |
| `adults` | `number` | Number of adult guests |
| `children` | `number` | Number of child guests |
| `include` | `string` | Entity type filter: `rooms`, `packages`, or `services` |
| `detailed` | `boolean` | Set `true` for full object details |

Additional optional filters: `minPrice`, `maxPrice`, `minRating`, `sort`, `roomType`, `viewType`, `amenity`, `stayDuration`.

Response contains `{ items: [...], pagination: { ... } }`.

---

## Step 3: Search Packages

**GET** `/api/guest/search/filter?detailed=true&hotelId={id}&checkIn=...&checkOut=...&adults=1&children=0&include=packages`

Same endpoint as step 2 but with `include=packages`. Returns bundled packages that include rooms plus additional services.

---

## Step 4: Fetch Add-on Services

**GET** `/api/guest/hotel-services?hotelId={id}`

Returns all bookable add-on services for the hotel (excludes rooms/stay services and amenities). These can be attached to the booking as addons.

Each service object is a minimal landing-card shape with `id`, `name`, `category`, `price`, `images`, etc. The `category.slug` determines which scheduling shape the frontend should collect for each addon:

| Category slug | What to collect | Scheduling field |
|---------------|----------------|------------------|
| `dining`, `room-service` | Date + meal type | `meals: [{ date, mealType }]` |
| `transport` | Pickup time + locations | `transport: { tripType, pickupDateTime, pickupLocation, dropoffLocation }` |
| `spa`, `barber`, `gym`, `kids`, `networking` | Date + time slot | `sessions: [{ date, slot }]` |
| Any | Nothing (schedule later) | Omit — created as `unscheduled` |

---

## Step 5: Create Room Booking

**POST** `/api/guest/bookings/room`

**Authentication:** AUTH_PLATFORM (requires guest JWT)

### Request Body

```json
{
  "actionPerformerURDD": 16,
  "hotelId": 3,
  "roomId": 71,
  "checkIn": "2026-07-14",
  "checkOut": "2026-07-17",
  "guests": { "adults": 1, "children": 0 },
  "isMainGuest": true,
  "addons": [
    { "serviceId": 79, "sessions": [{ "date": "2026-07-15", "slot": "10:00-11:00" }] },
    { "serviceId": 76, "meals": [{ "date": "2026-07-14", "mealType": "breakfast" }] },
    { "serviceId": 102, "transport": { "tripType": "airport_pickup", "pickupDateTime": "2026-07-14 14:00:00", "pickupLocation": "Airport", "dropoffLocation": "Hotel" } },
    { "serviceId": 90 }
  ],
  "paymentPlan": "full"
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `actionPerformerURDD` | `number` | Yes | Tenant-specific URDD ID |
| `hotelId` | `number` | Yes | Hotel/tenant ID |
| `roomId` | `number` | Yes | Room service ID from search results |
| `checkIn` | `string` | Yes | Check-in date (YYYY-MM-DD) |
| `checkOut` | `string` | Yes | Check-out date (YYYY-MM-DD) |
| `guests` | `object` | Yes | `{ adults: number, children: number }` |
| `isMainGuest` | `boolean` | Yes | Whether the booker is the primary guest |
| `addons` | `array` | No | Array of addon objects (see **Addon Scheduling** below) |
| `paymentPlan` | `string` | Yes | `"full"` or `"partial"` |

### Addon Scheduling

Each addon in the `addons` array carries the `serviceId` plus an **optional scheduling block** whose shape depends on the service's category. If scheduling is omitted, the slot is created as `unscheduled` and the guest can schedule later via `PUT /guest/booking/reschedule`.

| Category slug | Scheduling field | Shape | Example |
|---------------|-----------------|-------|---------|
| `dining`, `room-service` | `meals` | `[{ date, mealType }]` | `{ "date": "2026-07-14", "mealType": "breakfast" }` |
| `transport` | `transport` | `{ tripType, pickupDateTime, pickupLocation, dropoffLocation }` | See example above |
| `spa`, `barber`, `gym`, `kids`, `networking` | `sessions` | `[{ date, slot }]` | `{ "date": "2026-07-15", "slot": "10:00-11:00" }` |
| Any (no scheduling) | _(omit)_ | `{ serviceId }` only | `{ "serviceId": 90 }` |

> **This is the same shape used across all booking creation endpoints** (`/bookings/room`, `/bookings/package`, `/bookings/service`) and matches what the read bundle (`GET /guest/bookings`) returns in `services[].meals[]`, `services[].sessions[]`, and `services[].transport`. The `id` field in each read-side slot is the `slotId` used for rescheduling.

### Response

Returns a full v2 booking bundle object:

```json
{
  "return": {
    "bookingId": 9142,
    "id": "BK026892806908",
    "status": "confirmed",
    "checkIn": "2026-07-13T19:00:00.000Z",
    "checkOut": "2026-07-16T19:00:00.000Z",
    "amount": 1680,
    "currency": "SAR",
    "pricing": {
      "primaryTotal": 1260,
      "addonsTotal": 420,
      "packageDiscount": 0,
      "grandTotal": 1680,
      "amountPaid": 0,
      "balanceDue": 1680,
      "currency": "SAR"
    },
    "services": [
      {
        "serviceId": 76,
        "bookingServiceId": 85,
        "label": { "en": "Addon Name", "ar": "..." },
        "quantity": 1,
        "unitPrice": 420,
        "totalPrice": 420,
        "status": "pending"
      }
    ],
    "cancellation": {
      "cancellable": true,
      "cancellationFee": 0,
      "estimatedRefund": 1680
    }
  }
}
```

Key response fields:
- `bookingId` — database primary key, used for all subsequent operations
- `id` — human-readable booking number (e.g. `"BK026892806908"`)
- `status` — `"confirmed"` or `"pending"`
- `pricing` — breakdown of primary service, addons, discounts, and balance
- `services` — addon services attached to the booking
- `cancellation` — whether the booking can be cancelled and estimated refund

---

## Step 6: Verify in Upcoming Bookings

**GET** `/api/guest/bookings/upcoming?page=1&pageSize=50`

See [Guest Upcoming Bookings](../guest-bookings-upcoming/guest-bookings-upcoming.md) for full documentation.

The created booking should appear in the `items` array with matching `bookingId`, `status`, dates, services, pricing, and cancellation metadata.

---

## Step 7: Verify in Full Bookings List

**GET** `/api/guest/bookings?page=1&pageSize=50`

Returns all bookings for the guest (not limited to upcoming). The created booking should appear with consistent `bookingId`, booking number, status, and amount.

---

## Room Availability

When creating a booking, the backend picks an available delivery unit via `pickAvailableUnitForService`. A unit is considered **available** when no active `booking_items` row overlaps the requested date range — specifically:

- `bi.status = 'active'`
- `bi.item_status NOT IN ('cancelled', 'checked_out')`
- `b.booking_status NOT IN ('cancelled', 'checked_out')` (joined from `bookings`)
- Date overlap: `DATE(bi.scheduled_start) < DATE(checkOut) AND DATE(bi.scheduled_end) > DATE(checkIn)`

If no unit is free, the booking API returns **409** `"No available rooms for the selected dates"`.

**Pinned bookings** (where the guest starts from a specific room/package detail page, bypassing `/guest/search/filter`) rely on the same availability check at submit time. No separate pre-check endpoint is needed — the `roomId` sent by the frontend is a `service_id` (the same `id` returned by search results).

> When a booking is cancelled or checked out, the corresponding `booking_items.item_status` is cascaded to `'cancelled'` or `'checked_out'` respectively, freeing the delivery unit for rebooking.

---

## Database Tables Involved

| Table | Purpose |
|-------|---------|
| `bookings` | Master booking record (dates, amounts, status, tenant, guest) |
| `booking_items` | Unit assignment (room/table) with scheduled dates. `item_status` tracks the unit lifecycle (`reserved` → `cancelled` / `checked_out`). |
| `booking_services` | Addon services linked to the booking |
| `booking_service_slots` | Time slots for addon services |
| `booking_payments` | Payment records |
| `booking_checkin_details` | Check-in metadata |
| `hms_config` | Dynamic config values (form data, flags) |

---

## Sim Test

The end-to-end flow is verified by the sim test:

```
backend/Services/SysScripts/TestScripts/sim/guestBookingFlowE2E.js
```

Run with: `node Services/SysScripts/TestScripts/sim/guestBookingFlowE2E.js`

The test exercises all 7 steps above plus direct DB verification, and automatically cleans up the created booking afterward.

---

## Change Log

| Date | Change |
|------|--------|
| 2026-06-09 | Initial documentation of the end-to-end guest booking flow ([#252](https://github.com/UBS-Dev-Org/hms/issues/252)). |
