# Saved Cards

Guests can save a card during payment and use it for future bookings. The backend stores a reusable Moyasar token and safe metadata — the app never sees card numbers or CVVs.

---

## How It Works

```
                Save flow                           Charge flow

   Guest pays with new card                Guest pays with saved card
        + saveCard: true                      + savedCardId: 4412
              |                                      |
              v                                      v
     Moyasar hosted form                   Backend creates Moyasar
     (normal card entry)                   payment from token
              |                            (server-side, secret key)
              v                                      |
     /confirm extracts                     3DS required?
     source.token from                     ├─ Yes → threeDSecureUrl
     Moyasar response                      │   (guest opens WebView)
              |                            │   → /confirm as usual
              v                            └─ No → status: "paid"
     Backend stores token                      → /confirm immediately
     in user_payment_methods
              |
              v
     savedCard echoed in
     confirm response
```

---

## Data Model — SavedCard

The app receives this shape when listing or saving cards. The Moyasar token is **never** returned to the app — the app references a saved card only by its HMS `id`.

```json
{
  "id": 4412,
  "brand": "visa",
  "last4": "4242",
  "expMonth": 12,
  "expYear": 2028,
  "holder": "AHMED AL-RASHID",
  "isDefault": true,
  "createdAt": "2026-07-01T10:00:00.000Z"
}
```

| Field | Type | Description |
|---|---|---|
| `id` | `number` | HMS saved card ID. Use this for delete and charge operations. |
| `brand` | `string` | Card brand: `visa`, `mastercard`, `mada`, `amex`. |
| `last4` | `string` | Last 4 digits of the card number. |
| `expMonth` | `number` | Expiry month (1-12). |
| `expYear` | `number` | Expiry year (4 digits). |
| `holder` | `string` | Cardholder name as returned by Moyasar. |
| `isDefault` | `boolean` | Whether this is the guest's default card. First saved card is automatically default. |
| `createdAt` | `string` | ISO 8601 timestamp. |

---

## 1. Save a Card While Paying

Extend the normal payment flow by adding `saveCard: true` to the initiate request.

### Request Change (Initiate)

Add one optional field to `POST /api/guest/payments/initiate`:

| Field | Type | Required | Description |
|---|---|---|---|
| `saveCard` | `boolean` | No | When `true`, tokenize the card on this payment and store it for the guest after the charge succeeds. Ignored for Apple Pay / STC Pay. Default `false`. Mutually exclusive with `savedCardId`. |

```json
{
  "actionPerformerURDD": 130,
  "bookingId": 12345,
  "amount": 540.00,
  "currency": "SAR",
  "saveCard": true
}
```

### What Happens

1. Backend passes `save_card: true` in the Moyasar form config (returned in `moyasarForm`)
2. Guest completes payment normally via the hosted form
3. On **confirm** (or webhook), the backend reads `payment.source.token` from Moyasar's verified response
4. Backend inserts a row into `user_payment_methods` with the token + safe metadata
5. Token is deduplicated — paying twice with the same card doesn't create duplicate entries

### Response Change (Confirm)

When `saveCard` was requested and the card was successfully saved, the confirm response includes a `savedCard` object:

```json
{
  "transactionId": 88421,
  "bookingId": 12345,
  "paymentStatus": "completed",
  "balanceDueRemaining": 0,
  "savedCard": {
    "id": 4412,
    "brand": "visa",
    "last4": "4242",
    "expMonth": 12,
    "expYear": 2028,
    "holder": "AHMED AL-RASHID",
    "isDefault": true
  }
}
```

If the card save fails (non-fatal), the payment still succeeds — `savedCard` is simply absent from the response.

---

## 2. List Saved Cards

**GET** `/api/guest/payments/methods`

### Request

**Headers:**
- `accesstoken: <JWT>` (required)

**Encrypted Body:**

```json
{ "actionPerformerURDD": 130 }
```

### Response

