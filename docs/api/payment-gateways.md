---
sidebar_position: 5
---

# Payment Gateways

The framework supports three payment gateways: **Stripe**, **KuickPay**, and **Chase Bank**. All share a common two-step flow:

1. **Initiate** — creates a pending transaction and returns gateway-specific data
2. **Confirm** — finalises the transaction after the client-side payment step

---

## Stripe

### POST /api/StripeCreatePaymentIntent

Creates a Stripe `PaymentIntent`. The returned `client_secret` is used by the frontend Stripe SDK to confirm the payment.

**Authentication:** Requires `encryptedRequest` + `accessToken` headers.

#### Request

```http
POST /api/StripeCreatePaymentIntent
Content-Type: application/json
encryptedRequest: <encrypted_payload>
accessToken: <jwt_token>
```

Decrypted body:

```json
{
  "amount": 4999,
  "currency": "usd",
  "customer_id": "cus_ABC123",
  "payment_method_id": "pm_1ABC",
  "metadata": {
    "order_ref": "ORD-001"
  }
}
```

| Field | Type | Required | Default | Description |
|---|---|---|---|---|
| `amount` | integer | Yes | — | Amount in smallest currency unit (cents) |
| `currency` | string | No | `"usd"` | ISO 4217 currency code |
| `customer_id` | string | No | — | Stripe customer ID (`cus_...`) |
| `payment_method_id` | string | No | — | Stripe payment method ID (`pm_...`) |
| `metadata` | object | No | `{}` | Arbitrary key-value metadata attached to the intent |

#### Response — 200 OK

```json
{
  "success": true,
  "message": "Payment intent created successfully!",
  "data": {
    "payment_intent_id": "pi_3ABC",
    "client_secret": "pi_3ABC_secret_XYZ"
  }
}
```

#### Error Responses

| Status | `message` | Cause |
|---|---|---|
| `400` | `"amount is required"` | Missing required field |
| `401` | `"Unauthorized"` | Invalid or missing `accessToken` |
| `422` | `"Invalid amount"` | Amount is zero or negative |
| `500` | `"Failed to create payment intent. Please try again."` | Stripe API or server error |

---

### POST /api/PlanInvoiceConfirm

Confirms a completed payment transaction (Stripe or other gateway) and finalises the subscription/invoice record.

#### Request

```http
POST /api/PlanInvoiceConfirm
Content-Type: application/json
encryptedRequest: <encrypted_payload>
accessToken: <jwt_token>
```

Decrypted body:

```json
{
  "transaction_id": "TXN-20250508-001",
  "payment_intent_id": "pi_3ABC",
  "status": "success",
  "error_message": null
}
```

| Field | Type | Required | Default | Description |
|---|---|---|---|---|
| `transaction_id` | string | Yes | — | Internal transaction ID returned by the initiate call |
| `payment_intent_id` | string | Yes | — | Gateway payment intent or reference ID |
| `status` | string | No | `"success"` | `"success"` or `"failed"` |
| `error_message` | string | No | `null` | Human-readable failure reason (when `status` = `"failed"`) |

#### Response — 200 OK

```json
{
  "success": true,
  "message": "Payment confirmed successfully!",
  "data": {
    "invoice_id": 101,
    "subscription_id": 25,
    "status": "paid"
  }
}
```

#### Error Responses

| Status | `message` | Cause |
|---|---|---|
| `404` | `"Transaction not found"` | `transaction_id` does not exist |
| `409` | `"Transaction already confirmed"` | Duplicate confirm call |
| `400` | `"transaction_id is required"` | Missing required field |
| `500` | `"Failed to confirm payment. Please try again."` | Server-side exception |

---

## KuickPay

### POST /api/KuickpayInvoiceInitiateKuickPay

Initiates a KuickPay payment. Returns a `redirect_url` to which the user must be redirected to complete payment on the KuickPay-hosted form.

**Authentication:** Requires `encryptedRequest` + `accessToken` headers.

#### Request

```http
POST /api/KuickpayInvoiceInitiateKuickPay
Content-Type: application/json
encryptedRequest: <encrypted_payload>
accessToken: <jwt_token>
```

Decrypted body:

```json
{
  "urdd_id": 7,
  "plan_id": 3,
  "payment_method_id": 15,
  "amount": 2500,
  "currency": "PKR",
  "renewal_subscription_id": 12
}
```

