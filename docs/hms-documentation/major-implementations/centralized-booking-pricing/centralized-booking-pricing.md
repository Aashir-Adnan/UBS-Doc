---
sidebar_position: 12
title: "Centralized Booking Pricing"
description: "Single source of truth for computing booking totals across creation, staging, editing, and addon flows."
---

# Centralized Booking Pricing

All booking totals — for creation, staging, editing, and addon insertion — are computed by a single function: `computeBookingPricing()` in `catalogPricing.js`.

## Why a Single Function

Before this consolidation, four separate code paths computed booking totals independently:

| Flow | Old Behavior |
|------|-------------|
| Package creation | `packageCatalogPrice × entries + extraAddonTotal`, then `applyPricingRules` |
| Room creation | `SUM(booking_services.total_price)`, then `applyPricingRules` |
| Staging | Re-fetched catalog price (could differ from creation time), used `COUNT(DISTINCT dates)` for instances |
| Edit | Inline `pkgBase × COUNT(booking_items) + addonTotal`, then `applyPricingRules` |

Each path had subtle differences in how it counted package instances, resolved addon quotas, and applied pricing rules. This caused pricing mismatches between what was charged at creation and what staging/edit predicted.

## Price Factors

Only two factors determine the total:

1. **Check-in date** — determines which pricing rules are active (rules have date windows)
2. **Quantity** — of package instances or room-nights, plus addon service quantities

Guest count, party size, and special requests do **not** affect the price.

## Formulas

### Package Bookings

```
packageQuantity = explicit param OR floor(nights / packageDuration)
subtotal = packageCatalogPrice × packageQuantity + Σ(addonCatalogPrice × addonQty)
grandTotal = applyPricingRules(subtotal, hotelId, checkInDate)
```

`packageQuantity` accounts for both time periods and rooms. For serial/parallel bookings with entries:

```
3 entries × 2 rooms each = 6 package instances → packageQuantity = 6
```

When `packageQuantity` is not provided, it is auto-derived as `floor(nights / duration)`, which assumes 1 room. Callers with multi-room bookings **must** pass `packageQuantity` explicitly.

### Room Bookings

```
subtotal = stayServiceCatalogPrice × nights × roomCount + Σ(addonCatalogPrice × addonQty)
grandTotal = applyPricingRules(subtotal, hotelId, checkInDate)
```

### Standalone Service Bookings

```
subtotal = Σ(addonCatalogPrice × addonQty)
grandTotal = applyPricingRules(subtotal, hotelId, checkInDate)
```

## Pricing Rules

Rules are fetched from `pricing_rules` for the tenant, filtered by the check-in date against each rule's `condition.from` / `condition.to` window.

Rules are applied in strict order:

| Phase | Description |
|-------|-------------|
| 1. `+percentage` | Markup percentages (each applied to running total) |
| 2. `+flat` | Flat surcharges |
| 3. `-percentage` | Discount percentages (each applied to running total before subtraction) |
| 4. `-flat` | Flat discounts |

The result is clamped to `>= 0` and rounded to 2 decimal places.

## Addon Services and Package Quotas

The caller is responsible for resolving which services are "extras" beyond the package quota. Only extras are passed in `addonServices`. Package-included services are covered by the package catalog price.

The quota resolution logic (used by all callers):

```javascript
// Load package_services quotas
const pkgQuota = new Map(); // service_id → included quantity

// Walk booking_services in creation order
for (const bs of allBsRows) {
  if (bs.category_slug === "stay") continue; // stay covered by package price
  const quota = pkgQuota.get(bs.service_id) || 0;
  const usedCount = used.get(bs.service_id) || 0;
  if (quota > 0 && usedCount < quota) {
    used.set(bs.service_id, usedCount + 1); // package-included
  } else {
    addonServices.push({ serviceId: bs.service_id, quantity: bs.quantity });
  }
}
```

**Example**: A package includes 2 dinners. Guest books 4 dinners total. First 2 are covered by the package price; the remaining 2 are extras passed as `addonServices`.

## Function Signature

```javascript
async function computeBookingPricing({
  hotelId,                    // tenant_id — for pricing rules
  checkIn,                    // date string or Date — for rule filtering + night calc
  checkOut,                   // date string or Date — for night calc
  packageId = null,           // package_id (null for room/service bookings)
  packageQuantity = null,     // total package instances (overrides auto-calc)
  stayServiceId = null,       // stay service_id (room bookings only)
  roomCount = 1,              // number of rooms (room bookings only)
  addonServices = [],         // [{ serviceId, quantity }] — extras beyond package quota
})
```

### Return Value

```javascript
{
  subtotal: 11800,            // pre-rules total
  grandTotal: 10620,          // post-rules total
  appliedRules: [             // breakdown of each rule's contribution
    {
      ruleId: 15,
      ruleName: "Summer Discount",
      delta: "-",
      type: "percentage",
      value: 10,
      contribution: -1180
    }
  ],
  packageQuantity: 6,         // resolved instance count (null for non-package)
  packageDuration: 3,         // from hms_config (null if not configured)
  nights: 9                   // nightsBetween(checkIn, checkOut)
}
```

## How Each Caller Provides `packageQuantity`

