# Guest Booking Edit API

Edit an existing booking's dates, party size, special requests, and services in a single call.

```
PUT /api/guest/booking/edit
Platform: AUTH_PLATFORM (encrypted, authenticated)
```

---

## Overview

The booking edit endpoint replaces the previous "cancel and rebook" workflow for date and party size changes. It allows guests to modify upcoming bookings without losing their booking number, payment history, or loyalty points.

All changes are atomic — if any validation fails (e.g., no rooms available for new dates), the entire edit is rolled back.

---

## Request Body

| Field | Type | Required | Description |
|---|---|---|---|
| `bookingId` | number | **Yes** | The booking to edit |
| `actionPerformerURDD` | number | **Yes** | Guest's URDD (set by middleware) |
| `checkIn` | string (YYYY-MM-DD) | No | New check-in date |
| `checkOut` | string (YYYY-MM-DD) | No | New check-out date |
| `adults` | number | No | New adult count |
| `children` | number | No | New children count |
| `specialRequests` | string | No | Updated special requests text |
| `addServices` | array | No | Services to add (same shape as addons in booking creation) |
| `removeServices` | array | No | Services to remove — see `removeServices` shape below |

All fields except `bookingId` are optional — send only what changed.

### `removeServices` Shape

Each entry can be a plain `bookingServiceId` (removes all), an object with `quantity` (removes newest N slots), or an object with `slot_id` (removes a specific scheduled slot):

```json
// Remove all quantity (deactivate entirely)
"removeServices": [1234]

// Remove 1 unit of quantity (deactivates the newest slot)
"removeServices": [{ "bookingServiceId": 1234, "quantity": 1 }]

// Remove a specific scheduled slot by its ID
"removeServices": [{ "bookingServiceId": 1234, "slot_id": 5012 }]

// Mix formats
"removeServices": [
  1234,
  { "bookingServiceId": 5678, "quantity": 2 },
  { "bookingServiceId": 9012, "slot_id": 5013 }
]
```

| Format | Behaviour |
|--------|-----------|
| Plain number | Removes all slots and deactivates the `booking_services` row entirely. |
| `{ bookingServiceId, quantity }` | Decrements by N, deactivating the **newest** slots (by `slot_id` DESC). If quantity reaches 0, the service is fully deactivated. |
| `{ bookingServiceId, slot_id }` | Removes **one specific** scheduled slot. The quantity and total are decremented by 1. If it was the last active slot, the service is fully deactivated. |

The `slot_id` value comes from the booking response: `services[].sessions[].id`, `services[].meals[].id`, or `services[].transport.id`.

### `addServices` Shape

Each entry in `addServices` follows the same format as the booking creation `addons` array:

```json
{
  "serviceId": 190,
  "quantity": 2,
  "sessions": [{ "date": "2026-07-21", "slot": "15:00-15:45" }],
  "meals": [{ "date": "2026-07-21", "mealType": "dinner" }],
  "transport": { "pickupDateTime": "2026-07-21 16:00:00", "pickupLocation": "Airport" }
}
```

Only include the scheduling field relevant to the service category (sessions for spa/barber/gym, meals for dining, transport for transfers).

---

## Request Example

```json
{
  "actionPerformerURDD": 278,
  "bookingId": 9060,
  "checkIn": "2026-07-20",
  "checkOut": "2026-07-28",
  "adults": 4,
  "children": 7,
  "specialRequests": "Late check-in requested",
  "addServices": [
    {
      "serviceId": 190,
      "quantity": 2,
      "meals": [
        { "date": "2026-07-21", "mealType": "dinner" },
        { "date": "2026-07-22", "mealType": "breakfast" }
      ]
    }
  ],
  "removeServices": [{ "bookingServiceId": 1234, "quantity": 1 }]
}
```

---

## Response Shape

```json
{
  "success": true,
  "data": {
    "booking": {
      "bookingId": 9060,
      "bookingNumber": "BK123456789",
      "bookingStatus": "confirmed",
      "checkIn": "2026-07-20",
      "checkOut": "2026-07-28",
      "nights": 8,
      "totalGuests": 11,
      "amount": 3200,
      "paidAmount": 480,
      "currency": "SAR",
      "services": ["...full v2 booking bundle services..."],
      "addons": ["..."],
      "pricing": {
        "grandTotal": 3200,
        "amountPaid": 480,
        "balanceDue": 2720
      }
    },
    "editSummary": {
      "previousTotal": 2400,
      "newTotal": 3200,
      "paidAmount": 480,
      "requiredDownPayment": 640,
      "additionalPaymentNeeded": 160,
      "overflowAmount": 0,
      "overflowRefundNote": null,
      "currency": "SAR",
      "changes": {
        "dates": {
          "checkIn": "2026-07-20",
          "checkOut": "2026-07-28"
        },
        "partySize": {
          "adults": 4,
          "children": 7,
          "total": 11
        },
        "servicesAdded": 1,
        "servicesRemoved": 1
      }
    }
  }
}
```

