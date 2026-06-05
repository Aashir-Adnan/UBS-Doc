# Moyasar Setup

How to obtain API keys and configure the HMS backend for Moyasar payments.

---

## Getting API Keys

1. Go to [dashboard.moyasar.com](https://dashboard.moyasar.com)
2. Sign in or create a merchant account
3. Navigate to **Settings** → **API Keys**
4. You'll see two key types:

| Key | Prefix | Purpose |
|---|---|---|
| **Publishable Key** | `pk_test_` / `pk_live_` | Sent to frontend for Moyasar hosted form. Safe for client code. |
| **Secret Key** | `sk_test_` / `sk_live_` | Backend-only. Used to verify payments via Moyasar API. **Never expose.** |

**Important:** New secret keys are shown only once. Store them securely immediately after generation.

---

## Sandbox vs Live

| Mode | Key Prefix | Behavior |
|---|---|---|
| **Test/Sandbox** | `pk_test_` / `sk_test_` | No real charges. Use test card numbers. |
| **Live/Production** | `pk_live_` / `sk_live_` | Real money. Connected to banking networks. |

Use test keys for local development and staging. Switch to live keys only in production.

---

## Environment Variables

Add these to your `.env` file:

```env
# Required
MOYASAR_PUBLISHABLE_API_KEY=pk_test_YOUR_KEY_HERE
MOYASAR_SECRET_KEY=sk_test_YOUR_KEY_HERE

# Optional
MOYASAR_PROVIDER_ID=           # payment_providers row ID if you have one
MOYASAR_MPF_VERSION=1.15.8    # Moyasar hosted form JS version
HMS_PUBLIC_API_BASE=https://api.dev-hms.gobizzi.com  # Public URL for webhook callbacks
```

The backend reads these with fallbacks:
- `MOYASAR_PUBLISHABLE_API_KEY` or `MOYASAR_PUBLISHABLE_KEY`
- `MOYASAR_SECRET_KEY` or `MOYASAR_SECRET_API_KEY`

---

## Authentication with Moyasar API

All server-to-server calls use **HTTP Basic Auth**:
- Username: your secret key (e.g. `sk_test_...`)
- Password: empty string

```bash
curl https://api.moyasar.com/v1/payments \
  -u sk_test_YOUR_KEY:
```

All calls must be over HTTPS.

---

## Test Card Numbers

With test keys, use these cards:

| Card Number | Network | Result |
|---|---|---|
| `4111111111111111` | Visa | Success |
| `5111111111111118` | Mastercard | Success |
| `4000000000000002` | Visa | Declined |

Use any future expiry date (e.g. `12/2028`) and any 3-digit CVV (e.g. `123`).

---

## Verifying Setup

After adding keys to `.env`, restart the server and call the initiate endpoint:

```
POST /api/guest/payments/initiate
Header: Idempotency-Key: <any-uuid-v4>
Body: { "bookingId": <valid_booking_id>, "amount": 100, "currency": "SAR" }
```

If configured correctly, the response will include `moyasarForm.publishableApiKey` starting with `pk_test_`.
