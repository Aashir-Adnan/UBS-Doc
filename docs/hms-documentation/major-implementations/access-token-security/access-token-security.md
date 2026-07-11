---
title: "Access Token Security & Session Management"
sidebar_position: 1
---

# Access Token Security & Session Management

HMS uses a dual-token authentication system (access token + refresh token) with a `needs_refresh` signalling mechanism that tells clients when to rebuild their local session state after RBAC or user changes.

## Token Types

| Token | Lifetime | Storage | Purpose |
|-------|----------|---------|---------|
| **Access token** | ~60 min (staff) / ~24 h (guest, configurable) | `user_devices.device_token` | Authenticates every API request |
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
   - **needs_refresh check**: Queries `user_devices.needs_refresh` — if `1`, sets `decryptedPayload._needsRefresh = true`
2. If the token is near expiry (within `TOKEN_RENEWAL_THRESHOLD_SECONDS`), auto-generates a new token via `generateToken()` and returns it in the `x-new-accesstoken` response header
3. The response sender injects `needs_refresh: true` into the response payload when the flag is set

### needs_refresh Check (validateToken.js)

After JWT decode succeeds, the middleware checks the flag:

```js
SELECT needs_refresh FROM user_devices
WHERE user_device_id = ? AND user_id = ? AND status = 'active'

if (Number(deviceRows[0].needs_refresh) === 1) {
  decryptedPayload._needsRefresh = true;
}
```

The response sender (config.js) then includes this in the API response:

```js
if (decryptedPayload._needsRefresh) {
  payload.needs_refresh = true;
}
```

**Key files**: `Services/Middlewares/TokenValidation/validateToken.js`, `Services/Middlewares/config.js`

---

## The `needs_refresh` Flow

Instead of invalidating tokens and forcing re-login, HMS uses a cooperative refresh mechanism:

1. **Server-side change** (e.g., permission update) sets `needs_refresh = 1` on all the affected user's devices
2. **Next API response** includes `needs_refresh: true` alongside the normal response data
3. **Client** detects the flag and calls `POST /api/auth/session/refresh` to rebuild its local state
4. **Session refresh API** returns the full login payload (same shape) and clears the flag

This approach avoids session disruption — the user's current request still succeeds, but the client knows to update its cached permissions/roles.

---

## Session Refresh API

### `POST /api/auth/session/refresh`

**Platform**: AUTH_PLATFORM (encrypted, requires valid access token)

**Purpose**: Rebuilds the full login payload for the authenticated user and clears the `needs_refresh` flag.

**Request**: No body required — the user is identified from the access token.

**Response** (same shape as login):

```json
{
  "user_id": 42,
  "user": { "user_id": 42, "email": "...", "first_name": "...", ... },
  "user_roles_designations_departments": [
    {
      "user_role_designation_department_id": 5,
      "tenant_id": 1,
      "tenant_name": "Grand Plaza Hotel",
      "role_name": "Admin",
      "designation_name": "...",
      "designation_code": "TENANT",
      "department_name": "...",
      "service_category_id": null
    }
  ],
  "user_devices": [...],
  "user_devices_notifications": [...],
  "user_roles": [...],
  "user_permissions": {
    "5": ["list_bookings", "add_bookings", "update_bookings", ...]
  },
  "collective_user_permissions": [...],
  "user_departments": [...],
  "user_designations": [...]
}
```

**Key files**:
- `Src/Apis/ProjectSpecificApis/AuthSessionRefresh/AuthSessionRefresh.js`
- `Src/HelperFunctions/PreProcessingFunctions/buildSessionPayload.js`

---

## `flagNeedsRefresh` and `clearNeedsRefresh`

**File**: `Src/HelperFunctions/NeedsRefresh.js`

### `flagNeedsRefresh(userId, options)`

Sets `needs_refresh = 1` on all active devices for a user.

```js
await flagNeedsRefresh(userId);
// or inside a transaction:
await flagNeedsRefresh(userId, { connection });
```

### `clearNeedsRefresh(userId, deviceId, options)`

Clears the flag for a specific device after the client has refreshed.

```js
await clearNeedsRefresh(userId, deviceId);
```

### Trigger Points

| Event | Action |
|-------|--------|
| **Permission assign/revoke** | `flagNeedsRefresh(targetUserId)` — all devices flagged |
| **Session refresh API called** | `clearNeedsRefresh(userId, deviceId)` — calling device cleared |

---

## Token Generation & Storage

### Guest Login (OTP-based)

**Endpoint**: `POST /api/guest/auth/verify-otp`
**File**: `Src/HelperFunctions/PreProcessingFunctions/Guest/verifyGuestOtp.js`

```
1. Verify OTP code against device_otp table
2. Generate new access token (signGuestAccessToken)
3. Generate new refresh token (signGuestRefreshToken) with JTI + family ID
4. Store both in user_devices row
```

### Admin/Staff Login (Password-based)

**Endpoint**: `POST /api/login`
**File**: `Src/HelperFunctions/PostProcessingFunctions/LoginWithPassword/lwp.js`

