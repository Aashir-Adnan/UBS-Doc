# Additional Package Nights — Frontend Integration Guide

**Date:** 2026-08-27
**Audience:** Guest-side frontend developers (mobile app + web app)
**Scope:** Displaying extra-night availability and pricing for packages that allow stays beyond their fixed duration.

---

## Background

A package has a fixed duration (e.g. 3 nights). Previously, the guest could only book in exact multiples of that duration (3, 6, 9 nights). With this feature, hotels can configure a package to allow **extra nights beyond the fixed block**, at a discounted per-night rate.

> "This 3-night Umrah package lets you stay up to 2 extra nights at 10% off the per-night rate."

The backend handles all validation and pricing. The frontend needs to:
1. Read the new fields on the package detail object to know if extra nights are available.
2. Display the promotion to the user (e.g. "Get 10% off for every extra night").
3. Allow the user to select a stay length that isn't a clean multiple of the duration.
4. The booking/edit/stage APIs already accept non-divisible night counts when the config allows it.

---

## New Fields on the Package Detail Object

When you call `GET /api/guest/packages/:id`, the response now includes these additional config fields that the frontend should read. These fields are **only present when the admin has configured additional nights for the package**.

### Where to source them

The package detail object currently includes fields like `nights`, `maxQuantityPerBooking`, and `allowedCheckInDays`. The additional-nights config is available from the **same package config system** and will be included in the detailed response once the frontend passes the relevant keys. Until those fields are surfaced on the package object, the frontend can use the **probe/availability API** to discover whether extra nights are accepted.

### Config keys (admin-configured per package)

| Config Key | Type | Example | Description |
|---|---|---|---|
| `additional_package_nights_allowed` | `"true"` / `"false"` | `"true"` | Whether the package allows extra nights beyond its fixed duration block. |
| `max_additional_package_nights` | number (as string) | `"2"` | Maximum extra nights the guest can add (1-based). |
| `additional_package_nights_price_discount_value` | number (as string) | `"10"` | The discount amount applied to extra nights. |
| `additional_package_nights_price_discount_type` | `"percentage"` / `"flat"` | `"percentage"` | How the discount is applied — percentage off the per-night rate, or a flat SAR deduction per night. |

---

## How Extra-Night Pricing Works

The **per-night rate** for extra nights is derived from the package's catalog price divided by its fixed duration:

```
basePerNight = packagePrice / duration
```

The discount is then applied:

- **Percentage:** `discountedPerNight = basePerNight * (1 - discountValue / 100)`
- **Flat:** `discountedPerNight = basePerNight - discountValue`

### Example: 3-night package, price 900 SAR, 10% discount

```
basePerNight = 900 / 3 = 300 SAR
discountedPerNight = 300 * (1 - 10/100) = 270 SAR

Booking 5 nights (3-night block + 2 extra):
  packageBlockTotal = 900 SAR
  extraNightsTotal  = 270 * 2 = 540 SAR
  subtotal          = 1,440 SAR (before any tenant pricing rules)
```

### Example: 2-night package, price 500 SAR, 50 SAR flat discount

```
basePerNight = 500 / 2 = 250 SAR
discountedPerNight = 250 - 50 = 200 SAR

Booking 3 nights (2-night block + 1 extra):
  packageBlockTotal = 500 SAR
  extraNightsTotal  = 200 * 1 = 200 SAR
  subtotal          = 700 SAR
```

---

## Displaying Extra-Night Availability

### Package Detail Screen

When a package allows extra nights, show a badge or banner:

**If discount type is `percentage`:**
> "Stay up to `{max_additional_package_nights}` extra nights — `{discount_value}`% off per night"

**If discount type is `flat`:**
> "Stay up to `{max_additional_package_nights}` extra nights — save `{discount_value}` `{currency}` per night"

**If no discount is configured (value is 0 or missing):**
> "Stay up to `{max_additional_package_nights}` extra nights at the regular per-night rate"

### Date Picker / Night Selector

