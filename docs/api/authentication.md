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

Registers or updates a user via external OAuth sign-up (e.g. Google, Apple). If the email already exists the record is updated (upsert). On success, returns the same payload as `LoginWithPassword`.

### Request

```http
POST /api/ExtSignUp
Content-Type: application/json
```

The body is processed by a pre-processor (`signUpVerif`) that validates the OAuth token and extracts user info. The raw fields sent depend on the OAuth provider but must resolve to:

| Field (resolved internally) | Type | Description |
|---|---|---|
| `name` | string | Display name from OAuth provider |
| `email` | string | Email address from OAuth provider |
| `signUp_flag` | string | Sign-in method flag (e.g. `"google"`, `"apple"`) |

### Response — 200 OK

Same structure as `POST /api/LoginWithPassword` — returns full user context with `access_token`.

### Error Responses

| Status | `message` | Cause |
|---|---|---|
| `400` | `"There was an error generating the configuration."` | OAuth token invalid or user data extraction failed |
| `500` | `"There was an error generating the configuration."` | Server-side exception |

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
