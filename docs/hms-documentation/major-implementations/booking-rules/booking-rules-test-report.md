---
sidebar_position: 3
title: "Booking Rules — Test Report"
description: "Integration test suite for booking rules: what is tested, how to run, test data requirements, results, and bugs found."
---

# Booking Rules — Integration Test Report

Test file: `Services/SysScripts/TestScripts/sim/bookingRulesCheck.js`

```bash
node Services/SysScripts/TestScripts/sim/bookingRulesCheck.js
```

---

## Prerequisites

1. **Server running** on `localhost:3000`
2. **credentials.json** populated (run `guestOtpFlow.js` first to get `accessToken` and `actionPerformerURDD`)
3. **DB migration** applied:
   ```sql
   ALTER TABLE bookings
     ADD COLUMN idempotency_key VARCHAR(255) DEFAULT NULL
     AFTER special_requests;
   CREATE UNIQUE INDEX uq_bookings_urdd_idempotency
     ON bookings (urdd_id, idempotency_key);
   ```
4. **Config data seeded** (the test assumes these exist):
   - `max_booking = 10` on service 188 (hms_config, config_key `max_booking`)
   - `max_booking = 6` on package 344 (hms_config, config_key `max_booking`)
   - `max_persons_per_booking` set on rooms 188, 189, 205, 206
   - Package durations: 344/346/348/350 = 2 nights, 345/349 = 3 nights (via `duration` config)

---

## Test Groups

### 1. Factor-Based Package Filtering (6 assertions)

Tests that `GET /guest/search/filter` only returns packages whose fixed duration is a
factor of the stay length when `checkIn` and `checkOut` are provided.

| Test | Input | Expected |
|------|-------|----------|
| 10-night stay: 2-night included | `checkIn=2026-10-01, checkOut=2026-10-11` | Packages 344, 346, 348, 350 (duration 2) appear |
| 10-night stay: 3-night excluded | same | Packages 345, 349 (duration 3) do NOT appear |
| 6-night stay: 2-night included | `checkIn=2026-10-01, checkOut=2026-10-07` | 2-night packages appear (6/2 = 3, factor) |
| 6-night stay: 3-night included | same | 3-night packages appear (6/3 = 2, factor) |
| 7-night stay: all excluded | `checkIn=2026-10-01, checkOut=2026-10-08` | Neither 2-night nor 3-night packages appear (7 is prime) |
| No dates: no filter | no checkIn/checkOut | All packages returned |

**API under test:** `GET /guest/search/filter?include=packages&checkIn=...&checkOut=...`
**Backend logic:** `searchQueries.js` post-filters packages where `stayNights % pkg_duration !== 0`

---

### 2. Multi-Unit Room Availability (1 assertion)

Tests that when party size exceeds a single room's capacity, the room is still included
if enough units are available.

| Test | Input | Expected |
|------|-------|----------|
| Party of 3, room cap 2 | `adults=3, checkIn/checkOut` | Room 188 included (needs 2 of 5 units) |

**API under test:** `GET /guest/search/filter?include=rooms&adults=3&checkIn=...&checkOut=...`
**Backend logic:** `searchFilterHelper.js` `filterRoomsByMultiUnitAvailability()` computes
`ceil(party / capacity)` and checks available unit count

---

### 3. Exempt (Pinned) Item Exclusion (2 assertions)

Tests that `exemptServiceId` and `exemptPackageId` query params remove the specified
items from search results (for the pinned-item flow where frontend re-appends them at top).

| Test | Input | Expected |
|------|-------|----------|
| Exempt service 188 | `exemptServiceId=188` | Service 188 NOT in results |
| Exempt package 344 | `exemptPackageId=344` | Package 344 NOT in results |

**API under test:** `GET /guest/search/filter?exemptServiceId=188&exemptPackageId=344`

---

### 4. Unavailable Dates Endpoint (4 assertions)

Tests `GET /guest/unavailable/dates` which returns fully-booked dates for a room or
package over the next 365 days.

