# Booking Payment Lifecycle

How a guest booking goes from creation to fully paid, who triggers each step, and how statuses transition.

---

## End-to-End Flow

```
 GUEST (Frontend)                   HMS BACKEND                     MOYASAR
       |                                 |                              |
  1.   | -- POST /guest/bookings/room -> |                              |
       |    (or /service, /package)      |                              |
       |                                 | Creates booking:             |
       |                                 |   booking_status = confirmed |
       |                                 |   total_amount = calculated  |
       |                                 |   paid_amount = 0            |
       | <- booking response ----------- |                              |
       |    (bookingId, amount, status)  |                              |
       |                                 |                              |
  2.   | -- POST /guest/payments/ -----> |                              |
       |    initiate                     |                              |
       |    {bookingId, amount,          | Creates transaction:         |
       |     currency}                   |   payment_status = pending   |
       |                                 |   amount = balance due       |
       | <- moyasarForm config --------- |                              |
       |    (publishableKey, amount      |                              |
       |     in minor units, callback)   |                              |
       |                                 |                              |
  3.   | -- Render Moyasar hosted form --+---------------------------> |
       |    Guest enters card details    |                              |
       |    directly into Moyasar iframe |                              |
       |    (NO card data touches HMS)   |                              |
       |                                 |                              |
       | <- moyasarPaymentId (UUID) ----+------------------------------ |
       |    (after 3DS if required)      |                              |
       |                                 |                              |
  4a.  | -- POST /guest/payments/ -----> |                              |
       |    confirm                      | -- GET /v1/payments/{id} --> |
       |    {transactionId,              | <- status: paid ------------ |
       |     moyasarPaymentId}           |                              |
       |                                 | Updates:                     |
       |                                 |   transaction -> completed   |
       |                                 |   booking.paid_amount += amt |
       |                                 |   Sends notification         |
       | <- confirmation --------------- |                              |
       |                                 |                              |
  4b.  |                                 | <- POST callback/moyasar --- |
       |                                 |    (async backup if client   |
       |                                 |     drops off)               |
       |                                 | Same verification + update   |
```

---

## Who Triggers What

| Step | Who triggers it | What happens |
|---|---|---|
| **Booking creation** | Guest taps "Book Now" in the app | Frontend calls `POST /guest/bookings/room` (or `/service`, `/package`). Backend calculates price, assigns a unit, creates the booking row. No payment yet. |
| **Payment initiation** | Guest taps "Pay" on the booking detail screen | Frontend calls `POST /guest/payments/initiate` with `bookingId` and `amount`. Backend creates a pending `transactions` row and returns the Moyasar form config. |
| **Card entry** | Guest fills in card details | The frontend renders Moyasar's hosted form (an iframe). Card data goes directly to Moyasar's servers. HMS never sees card numbers, CVVs, or PANs. |
| **Payment confirmation** | Frontend, automatically after Moyasar returns | After Moyasar processes the card (including 3DS), it returns a `moyasarPaymentId` to the frontend. The frontend immediately calls `POST /guest/payments/confirm` with that ID. Backend verifies with Moyasar's API and marks the payment as completed. |
| **Webhook (backup)** | Moyasar, automatically | Moyasar POSTs to the callback URL. This is a safety net for cases where the guest's app crashes or loses connection after paying but before calling `/confirm`. |

---

## Booking Status Transitions

```
  confirmed ──── (guest pays partial) ──── confirmed (paid_amount > 0)
      |                                         |
      |                                         |
      ├── (check-in) ───────────────── checked_in
      |                                         |
      |                                         |
      |                               (check-out) ──── checked_out
      |                                                     |
      |                                         (guest pays remaining)
      |                                                     |
      |                                              checked_out (fully paid)
      |
      └── (guest cancels) ──── cancelled
```

| Status | Meaning |
|---|---|
| `confirmed` | Booking created. Guest can pay, check in, or cancel. |
| `checked_in` | Guest has checked in. `actual_check_in` timestamp is set. |
| `checked_out` | Guest has checked out. `actual_check_out` timestamp is set. Payments can still be taken for remaining balance. |
| `cancelled` | Booking cancelled. No further payments accepted. |

---

## Transaction Status Transitions

```
  pending ──── (Moyasar confirms payment) ──── completed
     |
     └── (never confirmed / expired) ──── stays pending
```

