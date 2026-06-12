# Guest APIs — URDD & Tenant Scoping

Every authenticated guest API runs `ensureGuestUrdd` to validate the `actionPerformerURDD`. However, **not all of them require a tenant-specific URDD**. Some only need a valid URDD (including the global null-tenant one), while others use the resolved `tenant_id` in their queries and will break without it.

This page classifies every authenticated guest endpoint by its actual tenant requirement.

---

## How `ensureGuestUrdd` Works

1. Extracts `actionPerformerURDD` from the request body or query.
2. Validates that it belongs to the authenticated `userId` and is active.
3. Resolves `tenant_id` from the URDD row and stamps it onto `decryptedPayload`.

The `tenant_id` can be **NULL** if the guest sends their global URDD. Whether that matters depends on what the downstream preProcess function does with it.

### Where Does the Guest Get Their Tenant URDD?

- **At signup** — `POST /api/guest/auth/signup` eagerly creates URDDs for all active hotels and returns the full `tenantUrddMap`.
- **At OTP verify** — `POST /api/guest/verify/otp` returns the same `tenantUrddMap`.
- **On demand** — `POST /api/guest/auth/ensure-urdd` creates a URDD for a specific hotel if one doesn't exist yet (e.g. a new hotel was added after signup).
- **Admin-created** — `POST /api/admin/create/guest/user` returns `hotelUrddId` for the specific hotel.

The mobile/web client stores the `tenantUrddMap` locally and sends the correct URDD per hotel on every request.

---

## Tenant-Specific URDD Required

These endpoints use `tenant_id` in WHERE clauses, INSERT statements, or business logic. Sending the global (null-tenant) URDD will cause query failures or incorrect data.

### Bookings — Create

| Endpoint | Method | Why tenant_id is needed |
|---|---|---|
| `/api/guest/bookings/room` | POST | Inserted into `bookings.tenant_id`; used for service/unit resolution |
| `/api/guest/bookings/package` | POST | Inserted into `bookings.tenant_id`; validates package belongs to hotel |
| `/api/guest/bookings/service` | POST | Inserted into `bookings.tenant_id`; validates service belongs to hotel |

### Booking Services (Addons)

| Endpoint | Method | Why tenant_id is needed |
|---|---|---|
| `/api/guest/bookings/{id}/services` | POST | `addBookingServices` verifies booking ownership via `tenant_id` |
| `/api/guest/bookings/{id}/services` | DELETE | `removeBookingService` filters `WHERE tenant_id = ?` |
| `/api/guest/bookings/{id}/services` | PUT | `rescheduleBookingService` uses `tenant_id` in booking lookup |

### Bookings — Read (Tenant-Filtered)

| Endpoint | Method | Why tenant_id is needed |
|---|---|---|
| `/api/guest/bookings/folio` | GET | Query filters `WHERE b.tenant_id = {{tenant_id}}` |
| `/api/guest/booking/checkin/eligibility` | GET | Query filters `WHERE b.tenant_id = ?` |

### Profile & Identity

| Endpoint | Method | Why tenant_id is needed |
|---|---|---|
| `/api/guest/profile/image` | POST | Inserted into `attachments.tenant_id` |
| `/api/guest/onboarding/kyc` | POST | Inserted into `guest_passport_documents.tenant_id` |

### Loyalty

| Endpoint | Method | Why tenant_id is needed |
|---|---|---|
| `/api/guest/loyalty` | GET | Queries `guest_profiles WHERE tenant_id = ?` and tenant-specific packages |
| `/api/guest/loyalty/redeem` | POST | Uses `tenant_id` for tenant-scoped reward lookup (has fallback logic) |

### QR

| Endpoint | Method | Why tenant_id is needed |
|---|---|---|
| `/api/guest/qr/issue` | POST | Verifies booking ownership via `tenant_id`; included in JWT claims |

### Networking

| Endpoint | Method | Why tenant_id is needed |
|---|---|---|
| `/api/guest/networking/details` | GET | Query uses `JSON_CONTAINS(hck.tenant_id, CAST({{tenant_id}} AS JSON))` |

### AI Assistant

