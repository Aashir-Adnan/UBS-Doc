---
sidebar_position: 1
title: "Stage Unit Reservation"
description: "Stage → Payment → Edit flow with temporary unit holds. API payloads, hold lifecycle, and edge cases."
---

# Stage Unit Reservation

The booking edit pipeline is **stage → payment → edit**. The stage API temporarily
reserves delivery units (rooms) for 5 minutes. The edit API adopts those holds
via `stageId`, guaranteeing the edit succeeds if staging did.

```
Stage → picks rooms → inserts booking_items(pending) → 5-min hold
  ↓
Payment → rooms are held, nobody else can book them
  ↓
Edit (with stageId) → adopts held items → promotes to 'reserved'
  ↓
Expiry (no edit within 5 min) → cleanup releases the pending items
```

No frontend changes required — request shapes are identical.

---

## 1. Stage API

### Endpoint

```
POST /api/guest/booking/stage
```

Platform: `AUTH_PLATFORM` (encrypted + access token)

### Request Body

```json
{
  "bookingId": 9950,
  "changes": {
    "checkIn": "2026-08-01",
    "checkOut": "2026-08-05",
    "adults": 6,
    "children": 0,
    "addServices": [
      { "serviceId": 280, "quantity": 1, "sessions": [{ "date": "2026-08-02", "slot": "09:00-10:00" }] }
    ],
    "removeServices": [42]
  },
  "actionPerformerURDD": 507
}
```

| Field | Type | Required | Description |
|---|---|---|---|
| `bookingId` | number | Yes | Existing booking to modify |
| `changes.checkIn` | string | No | New check-in date (YYYY-MM-DD) |
| `changes.checkOut` | string | No | New check-out date (YYYY-MM-DD) |
| `changes.adults` | number | No | New adult count |
| `changes.children` | number | No | New child count |
| `changes.addServices` | array | No | Services to add (each with `serviceId`, optional `quantity`, `sessions`) |
| `changes.removeServices` | array | No | `booking_service_id` values to remove |

### Response

```json
{
  "staged": true,
  "stageId": "stg_abc123def456789012345678",
  "expiresAt": "2026-07-28T13:35:00.000Z",
  "current": {
    "subtotal": 4800,
    "appliedRules": [],
    "grandTotal": 4800,
    "paidAmount": 4800,
    "currency": "SAR"
  },
  "proposed": {
    "subtotal": 9600,
    "appliedRules": [],
    "grandTotal": 9600,
    "currency": "SAR"
  },
  "delta": {
    "subtotalChange": 4800,
    "grandTotalChange": 4800,
    "additionalPaymentRequired": 4800,
    "estimatedRefund": 0,
    "currency": "SAR"
  },
  "changes": {
    "dates": {
      "checkIn": "2026-08-01",
      "checkOut": "2026-08-05",
      "nights": 4
    },
    "partySize": {
      "adults": 6,
      "children": 0,
      "total": 6,
      "currentRoomCount": 1,
      "proposedRoomCount": 2
    },
    "servicesAdded": [
      {
        "serviceId": 280,
        "label": { "en": "Post-Tawaf Recovery Massage", "ar": "..." },
        "quantity": 1,
        "basePrice": 300,
        "currentPrice": 270,
        "lineTotal": 300
      }
    ],
    "servicesRemoved": [
      {
        "bookingServiceId": 42,
        "serviceId": 281,
        "label": { "en": "Foot Care Treatment", "ar": "..." },
        "refundAmount": 150
      }
    ],
    "slotAvailability": [
      {
        "serviceId": 280,
        "date": "2026-08-02",
        "slot": "09:00-10:00",
        "available": true,
        "remaining": 2,
        "total": 3
      }
    ],
    "heldUnitIds": [854, 855]
  },
  "validation": {
    "valid": true,
    "errors": []
  }
}
```

