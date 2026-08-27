# Flexible Package Pricing & Booking — Frontend Implementation Guide

**Date:** 2026-08-27
**Audience:** Guest-side frontend developers (mobile app + web app)
**Scope:** Three related changes to package discovery, pricing, and booking duration.

---

## 1. Publish Window — Now Fully Optional

### What changed

`publish_start_datetime` and `publish_end_datetime` on services and packages are now
both optional. A service or package with neither date set is always visible and bookable.
Previously `publish_start_datetime` was required, which caused some services to be
unexpectedly hidden.

### Frontend impact

- **No new fields, no action required.** Services and packages that were previously
  hidden because an admin hadn't filled in a publish start date will now appear in
  search and hotel-service listings.
- If your UI shows a "Available from / until" label for publish dates, continue
  rendering them only when non-null.

---

## 2. Package-Scoped Service Pricing

### What changed

`catalog_pricing` now has an optional `package_id` attribute. When an admin sets a
discounted price for service X specifically when booked within package Y, the API
returns that discounted price instead of the generic one — **as long as you pass
`packageId` in the request.**

This enables scenarios like:
> "Spa session is normally 400 SAR. When booked as part of the Wellness Package it's 300 SAR."

### Affected endpoints

#### `GET /api/guest/hotel-services`

Add `packageId` as an optional query parameter when rendering the hotel-services list
in a package context (e.g. the user is browsing a package's included/available services):

```
GET /api/guest/hotel-services?hotelId=16&packageId=42
```

When `packageId` is present, `basePrice` and `currentPrice` in each service card will
reflect the package-scoped price if one has been configured. When absent, the generic
price is returned — exactly as before.

**Response shape is unchanged.** The same `basePrice` / `currentPrice` fields are used:

```json
{
  "id": 101,
  "name": "Spa Session",
  "basePrice": 300,
  "currentPrice": 285,
  "currency": "SAR"
}
```

#### Booking flows (create, add-on services, edit, stage)

No frontend change needed for booking flows. The backend automatically uses the
package context from the booking's `package_id` field when pricing services within
that booking.

### When to pass `packageId`

| Screen | Pass `packageId`? |
|--------|-------------------|
| General hotel services catalog | No |
| Services shown while viewing / selecting a package | Yes |
| Add-on selector during package booking checkout | Not needed — handled server-side |

---

## 3. Additional Package Nights (Flexible Duration)

### What changed (upcoming — not yet released)

Currently packages have a fixed `duration` (e.g. 3 nights). A booking must be for
exactly N × duration nights. This will be replaced by a flexible mode:

When a package has `additionalNightsAllowed: true` in its constraints, the guest can
book for:

```
(N × duration) + extra nights
```

where `extra <= maxAdditionalNights`.

Extra nights are priced at a per-night rate derived from the package base price,
minus a configured discount.

### New fields in `GET /api/guest/booking/constraints`

When the feature is enabled for a service, the constraints response will include
additional fields (exact field names to be confirmed at implementation time):

```json
{
  "serviceId": 12,
  "serviceName": "Deluxe Suite",
  "minStayNights": 3,
  "maxStayNights": null,
  "packageDuration": 3,
  "additionalNightsAllowed": true,
  "maxAdditionalNights": 2,
  "additionalNightsDiscountValue": 10,
  "additionalNightsDiscountType": "percentage"
}
```

### New fields in search / package listing

Package search results will include:

```json
{
  "id": 42,
  "name": "Wellness Package",
  "pkg_duration": 3,
  "additionalNightsAllowed": true,
  "maxAdditionalNights": 2
}
```

Use these to determine which date ranges to allow in your date picker.

### Date picker logic

```
allowedCheckout(checkIn, pkg):
  minNights  = pkg.duration                           // minimum
  maxNights  = pkg.duration + (
    pkg.additionalNightsAllowed
      ? pkg.maxAdditionalNights
      : 0
  )

  // Also allow multiples of duration beyond the first block:
  // 3, 4, 5, 6, 9, 10, 11 ... etc. (multiples + up to maxAdditional)
```

Valid night counts when `duration = 3`, `maxAdditionalNights = 2`:
- ✓ 3 nights (1 block, 0 extra)
- ✓ 4 nights (1 block, 1 extra)
- ✓ 5 nights (1 block, 2 extra)
- ✗ 6 nights — this is 2 full blocks, so it is valid as a standard multiple
- ✓ 7 nights (2 blocks, 1 extra)
- ✓ 8 nights (2 blocks, 2 extra)
- ✗ 9 nights — 3 full blocks, valid as standard multiple

General rule: `nights % duration <= maxAdditionalNights`

When `additionalNightsAllowed` is false or absent: only exact multiples of `duration`
are allowed (`nights % duration === 0`).

### Pricing display

When the selected stay includes extra nights, display the breakdown:

```
3-night Wellness Package × 1   —   SAR 1,200
Extra nights × 2               —   SAR 360    (10% off per-night rate)
─────────────────────────────────────────────
Total                          —   SAR 1,560
```

The booking response `total_amount` already reflects the combined price. The
breakdown (if needed) can be derived client-side using the constraints data, or
the API will surface a breakdown in the folio response.

### Booking request — no format change

The booking body format is unchanged. Just pass `checkIn` and `checkOut` as you
do today. The backend validates that the night count is within the allowed range.

```json
{
  "packageId": 42,
  "checkIn": "2026-09-10",
  "checkOut": "2026-09-15",
  "adults": 2,
  "children": 0
}
```

---

## Summary of Frontend Work Required

| Feature | Work required |
|---------|--------------|
| Publish window optional | None — services just appear where they were hidden before |
| Package-scoped pricing | Pass `?packageId=N` to `GET /api/guest/hotel-services` when in a package context |
| Additional package nights | Update date picker logic; optionally display extra-night pricing breakdown |