The `booking` field is the full v2 booking bundle (same shape as the booking detail API). The `editSummary` is additional metadata about what changed and how much additional payment is needed.

---

## Down Payment Calculation

When the booking total changes, the down payment delta tells the frontend how much additional payment is required:

```
requiredDownPayment = newTotal × 20%
additionalPaymentNeeded = max(0, requiredDownPayment − paidAmount)
```

### Scenarios

| Scenario | Previous Total | New Total | Required (20%) | Already Paid | Additional Needed |
|---|---|---|---|---|---|
| Extended stay | 2,400 | 3,200 | 640 | 480 | **160** |
| Added services | 2,400 | 2,850 | 570 | 480 | **90** |
| Shortened stay | 3,200 | 2,400 | 480 | 640 | **0** (credit) |
| Already overpaid | 2,400 | 2,600 | 520 | 600 | **0** |

When `additionalPaymentNeeded > 0`, the frontend should prompt the guest to pay before confirming the edit. Use the standard payment flow:

```
POST /api/guest/payments/initiate  { bookingId, amount: additionalPaymentNeeded, currency }
```

---

## Overflow Refund (Overpayment)

When the booking total **decreases** after an edit (e.g., shortened stay, removed services) and the guest has already paid more than the new total, the difference is tracked as an **overflow**.

```
overflowAmount = max(0, paidAmount − newTotal)
```

### Response Fields

| Field | Type | Description |
|---|---|---|
| `overflowAmount` | number | Amount overpaid (0 if no overflow) |
| `overflowRefundNote` | string\|null | Human-readable refund message, or `null` if no overflow |

### Overflow Response Example

When a guest shortens a 5-night booking (450 SAR, fully paid) to 3 nights (270 SAR):

```json
{
  "editSummary": {
    "previousTotal": 450,
    "newTotal": 270,
    "paidAmount": 450,
    "overflowAmount": 180,
    "overflowRefundNote": "You have overpaid. The excess amount will be refunded after checkout.",
    "additionalPaymentNeeded": 0,
    "currency": "SAR"
  }
}
```

### Refund Processing

Overflow refunds are **not** processed immediately. They are handled by the **Overflow Refund Cron** which runs every 30 minutes and processes refunds for checked-out bookings where `paid_amount > total_amount`. See [Overflow Refund Cron](../../major-implementations/payment-and-refund/overflow-refund-cron.md) for details.

### Scenarios

| Scenario | Previous Total | New Total | Paid Amount | Overflow | Refund Note |
|---|---|---|---|---|---|
| Shortened stay (fully paid) | 450 | 270 | 450 | **180** | "You have overpaid..." |
| Removed services (fully paid) | 600 | 400 | 600 | **200** | "You have overpaid..." |
| Shortened stay (partially paid) | 450 | 270 | 100 | **0** | `null` |
| Extended stay | 270 | 450 | 270 | **0** | `null` |

### Notification

A `booking_modified` push notification and email are sent on every successful edit, informing the guest that their booking details have been updated.

---

## What Happens Internally

### Date Change Flow

1. All existing `booking_items` (unit assignments) are cancelled (`item_status = 'cancelled'`, `status = 'inactive'`).
2. Stay duration configs are re-validated (min/max stay, advance booking window, blackout dates).
3. Room count is auto-inferred from party size vs `max_persons_per_booking` config.
4. New units are picked via `pickAvailableUnitForService` / `pickMultipleAvailableUnits`.
5. New `booking_items` rows are inserted with the updated dates.
6. The stay `booking_services` row is repriced: `nightlyPrice × nights × roomCount`.

### Party Size Change Flow (Without Date Change)

1. Per-room occupancy is validated against `max_persons_per_booking` and existing room count.
2. If the party fits, `booking_items.guests` is updated to the new per-room occupancy.
3. If the party exceeds capacity of current rooms, the guest must also change dates (which triggers unit re-pick with correct room count).

### Add Services Flow

Delegates to the existing `addBookingServices` handler — same validation, insertion, and pricing logic as the standalone addon endpoint.

### Remove Services Flow

1. Validates the `bookingServiceId` belongs to this booking.
2. Blocks removal of stay services (the room itself cannot be removed).
3. If `quantity` is specified and results in remaining quantity > 0:
   - Decrements `booking_services.quantity` and recalculates `total_price`.
   - Deactivates the newest N `booking_service_slots` rows (by `slot_id DESC`).
4. If no `quantity` specified or remaining quantity reaches 0:
   - Soft-deletes the `booking_services` row and all associated `booking_service_slots`.