| Field | Description |
|---|---|
| `staged` | `true` if all validations passed and holds were created |
| `stageId` | Pass this to edit and payment APIs. `null` if validation failed |
| `expiresAt` | ISO timestamp — 5 minutes from now. After this, holds are released |
| `current` | Pricing snapshot of the booking as it stands |
| `proposed` | Pricing if the changes are committed |
| `delta.additionalPaymentRequired` | Amount the guest must pay before editing (proposed total minus already paid) |
| `delta.estimatedRefund` | Amount to refund if the edit reduces the total below what was paid |
| `changes.heldUnitIds` | Delivery unit IDs that were temporarily reserved. Only present when room re-assignment was needed |
| `validation.errors` | Array of error strings. If non-empty, `staged` is `false` |

### What the Stage Reserves

Unit holds are created only when the proposed changes require **room re-assignment**:

| Change Type | Holds Created? |
|---|---|
| Date change (checkIn/checkOut) | Yes — rooms for the new date range |
| Party size increase (needs more rooms) | Yes — additional rooms |
| Add/remove services only | No |
| Party size decrease (same room count) | No |

Hold rows are inserted into `booking_items` with `item_status='pending'` and
`notes='stage:{stageId}'`. Availability queries automatically treat `'pending'`
as occupied.

---

## 2. Payment API (unchanged)

After staging, if `delta.additionalPaymentRequired > 0`, initiate payment:

### Initiate

```
POST /api/guest/payments/initiate
```

```json
{
  "bookingId": 9950,
  "amount": 4800,
  "currency": "SAR",
  "methods": ["creditcard"],
  "supportedNetworks": ["mada", "visa", "mastercard"],
  "stageId": "stg_abc123def456789012345678",
  "actionPerformerURDD": 507
}
```

### Confirm

```
POST /api/guest/payments/confirm
```

```json
{
  "transactionId": 333,
  "moyasarPaymentId": "4af88e93-...",
  "actionPerformerURDD": 507
}
```

---

## 3. Edit API

### Endpoint

```
PUT /api/guest/booking/edit
```

Platform: `AUTH_PLATFORM` (encrypted + access token)

### Request Body

```json
{
  "bookingId": 9950,
  "checkIn": "2026-08-01",
  "checkOut": "2026-08-05",
  "adults": 6,
  "children": 0,
  "specialRequests": "Late check-in please",
  "addServices": [
    { "serviceId": 280, "quantity": 1, "sessions": [{ "date": "2026-08-02", "slot": "09:00-10:00" }] }
  ],
  "removeServices": [42],
  "stageId": "stg_abc123def456789012345678",
  "actionPerformerURDD": 507
}
```

| Field | Type | Required | Description |
|---|---|---|---|
| `bookingId` | number | Yes | Booking to edit |
| `stageId` | string | No | Stage ID from the stage API. When provided, the edit adopts pre-reserved units instead of re-picking |
| `checkIn` | string | No | New check-in (YYYY-MM-DD) |
| `checkOut` | string | No | New check-out (YYYY-MM-DD) |
| `adults` | number | No | New adult count |
| `children` | number | No | New child count |
| `specialRequests` | string | No | Updated special requests text |
| `addServices` | array | No | Services to add |
| `removeServices` | array | No | `bookingServiceId` values to remove. Supports `number` or `{ bookingServiceId, quantity?, slot_id? }` |

### Response (200 OK)

```json
{
  "bookingId": 9950,
  "previousTotal": 4800,
  "newTotal": 9600,
  "paidAmount": 9600,
  "requiredDownPayment": 1920,
  "additionalPaymentNeeded": 0,
  "overflowAmount": 0,
  "currency": "SAR",
  "changes": {
    "dates": { "checkIn": "2026-08-01", "checkOut": "2026-08-05" },
    "partySize": { "adults": 6, "children": 0, "total": 6 },
    "servicesAdded": 1,
    "servicesRemoved": 1
  }
}
```

### How `stageId` Changes Edit Behavior