```
1. Verify password
2. Generate new access token (generateToken)
3. Store in user_devices.device_token
```

### Token Renewal (Middleware Auto-Renewal)

**File**: `Services/SysFunctions/jwtUtils.js`

When the middleware detects a token near expiry:

```js
generateToken(decodedToken, SECRET_KEY)
// 1. Strips exp/iat, sets new expiry
// 2. Signs new JWT
// 3. UPDATE user_devices SET device_token = ? WHERE user_id = ? AND user_device_id = ?
// 4. Returns new token via x-new-accesstoken header
```

---

## Refresh Token Rotation (Guest)

**Endpoint**: `POST /api/auth/refresh`
**File**: `Src/HelperFunctions/PreProcessingFunctions/Guest/refreshGuestTokens.js`

The refresh flow uses JTI (JWT ID) rotation with family-based replay detection:

```
1. Decode refresh token, extract userId, deviceId, jti, familyId
2. SELECT ... FROM user_devices WHERE user_device_id = ? FOR UPDATE  (row lock)
3. Compare stored JTI against presented JTI
   - Mismatch -> "Refresh token was already used" (409) -- replay detected
4. Generate new JTI, new access token, new refresh token
5. UPDATE user_devices SET device_token, guest_refresh_token, guest_refresh_token_jti
```

### Replay Detection

If a refresh token is used twice (e.g., stolen token replay), the second use finds a JTI mismatch and rejects with 409. The legitimate user's session continues uninterrupted because their token has the current JTI.

---

## `user_devices` Table Schema

```sql
user_device_id              INT PRIMARY KEY AUTO_INCREMENT
user_id                     INT (FK -> users)
tenant_id                   INT (FK -> tenants)
device_token                VARCHAR(255)    -- current access JWT
needs_refresh               TINYINT(1)      -- 1 = client should call session refresh
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

**Migration**: `data/migrations_completed/20260710_1_add_needs_refresh_to_user_devices.sql`

---

## Flow Diagrams

### Authenticated Request Flow

```
Request with accesstoken header
    |
    v
JWT decode + expiry check
    | (fail -> 401)
    v
Check needs_refresh flag from user_devices
    | (if 1 -> set _needsRefresh on payload)
    v
Log activity to user_activity
    |
    v
Auto-renew if near expiry -> x-new-accesstoken header
    |
    v
Permission check -> business logic -> response
    |
    v
Response sender: if _needsRefresh -> add needs_refresh: true to payload
```

### Permission Change Flow

```
Admin assigns/revokes permissions for target URDD
    |
    v
UPDATE user_role_designation_permissions (COMMIT)
    |
    v
Resolve user_id from target URDD
    |
    v
flagNeedsRefresh(userId) -> SET needs_refresh = 1 on all devices
    |
    v
Affected user's next API call:
    Response includes needs_refresh: true
    |
    v
Client calls POST /api/auth/session/refresh
    |
    v
Server returns fresh login payload + clears needs_refresh flag
```

### Session Refresh Flow

```
Client detects needs_refresh: true in any API response
    |
    v
POST /api/auth/session/refresh (with valid access token)
    |
    v
buildSessionPayload(userId)
    |-- user profile, devices, notifications
    |-- roles, URDDs (compound legs)
    |-- permissions (grouped by URDD + collective)
    |-- designations, departments
    |
    v
clearNeedsRefresh(userId, deviceId)
    |
    v
Return full login-shaped payload to client
    -> Client replaces its cached session state
```

---

## Key Files Reference

| File | Purpose |
|------|---------|
| `Services/Middlewares/config.js` | `accessTokenValidator()` + response sender injects `needs_refresh` |
| `Services/Middlewares/TokenValidation/validateToken.js` | JWT decode + `needs_refresh` flag check + activity logging |
| `Services/SysFunctions/auth.js` | `verifyToken()` — JWT signature verification |
| `Services/SysFunctions/jwtUtils.js` | `generateToken()` — signs new JWT + stores in DB |
| `Services/SysFunctions/checkExpiration.js` | `checkExpiration()` — decode + expiry wrapper |
| `Src/HelperFunctions/Guest/guestJwt.js` | `signGuestAccessToken()`, `signGuestRefreshToken()` |
| `Src/HelperFunctions/NeedsRefresh.js` | `flagNeedsRefresh()`, `clearNeedsRefresh()` |
| `Src/HelperFunctions/PreProcessingFunctions/buildSessionPayload.js` | Builds full login payload from userId |
| `Src/Apis/ProjectSpecificApis/AuthSessionRefresh/AuthSessionRefresh.js` | Session refresh endpoint |
| `Src/HelperFunctions/PreProcessingFunctions/Guest/verifyGuestOtp.js` | Guest OTP login |
| `Src/HelperFunctions/PostProcessingFunctions/LoginWithPassword/lwp.js` | Admin password login |
| `Src/HelperFunctions/PreProcessingFunctions/Guest/refreshGuestTokens.js` | Refresh token rotation |
| `Src/HelperFunctions/PayloadFunctions/AssignPermissions/assignPermissionsToUser.js` | Permission changes (triggers `flagNeedsRefresh`) |
