# Frontend Payment Integration

Step-by-step guide for frontend developers implementing the Moyasar payment flow in the guest app.

---

## Overview

The payment flow has 4 frontend steps:

1. **Initiate** — call the backend to create a payment session
2. **Render** — show the Moyasar hosted form using the returned config
3. **Confirm** — after the guest pays, send the Moyasar payment ID back to the backend
4. **Update UI** — show success/failure and refresh the booking

The guest can pay the full balance at once, or pay partially across multiple sessions (e.g., pay half before check-in, pay the rest after checkout).

---

## Step 1: Initiate Payment

When the guest taps "Pay" on a booking, call the initiate endpoint to create a payment session.

### Request

```
POST /api/guest/payments/initiate
```

**Headers:**

| Header | Value | Required |
|---|---|---|
| `accesstoken` | Guest JWT | Yes |
| `Idempotency-Key` | UUID v4 (generate a new one per payment attempt) | Yes |
| `Content-Type` | `application/json` | Yes |

**Encrypted Body:**

```json
{
  "actionPerformerURDD": 130,
  "bookingId": 12345,
  "amount": 540.00,
  "currency": "SAR",
  "methods": ["creditcard"],
  "supportedNetworks": ["mada", "visa", "mastercard"],
  "successUrl": "myapp://payment/success",
  "failureUrl": "myapp://payment/failure"
}
```

| Field | Type | Required | Description |
|---|---|---|---|
| `actionPerformerURDD` | `number` | Yes | The guest's tenant-specific URDD. |
| `bookingId` | `number` | Yes | The booking to pay for. |
| `amount` | `number` | Yes | Amount in major units (e.g., `540.00` not `54000`). Must equal the booking's current balance due (`total_amount - paid_amount`). |
| `currency` | `string` | Yes | ISO 4217 currency code matching the booking's currency (e.g., `"SAR"`). |
| `methods` | `string[]` | No | Payment methods to offer. Defaults to `["creditcard"]`. Options: `"creditcard"`, `"applepay"`, `"stcpay"`. |
| `supportedNetworks` | `string[]` | No | Card networks to accept. Options: `"mada"`, `"visa"`, `"mastercard"`, `"amex"`. |
| `successUrl` | `string` | No | Deep link URL for Moyasar to redirect to on success (useful for web). |
| `failureUrl` | `string` | No | Deep link URL for Moyasar to redirect to on failure. |

### Response

```json
{
  "transactionId": 88421,
  "moyasarForm": {
    "amount": 54000,
    "currency": "SAR",
    "description": "[HMS:88421] Hotel Name · 3 nights",
    "publishableApiKey": "pk_test_xxxxxxxxxxxxxxxxx",
    "callbackUrl": "https://api.dev-hms.gobizzi.com/api/payments/webhook/callback/moyasar?txId=88421",
    "methods": ["creditcard"],
    "supportedNetworks": ["mada", "visa", "mastercard"],
    "metadata": { "hmsTransactionId": 88421 },
    "successUrl": "myapp://payment/success",
    "failureUrl": "myapp://payment/failure",
    "formAssets": {
      "css": "https://cdn.moyasar.com/mpf/1.15.8/moyasar.css",
      "script": "https://cdn.moyasar.com/mpf/1.15.8/moyasar.js"
    }
  }
}
```

**Important:** Store `transactionId` — you will need it in Step 3.

### Handling Errors

| HTTP Status | `error.details` | What to show the guest |
|---|---|---|
| 422 | `Idempotency-Key header (UUID v4) is required` | Bug — generate a UUID before calling. |
| 422 | `amount must equal the booking balance due (300)` | Show the correct balance due and let the guest retry. |
| 422 | `currency does not match the booking currency` | Bug — use the currency from the booking object. |
| 409 | `This booking is already fully paid` | Show "Already paid" and refresh booking details. |
| 503 | `Payments are temporarily unavailable` | Show a retry message. Backend Moyasar keys are not configured. |

---

## Step 2: Render the Moyasar Form

Use the `moyasarForm` config from Step 1 to render Moyasar's hosted payment form. The guest enters their card details directly into Moyasar's form — **no card data should touch your app or HMS servers**.

### Web (JavaScript)

```html
<!-- Load Moyasar assets from the response -->
<link rel="stylesheet" href="https://cdn.moyasar.com/mpf/1.15.8/moyasar.css" />
<script src="https://cdn.moyasar.com/mpf/1.15.8/moyasar.js"></script>

<div id="moyasar-form"></div>

<script>
  Moyasar.init({
    element: '#moyasar-form',
    amount: 54000,                    // from moyasarForm.amount (minor units!)
    currency: 'SAR',                  // from moyasarForm.currency
    description: '[HMS:88421] ...',   // from moyasarForm.description
    publishable_api_key: 'pk_test_...', // from moyasarForm.publishableApiKey
    callback_url: '...',              // from moyasarForm.callbackUrl
    methods: ['creditcard'],          // from moyasarForm.methods
    supported_networks: ['mada', 'visa', 'mastercard'],
    metadata: { hmsTransactionId: 88421 },
    on_completed: function(payment) {
      // payment.id is the moyasarPaymentId — send to Step 3
      confirmPayment(transactionId, payment.id);
    },
    on_failure: function(error) {
      // Show error to guest, offer retry
      showPaymentError(error);
    }
  });
</script>
```

