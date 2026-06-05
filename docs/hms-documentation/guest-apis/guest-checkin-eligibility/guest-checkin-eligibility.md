# Guest Check-In Eligibility

**GET** `/api/guest/booking/checkin/eligibility`

Checks whether a guest is eligible to check in to a specific booking. This is a read-only probe — it does not modify the booking. All IDs are sent in the encrypted payload.

---

## Authentication

Requires the **AUTH_PLATFORM** (guest JWT). The `actionPerformerURDD` is validated via the `ensureGuestUrdd` pre-process step.

---

## Correct URL

The URL must be exactly `/api/guest/booking/checkin/eligibility` (singular `booking`, combined `checkin`).

**Common mistake:** `/api/guest/bookings/check/in/eligibility` resolves to a different (non-existent) object name and returns 404.

---

## Request Payload

Sent in the encrypted request body.

| Field | Type | Required | Description |
|---|---|---|---|
| `actionPerformerURDD` | `number` | Yes | The guest's URDD ID. |
| `booking_id` | `number` | Yes | The booking to check eligibility for. |

### Example

```json
{
  "actionPerformerURDD": 16,
  "booking_id": 9026
}
```

---

## Response

### Eligible (200)

```json
{
  "eligible": true,
  "balanceDue": 0,
  "currency": "SAR"
}
```

### Not Eligible (200)

```json
{
  "eligible": false,
  "reason": "not_paid",
  "balanceDue": 500,
  "currency": "SAR"
}
```

Window-gated responses include the check-in time window:

```json
{
  "eligible": false,
  "reason": "before_window",
  "balanceDue": 0,
  "currency": "SAR",
  "windowOpensAt": "2026-06-10T07:00:00.000Z",
  "windowClosesAt": "2026-06-10T20:00:00.000Z"
}
```

### Response Fields

| Field | Type | Description |
|---|---|---|
| `eligible` | `boolean` | Whether check-in is allowed right now. |
| `reason` | `string` | Present when `eligible: false`. See reasons below. |
| `balanceDue` | `number` | Remaining balance (`total_amount - paid_amount`). |
| `currency` | `string` | Currency code (e.g. `"SAR"`). |
| `windowOpensAt` | `string` | ISO 8601 datetime when the check-in window opens (07:00 UTC on check-in day). |
| `windowClosesAt` | `string` | ISO 8601 datetime when the check-in window closes (20:00 UTC on check-in day). |

### Ineligibility Reasons

| Reason | Description |
|---|---|
| `cancelled` | Booking has been cancelled. |
| `already_checked_in` | Guest has already checked in. |
| `before_window` | Current time is before the check-in window (before 07:00 UTC on check-in day). |
| `after_window` | Current time is after the check-in window, or booking is checked_out/no_show. |
| `not_paid` | No payment has been made (`paid_amount = 0`). |

### Eligibility Logic (in order)

1. **Cancelled** → `eligible: false, reason: "cancelled"`
2. **Already checked in** (`booking_status = 'checked_in'` or `actual_check_in` set) → `eligible: false, reason: "already_checked_in"`
3. **Checked out / no show** → `eligible: false, reason: "after_window"`
4. **Before check-in window** (before 07:00 UTC on check-in day) → `eligible: false, reason: "before_window"`
5. **After check-in window** (after 20:00 UTC on check-in day) → `eligible: false, reason: "after_window"`
6. **Not paid** (`paid_amount = 0`) → `eligible: false, reason: "not_paid"`
7. **All checks pass** → `eligible: true`

---

## Error Responses

| Status | `error.details` | Condition |
|---|---|---|
| 400 | `booking_id is required` | Missing `booking_id` in the payload. |
| 401 | `Authenticated user required` | No `userId` in the session. |
| 403 | `Invalid or expired URDD` | URDD validation failed. |
| 404 | `Booking not found` | Booking doesn't exist, doesn't belong to the caller, or is inactive. |
