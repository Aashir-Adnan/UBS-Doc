# Slot Scheduling for Standalone Service Bookings

How time slots are created, stored, and returned when booking standalone services (dining, spa, barber, transport, etc.) — including multi-quantity bookings.

---

## Overview

A standalone service booking creates one `bookings` row, one `booking_services` row, and **one `booking_service_slots` row per scheduled unit**. The number of slot rows is determined by the scheduling entries sent in the request (`meals[]`, `sessions[]`, or `transport`) and the `quantity` parameter.

```
bookings (1 row)
 └── booking_services (1 row — links the service, holds quantity + price)
      └── booking_service_slots (N rows — one per slot)
```

---

## Booking a Service Multiple Times

To book the same service N times in a single booking, send `quantity: N` along with scheduling entries. Each scheduling entry creates one slot row.

### Example: 3 dining reservations

```json
{
  "actionPerformerURDD": 448,
  "serviceId": 190,
  "hotelId": 16,
  "quantity": 3,
  "adults": 2,
  "children": 1,
  "meals": [
    { "date": "2026-08-14", "mealType": "breakfast", "slot": "08:00-09:30" },
    { "date": "2026-08-14", "mealType": "lunch",     "slot": "13:00-14:30" },
    { "date": "2026-08-15", "mealType": "breakfast",  "slot": "08:00-09:30" }
  ]
}
```

This creates 3 `booking_service_slots` rows:

| Slot | `scheduled_start` | `scheduled_end` | `slot_status` |
|------|-------------------|-----------------|---------------|
| 1 | `2026-08-14 08:00:00` | `2026-08-14 09:30:00` | `scheduled` |
| 2 | `2026-08-14 13:00:00` | `2026-08-14 14:30:00` | `scheduled` |
| 3 | `2026-08-15 08:00:00` | `2026-08-15 09:30:00` | `scheduled` |

Price = `unitPrice` × 3.

### Example: 3 spa sessions

```json
{
  "actionPerformerURDD": 448,
  "serviceId": 55,
  "quantity": 3,
  "sessions": [
    { "date": "2026-08-14", "slot": "10:00-11:00" },
    { "date": "2026-08-14", "slot": "14:00-15:00" },
    { "date": "2026-08-15", "slot": "10:00-11:00" }
  ]
}
```

---

## Partial Scheduling

If `quantity` exceeds the number of scheduling entries, the remaining slots are created as `unscheduled`. The guest can schedule them later via `PUT /guest/booking/reschedule`.

### Example: Book 3, schedule 1

```json
{
  "serviceId": 190,
  "quantity": 3,
  "meals": [
    { "date": "2026-08-14", "mealType": "breakfast", "slot": "08:00-09:30" }
  ]
}
```

| Slot | `scheduled_start` | `scheduled_end` | `slot_status` |
|------|-------------------|-----------------|---------------|
| 1 | `2026-08-14 08:00:00` | `2026-08-14 09:30:00` | `scheduled` |
| 2 | `null` | `null` | `unscheduled` |
| 3 | `null` | `null` | `unscheduled` |

The booking response will show `schedulingStatus: "partial"`.

---

## Book Now, Schedule Later

Omit all scheduling fields to create a fully unscheduled booking:

```json
{
  "serviceId": 190,
  "quantity": 2
}
```

Both slots are created as `unscheduled`. The response shows `schedulingStatus: "unscheduled"`.

---

## Time Slot Format

The `slot` field uses `"HH:MM-HH:MM"` format (e.g. `"10:30-12:00"`). It is combined with `date` to produce full datetime values:

| Input | `scheduled_start` | `scheduled_end` |
|-------|-------------------|-----------------|
| `{ "date": "2026-08-14", "slot": "10:30-12:00" }` | `2026-08-14 10:30:00` | `2026-08-14 12:00:00` |
| `{ "date": "2026-08-14" }` (no slot) | `2026-08-14` | `null` |
| No scheduling entry | `null` | `null` |