| Test | Input | Expected |
|------|-------|----------|
| Room by serviceId | `serviceId=188` | Returns `{ serviceId: 188, unavailableDates: [...] }` |
| Returns date array | same | `unavailableDates` is an array of YYYY-MM-DD strings |
| Has rangeStart | same | `rangeStart` is today's date |
| Package resolves to stay | `packageId=344` | Returns `serviceId: 188, packageId: 344` (resolves package's stay service) |

**API under test:** `GET /guest/unavailable/dates?serviceId=...` or `?packageId=...`

---

### 5. Zero-Night and Past-Date Validation (3 assertions)

Tests that the backend rejects invalid booking dates.

| Test | Input | Expected Error |
|------|-------|---------------|
| Zero-night | `checkIn=2026-12-01, checkOut=2026-12-01` | 400: "Check-out must be after check-in" |
| Past date | `checkIn=2024-01-01, checkOut=2024-01-03` | 400: "Check-in date cannot be in the past" |
| Reversed dates | `checkIn=2026-12-05, checkOut=2026-12-03` | 400: "Check-out must be after check-in" |

**API under test:** `POST /guest/bookings/room`

---

### 6. Max Booking Cap (1 assertion)

Tests that a room booking within the `max_booking` limit succeeds.

| Test | Input | Expected |
|------|-------|----------|
| Within cap (2 room-nights, cap 10) | Room 205, 2 nights | Booking created successfully |

**Note:** The negative case (exceeding cap) is tested in group 7 via the package
`max_booking=6` config.

**API under test:** `POST /guest/bookings/room`

---

### 7. Serial/Parallel Package Booking (6 assertions)

Tests the `entries[]` array for serial and parallel package bookings.

| Test | Input | Expected |
|------|-------|----------|
| Serial 3x2-night | 3 entries, quantity 1 each, consecutive dates | Booking created |
| Wrong duration | 1 entry with 3 nights for 2-night package | 400: "duration 3 nights does not match package duration of 2 nights" |
| Gap in serial | 2 entries with 1-day gap between check-out and next check-in | 400: "check-in must equal previous entry's check-out" |
| Parallel 2 copies | 1 entry with quantity 2 | Booking created with 2 unit assignments |
| Exceeds max_booking cap | 4 entries x 2 nights = 8, cap is 6 | 400: "Booking exceeds max limit: 8 item-nights > 6 allowed" |
| Legacy single-entry | No entries array, just checkIn/checkOut | Booking created (backward compatible) |

**API under test:** `POST /guest/bookings/package`

**Request body example (serial):**
```json
{
  "packageId": 348,
  "checkIn": "2026-07-13",
  "entries": [
    { "check_in_date": "2026-07-13", "check_out_date": "2026-07-15", "quantity": 1 },
    { "check_in_date": "2026-07-15", "check_out_date": "2026-07-17", "quantity": 1 },
    { "check_in_date": "2026-07-17", "check_out_date": "2026-07-19", "quantity": 1 }
  ]
}
```

---

### 8. Booking Idempotency (2 assertions)

Tests that sending the same `idempotencyKey` twice returns the same booking without
creating a duplicate.

| Test | Input | Expected |
|------|-------|----------|
| First call | `idempotencyKey: "test-idem-..."` | New booking created, returns bookingId |
| Duplicate call | Same idempotencyKey | Returns same bookingId as first call |

**API under test:** `POST /guest/bookings/room` with `idempotencyKey` in body

**DB requirement:** `bookings.idempotency_key` column + unique index on `(urdd_id, idempotency_key)`

---

### 9. Exclude Bundled Services from Add-ons (3 assertions)

Tests that services bundled in a package are excluded from the add-on catalog when
`excludePackageId` is provided.

| Test | Input | Expected |
|------|-------|----------|
| Massage excluded | `excludePackageId=344` | Service 192 (Full Body Massage) NOT in results |
| Dinner excluded | same | Service 191 (Dinner Set Menu) NOT in results |
| Without exclude | no excludePackageId | Services 192 and 191 ARE in results |

**API under test:** `GET /guest/services?hotelId=16&excludePackageId=344`

**Package 344 bundles:** service 188 (Deluxe Room), 192 (Full Body Massage), 191 (Dinner Set Menu)

---

### 10. Hotel Info on Cards (3 assertions)

Tests that search results include a `hotel` object with name, logo, address, and
coordinates.

| Test | Input | Expected |
|------|-------|----------|
| hotel object present | `GET /guest/search/filter` | First item has `hotel` field |
| hotel.name.en | same | `hotel.name.en` is a non-null string |
| hotel.coordinates | same | Either `null` or `{ lat, lng }` object |

**API under test:** `GET /guest/search/filter?include=rooms,packages`

---

## Test Infrastructure

### Helper Functions

| Function | Purpose |
|----------|---------|
| `assert(label, condition, detail)` | Pass/fail assertion with counter and detail on failure |
| `safeCall(method, path, body, auth, token)` | Wraps `apiCall` to catch errors and return them as `{ _error: true, status, message }` instead of throwing |
| `cleanup(accessToken, urddId)` | Cancels all bookings created during the test run via `PUT /guest/booking/cancel` |

### Date Handling

Tests that create bookings use dynamic dates (`Date.now() + N days`) to stay within
advance booking windows. Different hotels may have different `advance_booking_max_days`
configs (e.g., hotel 16 = 90 days, hotel 39 = 30 days).

### Cleanup

All bookings created during the test are tracked in `createdBookingIds[]` and cancelled
at the end of the run. This ensures test data doesn't accumulate and exhaust room
inventory on repeated runs.

---

## Bugs Found During Testing

### 1. Date Parsing Crash in `isBlackedOut`

**File:** `Src/HelperFunctions/Guest/v2/serviceConfigs.js`

**Symptom:** `RangeError: Invalid time value` when creating room bookings

**Cause:** The `isBlackedOut()` function concatenated the raw `checkIn` value with
`"T00:00:00Z"`. When `checkIn` contained a time component (e.g., `"2026-07-15 00:00:00"`
from MySQL datetime format), the concatenation produced
`"2026-07-15 00:00:00T00:00:00Z"` which is an invalid date string.

**Fix:** Added `.slice(0, 10)` to extract just the date portion before constructing
the ISO string:

```javascript
// Before (broken)
const d = new Date(dateISO + "T00:00:00Z");

// After (fixed)
const d = new Date(String(dateISO).slice(0, 10) + "T00:00:00Z");
```

Same fix applied to `start_date` and `end_date` parsing within the blackout window loop,
and to the advance-booking-window validation in `createRoomBooking.js`.

### 2. Idempotent Booking Re-inserted Rows

**File:** `Src/HelperFunctions/PreProcessingFunctions/Guest/createRoomBooking.js`,
`createPackageBooking.js`

**Symptom:** When `insertBookingRow` returned an existing booking via idempotency match,
the rest of the function still tried to insert `booking_services`, `booking_items`, and
form data rows, causing duplicates or errors.

**Fix:** `insertBookingRow` now returns `{ ..., isExisting: true }` when an idempotency
match is found. Both booking creation flows check `isExisting` and return early without
re-inserting.

---

## Running the Tests

```bash
# 1. Ensure credentials are fresh
node Services/SysScripts/TestScripts/sim/guestOtpFlow.js

# 2. Run the booking rules test suite
node Services/SysScripts/TestScripts/sim/bookingRulesCheck.js
```

**Expected output (all green):**

```
========================================
  BOOKING RULES — INTEGRATION TESTS
========================================

--- 1. Factor-Based Package Filtering ---
  PASS  10-night stay: 2-night packages included
  PASS  10-night stay: 3-night packages excluded
  PASS  6-night stay: 2-night packages included
  PASS  6-night stay: 3-night packages included
  PASS  7-night stay: 2-night and 3-night packages excluded
  PASS  No dates: all packages returned (no factor filter)

--- 2. Multi-Unit Room Availability ---
  PASS  Party of 3, room cap 2: room included (needs 2 of 5 units)

...

========================================
  RESULTS: 31 passed, 0 failed
========================================
```
