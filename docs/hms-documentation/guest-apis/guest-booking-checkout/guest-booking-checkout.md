# Guest Booking Check-out

**POST** `/api/guest/booking/checkout`

Checks out a guest from a booking that is currently in `checked_in` status. Sets `booking_status` to `checked_out` and stamps `actual_check_out` with the current timestamp.

---

## Authentication

Requires the **AUTH_PLATFORM** (guest JWT). The `userId` is resolved from the authenticated session and `actionPerformerURDD` / `tenant_id` are validated via the `ensureGuestUrdd` pre-process step.

---

## Request Payload

| Field | Type | Required | Description |
|---|---|---|---|
| `actionPerformerURDD` | `number` | Yes | The guest's URDD ID for the target hotel. |
| `userId` | `number` | Yes | The authenticated user's ID (set by auth middleware). |
| `booking_id` | `number` | Yes | The booking to check out. |

### Example

```json
{
  "actionPerformerURDD": 42,
  "userId": 7,
  "booking_id": 101
}
```

---

## Behavior

1. **Validates** the booking exists, belongs to the caller (via `urdd_id`), and is in an active state.
2. **Rejects** if the booking is not in `checked_in` status (409 "Not checked in").
3. **Updates** `bookings.booking_status` to `checked_out` and stamps `actual_check_out` with the current timestamp.
4. **Cascades** `item_status = 'checked_out'` to all `booking_items` rows for the booking, freeing their delivery units for future bookings.
5. After checkout, the booking no longer appears in `/guest/bookings/current` (which requires `actual_check_out IS NULL` for checked-in bookings).
6. The `bookingsBundle` normalizer maps `checked_out` to `completed` in the response status field.

---

## Response

### Success (200)

```json
{
  "checkedOut": true,
  "message": "Checked out",
  "actual_check_out": "2026-06-09T18:00:00.000Z",
  "booking_id": 101,
  "status": "completed"
}
```

### Error Responses

| Status | Message | Condition |
|---|---|---|
| 400 | `booking_id is required` | Missing `booking_id`. |
| 401 | `Authenticated user is required` | No `userId` in the session. |
| 403 | `Invalid or expired URDD` | `actionPerformerURDD` does not match the user. |
| 404 | `Booking not found or not authorized` | Booking does not exist or does not belong to the caller. |
| 409 | `Not checked in` | Booking is not in `checked_in` status (e.g. still confirmed, already checked out, or cancelled). |

---

## Database Changes

### `bookings` table

| Column | Before | After |
|---|---|---|
| `booking_status` | `'checked_in'` | `'checked_out'` |
| `actual_check_out` | `NULL` | Current timestamp |
| `updated_by` | Previous value | `actionPerformerURDD` |

### `booking_items` table

| Column | Before | After |
|---|---|---|
| `item_status` | `'reserved'` | `'checked_out'` |

The `item_status` cascade frees the delivery unit so it can be assigned to future bookings. The availability check (`pickAvailableUnitForService`) skips items with `item_status IN ('cancelled', 'checked_out')`.

---

## Side Effects

- After checkout, the booking disappears from `GET /guest/bookings/current`.
- The booking remains visible in `GET /guest/bookings` with status `completed`.
- The booking is visible in `GET /guest/bookings/upcoming` (the Completed tab) since `checked_out` and `completed` are included in the upcoming status filter.
- The delivery unit assigned to the booking becomes available for new reservations.

---

## Change Log

| Date | Change |
|---|---|
| 2026-06-09 | Initial implementation ([#253](https://github.com/UBS-Dev-Org/hms/issues/253)). |