For dining/room-service, the `slot` field is optional. When omitted, only the date is stored. For sessions (spa, barber, gym), the `slot` field provides the time range.

---

## How Slots Are Returned in the Response

Standalone service bookings return slot details in a top-level `slots` object. The shape adapts to the service category:

```json
{
  "bookingId": 10150,
  "bookingType": "individual_service",
  "schedulingStatus": "complete",
  "slots": {
    "type": "meals",
    "items": [
      { "id": 1870, "date": "2026-08-14", "mealType": "breakfast", "status": "scheduled" },
      { "id": 1871, "date": "2026-08-14", "mealType": "lunch", "status": "scheduled" },
      { "id": 1872, "date": "2026-08-15", "mealType": "breakfast", "status": "scheduled" }
    ]
  }
}
```

### `slots` Object

| Field | Type | Description |
|---|---|---|
| `type` | `string` | `"meals"`, `"sessions"`, or `"transport"` — determined by the service category. |
| `items` | `array` or `object` | Slot entries. Array for meals/sessions, object for transport. |

### Items by Type

**`type: "meals"`** (dining / room-service):

| Field | Type | Description |
|---|---|---|
| `id` | `number` | Slot ID. Use for targeted removal (`DELETE /guest/bookings/services` with `slot_id`) or reschedule. |
| `date` | `string` | Scheduled date (`YYYY-MM-DD`). `null` if unscheduled. |
| `mealType` | `string` | `"breakfast"`, `"lunch"`, `"dinner"`, etc. |
| `status` | `string` | `"scheduled"` or `"unscheduled"`. |

**`type: "sessions"`** (spa / barber / gym / other):

| Field | Type | Description |
|---|---|---|
| `id` | `number` | Slot ID. |
| `date` | `string` | Scheduled date. `null` if unscheduled. |
| `slot` | `string` | Time range (`"HH:MM-HH:MM"`). `null` if unscheduled or time not provided. |
| `status` | `string` | `"scheduled"` or `"unscheduled"`. |

**`type: "transport"`**:

| Field | Type | Description |
|---|---|---|
| `tripType` | `string` | e.g. `"airport_pickup"`. |
| `pickupDateTime` | `string` | Pickup datetime. |
| `pickupLocation` | `string` | Pickup location. |
| `dropoffLocation` | `string` | Drop-off location. |
| `passengers` | `number` | Number of passengers. |

### When `slots` is `null`

- Room bookings (`bookingType: "room"`) — scheduling is via `booking_items`, not slots.
- Package bookings (`bookingType: "package"`) — the package anchor has no standalone slots.
- Addon services appear in `services[].meals[]` / `services[].sessions[]` instead.

---

## Scheduling Status

The top-level `schedulingStatus` is derived from all slot rows:

| Value | Meaning |
|---|---|
| `complete` | Every slot has `slot_status: "scheduled"`. |
| `partial` | Some slots are scheduled, some are not. |
| `unscheduled` | All slots are `"unscheduled"`. |
| `none` | No slot rows exist. |

---

## Unit Assignment

Each slot is independently assigned a delivery unit (table, chair, room, etc.) via `pickAvailableSlotUnit`. Two slots on the same day can be assigned to different units if capacity requires it. The unit is picked at booking time for scheduled slots, and at reschedule time for initially unscheduled slots.

---

## Managing Individual Slots

| Action | Endpoint | Key Fields |
|---|---|---|
| **Remove one slot** | `DELETE /guest/bookings/services` | `booking_id`, `serviceId`, `slot_id` |
| **Reschedule a slot** | `PUT /guest/booking/reschedule` | `booking_id`, `booking_service_id`, new scheduling fields |
| **Remove all slots** | `DELETE /guest/bookings/services` | `booking_id`, `serviceId` (no `slot_id`) |

When a single slot is removed, the `booking_services` quantity and total are decremented. If it was the last active slot, the entire service is removed from the booking.
