---
sidebar_position: 3
---

# Guest Authentication — Token Lifecycle

## Overview

Guest authentication uses a **dual-token system** with **automatic near-expiry renewal**:

| Token | Purpose | Lifetime | Prefix |
|---|---|---|---|
| **Access token** | Authorises API requests | ~15 minutes (`GUEST_ACCESS_TOKEN_SECONDS`) | — |
| **Refresh token** | Obtains a new access + refresh pair when access token expires | 24 hours (`GUEST_REFRESH_TOKEN_SECONDS`) | `rfh_` |

Both tokens are JWTs signed with the server `SECRET_KEY`. The refresh token uses **JTI rotation** and **family-based replay detection** for security.

### Token Storage (`user_devices` table)

| Column | Content |
|---|---|
| `device_token` | Current access token JWT (updated on login, auto-renewal, and refresh) |
| `guest_refresh_token_jti` | JTI (unique ID) of the current valid refresh token |
| `guest_refresh_family_id` | Stable family ID for the token chain (created at login, persists across refreshes) |

The refresh token JWT itself is **only returned to the client** — the server stores only its JTI for validation. The access token is stored in full so the system can verify it matches the device session.

---

## Token Lifecycle Diagram

```
Guest Login (OTP verify)
  │
  ├─► access token  (15 min TTL)  ──► used for API calls
  └─► refresh token (24 hr TTL)   ──► client stores for later refresh
        │
        │  ┌─────────────────────────────────────────────────┐
        │  │  NORMAL API USAGE                               │
        │  │                                                 │
        │  │  Any authenticated API call (e.g. GET /guest/   │
        │  │  bookings) automatically checks token expiry:   │
        │  │                                                 │
        │  │  • > 5 min remaining → no action                │
        │  │  • ≤ 5 min remaining → AUTO-RENEW:              │
        │  │    1. Generate fresh access token (full TTL)     │
        │  │    2. Update user_devices.device_token in DB     │
        │  │    3. Return new token in x-new-accesstoken      │
        │  │       response header AND in body accessToken    │
        │  │    4. Client should persist the new token        │
        │  │                                                 │
        │  └─────────────────────────────────────────────────┘
        │
        │  access token expires
        │  (client has up to 10 min to call refresh)
        │
        ▼
POST /api/auth/refresh  { accesstoken: <expired>, refreshToken: <rfh_...> }
  │
  ├─► new access token  (15 min TTL)
  └─► new refresh token (24 hr TTL)  ──► old refresh token invalidated
        │
        │  ... repeat until refresh token expires (24 hr)
        │
        ▼
  Re-authenticate via OTP
```

---

## Automatic Near-Expiry Renewal (Middleware)

When any authenticated API is called with a valid access token that has **5 minutes or less** remaining before expiry, the middleware automatically renews it.

### How It Works

1. The `accessTokenValidator` middleware runs on every authenticated request
2. After successful token verification, it checks: `timeRemaining ≤ TOKEN_RENEWAL_THRESHOLD_SECONDS` (default: 300 seconds = 5 minutes)
3. If within the threshold, it calls `generateToken()` which:
   - Creates a new JWT with a fresh expiry (full TTL)
   - Respects token type: guest tokens get `GUEST_ACCESS_TOKEN_SECONDS`, regular tokens get `TOKEN_LIFETIME_MINUTES`
   - **Updates `user_devices.device_token` in the database**
4. The renewed token is delivered to the client via:
   - **Response header**: `x-new-accesstoken: <new_jwt>`
   - **Response body**: `accessToken` field in the (encrypted) payload

### Client Responsibility

On every API response, the client should check for the `x-new-accesstoken` header (or `accessToken` in the decrypted body). If present, the client must persist this new token and use it for all subsequent requests.

### Example

```
GET /api/guest/bookings
accesstoken: <jwt_with_3_min_remaining>

→ 200 OK
  x-new-accesstoken: <jwt_with_full_15_min>
  body: { return: { items: [...] }, accessToken: "<jwt_with_full_15_min>" }
```

---

## POST /api/guest/auth/verify-otp — Login (issues both tokens)

On successful OTP verification, the response includes both an access token and a refresh token.

### Request

```http
POST /api/guest/auth/verify-otp
Content-Type: application/json
```

```json
{
  "email": "guest@example.com",
  "otp": "847261"
}
```

| Field | Type | Required | Description |
|---|---|---|---|
| `email` | string | Yes | Guest's registered email |
| `otp` | string | Yes | 6+ digit OTP received by email |

### Response — 200 OK

```json
{
  "success": true,
  "data": {
    "user_id": 5,
    "access_token": "<jwt>",
    "accesstoken": "<jwt>",
    "refreshToken": "rfh_<jwt>",
    "expiresIn": 900,
    "tenantUrddMap": { "3": 16, "global": 14 },
    "user": { "..." },
    "device_name": "Chrome / Windows",
    "user_roles_designations_departments": ["..."],
    "user_permissions": { "..." },
    "collective_user_permissions": ["..."]
  }
}
```

| Field | Type | Description |
|---|---|---|
| `access_token` | string | Short-lived JWT for API authorisation |
| `refreshToken` | string | Long-lived JWT (prefixed `rfh_`) for token refresh |
| `expiresIn` | number | Seconds until the access token expires |

### Error Responses

| Status | Message | Cause |
|---|---|---|
| `400` | `"OTP must be at least 6 characters"` | OTP too short |
| `400` | `"Email is required"` | Missing email |
| `404` | `"Email is not registered"` | No active guest account for this email |
| `401` | `"Invalid OTP"` | OTP does not match |
| `410` | `"OTP expired"` | OTP past `expires_at` |