### Mobile (React Native / Flutter)

Use Moyasar's mobile SDK or open a WebView with the hosted form. The key fields to pass are:

```js
const moyasarConfig = {
  amount: moyasarForm.amount,
  currency: moyasarForm.currency,
  description: moyasarForm.description,
  publishable_api_key: moyasarForm.publishableApiKey,
  callback_url: moyasarForm.callbackUrl,
  methods: moyasarForm.methods,
  supported_networks: moyasarForm.supportedNetworks,
  metadata: moyasarForm.metadata,
};
```

After the guest completes payment (including 3DS verification), Moyasar returns a **payment object** with an `id` field (UUID). This is the `moyasarPaymentId` you need for Step 3.

---

## Step 3: Confirm Payment

After Moyasar returns the payment ID to your app, immediately call the confirm endpoint to verify and finalize the payment.

### Request

```
POST /api/guest/payments/confirm
```

**Headers:**

| Header | Value | Required |
|---|---|---|
| `accesstoken` | Guest JWT | Yes |
| `Idempotency-Key` | UUID v4 (generate a new one, different from Step 1) | Yes |

**Encrypted Body:**

```json
{
  "actionPerformerURDD": 130,
  "transactionId": 88421,
  "moyasarPaymentId": "84d99c92-3fbe-4f12-b6a8-22e2dccbf9e3"
}
```

| Field | Type | Required | Description |
|---|---|---|---|
| `actionPerformerURDD` | `number` | Yes | Same URDD used in Step 1. |
| `transactionId` | `number` | Yes | The `transactionId` returned from Step 1. |
| `moyasarPaymentId` | `string` | Yes | The UUID payment ID returned by Moyasar after the guest paid. |

### Response (Success)

```json
{
  "transactionId": 88421,
  "bookingId": 12345,
  "paymentStatus": "completed",
  "balanceDueRemaining": 0
}
```

| Field | Type | Description |
|---|---|---|
| `transactionId` | `number` | The HMS transaction ID. |
| `bookingId` | `number` | The booking that was paid. |
| `paymentStatus` | `string` | Always `"completed"` on success. |
| `balanceDueRemaining` | `number` | Remaining balance in major units. `0` means fully paid. |

### Handling Errors

| HTTP Status | `error.details` | What to do |
|---|---|---|
| 422 | `Could not verify payment with Moyasar` | Moyasar API unreachable. Retry after a few seconds. The webhook will catch it as a backup. |
| 422 | `Payment is not in a succeeded state yet` | Payment is still processing. Wait and retry, or let the webhook handle it. |
| 422 | `Payment amount does not match` | Possible tampering. Do not retry — contact support. |
| 404 | `Payment transaction not found` | Wrong `transactionId` or URDD. Check your stored values. |

---

## Step 4: Update the UI

After a successful confirm:

1. **Show a success screen** with the amount paid and remaining balance
2. **Refresh the booking details** — `paid_amount` will have increased
3. **If `balanceDueRemaining > 0`** — show a "Pay remaining balance" button that starts the flow again from Step 1

---

## Partial Payments (Two-Part Payment)

The system supports paying a booking in multiple installments. Here's the full user journey:

### First Payment (Before Check-in)

```
Guest views booking
  -> total: 600 SAR, paid: 0, balance: 600
  -> Guest taps "Pay"
  -> Frontend calls initiate with amount: 600
     (amount MUST equal balance due — the backend enforces this)
  -> Guest pays via Moyasar form
  -> Frontend calls confirm
  -> Response: { balanceDueRemaining: 300 }
     (if partial payment was processed for 300 by the payment provider)
```

Wait — **the initiate amount must equal the full balance due.** How does a partial payment happen?

Partial payments occur when:
- The hotel applies a partial charge policy (e.g., "charge 50% at booking, 50% at checkout")
- The booking's `total_amount` is adjusted after a partial charge

For the frontend, the flow is the same each time — always pass the current `balance due` as the `amount`. The backend calculates `balance due = total_amount - paid_amount` and only accepts that exact value.

### Second Payment (After Check-out)

```
Guest views booking after checkout
  -> total: 600 SAR, paid: 300, balance: 300
  -> Guest taps "Pay remaining"
  -> Frontend calls initiate with amount: 300
  -> Guest enters card details (can be same or different card)
  -> Frontend calls confirm
  -> Response: { balanceDueRemaining: 0 }
  -> Show "Fully paid" status
```

### Frontend Logic

