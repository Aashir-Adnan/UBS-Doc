---
sidebar_position: 2
title: "Booking Rules — Backend Implementation Guide"
description: "What was implemented on the backend, how each feature works, API endpoints affected, and what frontend changes are required."
---

# Booking Rules — Backend Implementation Guide

This document describes what was implemented on the backend to satisfy the
[Booking Rules Requirements Spec](./booking-rules-requirements), how each feature works,
and what frontend changes are required to use them.

---

## 1. Factor-Based Package Filtering

**Spec ref:** Version A rule 4, Version B rule 2

### API Endpoint

```
GET /api/guest/search/filter
```

| Param | Type | Description |
|-------|------|-------------|
| `include` | query | `"packages"` or `"rooms,packages"` |
| `checkIn` | query | `YYYY-MM-DD` — start of stay |
| `checkOut` | query | `YYYY-MM-DD` — end of stay |
| `pageSize` | query | Number of results per page |

When `checkIn` and `checkOut` are provided, the response only includes packages whose
fixed duration (`pkg_duration`) evenly divides the total stay length.

### What Was Done

Modified `searchQueries.js` `searchPackages()` to add a post-SQL filter that removes
packages where `stayNights % pkg_duration !== 0`.

- Example: 10-night stay only returns packages with durations 1, 2, 5, or 10 nights.
- Packages with no fixed `duration` config are allowed through (permissive default).
- `pkg_duration` is now included in search result objects.

### Response Change

Each package in the response now includes:

```json
{
  "id": 344,
  "pkg_duration": 2,
  "...": "..."
}
```

### Files Changed

- `Src/HelperFunctions/Guest/v2/searchQueries.js`

### Frontend Requirements

- Use `pkg_duration` from search results to compute serial count:
  `serialCount = stayNights / pkg_duration`.
- Display the multiplied price: `items_needed x serialCount x current_price`.
- When the pinned package's duration is not a factor, show:
  *"This package's N-night duration doesn't fit your X-night stay."*

---

## 2. Multi-Room Package Capacity Check

**Spec ref:** Version B rule 2 — multi-room packages

### API Endpoint

```
GET /api/guest/search/filter
```

| Param | Type | Description |
|-------|------|-------------|
| `include` | query | Must include `"packages"` |
| `adults` | query | Number of adults in the party |
| `children` | query | Number of children in the party |

When party size is provided, packages whose combined stay-room capacity cannot accommodate
the party are excluded from results.

### What Was Done

Added `filterPackagesByRoomDistribution()` in `searchFilterHelper.js`. Queries the sum of
`max_persons_per_booking` across all stay services in each package. Excludes packages where
`total_room_capacity < party_size`.

### Files Changed

- `Src/HelperFunctions/Guest/v2/searchFilterHelper.js`

### Frontend Requirements

- Send `adults` and `children` params with the search request.
- No other changes needed — filtering is server-side.

---

## 3. Multi-Unit Room Availability

**Spec ref:** Version B rule 2 — multi-unit same room

### API Endpoint

```
GET /api/guest/search/filter
```

| Param | Type | Description |
|-------|------|-------------|
| `include` | query | Must include `"rooms"` |
| `adults` | query | Number of adults |
| `children` | query | Number of children |
| `checkIn` | query | `YYYY-MM-DD` |
| `checkOut` | query | `YYYY-MM-DD` |

When party size + dates are provided, rooms are checked for sufficient available units:
`unitsNeeded = ceil(party / room_capacity)`. Rooms with fewer available units are excluded.

### What Was Done

Added `filterRoomsByMultiUnitAvailability()` in `searchFilterHelper.js`. Queries
`max_persons_per_booking` config for each room, counts available delivery units for the
date range, and compares.

### Files Changed

- `Src/HelperFunctions/Guest/v2/searchFilterHelper.js`

### Frontend Requirements

- Send `adults`, `children`, `checkIn`, `checkOut` with the search request.
- Display `ceil(party / capacity)` units at `units x nights x price`.

---

## 4. Serial/Parallel Package Booking

**Spec ref:** Booking Model section, Booking Validation Rules

### API Endpoint

```
POST /api/guest/bookings/package
```