```json
{
  "methods": [
    {
      "id": 4412,
      "brand": "visa",
      "last4": "4242",
      "expMonth": 12,
      "expYear": 2028,
      "holder": "AHMED AL-RASHID",
      "isDefault": true,
      "createdAt": "2026-07-01T10:00:00.000Z"
    },
    {
      "id": 4419,
      "brand": "mada",
      "last4": "0553",
      "expMonth": 3,
      "expYear": 2027,
      "holder": "AHMED AL-RASHID",
      "isDefault": false,
      "createdAt": "2026-07-08T09:12:00.000Z"
    }
  ]
}
```

Empty list returns `{ "methods": [] }`.

---

## 3. Delete a Saved Card

**DELETE** `/api/guest/payments/methods?id={savedCardId}`

### Request

**Headers:**
- `accesstoken: <JWT>` (required)

**Encrypted Body:**

```json
{
  "actionPerformerURDD": 130,
  "id": 4412
}
```

The `id` can be sent in the encrypted body or as a query parameter.

### Response

```json
{ "id": 4412, "deleted": true }
```

### Errors

| HTTP | `error.details` | Meaning |
|---|---|---|
| 404 | `Saved card not found` | Wrong `id` or card not owned by this guest. |
| 409 | `Cannot delete the card mid-payment` | A payment using this card is currently in flight. |

---

## 4. Pay with a Saved Card

Extend `POST /api/guest/payments/initiate` with `savedCardId` to charge an existing token instead of showing a new-card form.

### Request Change (Initiate)

| Field | Type | Required | Description |
|---|---|---|---|
| `savedCardId` | `number` | No | Charge this saved card (HMS `SavedCard.id`) instead of showing the form. Mutually exclusive with `saveCard`. All other rules are unchanged (amount ≥ 20% first payment, ≤ balance due, currency match). |

```json
{
  "actionPerformerURDD": 130,
  "bookingId": 12345,
  "amount": 540.00,
  "currency": "SAR",
  "savedCardId": 4412
}
```

### Response

Because there is **no card form to render**, the response shape is different. The backend creates the Moyasar payment server-side using the stored token and returns the outcome:

**A) 3D Secure required** (most common for token charges):

```json
{
  "transactionId": 88452,
  "savedCardPayment": {
    "status": "initiated",
    "threeDSecureUrl": "https://api.moyasar.com/v1/payments/.../3ds/authenticate?..."
  }
}
```

**B) No 3DS needed** (charged directly):

```json
{
  "transactionId": 88452,
  "savedCardPayment": {
    "status": "paid",
    "moyasarPaymentId": "84d99c92-3fbe-4f12-b6a8-22e2dccbf9e3"
  }
}
```

### App Handling

- **Case A (3DS):** Open `threeDSecureUrl` in a WebView. After the guest authenticates, Moyasar redirects to the callback URL. Extract `id` + `status` from the redirect URL, then call **`POST /guest/payments/confirm`** with `transactionId` + `moyasarPaymentId`.
- **Case B (direct):** Call **`POST /guest/payments/confirm`** immediately with the returned `moyasarPaymentId`.

The `/confirm` endpoint is unchanged — it verifies and finalizes as usual.

### Errors

| HTTP | `error.details` | Meaning |
|---|---|---|
| 404 | `Saved card not found` | Wrong `savedCardId` or not owned by this guest. |
| 422 | `Saved card has expired` | Card past its `expMonth`/`expYear`. Prompt the guest to add a new card. |
| 402 | `Card was declined` | The bank declined the token charge. |
| 422 | `saveCard and savedCardId are mutually exclusive` | Cannot use both flags in the same request. |

---

## Frontend Flow Summary

