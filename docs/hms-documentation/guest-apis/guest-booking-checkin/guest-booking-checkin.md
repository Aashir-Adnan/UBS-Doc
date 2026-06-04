# Guest Booking Check-in

**POST** `/api/guest/booking/checkin`

Checks in a guest for a confirmed booking. Optionally captures whether the person checking in is the main guest or a companion.

---

## Authentication

Requires the **AUTH_PLATFORM** (guest JWT). The `userId` is resolved from the authenticated session and `actionPerformerURDD` / `tenant_id` are validated via the `ensureGuestUrdd` pre-process step.

---

## Request Payload

| Field | Type | Required | Description |
|---|---|---|---|
| `actionPerformerURDD` | `number` | Yes | The guest's URDD ID for the target hotel. |
| `userId` | `number` | Yes | The authenticated user's ID (set by auth middleware). |
| `booking_id` | `number` | Yes | The booking to check in. |
| `main_guest_flag` | `boolean` | No | `true` if the person checking in **is** the main guest; `false` if they are a companion. Omit to skip main-guest capture entirely. |
| `main_guest_name` | `string` | No | Name of the actual main guest. **Only used when `main_guest_flag` is `false`**. |
| `main_guest_relation` | `string` | No | Relation to the main guest (e.g. "Brother", "Spouse"). **Only used when `main_guest_flag` is `false`**. |

### Example: Main guest checking in themselves

```json
{
  "actionPerformerURDD": 42,
  "userId": 7,
  "booking_id": 101,
  "main_guest_flag": true
}
```

When `main_guest_flag` is `true`, the API looks up the user's `first_name` and `last_name` from the `users` table and stores:
- `main_guest_name` = user's full name
- `main_guest_relation` = `"Self"`

### Example: Companion checking in on behalf of the main guest

```json
{
  "actionPerformerURDD": 42,
  "userId": 7,
  "booking_id": 101,
  "main_guest_flag": false,
  "main_guest_name": "Ahmed Al-Rashid",
  "main_guest_relation": "Brother"
}
```

When `main_guest_flag` is `false`, the provided `main_guest_name` and `main_guest_relation` values are stored as-is.

### Example: Legacy / minimal check-in (no main-guest info)

```json
{
  "actionPerformerURDD": 42,
  "userId": 7,
  "booking_id": 101
}
```

When `main_guest_flag` is omitted, no main-guest details are recorded.

---

## Behavior

1. **Validates** the booking exists, belongs to the caller (via `urdd_id` + `tenant_id`), and is in an active state.
2. **Rejects** if the booking is already `checked_in` (409) or `cancelled` (409).
3. **Updates** `bookings.booking_status` to `checked_in` and stamps `actual_check_in` with the current timestamp.
4. **If `main_guest_flag` is provided**, inserts/upserts a row in `booking_checkin_details`:
   - `main_guest_flag: true` — resolves the user's full name from the `users` table and sets relation to `"Self"`.
   - `main_guest_flag: false` — uses the provided `main_guest_name` and `main_guest_relation`.

---

## Response

### Success (200)

```json
{
  "message": "Checked in",
  "actual_check_in": "2026-06-05T14:30:00.000Z",
  "booking_id": 101,
  "main_guest_flag": true,
  "main_guest_name": "John Doe",
  "main_guest_relation": "Self"
}
```

### Error Responses

| Status | Message | Condition |
|---|---|---|
| 400 | `booking_id is required` | Missing `booking_id`. |
| 401 | `Authenticated user is required` | No `userId` in the session. |
| 403 | `Invalid or expired URDD` | `actionPerformerURDD` does not match the user. |
| 404 | `Booking not found or not authorized` | Booking does not exist or does not belong to the caller. |
| 404 | `User not found` | `main_guest_flag` is `true` but the user record is missing. |
| 409 | `Already checked in` | Booking is already in `checked_in` status. |
| 409 | `Cannot check in a cancelled booking` | Booking has been cancelled. |