| Status | Meaning |
|---|---|
| `pending` | Transaction created by initiate. Waiting for guest to complete Moyasar form. |
| `completed` | Payment verified with Moyasar API. `booking.paid_amount` incremented. |

---

## Partial Payment Flow

The system supports partial payments across multiple transactions against the same booking.

### Example: 600 SAR booking paid in two installments

| Step | Action | `paid_amount` | `total_amount` | Balance due |
|---|---|---|---|---|
| 1 | Booking created | 0 | 600 | 600 |
| 2 | Initiate payment for 300 | 0 | 600 | 600 |
| 3 | Guest pays, confirm succeeds | 300 | 600 | 300 |
| 4 | Guest checks in (eligible: paid > 0) | 300 | 600 | 300 |
| 5 | Guest checks out | 300 | 600 | 300 |
| 6 | Initiate payment for remaining 300 | 300 | 600 | 300 |
| 7 | Guest pays, confirm succeeds | 600 | 600 | 0 |

**Key rules:**

- The `amount` in the initiate call must equal the current balance due (`total_amount - paid_amount`). The backend enforces this.
- Each payment creates a separate `transactions` row. A booking can have multiple completed transactions.
- Check-in requires `paid_amount > 0` (at least some payment made). It does NOT require full payment.
- Payments can be taken after check-out for any remaining balance.
- Once `paid_amount >= total_amount`, further payment initiations are rejected with `409 booking_already_paid`.

---

## Database Tables Involved

| Table | Role in payment flow |
|---|---|
| `bookings` | Holds `total_amount`, `paid_amount`, `booking_status`, `currency_id`. Payment confirm/webhook increments `paid_amount`. |
| `transactions` | One row per payment attempt. `payment_status` tracks pending/completed. `provider_transaction_id` stores the Moyasar payment UUID. `provider_metadata` stores verification timestamps. |
| `payment_providers` | Lookup table for provider ID (Moyasar). Referenced by `transactions.provider_id`. |
| `currencies` | Maps `currency_id` to `currency_code` (SAR, BHD, etc.) for minor unit conversion. |
| `catalog_pricing` | Source of truth for service/package prices. Used during booking creation to calculate `total_amount`. |

---

## Idempotency & Race Conditions

### Idempotency

Both `/initiate` and `/confirm` require an `Idempotency-Key` header (UUID v4). If the frontend retries with the same key (e.g., due to network timeout), the backend returns the cached response instead of creating a duplicate transaction or double-charging.

### Webhook vs Confirm Race

The webhook and `/confirm` endpoint perform the same update. Whichever runs first wins:

1. First caller verifies with Moyasar, updates transaction to `completed`, increments `paid_amount`
2. Second caller sees `payment_status = 'completed'` and returns the existing result (no-op)

No double-increment occurs because both check `payment_status` before updating.

---

## Security

- **No card data touches HMS.** The Moyasar hosted form runs in an iframe. Card numbers, CVVs, and PANs go directly from the guest's device to Moyasar's PCI-DSS certified servers.
- **Server-to-server verification.** Neither the client's claim nor Moyasar's webhook body is trusted. Every payment is verified by calling `GET /v1/payments/{id}` with the secret key.
- **Amount validation.** The verified amount (in minor units) must match the initiated transaction amount. Mismatches are rejected.
- **Ownership checks.** The confirm endpoint verifies that the transaction belongs to the calling guest (matching `urdd_id` and `tenant_id`).

---

## Source Files

| File | Purpose |
|---|---|
| `Src/HelperFunctions/PreProcessingFunctions/Guest/guestMoyasarPayments.js` | Initiate and confirm logic |
| `Src/Routes/moyasarWebhook.js` | Webhook handler |
| `Src/HelperFunctions/PreProcessingFunctions/Guest/createRoomBooking.js` | Room booking creation (calculates total) |
| `Src/HelperFunctions/PreProcessingFunctions/Guest/createServiceBooking.js` | Service booking creation |
| `Src/HelperFunctions/PreProcessingFunctions/Guest/createPackageBooking.js` | Package booking creation |
| `Services/Helpers/idempotency.js` | In-process idempotency store |

---

## Change Log

| Date | Change |
|---|---|
| 2026-07-08 | Initial document |
