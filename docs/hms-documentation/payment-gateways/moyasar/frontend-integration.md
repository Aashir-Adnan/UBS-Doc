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
| `amount` | `number` | Yes | Amount in major units (e.g., `540.00` not `54000`). Must be ≤ the balance due. **First payment** must be ≥ 20% of `total_amount` (minimum downpayment). Subsequent payments can be any amount up to the remaining balance. |
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
    "callbackUrl": "https://api.dev-hms.gobizzi.com/webhooks/payments/callback/moyasar?txId=88421",
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
| 422 | `amount cannot exceed the booking balance due (300)` | Show the correct balance due and let the guest retry with a lower amount. |
| 422 | `First payment must be at least 20% of the total (300 SAR)` | Show the minimum downpayment amount. The first payment on a booking must be ≥ 20% of the total. |
| 422 | `currency does not match the booking currency` | Bug — use the currency from the booking object. |
| 409 | `This booking is already fully paid` | Show "Already paid" and refresh booking details. |
| 503 | `Payments are temporarily unavailable` | Show a retry message. Backend Moyasar keys are not configured. |

---

## Step 2: Render the Moyasar Form

Use the `moyasarForm` config from Step 1 to render Moyasar's hosted payment form. The guest enters their card details directly into Moyasar's form — **no card data should touch your app or HMS servers**.

### Loading Moyasar Assets

**Always use the URLs from `moyasarForm.formAssets`** returned by the API — never hardcode version numbers.

```js
// Load CSS
const link = document.createElement('link');
link.rel = 'stylesheet';
link.href = moyasarForm.formAssets.css;
document.head.appendChild(link);

// Load JS
const script = document.createElement('script');
script.src = moyasarForm.formAssets.script;
script.onload = () => initMoyasarForm();
script.onerror = () => showError('Payment form failed to load');
document.body.appendChild(script);
```

### Web (JavaScript)

```html
<div id="moyasar-form"></div>

<script>
  function initMoyasarForm() {
    // Get a reference to the container element
    const container = document.getElementById('moyasar-form');

    Moyasar.init({
      element: container,                  // DOM element (not a selector string)
      amount: moyasarForm.amount,          // minor units (e.g. 54000 halalas)
      currency: moyasarForm.currency,      // e.g. "SAR"
      description: moyasarForm.description,
      publishable_api_key: moyasarForm.publishableApiKey,
      callback_url: moyasarForm.callbackUrl,
      methods: moyasarForm.methods,        // e.g. ["creditcard"]
      supported_networks: moyasarForm.supportedNetworks,
      metadata: moyasarForm.metadata,
      on_completed: function(payment) {
        // payment.id is the moyasarPaymentId — send to Step 3
        confirmPayment(transactionId, payment.id);
      },
      on_failure: function(error) {
        // Show error to guest, offer retry
        showPaymentError(error);
      }
    });
  }
</script>
```

:::tip Important notes on rendering
- **Pass a DOM element** to `element`, not a CSS selector string — Moyasar may fail with `Element: null is not a valid element` if the selector doesn't resolve.
- **Ensure the container is visible** (`display: block`) before calling `Moyasar.init()`.
- **Add a small delay** (50ms) between loading the script and calling init to let the DOM settle.
- The form includes a **3D Secure step** — after the guest submits their card, Moyasar redirects to a 3DS authentication page (or an emulator in sandbox mode). After completing 3DS, Moyasar calls `on_completed` or redirects to `callback_url`.
:::

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

### 3D Secure Flow

After the guest submits card details, Moyasar may redirect to a **3D Secure authentication page**:

1. **Sandbox:** Shows an ACS emulator page at `api.moyasar.com/.../acs_emulator` — click "Complete" to simulate authentication
2. **Production:** Shows the real bank's 3DS page (OTP or biometric)

After 3DS completes:
- **If `on_completed` fires:** You receive `payment.id` directly in JavaScript — proceed to Step 3
- **If the browser redirects to `callback_url`:** Extract the `id` and `status` from the URL query parameters and call Step 3

```js
// Handle callback_url redirect (web apps)
const params = new URLSearchParams(window.location.search);
const moyasarPaymentId = params.get('id');
const status = params.get('status');

if (moyasarPaymentId && status === 'paid') {
  confirmPayment(transactionId, moyasarPaymentId);
}
```

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

## Partial Payments

The system supports paying a booking in multiple installments. The guest can choose how much to pay each time, subject to these rules:

### Payment Amount Rules

| Rule | Details |
|---|---|
| **First payment** | Must be **at least 20%** of `total_amount` (minimum downpayment). |
| **Subsequent payments** | Any amount from `0.01` up to the remaining balance. |
| **Maximum** | Cannot exceed the current balance due (`total_amount - paid_amount`). |

### Example: 1500 SAR booking paid in three installments

