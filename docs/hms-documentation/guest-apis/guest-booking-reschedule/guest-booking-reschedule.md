# Guest Booking Reschedule

**PUT** `/api/guest/booking/reschedule`

Reschedules service slots (sessions, meals, or transport) within a booking. All IDs are sent in the encrypted payload — no URL path parameters.

---

## Authentication

Requires the **AUTH_PLATFORM** (guest JWT). The `actionPerformerURDD` is validated via the `ensureGuestUrdd` pre-process step.

---

## Request Payload

| Field | Type | Required | Description |
|---|---|---|---|
| `actionPerformerURDD` | `number` | Yes | The guest's URDD ID. |
| `booking_id` | `number` | Yes | The booking containing the service to reschedule. |
| `service_id` | `number` | Yes | The service whose slots are being rescheduled. |
| `sessions` | `array` | No | Session slot updates. |
| `meals` | `array` | No | Meal slot updates. |
| `transport` | `object` | No | Transport slot update. |

### Session Slot

| Field | Type | Required | Description |
|---|---|---|---|
| `slotId` | `number` | Yes | The slot ID to reschedule. |
| `start` | `string` | No | New start datetime (ISO 8601). |
| `end` | `string` | No | New end datetime (ISO 8601). |

### Meal Slot

| Field | Type | Required | Description |
|---|---|---|---|
| `slotId` | `number` | No | Slot ID. If omitted, auto-assigned from available pool. |
| `date` | `string` | No | Meal date (`YYYY-MM-DD`). |
| `mealType` | `string` | No | Type of meal (e.g. `"breakfast"`, `"lunch"`). |

### Transport Slot

| Field | Type | Required | Description |
|---|---|---|---|
| `slotId` | `number` | Yes | The transport slot ID. |
| `pickupAt` | `string` | No | Pickup datetime (ISO 8601). |
| `dropoffAt` | `string` | No | Dropoff datetime (ISO 8601). |
| `tripType` | `string` | No | Trip type (e.g. `"one_way"`, `"round_trip"`). |
| `pickupLocation` | `string` | No | Pickup location. |
| `dropoffLocation` | `string` | No | Dropoff location. |

### Example

```json
{
  "actionPerformerURDD": 16,
  "booking_id": 9024,
  "service_id": 96,
  "sessions": [
    { "slotId": 42, "start": "2026-06-10T10:00:00", "end": "2026-06-10T11:00:00" }
  ]
}
```

---

## Behavior

1. **Validates** `booking_id` and `service_id` are both provided.
2. **Loads allowed slot IDs** — queries `booking_service_slots` joined through `booking_services` and `bookings` to verify ownership (matching `booking_id`, `tenant_id`, `urdd_id`, `service_id`, all active).
3. **Rejects** with 404 if no slot rows are found for the booking/service combination.
4. **Updates each slot** provided in `sessions`, `meals`, or `transport`:
   - Timing columns (`scheduled_start`, `scheduled_end`) are updated directly on `booking_service_slots`.
   - Form-value columns (`meal_type`, `trip_type`, `pickup_location`, `dropoff_location`) are stored in `hms_config` via `upsertSlotFormValues`.
   - Slot status is set to `'scheduled'`.
5. Unknown `slotId` values are silently skipped (not owned by this booking/service).

---

## Response

### Success (200)

```json
{
  "booking_id": 9024,
  "service_id": 96,
  "updated": 1
}
```

| Field | Type | Description |
|---|---|---|
| `booking_id` | `number` | The booking ID. |
| `service_id` | `number` | The service ID. |
| `updated` | `number` | Number of slots that were updated. |

### Error Responses

| Status | `error.details` | Condition |
|---|---|---|
| 400 | `booking_id and service_id are required` | Missing either ID. |
| 401 | `Authenticated user required` | No `userId` in the session. |
| 403 | `Invalid or expired URDD` | URDD validation failed. |
| 404 | `Service slot rows not found for this booking` | No slots exist for this booking/service combination, or the booking doesn't belong to the caller. |

---

## Important

The Flutter app should call `PUT /api/guest/booking/reschedule` with IDs in the payload. Do **not** use the path-parameter pattern (`/guest/bookings/{id}/services/{serviceId}`) — the framework does not reliably inject multiple path parameters.

---

## Issue #227 — Verified Working

The reschedule handler correctly sets `slot_status = 'scheduled'` and persists timing data. All 8 sim tests pass (`guestBookingReschedule.js`).

**Key clarifications:**
- `service_id` in the payload must be the **catalog `serviceId`** (from `services.service_id`), not the `bookingServiceId`.
- The `updated` count reflects the number of slot entries processed.
- Meal slots support auto-assignment: if `slotId` is omitted, slots are assigned sequentially from the available pool.
