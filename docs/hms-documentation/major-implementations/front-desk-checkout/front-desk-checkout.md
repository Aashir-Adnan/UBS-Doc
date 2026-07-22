---
title: "Front Desk Check-In & Check-Out Flow"
sidebar_position: 1
---

# Front Desk Check-In & Check-Out Flow

This document describes the complete front desk lifecycle: how staff check guests in, record cash/POS payments, and check guests out. It covers all relevant APIs, the booking status state machine, unit allocation, and payment handling.

---

## Booking Status State Machine

A booking moves through these statuses during the front desk lifecycle:

```
pending  -->  confirmed  -->  checked_in  -->  checked_out
                  |                                ^
                  +--- (cancelled / no_show) ------+
```

| Transition | Trigger | Who |
|---|---|---|
| `confirmed` to `checked_in` | Staff check-in or guest self-check-in | Staff via `CheckinGroupedCrud`, Guest via `GuestBookingCheckin` |
| `checked_in` to `checked_out` | Staff checkout or guest self-checkout | Staff via `CheckinGroupedCrud` (action=checkout) or `AdminBookingCheckout`, Guest via `GuestBookingCheckout` |

---

## 1. Staff Check-In

### Endpoint

```
POST /api/checkinGroupedCrud
```

**Platform:** AUTH_PLATFORM (encrypted, access token required)

### Payload

| Param | Type | Required | Description |
|---|---|---|---|
| `booking_id` | number | Yes | The booking to check in |
| `assignments` | array | No | Staff-picked unit overrides: `[{ item_id, unit_id }]` |
| `slot_id` | number | No | Start a timed service slot (spa/dining) at check-in |
| `cash_amount` | number | No | Record a cash payment atomically with check-in |

### Processing Flow (Single Transaction)

**Step 1 -- Lock and validate the booking**

- `SELECT ... FROM bookings WHERE booking_id = ? AND tenant_id = ? FOR UPDATE`
- Rejects if `booking_status` is `cancelled` or `checked_out`

**Step 2 -- Allocate units** (`allocateUnitsForBooking`)

Units are pinned at booking time in `booking_items.unit_id`. Check-in flips their status:

- For each active `booking_items` row (not cancelled/checked_out):
  - If `unit_id` is set (pre-assigned at booking): lock the unit `FOR UPDATE`, verify it is not in maintenance/cleaning
  - If `unit_id` is NULL: use the staff-picked `assignments` array to assign a unit
  - Flip `booking_items.item_status` from `reserved` to `occupied`, stamp `actual_start = NOW()`
  - Flip `delivery_units.current_status` from `available`/`reserved` to `occupied`

- If ANY item cannot be allocated (unit in maintenance, not found, already occupied), the entire transaction rolls back and returns the list of unallocated items so the desk can reassign

**Step 3 -- Start service slot** (optional)

If `slot_id` is provided, stamps `booking_service_slots.actual_start = NOW()` for timed services (spa appointments, dining reservations).

**Step 4 -- Transition booking status**

```sql
UPDATE bookings
SET booking_status = 'checked_in', actual_check_in = NOW()
WHERE booking_id = ?
```

If the booking is already `checked_in` (idempotent re-check-in for unit/slot updates), the status update is skipped but unit/slot changes still apply.

**Step 5 -- Record cash payment** (optional)

If `cash_amount > 0`, calls `recordCashPayment` within the same transaction (see Payment Recording below).

### Response

```json
{
  "booking_id": 42,
  "booking_status": "checked_in",
  "assigned": [
    { "item_id": 10, "unit_id": 5, "identifier": "101", "label": "Deluxe Room" }
  ],
  "slot": null,
  "payment": {
    "paymentId": 8,
    "paidAmount": 250,
    "totalAmount": 500,
    "remaining": 250
  }
}
```

### Error Cases

| Scenario | HTTP | Error |
|---|---|---|
| Booking not found (or wrong tenant) | 404 | Booking not found |
| Booking cancelled | 409 | Cannot check in a cancelled booking |
| Booking already checked out | 409 | Booking is already checked out |
| No active items | 409 | Booking has no active items to check in |
| Unit in maintenance/cleaning | 409 | One or more units are not ready or unavailable |

---

## 2. Payment Recording

There are two ways to record a front-desk payment without changing the booking status:

### 2a. Inline with Check-In

Pass `cash_amount` in the check-in payload (see above). The payment is recorded atomically within the check-in transaction.

### 2b. Standalone Payment API

```
POST /api/admin/booking/payment
```

**Platform:** AUTH_PLATFORM
**Permission:** `update_bookings`

This endpoint records a cash or POS payment against a booking **without** changing its status. Use this when:
- A guest pays a deposit before check-in
- A guest makes a partial payment during their stay
- The front desk records a POS terminal transaction

#### Payload

