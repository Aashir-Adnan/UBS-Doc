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
| `meals` | `array` | No | For dining/room-service. Each entry: `{ date, mealType, slot? }`. `slot` is `"HH:MM-HH:MM"` (e.g. `"10:30-12:00"`). |
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
    { "date": "2026-07-02", "mealType": "breakfast", "slot": "10:30-12:00" }
  ],
  "adults": 2,
  "specialRequests": "Window seat please"
}
```

The `slot` field is optional. When provided, `scheduled_start` and `scheduled_end` in `booking_service_slots` are stored as full datetimes (e.g. `2026-07-02 10:30:00` and `2026-07-02 12:00:00`). When omitted, `scheduled_start` is the date only and `scheduled_end` is `null`.

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

Pickup and drop-off are chosen from the dropdown options the service detail returns for
`guest_pickup_location` / `guest_dropoff_location` (see
[Transport Pickup / Drop-off](#transport-pickup--drop-off-locations) below). Send the option's
`value`:

```json
{
  "actionPerformerURDD": 16,
  "serviceId": 102,
  "transport": {
    "tripType": "airport_pickup",
    "pickupDateTime": "2026-07-02 14:00:00",
    "passengers": 2
  },
  "formData": {
    "guest_pickup_location": "59871",
    "guest_dropoff_location": "59872"
  }
}
```

`"59871"` is the option's `value` — the `hms_config.id` of the row holding that stop, exactly as a
normal dropdown submits an `hms_config_possible_values.id`. Treat it as opaque; take it from the
service detail response.

Sending the whole option (or its `form` object) instead of the scalar works identically:

```json
{
  "formData": {
    "guest_pickup_location": {
      "hms_config_id": 59871,
      "order": 1,
      "location_name": { "en": "Leamridian Hotel", "ar": "" },
      "location_latitude": "31.480369",
      "location_longitude": "74.369286"
    }
  }
}
```

The legacy shape — `transport.pickupLocation` / `transport.dropoffLocation` as free text — is
still accepted and is back-filled into the two `formData` keys, so existing clients keep working.

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
8. Resolves `formData.guest_pickup_location` / `guest_dropoff_location` against the service's
   configured `pickup_locations` / `dropoff_locations`, expanding the submitted value into the
   full location form entry. Back-fills them from `transport.pickupLocation` /
   `transport.dropoffLocation` first when absent.
9. Validates guest-supplied `formData` against category-12 required fields.
10. Gets catalog price for the service. Multiplies by `quantity` for the initial total.
11. Inserts `bookings` row with `booking_type='individual_service'`.
12. Inserts `booking_services` row + `booking_service_slots` rows for the primary service:
    - **Dining/room-service**: One slot per meal with `meal_type` form value.
    - **Transport**: Single slot with `trip_type`, `pickup_location`, `dropoff_location`, `guest_pickup_location`, `guest_dropoff_location` form values.
    - **Other (spa, barber, gym, etc.)**: One slot per session entry.
    - **No scheduling provided**: Single unscheduled slot.
13. If `addons` provided, inserts additional `booking_services` + slots for each addon.
14. Recomputes `total_amount` from all `booking_services` rows.
15. Stores guest form values in `hms_config`.
16. Awards loyalty points based on tenant's `loyalty_earn_rate`.
17. Returns the full v2 booking bundle (same shape as all other booking endpoints).

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
  "slots": {
    "type": "meals",
    "items": [
      {
        "id": 1234,
        "date": "2026-07-02",
        "mealType": "breakfast",
        "status": "scheduled"
      }
    ]
  },
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

### `slots` Object

The `slots` object surfaces the primary service's scheduling details for standalone service bookings. It is `null` for room and package bookings.

| Field | Type | Description |
|---|---|---|
| `type` | `string` | The slot kind: `"meals"`, `"sessions"`, or `"transport"`. Determined by the service's category slug. |
| `items` | `array` or `object` | The slot entries. Array for `meals`/`sessions`, object for `transport`. |

The `type` value determines the shape of each entry in `items`:

**`type: "meals"`** (dining / room-service):

```json
{
  "type": "meals",
  "items": [
    { "id": 1234, "date": "2026-07-02", "mealType": "breakfast", "status": "scheduled" }
  ]
}
```

**`type: "sessions"`** (spa / barber / gym / other):

```json
{
  "type": "sessions",
  "items": [
    { "id": 1235, "date": "2026-07-02", "slot": "15:00-16:00", "status": "scheduled" }
  ]
}
```

**`type: "transport"`**:

```json
{
  "type": "transport",
  "items": {
    "tripType": "airport_pickup",
    "pickupDateTime": "2026-07-02 14:00:00",
    "pickupLocation": "King Abdulaziz International Airport",
    "dropoffLocation": "Hotel Main Entrance",
    "passengers": null
  }
}
```

| Item field | Appears in | Description |
|---|---|---|
| `id` | meals, sessions | The `slot_id` from `booking_service_slots`. Use this for targeted slot removal or reschedule. |
| `date` | meals, sessions | Scheduled date (`YYYY-MM-DD`). `null` if unscheduled. |
| `mealType` | meals | The meal type (e.g. `"breakfast"`, `"lunch"`, `"dinner"`). |
| `slot` | sessions | Time range (`"HH:MM-HH:MM"`). `null` if unscheduled or time not provided. |
| `status` | meals, sessions | `"scheduled"` or `"unscheduled"`. |
| `tripType` | transport | Trip type (e.g. `"airport_pickup"`). |
| `pickupDateTime` | transport | Pickup datetime. |
| `pickupLocation` | transport | Pickup location. |
| `dropoffLocation` | transport | Drop-off location. |

### Key Response Fields

| Field | Description |
|---|---|
| `bookingType` | Always `"individual_service"` for standalone service bookings. |
| `tag` | Category slug of the booked service (e.g. `"dining"`, `"barber"`, `"spa"`, `"transport"`). |
| `schedulingStatus` | `"complete"` if all slots are scheduled, `"unscheduled"` if booked without timing, `"partial"` if mixed. |
| `slots` | Primary service scheduling details. `null` for room/package bookings. See `slots` Object below. |
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
| Dining / Room Service | `meals[]` | `{ date, mealType, slot? }` → one slot per meal. `slot` (`"HH:MM-HH:MM"`) sets `scheduled_start`/`scheduled_end` as full datetimes. | `meal_type` |
| Transport | `transport` | `{ pickupDateTime, tripType, ... }` → single slot | `trip_type`, `pickup_location`, `dropoff_location`, `guest_pickup_location`, `guest_dropoff_location`, `passengers` |
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

## Transport Pickup / Drop-off Locations

:::info Added 2026-08-27
Transport pickup and drop-off moved from free text to a per-service dropdown.
:::

### Where the options come from

A hotel admin configures the stops on the **service** itself, via the `location_form` config keys
`pickup_locations` and `dropoff_locations`. Each entry is
`{ order, location_name, location_latitude, location_longitude }`.

`GET /guest/services?serviceId=<id>` turns those entries into options on the two category-12
dropdown keys, so the client never reads the raw config:

| Guest form key | Options sourced from |
|---|---|
| `guest_pickup_location` | the service's `pickup_locations` |
| `guest_dropoff_location` | the service's `dropoff_locations` |

Both keys are `isRequired: true` and apply to the **transport** category only. Full option shape
is documented in [Guest Services](../guest-services/guest-services.md#per-service-dropdown-options--transport-pickup--drop-off).

### What to submit

Put the value in `formData`. Four forms are accepted:

| Submitted | Resolved to |
|---|---|
| The option's `value` — `"59871"` | that exact location's full form entry |
| The whole option object | same — matched on its `value` |
| The option's `form` object | same — matched on `hms_config_id` |
| A bare location name — `"Leamridian Hotel"` | that location, **only if the name is unique** on the service (matched against the option's English label) |

The option `value` is the `hms_config.id` of the row holding that location. A multi-value config is
stored one row per entity, so that id addresses one stop the way an `hms_config_possible_values.id`
addresses one option for every other dropdown. Prefer it: it is the only form that stays
unambiguous when two stops share a name.

The last row is the legacy path, kept so clients that still send free text keep working. It
resolves only on an **unambiguous** match — if two stops share the name there is no way to tell
which was meant, so the raw string is stored rather than silently attributed to the first one.

A value matching no configured location is also stored as-is rather than rejected: a transport
service whose admin has not yet filled in `pickup_locations` returns the field with **no
options**, and the legacy free-text `transport.pickupLocation` accepted arbitrary names.
Required-ness is still enforced — a missing value is a `400`.

### What gets stored

Two places, both under `hms_config` with `config_key='form_values'`:

**Booking level** (`base_table='bookings'`, `record_id=<booking_id>`) — the resolved value is
stored **as the form**, not flattened to its label:

```json
{
  "guest_pickup_location": {
    "hms_config_id": 59871,
    "order": 1,
    "location_name": { "en": "Leamridian Hotel", "ar": "" },
    "location_latitude": "31.480369",
    "location_longitude": "74.369286"
  },
  "guest_dropoff_location": {
    "hms_config_id": 59872,
    "order": 2,
    "location_name": { "en": "Hotel", "ar": "" },
    "location_latitude": "32.5204",
    "location_longitude": "75.3587"
  }
}
```

`hms_config_id` is what makes the stored answer traceable: it names the `hms_config` row the guest
actually chose — the same role a possible-value id plays for every other dropdown.

`location_name` is stored **verbatim as the admin entered it**, so it is normally a bilingual
`{en, ar}` object rather than a string. The scalar `pickup_location` / `dropoff_location` keys
below carry the plain English name for readers that want a string. The rest of the object is
a snapshot taken at booking time, so a later admin edit never rewrites history — the booking keeps
the name and coordinates it was made with, and the provenance pair says where they came from.

**Slot level** (`base_table='booking_service_slots'`, `record_id=<slot_id>`) — the same objects,
alongside the pre-existing scalar keys, which stay populated with the location name:

```json
{
  "trip_type": "airport_pickup",
  "pickup_location": "Leamridian Hotel",
  "dropoff_location": "Hotel",
  "guest_pickup_location": { "hms_config_id": 59871, "order": 1, "location_name": { "en": "Leamridian Hotel", "ar": "" }, "location_latitude": "31.480369", "location_longitude": "74.369286" },
  "guest_dropoff_location": { "hms_config_id": 59872, "order": 2, "location_name": { "en": "Hotel", "ar": "" }, "location_latitude": "32.5204", "location_longitude": "75.3587" },
  "passengers": 2
}
```

`pickup_location` / `dropoff_location` are kept so that booking bundles, the `slots.items`
response block, and the admin screens keep reading the same scalar they always have. Anything
needing coordinates should read the `guest_*_location` objects.

### Applies to addons too

The same resolution runs for services added through
[`POST /guest/bookings/services`](./add-services-to-booking.md). An addon may carry the locations
as `addon.transport.guest_pickup_location`, `addon.transport.pickupLocation`, or
`addon.guestPickupLocation` — all three resolve identically.

---

## Change Log

| Date | Change |
|---|---|
| 2026-08-27 | Transport pickup/drop-off moved to the per-service dropdowns `guest_pickup_location` / `guest_dropoff_location` in `formData`. The option value is the `hms_config.id` of the row holding that location, addressing the source row the way a possible-value id does. Submitted values are resolved against the service's configured locations and stored as the full location form entry — stamped with `hms_config_id` — at both booking and slot level. The legacy `transport.pickupLocation` / `dropoffLocation` fields and the scalar `pickup_location` / `dropoff_location` slot form values are both retained; a bare location name resolves only when unambiguous. |
| 2026-07-13 | Response now includes `downPayment` object (20% of total). Booking confirmation email moved to after first successful payment. See [Add Services to Booking](./add-services-to-booking.md) for full addon + payment flow. |
| 2026-08-13 | Added top-level `slots` object to standalone service booking responses. Contains `type` (`"meals"`, `"sessions"`, or `"transport"`) and `items` (the scheduled slot entries). Previously, primary service slots were only stored in the DB but not returned in the response. Also: dining/room-service `meals[]` now accepts optional `slot` field (`"HH:MM-HH:MM"`) — when provided, `booking_service_slots.scheduled_start` and `scheduled_end` are stored as full datetimes. `children` field now accepted and stored. |
| 2026-06-14 | Added `quantity` parameter for multi-quantity service bookings. Price = unit price × quantity. Controlled by `max_quantity_per_booking` hms_config key (default: 1). Quantity > provided scheduling entries creates remaining slots as unscheduled. |
| 2026-06-12 | Booking status defaults to `confirmed` (removed `confirmation_mode` dependency). Only `requires_approval: true` produces `pending`. Added Kids Center example. Added warning about scheduling fields vs formData. |
| 2026-06-10 | Fixed #263: `checkIn`/`checkOut` now derived for all standalone service types (spa, barber, transport), not just dining. `summariseDates` handles mobile format (`sessions[].date`, `transport.pickupDateTime`). Explicit `checkIn`/`checkOut` in request body honored as fallback. Single-day bookings mirror `checkIn` → `checkOut`. |
| 2026-06-07 | Fixed #238: Auto-derivation of formData identity/scheduling fields. |
