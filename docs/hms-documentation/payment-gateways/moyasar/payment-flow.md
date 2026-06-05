# Moyasar Payment Flow

The complete guest booking payment flow using Moyasar's hosted form.

---

## Overview

```
Client                      HMS Backend                   Moyasar API
  │                              │                            │
  ├─ POST /guest/payments/       │                            │
  │  initiate ──────────────────►│                            │
  │                              ├─ Create pending            │
  │                              │  transaction row           │
  │  ◄── moyasarForm config ─────┤                            │
  │                              │                            │
  ├─ Render Moyasar              │                            │
  │  Hosted Form ───────────────────────────────────────────►│
  │  (card entry)                │                            │
  │                              │                            │
  │  ◄── moyasarPaymentId ──────────────────────────────────┤
  │  (3DS complete)              │                            │
  │                              │                            │
  ├─ POST /guest/payments/       │                            │
  │  confirm ───────────────────►│                            │
  │                              ├─ GET /v1/payments/{id} ──►│
  │                              │  (verify with secret key)  │
  │                              │◄── payment status ─────────┤
  │                              │                            │
  │                              ├─ Update transaction        │
  │                              │  to completed              │
  │                              ├─ Increment                 │
  │  ◄── confirmation ──────────┤  booking.paid_amount        │
  │                              │                            │
  │                    ┌─────────┤                            │
  │                    │ Async   │                            │
  │                    │ webhook ◄──── POST callback/moyasar ─┤
  │                    │ (backup)│    (if client drops off)    │
  │                    └─────────┤                            │
```

---

## Step 1: Initiate Payment

**POST** `/api/guest/payments/initiate`

### Request

| Field | Type | Required | Description |
|---|---|---|---|
| `bookingId` | `number` | Yes | Booking to pay for. |
| `amount` | `number` | Yes | Amount in major units (e.g. `540.00` SAR). |
| `currency` | `string` | No | ISO 4217 code. Default: `"SAR"`. |
| `methods` | `string[]` | No | Payment methods. Default: `["creditcard"]`. |
| `supportedNetworks` | `string[]` | No | Card networks: `mada`, `visa`, `mastercard`, `amex`. |
| `successUrl` | `string` | No | Deep link for post-payment redirect. |
| `failureUrl` | `string` | No | Deep link for failure redirect. |

**Headers:**
- `Idempotency-Key: <UUID v4>` (required)
- `accesstoken: <JWT>` (required)

### Response

```json
{
  "transactionId": 88421,
  "moyasarForm": {
    "amount": 54000,
    "currency": "SAR",
    "description": "[HMS:88421] Hotel Name - 3 nights",
    "publishableApiKey": "pk_test_...",
    "callbackUrl": "https://api.dev-hms.gobizzi.com/api/payments/webhook/callback/moyasar?txId=88421",
    "methods": ["creditcard"],
    "supportedNetworks": ["mada", "visa", "mastercard", "amex"],
    "metadata": { "hmsTransactionId": 88421 },
    "formAssets": {
      "css": "https://cdn.moyasar.com/mpf/1.15.8/moyasar.css",
      "script": "https://cdn.moyasar.com/mpf/1.15.8/moyasar.js"
    }
  }
}
```

The client uses `moyasarForm` to render the Moyasar hosted payment form. The `amount` is in **minor units** (halalas for SAR — multiply by 100).

---

## Step 2: Guest Pays via Hosted Form

The client renders Moyasar's hosted form using the returned config. The guest enters card details directly into Moyasar's iframe — **no card data touches HMS servers**.

After payment processing (including 3DS if required), Moyasar returns a `moyasarPaymentId` (UUID) to the client.

---

## Step 3: Confirm Payment

**POST** `/api/guest/payments/confirm`

### Request

| Field | Type | Required | Description |
|---|---|---|---|
| `transactionId` | `number` | Yes | The HMS transaction ID from step 1. |
| `moyasarPaymentId` | `string` | Yes | UUID payment ID returned by Moyasar. |

**Headers:**
- `Idempotency-Key: <UUID v4>` (required)
- `accesstoken: <JWT>` (required)

### Response

```json
{
  "transactionId": 88421,
  "bookingId": 12345,
  "paymentStatus": "completed",
  "balanceDueRemaining": 0
}
```

### What happens server-side

1. Loads the transaction from DB, verifies it belongs to the caller
2. Calls Moyasar API: `GET /v1/payments/{moyasarPaymentId}` with secret key
3. Verifies `status` is `paid`, `completed`, or `captured`
4. Verifies the amount matches (in minor units)
5. Updates `transactions.payment_status` to `completed`
6. Increments `bookings.paid_amount`

---

## Currency Conversion

Moyasar uses **minor units**. The backend converts automatically:

| Currency | Factor | Example |
|---|---|---|
| SAR | ×100 | 540.00 SAR → 54000 halalas |
| BHD, KWD, OMR, JOD, IQD | ×1000 | 10.500 BHD → 10500 fils |
| USD, EUR | ×100 | 99.99 USD → 9999 cents |

---

## Idempotency

Both endpoints require an `Idempotency-Key` header (UUID v4). If the same key is replayed:
- **Same body** → returns the original response (safe retry)
- **Different body** → returns `409 idempotency_replay_conflict`

This protects against duplicate charges from network retries.

---

## Error Responses

| Status | `error.details` | Condition |
|---|---|---|
| 422 | `Idempotency-Key header (UUID v4) is required` | Missing or invalid idempotency key. |
| 422 | `bookingId is required` | Missing booking ID in initiate. |
| 422 | `amount must be a positive number` | Invalid amount. |
| 422 | `Could not verify payment with Moyasar` | Moyasar API call failed during confirm. |
| 422 | `Payment is not in a succeeded state yet` | Payment not yet paid/captured. |
| 422 | `Payment amount does not match` | Minor units don't match. |
| 404 | `Payment transaction not found` | Transaction doesn't exist or doesn't belong to caller. |
| 409 | `idempotency_replay_conflict` | Same key, different body. |
| 503 | `Payments unavailable (missing Moyasar secret key)` | Secret key not configured. |