When the user is selecting check-in and check-out dates:

1. **Read `nights` (package duration)** from the package object.
2. **Read `max_additional_package_nights`** from the config.
3. Allow the user to pick checkout dates that produce `nights` to `nights + max_additional_package_nights` total nights for a single-period stay, or any multiple-period stay with up to `max_additional_package_nights` extra nights on the last period.

**Valid stay lengths for a 3-night package with max 2 extra:**
- 3, 4, 5 nights (1 period + 0/1/2 extra)
- 6, 7, 8 nights (2 periods + 0/1/2 extra)
- 9, 10, 11 nights (3 periods + 0/1/2 extra)
- ... and so on, subject to `maxQuantityPerBooking`

**Invalid:**
- 2 nights (less than 1 period)
- 12 nights with `maxQuantityPerBooking = 3` and extra=0 → 4 periods > 3 max

### Price Breakdown

Show the breakdown before the user confirms:

```
Package (3 nights x 1)         900 SAR
Extra nights (2 x 270 SAR)     540 SAR
─────────────────────────────────────
Subtotal                     1,440 SAR
Tax (15%)                      216 SAR
─────────────────────────────────────
Total                        1,656 SAR
```

The exact subtotal and grand total come from the `pricing` block in the booking response — the frontend does not need to calculate these. The breakdown above is for display purposes; always use the server's `pricing.grandTotal` as the source of truth.

---

## Booking API Behaviour

### `POST /api/guest/bookings/package`

No new request fields. Send the same payload you always do — `checkIn`, `checkOut`, `packageId`, etc. If the selected dates produce extra nights that are within the allowed range, the booking is created. If not, you get a `400` with a descriptive message.

**Success response** — the `pricing` block in the response includes extra-night costs baked into `subtotal` and `grandTotal`. No separate `extraNights` field is returned in the booking object; the pricing is already computed.

**Error responses:**

| Scenario | Status | Message pattern |
|---|---|---|
| Extra nights not enabled for this package | 400 | `"Stay of X nights is not a multiple of package duration (Y nights)"` |
| Extra nights exceed max allowed | 400 | `"Extra nights (X) exceed the maximum allowed (Y)"` |
| Too many periods (quantity exceeded) | 400 | `"Booking of X period(s) exceeds the maximum allowed (Y)"` |

### `PUT /api/guest/booking/edit`

Same rules apply. If you edit check-in/check-out to produce extra nights, the same validation runs. If the package allows it, the edit succeeds and the total is recalculated.

### `POST /api/guest/booking/stage`

Staging validates dates against the same extra-nights rules before reserving units. Violations are returned in the `violations` array (not thrown as errors).

---

## Search and Availability

### `GET /api/guest/search/filter?include=packages`

When dates are provided (`checkIn`, `checkOut`), packages are filtered by whether the stay length is valid. Packages with additional nights enabled will appear in results even when the stay isn't a clean multiple of the duration — as long as the extra nights are within the max.

> **Before this feature:** searching for 5 nights would exclude all 3-night packages.
> **After this feature:** a 3-night package with `max_additional_package_nights >= 2` appears in the 5-night search results.

### `POST /api/guest/availability/probe`

The probe API validates extra-night rules in its violations list. When additional nights are configured:
- A stay of `duration + 1` with `max_additional >= 1` returns no violations.
- A stay of `duration + 3` with `max_additional = 2` returns an `extra_nights` violation.

---

## Summary Checklist

- [ ] Read additional-nights config from the package detail response
- [ ] Display the extra-night promotion (badge / banner) on the package detail screen
- [ ] Allow non-divisible night counts in the date picker when the package permits it
- [ ] Show the price breakdown (package block + extra nights line) before booking confirmation
- [ ] Use `pricing.grandTotal` from the booking response as the source of truth for totals
- [ ] Handle `400` errors for extra-night violations with user-friendly messages
- [ ] No changes needed to the booking/edit/stage request payloads — same fields as before