```js
// Determine what to show on the booking detail screen
function getPaymentAction(booking) {
  const balance = booking.totalAmount - booking.paidAmount;

  if (balance <= 0) {
    return { action: 'none', label: 'Fully Paid' };
  }

  if (booking.paidAmount === 0) {
    return { action: 'pay', label: `Pay ${balance} ${booking.currency}` };
  }

  return { action: 'pay', label: `Pay remaining ${balance} ${booking.currency}` };
}
```

---

## Check-in Eligibility

Before showing the "Check In" button, call the eligibility endpoint to verify the guest can check in.

### Request

```
GET /api/guest/booking/checkin/eligibility
```

**Encrypted Body:**

```json
{
  "actionPerformerURDD": 130,
  "booking_id": 12345
}
```

### Response

```json
{
  "eligible": true,
  "balanceDue": 300,
  "currency": "SAR"
}
```

Or if not eligible:

```json
{
  "eligible": false,
  "reason": "not_paid",
  "balanceDue": 600,
  "currency": "SAR"
}
```

| `reason` | Meaning | What to show |
|---|---|---|
| `not_paid` | `paid_amount` is 0. At least one payment required. | "Please make a payment before checking in." + Pay button |
| `before_window` | Too early. Check-in window is 7:00–20:00 UTC on check-in day. | "Check-in opens at {windowOpensAt}" |
| `after_window` | Too late. Past the check-in window. | "Check-in window has closed" |
| `already_checked_in` | Guest already checked in. | Show check-in confirmation |
| `cancelled` | Booking was cancelled. | "This booking has been cancelled" |

**Key rule:** Check-in requires at least one payment (`paid_amount > 0`), but does NOT require full payment.

---

## Complete Frontend Flow (Pseudocode)

```
function onPayButtonTapped(booking) {
  // 1. Calculate balance
  const balance = booking.totalAmount - booking.paidAmount;
  if (balance <= 0) return showAlreadyPaid();

  // 2. Initiate
  const idempotencyKey = generateUUIDv4();
  const { transactionId, moyasarForm } = await api.post('/guest/payments/initiate', {
    actionPerformerURDD: userUrdd,
    bookingId: booking.bookingId,
    amount: balance,
    currency: booking.currency,
    methods: ['creditcard'],
  }, { headers: { 'Idempotency-Key': idempotencyKey } });

  // 3. Show Moyasar form
  const moyasarPaymentId = await showMoyasarForm(moyasarForm);
  if (!moyasarPaymentId) return showPaymentCancelled();

  // 4. Confirm
  const confirmKey = generateUUIDv4();
  const result = await api.post('/guest/payments/confirm', {
    actionPerformerURDD: userUrdd,
    transactionId: transactionId,
    moyasarPaymentId: moyasarPaymentId,
  }, { headers: { 'Idempotency-Key': confirmKey } });

  // 5. Update UI
  if (result.balanceDueRemaining > 0) {
    showPartialPaymentSuccess(result);
  } else {
    showFullPaymentSuccess(result);
  }

  refreshBookingDetails(booking.bookingId);
}
```

---

## Idempotency Key Rules

| Rule | Details |
|---|---|
| **Generate a new UUID v4 per payment attempt** | Each tap of "Pay" should generate a fresh key. |
| **Use a different key for initiate vs confirm** | Initiate and confirm are separate operations. |
| **Retry with the same key on network failure** | If the call times out, retry with the **same** key. The backend returns the cached response instead of creating a duplicate. |
| **Never reuse a key across different bookings** | One key = one operation on one booking. |

```js
// Good: retry with same key
const key = generateUUIDv4();
let result;
for (let attempt = 0; attempt < 3; attempt++) {
  try {
    result = await api.post('/guest/payments/initiate', body, {
      headers: { 'Idempotency-Key': key }
    });
    break;
  } catch (err) {
    if (err.status >= 500) continue; // retry
    throw err; // 4xx = don't retry
  }
}
```

---

## Webhook Safety Net

If the guest's app crashes or loses connection after paying on the Moyasar form but before calling `/confirm`, the backend has a webhook that catches it:

- Moyasar automatically POSTs to the `callbackUrl` included in the form config
- The backend verifies and completes the payment
- Next time the guest opens the app and views the booking, `paid_amount` will already be updated

**The frontend does not need to handle the webhook.** It is a backend-only safety net. But the frontend should always try to call `/confirm` — don't rely on the webhook as the primary path.

---

## Testing with Sandbox Keys

When the backend is configured with Moyasar test keys (`pk_test_...` / `sk_test_...`), use these test cards:

| Card Number | Network | Result |
|---|---|---|
| `4111111111111111` | Visa | Success |
| `5111111111111118` | Mastercard | Success |
| `4000000000000002` | Visa | Declined |

Use any future expiry (e.g., `12/2028`) and any 3-digit CVV (e.g., `123`).

---

## Change Log

| Date | Change |
|---|---|
| 2026-07-08 | Initial document |
