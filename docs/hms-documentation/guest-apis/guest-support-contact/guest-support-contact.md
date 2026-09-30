# Guest Support Contact

**POST** `/api/guest/support/contact`

Creates a support ticket for the authenticated guest. The endpoint is **idempotent by required header**, so a retried submission — after a dropped connection or an impatient second tap — returns the original ticket instead of opening a duplicate.

---

## Authentication

Uses **AUTH_PLATFORM** — AES-ECB with the guest access token plus the platform key. A valid guest JWT is required; the ticket is attributed to the `userId` carried in that token, never to a value sent in the body.

The endpoint declares no permission — holding a valid guest session is the whole check.

---

## Request

### Headers

| Header | Required | Description |
|---|---|---|
| `Idempotency-Key` | **Yes** | Client-generated key that de-duplicates retries. Trimmed and truncated to 64 characters. A request without it is rejected with `422`. |

### Body Parameters

| Parameter | Type | Required | Description |
|---|---|---|---|
| `category` | `string` | Yes | One of `booking`, `payment`, `kyc`, `service`, `other`. |
| `subject` | `string` | Yes | Short summary. Trimmed, then truncated to 255 characters. |
| `message` | `string` | Yes | Ticket body. Trimmed, and must be **at least 10 characters** after trimming. |
| `bookingId` | `number` | No | Links the ticket to a booking. When present must be a positive number. |

### Example

```
POST /api/guest/support/contact
Idempotency-Key: 8f3c1b90-7c2e-4d55-9c41-2b0a6d9f1e77
```

```json
{
  "category": "booking",
  "subject": "Late check-in for reservation 10842",
  "message": "My flight lands at 01:30, so I will arrive well after the stated check-in window. Can the front desk hold the room?",
  "bookingId": 10842
}
```

---

## Response

### Success (201)

```json
{
  "ticketId": 4417
}
```

A replayed request carrying the same `Idempotency-Key` returns the **same** `ticketId`, also with status `201`.

### Response Fields

| Field | Type | Description |
|---|---|---|
| `ticketId` | `number` | Primary key of the created — or previously created — ticket. |

### Error — Validation failed (422)

```json
{
  "statusCode": 422,
  "message": "validation_failed",
  "errorSource": "Guest Support Contact",
  "errorDescription": "message must be at least 10 characters",
  "scc": "E10"
}
```

`errorDescription` identifies which rule failed:

| `errorDescription` | Cause |
|---|---|
| `Idempotency-Key header required` | Header missing, or blank after trimming |
| `invalid user` | No usable `userId` on the session |
| `invalid category` | `category` absent or outside the allowed set |
| `subject required` | `subject` absent or empty after trimming |
| `message must be at least 10 characters` | `message` shorter than 10 characters after trimming |
| `invalid bookingId` | `bookingId` supplied but not a positive finite number |

### Error — Rate limited (429)

```json
{
  "statusCode": 429,
  "message": "rate_limited",
  "errorSource": "Guest Support Contact",
  "scc": "E52"
}
```

---

## Behaviour

### Idempotency

The `Idempotency-Key` is stored on the ticket row and scoped **per user**, so two different guests may use the same key without colliding.

Duplicate protection is enforced twice, deliberately:

1. **Before insert** — a lookup on `user_id` + `idempotency_key`. On a hit the existing `ticketId` is returned immediately.
2. **On insert failure** — if two concurrent requests race past step 1, the database unique constraint rejects the loser with `ER_DUP_ENTRY`. That error is caught, the row is re-read, and the winner's `ticketId` is returned.

Both paths answer `201`. A client cannot tell a replay from an original, and does not need to.

### Rate limiting — 5 tickets per hour

A guest may open **5 tickets per rolling hour**, counted as rows created by that `user_id` within `NOW() - INTERVAL 1 HOUR`. The sixth attempt returns `429`.

> **The duplicate check runs before the rate-limit check.** A guest who is already at the cap can still safely retry an in-flight submission — the replay short-circuits on the idempotency lookup and never reaches the counter. Only genuinely new tickets are throttled.

### Field handling

- `subject` is truncated to 255 characters rather than rejected, so an over-long subject succeeds silently in shortened form.
- `message` has a **minimum** of 10 characters and no maximum imposed here.
- Tickets are created with status `active`. Since 2026-09-30 `guest_support_tickets.status` is an
  ENUM — `active`, `inactive`, `closed`, `probation` — and the legacy `open` value was migrated to
  `active`. A staff reply closes a ticket through
  [Guest Support Tickets step 2](../guest-support-tickets/guest-support-tickets.md#staff-reply--step-2).
- `bookingId` is not validated against the `bookings` table by this endpoint — it is only checked for being a positive number.

---

## Related

- [Guest Support FAQs](../guest-support-faqs/guest-support-faqs.md) — self-service answers, sharing the same category enum
- [Guest Booking Flow](../guest-booking-flow/guest-booking-flow.md) — source of the optional `bookingId`

---

## Source Files

| File | Purpose |
|---|---|
| `Src/Apis/ProjectSpecificApis/GuestSpecificApis/GuestSupportContact/GuestSupportContact.js` | API object definition |
| `Src/Apis/ProjectSpecificApis/GuestSpecificApis/GuestSupportContact/CRUD_parameters.js` | Parameter schema |
| `Src/HelperFunctions/PreProcessingFunctions/Guest/guestSupportContactCreate.js` | Validation, idempotency, rate limiting, insert |
| `Src/HelperFunctions/PreProcessingFunctions/Guest/guestSupportCategories.js` | Shared category enum |

---

## Change Log

| Date | Change |
|---|---|
| 2026-09-29 | Initial documentation of the existing endpoint |
