# Guest Booking Enhancements — Frontend Implementation Guide

**Date:** 2026-07-29
**Audience:** Guest-side frontend developers (mobile app + web app)
**Scope:** New guest-facing response fields, endpoints, and UI requirements.

---

## 1. Allowed Regions Filtering

### New field in service objects

Every service object (landing cards, hotel-services list, service detail) now includes:

```json
{
  "allowedRegions": ["Saudi Arabia", "UAE", "Bahrain"]
}
```

**Where it appears:**
- `GET /guest/hotel-services` — each service in the array
- `GET /guest/search/filter` — each service result
- `GET /guest/services` (detail) — the service object
- `GET /guest/landing` — each service in the feed

**Frontend action required:**
- Use `allowedRegions` to filter or tag services in the catalog by the guest's region
- If `allowedRegions` is empty or absent, the service has no region restriction (show to all)
- Display allowed regions as a badge/chip on service cards if relevant

---

## 2. Min / Max Guest Age

### New fields in service detail object

The service detail response (`buildServiceObjects`) now includes:

```json
{
  "minGuestAge": 18,
  "maxGuestAge": 65
}
```

**Where it appears:**
- `GET /guest/services` (detail view) — on the service object

**Frontend action required:**
- Display age restrictions on the service detail page when either field is non-null
- Suggested UI: "Age restriction: 18 - 65 years" or "Minimum age: 18"
- If `minGuestAge` is null, no minimum restriction
- If `maxGuestAge` is null, no maximum restriction
- Optionally validate guest age at booking time (backend also enforces, but client-side validation improves UX)

---

## 3. Cancellation Policy Display

### `cancellation_info` on service/package detail

The detailed service and package objects already include `cancellation_info`:

```json
{
  "cancellation_info": {
    "margin": {
      "name": {"en": "Standard Policy", "ar": "..."},
      "rules": [
        {"hours_before": 72, "charge_pct": 0},
        {"hours_before": 24, "charge_pct": 25},
        {"hours_before": 0, "charge_pct": 100}
      ]
    },
    "exceptions": {"en": "...", "ar": "..."}
  }
}
```

**Frontend action required:**
- Render the cancellation policy on the service/package detail page and booking confirmation screen
- Parse `cancellation_info.margin.rules` to build a human-readable policy table:

| Cancellation Window | Charge |
|---|---|
| More than 72 hours before check-in | Free (0%) |
| 24 - 72 hours before check-in | 25% of total |
| Less than 24 hours before check-in | 100% of total |

- Use `cancellation_info.margin.name` as the policy title
- Display `cancellation_info.exceptions` as additional notes if present
- Rules are sorted by `hours_before` descending for display; the backend matches the rule with the highest `hours_before` that is still within the time-to-check-in window

### Enhanced cancel response

`POST /guest/booking/cancel` now returns additional fields:

```json
{
  "cancelled": true,
  "cancellationFee": 150.00,
  "cancellationChargePct": 25,
  "cancellationRule": {"hours_before": 24, "charge_pct": 25},
  "refund": {
    "totalRefunded": 450.00,
    "cancellationFeeApplied": 150.00,
    "details": []
  }
}
```

**Frontend action required:**
- Show `cancellationChargePct` and `cancellationFee` on the cancellation confirmation screen
- Display `refund.totalRefunded` as the amount the guest will receive back
- Use `cancellationRule` to explain which rule was applied (e.g. "Cancelled within 24 hours of check-in - 25% charge applied")

---

## 4. Booking Extension

### New endpoint: `POST /guest/booking/extend`

Allows a checked-in guest to extend their room booking checkout date.

**Request:**
```json
{
  "bookingId": 123,
  "newCheckOut": "2026-08-05"
}
```

**Success response:**
```json
{
  "booking": { "...full booking object..." },
  "extensionSummary": {
    "previousCheckOut": "2026-08-01",
    "newCheckOut": "2026-08-05",
    "extensionNights": 4,
    "extensionCost": 2400.00,
    "adjustmentPct": 20,
    "previousTotal": 6000.00,
    "newTotal": 8400.00,
    "currency": "SAR"
  }
}
```

**Error cases:**
| Status | Condition |
|---|---|
| 422 | Booking is a package booking (extensions are room-only) |
| 422 | Booking status is not `checked_in` |
| 422 | `extension_allowed` config is false for the service |
| 400 | Extension exceeds `max_extension_length` nights |
| 400 | `newCheckOut` is not after current checkout |
| 409 | Room not available for the extension period |

**Frontend action required:**
- Add an "Extend Stay" button on the active/checked-in booking detail screen
- Only show the button when the booking is:
  - Status `checked_in`
  - Booking type is `individual_service` (not a package)
- Build a date picker for the new checkout date
- After a successful extension, refresh the booking detail and show the `extensionSummary` (cost breakdown, new total)
- Handle error states with user-friendly messages

---

## 5. Publish Date Window — Error Handling

The backend now rejects bookings where check-in/check-out falls outside the service's publish date window.

**Frontend action required:**
- If the backend returns a 400 with messages like `"Check-in date cannot be before the service availability start date"` or `"Check-out date cannot be after the service availability end date"`, display the error to the guest
- No new response fields — this is server-side validation only

---

## 6. Summary of New Response Fields

### Service card / landing (minimal objects)

| New Field | Type | Description |
|---|---|---|
| `allowedRegions` | `string[]` | Regions where this service is available |

### Service detail (`buildServiceObjects`)

| New Field | Type | Description |
|---|---|---|
| `allowedRegions` | `string[]` | Regions where this service is available |
| `minGuestAge` | `number or null` | Minimum guest age for booking |
| `maxGuestAge` | `number or null` | Maximum guest age for booking |

### Detailed service/package objects (landing + detail page)

| Existing Field | What Changed |
|---|---|
| `cancellation_info.margin` | Now a structured object with `name` and `rules` array (was previously just text in some cases) |

### Cancel booking response

| New Field | Type | Description |
|---|---|---|
| `cancellationChargePct` | `number` | The charge percentage that was applied |
| `cancellationRule` | `object or null` | The specific rule that matched (`hours_before`, `charge_pct`) |

### New endpoint

| Method | Path | Description |
|---|---|---|
| POST | `/guest/booking/extend` | Extend a checked-in room booking's checkout date |
