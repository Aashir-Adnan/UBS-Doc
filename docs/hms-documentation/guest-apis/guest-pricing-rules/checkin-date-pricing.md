# Check-in Date Pricing

Pricing rules (discounts, surcharges) are **seasonal** — they have date windows. The backend now evaluates all pricing rules against the **check-in date**, not today's date. This ensures the price the guest sees matches what they will actually be charged.

---

## What Changed

Previously, browsing APIs (services list, landing page, search) always evaluated pricing rules against the current date. This caused a mismatch: a guest browsing during a "Summer Discount" period would see discounted prices, but if their check-in fell outside the discount window, the booking/staging APIs would charge full price.

Now, all APIs accept an optional `checkIn` query parameter. When provided, pricing rules are evaluated against that date instead of today.

---

## Affected APIs

| API | Endpoint | Parameter |
|-----|----------|-----------|
| Hotel Services | `GET /api/guest/hotel-services` | `?checkIn=YYYY-MM-DD` |
| Services List | `GET /api/guest/services` | `?checkIn=YYYY-MM-DD` |
| Landing Page | `GET /api/guest/landing` | `?checkIn=YYYY-MM-DD` |
| Search / Filter | `POST /api/guest/search-filter` | `checkIn` in request body (already existed) |
| Availability Probe | `POST /api/guest/availability` | `checkIn` in request body (already existed) |
| Scheduler Tree | uses `fromDate` param (already existed) | — |

Transactional APIs (`/booking/stage`, `/bookings/room`, `/booking/edit`, `/booking/extend`, `/quote`) already have `checkIn` in the request body and now use it automatically — no frontend changes needed there.

---

## Frontend Implementation

### When the guest has selected dates

Pass the check-in date on every browsing API call so prices reflect the actual stay period:

```
GET /api/guest/hotel-services?hotelId=88&checkIn=2026-09-09
GET /api/guest/services?hotelId=88&checkIn=2026-09-09
GET /api/guest/landing?hotelId=88&checkIn=2026-09-09
```

The response fields `base_price` and `current_price` will reflect rules active on Sept 9, not today.

### When no dates are selected yet

Omit the `checkIn` parameter. The backend defaults to today's date — same behavior as before:

```
GET /api/guest/hotel-services?hotelId=88
```

### Example: Summer Discount (July 1 – Aug 31)

| Scenario | `checkIn` param | `base_price` | `current_price` |
|----------|----------------|--------------|-----------------|
| Browsing on Aug 25, no dates selected | omitted (defaults to today) | 260 | 234 (10% off) |
| Browsing on Aug 25, check-in Sept 9 | `2026-09-09` | 260 | 260 (no discount) |
| Browsing on Aug 25, check-in Aug 28 | `2026-08-28` | 260 | 234 (10% off) |

---

## Where to Add `checkIn` in the Frontend

Add the `checkIn` query parameter wherever the guest has already selected or confirmed their travel dates:

1. **Room/service browsing after date selection** — once the guest picks check-in/check-out on the date picker, append `checkIn` to all subsequent service listing and landing API calls.

2. **Add-service flows during an existing booking** — when the guest is adding services to an existing booking, pass the booking's `checkIn` date so addon prices match the booking context.

3. **Search results** — the search/filter API already sends `checkIn` in the request body. No change needed if dates are already being passed.

---

## Notes

- The `checkIn` parameter is always **optional**. Omitting it preserves the existing behavior (rules evaluated against today).
- The parameter only affects `current_price`. The `base_price` (catalog price before rules) is unaffected.
- Transactional APIs (stage, create, edit, extend, quote) use the check-in date from the request body automatically — no query param needed.
