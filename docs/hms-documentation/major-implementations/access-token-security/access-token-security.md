---
title: "Access Token Security & Session Management"
sidebar_position: 1
---

# Access Token Security & Session Management

HMS uses a dual-token authentication system (access token + refresh token) with DB-backed validation and automatic session invalidation on login and permission changes.

## Token Types

| Token | Lifetime | Storage | Purpose |
|-------|----------|---------|---------|
| **Access token** | ~15 min (staff) / ~24 h (guest, configurable) | `user_devices.device_token` | Authenticates every API request |
| **Refresh token** | 24 hours | `user_devices.guest_refresh_token` | Issues new access tokens without re-login (guests only) |

### Token Lifetimes (configurable)

- **Staff**: `TOKEN_LIFETIME_MINUTES` (env) — default 60 minutes
- **Guest access**: `GUEST_ACCESS_TOKEN_SECONDS` (env) — default 86400 (24 hours)
- **Renewal threshold**: `TOKEN_RENEWAL_THRESHOLD_SECONDS` — when a token has this many seconds left, the middleware auto-renews it

---

## Request Authentication Pipeline

Every authenticated request flows through this validation chain in the **Processing** stage of the middleware pipeline:

```
Request → deviceHeadersValidator → execReqProcessFuncs → accessTokenValidator → ...
```

### `accessTokenValidator` (config.js)

1. Calls `validateToken()` which:
   - **JWT decode**: Verifies signature and checks expiry via `checkExpiration()`
   - **DB validation**: Queries `user_devices` to confirm the presented token matches the stored `device_token`
2. If the token is near expiry (within `TOKEN_RENEWAL_THRESHOLD_SECONDS`), auto-generates a new token via `generateToken()` and returns it in the `x-new-accesstoken` response header

### DB-Backed Token Validation (validateToken.js)

After JWT decode succeeds, the middleware performs a database check:

```js
// 1. Look up the device row
SELECT device_token FROM user_devices
WHERE user_device_id = ? AND user_id = ? AND status = 'active'

// 2. Compare stored token against presented token
if (!storedToken || storedToken !== req.headers["accesstoken"]) {
  throw new Error("Session invalidated");
}
```

This ensures that:
- Tokens cleared by `InvalidateAccessTokens` are immediately rejected
- A token that was valid (not expired) but has been superseded by a new login is rejected
- Manually deactivated device rows (`status = 'inactive'`) reject all tokens

**Key file**: `Services/Middlewares/TokenValidation/validateToken.js`

---

## Token Generation & Storage

### Guest Login (OTP-based)

**Endpoint**: `POST /api/guest/auth/verify-otp`
**File**: `Src/HelperFunctions/PreProcessingFunctions/Guest/verifyGuestOtp.js`

```
1. Verify OTP code against device_otp table
2. InvalidateAccessTokens(userId, { excludeDeviceId })  ← kills all other sessions
3. Generate new access token (signGuestAccessToken)
4. Generate new refresh token (signGuestRefreshToken) with JTI + family ID
5. Store both in user_devices row
```

### Admin/Staff Login (Password-based)

**Endpoint**: `POST /api/login`
**File**: `Src/HelperFunctions/PostProcessingFunctions/LoginWithPassword/lwp.js`

```
1. Verify password
2. InvalidateAccessTokens(userId, { excludeDeviceId, clearRefreshTokens: false })
3. Generate new access token (generateToken)
4. Store in user_devices.device_token
```

### Token Renewal (Middleware Auto-Renewal)

**File**: `Services/SysFunctions/jwtUtils.js`

When the middleware detects a token near expiry:

```js
generateToken(decodedToken, SECRET_KEY)
// 1. Strips exp/iat, sets new expiry
// 2. Signs new JWT
// 3. UPDATE user_devices SET device_token = ? WHERE user_id = ? AND user_device_id = ?
// 4. Returns new token → sent via x-new-accesstoken header
```

---

## Refresh Token Rotation (Guest)

**Endpoint**: `POST /api/auth/refresh`
**File**: `Src/HelperFunctions/PreProcessingFunctions/Guest/refreshGuestTokens.js`

The refresh flow uses JTI (JWT ID) rotation with family-based replay detection:

```
1. Decode refresh token, extract userId, deviceId, jti, familyId
2. SELECT ... FROM user_devices WHERE user_device_id = ? FOR UPDATE  ← row lock
3. Compare stored JTI against presented JTI
   - Mismatch → "Refresh token was already used" (409) — replay detected
4. Generate new JTI, new access token, new refresh token
5. UPDATE user_devices SET device_token, guest_refresh_token, guest_refresh_token_jti
```

### Replay Detection

If a refresh token is used twice (e.g., stolen token replay), the second use finds a JTI mismatch and rejects with 409. The legitimate user's session continues uninterrupted because their token has the current JTI.

---

## Session Invalidation

### `InvalidateAccessTokens(userId, options)`

**File**: `Src/HelperFunctions/InvalidateAccessTokens.js`

Central helper that clears tokens from `user_devices`, forcing re-authentication.

```js
InvalidateAccessTokens(userId, {
  excludeDeviceId,    // keep this device active (login flows)
  clearRefreshTokens, // also clear refresh tokens (default: true)
  connection,         // use existing DB connection (for transactions)
})
```

