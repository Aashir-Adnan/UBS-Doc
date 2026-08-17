---
sidebar_position: 1
---

# API Overview

This section documents the complete API blueprint for the Framework Node backend. Each endpoint specifies the HTTP method, request payload, response structure, and all applicable status codes.

## Base URL

```
https://<your-domain>/api
```

## Request Format

All requests with a body must send `Content-Type: application/json`.

Encrypted endpoints additionally require:

| Header | Description |
|---|---|
| `encryptedRequest` | The AES-encrypted request body |
| `accessToken` | JWT access token obtained from login |

## Standard Response Envelope

Every API response — success or failure — follows this envelope:

```json
{
  "success": true,
  "message": "Human-readable status message",
  "data": { }
}
```

On error:

```json
{
  "success": false,
  "message": "Human-readable error description",
  "error": "Internal error detail (dev-facing)"
}
```

## HTTP Status Codes

| Code | Meaning | When it occurs |
|---|---|---|
| `200` | OK | Request succeeded |
| `400` | Bad Request | Missing required fields, validation failure, invalid input |
| `401` | Unauthorized | Incorrect credentials, missing or invalid `accessToken` |
| `403` | Forbidden | Authenticated but lacks required permission |
| `404` | Not Found | Resource does not exist |
| `409` | Conflict | Duplicate resource (e.g. duplicate username/email) |
| `422` | Unprocessable Entity | Field present but semantically invalid |
| `429` | Too Many Requests | Rate limit exceeded (100 req/min per session) |
| `500` | Internal Server Error | Unhandled server-side exception |

## Session / Token Expiry

JWT tokens are tied to a user device (`user_device_id`). When a token expires or is invalidated:

```json
{
  "success": false,
  "message": "Session expired. Please log in again.",
  "error": "TokenExpiredError"
}
```

The client must re-authenticate via `POST /api/LoginWithPassword`.

## Rate Limiting

- **Window:** 60 seconds
- **Limit:** 100 requests per session (keyed by session ID or IP)
- **429 response body:** `"Too many requests from this session, please try again later."`

---

## Endpoint Groups

| Group | Description |
|---|---|
| [Authentication](./authentication) | Login, signup, forgot password |
| [Payment Methods](./payment-methods) | Add, verify, and list payment methods |
| [Plan Management](./plan-management) | Subscriptions, upgrades, downgrades, service usage |
| [Payment Gateways](./payment-gateways) | Stripe, KuickPay, Chase Bank initiation & confirmation |
| [Permissions](./permissions) | Assign role/permission sets to users |
| [Utilities](./utilities) | Send email, file download |
