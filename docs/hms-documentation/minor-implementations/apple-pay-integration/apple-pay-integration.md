---
sidebar_position: 4
---

# Apple Pay vs Card Payment — Frontend Integration Guide

This document covers how Apple Pay differs from the standard credit card payment flow when using Moyasar, and what the frontend needs to do differently for each.

---

## Flow Comparison

Both Apple Pay and card payments use the **same backend APIs** (`/initiate` and `/confirm`). The only difference is how the frontend renders the Moyasar form and what `methods` value is sent.

```
                    Card Payment                      Apple Pay
                    ─────────────                     ──────────
Step 1: Initiate    POST /guest/payments/initiate     POST /guest/payments/initiate
                    methods: ["creditcard"]            methods: ["applepay"]

Step 2: Render      Moyasar card input form            Apple Pay button
                    (card number, expiry, CVV)         (Touch ID / Face ID sheet)

Step 3: 3DS         Bank 3DS authentication page       No 3DS (Apple handles auth)
                    → redirect or on_completed         → on_completed fires directly

Step 4: Confirm     POST /guest/payments/confirm       POST /guest/payments/confirm
                    (same for both)                    (same for both)
```

---

## Step 1: Initiate Payment

The initiate request is identical for both methods. The only difference is the `methods` array.

### Request

```
POST /api/guest/payments/initiate
```

**Headers:**

| Header | Value | Required |
|---|---|---|
| `accesstoken` | Guest JWT | Yes |
| `Idempotency-Key` | UUID v4 | Yes |

**Encrypted Body — Card Payment:**

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

**Encrypted Body — Apple Pay:**

```json
{
  "actionPerformerURDD": 130,
  "bookingId": 12345,
  "amount": 540.00,
  "currency": "SAR",
  "methods": ["applepay"],
  "supportedNetworks": ["mada", "visa", "mastercard"],
  "successUrl": "myapp://payment/success",
  "failureUrl": "myapp://payment/failure"
}
```

**Encrypted Body — Both Methods (let the guest choose):**

```json
{
  "actionPerformerURDD": 130,
  "bookingId": 12345,
  "amount": 540.00,
  "currency": "SAR",
  "methods": ["creditcard", "applepay"],
  "supportedNetworks": ["mada", "visa", "mastercard"]
}
```

| Field | Type | Required | Description |
|---|---|---|---|
| `methods` | `string[]` | No | Payment methods to offer. Options: `"creditcard"`, `"applepay"`, `"stcpay"`. Defaults to `["creditcard"]`. Pass multiple to show both options. |
| `supportedNetworks` | `string[]` | No | Card networks. Applies to both card and Apple Pay. |

All other fields (`bookingId`, `amount`, `currency`, etc.) are the same.

### Response

The response is identical regardless of `methods`. The `moyasarForm` config is returned:

```json
{
  "transactionId": 88421,
  "moyasarForm": {
    "amount": 54000,
    "currency": "SAR",
    "description": "[HMS:88421] Hotel Name - 3 nights",
    "publishableApiKey": "pk_test_...",
    "callbackUrl": "https://api.dev-hms.gobizzi.com/webhooks/payments/callback/moyasar?txId=88421",
    "methods": ["applepay"],
    "supportedNetworks": ["mada", "visa", "mastercard"],
    "metadata": { "hmsTransactionId": 88421 },
    "formAssets": {
      "css": "https://cdn.moyasar.com/mpf/1.15.8/moyasar.css",
      "script": "https://cdn.moyasar.com/mpf/1.15.8/moyasar.js"
    }
  }
}
```

---

## Step 2: Render the Payment Form

### Card Payment

Renders a card input form (card number, expiry, CVV):

```js
Moyasar.init({
  element: container,
  amount: moyasarForm.amount,
  currency: moyasarForm.currency,
  description: moyasarForm.description,
  publishable_api_key: moyasarForm.publishableApiKey,
  callback_url: moyasarForm.callbackUrl,
  methods: ['creditcard'],
  supported_networks: moyasarForm.supportedNetworks,
  metadata: moyasarForm.metadata,
  on_completed: function(payment) {
    confirmPayment(transactionId, payment.id);
  },
});
```