| Field | Type | Required | Default | Description |
|---|---|---|---|---|
| `urdd_id` | integer | Yes | — | User Role Designation Department ID |
| `plan_id` | integer | Yes | — | Plan being purchased |
| `payment_method_id` | integer | Yes | — | Verified KuickPay payment method ID |
| `amount` | number | Yes | — | Amount (must be > 0) |
| `currency` | string | No | `"PKR"` | Currency code |
| `renewal_subscription_id` | integer | No | — | Existing subscription ID being renewed |

#### Response — 200 OK

```json
{
  "success": true,
  "message": "Payment initiated successfully",
  "data": {
    "transaction_id": "TXN-20250508-KP-001",
    "status": "pending",
    "gateway_response": {},
    "requires_confirmation": true,
    "redirect_url": "https://pay.kuickpay.com/checkout/abc123",
    "payment_params": { },
    "form_method": "POST",
    "subscription_id": 26,
    "amount": 2500,
    "plan_name": "Pro",
    "gateway": "kuickpay"
  }
}
```

#### Error Responses

| Status | `message` | Cause |
|---|---|---|
| `400` | `"Missing required fields: urdd_id, plan_id, payment_method_id, amount"` | One or more required fields absent |
| `422` | `"Invalid amount. Amount must be greater than 0"` | `amount` < 0 |
| `401` | `"Unauthorized"` | Invalid or missing `accessToken` |
| `500` | `"Failed to initiate KuickPay payment"` | KuickPay API or server error |

#### KuickPay Webhook Callbacks

KuickPay posts back to configured webhook URLs:

| Endpoint | When |
|---|---|
| `POST /api/KuickpaySuccess` | Payment was completed successfully |
| `POST /api/KuickpayFailure` | Payment failed or was cancelled |

---

## Chase Bank

### POST /api/ChaseBankInvoiceInitiateChaseBank

Initiates a Chase Bank payment. Unlike KuickPay, confirmation happens server-side — no redirect is needed.

**Authentication:** Requires `encryptedRequest` + `accessToken` headers.

#### Request

```http
POST /api/ChaseBankInvoiceInitiateChaseBank
Content-Type: application/json
encryptedRequest: <encrypted_payload>
accessToken: <jwt_token>
```

Decrypted body:

```json
{
  "actionPerformerURDD": 7,
  "urdd_id": 7,
  "plan_id": 3,
  "payment_method_id": 15,
  "amount": 49.99,
  "currency": "USD",
  "top_up": false,
  "old_subscription_id": 12,
  "additional_credits": 0,
  "is_upgrade": false,
  "is_downgrade": false,
  "action": "initiate_payment"
}
```

| Field | Type | Required | Default | Description |
|---|---|---|---|---|
| `actionPerformerURDD` | integer | Yes | — | URDD of the user initiating the action |
| `urdd_id` | integer | Yes | — | URDD of the target user |
| `plan_id` | integer | Yes | — | Plan being purchased |
| `payment_method_id` | integer | Yes | — | Verified Chase Bank payment method ID |
| `amount` | number | Yes | — | Payment amount |
| `currency` | string | No | `"USD"` | Currency code |
| `top_up` | boolean | No | `false` | Whether this is a credit top-up |
| `old_subscription_id` | integer | No | — | Subscription being replaced (for upgrades/renewals) |
| `additional_credits` | integer | No | — | Extra credits being purchased |
| `is_upgrade` | boolean | No | `false` | Flag for upgrade flow |
| `is_downgrade` | boolean | No | `false` | Flag for downgrade flow |
| `action` | string | No | `"initiate_payment"` | Action descriptor |

#### Response — 200 OK

```json
{
  "success": true,
  "message": "Chase Bank payment initiated successfully!",
  "data": {
    "transaction_id": "TXN-20250508-CB-001",
    "status": "success",
    "gateway_response": {},
    "requires_confirmation": false,
    "subscription_id": 27,
    "amount": 49.99,
    "plan_name": "Enterprise",
    "gateway": "chasebank"
  }
}
```

#### Error Responses

| Status | `message` | Cause |
|---|---|---|
| `400` | `"Failed to initiate Chase Bank payment. Please try again."` | Payment declined or validation error |
| `401` | `"Unauthorized"` | Invalid or missing `accessToken` |
| `500` | `"Failed to initiate Chase Bank payment"` | Chase API or server error |
