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

Supports two formats — use **either** `{start, end}` or `{date, slot}`:

| Field | Type | Required | Description |
|---|---|---|---|
| `slotId` | `number` | No | The slot ID to reschedule. If omitted, auto-assigned from the booking's available slot pool. |
| `start` | `string` | No | New start datetime (ISO 8601). Legacy format. |
| `end` | `string` | No | New end datetime (ISO 8601). Legacy format. |
| `date` | `string` | No | Date (`YYYY-MM-DD`). Mobile format — use with `slot`. |
| `slot` | `string` | No | Time range (`"HH:MM-HH:MM"`). Mobile format — use with `date`. |

### Meal Slot

| Field | Type | Required | Description |
|---|---|---|---|
| `slotId` | `number` | No | Slot ID. If omitted, auto-assigned from available pool. |
| `date` | `string` | No | Meal date (`YYYY-MM-DD`). |
| `mealType` | `string` | No | Type of meal (e.g. `"breakfast"`, `"lunch"`). |

### Transport Slot

| Field | Type | Required | Description |
|---|---|---|---|
| `slotId` | `number` | No | The transport slot ID. If omitted, auto-assigned from the available pool. |
| `pickupDateTime` | `string` | No | Pickup datetime (ISO 8601). Mobile format — preferred. |
| `pickupAt` | `string` | No | Pickup datetime (ISO 8601). Legacy format. |
| `dropoffAt` | `string` | No | Dropoff datetime (ISO 8601). |
| `tripType` | `string` | No | Trip type (e.g. `"one_way"`, `"round_trip"`). |
| `pickupLocation` | `string` | No | Pickup location. |
| `dropoffLocation` | `string` | No | Dropoff location. |

### Example (mobile format — recommended)

```json
{
  "actionPerformerURDD": 16,
  "booking_id": 9024,
  "service_id": 96,
  "sessions": [
    { "slotId": 42, "date": "2026-06-10", "slot": "10:00-11:00" }
  ]
}
```

### Example (legacy format)

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
| 404 | `Service slot rows not found for this booking` | No slots exist for this booking/service combination, or the booking doesn't belong to the caller. Previously, this also occurred when the caller's URDD had a `NULL` tenant_id (global URDD) — now handled. |

---

## Important

- The Flutter app should call `PUT /api/guest/booking/reschedule` with IDs in the payload. Do **not** use the path-parameter pattern (`/guest/bookings/{id}/services/{serviceId}`) — the framework does not reliably inject multiple path parameters.
- The scheduling shape (`sessions`, `meals`, or `transport`) is determined by the service's category slug — the same shape used at booking creation time. See [Addon Scheduling](../guest-booking-flow/guest-booking-flow.md#addon-scheduling) for the full category → shape mapping.
- To get `slotId` values, read the booking via `GET /guest/bookings` — each addon's slots appear as `services[].sessions[].id`, `services[].meals[].id`, or `services[].transport.id`. These are the `booking_service_slots.slot_id` values the reschedule expects.

---

## Issue #227 — Verified Working

The reschedule handler correctly sets `slot_status = 'scheduled'` and persists timing data. All 8 sim tests pass (`guestBookingReschedule.js`).

**Key clarifications:**
- `service_id` in the payload must be the **catalog `serviceId`** (from `services.service_id`), not the `bookingServiceId`.
- The `updated` count reflects the number of slot entries processed.
- Meal slots support auto-assignment: if `slotId` is omitted, slots are assigned sequentially from the available pool.

---

## Test Coverage

Two sim test files cover this endpoint:

### `guestBookingReschedule.js` — Unit-level (8 tests)

Seeds a booking with a service slot directly in the DB, then tests the reschedule API in isolation.

| # | Test | What it proves |
|---|---|---|
| 1 | Missing `booking_id` → 400 | Parameter validation rejects incomplete payloads. |
| 2 | Missing `service_id` → 400 | Both IDs are mandatory. |
| 3 | Non-existent booking/service → 404 | Ownership query correctly returns empty when no matching slot rows exist. |
| 4 | Valid session reschedule → 200 | Happy path — updates timing columns and returns `updated >= 1`. |
| 5 | DB: `slot_status` = `'scheduled'` | The UPDATE correctly transitions the slot from `unscheduled` to `scheduled`. |
| 6 | DB: `scheduled_start` is set | Timing data persisted to `booking_service_slots`. |

### `guestRescheduleFlowE2E.js` — Full lifecycle (16 tests)

Creates a real standalone service booking via the API, then reschedules it through multiple formats.

| # | Test | What it proves |
|---|---|---|
| 1 | Booking created | `POST /guest/bookings/service` successfully creates a booking with slot rows. |
| 2 | `booking_services` row exists | The booking has a linked service. |
| 3 | `booking_service_slots` row exists | At least one schedulable slot was created for the service. |
| 4 | Booking `urdd_id` matches | The ownership query will find this booking for the caller. |
| 5 | Booking `status` = `'active'` | Soft-delete status won't block the query. |
| 6 | Missing `booking_id` → 400 | Error case — parameter validation. |
| 7 | Missing `service_id` → 400 | Error case — parameter validation. |
| 8 | Non-existent booking → 404 | Error case — no slot rows for a fake booking. |
| 9 | Reschedule (auto-assign `slotId`) succeeded | Mobile format `{date, slot}` without explicit `slotId` — backend auto-assigns from the pool. |
| 10 | DB `slot_status` = `'scheduled'` | Confirms the slot transitioned after reschedule. |
| 11 | DB `scheduled_start` is set | Timing was persisted. |
| 12 | Reschedule (explicit `slotId`) succeeded | Mobile format `{slotId, date, slot}` — the exact format Flutter sends. |
| 13 | DB `scheduled_start` reflects new date | Verifies the date actually changed (not stale from previous reschedule). |
| 14 | Reschedule (legacy format) succeeded | Legacy `{slotId, start, end}` still works for backward compatibility. |
| 15 | DB `scheduled_end` is set | Legacy format correctly sets both start and end. |
| 16 | Booking read-back has slot data | `GET /guest/bookings` returns `schedulingStatus: 'complete'` and populated session data after reschedule. |

### Running the tests

```bash
# Unit-level (seeds data directly, fast)
node Services/SysScripts/TestScripts/sim/guestBookingReschedule.js

# Full E2E lifecycle (creates booking via API, validates all formats)
node Services/SysScripts/TestScripts/sim/guestRescheduleFlowE2E.js
```

Both require credentials.json (run `guestOtpFlow.js` first) and a running server on localhost:3000.

---

## Change Log

| Date | Change |
|---|---|
| 2026-06-10 | Added mobile format support for sessions (`{date, slot}`) and transport (`pickupDateTime`). Made `slotId` optional for sessions and transport (auto-assigned from pool). Aligns reschedule with the same format used by booking creation and addon scheduling. |
| 2026-06-09 | Fixed 404 when the caller's URDD has `tenant_id = NULL` (global URDD). The ownership query now skips the tenant check when tenant_id is null, relying on `urdd_id` ownership alone (fixes [#246](https://github.com/UBS-Dev-Org/hms/issues/246)). |
