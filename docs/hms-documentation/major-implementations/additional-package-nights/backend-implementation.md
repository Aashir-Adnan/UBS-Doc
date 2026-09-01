# Additional Package Nights — Backend Implementation

**Date:** 2026-08-27
**Audience:** Backend developers, code reviewers, future maintainers
**Scope:** Complete technical reference for how additional package nights are validated, priced, and enforced across all booking flows.

---

## Overview

Packages have a fixed duration (e.g. 3 nights). Before this feature, a booking's total stay had to be an exact multiple of the duration. This feature introduces 4 new `hms_config_keys` that let an admin allow extra nights beyond the last full period, with configurable discount pricing.

### Config Keys

All 4 keys target `packages` in `hms_config_keys` and are scoped per package via `hms_config` rows:

| Config Key | Value Type | Example | Purpose |
|---|---|---|---|
| `additional_package_nights_allowed` | text (boolean) | `"true"` | Master toggle. Must be `"true"`, `true`, `"1"`, or `1` to enable. |
| `max_additional_package_nights` | text (number) | `"2"` | Maximum extra nights allowed beyond the last full period. |
| `additional_package_nights_price_discount_value` | text (number) | `"10"` | Discount amount applied to the per-night rate for extra nights. |
| `additional_package_nights_price_discount_type` | text (enum) | `"percentage"` | Either `"percentage"` or `"flat"`. |

**Migration:** `data/migrations_completed/20260827_1_add_additional_package_nights_config_keys.sql` — 4 idempotent `INSERT ... WHERE NOT EXISTS` statements.

---

## Core Validation: `validateExtraNights`

**File:** `Src/HelperFunctions/Guest/v2/catalogPricing.js`

```js
function validateExtraNights(nights, duration, allowed, maxAllowed, maxQuantity)
```

**Returns:** `{ valid: boolean, fullPeriods: number, extraNights: number }`

### Logic

#### When additional nights is OFF (`allowed` is falsy)

Pure divisibility — valid only if `extraNights === 0`:

```
fullPeriods = floor(nights / duration)
extraNights = nights - fullPeriods × duration
```

#### When additional nights is ON and `maxAllowed` is defined

The system **maximizes extra nights** (subject to divisibility) up to `maxAllowed`. Extra nights apply **once per booking** — the budget does not multiply with the number of full periods.

```
// Extra nights must satisfy: (nights - extraNights) % duration === 0
// Find the maximum valid extraNights ≤ min(maxAllowed, nights - duration):
proposed      = max(1, ceil((nights - maxAllowed) / duration))
proposedExtra = nights - proposed × duration

if proposedExtra ≥ 0 AND proposedExtra ≤ maxAllowed:
    fullPeriods = proposed
    extraNights = proposedExtra
else:
    // No valid decomposition — fall back to floor for error messages
    fullPeriods = floor(nights / duration)
    extraNights = nights - fullPeriods × duration
```

Then validate:
1. `extraNights ≤ maxAllowed`
2. `fullPeriods ≤ maxQuantity` (if set)

**Divisibility note:** extra nights must make the remaining stay divisible by `duration`. The maximized extra may be less than `maxAllowed` when the remainder constraint prevents reaching it. For example, with `duration=2` and `maxAllowed=5`, a 22-night stay yields **4** extra nights (not 5) because `22 − 5 = 17` is not divisible by 2 — the largest valid extra is 4 (`22 − 4 = 18 = 2 × 9`).

#### Worked example: 2-night package, max 5 additional nights

