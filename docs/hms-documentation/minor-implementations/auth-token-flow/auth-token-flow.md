---
sidebar_position: 3
---

# Authentication Token Flow — Frontend Integration Guide

This document covers the complete access token and refresh token lifecycle for **all user types** (guest and admin/staff). It is written for frontend developers who need to implement token management.

## Token Overview

Every login endpoint now returns **two tokens**:

| Token | Key in response | Lifetime | Purpose |
|---|---|---|---|
| Access token | `access_token` / `accesstoken` | ~5 min (configurable) | Sent on every authenticated API call |
| Refresh token | `refreshToken` | 24 hours (configurable) | Used to get a new access token after it expires |

The access token is a plain JWT. The refresh token is a JWT prefixed with `rfh_`.

---

## 1. Login — Obtaining Tokens

All login endpoints return `accesstoken`, `refreshToken`, and `expiresIn`. Store all three on the client.

### 1a. Guest OTP Login

**Step 1 — Send OTP:**

```
POST /api/guest/auth/send-otp
```

```json
{ "email": "guest@example.com" }
```

**Step 2 — Verify OTP (returns tokens):**

```
POST /api/guest/auth/verify-otp
```

```json
{ "email": "guest@example.com", "otp": "847261" }
```

**Response keys to store:**

```json
{
  "data": {
    "accesstoken": "<jwt>",
    "refreshToken": "rfh_<jwt>",
    "expiresIn": 300,
    "tenantUrddMap": { "global": 14, "3": 16 },
    "user_id": 5,
    "user": { "..." }
  }
}
```

| Key | Type | What to do with it |
|---|---|---|
| `accesstoken` | string | Store as the current access token. Send in the `accesstoken` header on every authenticated request. |
| `refreshToken` | string | Store securely. Use when the access token expires. Always starts with `rfh_`. |
| `expiresIn` | number | Seconds until the access token expires. Use to track expiry on the client. |
| `tenantUrddMap` | object | Maps tenant IDs to URDD IDs. Use for tenant-scoped guest API calls. |

### 1b. Guest Social Login

```
POST /api/guest/auth/social-signup
```

```json
{ "signUp_flag": "Google", "idToken": "<provider_token>" }
```

Returns the same token keys as guest OTP login: `accesstoken`, `refreshToken`, `expiresIn`, `tenantUrddMap`.

### 1c. Admin Password Login

```
POST /api/LoginWithPassword
```

```json
{ "username": "admin_user", "password": "secret123" }
```

**Response keys to store:**

```json
{
  "data": {
    "access_token": "<jwt>",
    "accesstoken": "<jwt>",
    "refreshToken": "rfh_<jwt>",
    "expiresIn": 300,
    "user_id": 42,
    "user": { "..." },
    "user_roles_designations_departments": ["..."],
    "user_permissions": { "..." }
  }
}
```

| Key | Type | What to do with it |
|---|---|---|
| `access_token` | string | Same JWT as `accesstoken` (both are returned for backward compatibility) |
| `accesstoken` | string | Store and send in the `accesstoken` header |
| `refreshToken` | string | Store securely. Same `rfh_`-prefixed JWT as guest flow. |
| `expiresIn` | number | Seconds until access token expires |

### 1d. Admin OTP Login

**Step 1 — Send OTP:**

```
POST /api/Login?step=1
```

```json
{ "email": "admin@example.com", "device_name": "Chrome / Windows" }
```

**Step 2 — Verify OTP (returns tokens):**

```
POST /api/Login?step=2
```

```json
{ "email": "admin@example.com", "otp": "847261", "device_name": "Chrome / Windows" }
```

**Response keys to store:** Same as password login — `access_token`, `accesstoken`, `refreshToken`, `expiresIn`.

---

## 2. Using the Access Token

Send the access token in the `accesstoken` header on every authenticated API call:

```
GET /api/guest/bookings
accesstoken: <jwt>
```

The server validates this token on every request by:

1. Verifying the JWT signature and expiry
2. Checking that the token matches the `device_token` stored in `user_devices` for that device
3. Confirming the device is still active (`status = 'active'`)

