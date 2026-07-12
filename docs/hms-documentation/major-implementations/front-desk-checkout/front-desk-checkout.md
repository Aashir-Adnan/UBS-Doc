---
title: "Front Desk Checkout API"
sidebar_position: 1
---

# Front Desk Checkout API

This document describes the admin-facing front desk checkout endpoint, which handles payment recording, booking status transitions, and guest notifications in a single atomic operation.

---

## Context

When a guest physically checks out at the front desk, a staff member with the `update_bookings` permission triggers the checkout process. The API records any outstanding payment, transitions the booking and its items to `checked_out` status, and notifies the guest.

---

## API Endpoint

```
POST /api/admin/booking/checkout
```

### Permission

`update_bookings`

### Request Payload

| Param | Type | Required | Description |
|-------|------|----------|-------------|
| `booking_id` | number | Yes | ID of the booking to check out |
| `payment_method` | string | Yes | One of: `cash`, `credit_card`, `bank_transfer`, `no_charge` |
| `amount` | number | No | Payment amount. Defaults to full balance due |
| `transaction_ref` | string | No | External transaction reference (e.g., card terminal receipt) |
| `notes` | string | No | Staff notes about the checkout |

### Payment Methods

| Method | Behavior |
|--------|----------|
| `cash` | Records a cash payment for the specified amount |
| `credit_card` | Records a credit card payment with optional `transaction_ref` |
| `bank_transfer` | Records a bank transfer payment |
| `no_charge` | Skips payment recording entirely (amount is ignored) |

---

## Processing Flow

The entire operation runs inside an atomic database transaction (`START TRANSACTION` / `COMMIT` / `ROLLBACK`).

### Step 1: Validate Booking

- Verify the booking exists.
- Verify `booking_status` is not `cancelled` or `checked_out`.
- If validation fails, the transaction is rolled back and an error is returned.

### Step 2: Record Payment

If `payment_method` is not `no_charge` and `amount > 0`:

- Insert a row into `booking_payments`:

| Column | Value |
|--------|-------|
| `booking_id` | From request |
| `payment_method` | From request |
| `amount` | From request (or computed balance) |
| `transaction_ref` | From request (nullable) |
| `currency` | From booking's tenant currency |

- Increment `bookings.paid_amount` by the payment amount.

### Step 3: Transition Booking Status

```sql
UPDATE bookings
SET booking_status = 'checked_out',
    actual_check_out = NOW()
WHERE id = ?
```

### Step 4: Transition Booking Items

```sql
UPDATE booking_items
SET item_status = 'checked_out'
WHERE booking_id = ?
```

### Step 5: Notify Guest

Send `notifyCheckoutComplete` notification to the guest with checkout confirmation details.

---

## Response Shape

```json
{
  "booking_id": 42,
  "booking_status": "checked_out",
  "payment": {
    "payment_id": 15,
    "amount": 250.00,
    "payment_method": "cash",
    "transaction_ref": null,
    "currency": "SAR"
  },
  "total_amount": 500.00,
  "paid_amount": 500.00,
  "balance_remaining": 0.00
}
```

When `payment_method` is `no_charge`, the `payment` field is `null`.

---

## Error Cases

| Scenario | HTTP Status | Error |
|----------|-------------|-------|
| Booking not found | 404 | `"Booking not found"` |
| Booking already cancelled | 400 | `"Booking is cancelled"` |
| Booking already checked out | 400 | `"Booking is already checked out"` |
| Invalid payment method | 400 | `"Invalid payment method"` |

---

## Key Files

| File | Purpose |
|------|---------|
| `Src/Apis/ProjectSpecificApis/AdminBookingCheckout/AdminBookingCheckout.js` | API object definition |
| `Src/Apis/ProjectSpecificApis/AdminBookingCheckout/CRUD_parameters.js` | Request parameter schema |