### Apple Pay

Renders an Apple Pay button. When tapped, the native Apple Pay sheet appears with Touch ID / Face ID:

```js
Moyasar.init({
  element: container,
  amount: moyasarForm.amount,
  currency: moyasarForm.currency,
  description: moyasarForm.description,
  publishable_api_key: moyasarForm.publishableApiKey,
  callback_url: moyasarForm.callbackUrl,
  methods: ['applepay'],
  supported_networks: moyasarForm.supportedNetworks,
  metadata: moyasarForm.metadata,
  apple_pay: {
    country: 'SA',
    label: moyasarForm.description,
    validate_merchant_url: 'https://api.moyasar.com/v1/applepay/initiate',
  },
  on_completed: function(payment) {
    confirmPayment(transactionId, payment.id);
  },
});
```

### Both Methods (guest chooses)

```js
Moyasar.init({
  element: container,
  amount: moyasarForm.amount,
  currency: moyasarForm.currency,
  description: moyasarForm.description,
  publishable_api_key: moyasarForm.publishableApiKey,
  callback_url: moyasarForm.callbackUrl,
  methods: ['creditcard', 'applepay'],
  supported_networks: moyasarForm.supportedNetworks,
  metadata: moyasarForm.metadata,
  apple_pay: {
    country: 'SA',
    label: moyasarForm.description,
    validate_merchant_url: 'https://api.moyasar.com/v1/applepay/initiate',
  },
  on_completed: function(payment) {
    confirmPayment(transactionId, payment.id);
  },
});
```

When both methods are passed, Moyasar renders a card form AND an Apple Pay button. The Apple Pay button only appears on supported Apple devices — on non-Apple devices, only the card form is shown.

### Key Differences in Rendering

| Aspect | Card Payment | Apple Pay |
|---|---|---|
| `methods` | `['creditcard']` | `['applepay']` |
| `apple_pay` config | Not needed | **Required** — must include `country`, `label`, `validate_merchant_url` |
| UI rendered | Card number, expiry, CVV fields | Apple Pay button |
| 3DS step | Yes — redirects to bank's 3DS page | No — Apple handles authentication via Touch ID / Face ID |
| Device support | All devices | Apple devices with T1+ security chip only |

### `apple_pay` Configuration

| Key | Type | Required | Description |
|---|---|---|---|
| `country` | `string` | Yes | ISO 3166 country code for the merchant (e.g., `"SA"` for Saudi Arabia) |
| `label` | `string` | Yes | Merchant label shown on the Apple Pay sheet. Use the `moyasarForm.description` or your hotel/brand name. |
| `validate_merchant_url` | `string` | Yes | Always `"https://api.moyasar.com/v1/applepay/initiate"` — Moyasar handles merchant validation. |

---

## Step 3: Authentication

### Card Payment

After the guest submits card details, Moyasar redirects to a **3D Secure** page:

1. Bank's 3DS page loads (OTP or biometric)
2. After authentication, either `on_completed` fires or the browser redirects to `callback_url`
3. Extract `payment.id` and proceed to confirm

### Apple Pay

No 3DS redirect. The authentication flow is:

1. Guest taps the Apple Pay button
2. The native Apple Pay sheet appears
3. Guest authenticates with **Touch ID or Face ID**
4. `on_completed` fires immediately with `payment.id`
5. Proceed to confirm

Apple Pay is faster because authentication happens natively — no redirect, no page load, no OTP.

---

## Step 4: Confirm Payment

**Identical for both methods.** The confirm endpoint doesn't care how the payment was made.

```
POST /api/guest/payments/confirm
```

**Encrypted Body:**

```json
{
  "actionPerformerURDD": 130,
  "transactionId": 88421,
  "moyasarPaymentId": "84d99c92-3fbe-4f12-b6a8-22e2dccbf9e3"
}
```

