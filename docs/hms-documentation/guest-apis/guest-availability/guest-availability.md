# Guest Availability

**GET** `/api/guest/availability`

Probes room and package availability for a given date range and hotel(s). Returns whether each room/package is available, its price, and — when unavailable — the **next available date range** (scanned up to 30 days ahead).

This is the pre-booking check the frontend calls before showing the "Book Now" button or to power the availability calendar.

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
| `serviceId` | `number` | No | Filter to a specific room/stay service. |
| `packageId` | `number` | No | Filter to a specific package. |

### Example

```json
{
  "hotelId": 3,
  "checkIn": "2026-07-01",
  "checkOut": "2026-07-04",
  "adults": 2,
  "children": 0
}
```

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
      "nextAvailable": null
    },
    {
      "serviceId": 72,
      "hotelId": 3,
      "available": true,
      "nightlyPrice": 1200,
      "currency": "SAR",
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
      "nextAvailable": null
    }
  ]
}
```

### Unavailable with Next Available Dates (200)

When a room or package is not available for the requested dates, `nextAvailable` contains the nearest date range (same stay duration) where a unit is free, scanned up to 30 days ahead:

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
      "nextAvailable": {
        "availableFrom": "2026-07-05",
        "availableTo": "2026-07-08"
      }
    },
    {
      "serviceId": 72,
      "hotelId": 3,
      "available": true,
      "nightlyPrice": 1200,
      "currency": "SAR",
      "nextAvailable": null
    }
  ],
  "packages": [
    {
      "packageId": 10,
      "hotelId": 3,
      "available": false,
      "totalPrice": 2500,
      "currency": "SAR",
      "nextAvailable": {
        "availableFrom": "2026-07-05",
        "availableTo": "2026-07-08"
      }
    }
  ]
}
```

### No Availability Found (200)

If no availability exists within the 30-day scan window, `nextAvailable` is `null`:

```json
{
  "serviceId": 71,
  "hotelId": 3,
  "available": false,
  "nightlyPrice": 500,
  "currency": "SAR",
  "nextAvailable": null
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
| `rooms` | `array` | Availability for each stay service (room type). |
| `packages` | `array` | Availability for each package. |

### Room / Package Entry

| Field | Type | Description |
|---|---|---|
| `serviceId` / `packageId` | `number` | Room service ID or package ID. |
| `hotelId` | `number` | Hotel tenant ID. |
| `available` | `boolean` | Whether a unit is free for the requested dates. |
| `nightlyPrice` / `totalPrice` | `number` | Price per night (rooms) or total package price. |
| `currency` | `string` | Currency code. |
| `nextAvailable` | `object\|null` | Next available date range if unavailable (scans up to 30 days ahead). `null` if available or no alternative found. |

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
| 422 | Missing or invalid `hotelId`, `checkIn`, `checkOut`, `adults`, or `children`. `checkOut` must be after `checkIn`. |

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

## Source Files

| File | Purpose |
|---|---|
| `Src/Apis/ProjectSpecificApis/GuestSpecificApis/GuestAvailability/GuestAvailability.js` | API object definition |
| `Src/Apis/ProjectSpecificApis/GuestSpecificApis/GuestAvailability/CRUD_parameters.js` | Request parameter schema |
| `Src/HelperFunctions/PreProcessingFunctions/Guest/probeGuestAvailability.js` | Availability probe + next-available scan logic |
| `Src/HelperFunctions/Guest/v2/createBookingShared.js` | `pickAvailableUnitForService` — unit conflict detection |