| Step | Action | Amount | `paid_amount` | Balance |
|---|---|---|---|---|
| 1 | Booking created | — | 0 | 1500 |
| 2 | First payment (20% minimum = 300) | 300 | 300 | 1200 |
| 3 | Second payment (any amount) | 600 | 900 | 600 |
| 4 | Final payment (remaining balance) | 600 | 1500 | 0 |

### Frontend Logic

```js
// Determine what to show on the booking detail screen
function getPaymentAction(booking) {
  const balance = booking.totalAmount - booking.paidAmount;

  if (balance <= 0) {
    return { action: 'none', label: 'Fully Paid' };
  }

  const isFirstPayment = booking.paidAmount === 0;
  const minAmount = isFirstPayment
    ? Math.ceil(booking.totalAmount * 0.20 * 100) / 100  // 20% minimum
    : 0.01;

  return {
    action: 'pay',
    label: isFirstPayment
      ? `Pay (min ${minAmount} ${booking.currency})`
      : `Pay remaining ${balance} ${booking.currency}`,
    minAmount,
    maxAmount: balance,
    defaultAmount: balance,  // default to full balance
  };
}
```

### Amount Input UI

Show the guest an amount input field with:
- **Default value:** full balance due
- **Minimum:** 20% of total (first payment) or any amount (subsequent)
- **Maximum:** current balance due
- **Quick buttons:** "Full Balance", "50%", "20% (min)" for convenience

```
┌─────────────────────────────────┐
│  Payment Amount (SAR)           │
│  ┌───────────────────────────┐  │
│  │ 300.00                    │  │  ← editable input
│  └───────────────────────────┘  │
│  [Full Balance] [50%] [20% min] │  ← quick-select buttons
│                                 │
│  Min downpayment: 300 SAR       │  ← hint (first payment only)
│                                 │
│  [Pay 300.00 SAR]               │  ← submit button
└─────────────────────────────────┘
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

When `reason` is `before_window` or `after_window`, the response also includes the check-in time window:

```json
{
  "eligible": false,
  "reason": "before_window",
  "balanceDue": 0,
  "currency": "SAR",
  "windowOpensAt": "2026-06-10T07:00:00.000Z",
  "windowClosesAt": "2026-06-10T20:00:00.000Z"
}
```

| `reason` | Meaning | What to show |
|---|---|---|
| `not_paid` | `paid_amount` is 0. At least one payment required. | "Please make a payment before checking in." + Pay button |
| `before_window` | Too early. Check-in window is 7:00–20:00 UTC on check-in day. | "Check-in opens at `windowOpensAt`" (use `windowOpensAt` from the response) |
| `after_window` | Too late. Past the check-in window. | "Check-in window has closed" |
| `already_checked_in` | Guest already checked in. | Show check-in confirmation |
| `cancelled` | Booking was cancelled. | "This booking has been cancelled" |

**Key rule:** Check-in requires at least one payment (`paid_amount > 0`), but does NOT require full payment.

---

## Complete Frontend Flow (Pseudocode)

```
function onPayButtonTapped(booking, chosenAmount) {
  // 1. Validate amount
  const balance = booking.totalAmount - booking.paidAmount;
  if (balance <= 0) return showAlreadyPaid();

  const isFirstPayment = booking.paidAmount === 0;
  const minAmount = isFirstPayment
    ? Math.ceil(booking.totalAmount * 0.20 * 100) / 100
    : 0.01;

  if (chosenAmount < minAmount) {
    return showError(`Minimum payment is ${minAmount} ${booking.currency}`);
  }
  if (chosenAmount > balance) {
    return showError(`Cannot exceed balance of ${balance} ${booking.currency}`);
  }

  // 2. Initiate with chosen amount
  const idempotencyKey = generateUUIDv4();
  const { transactionId, moyasarForm } = await api.post('/guest/payments/initiate', {
    actionPerformerURDD: userUrdd,
    bookingId: booking.bookingId,
    amount: chosenAmount,
    currency: booking.currency,
    methods: ['creditcard'],
  }, { headers: { 'Idempotency-Key': idempotencyKey } });

  // 3. Show Moyasar form (renders card input)
  const moyasarPaymentId = await showMoyasarForm(moyasarForm);
  if (!moyasarPaymentId) return showPaymentCancelled();

  // 4. Confirm payment with Moyasar payment ID
  const confirmKey = generateUUIDv4();
  const result = await api.post('/guest/payments/confirm', {
    actionPerformerURDD: userUrdd,
    transactionId: transactionId,
    moyasarPaymentId: moyasarPaymentId,
  }, { headers: { 'Idempotency-Key': confirmKey } });

  // 5. Update UI based on remaining balance
  if (result.balanceDueRemaining > 0) {
    showPartialPaymentSuccess(result);
    // Show "Pay remaining X" button for next payment
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
| 2026-07-09 | Added partial payment support with 20% minimum downpayment, amount input UI, 3DS flow details, formAssets-based asset loading |
| 2026-07-08 | Initial document |