| Endpoint | Method | Why tenant_id is needed |
|---|---|---|
| `/api/guest/assistant/messages` | POST | Inserted into `guest_assistant_threads.tenant_id` |

---

## Any Valid URDD Accepted (Including Global)

These endpoints run `ensureGuestUrdd` to validate the URDD is real and active, but their downstream logic **does not use `tenant_id`**. They filter by `urdd_id`, `userId`, or other non-tenant columns. The global (null-tenant) URDD works fine.

### Bookings — Read (URDD-Filtered)

| Endpoint | Method | Filtered by |
|---|---|---|
| `/api/guest/bookings` | GET | `bookings.urdd_id = {{actionPerformerURDD}}` |
| `/api/guest/bookings/upcoming` | GET | `bookings.urdd_id = {{actionPerformerURDD}}` |
| `/api/guest/bookings/current` | GET | `bookings.urdd_id = {{actionPerformerURDD}}` |

### Bookings — Lifecycle

| Endpoint | Method | Filtered by |
|---|---|---|
| `/api/guest/booking/checkin` | POST | `booking_id` + `urdd_id` |
| `/api/guest/booking/checkout` | POST | `booking_id` + `urdd_id` |
| `/api/guest/booking/cancel` | POST | `booking_id` + `urdd_id` |
| `/api/guest/booking/reschedule` | PUT | `booking_id` + `urdd_id` |

### Profile

| Endpoint | Method | Filtered by |
|---|---|---|
| `/api/guest/profile` | GET | `users.user_id = {{userId}}` |
| `/api/guest/profile` | PUT | `users.user_id = {{userId}}` |

### Scheduler

| Endpoint | Method | Filtered by |
|---|---|---|
| `/api/guest/scheduler` | GET | `categoryId` + date range (no tenant filter) |

### Documents

| Endpoint | Method | Filtered by |
|---|---|---|
| `/api/fetch/guest/documents` | GET | `user_id` via guest profile |
| `/api/fetch/guest/document/tags` | GET | Global tags, no filtering |

### AI Assistant — Threads

| Endpoint | Method | Filtered by |
|---|---|---|
| `/api/guest/assistant/threads` | GET | `user_id` |
| `/api/guest/assistant/threads` | DELETE | `thread_id` + `user_id` |

---

## Endpoints That Do NOT Use `ensureGuestUrdd`

These endpoints use **PUBLIC_ENCRYPTED_PLATFORM** (no JWT, no URDD) or handle auth differently:

| Endpoint | Method | Platform | Purpose |
|---|---|---|---|
| `/api/guest/auth/signup` | POST | PUBLIC_ENCRYPTED | Create guest account |
| `/api/guest/send/otp` | POST | PUBLIC_ENCRYPTED | Send login OTP |
| `/api/guest/verify/otp` | POST | PUBLIC_ENCRYPTED | Verify OTP, get tokens |
| `/api/auth/refresh` | POST | PUBLIC_ENCRYPTED | Refresh access token |
| `/api/guest/auth/ensure-urdd` | POST | AUTH | Create URDD for a new hotel |
| `/api/guest/hotels` | GET | PUBLIC_ENCRYPTED | List hotels |
| `/api/guest/availability` | GET | PUBLIC_ENCRYPTED | Check room/package availability |
| `/api/guest/search/filter` | GET | PUBLIC_ENCRYPTED | Search rooms/packages/services |
| `/api/guest/hotel-services` | GET | PUBLIC_ENCRYPTED | Fetch hotel service catalog |
| `/api/admin/create/guest/user` | POST | PUBLIC_ENCRYPTED | Admin creates guest account |
| `/api/admin/create/guest/booking` | POST | PUBLIC_ENCRYPTED | Admin creates guest booking |

---

## Source

- Validator: `Src/HelperFunctions/PreProcessingFunctions/Guest/ensureGuestUrdd.js`
- URDD list builder: `Src/HelperFunctions/PreProcessingFunctions/Guest/buildGuestUrddList.js`
- Default RDD resolver: `Src/HelperFunctions/PreProcessingFunctions/Guest/getDefaultRddId.js`