| Param | Type | Required | Description |
|---|---|---|---|
| `booking_id` | number | Yes | The booking to record payment against |
| `amount` | number | Yes | Payment amount (clamped to outstanding balance) |
| `payment_method` | string | No | `cash` (default), `pos`, `credit_card`, `bank_transfer` |
| `transaction_ref` | string | No | External reference (POS receipt number, card auth code) |

#### Processing Flow (Single Transaction)

1. Lock the booking row `FOR UPDATE` scoped to `tenant_id`
2. Reject if `booking_status` is `checked_out` or `cancelled`
3. Reject if booking is already fully paid (`outstanding <= 0`)
4. Clamp amount to outstanding balance: `pay = min(amount, total_amount - paid_amount)`
5. Insert a `booking_payments` row with `payment_status = 'completed'`
6. Increment `bookings.paid_amount` by the applied amount
7. Commit

#### Response

```json
{
  "booking_id": 42,
  "payment_id": 15,
  "amount_requested": 300,
  "amount_applied": 250,
  "payment_method": "pos",
  "transaction_ref": "POS-2026-0042",
  "total_amount": 500,
  "paid_amount": 500,
  "balance_remaining": 0
}
```

Note: `amount_applied` may be less than `amount_requested` if the requested amount exceeds the outstanding balance.

#### Error Cases

| Scenario | HTTP | Error |
|---|---|---|
| Booking not found | 404 | Booking not found |
| Booking checked out/cancelled | 409 | Cannot record payment for a checked_out booking |
| Booking fully paid | 409 | Booking is already fully paid |
| Amount is 0 or negative | 400 | amount must be greater than 0 |
| Invalid payment method | 422 | payment_method must be one of: cash, pos, credit_card, bank_transfer |

### How Cash/POS Payments Are Stored

Every payment creates a row in `booking_payments`:

| Column | Value |
|---|---|
| `booking_id` | The booking |
| `amount` | The applied payment amount |
| `currency_id` | From the booking's currency |
| `remaining` | Outstanding balance after this payment |
| `payment_method` | `cash`, `pos`, `credit_card`, or `bank_transfer` |
| `payment_status` | `completed` |
| `transaction_ref` | External reference (nullable) |
| `payment_date` | `NOW()` |

The booking's `paid_amount` is incremented atomically:

```sql
UPDATE bookings SET paid_amount = paid_amount + ? WHERE booking_id = ?
```

This means `bookings.paid_amount` always reflects the cumulative total of all recorded payments.

---

## 3. Staff Check-Out

There are two check-out pathways for staff:

### 3a. CheckinGroupedCrud Checkout (with payment gate)

```
POST /api/checkinGroupedCrud
```

Payload: `{ action: "checkout", booking_id, cash_amount? }`

#### Processing Flow (Single Transaction)

**Step 1 -- Lock and validate**
- Booking must be `checked_in` (not just confirmed)
- Rejects `checked_out` and non-checked-in bookings

**Step 2 -- Optional final cash payment**
- If `cash_amount > 0`, records payment via `recordCashPayment` within the transaction

**Step 3 -- Payment-cleared gate**
- After any cash payment, checks: `total_amount - paid_amount > 0`
- If there is ANY outstanding balance, checkout is **rejected** with the remaining amount
- This ensures no guest leaves without settling their bill

**Step 4 -- Release units**
- All `booking_items` with active, non-cancelled units:
  - `delivery_units.current_status` flipped from `occupied` to `available`
  - `booking_items.item_status` set to `checked_out`

**Step 5 -- Transition booking**

```sql
UPDATE bookings
SET booking_status = 'checked_out', actual_check_out = NOW()
WHERE booking_id = ?
```

#### Response

```json
{
  "booking_id": 42,
  "booking_status": "checked_out",
  "freed_units": [5, 12],
  "payment": {
    "paymentId": 9,
    "paidAmount": 500,
    "totalAmount": 500,
    "remaining": 0
  }
}
```

#### Error Cases

| Scenario | HTTP | Error |
|---|---|---|
| Not checked in | 409 | Only a checked-in booking can be checked out |
| Outstanding balance | 409 | Cannot check out -- outstanding balance of X. Settle payment first. |

### 3b. AdminBookingCheckout (flexible checkout)

```
POST /api/admin/booking/checkout
```

**Permission:** `update_bookings`

This is a more flexible checkout that allows partial payment at checkout time and does **not** enforce full payment clearance.

#### Payload

| Param | Type | Required | Description |
|---|---|---|---|
| `booking_id` | number | Yes | The booking to check out |
| `payment_method` | string | Yes | `cash`, `credit_card`, `bank_transfer`, `no_charge` |
| `amount` | number | No | Payment amount (defaults to full balance due) |
| `transaction_ref` | string | No | External reference |
| `notes` | string | No | Staff notes |

#### Processing Flow

