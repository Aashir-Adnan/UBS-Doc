# Guest Profile

Read and edit the signed-in guest's own account record, plus the `username` field that can
optionally be set at signup.

---

## Endpoints Overview

| Method | Path | Description |
|---|---|---|
| `POST` | `/api/guest/auth/signup` | Create a guest account (optionally with a `username`) |
| `GET` | `/api/guest/profile` | Read own profile |
| `PUT` | `/api/guest/profile` | Edit own profile |

---

## Authentication

`/api/guest/profile` requires the **AUTH_PLATFORM** (guest JWT). The acting identity is
`actionPerformerURDD`; the real `user_id` is resolved **server-side** from that URDD by the
`ensureGuestUrdd` pre-process and every query is scoped to it. A `userId` sent in the body is
overwritten, so a client cannot target another guest's row.

`/api/guest/auth/signup` uses **PUBLIC_ENCRYPTED_PLATFORM** — platform encryption, no access token.

---

## The `username` field

`username` is an **optional display handle**. It is deliberately *not* a login identity — guests
authenticate by email OTP, and `users.username` carries no unique index. Two guests may hold the
same username, and nothing resolves an account by it.

| | |
|---|---|
| Max length | **100 characters** — longer is rejected with `400` |
| Blank / omitted | stored as `NULL`, returned as `null` |
| Whitespace | trimmed on write |
| Uniqueness | **not enforced** |

:::note Field naming differs between the two endpoints
Signup takes a flat **`username`**. The profile CRUD takes the prefixed
**`users_userName`**, matching its other keys (`users_firstName`, `users_phoneNo`, …). Both write
the same column, and both read back as **`username`** in the response body.
:::

---

## Signup

**POST** `/api/guest/auth/signup`

```json
{
  "first_name": "Ada",
  "last_name": "Lovelace",
  "email": "ada@example.com",
  "phone": "+966500000000",
  "nationality": "Saudi Arabia",
  "passport_number": "A1234567",
  "username": "ada_l"
}
```

Only `first_name` and `email` are required; `username` is optional.

**Success — 200**

```json
{
  "success": true,
  "data": {
    "user_id": 4242,
    "username": "ada_l",
    "email": "ada@example.com",
    "tenantUrddMap": { "88": 601, "86": 602 }
  },
  "meta": { "message": "Signup successful", "status": 200 }
}
```

### Errors

| Status | Cause | `meta.detail` |
|---|---|---|
| 400 | `username` longer than 100 characters | `username must be 100 characters or fewer` |
| 400 | missing `first_name` or `email` | `first_name and email are required` |
| 400 | malformed / disposable / unroutable email | varies |
| 409 | email already registered | `Email already exists` (`scc: DUPLICATE`) |

Validation runs **before** any write, so a rejected signup creates no user row.

---

## Read own profile

**GET** `/api/guest/profile?actionPerformerURDD=601`

**Success — 200**

```json
{
  "success": true,
  "data": {
    "id": 5,
    "user_id": 5,
    "username": "ada_l",
    "first_name": "Ada",
    "last_name": "Lovelace",
    "phone": "+966500000000",
    "email": "ada@example.com",
    "country": "Saudi Arabia",
    "nationality": "Saudi Arabia",
    "date_of_birth": "1990-04-01",
    "gender": "female",
    "passport_number": "A1234567",
    "image_attachment_id": 325,
    "created_at": "2026-01-14T15:30:00.000Z"
  },
  "meta": { "message": "Profile fetched", "status": 200 }
}
```

Returns `null` data when the user row is missing or not `active`.

---

## Edit own profile

**PUT** `/api/guest/profile`

```json
{
  "actionPerformerURDD": 601,
  "users_userName": "ada_l",
  "users_firstName": "Ada",
  "users_lastName": "Lovelace",
  "users_phoneNo": "+966500000000",
  "users_email": "ada@example.com",
  "users_country": "Saudi Arabia",
  "users_nationality": "Saudi Arabia",
  "users_dateOfBirth": "1990-04-01",
  "users_gender": "female",
  "users_passportNumber": "A1234567",
  "users_imageAttachmentId": 325
}
```

### Editable fields

| Body key | Column |
|---|---|
| `users_userName` | `username` |
| `users_firstName` | `first_name` |
| `users_lastName` | `last_name` |
| `users_phoneNo` | `phone_no` |
| `users_email` | `email` |
| `users_country` | `country` |
| `users_nationality` | `nationality` |
| `users_dateOfBirth` | `date_of_birth` |
| `users_gender` | `gender` |
| `users_passportNumber` | `passport_number` |
| `users_imageAttachmentId` | `image_attachment_id` |

Anything not on this list is ignored. `password`, `status` and `created_by` are **not**
self-editable through this endpoint.

:::tip Partial updates are safe — send only what changed
The update writes **only the keys present in the request**. Omitting a field leaves that column
exactly as it was, so a rename can be a one-key request:

```json
{ "actionPerformerURDD": 601, "users_userName": "ada_lovelace" }
```

To **clear** a field, send it explicitly as `null` — omitting it is "don't touch", not "erase".
:::

**Success — 200** — returns the full profile, re-read after the write, in the same shape as `GET`:

```json
{
  "success": true,
  "data": {
    "id": 5,
    "user_id": 5,
    "username": "ada_lovelace",
    "first_name": "Ada",
    "last_name": "Lovelace",
    "phone": "+966500000000",
    "email": "ada@example.com",
    "country": "Saudi Arabia",
    "nationality": "Saudi Arabia",
    "date_of_birth": "1990-04-01",
    "gender": "female",
    "passport_number": "A1234567",
    "image_attachment_id": 325
  },
  "meta": { "message": "Profile fetched", "status": 200 }
}
```

### Errors

| Status | `scc` | Cause |
|---|---|---|
| 400 | `E10` | `actionPerformerURDD` missing |
| 401 | — | the URDD resolves to no user |
| 403 | — | the URDD does not belong to the authenticated token's user |
| 403 | — | the URDD's hotel is deactivated |
