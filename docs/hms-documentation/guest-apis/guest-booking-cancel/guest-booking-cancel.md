# Guest Booking Cancel

**POST** `/api/guest/booking/cancel`

Cancels a guest's booking. Computes a cancellation fee based on the primary service's cancellation-margin policy and enforces a transport modification/cancellation cutoff gate.

---

## Authentication

Requires the **AUTH_PLATFORM** (guest JWT). The `actionPerformerURDD` is validated via the `ensureGuestUrdd` pre-process step.

---

## Request Payload

| Field | Type | Required | Description |
|---|---|---|---|
| `actionPerformerURDD` | `number` | Yes | The guest's URDD ID for the target hotel. |
| `booking_id` | `number` | Yes | The booking to cancel. |
| `cancellation_reason` | `string` | No | Free-text reason for the cancellation. |

### Example

```json
{
  "actionPerformerURDD": 37,
  "booking_id": 9026,
  "cancellation_reason": "Change of plans"
}
```

---

## Behavior

1. **Validates** the booking exists, belongs to the caller (via `urdd_id`), and has `status = 'active'`.
2. **Loads** the primary service's configuration via `fetchGuestConfigs` to read `cancellation_margin` and `modification_cancellation_cutoff_hours`.
3. **Transport cutoff gate**: If the primary service category is `transport` and a `modification_cancellation_cutoff_hours` config is set, the API rejects the cancellation if the current time is within that window before `check_in_date` (409).
4. **Computes** the `cancellationFee` from the `cancellation_margin` policy rules. Each rule has a `hours_before` and `charge_pct`; the rule with the highest `hours_before` that is still less than or equal to the hours remaining until check-in is applied against `total_amount`.
5. **Updates** the booking row:
   - `booking_status` → `'cancelled'`
   - `cancellation_reason` → the provided reason (or `NULL`)
   - `cancelled_at` → `NOW()`
   - `updated_by` → `actionPerformerURDD`
6. The `status` column (soft-delete flag) remains `'active'` — only `booking_status` changes.

### Cancellation Fee Policy

The `cancellation_margin` config is a JSON array of rules:

```json
[
  { "hours_before": 72, "charge_pct": 0 },
  { "hours_before": 24, "charge_pct": 25 },
  { "hours_before": 6,  "charge_pct": 50 }
]
```

- If check-in is more than 72 hours away → 0% fee (free cancellation).
- Between 24–72 hours → 25% of `total_amount`.
- Within 6–24 hours → 50% of `total_amount`.

If no policy is configured or the booking has no primary service, the fee defaults to `0`.

---

## Post-Cancellation Effects on Read Endpoints

After a successful cancel:

| Endpoint | Effect |
|---|---|
| `GET /guest/bookings` | Booking still appears (filtered by `status = 'active'` only) but with `status: "cancelled"`. |
| `GET /guest/bookings/upcoming` | Booking is **excluded** (filters for `booking_status IN ('confirmed','pending')`). |
| `GET /guest/bookings/current` | Booking is **excluded** (filters for `booking_status IN ('checked_in','confirmed')`). |

The `cancellation` metadata block on the booking object also updates:

```json
{
  "cancellable": false,
  "nonCancellableReason": "cancelled",
  "cancellationFee": null,
  "estimatedRefund": null,
  "freeCancellationUntil": null,
  "cancellationPolicy": null
}
```

---

## Response

### Success (200)

```json
{
  "cancelled": true,
  "message": "Booking cancelled",
  "cancellationFee": 0
}
```

| Field | Type | Description |
|---|---|---|
| `cancelled` | `boolean` | Always `true` on success. |
| `message` | `string` | Human-readable confirmation. |
| `cancellationFee` | `number` | Computed fee deducted from the refund (0 if free cancellation). |

### Error Responses

| Status | Message | Condition |
|---|---|---|
| 401 | `Authenticated user is required` | No `userId` in the session. |
| 403 | `Invalid or expired URDD` | `actionPerformerURDD` does not match the user. |
| 409 | `Cancellation not permitted within Xh of scheduled pickup` | Transport booking within the cutoff window. |

---

## Database Changes

### `bookings` table

| Column | Before | After |
|---|---|---|
| `booking_status` | `'pending'` / `'confirmed'` | `'cancelled'` |
| `cancellation_reason` | `NULL` | Provided reason text |
| `cancelled_at` | `NULL` | Current timestamp |
| `updated_by` | Previous value | `actionPerformerURDD` |
| `status` | `'active'` | `'active'` (unchanged) |

### `booking_items` table

| Column | Before | After |
|---|---|---|
| `item_status` | `'reserved'` | `'cancelled'` |

The `item_status` cascade frees the delivery unit so it can be assigned to future bookings. The availability check (`pickAvailableUnitForService`) skips items with `item_status IN ('cancelled', 'checked_out')`.

### Schema Reference

The `bookings` table has two distinct status columns:

- **`booking_status`** — Business lifecycle: `pending | confirmed | checked_in | checked_out | cancelled | no_show`
- **`status`** — Soft-delete flag: `active | inactive`

The cancel operation modifies `booking_status` and cascades `item_status = 'cancelled'` to all `booking_items` rows for the booking, freeing their delivery units for future bookings. The `status` column stays `'active'` so the booking remains visible in list queries.

---

## Change Log

| Date | Change |
|---|---|
| 2026-06-09 | Cancel now cascades `item_status = 'cancelled'` to `booking_items`, freeing delivery units for rebooking. Previously, cancelled booking items kept `item_status = 'reserved'`, permanently blocking room availability (fixes [#255](https://github.com/UBS-Dev-Org/hms/issues/255)). |