| Param | Location | Type | Required | Description |
|-------|----------|------|----------|-------------|
| `packageId` | body | number | yes | Package to book |
| `hotelId` | body | number | no | Hotel (derived from URDD if omitted) |
| `checkIn` | body | string | yes | Overall check-in date `YYYY-MM-DD` |
| `checkOut` | body | string | no | Overall check-out (legacy single-entry) |
| `entries` | body | array | no | Serial/parallel booking entries (new) |
| `entries[].check_in_date` | body | string | yes | Entry check-in `YYYY-MM-DD` |
| `entries[].check_out_date` | body | string | yes | Entry check-out `YYYY-MM-DD` |
| `entries[].quantity` | body | number | no | Parallel copies (default 1) |
| `adults` | body | number | no | Number of adults |
| `children` | body | number | no | Number of children |
| `idempotencyKey` | body | string | no | Deduplication key |
| `services` | body | array | no | Optional scheduling data per package service |

### Request Example (Serial + Parallel)

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
4. **Max booking cap** — `sum(quantity) x duration` must not exceed `max_booking` config
5. **Past-date / zero-night** — all entries validated
6. **Availability** — `quantity` units picked per entry via `pickMultipleAvailableUnits()`

### How It Works

- Multiple `booking_items` rows are created (one per unit per entry), all linked to a
  single `bookings` row spanning the full date range.
- Price = `packagePrice x totalInstances` where `totalInstances = sum(entry.quantity)`.
- **Backward compatible**: if `entries` is not provided, the legacy single check-in/out
  flow works exactly as before.

### Error Responses

| Status | Condition | Example Message |
|--------|-----------|-----------------|
| 400 | Duration mismatch | `"Entry 1: duration 3 nights does not match package duration of 2 nights"` |
| 400 | Serial gap | `"Entry 2: check-in (2027-02-13) must equal previous entry's check-out (2027-02-12)"` |
| 400 | Factor mismatch | `"Total stay of 7 nights is not divisible by package duration of 2 nights"` |
| 400 | Cap exceeded | `"Booking exceeds max limit: 8 item-nights > 6 allowed"` |
| 400 | Past date | `"Entry 1: check-in date cannot be in the past"` |
| 409 | No rooms | `"Not enough available rooms for 2026-07-01 to 2026-07-03: need 2, found 1"` |

### Files Changed

- `Src/HelperFunctions/PreProcessingFunctions/Guest/createPackageBooking.js`
- `Src/HelperFunctions/Guest/v2/createBookingShared.js` — new `pickMultipleAvailableUnits()`
- `Src/Apis/.../GuestBookingsPackage/CRUD_parameters.js` — added `entries`, `idempotencyKey`

### Frontend Requirements

- Build the `entries` array when the stay exceeds the package duration.
- `quantity` = parallel copies (party exceeds single package capacity).
- Serial entries = consecutive date windows (stay exceeds package duration).
- Calendar should enforce exact multiples of the package's fixed duration.

---

## 5. Max Booking Cap Validation

**Spec ref:** Max booking cap section, Booking Validation Rules rule 4

### API Endpoints

```
POST /api/guest/bookings/room
POST /api/guest/bookings/package
```

Both endpoints now fetch the `max_booking` hms_config key and validate:

- **Room bookings**: `unitsNeeded x nights` must not exceed `max_booking`
- **Package bookings (entries)**: `sum(quantity) x duration` must not exceed `max_booking`
- **Package bookings (legacy)**: `pkgDuration` must not exceed `max_booking`

### Config Key

| Key | Base Table | Type | Description |
|-----|-----------|------|-------------|
| `max_booking` | `services` or `packages` | number | Maximum item-nights per booking |

### Error Response

| Status | Example Message |
|--------|-----------------|
| 400 | `"Booking exceeds max limit: 12 room-nights > 10 allowed"` |

### Files Changed

- `Src/HelperFunctions/PreProcessingFunctions/Guest/createRoomBooking.js`
- `Src/HelperFunctions/PreProcessingFunctions/Guest/createPackageBooking.js`

### Frontend Requirements

- Show remaining capacity: *"You can book up to N room-nights. Currently selected: X."*
- Prevent submission when `items x nights > max_booking`.

---

## 6. Hotel-Scoped Add-ons

**Spec ref:** Add-ons rule 2

### API Endpoint

```
POST /api/guest/booking/services   (add addon to existing booking)
GET  /api/guest/services           (list add-on catalog)
```

### Status: Already Enforced

`addBookingServices.js` line 56 enforces `svc.tenant_id !== bookingTenantId` — addons from
a different hotel are rejected with a 422 error.

### Frontend Requirements

- Always pass `hotelId` when fetching the add-on catalog via `GET /api/guest/services`.

---

## 7. Exclude Bundled Services from Add-ons

**Spec ref:** Add-ons rule 3