1. Validate booking (not cancelled, not already checked out)
2. If `payment_method != 'no_charge'` and `amount > 0`: insert `booking_payments` row, bump `paid_amount`
3. Transition to `checked_out`, stamp `actual_check_out`, flip all items to `checked_out`
4. Send `notifyCheckoutComplete` to the guest (fire-and-forget)

#### Key Differences from CheckinGroupedCrud Checkout

| Aspect | CheckinGroupedCrud | AdminBookingCheckout |
|---|---|---|
| **Payment gate** | Strict: rejects if balance > 0 | None: checks out regardless |
| **Unit release** | Yes: frees `delivery_units` to `available` | No: only flips `booking_items` |
| **Status requirement** | Must be `checked_in` | Any status except `cancelled`/`checked_out` |
| **Guest notification** | No | Yes: `notifyCheckoutComplete` |
| **Payment methods** | Cash only | Cash, credit card, bank transfer, no charge |

---

## 4. Guest Self-Service (Mobile/Web)

### Guest Check-In

```
POST /api/guest/booking/checkin
```

**Platform:** AUTH_PLATFORM (guest access token)

Simple status-only check-in from the guest app. No unit allocation, no payment.

| Param | Type | Required | Description |
|---|---|---|---|
| `booking_id` | number | Yes | The booking |
| `main_guest_flag` | boolean | No | `true` = main guest (name from profile), `false` = delegated guest |
| `main_guest_name` | string | No | Name of the person checking in (when `main_guest_flag = false`) |
| `main_guest_relation` | string | No | Relation to booker (when `main_guest_flag = false`) |

Records the main guest identity in `booking_checkin_details` (upsert).

### Guest Check-Out

```
POST /api/guest/booking/checkout
```

**Platform:** AUTH_PLATFORM (guest access token)

Status-only checkout. Only allowed if `booking_status = 'checked_in'`. Flips booking and items to `checked_out`, stamps `actual_check_out`. No payment handling, no unit release.

---

## Database Tables Involved

| Table | Role in Flow |
|---|---|
| `bookings` | Master record: `booking_status`, `total_amount`, `paid_amount`, `actual_check_in`, `actual_check_out` |
| `booking_items` | Unit assignments per booking: `unit_id`, `item_status` (reserved/occupied/checked_out) |
| `booking_payments` | Payment ledger: each payment is a row with `amount`, `remaining`, `payment_method` |
| `booking_checkin_details` | Guest identity captured at check-in: `main_guest_name`, `main_guest_relation` |
| `booking_service_slots` | Timed service slots: `actual_start` stamped at check-in |
| `delivery_units` | Physical rooms/resources: `current_status` (available/occupied/maintenance/cleaning) |

---

## Typical Front Desk Workflow

1. **Guest arrives** -- Staff searches via `GET /api/checkinGroupedCrud` (arrival lookup by name/booking number/QR)
2. **Review documents** -- Staff views guest KYC via `GET /api/checkinGroupedCrud?id=USER_ID` (View op)
3. **Check in** -- Staff calls `POST /api/checkinGroupedCrud` with `booking_id` and optional `cash_amount` for deposit
4. **During stay** -- Additional payments recorded via `POST /api/admin/booking/payment` (cash or POS)
5. **Guest departs** -- Staff calls `POST /api/checkinGroupedCrud` with `action: "checkout"` and optional `cash_amount` to settle final balance
6. **If balance outstanding at checkout** -- The payment-cleared gate rejects. Staff records remaining payment in the same call via `cash_amount`, or uses `POST /api/admin/booking/payment` first, then retries checkout

---

## Key Files

| File | Purpose |
|---|---|
| `Src/Apis/ProjectSpecificApis/CheckinGroupedCrud/CheckinGroupedCrud.js` | Grouped CRUD: check-in, checkout, arrival lookup, guest docs |
| `Src/HelperFunctions/PreProcessingFunctions/CheckinGroupedCrud/performStaffCheckin.js` | Staff check-in orchestrator |
| `Src/HelperFunctions/PreProcessingFunctions/CheckinGroupedCrud/performStaffCheckout.js` | Staff checkout with payment gate |
| `Src/HelperFunctions/Guest/v2/checkinAllocation.js` | Unit allocation + slot start logic |
| `Src/HelperFunctions/Guest/v2/recordCashPayment.js` | Atomic cash payment recorder (transaction-joinable) |
| `Src/Apis/ProjectSpecificApis/AdminBookingPayment/AdminBookingPayment.js` | Standalone payment recording API |
| `Src/Apis/ProjectSpecificApis/AdminBookingCheckout/AdminBookingCheckout.js` | Flexible admin checkout with payment |
| `Src/Apis/ProjectSpecificApis/GuestSpecificApis/GuestBookingCheckin/GuestBookingCheckin.js` | Guest self-check-in |
| `Src/Apis/ProjectSpecificApis/GuestSpecificApis/GuestBookingCheckout/GuestBookingCheckout.js` | Guest self-check-out |
