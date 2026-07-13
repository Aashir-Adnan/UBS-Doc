# Guest Bookings Service (Standalone)

**POST** `/api/guest/bookings/service`

Creates a standalone service booking — a guest booking a spa session, dining reservation, barber appointment, airport transfer, or any other non-stay service without booking a room.

This is the third booking creation endpoint, alongside `/bookings/room` (stay) and `/bookings/package` (package). Only services with `standaloneBookable: true` from the service catalog are eligible.

---

## Authentication

Uses **AUTH_PLATFORM** — requires a valid guest JWT (`accessToken`). The guest's identity is resolved via `ensureGuestUrdd`.

---

## Request Payload

| Field | Type | Required | Description |
|---|---|---|---|
| `serviceId` | `number` | Yes | The service to book. Must not be a stay-category service. |
| `hotelId` | `number` | No | Hotel/tenant ID. If omitted, derived from the service record. |
| `quantity` | `number` | No | Number of times to book this service (default: 1). Capped by the service's `max_quantity_per_booking` config. Price = unit price × quantity. |
| `sessions` | `array` | No | For session-based services (spa, barber, gym). Each entry: `{ date, slot }`. |
| `meals` | `array` | No | For dining/room-service. Each entry: `{ date, mealType }`. |
| `transport` | `object` | No | For transport services: `{ tripType, pickupDateTime, pickupLocation, dropoffLocation, passengers }`. |
| `adults` | `number` | No | Number of guests (default: 1). |
| `specialRequests` | `string` | No | Free-text special requests. |
| `addons` | `array` | No | Additional services to add to the booking. Each: `{ serviceId, sessions?, meals?, transport? }`. |
| `checkIn` | `string` | No | Explicit check-in date (`YYYY-MM-DD`). Fallback if not derivable from scheduling fields. |
| `checkOut` | `string` | No | Explicit check-out date (`YYYY-MM-DD`). Defaults to `checkIn` for single-day services. |
| `formData` | `object` | No | Category-specific form fields (e.g. `parent_name` for Kids Center, `guardian_name` for Spa). |

### Example: Dining reservation with meal scheduling

```json
{
  "actionPerformerURDD": 16,
  "serviceId": 76,
  "meals": [
    { "date": "2026-07-02", "mealType": "breakfast" }
  ],
  "adults": 2,
  "specialRequests": "Window seat please"
}
```

### Example: Barber appointment with slot

```json
{
  "actionPerformerURDD": 16,
  "serviceId": 95,
  "sessions": [
    { "date": "2026-07-02", "slot": "10:00-10:30" }
  ],
  "adults": 1
}
```

### Example: Transport booking

```json
{
  "actionPerformerURDD": 16,
  "serviceId": 102,
  "transport": {
    "tripType": "airport_pickup",
    "pickupDateTime": "2026-07-02 14:00:00",
    "pickupLocation": "King Abdulaziz International Airport",
    "dropoffLocation": "Hotel Main Entrance",
    "passengers": 2
  }
}
```

### Example: Kids Center session

Kids Center bookings require guardian details in `formData` and scheduling in `sessions` (top-level, not inside `formData`):

```json
{
  "actionPerformerURDD": 89,
  "serviceId": 196,
  "adults": 1,
  "sessions": [
    { "date": "2026-06-16", "slot": "10:00-12:00" }
  ],
  "formData": {
    "parent_name": "Father",
    "parent_phone": "531955842",
    "child_name": "Kid",
    "child_age": 3
  }
}
```

### Example: Spa session

```json
{
  "actionPerformerURDD": 16,
  "serviceId": 55,
  "sessions": [
    { "date": "2026-07-02", "slot": "15:00-16:00" }
  ],
  "adults": 1
}
```

### Example: Multi-quantity booking (3 spa sessions)

```json
{
  "actionPerformerURDD": 16,
  "serviceId": 55,
  "quantity": 3,
  "sessions": [
    { "date": "2026-07-02", "slot": "10:00-11:00" },
    { "date": "2026-07-03", "slot": "10:00-11:00" }
  ],
  "adults": 1
}
```

When `quantity` exceeds the number of provided scheduling entries, the remaining slots are created as `unscheduled`. In this example, 2 sessions are scheduled and 1 is unscheduled (to be scheduled later via reschedule). The total price = unit price × 3. The service must have `max_quantity_per_booking` ≥ 3 in its `hms_config` (default is 1).

### Example: Book now, schedule later

```json
{
  "actionPerformerURDD": 16,
  "serviceId": 90,
  "adults": 1
}
```

When no scheduling fields are provided, the booking is created with `schedulingStatus: "unscheduled"`. The guest can schedule later via the reschedule API (`PUT /guest/booking/reschedule`).

