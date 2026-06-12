# Admin Create Guest User

**POST** `/api/admin/create/guest/user`

Creates a guest user account on behalf of a walk-in guest. The desk clerk collects the guest's details, creates their user record, and provisions all necessary URDDs (global + per-tenant) so the guest can immediately be booked into services.

---

## Authentication & Authorization

Uses **PUBLIC_ENCRYPTED_PLATFORM** — encrypted request/response using the platform key only. No guest JWT is required (the admin is the actor, not the guest).

### Admin URDD Constraint

The `actionPerformerURDD` must resolve to a URDD with **all three** of the following:

| Dimension | Required Value |
|---|---|
| Role | `Admin` |
| Designation | `TENANT` |
| Department | `TENANT_<hotel_code>` (e.g. `TENANT_HOTEL1`) |

The URDD's `tenant_id` must also match the `hotelId` in the request. Any mismatch returns **403 Forbidden**.

---

## Request Payload

| Field | Type | Required | Description |
|---|---|---|---|
| `actionPerformerURDD` | `number` | Yes | The admin/desk-clerk's URDD ID for this hotel |
| `hotelId` | `number` | Yes | Hotel tenant ID where the guest is being registered |
| `first_name` | `string` | Yes | Guest's first name |
| `last_name` | `string` | No | Guest's last name |
| `email` | `string` | Yes | Guest's email address (must be unique across the system) |
| `phone` | `string` | No | Guest's phone number |
| `nationality` | `string` | No | Guest's nationality |
| `passport_number` | `string` | No | Passport number (uppercase alphanumeric, max 9 chars) |

### Example

```json
{
  "actionPerformerURDD": 42,
  "hotelId": 3,
  "first_name": "John",
  "last_name": "Doe",
  "email": "john.doe@example.com",
  "phone": "+971501234567",
  "nationality": "US",
  "passport_number": "AB1234567"
}
```

---

## Response

```json
{
  "user_id": 25,
  "email": "john.doe@example.com",
  "hotelUrddId": 81,
  "tenantUrddMap": {
    "global": 79,
    "3": 81,
    "5": 82
  }
}
```

| Field | Type | Description |
|---|---|---|
| `user_id` | `number` | The newly created user's ID |
| `email` | `string` | The guest's email (normalized to lowercase) |
| `hotelUrddId` | `number` | The guest's URDD for the requesting hotel — use this as `guestUrddId` when creating bookings |
| `tenantUrddMap` | `object` | Map of all tenant URDDs: `"global"` key for the null-tenant URDD, string tenant IDs for per-hotel URDDs |

---

## What Gets Created

1. **User record** in the `users` table with `created_by` set to the admin's URDD.
2. **Global URDD** (null-tenant) on the default guest RDD (`role=default, designation=default, department=default`).
3. **Per-tenant URDDs** for every active hotel in the system (same default guest RDD, one per tenant). This is the same eager provisioning used by the self-service guest signup flow.

---

## Error Responses

| Status | Condition |
|---|---|
| 400 | Missing `first_name` or `email`, invalid email format, invalid passport format |
| 403 | `actionPerformerURDD` does not have the required Admin/TENANT role for this hotel |
| 404 | Hotel (`hotelId`) not found |
| 409 | Email already exists in the system |

---

## Typical Desk Clerk Flow

1. Guest walks in without an existing account.
2. Desk clerk calls **POST `/api/admin/create/guest/user`** with guest details.
3. Response includes `hotelUrddId` — the guest's URDD for this hotel.
4. Desk clerk immediately calls **POST `/api/admin/create/guest/booking`** using that `hotelUrddId` as `guestUrddId` to create a booking.

---

## Source Files

| File | Purpose |
|---|---|
| `Src/Apis/ProjectSpecificApis/GuestSpecificApis/AdminCreateGuestUser/AdminCreateGuestUser.js` | API object definition |
| `Src/Apis/ProjectSpecificApis/GuestSpecificApis/AdminCreateGuestUser/CRUD_parameters.js` | Request parameter schema |
| `Src/HelperFunctions/PreProcessingFunctions/Guest/validateAdminForTenant.js` | Admin authorization validator |
| `Src/HelperFunctions/PreProcessingFunctions/Guest/adminCreateGuestUser.js` | User + URDD creation logic |