If the token is expired, revoked (doesn't match the stored token), or the device is inactive, the server returns **401**.

---

## 3. Access Token Auto-Renewal (Transparent)

The server automatically renews the access token when it is **close to expiry** during any successful authenticated API call. The client does **not** need to call any refresh endpoint for this — it happens transparently.

### How it works

On every authenticated request, the middleware checks:

```
time remaining on access token <= 20% of ACCESS_TOKEN_SECONDS
```

With the default 300s (5 min) lifetime, renewal triggers when 60s or less remain.

If the token is within the renewal window:

1. The server generates a **new access token** with a full TTL
2. The new token is stored in the database (`user_devices.device_token`)
3. The new token is returned to the client in **two places**:
   - **Response header:** `x-new-accesstoken`
   - **Response body:** `accessToken` field (inside the encrypted payload for encrypted platforms)

### Client implementation

```
On EVERY API response:
  1. Check the response header "x-new-accesstoken"
  2. If present → replace your stored access token with this new one
  3. Use the new token for all subsequent requests
```

**This is critical.** If you ignore the `x-new-accesstoken` header, your next request will use a token that the server has already replaced in the database, and the request will fail with 401.

### Timeline example

```
0:00  Login → receive access token (expires at 5:00)
...
3:05  GET /api/guest/profile → token has 1:55 left (< 2 min threshold)
      ← response includes x-new-accesstoken: <new_jwt> (expires at 8:05)
      → client stores new token
...
6:00  GET /api/guest/bookings → uses new token (2:05 remaining, no renewal)
      ← normal response
...
```

---

## 4. Refresh Token Flow (Explicit)

When the access token **has expired** and is no longer being auto-renewed (the user was inactive), the client must call the refresh endpoint to get a new access token.

### When to use this

- The access token has expired (API calls return 401)
- The access token expired within the **grace window** (20% of access token lifetime — 60s with the default 300s TTL)
- You still have a valid refresh token stored

### Request

```
POST /api/auth/refresh
Content-Type: application/json
```

```json
{
  "accesstoken": "<expired_jwt>",
  "refreshToken": "rfh_<jwt>"
}
```

| Field | Type | Required | Description |
|---|---|---|---|
| `accesstoken` | string | Yes | The expired access token (must have expired within the last 60 seconds) |
| `refreshToken` | string | Yes | The refresh token from login or a previous refresh |

### Response — 200 OK

```json
{
  "success": true,
  "data": {
    "accesstoken": "<new_jwt>",
    "refreshToken": "rfh_<new_jwt>",
    "expiresIn": 300,
    "tenantUrddMap": { "global": 14, "3": 16 }
  }
}
```

| Key | Type | What to do with it |
|---|---|---|
| `accesstoken` | string | Replace your stored access token |
| `refreshToken` | string | Replace your stored refresh token (the old one is now invalid) |
| `expiresIn` | number | Seconds until the new access token expires |
| `tenantUrddMap` | object | Updated tenant URDD map (may include newly added tenants) |

### Important: Token Rotation

Every successful refresh **invalidates the old refresh token** and returns a new one. You must store the new `refreshToken` — the old one will never work again. This is a security feature (JTI rotation with replay detection).

### Error Responses

| Status | Code | Message | What the client should do |
|---|---|---|---|
| 422 | `validation_failed` | `"accesstoken is required"` | Ensure both fields are sent |
| 422 | `validation_failed` | `"refreshToken is required"` | Ensure both fields are sent |
| 401 | `access_invalid` | `"Invalid access token"` | Token is corrupted — force re-login |
| 401 | `access_expired_beyond_grace` | `"Access token expired too long ago"` | Token expired > 60s ago — force re-login |
| 401 | `refresh_invalid` | `"Invalid refresh token"` | Token corrupted or device deactivated — force re-login |
| 401 | `token_mismatch` | `"Token pair mismatch"` | Tokens belong to different sessions — force re-login |
| 410 | `refresh_expired` | `"Refresh token expired"` | 24-hour window elapsed — force re-login |
| 409 | `refresh_replayed` | `"Refresh token was already used"` | Token was already rotated (possible theft) — force re-login |

### Still-valid shortcut

If you call `/api/auth/refresh` while the access token is **still valid** (not yet expired), the server returns the existing access token and refresh token as-is without rotation. This is a no-op convenience — the client can safely call refresh proactively.

---

## 5. Client-Side Decision Tree

```
Making an API call:
  │
  ├─ Have a stored access token? → Send it in "accesstoken" header
  │    │
  │    ├─ Response 200 → Check "x-new-accesstoken" header
  │    │    ├─ Header present → Store new access token, continue
  │    │    └─ Header absent → Continue normally
  │    │
  │    └─ Response 401 → Access token expired
  │         │
  │         ├─ Have a stored refresh token?
  │         │    ├─ Yes → Call POST /api/auth/refresh
  │         │    │    ├─ 200 → Store new accesstoken + refreshToken, retry original request
  │         │    │    └─ 401/410/409 → Clear tokens, redirect to login
  │         │    └─ No → Clear tokens, redirect to login
  │         │
  │         └─ No refresh token → Redirect to login
  │
  └─ No access token → Redirect to login
```

---

## 6. Token Lifetimes (Defaults)

| Setting | Default | Env var to override |
|---|---|---|
| Access token lifetime | 300 seconds (5 min) | `ACCESS_TOKEN_SECONDS` |
| Auto-renewal threshold | 20% of access token lifetime (60s at default) | Derived — not independently configurable |
| Refresh token lifetime | 86400 seconds (24 hr) | `GUEST_REFRESH_TOKEN_SECONDS` or `GUEST_REFRESH_TOKEN_DAYS` |
| Refresh grace window | 20% of access token lifetime (60s at default) | Derived — not independently configurable |

### What each value means

- **Access token lifetime**: How long the JWT is valid. After this, API calls return 401.
- **Auto-renewal threshold**: Fixed at 20% of the access token lifetime. When remaining time drops below this, the server auto-generates a new token on the next successful API hit.
- **Refresh token lifetime**: How long the refresh token can be used. After 24 hours, the user must log in again.
- **Refresh grace window**: Fixed at 20% of the access token lifetime. After the access token expires, the client has this window to call `/api/auth/refresh`. After the grace window, they must re-login.

Both the auto-renewal threshold and refresh grace window are always 20% of the access token lifetime. Changing `ACCESS_TOKEN_SECONDS` automatically adjusts both.

---

## 7. Shape Validator Behaviour

The response shape validator does **not** interfere with any auth endpoint:

| Endpoint | Shape config | Effect |
|---|---|---|
| `POST /api/guest/auth/verify-otp` | `shape: "any"` | No validation — all keys pass through |
| `POST /api/auth/refresh` | No shape defined | No validation — all keys pass through |
| `POST /api/LoginWithPassword` | No shape defined | No validation — all keys pass through |
| `POST /api/Login` (admin OTP) | No shape defined | No validation — all keys pass through |
| `POST /api/guest/auth/social-signup` | `shape: "any"` | No validation — all keys pass through |
| Auto-renewed `x-new-accesstoken` header | Set directly on `res` | Not subject to shape validation (response headers bypass the shape validator) |

All token-related keys (`accesstoken`, `refreshToken`, `expiresIn`, `tenantUrddMap`) are guaranteed to reach the client without being stripped.

---

## 8. Summary of Response Keys by Endpoint

| Endpoint | `accesstoken` | `access_token` | `refreshToken` | `expiresIn` | `tenantUrddMap` |
|---|---|---|---|---|---|
| Guest OTP verify | Yes | Yes | Yes | Yes | Yes |
| Guest social signup | Yes | Yes | Yes | Yes | Yes |
| Admin password login | Yes | Yes | Yes | Yes | No |
| Admin OTP login | Yes | Yes | Yes | Yes | No |
| Auth refresh | Yes | No | Yes | Yes | Yes |
| Auto-renewal (header) | `x-new-accesstoken` header | No | No | No | No |
