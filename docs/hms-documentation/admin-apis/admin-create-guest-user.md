# Admin Create Guest User

**POST** `/api/admin/create/guest/user`

Creates or resolves a guest user account on behalf of a walk-in guest. The desk clerk collects the guest's details; if the email already exists, the existing user is reused and any missing URDDs are reconciled. The response shape is identical regardless of whether the user was just created or already existed — the admin always gets back a valid `hotelUrddId` ready for booking.

---

## Authentication & Authorization

Uses **PUBLIC_ENCRYPTED_PLATFORM** — encrypted request/response using the platform key only. No guest JWT is required (the admin is the actor, not the guest).

### Authorization (tenant staff + RBAC permission)

The `actionPerformerURDD` must resolve to **tenant staff of the requested hotel that holds the `add_users` permission**:

| Check | Required Value |
|---|---|
| Designation | `TENANT` |
| Department | `TENANT_<hotel_code>` (e.g. `TENANT_HOTEL1`) |
| `tenant_id` | must equal the `hotelId` in the request |
| Permission | `add_users` (active, in the actor's URDP) |

The **role is no longer hardcoded** — authorization follows RBAC. Both a **Tenant Admin** (`role = Admin`) and a **Tenant Manager** (`role = Manager`) qualify, because both carry `designation = TENANT` and hold `add_users`. Any other persona (guest, service manager) is rejected because it lacks the `TENANT` designation and/or the permission. Any mismatch returns **403 Forbidden**.

---

## Request Payload

| Field | Type | Required | Description |
|---|---|---|---|
| `actionPerformerURDD` | `number` | Yes | The admin/desk-clerk's URDD ID for this hotel |
| `hotelId` | `number` | Yes | Hotel tenant ID where the guest is being registered |
| `first_name` | `string` | Conditional | Guest's first name. Required when creating a new guest; ignored when email matches an existing user. |
| `last_name` | `string` | No | Guest's last name |
| `email` | `string` | Yes | Guest's email address. If a user with this email already exists, their account is reused (no duplicate created). |
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
| `user_id` | `number` | The user's ID (newly created or existing) |
| `email` | `string` | The guest's email (normalized to lowercase) |
| `hotelUrddId` | `number` | The guest's URDD for the requesting hotel — use this as `guestUrddId` when creating bookings |
| `tenantUrddMap` | `object` | Map of all tenant URDDs: `"global"` key for the null-tenant URDD, string tenant IDs for per-hotel URDDs |

---

## Behavior

The endpoint is **idempotent on email**. Three scenarios:

| Scenario | What happens |
|---|---|
| **User does not exist** | Creates user record + global URDD + per-tenant URDDs + URDP. |
| **User exists but URDDs are missing** | Reuses existing user. `reconcileGuestTenantUrdds` creates any missing per-tenant URDDs and syncs URDP. |
| **User exists and all URDDs exist** | Reuses existing user. Reconcile is a no-op. Returns existing URDDs. |

In all three cases, the **response shape is identical** — `user_id`, `email`, `hotelUrddId`, and `tenantUrddMap` are always returned.

### What Gets Created (new user path)

1. **User record** in the `users` table with `created_by` set to the admin's URDD.
2. **Global URDD** (null-tenant) on the consolidated global guest RDD (`Guest / STANDARD / GENERAL`).
3. **Per-tenant URDDs** for every **eligible** active hotel (excludes the platform/system tenant), each bound to **that tenant's own Guest RDD clone** (`Guest / STANDARD / TENANT_<code>`; falls back to the global guest RDD when a tenant has no clone yet). This reuses the exact same shared helper (`reconcileGuestTenantUrdds`) as guest self-signup and login — so an admin-created guest is identical to a self-signed-up one.
4. **URDP (per-user permissions)** materialized for each per-tenant guest URDD from that tenant's **`PG-STANDARD-GUEST`** permission group (per-tenant clone preferred, global fallback). This is currently a no-op because the guest group has no permissions seeded yet, but it keeps every guest in sync the moment guest permissions are added (also re-applied on signup and login).

> The same `reconcileGuestTenantUrdds` step runs on **guest signup** and **guest login**, so guests created before a tenant existed (or before guest permissions were seeded) are back-filled the next time they authenticate.

---

## Error Responses

| Status | Condition |
|---|---|
| 400 | Missing `email`, missing `first_name` (new user only), invalid email format, invalid passport format |
| 403 | `actionPerformerURDD` is not tenant staff (`TENANT` designation + `TENANT_<hotel_code>` department) for this hotel, or lacks the `add_users` permission |
| 404 | Hotel (`hotelId`) not found |

---

## Typical Desk Clerk Flow

1. Guest walks in (with or without an existing account).
2. Desk clerk calls **POST `/api/admin/create/guest/user`** with guest details. If the guest already has an account (same email), the existing user is reused — no error.
3. Response includes `hotelUrddId` — the guest's URDD for this hotel.
4. Desk clerk immediately calls **POST `/api/admin/create/guest/booking`** using that `hotelUrddId` as `guestUrddId` to create a booking.

---

## Source Files

| File | Purpose |
|---|---|
| `Src/Apis/ProjectSpecificApis/GuestSpecificApis/AdminCreateGuestUser/AdminCreateGuestUser.js` | API object definition |
| `Src/Apis/ProjectSpecificApis/GuestSpecificApis/AdminCreateGuestUser/CRUD_parameters.js` | Request parameter schema |
| `Src/HelperFunctions/PreProcessingFunctions/Guest/validateAdminForTenant.js` | Authorization validator — factory `validateAdminForTenant("add_users")`: tenant-staff + permission gate |
| `Src/HelperFunctions/PreProcessingFunctions/Guest/adminCreateGuestUser.js` | User + global URDD creation; delegates per-tenant URDDs + URDP to `reconcileGuestTenantUrdds` |
| `Src/HelperFunctions/PreProcessingFunctions/Guest/reconcileGuestTenantUrdds.js` | Shared helper (signup/login/admin-create): per-tenant guest URDDs + URDP resolve from `PG-STANDARD-GUEST` |
