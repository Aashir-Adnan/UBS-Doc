---
sidebar_position: 2
---

# Authentication

## POST /api/LoginWithPassword

Authenticates a user with username and password. Returns a JWT `access_token` and full user context.

### Request

```http
POST /api/LoginWithPassword
Content-Type: application/json
```

```json
{
  "username": "john_doe",
  "password": "mySecret123"
}
```

| Field | Type | Required | Description |
|---|---|---|---|
| `username` | string | Yes | The user's username |
| `password` | string | Yes | The user's password (plaintext over HTTPS) |
| `device_name` | string | No | Name of the device making the request |

### Response — 200 OK

```json
{
  "success": true,
  "message": "Configuration generated successfully!",
  "data": {
    "user_id": 42,
    "user": {
      "user_id": 42,
      "username": "john_doe",
      "first_name": "John",
      "email": "john@example.com",
      "signIn_Flag": "password",
      "image_attachment_id": null,
      "user_image": "https://cdn.example.com/avatar.png"
    },
    "device_name": "Chrome / Windows",
    "access_token": "<jwt_token>",
    "user_roles_designations_departments": [
      {
        "user_id": 42,
        "email": "john@example.com",
        "user_role_designation_department_id": 7,
        "role_name": "Admin",
        "designation_name": "Manager",
        "department_name": "Operations"
      }
    ],
    "user_devices": [
      {
        "user_device_id": 3,
        "user_id": 42,
        "device_token": "<jwt_token>"
      }
    ],
    "user_devices_notifications": [],
    "user_roles": [
      { "role_id": 1, "role_name": "Admin" }
    ],
    "user_permissions": {
      "7": ["read_reports", "manage_users"]
    },
    "collective_user_permissions": [
      { "permission_id": 1, "permission_name": "read_reports" }
    ],
    "user_departments": [
      { "department_id": 2, "department_name": "Operations" }
    ],
    "user_designations": [
      { "designation_id": 5, "designation_name": "Manager" }
    ]
  }
}
```

### Error Responses

| Status | `message` | Cause |
|---|---|---|
| `401` | `"Incorrect Username or Password"` | No user found matching credentials |
| `400` | `"username is required"` | Missing required field |
| `500` | `"There was an error generating the configuration."` | Server-side exception |

---

## POST /api/ExtSignUp

Registers or signs in a user via an external OAuth provider (Google, Apple, or Firebase). The endpoint validates the provider's `idToken`, upserts the user record (insert or update on duplicate email), and returns the full login payload — identical to `POST /api/LoginWithPassword`.

**No encryption or access token** is required — the endpoint uses `PUBLIC_PLATFORM` (plain JSON, no AES).

### How it works

1. The **`signUpVerif` pre-processor** validates the `idToken` with the provider and extracts `{ userId, email, name, picture, source }`.
2. The query upserts into `users` (`ON DUPLICATE KEY UPDATE`) using the extracted email and name.
3. The **`loginWithPW` post-processor** runs the standard login flow (fetch user, device, roles, permissions, generate JWT) and returns the full user context.

### Request

```http
POST /api/ExtSignUp
Content-Type: application/json
```

```json
{
  "signUp_flag": "Google",
  "idToken": "<provider_id_token>"
}
```

| Field | Type | Required | Description |
|---|---|---|---|
| `signUp_flag` | string | Yes | OAuth provider identifier. One of: `"Google"`, `"Apple"` (or `"apple"`), `"Firebase"` |
| `idToken` | string | Yes | The ID token issued by the OAuth provider after the user consents |
| `device_name` | string | No | Device label stored for session tracking |

### Supported Providers

#### Google (`signUp_flag: "Google"`)

Validates via `https://oauth2.googleapis.com/tokeninfo?id_token=<token>`. Extracts `sub`, `email`, `name`, `picture` from the Google tokeninfo response.

No server-side configuration required.

#### Apple (`signUp_flag: "Apple"` or `"apple"`)

Validates the JWT signature against Apple's public JWKS (`https://appleid.apple.com/auth/keys`). Verifies:
- Algorithm: RS256
- Issuer: `https://appleid.apple.com`
- Audience: `APPLE_CLIENT_ID` or `APPLE_BUNDLE_ID` env var

The JWKS is cached for 1 hour. If `name` is not present in the token, falls back to the email prefix (e.g. `alice@example.com` -> `"alice"`).

| Env Var | Required | Description |
|---|---|---|
| `APPLE_CLIENT_ID` | Yes (or `APPLE_BUNDLE_ID`) | The Apple Services ID or Bundle ID used as the JWT audience |

#### Firebase (`signUp_flag: "Firebase"`)

Validates via Firebase Admin SDK (`auth().verifyIdToken()`). Extracts `uid`, `email`, `name`, `picture` from the decoded token. Falls back to `firebase.identities.email[0]` for email if the top-level claim is absent.