### Price Recalculation

After all changes are applied:
- **Room/service bookings**: Sum all active `booking_services.total_price`, then apply `applyPricingRules` (tenant pricing rules).
- **Package bookings**: Package catalog price × instance count + true addon totals (extras beyond the package's declared services), then apply pricing rules.

---

## Validation Rules

| Rule | Config Source | HTTP Status |
|---|---|---|
| Check-out must be after check-in | Basic | 400 |
| Check-in cannot be in the past | Basic | 400 |
| Minimum stay nights | `min_stay_nights` | 400 |
| Maximum stay nights | `max_stay_nights` | 400 |
| Advance booking minimum days | `advance_booking_min_days` | 400 |
| Advance booking maximum days | `advance_booking_max_days` | 400 |
| Blackout dates | `blackout_dates` | 400 |
| Per-room person limit | `max_persons_per_booking` | 400 |
| Room availability | Unit conflict detection | 409 |
| Stay service cannot be removed | Hardcoded | 422 |
| Addon must belong to same hotel | `tenant_id` match | 422 |
| Addon within quantity limit | `max_quantity_per_booking` | 400 |
| Booking must be editable status | Not cancelled/checked_out/completed/no_show | 422 |
| Must be booking owner | `urdd_id` match | 403 |

---

## Error Responses

| Status | Code | Message |
|---|---|---|
| 400 | Validation | `bookingId is required` |
| 400 | Validation | `Check-out must be after check-in` |
| 400 | Validation | `Check-in date cannot be in the past` |
| 400 | Booking rule | `Minimum stay is N nights` |
| 400 | Booking rule | `Maximum N person(s) per room. X guests need Y rooms — change dates to reassign units.` |
| 403 | Auth | `You can only edit your own bookings` |
| 404 | Not found | `Booking not found` |
| 409 | Availability | `No rooms available for the selected dates` |
| 409 | Availability | `Not enough rooms available: need N, found M` |
| 422 | Status | `Cannot edit a booking with status 'cancelled'` |
| 422 | Blocked | `Cannot remove the stay service from a booking` |

---

## Frontend Integration Guide

### Edit Booking Flow

```
1. Guest taps "Edit Booking" on the booking detail screen
   Only show for booking_status IN ('confirmed', 'pending', 'checked_in')

2. Show edit form pre-filled with current values
   - Date picker (check-in / check-out)
   - Party size (adults / children steppers)
   - Services list with add/remove controls
   - Special requests text field

3. Guest makes changes and taps "Save"
   PUT /api/guest/booking/edit  { bookingId, ...changes }

4. Check editSummary.additionalPaymentNeeded
   If > 0 → show payment prompt:
   "An additional {amount} {currency} is required for your changes"
   → POST /api/guest/payments/initiate
   → Standard payment flow (Moyasar form / saved card)

   If = 0 AND overflowAmount > 0 → show overflow notice:
   Display overflowRefundNote to the guest

   If = 0 AND overflowAmount = 0 → show success confirmation

5. Refresh booking detail screen
```

### Handling Errors

| Error Type | Frontend Action |
|---|---|
| 400 (validation) | Show inline validation error next to the relevant field |
| 409 (no rooms) | Show "No rooms available for selected dates" with option to try different dates |
| 422 (status) | Hide the edit button (shouldn't happen if UI gates are correct) |
| 403 (not owner) | Show "You can only edit your own bookings" |

---

## Architecture Notes

### Key Files

| File | Purpose |
|---|---|
| `Src/Apis/.../GuestBookingEdit/GuestBookingEdit.js` | API object definition |
| `Src/Apis/.../GuestBookingEdit/CRUD_parameters.js` | Request parameter schema |
| `Src/HelperFunctions/PreProcessingFunctions/Guest/editBooking.js` | Core edit handler |
| `Src/HelperFunctions/PreProcessingFunctions/Guest/addBookingServices.js` | Service addon handler (reused) |
| `Src/HelperFunctions/Guest/v2/createBookingShared.js` | Unit picking, booking insertion helpers |
| `Src/HelperFunctions/Guest/v2/catalogPricing.js` | Price resolution and pricing rules |
| `Src/HelperFunctions/Guest/v2/bookingsBundle.js` | Response builder (v2 bundle) |

### Relationship to Other Endpoints

| Endpoint | Relationship |
|---|---|
| `POST /guest/bookings/room` | Creation only — edit handles post-creation changes |
| `POST /guest/booking/services` | Standalone addon — edit can do this too via `addServices` |
| `PUT /guest/booking/reschedule` | Slot-level reschedule — edit does not reschedule individual slots |
| `POST /guest/booking/cancel` | Full cancellation — separate from edit |
