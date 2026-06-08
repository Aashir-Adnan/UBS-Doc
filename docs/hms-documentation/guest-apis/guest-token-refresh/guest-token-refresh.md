# Guest Token Refresh (Proactive Renewal)

When any authenticated API receives a valid guest access token that is **within 5 minutes of expiry**, the middleware automatically generates a fresh token and returns it in the response — no explicit refresh call required.

---

## How it works

The `accessTokenValidator` middleware (in `Services/Middlewares/config.js`) runs on every request that has `config.verification.accessToken: true`. After validating the JWT:

1. Decodes the token and reads `exp` (expiration timestamp).
2. Computes `timeRemaining = exp - now`.
3. If `timeRemaining <= TOKEN_RENEWAL_THRESHOLD_SECONDS` (default **300 seconds / 5 minutes**):
   - Generates a fresh JWT with the same claims and a new `exp`.
   - Stores the new token in `user_devices.device_token`.
   - Attaches it to `decryptedPayload.updatedToken`.
4. The `responseSender` middleware sets:
   - **Response header:** `x-new-accesstoken: <new JWT>`
   - **Response body:** `accessToken` field (inside the encrypted payload if encryption is on).

---

## Token TTL by type

| Token type | `typ` claim | TTL on renewal | Env override |
|---|---|---|---|
| Guest access | `guest_access` | `GUEST_ACCESS_TOKEN_SECONDS` (default **900s / 15 min**) | `GUEST_ACCESS_TOKEN_SECONDS` |
| Admin/staff access | *(none)* | `TOKEN_LIFETIME_MINUTES` (default **60 min**) | `TOKEN_LIFETIME_MINUTES` |

The `generateToken` function in `Services/SysFunctions/jwtUtils.js` detects the `typ` claim and applies the correct TTL.

---

## Client integration

### Reading the renewed token

After every authenticated API call, the client should check for the `x-new-accesstoken` response header:

```javascript
const response = await fetch(url, { headers: { accesstoken: currentToken } });
const newToken = response.headers.get('x-new-accesstoken');
if (newToken) {
    // Persist and use for subsequent requests
    currentToken = newToken;
}
```

### CORS

The `x-new-accesstoken` header is listed in `Access-Control-Expose-Headers` (configured in `Src/Config/Security/securityConfig.js`) so browser-based clients can read it.

### Fallback: explicit refresh

If the access token has already expired (client was offline/backgrounded), use the explicit refresh endpoint:

**POST** `/api/auth/refresh`

```json
{
    "refreshToken": "rfh_<jwt>"
}
```

Returns a new access + refresh token pair with token rotation (rotating `jti`, stable `familyId`).

---

## Environment variables

| Variable | Default | Description |
|---|---|---|
| `GUEST_ACCESS_TOKEN_SECONDS` | `900` (15 min) | Guest access token lifetime |
| `GUEST_REFRESH_TOKEN_SECONDS` | `5184000` (60 days) | Guest refresh token lifetime |
| `GUEST_REFRESH_TOKEN_DAYS` | *(fallback)* | Alternative to `GUEST_REFRESH_TOKEN_SECONDS` |
| `TOKEN_LIFETIME_MINUTES` | `60` | Admin/staff access token lifetime |
| `TOKEN_RENEWAL_THRESHOLD_SECONDS` | `300` (5 min) | Near-expiry threshold for proactive renewal |
| `SECRET_KEY` | *(required)* | JWT signing key |

---

## Middleware pipeline

```
Request with accesstoken header
  → accessTokenValidator
      → verifyToken (signature + expiry check)
      → if timeRemaining ≤ 300s: generateToken (fresh JWT)
  → ... processing ...
  → responseSender
      → if updatedToken: set x-new-accesstoken header
```

---

## Security notes

- **Token rotation on refresh**: The explicit refresh endpoint (`/api/auth/refresh`) rotates the `jti` claim and detects replay attacks. Proactive renewal (via middleware) only refreshes the access token — no refresh token rotation occurs.
- **Database sync**: Every renewed token is persisted to `user_devices.device_token`, ensuring the server always knows the latest valid token.
- **Replay detection**: The refresh flow uses `FOR UPDATE` row locks and `familyId` matching to detect concurrent or replayed refresh tokens (`409 refresh_replayed`).

---

## Sim test

The test script at `Services/SysScripts/TestScripts/sim/guestTokenRefresh.js` covers:

| # | Scenario | Expected |
|---|---|---|
| 1 | Fresh token (15 min TTL) | No `x-new-accesstoken` header |
| 2 | Near-expiry token (3 min TTL) | `x-new-accesstoken` header present |
| 3 | Renewed token validity | Valid JWT signature |
| 4 | Renewed token TTL | Fresh expiry (>300s remaining) |
| 5 | Renewed token claims | `typ=guest_access`, `userId`, `deviceId` preserved |
| 6 | Expired token | Request rejected |
| 7 | Boundary (exactly 300s) | Renewal triggered |

Run `guestOtpFlow.js` first to populate `credentials.json`, then run `guestTokenRefresh.js`.
