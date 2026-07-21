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

### Request Body (Simple)

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
| `entries` | `array` | No | Serial/parallel booking entries (see **Serial/Parallel Bookings** below) |
| `addons` | `array` | No | Array of addon objects (see **Addon Scheduling** below) |
| `paymentPlan` | `string` | Yes | `"full"` or `"partial"` |

### Serial/Parallel Bookings (Multiple Rooms / Consecutive Stays)

The `entries` array enables two advanced booking modes:

- **Serial booking** — consecutive stay segments (e.g. week 1 in room A, week 2 in room B). Each entry's check-out must equal the next entry's check-in.
- **Parallel booking** — multiple rooms for the same dates. Set `quantity > 1` on an entry to book N rooms simultaneously.
- **Combined** — both serial and parallel in one booking (e.g. 2 rooms for 2 consecutive weeks).

When `entries` is provided, the `checkIn`/`checkOut` top-level fields still serve as basic date validation, but the booking's effective date range spans from the first entry's check-in to the last entry's check-out.

#### Request Body (Serial/Parallel)

```json
{
  "actionPerformerURDD": 16,
  "hotelId": 3,
  "roomId": 71,
  "checkIn": "2026-07-14",
  "checkOut": "2026-07-28",
  "guests": { "adults": 4, "children": 0 },
  "entries": [
    { "checkIn": "2026-07-14", "checkOut": "2026-07-21", "quantity": 2 },
    { "checkIn": "2026-07-21", "checkOut": "2026-07-28", "quantity": 2 }
  ],
  "isMainGuest": true,
  "paymentPlan": "full"
}
```

#### Entry Fields

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `checkIn` / `check_in_date` | `string` | Yes | Entry check-in date (YYYY-MM-DD) |
| `checkOut` / `check_out_date` | `string` | Yes | Entry check-out date (YYYY-MM-DD) |
| `quantity` | `number` | No | Number of rooms for this entry (default: 1) |

#### Validation Rules

1. **Duration bounds** — each entry's stay must be within `min_stay_nights` and `max_stay_nights` (same rules as single bookings, applied per entry).
2. **Serial continuity** — for consecutive entries, entry N's check-out must exactly equal entry N+1's check-in. Gaps or overlaps are rejected.
3. **Max booking cap** — the sum of all entry quantities must not exceed `max_quantity_per_booking`.
4. **Date sanity** — each entry's check-in must be before its check-out and not in the past.

#### Unit Assignment Strategy

The backend uses a two-phase strategy for assigning rooms:

1. **Full-span strategy** (preferred): attempts to find room(s) available for the entire span (first check-in to last check-out) so the guest stays in the same room across consecutive entries. This avoids room switches mid-stay.
2. **Per-entry fallback**: if not enough rooms are available for the full span, each entry is assigned rooms independently. Rooms may differ between entries.

When `quantity > 1`, guests are distributed evenly across rooms: `guestsPerUnit = ceil(totalGuests / quantity)`.

#### Pricing

- Room price is multiplied by `totalInstances` (sum of all entry quantities) times the number of nights per entry.
- Pricing rules (discounts, taxes) are applied once to the full subtotal (stay + addons), not per entry.

### Addon Scheduling

Each addon in the `addons` array carries the `serviceId` plus an **optional scheduling block** whose shape depends on the service's category. If scheduling is omitted, the slot is created as `unscheduled` and the guest can schedule later via `PUT /guest/booking/reschedule`.

Addons also support an optional `quantity` field (integer, default: 1). When `quantity` exceeds the number of provided scheduling entries, the remaining slots are created as `unscheduled`. Price is calculated as `unitPrice × quantity`.

| Category slug | Scheduling field | Shape | Example |
|---------------|-----------------|-------|---------|
| `dining`, `room-service` | `meals` | `[{ date, mealType }]` | `{ "date": "2026-07-14", "mealType": "breakfast" }` |
| `transport` | `transport` | `{ tripType, pickupDateTime, pickupLocation, dropoffLocation }` | See example above |
| `spa`, `barber`, `gym`, `kids`, `networking` | `sessions` | `[{ date, slot }]` | `{ "date": "2026-07-15", "slot": "10:00-11:00" }` |
| Any (no scheduling) | _(omit)_ | `{ serviceId }` only | `{ "serviceId": 90 }` |