:::caution Scheduling fields are top-level, not inside formData
A common mistake is placing `sessions`, `meals`, or `transport` inside `formData`. These must be **top-level request fields**. Data inside `formData` is stored as guest form values only — it does not create scheduled slots.

**Wrong** — results in `schedulingStatus: "unscheduled"`:
```json
{
  "serviceId": 196,
  "formData": {
    "booking_date": "2026-06-16",
    "session_duration": "2 hours"
  }
}
```

**Correct** — results in `schedulingStatus: "complete"`:
```json
{
  "serviceId": 196,
  "sessions": [
    { "date": "2026-06-16", "slot": "10:00-12:00" }
  ],
  "formData": {
    "parent_name": "Father",
    "child_name": "Kid"
  }
}
```
:::

---

## Behavior

1. Resolves the guest's `urdd_id` from the JWT via `ensureGuestUrdd`.
2. Validates `serviceId` is required and not a stay-category service (stay must use `/bookings/room`).
3. If `hotelId` is not provided, derives it from the service's `tenant_id`.
4. Validates the service belongs to the specified hotel.
5. Fetches booking-rule configs from `hms_config`:
   - `max_quantity_per_booking` — validates quantity (default: 1). When set > 1, the service can be booked multiple times in a single reservation.
   - `min_persons_per_booking` / `max_persons_per_booking` — validates party size.
   - `advance_booking_min_days` / `advance_booking_max_days` — validates booking date window.
   - `blackout_dates` — rejects bookings during closure periods.
   - `requires_approval` — if `true`, booking starts as `pending` instead of `confirmed`.
6. Derives primary slot date from the scheduling fields (`sessions`, `meals`, or `transport`) for date validation.
7. Validates category-specific rules:
   - **Kids Center** (category_id=6): Guardian name/phone required if `guardian_rule` is set. Age bracket validation.
   - **Spa** (category_id=3): Guardian consent required for certain age brackets.
8. Validates guest-supplied `formData` against category-12 required fields.
9. Gets catalog price for the service. Multiplies by `quantity` for the initial total.
10. Inserts `bookings` row with `booking_type='individual_service'`.
11. Inserts `booking_services` row + `booking_service_slots` rows for the primary service:
    - **Dining/room-service**: One slot per meal with `meal_type` form value.
    - **Transport**: Single slot with `trip_type`, `pickup_location`, `dropoff_location` form values.
    - **Other (spa, barber, gym, etc.)**: One slot per session entry.
    - **No scheduling provided**: Single unscheduled slot.
12. If `addons` provided, inserts additional `booking_services` + slots for each addon.
13. Recomputes `total_amount` from all `booking_services` rows.
14. Stores guest form values in `hms_config`.
15. Awards loyalty points based on tenant's `loyalty_earn_rate`.
16. Returns the full v2 booking bundle (same shape as all other booking endpoints).

---

## Booking Status

Bookings default to `confirmed`. Only services with `requires_approval` explicitly set to `true` in `hms_config` produce `pending` bookings:

| `requires_approval` | Result |
|---|---|
| `false` / not set (default) | `confirmed` |
| `true` | `pending` |

---

## Scheduling: At Booking vs. Later

Both approaches are supported:

| Approach | How | Result |
|---|---|---|
| **Schedule at booking time** | Include `sessions`, `meals`, or `transport` in the request | Slots created with `slot_status: "scheduled"` |
| **Book now, schedule later** | Omit scheduling fields | Slots created with `slot_status: "unscheduled"`, guest uses `PUT /guest/booking/reschedule` later |

The scheduler API (`GET /guest/scheduler`) provides the available services and time slots that the guest can select from.

---

## Response

### Success (200)

Returns the full v2 booking bundle — same shape as `/bookings/room` and `/bookings/package`:

```json
{
  "id": "BK1780651737235a3f",
  "bookingId": 9060,
  "hotelId": 3,
  "bookingType": "individual_service",
  "status": "confirmed",
  "paymentStatus": "pending",
  "amount": 75,
  "paidAmount": 0,
  "currency": "SAR",
  "checkIn": "2026-07-02",
  "checkOut": "2026-07-02",
  "actualCheckIn": null,
  "actualCheckOut": null,
  "createdAt": "2026-06-05T12:00:00.000Z",
  "nights": 0,
  "adults": 2,
  "children": 0,
  "specialRequest": "Window seat please",
  "isMainGuest": null,
  "package": null,
  "serviceId": 76,
  "categoryId": 5,
  "tag": "dining",
  "label": { "en": "Breakfast Buffet", "ar": "بوفيه إفطار" },
  "shortDescription": null,
  "unit": "meal",
  "unitPrice": 75,
  "images": [],
  "amenities": [],
  "tags": [],
  "room": null,
  "rating": null,
  "reviewCount": 0,
  "viewers": { "count": 0, "avatars": [] },
  "schedulingStatus": "complete",
  "services": [],
  "formValues": null,
  "pricing": {
    "primaryTotal": 75,
    "addonsTotal": 0,
    "packageDiscount": 0,
    "grandTotal": 75,
    "amountPaid": 0,
    "balanceDue": 75,
    "lastPaidAt": null,
    "paymentPolicy": null,
    "currency": "SAR"
  },
  "cancellation": {
    "cancellable": true,
    "nonCancellableReason": null,
    "cancellationFee": 0,
    "estimatedRefund": 75,
    "freeCancellationUntil": null,
    "cancellationPolicy": null
  }
}
```

