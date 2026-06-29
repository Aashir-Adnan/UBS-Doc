---
sidebar_position: 2
title: "Booking Rules — Backend Implementation Guide"
description: "What was implemented on the backend, how each feature works, and what frontend changes are required."
---

# Booking Rules — Backend Implementation Guide

This document describes what was implemented on the backend to satisfy the
[Booking Rules Requirements Spec](./booking-rules-requirements), how each feature works,
and what frontend changes are required to use them.

---

## 1. Factor-Based Package Filtering

**Spec ref:** Version A rule 4, Version B rule 2

### What Was Done

Modified `searchQueries.js` → `searchPackages()` to add a post-SQL filter that removes
packages whose fixed duration (`pkg_duration` from hms_config `duration` key) is **not a
factor** of the total stay length when `checkIn` + `checkOut` dates are provided.

- Example: 10-night stay → only packages with durations 1, 2, 5, or 10 are returned.
- Packages with no fixed `duration` config are allowed through (permissive default).
- The `pkg_duration` value is now included in search result objects so the frontend can
  compute serial booking counts.

### Files Changed

- `Src/HelperFunctions/Guest/v2/searchQueries.js` — added factor filter + `pkg_duration`
  in returned objects

### Frontend Requirements

- Use `pkg_duration` from search results to compute serial count:
  `serialCount = stayNights / pkg_duration`.
- Display the multiplied price: `items_needed x serialCount x current_price`.
- When the pinned package's duration is not a factor, show:
  *"This package's N-night duration doesn't fit your X-night stay."*

---

## 2. Multi-Room Package Capacity Check

**Spec ref:** Version B rule 2 — multi-room packages

### What Was Done

Added `filterPackagesByRoomDistribution()` in `searchFilterHelper.js`. When party size is
provided, this function queries the total capacity across all stay services in each package
and excludes packages where `total_room_capacity < party_size`.

### Files Changed

- `Src/HelperFunctions/Guest/v2/searchFilterHelper.js` — new function integrated into
  `searchAndFilter()`

### Frontend Requirements

- Send `adults` and `children` params with the search request.
- No other changes needed — filtering is server-side.

---

## 3. Multi-Unit Room Availability

**Spec ref:** Version B rule 2 — multi-unit same room

### What Was Done

Added `filterRoomsByMultiUnitAvailability()` in `searchFilterHelper.js`. Calculates
`unitsNeeded = ceil(party / room_capacity)` and verifies that many units are available
(not booked) for the date range.

### Files Changed

- `Src/HelperFunctions/Guest/v2/searchFilterHelper.js` — new function integrated into
  `searchAndFilter()`

### Frontend Requirements

- Send `adults`, `children`, `checkIn`, `checkOut` with the search request.
- Display `ceil(party / capacity)` units at `units x nights x price`.

---

## 4. Serial/Parallel Package Booking

**Spec ref:** Booking Model section, Booking Validation Rules

### What Was Done

Modified `createPackageBooking.js` to accept an optional `entries` array:

```json
{
  "packageId": 123,
  "checkIn": "2026-07-01",
  "adults": 4,
  "entries": [
    { "check_in_date": "2026-07-01", "check_out_date": "2026-07-03", "quantity": 2 },
    { "check_in_date": "2026-07-03", "check_out_date": "2026-07-05", "quantity": 2 },
    { "check_in_date": "2026-07-05", "check_out_date": "2026-07-07", "quantity": 2 }
  ]
}
```

### Validation Rules Enforced

1. **Duration match** — each entry's nights must equal `pkg_duration` (from config)
2. **Serial continuity** — check-out of entry N = check-in of entry N+1
3. **Factor match** — total stay is divisible by duration
4. **Max booking cap** — `sum(quantity) x duration <= max_booking` config
5. **Past-date / zero-night** — all entries validated
6. **Availability** — `quantity` units picked per entry via `pickMultipleAvailableUnits()`

### How It Works

- Multiple `booking_items` rows are created (one per unit per entry), all linked to a
  single `bookings` row spanning the full date range.
- Price = `packagePrice x totalInstances` where `totalInstances = sum(entry.quantity)`.
- **Backward compatible**: if `entries` is not provided, the legacy single check-in/out
  flow works exactly as before.

