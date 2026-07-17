# Booking Management — Implementation Reference

This document is the single source of truth for how bookings are managed after creation. It covers addon services, date handling, party size, down payments, and the full lifecycle from creation through checkout.

---

## Table of Contents

1. [Booking Lifecycle](#booking-lifecycle)
2. [Editing a Booking](#editing-a-booking)
3. [Adding Addon Services to Any Booking](#adding-addon-services-to-any-booking)
4. [Down Payment on Addon Services](#down-payment-on-addon-services)
5. [Do Addon Services Extend Booking Dates?](#do-addon-services-extend-booking-dates)
6. [Rescheduling Service Slots](#rescheduling-service-slots)
7. [Removing Addon Services](#removing-addon-services)
8. [Cancellation and Refunds](#cancellation-and-refunds)
9. [Confirmation Email Timing](#confirmation-email-timing)
10. [Scheduler Form Schema — Duration Field](#scheduler-form-schema--duration-field)
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
| `/guest/booking/edit` | PUT | Edit booking (dates, party size, add/remove services) |
| `/guest/booking/services` | POST | Add addon services |
| `/guest/booking/reschedule` | PUT | Reschedule addon slots |
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

## Editing a Booking

Guests can edit an existing booking's dates, party size, special requests, and services in a single call:

```
PUT /api/guest/booking/edit
```

### Editable Fields

| Field | Description | Effect |
|---|---|---|
| `checkIn` / `checkOut` | New stay dates | Re-validates availability, re-picks delivery units, recalculates pricing |
| `adults` / `children` | Party size | Re-validates against `max_persons_per_booking`, auto-infers room count if party exceeds per-room capacity |
| `specialRequests` | Guest notes | Direct update, no side effects |
| `addServices` | Array of service addons | Same as `POST /guest/booking/services` — validates, inserts, prices |
| `removeServices` | Array of `bookingServiceId`s | Soft-deletes the service + its slots (stay services cannot be removed) |

### Which Bookings Can Be Edited?

| Status | Editable? |
|---|---|
| `pending` | Yes |
| `confirmed` | Yes |
| `checked_in` | Yes |
| `checked_out` | No |
| `cancelled` | No |
| `completed` | No |
| `no_show` | No |

Only the guest who created the booking (`urdd_id` match) can edit it.

### Request Example

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
    { "serviceId": 190, "quantity": 2, "meals": [{ "date": "2026-07-21", "mealType": "dinner" }] }
  ],
  "removeServices": [1234]
}
```

All fields except `bookingId` are optional — send only what changed.

### Response Shape

```json
{
  "booking": { /* full v2 booking bundle */ },
  "editSummary": {
    "previousTotal": 2400,
    "newTotal": 3200,
    "paidAmount": 480,
    "requiredDownPayment": 640,
    "additionalPaymentNeeded": 160,
    "currency": "SAR",
    "changes": {
      "dates": { "checkIn": "2026-07-20", "checkOut": "2026-07-28" },
      "partySize": { "adults": 4, "children": 7, "total": 11 },
      "servicesAdded": 1,
      "servicesRemoved": 1
    }
  }
}
```

### Down Payment on Edit

When the total increases due to date extension or added services:

```
requiredDownPayment = newTotal × 20%
additionalPaymentNeeded = max(0, requiredDownPayment − paidAmount)
```

| Scenario | Example |
|---|---|
| Total increased, not enough paid | Previous: 2400, new: 3200. Required: 640. Already paid: 480. Additional needed: **160 SAR** |
| Total increased, already overpaid | Previous: 2400, new: 2600. Required: 520. Already paid: 600. Additional needed: **0 SAR** |
| Total decreased | Previous: 3200, new: 2400. Required: 480. Already paid: 640. Additional needed: **0 SAR** (overpayment stays as credit) |

### What Happens When Dates Change

1. Existing `booking_items` (unit assignments) are cancelled.
2. Availability is re-checked for the new date range.
3. New units are picked and assigned.
4. The stay `booking_services` row is repriced: `nightlyPrice × newNights × roomCount`.
5. If the party exceeds per-room capacity, multiple rooms are auto-inferred.

### What Happens When Party Size Changes (Without Date Change)

1. `max_persons_per_booking` is validated against existing room count.
2. If the party fits in the currently assigned rooms, `booking_items.guests` is updated.
3. If the party exceeds capacity, the guest must also change dates (which triggers unit re-pick with the correct room count).

### Validation Rules

| Rule | Source | Error |
|---|---|---|
| Check-out after check-in | Basic validation | 400 |
| Check-in not in the past | Basic validation | 400 |
| Min/max stay nights | `min_stay_nights` / `max_stay_nights` config | 400 |
| Advance booking window | `advance_booking_min_days` / `advance_booking_max_days` config | 400 |
| Blackout dates | `blackout_dates` config | 400 |
| Room availability | `pickAvailableUnitForService` / `pickMultipleAvailableUnits` | 409 |
| Per-room person limit | `max_persons_per_booking` config | 400 |
| Stay service cannot be removed | Hardcoded | 422 |
| Addon must be same hotel | `tenant_id` match | 422 |

### Error Codes

| Code | Meaning |
|---|---|
| 400 | Validation failed (dates, party size, booking rules) |
| 403 | Not the booking owner |
| 404 | Booking not found |
| 409 | No rooms available for the selected dates |
| 422 | Non-editable status or blocked operation |

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

## Scheduler Form Schema — Duration Field

The `slot_duration_minutes` config key is a **service-level infrastructure setting**, not a guest booking input. It controls how the backend generates time slots from availability windows (e.g., a 45-minute massage generates 45-min increments from 09:00–17:00).

### What Changed

Previously, `slot_duration_minutes` appeared in the form schema as a dropdown with options like 15, 30, 45, 60 minutes. This was incorrect — the duration is fixed per service by the admin and should not be shown to the guest as a selectable field.

**Fix:** `slot_duration_minutes` is now excluded from the `fetchFormSchema` response. The duration is still available on the service object as `sessionDurationMinutes` for display purposes (e.g., "This is a 45-minute session").

### How Duration Works

| Component | Where Duration Comes From |
|---|---|
| **Slot generation** (backend) | `unit_availability.slot_duration_min` → `computeSlots.js` generates fixed-size slots |
| **Service display** (frontend) | `service.sessionDurationMinutes` from `hms_config` `slot_duration_minutes` config |
| **Guest booking form** | Duration is NOT a form field — guest picks a pre-computed slot like "15:00–15:45" |

### Frontend Guidance

- **Do NOT** render a duration picker in the booking form.
- **Do** display the session duration as informational text (e.g., "45-minute session").
- The scheduler API returns pre-computed slots with exact start/end times — the guest picks one.

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

### Editing a Booking (Dates, Party Size, Services)

```
1. Guest taps "Edit Booking" on booking detail screen
   Only show for bookings where:
   - booking_status IN ('confirmed', 'pending', 'checked_in')

2. Guest modifies dates, party size, adds/removes services
   PUT /guest/booking/edit  {
     bookingId: 9060,
     checkIn: "2026-07-20",
     checkOut: "2026-07-28",
     adults: 4,
     children: 7,
     addServices: [{ serviceId: 190, quantity: 2 }],
     removeServices: [1234]
   }

3. Response includes editSummary with payment delta
   editSummary.additionalPaymentNeeded > 0 → show payment prompt
   "An additional 160.00 SAR is required"

4. If payment needed → same payment flow (initiate → form → confirm)

5. Booking detail refreshes with updated data
```

### Adding Services Only (Standalone)

```
1. Guest browses services on booking detail screen
   POST /guest/booking/services  { booking_id, addons: [...] }

2. Response includes downPayment
   { downPayment: { required: true, amount: 45, currency: "SAR" } }

3. Show payment prompt → same payment flow

4. Booking detail refreshes
```

### Rescheduling

```
1. Guest taps a service slot on the booking detail screen
2. Show scheduler/calendar with available slots
3. PUT /guest/booking/reschedule  { booking_id, service_id, sessions/meals/transport }
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

| Status | Show "Edit"? | Show "Add Service"? | Show "Reschedule"? | Show "Cancel"? | Show "Pay"? |
|---|---|---|---|---|---|
| `pending` | Yes | Yes | Yes | Yes | Yes |
| `confirmed` | Yes | Yes | Yes | Yes | Yes (if balance due) |
| `checked_in` | Yes | Yes | Yes | No | Yes (if balance due) |
| `checked_out` | No | No | No | No | No |
| `cancelled` | No | No | No | No | No |
| `no_show` | No | No | No | No | No |

---

## Summary Table — What Can Be Modified After Booking Creation

| Attribute | Modifiable? | How |
|---|---|---|
| Booking dates (check_in/check_out) | **Yes** | `PUT /guest/booking/edit` with `checkIn`/`checkOut` |
| Party size (adults/children) | **Yes** | `PUT /guest/booking/edit` with `adults`/`children` |
| Special requests | **Yes** | `PUT /guest/booking/edit` with `specialRequests` |
| Addon services (add) | **Yes** | `PUT /guest/booking/edit` with `addServices`, or `POST /guest/booking/services` |
| Addon services (remove) | **Yes** | `PUT /guest/booking/edit` with `removeServices` |
| Addon service schedule | **Yes** | `PUT /guest/booking/reschedule` |
| Room assignment (delivery_unit) | **Auto** | Automatically reassigned when dates change |
| Booking status | **Yes** | Check-in, checkout, cancel endpoints |
| Payment | **Yes** | `POST /payments/initiate` + `POST /payments/confirm` |

---

## Change Log

| Date | Change |
|---|---|
| 2026-07-17 | Added `PUT /guest/booking/edit` — full booking edit flow (dates, party size, add/remove services, down payment delta). Removed "cancel and rebook" guidance for date/party changes. Added scheduler form schema duration field documentation. Updated summary table, frontend guide, and UI states. |
| 2026-07-13 | Initial version. Comprehensive booking management reference covering addon services, down payments, date handling, party size, rescheduling, removal, cancellation, and frontend guide. |
