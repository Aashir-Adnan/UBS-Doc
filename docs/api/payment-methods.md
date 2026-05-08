---
sidebar_position: 3
---

# Payment Methods

## POST /api/PaymentMethodAdd

Saves a payment method for a user and sends an OTP to the user's email for verification. The method is not active until verified via `POST /api/VerifyPaymentMethod`.

### Request

```http
POST /api/PaymentMethodAdd
Content-Type: application/json
```

```json
{
  "urdd_id": 7,
  "supported_payment_method_id": 2,
  "payment_details": {
    "account_number": "03001234567",
    "bank_name": "KuickPay"
  },
  "is_default": true
}
```

| Field | Type | Required | Description |
|---|---|---|---|
| `urdd_id` | integer | Yes | User Role Designation Department ID |
| `supported_payment_method_id` | integer | Yes | ID from the `supported_payment_methods` table (e.g. Stripe, KuickPay, Chase Bank) |
| `payment_details` | object | Yes | Gateway-specific details (account number, card token, etc.) |
| `is_default` | boolean | No | Set as the user's default payment method |

### Response — 200 OK

```json
{
  "success": true,
  "message": "Payment method details saved successfully! Please check your email for OTP verification.",
  "data": {
    "payment_method_id": 15
  }
}
```

### Error Responses

| Status | `message` | Cause |
|---|---|---|
| `400` | `"urdd_id is required"` | Missing required field |
| `409` | `"Payment method already exists"` | Duplicate entry for this user+gateway combination |
| `500` | `"Failed to save payment method details. Please try again."` | Server-side exception |

---

## POST /api/VerifyPaymentMethod

Verifies a previously saved payment method using the OTP sent during `PaymentMethodAdd`. Activates the method on success.

### Request

```http
POST /api/VerifyPaymentMethod
Content-Type: application/json
```

```json
{
  "urdd_id": 7,
  "payment_method_id": 15,
  "otp": "482917"
}
```

| Field | Type | Required | Description |
|---|---|---|---|
| `urdd_id` | integer | Yes | User Role Designation Department ID |
| `payment_method_id` | integer | Yes | ID returned from `PaymentMethodAdd` |
| `otp` | string | Yes | OTP received via email |

### Response — 200 OK

```json
{
  "success": true,
  "message": "Payment method verified successfully! Your payment method is now active.",
  "data": {}
}
```

### Error Responses

| Status | `message` | Cause |
|---|---|---|
| `401` | `"Invalid OTP"` | OTP mismatch or expired |
| `404` | `"Payment method not found"` | `payment_method_id` does not exist for this user |
| `400` | `"otp is required"` | Missing field |
| `500` | `"Failed to verify payment method. Please check your OTP and try again."` | Server-side exception |

---

## GET /api/StripeGetPaymentMethods

Retrieves all saved Stripe payment methods for a Stripe customer. Requires a valid `accessToken` and encrypted request.

### Request

```http
GET /api/StripeGetPaymentMethods
Content-Type: application/json
encryptedRequest: <encrypted_payload>
accessToken: <jwt_token>
```

Decrypted body:

```json
{
  "customer_id": "cus_ABC123"
}
```

| Field | Type | Required | Description |
|---|---|---|---|
| `customer_id` | string | Yes | Stripe customer ID (`cus_...`) |

### Response — 200 OK

```json
{
  "success": true,
  "message": "Payment methods retrieved successfully!",
  "data": [
    {
      "id": "pm_1ABC",
      "type": "card",
      "card": {
        "brand": "visa",
        "last4": "4242",
        "exp_month": 12,
        "exp_year": 2027
      }
    }
  ]
}
```

### Error Responses

| Status | `message` | Cause |
|---|---|---|
| `401` | `"Unauthorized"` | Missing or invalid `accessToken` |
| `400` | `"customer_id is required"` | Missing field |
| `500` | `"Failed to get payment methods. Please try again."` | Stripe API error or server exception |
