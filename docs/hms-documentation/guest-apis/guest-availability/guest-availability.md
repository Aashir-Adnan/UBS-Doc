# Guest Availability

**GET** `/api/guest/availability`

Probes room and package availability for a given date range and hotel(s). Mirrors the same validation and unit-availability checks performed by the booking APIs (`createRoomBooking`, `createPackageBooking`) so the client can pre-flight before actually creating a booking.

Returns whether each room/package is available, its price, any **booking rule violations**, and — when unavailable — the **next available date range** (scanned up to 30 days ahead).

---

## Authentication

Uses **PUBLIC_ENCRYPTED_PLATFORM** — encrypted request/response using the platform key only. No guest JWT required.

---

## Request Payload

| Field | Type | Required | Description |
|---|---|---|---|
| `hotelId` | `number` or `string` | Yes | Hotel tenant ID(s). Comma-separated for multiple hotels. |
| `checkIn` | `string` | Yes | Check-in date (YYYY-MM-DD). |
| `checkOut` | `string` | Yes | Check-out date (YYYY-MM-DD). Must be after `checkIn`. |
| `adults` | `number` | Yes | Number of adults (1–8). |
| `children` | `number` | No | Number of children (0–6, default: 0). |
| `serviceId` | `number` | No | Filter to a specific room/stay service. Skips packages. |
| `roomId` | `number` | No | Alias for `serviceId` — resolves a specific room service (mirrors `createRoomBooking`'s `roomId`). Skips packages. |
| `tag` | `string` | No | Resolve a stay service by keyword tag (e.g. `"suite"`). Only works when a single `hotelId` is provided. Returns a single room result. |
| `packageId` | `number` | No | Filter to a specific package. Skips rooms. |
| `entries` | `array` | No | Serial/parallel booking entries for packages (see [Entries Mode](#entries-mode-packages)). Only used when `packageId` is also provided. |

### Room resolution priority

When checking rooms, the service is resolved in this order: `roomId` → `serviceId` → `tag`-based lookup → all stay services for the hotel(s).

### Example — Basic

```json
{
  "hotelId": 3,
  "checkIn": "2026-07-01",
  "checkOut": "2026-07-04",
  "adults": 2,
  "children": 0
}
```

### Example — Specific room by tag

```json
{
  "hotelId": 3,
  "checkIn": "2026-07-01",
  "checkOut": "2026-07-04",
  "adults": 2,
  "tag": "suite"
}
```

### Example — Package with entries

```json
{
  "hotelId": 3,
  "checkIn": "2026-07-01",
  "checkOut": "2026-07-07",
  "adults": 2,
  "packageId": 10,
  "entries": [
    { "check_in_date": "2026-07-01", "check_out_date": "2026-07-04", "quantity": 2 },
    { "check_in_date": "2026-07-04", "check_out_date": "2026-07-07", "quantity": 1 }
  ]
}
```

---

## Booking Rule Validation

The probe now runs the same booking rule checks as the actual booking creation APIs. Violations are returned in a `violations` array on each room/package entry instead of blocking the request. If any violations exist, `available` is `false` regardless of unit availability.

### Room rules (mirrors `createRoomBooking`)

| Config key | Check |
|---|---|
| `min_stay_nights` | Stay duration must be ≥ minimum. |
| `max_stay_nights` | Stay duration must be ≤ maximum. |
| `min_persons_per_booking` | Total guests (adults + children) must be ≥ minimum. |
| `max_persons_per_booking` | Total guests must be ≤ maximum. |
| `max_quantity_per_booking` | `ceil(totalPersons / roomCapacity)` must not exceed the cap. |
| `advance_booking_min_days` | Check-in must be at least N days from today. |
| `advance_booking_max_days` | Check-in must be at most N days from today. |
| `blackout_dates` | Check-in must not fall in a blackout period. |

### Package rules (mirrors `createPackageBooking`)

| Config key | Check |
|---|---|
| `weekday_arrival_restriction` | Check-in day-of-week must be in the allowed list. |
| `advance_booking_min_days` | Check-in must be at least N days from today. |
| `advance_booking_max_days` | Check-in must be at most N days from today. |
| `blackout_dates` | Check-in must not fall in a blackout period. |
| `max_quantity_per_booking` | Total quantity across entries must not exceed the cap. |
| `min_persons_per_booking` | Party size from stay service config. |
| `max_persons_per_booking` | Party size from stay service config. |

### Delivery unit capacity (rooms and package stays)

The probe checks that enough free delivery units (rooms) exist for the whole party (adults + children), the same way booking does. Each delivery unit has a `capacity` (guests per room).

1. **Rooms needed.** With `entries`, the largest entry `quantity`. Otherwise the probe takes the largest of 1, `ceil(guests / max_persons_per_booking)` and `ceil(guests / smallest unit capacity)`, and returns it as `roomsNeeded` when it's more than 1.
2. **Enough free units.** Fewer free units than rooms needed for the dates adds `insufficient_units`, and `nextAvailable` is filled in.
3. **Enough capacity.** The rooms booking would assign (the first free units, in the same order booking uses) must hold every guest. If their combined `capacity` is lower, `insufficient_capacity` is added. Booking rejects the same request. A unit with no capacity set counts as unlimited.

With `entries`, rule 2 is checked for each entry, and rule 3 for the entry with the largest quantity, as booking does. Either violation sets `available` to `false`.

| Rule | Extra fields | When |
|---|---|---|
| `insufficient_units` | `unitsNeeded`, `unitsAvailable` | Fewer free rooms than the party needs for those dates |
| `insufficient_capacity` | `unitsNeeded`, `capacity`, `guests` | The rooms that would be assigned can't hold every guest |

---

## Entries Mode (Packages)

When `packageId` and `entries` are both provided, the probe mirrors `createPackageBooking`'s serial/parallel booking flow:

Each entry: `{ check_in_date, check_out_date, quantity }`

Alternative key names are accepted: `checkIn`/`check_in` and `checkOut`/`check_out`.

### Entry validation rules

| Rule | Check |
|---|---|
| Duration match | Each entry's nights must equal the package's `duration` config. |
| Serial continuity | Check-out of entry N must equal check-in of entry N+1. |
| Factor match | Total stay (first check-in to last check-out) must be divisible by duration. |
| Max booking cap | `sum(quantity)` must not exceed `max_quantity_per_booking`. |

### Unit availability check

1. **Full-span attempt** — Try to find `max(quantity)` units available for the entire span (first check-in to last check-out) so the guest keeps the same room(s) across entries.
2. **Per-entry fallback** — If full-span fails, check each entry independently for `quantity` free units. An entry without enough adds an `insufficient_units` violation naming the entry.
3. **Capacity** — The entry with the largest quantity must hold the whole party (`insufficient_capacity` otherwise). See [Delivery unit capacity](#delivery-unit-capacity-rooms-and-package-stays).

The response includes per-entry availability details when entries are used.

---

## Response

### All Available (200)

```json
{
  "checkIn": "2026-07-01",
  "checkOut": "2026-07-04",
  "nights": 3,
  "rooms": [
    {
      "serviceId": 71,
      "hotelId": 3,
      "available": true,
      "nightlyPrice": 500,
      "currency": "SAR",
      "violations": [],
      "nextAvailable": null
    },
    {
      "serviceId": 72,
      "hotelId": 3,
      "available": true,
      "nightlyPrice": 1200,
      "currency": "SAR",
      "violations": [],
      "nextAvailable": null
    }
  ],
  "packages": [
    {
      "packageId": 10,
      "hotelId": 3,
      "available": true,
      "totalPrice": 2500,
      "currency": "SAR",
      "violations": [],
      "nextAvailable": null
    }
  ]
}
```

### Unavailable with Violations (200)

When booking rules are violated, `available` is `false` and `violations` lists each failed rule:

```json
{
  "checkIn": "2026-07-01",
  "checkOut": "2026-07-02",
  "nights": 1,
  "rooms": [
    {
      "serviceId": 71,
      "hotelId": 3,
      "available": false,
      "nightlyPrice": 500,
      "currency": "SAR",
      "violations": [
        { "rule": "min_stay_nights", "message": "Minimum stay is 2 nights" }
      ],
      "nextAvailable": null
    }
  ]
}
```

### Unavailable — not enough rooms for the party (200)

Three guests asked for a room type with one free unit of capacity 2:

```json
{
  "checkIn": "2026-10-08",
  "checkOut": "2026-10-10",
  "nights": 2,
  "rooms": {
    "serviceId": 489,
    "hotelId": 88,
    "available": false,
    "nightlyPrice": 400,
    "currency": "SAR",
    "violations": [
      {
        "rule": "insufficient_units",
        "message": "Only 1 room(s) available from 2026-10-08 to 2026-10-10, 2 needed for 3 guest(s)",
        "unitsNeeded": 2,
        "unitsAvailable": 1
      }
    ],
    "nextAvailable": null,
    "roomsNeeded": 2
  }
}
```

With `entries` asking for 1 room for the same 3 guests, the room is free but too small:

```json
{ "rule": "insufficient_capacity", "message": "Entry 1: 1 room(s) can accommodate 2 guest(s) but 3 were requested", "unitsNeeded": 1, "capacity": 2, "guests": 3 }
```

### Unavailable with Next Available Dates (200)

When a room or package's stay service is unavailable (no free units), `nextAvailable` contains the nearest date range (same stay duration) where a unit is free, scanned up to 30 days ahead:

```json
{
  "checkIn": "2026-07-01",
  "checkOut": "2026-07-04",
  "nights": 3,
  "rooms": [
    {
      "serviceId": 71,
      "hotelId": 3,
      "available": false,
      "nightlyPrice": 500,
      "currency": "SAR",
      "violations": [],
      "nextAvailable": {
        "availableFrom": "2026-07-05",
        "availableTo": "2026-07-08"
      }
    }
  ]
}
```

### Package with Entries (200)

When `entries` are provided, the response includes per-entry availability:

```json
{
  "checkIn": "2026-07-01",
  "checkOut": "2026-07-07",
  "nights": 6,
  "packages": {
    "packageId": 10,
    "hotelId": 3,
    "available": false,
    "totalPrice": 7500,
    "currency": "SAR",
    "violations": [],
    "nextAvailable": null,
    "entries": [
      {
        "checkIn": "2026-07-01",
        "checkOut": "2026-07-04",
        "quantity": 2,
        "available": true,
        "unitsFound": 2
      },
      {
        "checkIn": "2026-07-04",
        "checkOut": "2026-07-07",
        "quantity": 2,
        "available": false,
        "unitsFound": 1
      }
    ]
  }
}
```

The `totalPrice` is multiplied by the total number of instances (`sum(quantity)` across entries).

### Filtered by serviceId / roomId / tag (200)

When `serviceId`, `roomId`, or `tag` is provided, `rooms` is a single object (not an array) and `packages` is omitted:

```json
{
  "checkIn": "2026-07-01",
  "checkOut": "2026-07-04",
  "nights": 3,
  "rooms": {
    "serviceId": 71,
    "hotelId": 3,
    "available": true,
    "nightlyPrice": 500,
    "currency": "SAR",
    "violations": [],
    "nextAvailable": null
  }
}
```

### Filtered by packageId (200)

When `packageId` is provided, `packages` is a single object (not an array) and `rooms` is omitted:

```json
{
  "checkIn": "2026-07-01",
  "checkOut": "2026-07-04",
  "nights": 3,
  "packages": {
    "packageId": 10,
    "hotelId": 3,
    "available": true,
    "totalPrice": 2500,
    "currency": "SAR",
    "violations": [],
    "nextAvailable": null
  }
}
```

---

## Response Fields

### Top-level

| Field | Type | Description |
|---|---|---|
| `checkIn` | `string` | Requested check-in date. |
| `checkOut` | `string` | Requested check-out date. |
| `nights` | `number` | Number of nights. |
| `rooms` | `array\|object` | Availability for stay services. Array when listing all; single object when filtered by `serviceId`/`roomId`/`tag`. Omitted when `packageId` is sent. |
| `packages` | `array\|object` | Availability for packages. Array when listing all; single object when filtered by `packageId`. Omitted when `serviceId`/`roomId` is sent. |

### Room Entry

| Field | Type | Description |
|---|---|---|
| `serviceId` | `number` | Room service ID. |
| `hotelId` | `number` | Hotel tenant ID. |
| `available` | `boolean` | `true` only if a unit is free **and** no booking rule violations exist. |
| `nightlyPrice` | `number\|null` | Price per night. |
| `currency` | `string` | Currency code. |
| `violations` | `array` | Booking rule violations (empty if none). Each: `{ rule, message }`, plus extra fields for the unit rules (see [Delivery unit capacity](#delivery-unit-capacity-rooms-and-package-stays)). |
| `nextAvailable` | `object\|null` | Next available date range if no units are free. `null` if available or no alternative found within 30 days. |

### Package Entry

| Field | Type | Description |
|---|---|---|
| `packageId` | `number` | Package ID. |
| `hotelId` | `number` | Hotel tenant ID. |
| `available` | `boolean` | `true` only if units are free **and** no booking rule violations exist. |
| `totalPrice` | `number` | Total package price (multiplied by total instances when entries are used). |
| `currency` | `string` | Currency code. |
| `violations` | `array` | Booking rule violations (empty if none). Each: `{ rule, message }`, plus extra fields for the unit rules (see [Delivery unit capacity](#delivery-unit-capacity-rooms-and-package-stays)). |
| `nextAvailable` | `object\|null` | Next available date range (single-entry mode only). |
| `entries` | `array` | *(Only present when entries are provided)* Per-entry availability details. |

### Violation Object

| Field | Type | Description |
|---|---|---|
| `rule` | `string` | Config key or validation rule that was violated (e.g. `min_stay_nights`, `blackout_dates`, `entries_duration`, `insufficient_units`, `insufficient_capacity`). |
| `message` | `string` | Human-readable description of the violation. |

### Entry Result Object

| Field | Type | Description |
|---|---|---|
| `checkIn` | `string` | Entry check-in date. |
| `checkOut` | `string` | Entry check-out date. |
| `quantity` | `number` | Requested number of units. |
| `available` | `boolean` | Whether enough units were found. |
| `unitsFound` | `number` | Actual number of units available. |

### nextAvailable Object

| Field | Type | Description |
|---|---|---|
| `availableFrom` | `string` | Earliest available check-in date (YYYY-MM-DD). |
| `availableTo` | `string` | Corresponding check-out date (same stay duration). |

---

## How nextAvailable Works

When a room or package's stay service is unavailable:

1. Starting from the day after the requested `checkIn`, scan forward day by day.
2. For each candidate check-in, compute `candidateCheckOut = candidateCheckIn + nights`.
3. Call `pickAvailableUnitForService` to check if any unit is free for that range.
4. Return the first match as `{ availableFrom, availableTo }`.
5. If no match within 30 days, return `null`.

The scan preserves the same stay duration — if the guest asked for 3 nights, the suggestion is also for 3 nights.

---

## Error Responses

| Status | Condition |
|---|---|
| 422 | Missing or invalid `hotelId`, `checkIn`, `checkOut`, `adults`, or `children`. `checkOut` must be after `checkIn`. Invalid `serviceId`, `roomId`, or `packageId`. |

Validation errors include a `details` array with per-field error codes:

```json
{
  "message": "Validation failed",
  "details": [
    { "field": "checkIn", "code": "invalid_date" },
    { "field": "adults", "code": "out_of_range" }
  ]
}
```

---

## Related Endpoints

- **[Guest Unavailable Dates](../guest-unavailable-dates/guest-unavailable-dates.md)** — Returns all fully booked dates for a room/package from today to 1 year ahead. Use this to disable dates in the date picker before the guest selects a range.
- **[Guest Booking Flow](../guest-booking-flow/guest-booking-flow.md)** — The actual booking creation APIs that this probe mirrors.

---

## Source Files

| File | Purpose |
|---|---|
| `Src/Apis/ProjectSpecificApis/GuestSpecificApis/GuestAvailability/GuestAvailability.js` | API object definition |
| `Src/Apis/ProjectSpecificApis/GuestSpecificApis/GuestAvailability/CRUD_parameters.js` | Request parameter schema |
| `Src/HelperFunctions/PreProcessingFunctions/Guest/probeGuestAvailability.js` | Availability probe + booking rule validation + next-available scan |
| `Src/HelperFunctions/Guest/v2/createBookingShared.js` | `pickAvailableUnitForService`, `pickMultipleAvailableUnits` — unit conflict detection |
| `Src/HelperFunctions/Guest/v2/serviceConfigs.js` | `fetchGuestConfigs`, `isBlackedOut`, `cfgNum` — booking rule config helpers |