| Env Var | Required | Description |
|---|---|---|
| `FIREBASE_PROJECT_ID` | Yes | Firebase project ID |
| `FIREBASE_SERVICE_ACCOUNT_JSON` | One of these | Inline JSON string of the service account credentials |
| `FIREBASE_SERVICE_ACCOUNT_PATH` | One of these | File path to the service account JSON |
| `GOOGLE_APPLICATION_CREDENTIALS` | One of these | Standard GCP ADC path (uses `applicationDefault()`) |

### Response — 200 OK

Same structure as `POST /api/LoginWithPassword` — returns full user context with `access_token`, `user_roles_designations_departments`, `user_permissions`, etc.

```json
{
  "success": true,
  "message": "Configuration generated successfully!",
  "data": {
    "user_id": 42,
    "user": {
      "user_id": 42,
      "username": "Alice",
      "first_name": "Alice",
      "email": "alice@example.com",
      "signIn_Flag": "Google",
      "user_image": null
    },
    "access_token": "<jwt_token>",
    "user_roles_designations_departments": [ ... ],
    "user_permissions": { ... }
  }
}
```

### Error Responses

| Status | `message` / `error` | Cause |
|---|---|---|
| `400` | `"Unsupported signUp_flag"` | `signUp_flag` is not one of the supported providers |
| `400` | `"Apple verification failed: missing token kid"` | Apple `idToken` has no `kid` header |
| `400` | `"Apple verification failed: unknown token kid"` | Token's `kid` not found in Apple's JWKS |
| `400` | `"Apple verification failed: ..."` | Signature, issuer, or audience mismatch |
| `400` | `"Facebook verification not implemented yet"` | Facebook provider not yet supported |
| `400` | `"Microsoft verification not implemented yet"` | Microsoft provider not yet supported |
| `500` | `"There was an error generating the configuration."` | Server-side exception (token validation, DB, or login flow) |

### `signUpVerif` Pre-Processor — Internal Reference

**File:** `Src/HelperFunctions/PreProcessingFunctions/signUpVerif.js`

The `signUpVerif` function is the pre-processing step for external sign-up. It reads `signUp_flag` and `idToken` from the decrypted payload, dispatches to the appropriate provider verification logic, and returns a normalized result object that the query layer uses for the upsert.

**Input** (from `decryptedPayload`):

| Key | Type | Description |
|---|---|---|
| `signUp_flag` | string | Provider identifier (`"Google"`, `"Apple"`, `"apple"`, `"Firebase"`) |
| `idToken` | string | Raw ID token from the provider's OAuth/OIDC flow |

**Output** (stored as `decryptedPayload.signUpVerif`):

| Key | Type | Description |
|---|---|---|
| `success` | boolean | `true` if verification passed |
| `userId` | string | Provider-specific user ID (`sub` for Google/Apple, `uid` for Firebase) |
| `email` | string | Verified email address |
| `name` | string | Display name (falls back to email prefix for Apple if absent) |
| `picture` | string or null | Profile picture URL (null if unavailable) |
| `source` | string | Provider name (`"Google"`, `"Apple"`, `"Firebase"`) |
| `error` | string | Present only when `success: false` — describes the failure |

The query template in `extSignUp.js` reads `decryptedPayload.signUpVerif.name` and `.email` to build the `INSERT ... ON DUPLICATE KEY UPDATE` into the `users` table. The `signUp_flag` is stored in `users.signIn_Flag`.

**Unit tests:** `Services/SysScripts/TestScripts/signUpVerif.test.js` — covers Apple success, missing token, unknown kid, and audience mismatch scenarios using mocked JWKS.

---

## POST /api/ForgotPassword — Step 1: Request OTP

Sends a one-time password (OTP) to the user's registered email address.

### Request

```http
POST /api/ForgotPassword
Content-Type: application/json
```

```json
{
  "email": "john@example.com",
  "step": 1
}
```

| Field | Type | Required | Description |
|---|---|---|---|
| `email` | string | Yes | Registered email address |

### Response — 200 OK

```json
{
  "success": true,
  "message": "OTP sent to email successfully!",
  "data": {}
}
```

### Error Responses

| Status | `message` | Cause |
|---|---|---|
| `404` | `"No user found with this email"` | Email not registered |
| `400` | `"email is required"` | Missing field |
| `500` | `"There was an error emailing the OTP."` | Email delivery failure |

---

## POST /api/ForgotPassword — Step 2: Verify OTP

Verifies the OTP and returns an `access_token` to allow the client to set a new password.

### Request

```http
POST /api/ForgotPassword
Content-Type: application/json
```

```json
{
  "email": "john@example.com",
  "otp": "847261",
  "step": 2
}
```

| Field | Type | Required | Description |
|---|---|---|---|
| `email` | string | Yes | Same email used in Step 1 |
| `otp` | string | Yes | 6-digit OTP received by email |

### Response — 200 OK

```json
{
  "success": true,
  "message": "OTP verified successfully!",
  "data": {
    "access_token": "<jwt_token>"
  }
}
```

### Error Responses

| Status | `message` | Cause |
|---|---|---|
| `401` | `"Invalid OTP"` | OTP does not match or has expired |
| `400` | `"email is required"` / `"otp is required"` | Missing field |
| `500` | `"There was an error verifying the OTP."` | Server-side exception |