### `downPayment` Object

The response includes a `downPayment` object indicating the required down payment:

```json
{
  "downPayment": {
    "required": true,
    "amount": 15,
    "total": 75,
    "currency": "SAR"
  }
}
```

| Field | Type | Description |
|---|---|---|
| `required` | `boolean` | `true` if the guest must pay before the booking is confirmed. |
| `amount` | `number` | 20% of the booking total. |
| `total` | `number` | The full booking total. |
| `currency` | `string` | Currency code. |

After creating the booking, the frontend should prompt the guest to pay the down payment via `POST /guest/payments/initiate`. See [Add Services to Booking](./add-services-to-booking.md) for the full payment flow diagram.

:::info Confirmation Email
The booking confirmation email is sent **after the first successful down payment**, not at booking creation. The guest will not receive a confirmation email until payment is secured.
:::

### Key Response Fields

| Field | Description |
|---|---|
| `bookingType` | Always `"individual_service"` for standalone service bookings. |
| `tag` | Category slug of the booked service (e.g. `"dining"`, `"barber"`, `"spa"`, `"transport"`). |
| `schedulingStatus` | `"complete"` if all slots are scheduled, `"unscheduled"` if booked without timing, `"partial"` if mixed. |
| `services` | Addon services array. Empty if no addons were added. |
| `package` | Always `null` for standalone service bookings. |
| `room` | Always `null` (no unit assignment for non-stay services). |
| `checkIn` / `checkOut` | Derived from the scheduling fields for **all** service types. For single-day services, `checkOut` mirrors `checkIn`. `null` only if booked without scheduling and no explicit `checkIn` sent. |

---

## Eligible Services

Only services where `standaloneBookable: true` in the service catalog (`GET /guest/service-categories`) are eligible. In practice, this means all categories except `stay`. The endpoint explicitly rejects stay-category services with a 422 error.

---

## Slot Creation by Category

| Category | Scheduling Field | Slot Shape | Form Values Stored |
|---|---|---|---|
| Dining / Room Service | `meals[]` | `{ date, mealType }` → one slot per meal | `meal_type` |
| Transport | `transport` | `{ pickupDateTime, tripType, ... }` → single slot | `trip_type`, `pickup_location`, `dropoff_location`, `passengers` |
| Spa / Barber / Gym / Other | `sessions[]` | `{ date, slot:"HH:MM-HH:MM" }` → one slot per session | None |
| Any (no scheduling) | None | Single unscheduled slot | None |

---

## Error Responses

| Status | Message | Condition |
|---|---|---|
| 400 | `serviceId is required` | No service ID provided. |
| 400 | `Maximum N booking(s) allowed per reservation for this service` | Quantity exceeds `max_quantity_per_booking` config. |
| 400 | `Minimum N person(s) required` | Party size below minimum. |
| 400 | `Maximum N person(s) allowed` | Party size above maximum. |
| 400 | `Booking requires at least N day(s) advance notice` | Date before advance booking minimum. |
| 400 | `Booking can only be made up to N day(s) in advance` | Date beyond advance booking maximum. |
| 400 | `The selected date is unavailable (blackout period)` | Date falls in a blackout window. |
| 400 | `Guardian name and phone are required for Kids Center bookings` | Kids Center guardian rule. |
| 400 | `Missing required booking fields: ...` | Category form fields not provided. |
| 401 | Unauthenticated | Missing or invalid access token. |
| 404 | `Service not found` | Invalid or inactive service ID. |
| 422 | `Stay services must be booked via POST /bookings/room` | Service is in the stay category. |
| 422 | `Service belongs to a different hotel` | Service tenant doesn't match hotel ID. |
| 500 | `Failed to create service booking` | Internal error. |

---

## Issue #238 — formData Auto-Derivation

:::info Resolved
The endpoint now **auto-derives** identity and scheduling fields from the authenticated guest and the request payload. Clients no longer need to redundantly provide `full_name`, `email`, `phone`, `reservation_date`, `party_size`, or `meal_type` in `formData`.
:::

