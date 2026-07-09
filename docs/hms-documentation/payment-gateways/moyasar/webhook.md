# Moyasar Webhook

Handles asynchronous payment confirmations from Moyasar — a safety net for cases where the client drops off after payment but before calling `/confirm`.

---

## Endpoint

**POST** `/webhooks/payments/callback/moyasar?txId={transactionId}`

This URL is automatically included as `callbackUrl` in the Moyasar form config returned by the initiate endpoint.

---

## How It Works

1. After a guest completes payment, Moyasar POSTs the payment object to this URL
2. The webhook extracts `txId` from the query string and `id` (Moyasar payment ID) from the body
3. Verifies the payment server-to-server by calling `GET /v1/payments/{id}` with the secret key
4. If verified as `paid`/`completed`/`captured`:
   - Updates `transactions.payment_status` to `completed`
   - Increments `bookings.paid_amount`
5. Always returns HTTP 200 to Moyasar (to prevent retries)

---

## Moyasar Callback Body

Moyasar sends the full payment object:

```json
{
  "id": "84d99c92-3fbe-4f12-b6a8-22e2dccbf9e3",
  "status": "paid",
  "amount": 54000,
  "fee": 1350,
  "currency": "SAR",
  "description": "[HMS:88421] Hotel Name - 3 nights",
  "metadata": {
    "hmsTransactionId": 88421
  },
  "source": {
    "type": "creditcard",
    "company": "visa",
    "name": "John Doe",
    "number": "XXXX-XXXX-XXXX-1111"
  },
  "callback_url": "https://api.dev-hms.gobizzi.com/webhooks/payments/callback/moyasar?txId=88421",
  "created_at": "2026-06-05T12:00:00.000Z",
  "updated_at": "2026-06-05T12:00:05.000Z"
}
```

---

## Security

Moyasar does **not** sign webhook requests (unlike Stripe's HMAC signatures). Instead, the webhook:

1. **Never trusts the callback body directly** for payment status
2. **Always verifies** by calling Moyasar's API: `GET /v1/payments/{id}` with the secret key
3. **Validates amount** — the verified amount must match the initiated transaction amount

This server-to-server verification prevents spoofed webhook calls from marking payments as completed.

---

## Idempotency

The webhook is idempotent:
- If the transaction is already `completed`, returns `{ processed: true, reason: "already_completed" }`
- Moyasar may retry the callback if it doesn't receive a 200 — safe to receive multiple times

---

## Response Format

The webhook always returns 200 with a JSON body:

```json
{ "received": true, "processed": true }
```

Or on failure:

```json
{ "received": true, "processed": false, "reason": "verification_failed" }
```

| Reason | Description |
|---|---|
| `missing_txId` | No `txId` query parameter. |
| `not_configured` | `MOYASAR_SECRET_KEY` not set. |
| `transaction_not_found` | Transaction ID doesn't exist. |
| `already_completed` | Transaction already settled (idempotent). |
| `no_payment_id` | No Moyasar payment ID in callback body. |
| `verification_failed` | Could not verify with Moyasar API. |
| `not_paid` | Payment not in a succeeded state. |
| `amount_mismatch` | Verified amount doesn't match transaction. |

---

## Webhook vs Confirm

Both accomplish the same thing — marking a payment as completed. The difference:

| | `/guest/payments/confirm` | Webhook |
|---|---|---|
| **Trigger** | Client calls after Moyasar returns | Moyasar calls automatically |
| **Auth** | Guest JWT required | No auth (verified via Moyasar API) |
| **When to use** | Primary path — client confirms immediately | Backup — catches dropped clients |
| **Race condition** | Both are idempotent — whoever runs first wins, second is a no-op |

---

## Local Testing

For local development, Moyasar can't reach `localhost`. Options:

1. **Skip the webhook** — rely on the `/confirm` endpoint (the primary path)
2. **Use ngrok** — `ngrok http 3000` gives you a public URL, set `HMS_PUBLIC_API_BASE` to that URL
3. **Simulate manually** — after an initiate, call the webhook yourself:
   ```bash
   curl -X POST "http://localhost:3000/webhooks/payments/callback/moyasar?txId=88421" \
     -H "Content-Type: application/json" \
     -d '{"id": "<moyasar_payment_id>", "status": "paid", "amount": 54000}'
   ```
   The webhook will still verify with Moyasar's API, so the payment must actually exist.