### Database Side-Effects

```sql
UPDATE user_devices
SET device_token = '<access_jwt>',
    guest_refresh_token_jti = '<uuid>',
    guest_refresh_family_id = '<uuid>',
    last_login_at = NOW(),
    last_active_at = NOW()
WHERE user_device_id = ?;
```

---

## POST /api/auth/refresh — Refresh Access Token

Exchanges an **expired access token** (expired within 10 minutes) plus a **valid refresh token** for a new access + refresh pair.

This endpoint uses platform encryption (no access-token auth required in the middleware). The expired access token is validated inside the handler itself.

### Request

```http
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
| `accesstoken` | string | Yes | The expired access token (must have expired within the last 10 minutes) |
| `refreshToken` | string | Yes | The refresh token issued at login or last refresh |

### Validation Rules

1. **Access token signature** must be valid (signed with the correct `SECRET_KEY`)
2. **Access token must be expired** — if still valid, refresh is rejected (`400 access_not_expired`)
3. **Access token must have expired within the last 10 minutes** — older tokens require re-authentication (`401 access_expired_beyond_grace`)
4. **Refresh token** must be valid, not expired, and prefixed with `rfh_`
5. **Token pair must match** — `userId` and `deviceId` in both tokens must be identical
6. **JTI must match** the stored `guest_refresh_token_jti` in `user_devices`
7. **Family ID must match** the stored `guest_refresh_family_id`

### Response — 200 OK

```json
{
  "success": true,
  "data": {
    "accesstoken": "<new_jwt>",
    "refreshToken": "rfh_<new_jwt>",
    "expiresIn": 900
  }
}
```

| Field | Type | Description |
|---|---|---|
| `accesstoken` | string | New short-lived access token |
| `refreshToken` | string | New refresh token (previous one is now invalidated) |
| `expiresIn` | number | Seconds until the new access token expires |

### Error Responses

| Status | Code | Message | Cause |
|---|---|---|---|
| `422` | `validation_failed` | `"accesstoken is required"` | Missing or empty access token |
| `422` | `validation_failed` | `"refreshToken is required"` / `"refreshToken must be a string"` | Missing or invalid refresh token field |
| `401` | `access_invalid` | `"Invalid access token"` | Access token signature verification failed |
| `400` | `access_not_expired` | `"Access token is still valid — refresh not allowed"` | Token hasn't expired yet; use it directly |
| `401` | `access_expired_beyond_grace` | `"Access token expired too long ago — re-authenticate required"` | Token expired more than 10 minutes ago |
| `401` | `refresh_invalid` | `"Invalid refresh token"` | Signature invalid, wrong type, or device not found |
| `401` | `token_mismatch` | `"Token pair mismatch"` | Access and refresh tokens belong to different user/device |
| `410` | `refresh_expired` | `"Refresh token expired"` | Refresh token past its 24-hour TTL |
| `409` | `refresh_replayed` | `"Refresh token was already used"` | JTI doesn't match — token was already rotated (possible theft) |

### Database Side-Effects

```sql
-- In a transaction with FOR UPDATE lock:
UPDATE user_devices
SET device_token = '<new_access_jwt>',
    guest_refresh_token_jti = '<new_uuid>',
    last_active_at = NOW()
WHERE user_device_id = ? AND user_id = ? AND status = 'active';
```

---

## Security Properties

- **Auto-renewal**: Tokens are transparently renewed within the last 5 minutes of their lifetime on any authenticated API call, minimising client-side token management.
- **Token rotation**: Each refresh issues a new JTI. The old refresh token becomes invalid immediately.
- **Replay detection**: If a previously used refresh token is submitted (JTI mismatch with same family ID), the server returns `409 refresh_replayed` — this indicates potential token theft.
- **Grace window**: The 10-minute grace window on expired access tokens prevents indefinite refresh using very old stolen access tokens.
- **Family isolation**: Each login creates a new `familyId`. Tokens from different login sessions cannot be mixed.
- **DB consistency**: Both auto-renewal and explicit refresh update `user_devices.device_token`, ensuring the server always knows the latest valid token for each device.

---

## Environment Configuration

| Variable | Default | Description |
|---|---|---|
| `GUEST_ACCESS_TOKEN_SECONDS` | `900` (15 min) | Guest access token TTL in seconds |
| `TOKEN_LIFETIME_MINUTES` | `60` (1 hr) | Regular (non-guest) access token TTL in minutes |
| `TOKEN_RENEWAL_THRESHOLD_SECONDS` | `300` (5 min) | Auto-renew when remaining time ≤ this value |
| `GUEST_REFRESH_TOKEN_SECONDS` | `86400` (24 hr) | Refresh token TTL in seconds |
| `GUEST_REFRESH_TOKEN_DAYS` | — | Alternative: refresh TTL in days (used if `_SECONDS` not set) |
| `SECRET_KEY` | — | JWT signing secret |

---

## Decision Table — What Happens at Each Token State

| Access token state | Action | Result |
|---|---|---|
| Valid, > 5 min remaining | Any authenticated API call | Normal response |
| Valid, ≤ 5 min remaining | Any authenticated API call | Normal response + **auto-renewed token** in `x-new-accesstoken` header and `accessToken` body field; DB updated |
| Expired < 10 min ago | Any authenticated API call | **401 Token Expired** |
| Expired < 10 min ago | `POST /api/auth/refresh` with valid refresh token | **New access + refresh pair** returned; DB updated |
| Expired ≥ 10 min ago | `POST /api/auth/refresh` | **401 access_expired_beyond_grace** — must re-authenticate via OTP |
| Expired (any age) | Any authenticated API call | **401 Token Expired** — use refresh API or re-authenticate |
