# Guest Booking Enhancements — Implementation Document

**Date:** 2026-07-29
**Scope:** Seven cross-cutting guest-side features: publish date validation, allowed regions, stay-night enforcement, cancellation margin, booking extensions, catalog pricing recurrence, and guest age constraints.

---

## 1. Publish Date Validation

### Problem
Services and packages have `publish_start_datetime` and `publish_end_datetime` configs that define when they are bookable. Previously, bookings could be created with check-in/check-out dates outside this window.

### Solution
Added `validatePublishDateWindow()` to `serviceConfigs.js` — a shared validator used by all three booking creation flows and the edit flow.

**Files modified:**
- `Src/HelperFunctions/Guest/v2/serviceConfigs.js` — new `validatePublishDateWindow()` function
- `Src/HelperFunctions/PreProcessingFunctions/Guest/createRoomBooking.js` — fetches + validates publish dates
- `Src/HelperFunctions/PreProcessingFunctions/Guest/createPackageBooking.js` — fetches + validates publish dates
- `Src/HelperFunctions/PreProcessingFunctions/Guest/createServiceBooking.js` — fetches + validates publish dates
- `Src/HelperFunctions/PreProcessingFunctions/Guest/editBooking.js` — fetches + validates publish dates on date changes

**Validation rules:**
- Check-in date must be on or after `publish_start_datetime`
- Check-out date must be on or before `publish_end_datetime`
- Check-in date must be on or before `publish_end_datetime`

**Config keys:** `publish_start_datetime`, `publish_end_datetime` (per service/package in `hms_config`)

---

## 2. Allowed Regions in Service Objects

### Problem
Frontend needed to filter services by allowed regions, but the `allowed_regions` config was not included in service response objects.

### Solution
Added `allowed_regions` to the config fetch and response shape in both minimal and detailed service builders.

**Files modified:**
- `Src/HelperFunctions/Guest/v2/landingObjects.js`
  - `buildMinimalServiceObjects` — fetches `allowed_regions` as multi-value config
  - `buildLandingServiceObjects` — fetches `allowed_regions`
  - `buildDetailedServiceObjects` — fetches `allowed_regions`
  - `buildServiceShape` — includes `allowedRegions` array in response

**Response shape:**
```json
{
  "allowedRegions": ["Region A", "Region B"]
}
```

---

## 3. Min/Max Stay Nights Validation

### Status
Already implemented prior to this work.

**Existing enforcement:**
- `createRoomBooking.js` — validates `min_stay_nights` and `max_stay_nights` for both single and serial entries
- `editBooking.js` — validates on date changes
- `createPackageBooking.js` — validates via `validateEntries()` duration match against package duration

---

## 4. Cancellation Margin

### Problem
Cancellation fee computation logic was inline in `GuestBookingCancel.js`. Needed a reusable function and richer response with charge details.

### Solution
Created shared `computeCancellationCharge()` in `serviceConfigs.js` and refactored the cancel handler to use it.

**Files modified:**
- `Src/HelperFunctions/Guest/v2/serviceConfigs.js` — new `computeCancellationCharge()` function
- `Src/Apis/ProjectSpecificApis/GuestSpecificApis/GuestBookingCancel/GuestBookingCancel.js` — refactored to use shared function, enriched response

**Cancellation margin format:**
```json
{
  "name": {"en": "Standard", "ar": "..."},
  "rules": [
    {"hours_before": 48, "charge_pct": 0},
    {"hours_before": 24, "charge_pct": 25},
    {"hours_before": 12, "charge_pct": 50},
    {"hours_before": 0, "charge_pct": 100}
  ]
}
```

**Rule matching:** The rule with the highest `hours_before` that is still less than or equal to hours until check-in wins. The `charge_pct` is applied to `total_amount` to compute the cancellation fee.

**Enhanced cancel response:**
```json
{
  "cancelled": true,
  "cancellationFee": 150.00,
  "cancellationChargePct": 25,
  "cancellationRule": {"hours_before": 24, "charge_pct": 25},
  "refund": { "totalRefunded": 450.00, "cancellationFeeApplied": 150.00 }
}
```

The `cancellation_info` is already included in service/package detail objects under `cancellation_info.margin` for frontend rendering.

---

## 5. Booking Extension

### Problem
Guests needed the ability to extend their stay after checking in, subject to availability and pricing constraints.

### Solution
Created a new endpoint `POST /api/guest/booking/extend` with dedicated preprocess handler.

**New files:**
- `Src/HelperFunctions/PreProcessingFunctions/Guest/extendBooking.js` — extension logic
- `Src/Apis/ProjectSpecificApis/GuestSpecificApis/GuestBookingExtend/GuestBookingExtend.js` — API object
- `Src/Apis/ProjectSpecificApis/GuestSpecificApis/GuestBookingExtend/CRUD_parameters.js` — parameters

**Request:** `POST /api/guest/booking/extend`
```json
{
  "bookingId": 123,
  "newCheckOut": "2026-08-05"
}
```