### API Endpoint

```
GET /api/guest/services
```

| Param | Location | Type | Description |
|-------|----------|------|-------------|
| `hotelId` | query | number | Filter services by hotel |
| `excludePackageId` | query | number | Exclude services bundled in this package |
| `pageSize` | query | number | Results per page |

### What Was Done

- `GuestServices.js` `postProcessList` reads `excludePackageId` from `req.query`.
- `fetchBundledServiceIds(packageId)` queries `package_services` for active services.
- Bundled service IDs are filtered out before pagination.

### Example

```
GET /api/guest/services?hotelId=16&excludePackageId=344&pageSize=50
```

If package 344 bundles services 188, 191, 192 — those three will not appear in results.

### Files Changed

- `Src/Apis/.../GuestServices/GuestServices.js`
- `Src/Apis/.../GuestServices/CRUD_parameters.js`

### Frontend Requirements

- Send `excludePackageId` when loading add-ons for a package booking.
- Display bundled services as "included / complimentary" (read-only).

---

## 8. Exempt (Pinned) Item from Search Results

**Spec ref:** Version A rule 4 — pinned-then-appended dedupe

### API Endpoint

```
GET /api/guest/search/filter
```

| Param | Type | Description |
|-------|------|-------------|
| `exemptServiceId` | query | Service ID to exclude from results |
| `exemptPackageId` | query | Package ID to exclude from results |

### What Was Done

- `GuestSearchFilter` accepts both params.
- `searchFilterHelper.js` filters these IDs from results before pagination.

### Example

```
GET /api/guest/search/filter?include=rooms,packages&exemptServiceId=188&exemptPackageId=344
```

### Files Changed

- `Src/Apis/.../GuestSearchFilter/GuestSearchFilter.js`
- `Src/Apis/.../GuestSearchFilter/CRUD_parameters.js`
- `Src/HelperFunctions/Guest/v2/searchFilterHelper.js`

### Frontend Requirements

- Pass `exemptServiceId` or `exemptPackageId` when searching with a pinned item.
- Manually prepend the pinned item at the top of the results list.
- If the pinned item no longer matches, drop the pin.

---

## 9. Zero-Night and Past-Date Validation

**Spec ref:** Edge cases — zero-night, past dates

### API Endpoints

```
POST /api/guest/bookings/room
POST /api/guest/bookings/package
```

### What Was Done

- **Room bookings**: `checkIn >= checkOut` rejects with "zero-night stays are not allowed";
  `checkIn < today` rejects with "cannot be in the past".
- **Package bookings**: same checks, plus per-entry validation in `validateEntries()`.

### Error Responses

| Status | Condition | Message |
|--------|-----------|---------|
| 400 | Same-day check-in/out | `"Check-out must be after check-in (zero-night stays are not allowed)"` |
| 400 | Past check-in | `"Check-in date cannot be in the past"` |
| 400 | Reversed dates | `"Check-out must be after check-in (zero-night stays are not allowed)"` |

### Files Changed

- `Src/HelperFunctions/PreProcessingFunctions/Guest/createRoomBooking.js`
- `Src/HelperFunctions/PreProcessingFunctions/Guest/createPackageBooking.js`

### Frontend Requirements

- Disable past dates in the calendar picker.
- Enforce minimum 1-night stay.
- Backend validates regardless.

---

## 10. Booking Idempotency

**Spec ref:** Cross-cutting — idempotency

### API Endpoints

```
POST /api/guest/bookings/room
POST /api/guest/bookings/package
```

| Param | Location | Type | Required | Description |
|-------|----------|------|----------|-------------|
| `idempotencyKey` | body | string | no | Client-generated unique key for deduplication |

### What Was Done

- `insertBookingRow()` checks for an existing booking with the same
  `urdd_id + idempotency_key` before creating a new one.
- If a match is found, returns `isExisting: true` and both booking flows return early
  without re-inserting rows.

### Behavior

| Scenario | Result |
|----------|--------|
| First call with key `"abc-123"` | New booking created, returns `booking_id` |
| Second call with same key `"abc-123"` | Returns same `booking_id`, no duplicate created |
| Call without `idempotencyKey` | Normal booking (no deduplication) |

### Migration Required

```sql
ALTER TABLE bookings
  ADD COLUMN idempotency_key VARCHAR(255) DEFAULT NULL
  AFTER special_requests;

CREATE UNIQUE INDEX uq_bookings_urdd_idempotency
  ON bookings (urdd_id, idempotency_key);
```

### Files Changed

