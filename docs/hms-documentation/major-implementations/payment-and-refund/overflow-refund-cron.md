# Overflow Refund Cron

Processes refunds for checked-out bookings where the guest has overpaid due to booking edits that reduced the total amount.

```
Schedule: Every 30 minutes (env: OVERFLOW_REFUND_SCHEDULE)
File: Services/Integrations/CronJobs/overflowRefundCron.js
```

---

## Overview

When a guest edits a booking (shortens stay, removes services, etc.) after having already paid, the new `total_amount` may become less than `paid_amount`. This difference is the **overflow** — money the guest is owed back.

Overflow refunds are **not** processed immediately at edit time. Instead, they are deferred to after checkout and handled by this cron job. This avoids:

- Immediate refund complications (partial stays, further edits before checkout)
- Race conditions with in-flight payments
- Unnecessary refund-then-recharge cycles if the guest edits again

---

## How It Works

### 1. Find Eligible Bookings

```sql
SELECT * FROM bookings
WHERE booking_status = 'checked_out'
  AND status = 'active'
  AND paid_amount > total_amount
  AND NOT EXISTS (
    -- Skip if already processed
    SELECT 1 FROM transactions t
    WHERE t.booking_id = bookings.booking_id
      AND t.transaction_type = 'refund'
      AND JSON_EXTRACT(t.provider_metadata, '$.reason') = 'booking_edit_overflow'
      AND t.payment_status IN ('completed', 'pending')
  )
```

### 2. Calculate Overflow

```
overflowAmount = paid_amount - total_amount
```

### 3. Distribute Refunds Across Transactions

The cron finds all completed `purchase` transactions for the booking (most recent first) and refunds the overflow amount distributed across them:

```
For each transaction (newest first):
  refundAmount = min(remaining_overflow, transaction_amount)
  Issue Moyasar partial refund
  Create 'refund' transaction row
  remaining_overflow -= refundAmount
```

### 4. Update Booking

```sql
UPDATE bookings SET paid_amount = paid_amount - totalRefunded
WHERE booking_id = ?
```

### 5. Notify Guest

Sends a `refund_processed` notification (push + inbox + email) with the refund amount and booking number.

---

## Transaction Record

Overflow refunds are stored as regular `refund` transactions, identified by metadata:

```json
{
  "transaction_type": "refund",
  "payment_status": "completed | pending",
  "provider_metadata": {
    "originalTransactionId": 85,
    "overflowAmount": 300,
    "reason": "booking_edit_overflow",
    "moyasar": { "refund": { "..." } }
  }
}
```

The `reason: "booking_edit_overflow"` field distinguishes these from cancellation refunds.

| Status | Meaning |
|---|---|
| `completed` | Moyasar refund API succeeded |
| `pending` | Moyasar refund failed or non-Moyasar payment — requires manual processing |

---

## Idempotency

The cron is idempotent: once an overflow refund transaction exists (completed or pending) for a booking, that booking is skipped on subsequent runs. Running the cron multiple times will not create duplicate refunds.

---

## Configuration

| Environment Variable | Default | Description |
|---|---|---|
| `OVERFLOW_REFUND_SCHEDULE` | `*/30 * * * *` | Cron schedule (every 30 minutes) |

---

## Lifecycle Flow

```
1. Guest creates booking          → total=450, paid=0
2. Guest pays full amount         → total=450, paid=450
3. Guest edits (shortens stay)    → total=270, paid=450, overflow=180
   └─ API returns overflowAmount=180, overflowRefundNote="..."
4. Guest checks out               → booking_status='checked_out'
5. Cron runs                      → finds overflow, issues Moyasar refund
   ├─ Creates refund transaction (amount=180)
   ├─ Updates paid_amount: 450 → 270
   └─ Sends refund notification to guest
```

---

## Relationship to Other Components

| Component | Relationship |
|---|---|
| `PUT /api/guest/booking/edit` | Detects overflow and returns `overflowAmount` + `overflowRefundNote` in response |
| `processBookingRefund()` | Handles cancellation refunds (separate from overflow) |
| `PaymentReconciliationCron` | Reconciles pending Moyasar payments (complementary, not overlapping) |
| `NotificationSchedulerCron` | Time-based booking notifications (checkout reminders, etc.) |

---

## Key Files

| File | Purpose |
|---|---|
| `Services/Integrations/CronJobs/overflowRefundCron.js` | Cron job implementation |
| `Src/Bootstrap/cron.js` | Cron registration |
| `Src/HelperFunctions/PreProcessingFunctions/Guest/editBooking.js` | Overflow detection in edit flow |
| `Src/HelperFunctions/Guest/guestNotificationEmit.js` | `notifyRefundProcessed` notification |
