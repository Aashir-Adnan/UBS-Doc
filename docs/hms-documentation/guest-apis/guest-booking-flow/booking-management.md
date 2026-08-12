# Booking Management — Implementation Reference

This document is the single source of truth for how bookings are managed after creation. It covers addon services, date handling, party size, down payments, and the full lifecycle from creation through checkout.

---

## Table of Contents

1. [Booking Lifecycle](#booking-lifecycle)
2. [Adding Addon Services to Any Booking](#adding-addon-services-to-any-booking)
3. [Down Payment on Addon Services](#down-payment-on-addon-services)
4. [Do Addon Services Extend Booking Dates?](#do-addon-services-extend-booking-dates)
5. [Adjusting Upcoming Booking Dates](#adjusting-upcoming-booking-dates)
6. [Increasing Party Size](#increasing-party-size)
7. [Rescheduling Service Slots](#rescheduling-service-slots)
8. [Removing Addon Services](#removing-addon-services)
9. [Cancellation and Refunds](#cancellation-and-refunds)
10. [Confirmation Email Timing](#confirmation-email-timing)
11. [Frontend Implementation Guide](#frontend-implementation-guide)

---

## Booking Lifecycle

A booking moves through these statuses:

```
created (confirmed/pending)
   |
   |--- guest pays 20% down payment ---> confirmation email sent
   |
   |--- [optional] addons added ---> new down payment required
   |
   |--- [optional] addons rescheduled
   |
   |--- [optional] addons removed ---> total_amount reduced
   |
   v
checked_in
   |
   v
checked_out
```

Cancellation can happen at any point before checkout:

```
confirmed/pending ---> cancelled ---> refund processed
```

### Status Transitions

| From | To | Trigger |
|---|---|---|
| `confirmed` | `checked_in` | `POST /guest/booking/checkin` |
| `checked_in` | `checked_out` | `POST /guest/booking/checkout` |
| `confirmed` / `pending` | `cancelled` | `POST /guest/booking/cancel` |

### Available Management APIs

| Endpoint | Method | Purpose |
|---|---|---|
| `/guest/bookings/{id}/services` | POST | Add addon services |
| `/guest/bookings/{id}/services` | DELETE | Remove an addon service |
| `/guest/bookings/{id}/services/{serviceId}` | PUT | Reschedule addon slots |
| `/guest/booking/cancel` | POST | Cancel entire booking |
| `/guest/booking/checkin` | POST | Check in |
| `/guest/booking/checkout` | POST | Check out |
| `/guest/payments/initiate` | POST | Initiate a payment (including addon down payment) |
| `/guest/payments/confirm` | POST | Confirm a payment after 3DS |

---

## Adding Addon Services to Any Booking

Services can be added to **any booking type** — room, package, or standalone service — via:

```
POST /api/guest/bookings/{bookingId}/services
```

### Which Bookings Can Receive Addons?

The backend checks **only** `status = 'active'` (the soft-delete flag). There is currently **no check** on:
- `booking_status` (confirmed, pending, checked_in, etc.)
- Whether check_in/check_out dates are in the past or future

This means addons can technically be added to any non-deleted booking. The frontend should enforce the business rule that addons are only offered on **upcoming and current** bookings (i.e. `booking_status` in `confirmed`, `pending`, or `checked_in`).

:::caution Frontend Gate Required
The backend does not reject addon additions to past or cancelled bookings. The frontend must hide the "Add Service" option for bookings with `booking_status` in `checked_out`, `cancelled`, or `no_show`.
:::

### What Services Can Be Added?

| Eligible | Not Eligible |
|---|---|
| Spa, dining, room-service, barber, gym, transport, kids-center, laundry, any custom category | **Stay** services (the room itself) |
| Any active service belonging to the same hotel | Services from a different hotel |
| Services within `max_quantity_per_booking` config | Amenity services |

### What Happens on Add

1. Service is validated (same hotel, not a stay, within quantity limits).
2. `booking_services` row inserted with `service_status = 'pending'`.
3. `booking_service_slots` rows inserted (one per session/meal/transport entry).
4. `bookings.total_amount` is **recomputed** from the sum of all active `booking_services`.
5. A `downPayment` object is returned telling the frontend how much the guest must pay.

### Request Example

```json
{
  "actionPerformerURDD": 16,
  "booking_id": 9060,
  "addons": [
    {
      "serviceId": 55,
      "sessions": [{ "date": "2026-07-20", "slot": "15:00-16:00" }]
    },
    {
      "serviceId": 76,
      "meals": [{ "date": "2026-07-20", "mealType": "dinner" }]
    }
  ]
}
```

### Response Shape

The response is the full v2 booking bundle with an added `downPayment` field:

```json
{
  "bookingId": 9060,
  "amount": 525,
  "paidAmount": 60,
  "services": [ ... ],
  "pricing": {
    "grandTotal": 525,
    "amountPaid": 60,
    "balanceDue": 465
  },
  "downPayment": {
    "required": true,
    "amount": 45,
    "addedServicesTotal": 225,
    "currency": "SAR"
  }
}
```

---

## Down Payment on Addon Services

**Rule: Every service addition requires a 20% down payment on the added services' total.**

This applies uniformly to:

| Scenario | Down Payment Base | Example |
|---|---|---|
| **New standalone booking** (`POST /bookings/service`) | 20% of the full booking total | Booking total = 200 SAR, down payment = 40 SAR |
| **Addon to existing booking** (`POST /bookings/{id}/services`) | 20% of the newly added services total | Added spa (150 SAR) + dinner (75 SAR) = 225 SAR, down payment = 45 SAR |

### How It Works End-to-End

```
Step 1: Guest adds services
   POST /guest/bookings/9060/services  { addons: [...] }
   Response includes: downPayment: { required: true, amount: 45, currency: "SAR" }

Step 2: Frontend shows payment prompt
   "A down payment of 45.00 SAR (20%) is required"

Step 3: Guest initiates payment
   POST /guest/payments/initiate
   {
     bookingId: 9060,
     amount: 45,          // at least downPayment.amount
     currency: "SAR",
     methods: ["creditcard"],
     successUrl: "myapp://payment-success",
     failureUrl: "myapp://payment-failure"
   }
   Header: Idempotency-Key: <uuid-v4>

Step 4: Guest pays via Moyasar form or saved card

Step 5: Payment confirmed (webhook or confirm endpoint)
   - bookings.paid_amount incremented
   - If this is the FIRST payment on the booking: confirmation email sent
```

### Backend Enforcement

The payment initiation endpoint (`guestMoyasarPayments.js`) enforces a **minimum 20%** for the **first** payment on any booking:

```
First payment must be at least 20% of the total ({minDownpayment} {currency})
```

For subsequent payments (after addons are added to an already-paid booking), the frontend should use the `downPayment.amount` from the addon response as the minimum, but the backend only hard-blocks amounts exceeding `balanceDue`.

### What If the Guest Doesn't Pay?

The services are still added to the booking. `total_amount` is updated. The booking's `paymentStatus` remains `pending` or partially paid. The frontend should:
1. Show a persistent "Payment Required" banner on the booking detail screen.
2. Block check-in if the hotel requires a minimum payment before check-in (configurable per hotel).

---

## Do Addon Services Extend Booking Dates?

**No. Addon services never modify `bookings.check_in_date` or `bookings.check_out_date`.**

When a guest adds a service to an existing booking:
- The service gets its own scheduling via `booking_service_slots` (independent of the booking's date range).
- There is **no validation** that the addon's scheduled date falls within the booking's check_in/check_out window.
- The booking's dates remain exactly as they were set at creation time.

### Example

| Booking | Check-in | Check-out |
|---|---|---|
| Room booking #9060 | 2026-07-18 | 2026-07-22 |

If the guest adds a spa session for **2026-07-25** (3 days after checkout), the backend accepts it without error. The slot is stored in `booking_service_slots` with `scheduled_start = 2026-07-25`.

### Why?

Booking dates represent the **stay period** (for room/package bookings) or the **primary service date** (for standalone service bookings). Addon services are independent appointments that happen to be grouped under the same booking for billing purposes. A guest might book a hotel stay for Jul 18-22 but schedule an airport transfer for Jul 17 (day before arrival) or a late spa visit on Jul 23.

### Frontend Consideration

The frontend may choose to display a soft warning if an addon is scheduled outside the booking's date range ("This service is scheduled outside your stay dates — are you sure?"), but the backend does not enforce this.

---

## Adjusting Upcoming Booking Dates

**There is currently no API to modify a booking's check-in or check-out dates after creation.**

`bookings.check_in_date` and `bookings.check_out_date` are set at creation and are **immutable** throughout the booking lifecycle. The only date-related writes that happen post-creation are:

| Field | When Written | By What |
|---|---|---|
| `check_in_date` / `check_out_date` | Booking creation only | `createRoomBooking`, `createPackageBooking`, `createServiceBooking` |
| `actual_check_in` | Guest checks in | `POST /guest/booking/checkin` |
| `actual_check_out` | Guest checks out | `POST /guest/booking/checkout` |
| `cancelled_at` | Booking cancelled | `POST /guest/booking/cancel` |

### If a Guest Needs to Change Dates

The current workflow is:
1. Cancel the existing booking (refund processed minus cancellation fee).
2. Create a new booking with the desired dates.

### Future Consideration

A `PUT /guest/bookings/{id}` endpoint could be added to allow date modification. This would need to:
- Re-check room availability for the new date range.
- Reassign delivery units if the current unit is unavailable.
- Recompute pricing (different number of nights = different total).
- Handle partial payment adjustments (refund overpayment or require additional payment).

---

## Increasing Party Size

**There is currently no API to update `total_guests` on an existing booking.**

Party size (`adults + children`) is set at booking creation and stored in `bookings.total_guests`. No endpoint modifies this field post-creation.

### If a Guest Needs to Change Party Size

The current workflow is:
1. Cancel and rebook with the correct party size.

### Why It Matters

Party size affects:
- **Room availability**: `max_persons_per_booking` config may restrict occupancy per room.
- **Unit assignment**: Larger parties may need a different room type.
- **Pricing**: Some services price per person.

A future party-size update API would need to validate against `max_persons_per_booking` and potentially reassign the delivery unit.

---

## Rescheduling Service Slots

Addon service slots (sessions, meals, transport times) **can** be rescheduled after creation:

```
PUT /api/guest/bookings/{bookingId}/services/{serviceId}
```

### What Gets Rescheduled

Only `booking_service_slots` rows — the individual time slots for the addon. **Not** the booking's check_in/check_out dates, and **not** the stay service's unit assignment.

### Request Examples

**Reschedule a spa session:**
```json
{
  "actionPerformerURDD": 16,
  "booking_id": 9060,
  "service_id": 55,
  "sessions": [
    { "date": "2026-07-21", "slot": "11:00-12:00" }
  ]
}
```

**Reschedule a dining reservation:**
```json
{
  "sessions": [],
  "meals": [
    { "date": "2026-07-20", "mealType": "lunch" }
  ]
}
```

**Reschedule a transport pickup:**
```json
{
  "transport": {
    "pickupDateTime": "2026-07-18 16:00:00",
    "pickupLocation": "Airport Terminal 2",
    "dropoffLocation": "Hotel Main Entrance"
  }
}
```

### Slot Auto-Assignment

If the client does not provide `slotId`, slots are auto-assigned sequentially from the available pool. This means the guest can reschedule without needing to know internal slot IDs.

### What Changes

| Changed | Not Changed |
|---|---|
| `booking_service_slots.scheduled_start` | `bookings.check_in_date` |
| `booking_service_slots.scheduled_end` | `bookings.check_out_date` |
| `booking_service_slots.slot_status` (→ `scheduled`) | `bookings.total_amount` |
| Form values (meal_type, trip_type, etc.) in `hms_config` | `booking_services.total_price` |

---

## Removing Addon Services

```
DELETE /api/guest/bookings/{bookingId}/services
Body: { serviceId: 55 }
```

### Behavior

1. Soft-deletes (`status = 'inactive'`) all `booking_services` rows for that service on the booking.
2. Soft-deletes all associated `booking_service_slots`.
3. Subtracts the removed service's `total_price` from `bookings.total_amount`.

### Restrictions

| Allowed | Blocked |
|---|---|
| Remove any addon service added via `POST /bookings/{id}/services` | Remove a service that is part of the booking's **package** (409 error: "Package services cannot be removed individually") |

### Refund Impact

Removing a service reduces `total_amount` but does **not** trigger an automatic refund. If `paid_amount > total_amount` after removal, the overpayment remains on the booking as credit. A refund only happens via the cancellation flow.

---

## Cancellation and Refunds

```
POST /api/guest/booking/cancel
Body: { actionPerformerURDD, booking_id, cancellation_reason }
```

### Cancellation Fee

Computed from the primary service's `cancellation_margin` config — a JSON array of rules:

```json
[
  { "hours_before": 72, "charge_pct": 0 },
  { "hours_before": 24, "charge_pct": 25 },
  { "hours_before": 0,  "charge_pct": 50 }
]
```

The system picks the rule with the highest `hours_before` that is still less than or equal to the actual hours until check-in.

**Transport services** have an additional hard gate: `modification_cancellation_cutoff_hours`. If the guest tries to cancel within N hours of pickup, the cancellation is **blocked entirely** (409 error).

### Refund Processing

After cancellation:
1. Each completed `purchase` transaction on the booking is refunded via Moyasar API.
2. The cancellation fee is deducted **proportionally** across transactions.
3. New `refund` transaction rows are created.
4. `bookings.paid_amount` is decremented by the total refunded.
5. Guest receives cancellation and refund notifications.

### Response

```json
{
  "cancelled": true,
  "cancellationFee": 37.5,
  "refund": {
    "totalRefunded": 112.5,
    "cancellationFeeApplied": 37.5,
    "details": [
      {
        "originalTransactionId": 42,
        "refundAmount": 112.5,
        "feeDeducted": 37.5,
        "status": "completed"
      }
    ]
  }
}
```

---

## Confirmation Email Timing

The booking confirmation email is sent **after the first successful down payment**, not at booking creation.

| Event | Email Sent? |
|---|---|
| Booking created (no payment yet) | No |
| First down payment succeeds (via webhook or confirm endpoint) | **Yes** |
| Subsequent payments on the same booking | No |
| Addon services added (no payment yet) | No |
| Addon down payment succeeds | No (email was already sent on first payment) |

The email is triggered in two code paths (both check `paid_amount === 0` before the increment):
- **Moyasar webhook** (`moyasarWebhook.js`) — for async payment confirmations.
- **Confirm endpoint** (`guestMoyasarPayments.js` → `confirmGuestPayment`) — for client-side confirm calls after 3DS.

---

## Frontend Implementation Guide

### Booking Creation + Payment Flow

```
1. Guest creates booking
   POST /guest/bookings/room   (or /service or /package)
   Response: { bookingId, downPayment: { required, amount, currency } }

2. Show payment screen immediately
   Pre-fill amount with downPayment.amount
   Show: "Pay {amount} {currency} to confirm your booking"

3. Initiate payment
   POST /guest/payments/initiate  { bookingId, amount, currency }

4. Render Moyasar form (or charge saved card)

5. After 3DS → confirm payment
   POST /guest/payments/confirm  { transactionId, moyasarPaymentId }

6. Show confirmation screen
   Guest receives confirmation email automatically
```

### Adding Services to Existing Booking

```
1. Guest browses services on booking detail screen
   Only show "Add Service" for bookings where:
   - booking_status IN ('confirmed', 'pending', 'checked_in')
   - NOT cancelled, checked_out, or no_show

2. Guest selects services + scheduling
   POST /guest/bookings/{id}/services  { addons: [...] }

3. Response includes downPayment
   { downPayment: { required: true, amount: 45, currency: "SAR" } }

4. Show payment prompt
   "A down payment of 45.00 SAR is required for the added services"

5. Same payment flow as above (initiate → form → confirm)

6. Booking detail refreshes with updated services + pricing
```

### Rescheduling

```
1. Guest taps a service slot on the booking detail screen
2. Show scheduler/calendar with available slots
3. PUT /guest/bookings/{id}/services/{serviceId}  { sessions/meals/transport }
4. Booking detail refreshes with updated schedule
```

### Cancellation

```
1. Guest taps "Cancel Booking"
2. Show cancellation policy + estimated fee + estimated refund
   (Use the cancellation object from the booking detail response)
3. Guest confirms → POST /guest/booking/cancel
4. Show refund summary from response
```

### Key UI States by Booking Status

| Status | Show "Add Service"? | Show "Reschedule"? | Show "Cancel"? | Show "Pay"? |
|---|---|---|---|---|
| `pending` | Yes | Yes | Yes | Yes |
| `confirmed` | Yes | Yes | Yes | Yes (if balance due) |
| `checked_in` | Yes | Yes | No | Yes (if balance due) |
| `checked_out` | No | No | No | No |
| `cancelled` | No | No | No | No |
| `no_show` | No | No | No | No |

---

## Summary Table — What Can Be Modified After Booking Creation

| Attribute | Modifiable? | How |
|---|---|---|
| Addon services | Yes | `POST /bookings/{id}/services` |
| Addon service schedule | Yes | `PUT /bookings/{id}/services/{serviceId}` |
| Addon services (remove) | Yes | `DELETE /bookings/{id}/services` |
| Booking dates (check_in/check_out) | **No** | Cancel and rebook |
| Party size (total_guests) | **No** | Cancel and rebook |
| Room assignment (delivery_unit) | **No** | Cancel and rebook |
| Special requests | **No** | No API exists |
| Booking status | Yes | Check-in, checkout, cancel endpoints |
| Payment | Yes | `POST /payments/initiate` + `POST /payments/confirm` |

---

## Change Log

| Date | Change |
|---|---|
| 2026-07-13 | Initial version. Comprehensive booking management reference covering addon services, down payments, date handling, party size, rescheduling, removal, cancellation, and frontend guide. |