### Auto-derived fields

| Field | Source |
|---|---|
| `full_name` | `users.first_name + last_name` (via URDD) |
| `email` | `users.email` |
| `phone` | `users.phone_no` |
| `party_size` | `adults` from the request payload |
| `reservation_date` | Primary slot date from `meals[].date` or `sessions[].start` |
| `meal_type` | `meals[0].mealType` from the request payload |

Explicitly provided `formData` values take precedence — auto-derivation only fills in missing fields.

### Form schema discovery

`GET /guest/services?serviceId=<id>` now returns a `formSchema` array in the detail response:

```json
{
  "id": 76,
  "category": { "id": 2, "name": "Dining" },
  "formSchema": [
    { "key": "full_name", "label": "Full Name", "type": "text", "isRequired": true },
    { "key": "email", "label": "Email Address", "type": "email", "isRequired": true },
    { "key": "phone", "label": "Phone Number", "type": "tel", "isRequired": true },
    { "key": "reservation_date", "label": "Reservation Date & Time", "type": "datetime", "isRequired": true },
    { "key": "party_size", "label": "Number of Guests", "type": "number", "isRequired": true },
    { "key": "meal_type", "label": "Meal Type", "type": "dropdown", "isRequired": true }
  ]
}
```

The schema is per-category — each service category has different required fields, defined in `hms_config_keys` with `category_id=12`.

---

## Issue #263 — checkIn/checkOut for all standalone service types

:::info Resolved
`checkIn` / `checkOut` are now populated for **all** standalone service booking types, not just dining.
:::

Previously, only dining bookings derived `checkIn`/`checkOut` from the scheduling fields. Spa, barber, transport, and other categories left both as `null` even though the date was sent in the request.

### checkIn/checkOut derivation order

The endpoint derives `checkIn`/`checkOut` in this priority:

| Priority | Source | Example |
|---|---|---|
| 1 | Scheduling fields | `sessions[0].date`, `meals[0].date`, `transport.pickupDateTime` |
| 2 | Explicit request body | `checkIn` / `checkOut` (or `check_in` / `check_out`) |
| 3 | Mirror | If `checkIn` is set but `checkOut` is not, `checkOut` = `checkIn` |

### What changed in `summariseDates`

| Category | Before | After |
|---|---|---|
| **Dining** | Read `meals[].date` | No change (already worked) |
| **Session** (spa/barber/gym) | Only read `sessions[].start` (legacy format) | Now also reads `sessions[].date` (mobile format) |
| **Transport** | Only read `transport.pickupAt` (legacy) | Now also reads `transport.pickupDateTime` (mobile format) |

### Sim test

`guestServiceBookingCheckInOut.js` — verifies checkIn/checkOut for each service type:

| Test | What it proves |
|---|---|
| 1: Spa session | `checkIn`/`checkOut` derived from `sessions[0].date` |
| 2: Dining meal | `checkIn`/`checkOut` derived from `meals[0].date` (regression check) |
| 3: Transport | `checkIn`/`checkOut` derived from `transport.pickupDateTime` |
| 4: Explicit fallback | `checkIn`/`checkOut` from request body when no scheduling fields sent |
| 5: Bundle response | The booking listing API returns populated `checkIn`/`checkOut` |

```bash
node Services/SysScripts/TestScripts/sim/guestServiceBookingCheckInOut.js
```

### Other sim tests

`guestBookingsServiceCreate.js` — 44 tests including formSchema exposure (Test 0a) and auto-derivation without explicit formData (Test 0b).

---

## Change Log

| Date | Change |
|---|---|
| 2026-07-13 | Response now includes `downPayment` object (20% of total). Booking confirmation email moved to after first successful payment. See [Add Services to Booking](./add-services-to-booking.md) for full addon + payment flow. |
| 2026-06-14 | Added `quantity` parameter for multi-quantity service bookings. Price = unit price × quantity. Controlled by `max_quantity_per_booking` hms_config key (default: 1). Quantity > provided scheduling entries creates remaining slots as unscheduled. |
| 2026-06-12 | Booking status defaults to `confirmed` (removed `confirmation_mode` dependency). Only `requires_approval: true` produces `pending`. Added Kids Center example. Added warning about scheduling fields vs formData. |
| 2026-06-10 | Fixed #263: `checkIn`/`checkOut` now derived for all standalone service types (spa, barber, transport), not just dining. `summariseDates` handles mobile format (`sessions[].date`, `transport.pickupDateTime`). Explicit `checkIn`/`checkOut` in request body honored as fallback. Single-day bookings mirror `checkIn` → `checkOut`. |
| 2026-06-07 | Fixed #238: Auto-derivation of formData identity/scheduling fields. |