| Scenario | Behavior |
|---|---|
| `stageId` provided, holds exist | Adopts held `booking_items` → promotes `item_status` from `'pending'` to `'reserved'`, clears `notes`. No re-pick needed |
| `stageId` provided, holds expired/missing | Falls back to re-pick (may 409 if rooms are taken) |
| `stageId` not provided | Original behavior — cancels old items and re-picks (may 409) |
| `stageId` expired | Returns `400: "Stage has expired. Please re-stage your changes."` |
| `stageId` already committed | Returns `400: "Stage has already been committed."` |

### Error Responses

| Status | Condition |
|---|---|
| 400 | Invalid dates, expired stage, already-committed stage, validation failure |
| 403 | Editing another guest's booking |
| 404 | Booking or stage not found |
| 409 | Not enough rooms available (only when holds are missing/expired) |
| 422 | Booking in non-editable status (cancelled, checked_out, completed, no_show) |

---

## 4. Hold Lifecycle

### Creation

When staging requires room re-assignment, the stage API:

1. Cleans up expired holds system-wide (lazy garbage collection)
2. Releases any previous stage holds for this booking
3. Picks available units via `pickAvailableUnitForService` / `pickMultipleAvailableUnits`
4. Inserts `booking_items` rows:

```sql
INSERT INTO booking_items
  (booking_id, unit_id, guests, scheduled_start, scheduled_end,
   item_status, notes, status, created_by, updated_by)
VALUES (9950, 854, 3, '2026-08-01', '2026-08-05',
        'pending', 'stage:stg_abc123...', 'active', 507, 507)
```

### Adoption (Edit)

The edit API looks up holds by `stageId`:

```sql
SELECT item_id, unit_id FROM booking_items
WHERE booking_id = ? AND item_status = 'pending' AND status = 'active'
  AND notes = 'stage:{stageId}'
```

If found, promotes them:

```sql
UPDATE booking_items
SET item_status = 'reserved', notes = NULL, guests = ?, scheduled_start = ?, scheduled_end = ?
WHERE item_id = ?
```

### Expiry Cleanup

Runs lazily at the start of every stage call:

```sql
UPDATE booking_items bi
INNER JOIN booking_stages bs ON bi.notes = CONCAT('stage:', bs.stage_id)
SET bi.item_status = 'cancelled', bi.status = 'inactive'
WHERE (bs.status = 'expired' OR bs.expires_at < NOW())
  AND bi.item_status = 'pending' AND bi.status = 'active'
```

### Why Holds Block Availability

The existing `pickAvailableUnitForService` query excludes units with:

```sql
bi.status = 'active' AND bi.item_status NOT IN ('cancelled', 'checked_out')
```

Since `'pending'` is not excluded, held units are treated as occupied. No
availability query changes were needed.

---

## 5. Edge Cases

| Scenario | Behavior |
|---|---|
| Guest re-stages (calls stage again for same booking) | Previous holds released, new holds created |
| Stage expires without edit | Holds cancelled lazily on next stage call |
| Edit without `stageId` | Original re-pick behavior |
| Edit with expired `stageId` | 400 error, guest must re-stage |
| Staged holds partially missing | Falls back to re-pick for all rooms |
| Edit with `stageId` but no room changes needed | Holds not looked up |
| Two guests stage edits on different bookings for the same room | First stage gets the hold, second stage sees the room as unavailable |

---

## 6. Files

| File | Role |
|---|---|
| `Src/HelperFunctions/PreProcessingFunctions/Guest/stageBookingChanges.js` | Stage API handler — cleanup, validation, pricing, unit holds |
| `Src/HelperFunctions/PreProcessingFunctions/Guest/editBooking.js` | Edit API handler — adopt-or-repick logic |
| `Src/HelperFunctions/Guest/v2/createBookingShared.js` | `pickAvailableUnitForService`, `pickMultipleAvailableUnits`, `insertUnitAssignmentItem` |
| `Src/HelperFunctions/Guest/v2/availability/computeSlots.js` | Scheduler slot computation (treats holds as conflicts automatically) |
