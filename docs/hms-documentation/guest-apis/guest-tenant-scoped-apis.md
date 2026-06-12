# Guest Tenant-Scoped APIs

This page lists every guest API endpoint that requires the `actionPerformerURDD` to be a **tenant-specific URDD** — meaning the guest must supply the URDD for the hotel they are interacting with, not their global (null-tenant) URDD.

---

## How It Works

All endpoints below use **AUTH_PLATFORM** (encrypted + JWT required) and run `ensureGuestUrdd` as the first preProcess function. This function:

1. Extracts `actionPerformerURDD` from the request body or query.
2. Validates that it belongs to the authenticated `userId` and is active.
3. Resolves `tenant_id` from the URDD row and stamps it onto `decryptedPayload`.

If the URDD is invalid, expired, or doesn't belong to the user, the API returns **403 Forbidden**.

### Where Does the Guest Get Their Tenant URDD?

- **At signup** — `POST /api/guest/auth/signup` eagerly creates URDDs for all active hotels and returns the full `tenantUrddMap`.
- **At OTP verify** — `POST /api/guest/verify/otp` returns the same `tenantUrddMap`.
- **On demand** — `POST /api/guest/auth/ensure-urdd` creates a URDD for a specific hotel if one doesn't exist yet (e.g. a new hotel was added after signup).
- **Admin-created** — `POST /api/admin/create/guest/user` returns `hotelUrddId` for the specific hotel.

The mobile/web client stores the `tenantUrddMap` locally and sends the correct URDD per hotel on every request.

---

## Complete Endpoint List

### Bookings — Create

| Endpoint | Method | preProcessFunctions |
|---|---|---|
| `/api/guest/bookings/room` | POST | `ensureGuestUrdd` → `createRoomBooking` |
| `/api/guest/bookings/package` | POST | `ensureGuestUrdd` → `createPackageBooking` |
| `/api/guest/bookings/service` | POST | `ensureGuestUrdd` → `createServiceBooking` |

### Bookings — Read

| Endpoint | Method | preProcessFunctions |
|---|---|---|
| `/api/guest/bookings` | GET | `ensureGuestUrdd` |
| `/api/guest/bookings/upcoming` | GET | `ensureGuestUrdd` |
| `/api/guest/bookings/current` | GET | `ensureGuestUrdd` |
| `/api/guest/bookings/folio` | GET | `ensureGuestUrdd` |

### Bookings — Lifecycle

| Endpoint | Method | preProcessFunctions |
|---|---|---|
| `/api/guest/booking/checkin` | POST | `ensureGuestUrdd` → `performCheckin` |
| `/api/guest/booking/checkout` | POST | `ensureGuestUrdd` → `performCheckout` |
| `/api/guest/booking/cancel` | POST | `ensureGuestUrdd` → `computeCancellationFee` |
| `/api/guest/booking/reschedule` | PUT | `ensureGuestUrdd` → `rescheduleBookingService` |
| `/api/guest/booking/checkin/eligibility` | GET | `ensureGuestUrdd` → `preProcess` |

### Booking Services (Addons)

| Endpoint | Method | preProcessFunctions |
|---|---|---|
| `/api/guest/bookings/{id}/services` | POST | `ensureGuestUrdd` → `addBookingServices` |
| `/api/guest/bookings/{id}/services` | PUT | `ensureGuestUrdd` → `rescheduleBookingService` |
| `/api/guest/bookings/{id}/services` | DELETE | `ensureGuestUrdd` → `removeBookingService` |

### Scheduler

| Endpoint | Method | preProcessFunctions |
|---|---|---|
| `/api/guest/scheduler` | GET | `ensureGuestUrdd` → `preProcessList` |

### Profile & Identity

| Endpoint | Method | preProcessFunctions |
|---|---|---|
| `/api/guest/profile` | GET | `ensureGuestUrdd` |
| `/api/guest/profile` | PUT | `ensureGuestUrdd` |
| `/api/guest/profile/image` | POST | `ensureGuestUrdd` → `uploadGuestProfileImage` |
| `/api/guest/onboarding/kyc` | POST | `ensureGuestUrdd` → `submitGuestKyc` |

### Documents

| Endpoint | Method | preProcessFunctions |
|---|---|---|
| `/api/fetch/guest/documents` | GET | `ensureGuestUrdd` → `loadGuestDocuments` |
| `/api/fetch/guest/document/tags` | GET | `ensureGuestUrdd` → `loadDocumentTags` |

### Loyalty

| Endpoint | Method | preProcessFunctions |
|---|---|---|
| `/api/guest/loyalty` | GET | `ensureGuestUrdd` → `loadGuestLoyalty` |
| `/api/guest/loyalty/redeem` | POST | `ensureGuestUrdd` → `redeemReward` |

### QR

| Endpoint | Method | preProcessFunctions |
|---|---|---|
| `/api/guest/qr/issue` | POST | `ensureGuestUrdd` → `issueGuestQrToken` |

### AI Assistant

| Endpoint | Method | preProcessFunctions |
|---|---|---|
| `/api/guest/assistant/threads` | GET | `ensureGuestUrdd` → `hydrateGuestAssistantThreadView` |
| `/api/guest/assistant/threads` | DELETE | `softDeleteGuestAssistantThread` |
| `/api/guest/assistant/messages` | POST | `ensureGuestUrdd` → `processGuestAssistantMessage` |

### Networking

| Endpoint | Method | preProcessFunctions |
|---|---|---|
| `/api/guest/networking/details` | GET | `ensureGuestUrdd` → `preProcessValidate` |

---

## Endpoints That Do NOT Require a Tenant URDD

The following guest endpoints use **PUBLIC_ENCRYPTED_PLATFORM** (no JWT, no URDD) or handle auth differently:

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