### Files Changed

- `Src/HelperFunctions/PreProcessingFunctions/Guest/createPackageBooking.js`
- `Src/HelperFunctions/Guest/v2/createBookingShared.js` — new
  `pickMultipleAvailableUnits()`
- `Src/Apis/.../GuestBookingsPackage/CRUD_parameters.js` — added `entries` param

### Frontend Requirements

- Build the `entries` array when the stay exceeds the package duration.
- `quantity` = parallel copies (party exceeds single package capacity).
- Serial entries = consecutive date windows (stay exceeds package duration).
- Calendar should enforce exact multiples of the package's fixed duration.

---

## 5. Max Booking Cap Validation

**Spec ref:** Max booking cap section, Booking Validation Rules rule 4

### What Was Done

- **Room bookings**: fetches `max_booking` config. Computes
  `unitsNeeded x nights` and rejects if it exceeds `max_booking`.
- **Package bookings**: validated in `validateEntries()` for multi-entry, and directly for
  single-entry.

### Config Key

| Key | Base Table | Type | Description |
|-----|-----------|------|-------------|
| `max_booking` | `services` or `packages` | number | Maximum item-nights per booking |

### Files Changed

- `Src/HelperFunctions/PreProcessingFunctions/Guest/createRoomBooking.js`
- `Src/HelperFunctions/PreProcessingFunctions/Guest/createPackageBooking.js`

### Frontend Requirements

- Show remaining capacity: *"You can book up to N room-nights. Currently selected: X."*
- Prevent submission when `items x nights > max_booking`.

---

## 6. Hotel-Scoped Add-ons

**Spec ref:** Add-ons rule 2

### Status: Already Enforced

`addBookingServices.js` line 56 enforces `svc.tenant_id !== bookingTenantId` — addons from
a different hotel are rejected with a 422 error.

### Frontend Requirements

- Always pass `hotelId` when fetching the add-on catalog via `GuestServices`.

---

## 7. Exclude Bundled Services from Add-ons

**Spec ref:** Add-ons rule 3

### What Was Done

- `GuestServices.js` accepts `excludePackageId` in the request body.
- `fetchBundledServiceIds(packageId)` queries `package_services` and filters out bundled
  services from the add-on list.

### Frontend Requirements

- Send `excludePackageId = <selected_package_id>` when loading add-ons for a package
  booking.
- Display bundled services as "included / complimentary" (read-only).

---

## 8. Exempt (Pinned) Item from Search Results

**Spec ref:** Version A rule 4 — pinned-then-appended dedupe

### What Was Done

- `GuestSearchFilter` accepts `exemptServiceId` and `exemptPackageId` query params.
- `searchFilterHelper.js` filters these IDs from results before pagination.

### Frontend Requirements

- Pass `exemptServiceId=<id>` or `exemptPackageId=<id>` with the search request.
- Manually prepend the pinned item at the top of the results list.
- If the pinned item no longer matches, drop the pin.

---

## 9. Zero-Night and Past-Date Validation

**Spec ref:** Edge cases — zero-night, past dates

### What Was Done

- **Room bookings**: `checkIn >= checkOut` rejects with "zero-night stays are not allowed";
  `checkIn < today` rejects with "cannot be in the past".
- **Package bookings**: same checks, plus per-entry validation in `validateEntries()`.

### Frontend Requirements

- Disable past dates in the calendar picker.
- Enforce minimum 1-night stay.
- Backend validates regardless.

---

## 10. Booking Idempotency

**Spec ref:** Cross-cutting — idempotency

### What Was Done

- Added `idempotencyKey` optional field to both booking endpoints.
- `insertBookingRow()` checks for an existing booking with the same
  `urdd_id + idempotency_key` before creating a new one.
- If a match is found, the existing booking is returned without duplicating.

### Migration Required

```sql
-- data/migrations_completed/20260629_1_add_idempotency_key_to_bookings.sql
ALTER TABLE bookings
  ADD COLUMN idempotency_key VARCHAR(255) DEFAULT NULL
  AFTER special_requests;

CREATE UNIQUE INDEX uq_bookings_urdd_idempotency
  ON bookings (urdd_id, idempotency_key);
```

