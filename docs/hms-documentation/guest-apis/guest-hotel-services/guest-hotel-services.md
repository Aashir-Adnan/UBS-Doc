# Guest Hotel Services

**GET** `/api/guest/hotel-services`

Returns a hotel's bookable services: the add-ons a guest can attach to a stay. Each service comes with `availableUnitsCount`, the number of its delivery units free for the dates the guest is looking at. The frontend uses that count to limit the quantity and party size the guest can pick.

---

## Authentication

Uses **PUBLIC_ENCRYPTED_PLATFORM**. No JWT is required, but the request must use the standard platform encryption.

---

## Query parameters

| Parameter | Type | Required | Description |
|---|---|---|---|
| `hotelId` | number | **Yes** | Hotel (tenant) ID |
| `startDate` | `YYYY-MM-DD` | No | First day of the period for `availableUnitsCount` |
| `endDate` | `YYYY-MM-DD` | No | Last day of that period, inclusive |
| `checkIn` | `YYYY-MM-DD` | No | Date used for pricing rules ([check-in date pricing](../guest-pricing-rules/checkin-date-pricing.md)) |
| `packageId` | number | No | Returns `packageSpecificPrice` for that package |

How the period is chosen:

| Sent | Period counted |
|---|---|
| neither date | today, in the hotel's time zone |
| `startDate` only | that single day |
| `endDate` only | that single day |
| both | `startDate` to `endDate`, both days included |

Pass the booking's dates. For a stay, that's `startDate` = check-in and `endDate` = check-out.

```
GET /api/guest/hotel-services?hotelId=86
GET /api/guest/hotel-services?hotelId=86&startDate=2026-10-10&endDate=2026-10-14
```

---

## Which services are returned

Active services of the hotel, excluding:

- the `stay` category (rooms);
- the `amenities`, `networking` and `room-service` categories;
- services with the `is_amenity` config set to true.

They're ordered by category `sort_order`, then service name.

---

## Response

A flat array of service cards:

```json
[
  {
    "id": 375,
    "hotelId": 86,
    "name": { "en": "Desert Safari", "ar": "رحلة السفاري" },
    "base_price": 300,
    "current_price": 300,
    "currency": "SAR",
    "images": [248],
    "maxAdults": 4,
    "maxChildren": 2,
    "maxOccupancy": 4,
    "maxQuantityPerBooking": 5,
    "isPackageIncluded": false,
    "availableUnitsCount": 3
  }
]
```

Fields used for the booking limits:

| Field | Type | Meaning |
|---|---|---|
| `availableUnitsCount` | number | Delivery units free for the period. `0` means none |
| `maxQuantityPerBooking` | number | Most units one booking may take (default `1`) |
| `maxOccupancy` | number \| null | Guests one unit holds (the unit's capacity). `null` means no limit |
| `maxAdults` | number \| null | Adults one unit allows. `null` means no limit |
| `maxChildren` | number \| null | Children one unit allows. `null` means no limit |

The other fields are the standard landing-card shape described in [Guest Services](../guest-services/guest-services.md). `isPackageIncluded` is `true` when the service is part of at least one of the hotel's active packages.

---

## How `availableUnitsCount` is calculated

A delivery unit of the service counts when all of these hold for the period:

1. **The unit is in service.** It's active, its capacity isn't 0, and its `current_status` isn't `maintenance`. The other statuses (`occupied`, `cleaning`, `reserved`) are live states that don't decide future dates, so they don't remove it.
2. **The unit is open at least once in the period.** Its opening hours (unit availability) cover at least one day in the period, by specific date or by weekday. A unit with no opening hours set is always open.
3. **The unit isn't held for the period.** No active booking assignment overlaps the period. The last day of an earlier booking is a check-out day, so it doesn't overlap.

Short time-slot bookings (a dinner, a transfer) don't remove a unit from the count: the unit is still free at other times in the period. A slot's exact time is checked when the guest schedules it.

---

## Rules for the frontend

Use these fields to limit what the guest can select for each service. When an add-on is added to a booking, the backend rejects a quantity above `maxQuantityPerBooking` or above the units free at that moment ([Add services to a booking](../guest-bookings-service/add-services-to-booking.md)). The party-size rules below are applied by the frontend only.

**1. No free units.** If `availableUnitsCount` is `0`, disable the service for these dates.

**2. Quantity.** The guest can take at most

```
maxUnits = min(availableUnitsCount, maxQuantityPerBooking)
```

units. Stop the quantity stepper at `maxUnits`.

**3. Party size.** For the selected quantity `q` (1 ≤ q ≤ maxUnits):

```
adults + children ≤ q × maxOccupancy
adults            ≤ q × maxAdults
children          ≤ q × maxChildren
```

Skip any rule whose field is `null`. If the party doesn't fit, increase `q` up to `maxUnits`. If it still doesn't fit at `maxUnits`, the service can't take this party on these dates.

**4. When only one unit is possible.** If `maxUnits` is `1` (`maxQuantityPerBooking` is `1`, or only one unit is free), the guest can't spread the party over more units. Cap the adults stepper at `maxAdults`, the children stepper at `maxChildren`, and the total at `maxOccupancy`.

### Example

The Desert Safari card above has `availableUnitsCount` 3, `maxQuantityPerBooking` 5, `maxOccupancy` 4, `maxAdults` 4 and `maxChildren` 2.

| Party | Quantity needed | Allowed? |
|---|---|---|
| 2 adults, 1 child | 1 | yes |
| 6 adults | 2 (4 + 2) | yes |
| 10 adults, 2 children | 3 (12 ≤ 3 × 4) | yes |
| 12 adults, 2 children | 4, but only 3 free | no |

If the same service had `maxQuantityPerBooking` 1, the steppers would stop at 4 adults, 2 children and 4 guests in total.

---

## Errors

| HTTP | Message | When |
|---|---|---|
| 400 | `hotelId query parameter is required` | `hotelId` missing or not a positive number |
| 400 | `startDate must be YYYY-MM-DD` / `endDate must be YYYY-MM-DD` | malformed date |
| 400 | `endDate must be on or after startDate` | reversed period |