**What it clears**:

| Column | Cleared | Effect |
|--------|---------|--------|
| `device_token` | Always | Access token rejected by DB validation |
| `guest_refresh_token` | When `clearRefreshTokens: true` | Refresh flow fails |
| `guest_refresh_token_jti` | When `clearRefreshTokens: true` | JTI comparison fails |
| `guest_refresh_family_id` | When `clearRefreshTokens: true` | Family chain broken |

### Trigger Points

| Event | What happens | `excludeDeviceId` | `clearRefreshTokens` |
|-------|-------------|-------------------|---------------------|
| **Guest login** (OTP verify) | All other devices invalidated | Current device excluded | `true` |
| **Admin login** (password) | All other devices invalidated | Current device excluded | `false` |
| **Permission change** | ALL devices invalidated | None (all killed) | `true` (default) |

### Permission Change Integration

**File**: `Src/HelperFunctions/PayloadFunctions/AssignPermissions/assignPermissionsToUser.js`

After permissions are assigned or revoked (COMMIT), the system:

1. Resolves `user_id` from the target URDD
2. Calls `InvalidateAccessTokens(targetUserId)` — no device exclusion, all sessions killed
3. User must re-authenticate, at which point the permission check middleware reads fresh permissions from `user_role_designation_permissions`

---

## `user_devices` Table Schema

```sql
user_device_id              INT PRIMARY KEY AUTO_INCREMENT
user_id                     INT (FK → users)
tenant_id                   INT (FK → tenants)
device_token                VARCHAR(255)    -- current access JWT (NULL = invalidated)
guest_refresh_token         TEXT            -- current refresh JWT
guest_refresh_token_jti     VARCHAR(64)     -- current JTI for replay detection
guest_refresh_family_id     VARCHAR(64)     -- family chain ID
device_name                 VARCHAR(255)
device_type                 ENUM('ios','android','web','kiosk')
fcm_token                   VARCHAR(255)    -- Firebase Cloud Messaging token
last_login_at               DATETIME
last_active_at              DATETIME
is_trusted                  TINYINT
status                      ENUM('active','inactive')

-- Indexes
KEY idx_user_devices_device_token (device_token)
KEY idx_user_devices_token_device_user (device_token, device_name, user_id)
```

---

## Security Flow Diagrams

### Login Flow (Guest)

```
Guest enters OTP
    │
    ▼
verifyGuestOtp()
    │
    ├── Verify OTP against device_otp
    │
    ├── InvalidateAccessTokens(userId, { excludeDeviceId })
    │   └── SET device_token = NULL, refresh tokens = NULL
    │       WHERE user_id = ? AND user_device_id != current
    │
    ├── Sign new access token + refresh token
    │
    └── UPDATE user_devices SET device_token = newToken
        WHERE user_device_id = current
```

### Authenticated Request Flow

```
Request with accesstoken header
    │
    ▼
JWT decode + expiry check
    │ (fail → 401)
    ▼
DB validation: user_devices.device_token == presented token?
    │ (mismatch → "Session invalidated")
    ▼
Log activity to user_activity
    │
    ▼
Auto-renew if near expiry → x-new-accesstoken header
    │
    ▼
Continue to permission check → business logic
```

### Permission Change Flow

```
Admin assigns/revokes permissions for target URDD
    │
    ▼
UPDATE user_role_designation_permissions (COMMIT)
    │
    ▼
Resolve user_id from target URDD
    │
    ▼
InvalidateAccessTokens(userId)  ← all devices
    │
    ▼
Next request from that user:
    DB check fails → "Session invalidated" → must re-login
    → Fresh login → fresh permissions loaded
```

---

## Key Files Reference

| File | Purpose |
|------|---------|
| `Services/Middlewares/config.js` | `accessTokenValidator()` — orchestrates JWT check + renewal |
| `Services/Middlewares/TokenValidation/validateToken.js` | JWT decode + **DB validation** + activity logging |
| `Services/SysFunctions/auth.js` | `verifyToken()` — JWT signature verification |
| `Services/SysFunctions/jwtUtils.js` | `generateToken()` — signs new JWT + stores in DB |
| `Services/SysFunctions/checkExpiration.js` | `checkExpiration()` — decode + expiry wrapper |
| `Src/HelperFunctions/Guest/guestJwt.js` | `signGuestAccessToken()`, `signGuestRefreshToken()` |
| `Src/HelperFunctions/InvalidateAccessTokens.js` | `InvalidateAccessTokens()` — central session killer |
| `Src/HelperFunctions/PreProcessingFunctions/Guest/verifyGuestOtp.js` | Guest OTP login (triggers invalidation) |
| `Src/HelperFunctions/PostProcessingFunctions/LoginWithPassword/lwp.js` | Admin login (triggers invalidation) |
| `Src/HelperFunctions/PreProcessingFunctions/Guest/refreshGuestTokens.js` | Refresh token rotation with JTI replay detection |
| `Src/HelperFunctions/PayloadFunctions/AssignPermissions/assignPermissionsToUser.js` | Permission changes (triggers invalidation) |