### Frontend Requirements

- Generate a UUID per booking attempt and send it as `idempotencyKey`.
- On network failure / timeout, retry with the **same** key.

---

## 11. Unavailable Dates Endpoint

**Spec ref:** Version A rule 1

### What Was Done

- New `GET /api/guest/unavailable/dates` endpoint.
- Accepts `serviceId` or `packageId` query param.
- Returns array of `YYYY-MM-DD` strings for the next 365 days where all delivery units
  are fully booked.

### Frontend Requirements

- Call this when landing on the booking wizard with a pinned item.
- Disable returned dates on the calendar picker.

---

## 12. Hotel Info on Guest Cards

### What Was Done

- New `fetchHotelInfoBatch()` in `serviceEnrichment.js`.
- Included in all guest response builders (landing, detailed, minimal, package objects).
- Each card now includes:

```json
{
  "hotel": {
    "name": { "en": "Hotel Name", "ar": "..." },
    "logo": "attachment_id",
    "address": "...",
    "city": "...",
    "country": "...",
    "coordinates": { "lat": 24.7, "lng": 46.6 }
  }
}
```

### Frontend Requirements

- Use the `hotel` object on cards/detail pages to show hotel name, logo, location.

---

## Admin Config Keys Reference

| Config Key | Base Table | Purpose |
|---|---|---|
| `duration` | packages | Package's fixed night count (factor filtering + entry validation) |
| `max_booking` | services / packages | Max item-nights per booking |
| `max_persons_per_booking` | services | Room capacity (for multi-unit calculation) |
| `max_adults` | packages | Package adult capacity |
| `max_children` | packages | Package children capacity |

These keys must be set on services/packages in the admin dashboard for the corresponding
rules to activate. When a key is absent, the rule is skipped (permissive default).

---

## 13. Date-Parsing Fix (Bug Found During Testing)

### What Was Found

`isBlackedOut()` in `serviceConfigs.js` crashed with `RangeError: Invalid time value`
when `checkIn` contained a time component (e.g., `"2026-07-15 00:00:00"` from MySQL
datetime). The concatenation `dateISO + "T00:00:00Z"` produced an invalid string.

### What Was Fixed

- `serviceConfigs.js` `isBlackedOut()`: added `.slice(0, 10)` on all date inputs
- `createRoomBooking.js`: added `checkInStr = String(checkIn).slice(0, 10)` and used it
  in date validation, advance-booking checks, and blackout checks
- `createPackageBooking.js`: same `.slice(0, 10)` safety on date inputs

### Files Changed

- `Src/HelperFunctions/Guest/v2/serviceConfigs.js`
- `Src/HelperFunctions/PreProcessingFunctions/Guest/createRoomBooking.js`
- `Src/HelperFunctions/PreProcessingFunctions/Guest/createPackageBooking.js`

---

## 14. Idempotency Early-Return Fix (Bug Found During Testing)

### What Was Found

When `insertBookingRow` returned an existing booking via idempotency key match, the rest
of the booking creation flow still attempted to insert `booking_services`, `booking_items`,
and form data rows, causing duplicates or errors.

### What Was Fixed

- `insertBookingRow` now returns `{ ..., isExisting: true }` on idempotency match
- Both `createRoomBooking` and `createPackageBooking` check `isExisting` and return early

---

## Integration Tests

See the [Test Report](./booking-rules-test-report) for the full test suite covering all
31 assertions across 10 test groups.

**Run:** `node Services/SysScripts/TestScripts/sim/bookingRulesCheck.js`

---

## What Is NOT Built Yet

| Item | Reason |
|---|---|
| Frontend price multiplier display | Frontend-only |
| Calendar enforcement (exact multiples of package duration) | Frontend-only |
| Cap feedback UI | Frontend-only |
| Distribution assignment UX (which guests in which room) | Open question |
| Mixed sort (rooms + packages ordering) | Open question |
| Bundle vs paid variant precision | Open question |
| Cancellation vs scheduled slots | Open question |
| `minAdults` enforcement on trailing under-filled unit | Open question |
| Infant occupancy counting | Open question |
| In-wizard slot scheduling | Deliberately removed |
| Per-item vs global `max_booking` | Currently per-item |