**Response:**

```json
{
  "transactionId": 88421,
  "bookingId": 12345,
  "paymentStatus": "completed",
  "balanceDueRemaining": 0
}
```

---

## Saving the Payment ID (`on_completed`)

For both methods, use `on_completed` to capture the Moyasar payment ID before calling confirm. This is especially important for Apple Pay since there is no `callback_url` redirect.

```js
Moyasar.init({
  // ... config ...
  on_completed: async function(payment) {
    // payment.id = Moyasar payment UUID
    // Save to backend immediately
    const confirmKey = generateUUIDv4();
    const result = await api.post('/guest/payments/confirm', {
      actionPerformerURDD: userUrdd,
      transactionId: storedTransactionId,
      moyasarPaymentId: payment.id,
    }, { headers: { 'Idempotency-Key': confirmKey } });

    if (result.balanceDueRemaining > 0) {
      showPartialPaymentSuccess(result);
    } else {
      showFullPaymentSuccess(result);
    }
  },
});
```

---

## Frontend Decision: Which Method to Show

```js
function getPaymentMethods() {
  // Check if Apple Pay is available on this device
  const isAppleDevice = /Mac|iPhone|iPad|iPod/.test(navigator.userAgent);
  const hasApplePay = window.ApplePaySession && ApplePaySession.canMakePayments();

  if (hasApplePay) {
    // Show both options — Apple Pay + card
    return ['applepay', 'creditcard'];
  }
  // Non-Apple device — card only
  return ['creditcard'];
}
```

Pass the result as `methods` in the initiate request. Moyasar automatically hides the Apple Pay button on unsupported devices, so passing `['creditcard', 'applepay']` is also safe — the button simply won't render on Android/Windows.

---

## Complete Flow Comparison

```
Card Payment Flow:
  1. POST /guest/payments/initiate  { methods: ["creditcard"] }
  2. Render card form (Moyasar.init with methods: ['creditcard'])
  3. Guest enters card → 3DS redirect → bank OTP
  4. on_completed fires with payment.id
  5. POST /guest/payments/confirm { moyasarPaymentId }
  6. Show success

Apple Pay Flow:
  1. POST /guest/payments/initiate  { methods: ["applepay"] }
  2. Render Apple Pay button (Moyasar.init with methods: ['applepay'], apple_pay config)
  3. Guest taps button → Face ID / Touch ID
  4. on_completed fires with payment.id
  5. POST /guest/payments/confirm { moyasarPaymentId }
  6. Show success
```

**Steps 1, 5, and 6 are identical.** Only steps 2-4 differ (what the guest sees and how they authenticate).

---

## Backend Changes Required

**None.** The backend already passes `methods` through to the Moyasar form config. Apple Pay payments are verified and confirmed through the same Moyasar API as card payments. The `moyasarPaymentId` returned is the same format regardless of payment method.

---

## Prerequisites

| Requirement | Who handles it | Status |
|---|---|---|
| Moyasar account with Apple Pay enabled | Moyasar dashboard | Check with Moyasar |
| Apple Developer account | Apple Developer portal | Required |
| APNs key uploaded to Firebase | Firebase Console | For push notifications (separate from Apple Pay) |
| Merchant validation | Moyasar (`validate_merchant_url`) | Handled by Moyasar |
| Apple Pay entitlement in iOS app | Xcode project settings | Add `com.apple.developer.in-app-payments` |
| Web domain verification (for Safari) | Host `apple-developer-merchantid-domain-association` file | Only needed for web Apple Pay |

---

## Testing

Apple Pay in sandbox mode works with Moyasar test keys (`pk_test_...`). Use the Apple Pay sandbox environment:

1. Sign in with an **Apple Sandbox Tester account** on the test device
2. Add a test card to Apple Wallet (Apple provides test card numbers for sandbox)
3. Use `pk_test_...` as the publishable key — Moyasar will process it in test mode

Apple Pay does **not** work in browser DevTools or emulators — you need a physical Apple device with the sandbox tester account.