```
Booking payment step / booking detail "Pay":

  1. GET  /guest/payments/methods
     → Show saved cards + "New card" option + Apple Pay

  2a. New card path:
      POST /initiate { bookingId, amount, saveCard? }
      → moyasarForm → Render SDK → /confirm

  2b. Saved card path:
      POST /initiate { bookingId, amount, savedCardId }
      → savedCardPayment.status == "paid"  → /confirm immediately
      → savedCardPayment.status == "initiated" → open threeDSecureUrl (WebView) → /confirm

  3. Manage cards:
      DELETE /guest/payments/methods?id={id}
```

### Payment Method Selector UI

```
┌─────────────────────────────────────────┐
│  Choose payment method                  │
│                                         │
│  ┌─────────────────────────────────┐    │
│  │ ★ Visa ····4242  exp 12/28     │ ←─ default
│  └─────────────────────────────────┘    │
│  ┌─────────────────────────────────┐    │
│  │   Mada ····0553  exp 03/27     │    │
│  └─────────────────────────────────┘    │
│  ┌─────────────────────────────────┐    │
│  │   + Add new card               │    │
│  └─────────────────────────────────┘    │
│                                         │
│  [  ] Save this card for future use     │ ←─ only for "Add new card"
│                                         │
│  [ Pay 540.00 SAR ]                     │
└─────────────────────────────────────────┘
```

---

## Security

- **PCI compliance:** The app never sees PAN/CVV. Only safe metadata is stored and returned (`brand`, `last4`, `expMonth`, `expYear`, `holder`).
- **Token storage:** The Moyasar token is stored in `user_payment_methods.payment_details` and never returned to the app. The app references cards only by HMS `id`.
- **Ownership scoping:** Every card is scoped to the guest's URDD + tenant. One guest can never reference another guest's `savedCardId`.
- **Server-side charging:** Token charges use the Moyasar secret key and run entirely server-side. The app only receives the 3DS URL or the final result.

---

## Idempotency

- `POST /initiate` with `savedCardId` requires an `Idempotency-Key` header (same rules as normal initiate). Replaying the same key returns the cached result instead of double-charging.
- `DELETE /guest/payments/methods` is idempotent — deleting an already-deleted card returns 404.

---

## Database

The saved card data is stored in the existing `user_payment_methods` table:

| Column | Type | Description |
|---|---|---|
| `user_payment_method_id` | `INT` PK | HMS saved card ID (`SavedCard.id`). |
| `tenant_id` | `INT` | Tenant the card is scoped to. |
| `urdd_id` | `INT` | Guest URDD that owns the card. |
| `payment_details` | `LONGTEXT` | Encrypted Moyasar token (never returned to app). |
| `brand` | `VARCHAR(30)` | Card brand (visa, mastercard, mada, amex). |
| `last4` | `VARCHAR(4)` | Last 4 digits. |
| `exp_month` | `TINYINT` | Expiry month. |
| `exp_year` | `SMALLINT` | Expiry year. |
| `holder` | `VARCHAR(255)` | Cardholder name. |
| `is_default` | `TINYINT` | 1 = default card. |
| `status` | `ENUM` | `active` / `inactive` (soft delete). |

---

## Source Files

| File | Purpose |
|---|---|
| `Src/HelperFunctions/PreProcessingFunctions/Guest/guestMoyasarPayments.js` | All saved card logic: `persistSavedCard`, `loadSavedCard`, `listSavedCards`, `deleteSavedCard`, saved card charge branch in `initiateGuestPayment` |
| `Src/Apis/ProjectSpecificApis/GuestSpecificApis/GuestPaymentsMethods/` | API object for list + delete endpoints |
| `Src/Routes/moyasarWebhook.js` | Webhook — also persists saved card when `saveCard` was flagged |
| `Services/Integrations/CronJobs/paymentReconciliationCron.js` | Reconciliation cron — also persists saved card on stale transaction completion |
| `data/migrations_completed/20260709_1_saved_cards_columns.sql` | Migration adding card metadata columns |

---

## Change Log

| Date | Change |
|---|---|
| 2026-07-09 | Initial document |