| Caller | How `packageQuantity` is derived |
|--------|--------------------------------|
| `createPackageBooking` | `entries.reduce((sum, e) => sum + e.quantity, 0)` or `1` for single bookings |
| `stageBookingChanges` | `COUNT(*)` from `booking_items` (active, non-cancelled). When dates change, scaled proportionally: `(newNights / duration) × roomsPerPeriod` |
| `editBooking` | `COUNT(*)` from `booking_items` (active, non-cancelled) |
| `addBookingServices` | `COUNT(*)` from `booking_items` (active, non-cancelled) |
| `createRoomBooking` | Not applicable — uses `stayServiceId` + `roomCount` instead |

## Edge Cases

| Scenario | Behavior |
|----------|----------|
| **Missing catalog price** (no `catalog_pricing` row) | Treated as 0 — no error thrown. The booking will have a 0 subtotal for that component. |
| **Missing package duration** (`hms_config` has no `duration` key) | `packageQuantity` defaults to 1 regardless of nights. |
| **`packageQuantity` = 0** (e.g. stay shorter than one package duration) | Package portion of subtotal is 0. Addons still priced normally. |
| **checkIn or checkOut is null** | `nights` defaults to 1. |
| **checkIn equals checkOut** (0-night stay) | `nights` is clamped to minimum 1. |
| **No pricing rules for tenant** | `grandTotal = subtotal` (no discount or markup applied). |
| **Empty `addonServices` array** | Only the primary price (package or room) contributes to subtotal. |
| **Addon `serviceId` has no catalog price** | That addon contributes 0 to subtotal. |
| **Serial booking with varying room counts per entry** | Caller must sum all entry quantities and pass total as `packageQuantity`. The function does not parse entries. |
| **Package duration validation** (nights not a multiple of duration) | **Not enforced here** — validation is the caller's responsibility (e.g. `stageBookingChanges` rejects non-multiples). This function only computes prices. |
| **Stale catalog prices** | Always uses **current** catalog prices. If a price changed since booking creation, the recomputed total will reflect the new price. This is intentional — no stored subtotal. |
| **Pricing rule date filtering** | Rules are filtered by `checkIn` date against each rule's `condition.from` / `condition.to`. A rule outside the window is excluded entirely. |
| **Multiple pricing rules** | All matching rules are applied sequentially. Percentage rules compound on the running total. |

## Data Flow Diagram

```
Caller (create / stage / edit / addServices)
  │
  ├── Resolves package quota → builds addonServices list
  ├── Determines packageQuantity (from entries or booking_items)
  │
  └── computeBookingPricing({
        hotelId, checkIn, checkOut,
        packageId, packageQuantity,
        stayServiceId, roomCount,
        addonServices
      })
        │
        ├── getCatalogPrice("packages", packageId)  ← catalog_pricing table
        ├── fetchGuestConfigs("packages", [...], ["duration"])  ← hms_config table
        ├── getCatalogPrices("services", addonServiceIds)  ← catalog_pricing table
        ├── fetchRulesForTenant(hotelId, checkIn)  ← pricing_rules table
        │
        ├── subtotal = primaryPrice × quantity + Σ(addonPrices)
        ├── grandTotal = applyRulesDetailedSync(subtotal, rules)
        │
        └── returns { subtotal, grandTotal, appliedRules, packageQuantity, ... }
              │
              └── Caller writes grandTotal to bookings.total_amount
```

## Worked Example

**Scenario**: Package 345 (Family Fun Package), 3-night duration, catalog price 1800 SAR.
Guest books 3 entries × 2 rooms = 6 instances, plus 4 extra dinners (250 SAR each).
Hotel 16 has a "Summer Discount" rule: -10% percentage.

```
packageQuantity = 6 (passed explicitly by createPackageBooking)
packageCatalogPrice = 1800

subtotal = 1800 × 6 + 250 × 4
         = 10800 + 1000
         = 11800

applyPricingRules(11800):
  Phase 3 (-percentage): 11800 × 10% = 1180
  grandTotal = 11800 - 1180 = 10620

Return: { subtotal: 11800, grandTotal: 10620, packageQuantity: 6, ... }
```

## Source Files

| File | Purpose |
|------|---------|
| `Src/HelperFunctions/Guest/v2/catalogPricing.js` | `computeBookingPricing` function + all pricing helpers |
| `Src/HelperFunctions/PreProcessingFunctions/Guest/createPackageBooking.js` | Package booking creation (caller) |
| `Src/HelperFunctions/PreProcessingFunctions/Guest/createRoomBooking.js` | Room booking creation (caller) |
| `Src/HelperFunctions/PreProcessingFunctions/Guest/stageBookingChanges.js` | Staging preview (caller) |
| `Src/HelperFunctions/PreProcessingFunctions/Guest/editBooking.js` | Booking edit (caller) |
| `Src/HelperFunctions/PreProcessingFunctions/Guest/addBookingServices.js` | Addon insertion + total recomputation (caller) |

## Change Log

| Date | Change |
|------|--------|
| 2026-07-22 | Created `computeBookingPricing` as single source of truth. Refactored all 5 callers to use it. Added `packageQuantity` parameter for multi-room serial bookings. Added package duration validation in staging. |