**Validation flow:**
1. Booking must be an individual room booking (not a package booking — package bookings are rejected with 422)
2. Booking must be in `checked_in` status
3. `extension_allowed` config must be `true` on the stay service
4. Extension nights must not exceed `max_extension_length`
5. Room must be available for the extension window (no conflicting `booking_items`)
6. Price is calculated using base nightly rate adjusted by `extension_pricing_rule` (percentage)

**Relevant config keys:**
| Key | Description |
|---|---|
| `extension_allowed` | Boolean gate |
| `max_extension_length` | Max additional nights |
| `extension_pricing_rule` | % adjustment on base rate (e.g., 20 = 20% markup) |

**Response:**
```json
{
  "booking": { "..." },
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

---

## 6. Catalog Pricing Recurrence

### Problem
The `catalog_pricing` table used a `conditions` JSON column storing recurrence info as `{"from":"...","recurrence":"once|every-week","to":"..."}`. This was unstructured and not properly scoped.

### Solution
1. **Migration:** Extracted `recurrence` into a dedicated ENUM column (`once`, `weekly`, `monthly`, `yearly`), migrated `from`/`to` into `valid_from`/`valid_to` columns, dropped the `conditions` column.

2. **View update:** `v_active_catalog_pricing` updated to include `recurrence`, `valid_from`, `valid_to` columns.

3. **Application logic:** `getCatalogPrices()` in `catalogPricing.js` now uses `matchesRecurrence()` to filter pricing rows by recurrence pattern against the booking date.

**Migration file:** `data/migrations_completed/20260729_1_catalog_pricing_recurrence.sql`

**Files modified:**
- `Src/HelperFunctions/Guest/v2/catalogPricing.js` — `matchesRecurrence()` helper, `getCatalogPrices()` updated
- `Src/Apis/ProjectSpecificApis/CatalogPricingCrud/CatalogPricingCrud.js` — SQL references updated
- `Src/Apis/ProjectSpecificApis/CatalogPricingCrud/CRUD_parameters.js` — `conditions` replaced with `recurrence` select field
- `Src/Apis/ProjectSpecificApis/CustomServices/Crud_Objects/Services.js` — all `conditions` references replaced with `recurrence`
- `Src/Apis/ProjectSpecificApis/CustomPackages/Crud_Objects/Packages.js` — all `conditions` references replaced with `recurrence`

**Recurrence behavior:**
| Value | Meaning |
|---|---|
| `null` / `once` | Applies every day within `valid_from`..`valid_to` |
| `weekly` | Applies only on the same day-of-week as `valid_from` |
| `monthly` | Applies only on the same day-of-month as `valid_from` |
| `yearly` | Applies only on the same month+day as `valid_from` |

**Pricing rules** (`pricing_rules` table) already used `condition` JSON with `from`/`to` for date scoping via `fetchRulesForTenant()`. This remains unchanged.

---

## 7. Guest Age Constraints in Service Detail

### Problem
Services needed `min_guest_age` and `max_guest_age` constraints exposed to the frontend so it can display age restrictions and validate guest eligibility.

### Solution
Created two new `hms_config_keys` — `min_guest_age` and `max_guest_age` — and added them to the service detail object (`buildServiceObjects`).

**New config keys (hms_config_keys):**

| config_key | config_name | value_type | target_table |
|---|---|---|---|
| `min_guest_age` | Minimum Guest Age | number | services |
| `max_guest_age` | Maximum Guest Age | number | services |

**Files modified:**
- `Src/HelperFunctions/Guest/v2/serviceObjects.js` — fetches `min_guest_age`, `max_guest_age` via `fetchGuestConfigs`, includes in response

**New response fields:**
```json
{
  "minGuestAge": 18,
  "maxGuestAge": 65
}
```

| Field | Config Key | Description |
|---|---|---|
| `minGuestAge` | `min_guest_age` | Minimum age for a guest to book this service |
| `maxGuestAge` | `max_guest_age` | Maximum age for a guest to book this service |

These are standalone config keys — not derived from other age-related configs. Admins set them per service in the hms_config system.

---

## Summary of All Modified Files

| File | Changes |
|---|---|
| `serviceConfigs.js` | `validatePublishDateWindow()`, `computeCancellationCharge()` |
| `catalogPricing.js` | `matchesRecurrence()`, recurrence-aware `getCatalogPrices()` |
| `createRoomBooking.js` | Publish date validation |
| `createPackageBooking.js` | Publish date validation |
| `createServiceBooking.js` | Publish date validation |
| `editBooking.js` | Publish date validation |
| `landingObjects.js` | `allowedRegions` in minimal/detailed/landing service objects |
| `serviceObjects.js` | `minGuestAge`, `maxGuestAge`, `childAgeBrackets` |
| `GuestBookingCancel.js` | Refactored to shared cancellation charge function |
| `extendBooking.js` | **New** — booking extension logic |
| `GuestBookingExtend/` | **New** — extension API endpoint |
| `CatalogPricingCrud/` | `conditions` → `recurrence` |
| `CustomServices/Services.js` | `conditions` → `recurrence` |
| `CustomPackages/Packages.js` | `conditions` → `recurrence` |

**Migration:** `20260729_1_catalog_pricing_recurrence.sql`