- `Src/HelperFunctions/Guest/v2/createBookingShared.js`
- `Src/HelperFunctions/PreProcessingFunctions/Guest/createRoomBooking.js`
- `Src/HelperFunctions/PreProcessingFunctions/Guest/createPackageBooking.js`
- `Src/Apis/.../GuestBookingsRoom/CRUD_parameters.js`
- `Src/Apis/.../GuestBookingsPackage/CRUD_parameters.js`
- `data/migrations_completed/20260629_1_add_idempotency_key_to_bookings.sql`

### Frontend Requirements

- Generate a UUID per booking attempt and send it as `idempotencyKey`.
- On network failure / timeout, retry with the **same** key.

---

## 11. Unavailable Dates Endpoint

**Spec ref:** Version A rule 1

### API Endpoint

```
GET /api/guest/unavailable/dates
```

| Param | Type | Required | Description |
|-------|------|----------|-------------|
| `serviceId` | query | one of | Room service ID |
| `packageId` | query | one of | Package ID (resolves to its stay service) |

**Platform:** `PUBLIC_ENCRYPTED_PLATFORM` (no auth required)

### Response

```json
{
  "serviceId": 188,
  "packageId": null,
  "rangeStart": "2026-06-29",
  "rangeEnd": "2027-06-28",
  "unavailableDates": ["2026-06-29", "2026-06-30", "2026-07-03"]
}
```

### What Was Done

- New endpoint: `Src/Apis/.../GuestUnavailableDates/GuestUnavailableDates.js`
- Business logic: `Src/HelperFunctions/PreProcessingFunctions/Guest/fetchUnavailableDates.js`
- For each date in the next 365 days, checks if ALL delivery units for the service are
  booked. Only fully-booked dates are returned.
- When `packageId` is provided, resolves to the package's stay service first.

### Files

- `Src/Apis/.../GuestUnavailableDates/GuestUnavailableDates.js`
- `Src/Apis/.../GuestUnavailableDates/CRUD_parameters.js`
- `Src/HelperFunctions/PreProcessingFunctions/Guest/fetchUnavailableDates.js`

### Frontend Requirements

- Call this when landing on the booking wizard with a pinned item.
- Disable returned dates on the calendar picker.

---

## 12. Hotel Info on Guest Cards

### API Endpoints (response change only — no new params)

```
GET /api/guest/search/filter      (search results)
GET /api/guest/landing             (landing page)
GET /api/guest/services            (service list + detail)
GET /api/guest/packages            (package detail)
```

### What Was Done

- New `fetchHotelInfoBatch()` in `serviceEnrichment.js`.
- Included in all guest response builders (landing, detailed, minimal, package objects).

### Response Change

Each room/service/package card now includes:

```json
{
  "id": 188,
  "hotelId": 16,
  "hotel": {
    "name": { "en": "Hotel Name", "ar": "..." },
    "logo": "attachment_id",
    "address": "123 Main St",
    "city": "Riyadh",
    "country": "Saudi Arabia",
    "coordinates": { "lat": 24.7, "lng": 46.6 }
  }
}
```

### Files Changed

- `Src/HelperFunctions/Guest/v2/serviceEnrichment.js`
- `Src/HelperFunctions/Guest/v2/landingObjects.js`
- `Src/HelperFunctions/Guest/v2/packageObjects.js`

### Frontend Requirements

- Use the `hotel` object on cards/detail pages to show hotel name, logo, location.

---

## API Endpoint Summary

| Endpoint | Method | What Changed |
|----------|--------|-------------|
| `/api/guest/search/filter` | GET | Factor filtering, multi-room capacity, multi-unit availability, exempt IDs |
| `/api/guest/bookings/package` | POST | Serial/parallel entries, max booking cap, zero-night/past-date, idempotency |
| `/api/guest/bookings/room` | POST | Max booking cap, zero-night/past-date, idempotency |
| `/api/guest/services` | GET | `excludePackageId` param to filter bundled services |
| `/api/guest/unavailable/dates` | GET | New endpoint — returns fully-booked dates |
| `/api/guest/landing` | GET | Hotel info added to response |
| `/api/guest/packages` | GET | Hotel info added to response |

---

## Admin Config Keys Reference

| Config Key | Base Table | Purpose |
|---|---|---|
| `duration` | packages | Package's fixed night count (factor filtering + entry validation) |
| `max_booking` | services / packages | Maximum item-nights per booking |
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

- `insertBookingRow` now returns `isExisting: true` on idempotency match
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