| Total nights | Full periods | Extra nights | Notes |
|---|---|---|---|
| 2 | 1 | 0 | No room for extra |
| 3 | 1 | 1 | |
| 5 | 1 | 3 | (5 would need 0 remainder nights which isn't possible) |
| 21 | 8 | 5 | Max extra reached |
| 22 | 9 | 4 | 5 not reachable (22−5=17, odd) |
| 23 | 9 | 5 | Max extra reached |

#### When additional nights is ON and `maxAllowed` is null (unlimited)

Falls back to floor decomposition. Any `extraNights` value is accepted; only `maxQuantity` is checked.

### Unit Tests

**File:** `Services/SysScripts/TestScripts/validateExtraNights.test.js`

```bash
node Services/SysScripts/TestScripts/validateExtraNights.test.js
```

33 inline assertions — all passing.

---

## Pricing: `computeBookingPricing`

**File:** `Src/HelperFunctions/Guest/v2/catalogPricing.js` (lines ~497-605)

This is the **single source of truth** for all booking totals. The package branch was extended to:

1. Self-fetch the 4 additional-nights config keys (no caller changes needed).
2. Call `validateExtraNights` to decompose `nights` into `fullPeriods` and `extraNights`.
3. Price the base block: `subtotal = catalogPrice * packageQuantity` (where `packageQuantity = fullPeriods * rooms`).
4. Price extra nights and add to subtotal (before pricing rules):

```js
basePerNight = catalogPrice / duration
discountedPerNight =
  discType === 'flat'  ? max(0, basePerNight - discValue)
                       : max(0, basePerNight * (1 - discValue / 100))
extraSubtotal = round(discountedPerNight * extraNights * rooms, 2)
subtotal += extraSubtotal
```

5. Apply tenant pricing rules (tax, markup, etc.) to the combined subtotal.
6. Return `{ subtotal, grandTotal, appliedRules, packageQuantity, packageDuration, nights, extraNights }`.

The `extraNights` field is available in the return value for internal use (e.g. logging, analytics) but is **not currently surfaced** in the booking response payload to the frontend. The pricing is baked into `subtotal` and `grandTotal`.

---

## Validation Touchpoints

The divisibility check was previously a raw modulo (`nights % duration !== 0`). All 6 touchpoints now use `validateExtraNights` instead:

### 1. `createPackageBooking.js`

**File:** `Src/HelperFunctions/PreProcessingFunctions/Guest/createPackageBooking.js`

**Two validation paths:**

**Non-entries path** (simple `checkIn`/`checkOut`):
- Computes `totalNights` from the dates.
- Calls `validateExtraNights(totalNights, pkgDuration, allowed, maxAdditional, maxBooking)`.
- On `!valid`: throws 400 with a context-specific message (quantity exceeded / extra nights exceeded / not a multiple).

**Entries path** (serial/parallel booking with explicit entries array):
- `validateEntries()` function enforces 4 rules:
  1. **Duration match** — each entry's nights must equal the package duration, **except the last entry** which may have up to `maxExtraNights` extra nights when additional is enabled.
  2. **Serial continuity** — check-out of entry N = check-in of entry N+1.
  3. **Factor match** — total stay validated via `validateExtraNights(totalStay, duration, allowed, maxExtraNights)` (no `maxQuantity` here — Rule 4 handles it separately with explicit quantities).
  4. **Max booking cap** — `sum(entry.quantity) <= max_quantity_per_booking`.

**Config fetch:** All 4 additional-nights keys plus `max_quantity_per_booking` are fetched in a single `fetchGuestConfigs` call alongside existing config keys (duration, blackout dates, etc.).

### 2. `editBooking.js`

**File:** `Src/HelperFunctions/PreProcessingFunctions/Guest/editBooking.js`

When the guest edits check-in/check-out dates on a package booking:
- Fetches `duration`, `max_quantity_per_booking`, `additional_package_nights_allowed`, `max_additional_package_nights` for the package.
- Calls `validateExtraNights(newNights, rawDuration, allowed, maxAdditional, maxQuantity)`.
- On `!valid`: throws 400.
- If valid: the edit proceeds and `computeBookingPricing` recalculates the total with extra-night pricing.

### 3. `stageBookingChanges.js`

**File:** `Src/HelperFunctions/PreProcessingFunctions/Guest/stageBookingChanges.js`

Same pattern as editBooking but errors are collected in a `violations[]` array instead of thrown:
- Fetches the 4 config keys in the existing `fetchGuestConfigs` call for the package.
- Calls `validateExtraNights` on proposed new nights.
- On `!valid`: pushes a violation to `errors[]` (the staging API returns violations, not 400s).

### 4. `probeGuestAvailability.js`

**File:** `Src/HelperFunctions/PreProcessingFunctions/Guest/probeGuestAvailability.js`

**Two validation paths:**

**Non-entries probe** (simple date range):
- When `pkgDuration` is set: calls `validateExtraNights(probeNights, pkgDuration, allowed, maxAdditional, maxBooking)`.
- On `!valid`: pushes a violation with rule `"max_quantity_per_booking"`, `"extra_nights"`, or `"package_duration"`.

**Entries probe** (`validateEntriesForProbe`):
- Signature extended to `(entries, pkgDuration, maxBooking, extraAllowed, maxExtraNights)`.
- Rule 1: last entry may have extra nights (same relaxation as `createPackageBooking.validateEntries`).
- Rule 3: factor match uses `validateExtraNights(totalStay, duration, allowed, maxExtraNights)` — no `maxQuantity` (Rule 4 handles explicit quantities).

**Config fetch:** `fetchGuestConfigs` call extended with `additional_package_nights_allowed` and `max_additional_package_nights` (batch-fetched for all candidate packages).

### 5. `searchQueries.js`

**File:** `Src/HelperFunctions/Guest/v2/searchQueries.js`

The date-based package filter (previously `stayNights % dur === 0`) now:
1. Batch-fetches `additional_package_nights_allowed`, `max_additional_package_nights`, and `max_quantity_per_booking` for all candidate packages.
2. Filters using `validateExtraNights(stayNights, dur, allowed, maxAdditional, maxQuantity).valid`.

This means packages with additional nights enabled appear in search results even when the guest's date range doesn't cleanly divide by the package duration.

### 6. `computeBookingPricing` (catalogPricing.js)

Self-fetches the 4 config keys and handles pricing as described in the Pricing section above. This function is the single source of truth — callers don't pass additional-nights config.

---

## Data Flow Diagram

```
Guest selects dates (checkIn / checkOut)
         │
         ▼
  ┌─────────────────────────┐
  │   validateExtraNights   │  ← Pure function, no DB
  │   (nights, duration,    │
  │    allowed, maxAllowed,  │
  │    maxQuantity)          │
  └─────────┬───────────────┘
            │
     valid? ─┤
     │       │
     NO      YES
     │       │
  400/       ▼
  violation  ┌──────────────────────┐
             │ computeBookingPricing │  ← Fetches configs + catalog price
             │                      │
             │ 1. catalogPrice *    │
             │    fullPeriods * rooms│
             │ 2. + discountedRate  │
             │    * extraNights     │
             │    * rooms           │
             │ 3. applyPricingRules │
             └──────────┬───────────┘
                        │
                        ▼
                   { subtotal,
                     grandTotal,
                     extraNights }
```

---

## Error Messages

All validation paths produce consistent, descriptive error messages:

| Condition | Message |
|---|---|
| Additional OFF, non-divisible stay | `"Stay of X nights is not a multiple of package duration (Y nights)"` |
| Additional ON, extra > max | `"Extra nights (X) exceed the maximum allowed (Y)"` |
| Additional ON, periods > maxQuantity | `"Booking of X period(s) exceeds the maximum allowed (Y)"` |
| Entries: non-last entry wrong duration | `"Entry N: duration X nights does not match package duration of Y nights"` |
| Entries: total stay factor invalid | Same as non-entries messages above |

---

## Sim Test

**File:** `Services/SysScripts/TestScripts/sim/guestAdditionalPackageNights.js`

6 scenarios against a live server (package 365, tenant 86, duration 2):

1. **Control** — 2-night booking (clean multiple) succeeds.
2. **Rejection** — 3-night booking without additional-nights config returns 400.
3. **Acceptance** — 3-night booking with config (`allowed=true`, `max=1`) succeeds.
4. **Edit** — edit an existing 2-night booking to 3 nights succeeds.
5. **Clean multiple** — 4-night booking (2 periods, no extra) still succeeds with additional ON.
6. **Fill-extra-first pricing** — 4-night booking (clean multiple of 2) with `max_additional=2` and 10% discount: verifies the booking is accepted and the total reflects 1 full period + 2 discounted extra nights, not 2 full periods.

```bash
npm start  # server must be running
node Services/SysScripts/TestScripts/sim/guestAdditionalPackageNights.js
```

The test inserts temporary `hms_config` rows for setup and cleans up all created bookings + config rows on exit.

---

## Files Changed

| File | Change |
|---|---|
| `data/migrations_completed/20260827_1_add_additional_package_nights_config_keys.sql` | 4 new config keys |
| `Src/HelperFunctions/Guest/v2/catalogPricing.js` | `validateExtraNights` (fill-extra-first formula) + `derivePackageQuantity` (delegates to validateExtraNights) + `computeBookingPricing` extension |
| `Src/HelperFunctions/PreProcessingFunctions/Guest/createPackageBooking.js` | Pass additional-nights config to `derivePackageQuantity` (non-entries path) |
| `Src/HelperFunctions/PreProcessingFunctions/Guest/editBooking.js` | Fetch additional-nights config keys; pass to `derivePackageQuantity` |
| `Src/HelperFunctions/PreProcessingFunctions/Guest/stageBookingChanges.js` | Pass additional-nights config to `derivePackageQuantity` (current + proposed quantity) |
| `Src/HelperFunctions/PreProcessingFunctions/Guest/probeGuestAvailability.js` | Import + relaxed probe validation |
| `Src/HelperFunctions/Guest/v2/searchQueries.js` | Import + relaxed package filter |
| `Services/SysScripts/TestScripts/validateExtraNights.test.js` | Unit tests (27 assertions — 7 new fill-extra-first cases added) |
| `Services/SysScripts/TestScripts/sim/guestAdditionalPackageNights.js` | Integration sim test (6 scenarios) |
