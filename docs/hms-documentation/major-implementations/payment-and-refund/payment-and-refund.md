---
title: "Payment & Refund Flow"
sidebar_position: 1
---

# Payment & Refund Flow

This document describes the booking cancellation refund flow, including how cancellation fees are computed, how refunds are processed through the Moyasar payment gateway, and how the system tracks refund transactions.

---

## Context

When a guest cancels a booking, the system must:

1. Determine whether cancellation is allowed (transport bookings have a cutoff window).
2. Compute a cancellation fee based on time-based percentage rules.
3. Process refunds for each completed payment transaction on the booking.
4. Record refund transactions in the database.
5. Notify the guest of the cancellation and refund.

---

## Cancellation Fee Computation

### Config Key: `cancellation_margin`

Each service can define a `cancellation_margin` config in `hms_config`. The value is a JSON array of time-based percentage rules, evaluated from most restrictive to least:

```json
[
  { "hours_before": 48, "charge_pct": 10 },
  { "hours_before": 24, "charge_pct": 50 },
  { "hours_before": 0,  "charge_pct": 100 }
]
```

### How It Works

| Time Before Check-In | Cancellation Fee | Refund Percentage |
|----------------------|------------------|-------------------|
| 48+ hours            | 10%              | 90%               |
| 24-48 hours          | 50%              | 50%               |
| Less than 24 hours   | 100%             | 0%                |

The system finds the first rule where the current time is within the `hours_before` window of the booking's check-in time and applies the corresponding `charge_pct`.

### Transport Booking Cutoff

Transport bookings can define a `modification_cancellation_cutoff_hours` config. If the guest attempts to cancel within this window of the pickup time, the cancellation is blocked entirely and an error is returned.

---

## API Endpoint

```
POST /api/guest/booking/cancel
```

| Param | Type | Description |
|-------|------|-------------|
| `booking_id` | body | ID of the booking to cancel |
| `actionPerformerURDD` | body | URDD of the guest performing the action |

### Platform

`AUTH_PLATFORM` -- requires a valid access token.

---

## Refund Processing Flow

When the cancellation is approved, the system processes refunds for each completed `purchase` transaction on the booking:

### Step-by-Step

1. **Fetch transactions** -- Query all `transactions` rows for the booking where `transaction_type = 'purchase'` and `status = 'completed'`.

2. **Compute per-transaction refund** -- For each transaction:
   - Calculate the proportional cancellation fee: `transaction_amount * (charge_pct / 100)`
   - Refund amount = `transaction_amount - cancellation_fee`

3. **Call Moyasar refund API** -- For each transaction with a refund amount > 0:
   ```
   POST https://api.moyasar.com/v1/payments/{payment_id}/refund
   Body: { "amount": refund_amount_in_halalas }
   ```

4. **Create refund transaction row** -- Insert a new `transactions` row with:
   - `transaction_type = 'refund'`
   - `amount = refund_amount`
   - `status = 'completed'`
   - `related_transaction_id` pointing to the original purchase transaction

5. **Update original transaction** -- Set `refund_date` on the original purchase transaction.

6. **Decrement booking paid amount** -- Update `bookings.paid_amount` by subtracting the refund amount.

7. **Update booking status** -- Set `booking_status = 'cancelled'`.

---

## Database Tables

### `transactions`

| Column | Description |
|--------|-------------|
| `id` | Primary key |
| `booking_id` | FK to `bookings` |
| `transaction_type` | `'purchase'` or `'refund'` |
| `amount` | Transaction amount |
| `status` | `'completed'`, `'pending'`, `'failed'` |
| `payment_gateway_id` | Moyasar payment ID |
| `refund_date` | Timestamp when refund was processed (on purchase rows) |
| `related_transaction_id` | FK to the original purchase transaction (on refund rows) |

### `bookings`

| Column | Description |
|--------|-------------|
| `paid_amount` | Running total of net payments (decremented on refund) |
| `booking_status` | Updated to `'cancelled'` after refund processing |

### `booking_payments`

| Column | Description |
|--------|-------------|
| `booking_id` | FK to `bookings` |
| `payment_method` | Payment method used |
| `amount` | Amount paid |

---

## Notifications

After successful cancellation and refund processing, two notifications are sent:

| Notification | Recipient | Description |
|-------------|-----------|-------------|
| `notifyBookingCancelledGuest` | Guest | Confirms the booking has been cancelled |
| `notifyRefundProcessed` | Guest | Details of the refund amount and timeline |

---

## Response Shape

```json
{
  "totalRefunded": 450.00,
  "cancellationFeeApplied": 50.00,
  "details": [
    {
      "transactionId": 101,
      "originalAmount": 500.00,
      "cancellationFee": 50.00,
      "refundedAmount": 450.00,
      "paymentGatewayId": "pay_abc123"
    }
  ]
}
```

---

## Key Files

| File | Purpose |
|------|---------|
| `Src/Apis/ProjectSpecificApis/GuestSpecificApis/GuestBookingCancel/GuestBookingCancel.js` | API object definition for booking cancellation |
| `Src/HelperFunctions/PreProcessingFunctions/Guest/guestMoyasarPayments.js` | `processBookingRefund` and `moyasarRefundPayment` functions |
| `Src/HelperFunctions/Guest/guestNotificationEmit.js` | `notifyRefundProcessed` notification helper |
