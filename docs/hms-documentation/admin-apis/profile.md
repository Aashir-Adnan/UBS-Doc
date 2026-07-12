# Profile (Self)

| Operation | Method | Path | Permission |
|---|---|---|---|
| List (read own profile) | GET | `/api/profile` | None (`permission: null`) |
| Update (edit own profile) | PUT | `/api/profile` | None (`permission: null`) |

Lets a signed-in admin/user read and edit **only their own** profile. The acting identity comes from `actionPerformerURDD`; the real `users.user_id` is resolved server-side, so a client can never target another user's row.

---

## Authentication & Authorization

Encrypted with **platform encryption + access token** (`platformEncryption: true`, `accessToken: true`). No RBAC permission is required.

Authorization is **self-scoping**, not permission-based:

- The acting `actionPerformerURDD` is resolved to a real `users.user_id` via the active URDD row (`resolveSelfUserId` → `profileUserId`).
- Every query is hard-scoped to `WHERE users.user_id = <profileUserId>` — there is no client-supplied `id`.
- The token's `userId` is deliberately **not trusted** (on the encrypted admin platform it is the base-token user, often system user 1).
- A missing/invalid `actionPerformerURDD` returns **401**; a URDD that resolves to no active user returns **403**.

**Add and Delete are not wired** — a user cannot create or delete their account through this endpoint.

---

## Request Payload

### Update (PUT)

Send only the fields being changed — a **dynamic SET** builder writes just the fields present, leaving omitted columns intact.

| Field | Type | Required | Description |
|---|---|---|---|
| `actionPerformerURDD` | `number` | Yes | Acting URDD — resolves the self user id. |
| `users_firstName` | `string` | No | First name. |
| `users_lastName` | `string` | No | Last name. |
| `users_email` | `string` | No | Login email. Self-editable, but guarded for uniqueness (see Behavior). |
| `users_phoneNo` | `string` | No | Phone number. |
| `users_cnic` | `string` | No | CNIC. |
| `users_passportNumber` | `string` | No | Passport number. |
| `users_nationality` | `string` | No | Nationality. |
| `users_gender` | `string` | No | Gender. |
| `users_dateOfBirth` | `date` | No | Date of birth. |
| `users_imageAttachmentId` | `number` | No | Profile image attachment id. |
| `users_address` | `string` | No | Address. |
| `users_city` | `string` | No | City. |
| `users_country` | `string` | No | Country. |
| `users_postalCode` | `string` | No | Postal code. |
| `users_preferences` | `string` | No | Preferences. |

Not self-editable (rejected/ignored by design): `username`, `password`, `status`, `is_primary_tenant`, `created_by`.

```json
{
  "actionPerformerURDD": 42,
  "users_firstName": "Layla",
  "users_phoneNo": "+966500000000",
  "users_city": "Riyadh"
}
```

### List (GET)

Send `actionPerformerURDD` (typically via the encrypted header/query). No other parameters.

---

## Response

### List (read own profile)

```json
{
  "success": true,
  "user_id": 25,
  "username": "layla.nasser",
  "first_name": "Layla",
  "last_name": "Nasser",
  "email": "layla.nasser@marasi.com",
  "phone_no": "+966500000000",
  "cnic": null,
  "passport_number": null,
  "nationality": "SA",
  "gender": "female",
  "date_of_birth": null,
  "image_attachment_id": 118,
  "address": null,
  "city": "Riyadh",
  "country": "SA",
  "postal_code": null,
  "preferences": null,
  "status": "active",
  "created_at": "2026-01-10T09:00:00.000Z",
  "updated_at": "2026-06-30T14:22:00.000Z"
}
```

Returns `null` if no profile row is found. Fields map directly to the `users` table columns for the resolved self user.

### Update

```json
{ "success": true, "message": "Profile updated successfully." }
```

---

## Behavior

- **Self resolution.** `resolveSelfUserId` reads `actionPerformerURDD`, looks up the active URDD, and stashes the real `user_id` as `profileUserId`. All queries scope on that integer id (injected directly, coercion-safe) — never a client parameter.
- **Partial-safe update.** The Update query is built dynamically from only the fields present in the payload, plus `updated_by` and `updated_at`. Omitted fields are left untouched (a full-row template would null them out).
- **Email uniqueness guard.** When `users_email` is being changed, `assertProfileEmailUnique` checks all other users (matching the DB unique index `uk_users_email`) and returns a clean **409** if the address is already taken, instead of a raw duplicate-key error. No-op when email is absent/blank.

---

## Source Files

| File | Purpose |
|---|---|
| `Src/Apis/ProjectSpecificApis/Profile/Profile.js` | API object — self-resolution, email guard, dynamic-SET update, List/Update queries and response shapers. |
| `Src/Apis/ProjectSpecificApis/Profile/CRUD_parameters.js` | Request field schema (editable profile fields). |