> **This is the same shape used across all booking creation endpoints** (`/bookings/room`, `/bookings/package`, `/bookings/service`) and matches what the read bundle (`GET /guest/bookings`) returns in `services[].meals[]`, `services[].sessions[]`, and `services[].transport`. The `id` field in each read-side slot is the `slotId` used for rescheduling.

---

## Step 5b: Create Package Booking

**POST** `/api/guest/bookings/package`

**Authentication:** AUTH_PLATFORM (requires guest JWT)

Package bookings use two separate arrays in the request body:

- **`services`** — scheduling hints for **package-included** services only. Services listed here must be part of the package definition (`package_services` table). Any service ID in this array that is not a package-included service is **silently ignored** — it will not be booked or charged.
- **`addons`** — extra services **beyond the package** that the guest wants to add. These are charged separately on top of the package price. Uses the same shape as room booking addons (see **Addon Scheduling** above).

### Request Body

```json
{
  "actionPerformerURDD": 89,
  "hotelId": 16,
  "packageId": 345,
  "checkIn": "2026-07-30",
  "checkOut": "2026-08-02",
  "adults": 4,
  "children": 3,
  "isMainGuest": true,
  "services": [
    { "serviceId": 196 },
    { "serviceId": 190 }
  ],
  "addons": [
    { "serviceId": 193, "quantity": 1 }
  ],
  "paymentPlan": "full"
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `actionPerformerURDD` | `number` | Yes | Tenant-specific URDD ID |
| `hotelId` | `number` | Yes | Hotel/tenant ID |
| `packageId` | `number` | Yes | Package ID from search results |
| `checkIn` | `string` | Yes | Check-in date (YYYY-MM-DD) |
| `checkOut` | `string` | No | Check-out date (YYYY-MM-DD). If omitted, derived from `checkIn` + package stay duration. |
| `adults` | `number` | Yes | Number of adult guests |
| `children` | `number` | No | Number of child guests (default: 0) |
| `guests` | `object` | No | Alternative to top-level `adults`/`children`: `{ adults, children }` |
| `isMainGuest` | `boolean` | Yes | Whether the booker is the primary guest |
| `entries` | `array` | No | Serial/parallel booking entries (same as room bookings) |
| `services` | `array` | No | Scheduling hints for package-included services. Each entry: `{ serviceId, sessions?, meals?, transport? }`. **Only package-included service IDs are recognized — non-package services here are ignored.** |
| `addons` | `array` | No | Extra services beyond the package, charged separately. Same shape as room booking addons. |
| `paymentPlan` | `string` | Yes | `"full"` or `"partial"` |

### Important: `services` vs `addons`

| Array | Purpose | Charged? | What happens if a non-package service is placed here? |
|-------|---------|----------|------------------------------------------------------|
| `services` | Attach scheduling data to package-included services | No (covered by package price) | **Silently ignored** — the service is not booked. |
| `addons` | Add extra services beyond the package | Yes (added to total) | Booked and charged at catalog price. |

### Pricing

- **Package total** = `package_catalog_price x instances` + sum of addon prices
- Package-included services (stay, kids, dining, etc.) are covered by the flat package price
- Only services in `addons` are charged on top
- Pricing rules (discounts, surcharges) are applied once to the full subtotal

### Response

Returns the same v2 booking bundle as room bookings.

---

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
        "status": "confirmed"
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
- `status` — `"confirmed"` (default for new bookings)
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

When creating a booking, the backend picks available delivery units. For **single bookings**, `pickAvailableUnitForService` selects one unit. For **serial/parallel bookings**, `pickMultipleAvailableUnits` selects N units per entry.

A unit is considered **available** when no active `booking_items` row overlaps the requested date range — specifically:

- `bi.status = 'active'`
- `bi.item_status NOT IN ('cancelled', 'checked_out')`
- `b.booking_status NOT IN ('cancelled', 'checked_out')` (joined from `bookings`)
- Date overlap: `DATE(bi.scheduled_start) < DATE(checkOut) AND DATE(bi.scheduled_end) > DATE(checkIn)`

If no unit is free, the booking API returns **409** `"No available rooms for the selected dates"`. For serial/parallel bookings with insufficient units for a specific entry, the error includes the date range and the shortfall (e.g. `"need 2, found 1"`).

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
| 2026-06-12 | Default `booking_status` changed from `pending` to `confirmed` for new bookings. |
| 2026-07-16 | Added serial/parallel booking support via `entries` array — multiple rooms and consecutive stays in a single booking. |
