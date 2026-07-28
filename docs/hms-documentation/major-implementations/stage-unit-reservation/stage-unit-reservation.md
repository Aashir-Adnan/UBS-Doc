---
sidebar_position: 1
title: "Stage Unit Reservation — Temporary Holds for Booking Edits"
description: "How the staging API temporarily reserves delivery units (rooms) for 5 minutes so that the subsequent edit is guaranteed to succeed after payment."
---

# Stage Unit Reservation — Temporary Holds for Booking Edits

## Problem

The booking edit flow follows a **stage → payment → commit** pipeline:

1. Guest stages changes (preview pricing delta)
2. Guest pays the additional amount (if any)
3. Guest commits the edit (with `stageId`)

**Before this change**, the stage API was purely read-only — it computed pricing
but did **not** reserve any units. Between staging and committing, another guest
could book the same room, causing the edit to fail with a `409 Conflict` even
though the first guest had already paid. This is the exact failure seen in
production:

```
Stage → 200 OK (stageId: stg_6ed526d...)
PaymentConfirm → 200 OK (balanceDueRemaining: 0)
EditBooking → 409 Conflict ("Not enough rooms available")
```

The guest has paid but cannot complete the edit — the worst possible UX.

## Solution

The stage API now **temporarily reserves delivery units** for 5 minutes. When the
edit API receives a `stageId`, it **adopts** the pre-reserved units instead of
re-picking — guaranteeing the edit succeeds if staging did.

```
Stage → picks rooms → inserts booking_items(pending) → 5-min hold
  ↓
Payment → rooms are held, nobody else can book them
  ↓
Edit (with stageId) → adopts held items → promotes to 'reserved' → guaranteed success
  ↓
Expiry (no edit within 5 min) → cleanup releases the pending items
```

---

## How It Works

### Stage Creates Holds

When `POST /api/guest/booking/stage` detects that the proposed changes require
room re-assignment (date change or party size increase), it:

1. **Cleans up expired holds** system-wide (lazy garbage collection)
2. **Releases any previous stage holds** for this booking (re-staging replaces old holds)
3. **Picks available units** using the existing `pickAvailableUnitForService` /
   `pickMultipleAvailableUnits` functions
4. **Inserts `booking_items` rows** with:
   - `item_status = 'pending'`
   - `notes = 'stage:{stageId}'`
   - `status = 'active'`
   - Real `scheduled_start` / `scheduled_end` dates

These rows are immediately visible to the availability system because the
existing conflict queries check `item_status NOT IN ('cancelled', 'checked_out')`
— and `'pending'` is not in that exclusion list.

### Edit Adopts or Re-picks

When `PUT /api/guest/booking/edit` receives a `stageId`:

1. **Looks for staged holds**: `booking_items WHERE notes = 'stage:{stageId}' AND item_status = 'pending'`
2. **If found** (enough units): promotes them to `item_status = 'reserved'`, clears `notes`, updates guests/dates — no re-picking needed
3. **If not found** (expired or missing): falls back to the original re-pick behavior (may fail with 409)

When no `stageId` is provided, the edit works exactly as before — cancel old items and re-pick.

### Expiry & Cleanup

Expired holds are cleaned up **lazily** at the start of every stage call:

```sql
UPDATE booking_items bi
INNER JOIN booking_stages bs ON bi.notes = CONCAT('stage:', bs.stage_id)
SET bi.item_status = 'cancelled', bi.status = 'inactive'
WHERE (bs.status = 'expired' OR bs.expires_at < NOW())
  AND bi.item_status = 'pending' AND bi.status = 'active'
```

This means expired holds don't block rooms indefinitely — they're released the
next time any guest stages a booking change.

---

## API Details

### Stage Request (unchanged)

```
POST /api/guest/booking/stage
```

```json
{
  "bookingId": 9950,
  "changes": {
    "checkIn": "2026-08-01",
    "checkOut": "2026-08-05",
    "adults": 6
  },
  "actionPerformerURDD": 507
}
```

### Stage Response (new fields)

```json
{
  "staged": true,
  "stageId": "stg_abc123...",
  "expiresAt": "2026-07-28T13:35:00.000Z",
  "current": { "subtotal": 4800, "grandTotal": 4800, "paidAmount": 4800, "currency": "SAR" },
  "proposed": { "subtotal": 9600, "grandTotal": 9600, "currency": "SAR" },
  "delta": {
    "subtotalChange": 4800,
    "grandTotalChange": 4800,
    "additionalPaymentRequired": 4800,
    "estimatedRefund": 0,
    "currency": "SAR"
  },
  "changes": {
    "dates": { "checkIn": "2026-08-01", "checkOut": "2026-08-05", "nights": 4 },
    "partySize": { "adults": 6, "children": 0, "total": 6, "currentRoomCount": 1, "proposedRoomCount": 2 },
    "servicesAdded": [],
    "servicesRemoved": [],
    "heldUnitIds": [854, 855]
  },
  "validation": { "valid": true, "errors": [] }
}
```

New fields:
- **`expiresAt`**: now reflects the 5-minute TTL (was 15 minutes)
- **`changes.heldUnitIds`**: array of `unit_id` values that were temporarily reserved (only present when units were held)

### Edit Request (unchanged)

```
PUT /api/guest/booking/edit
```

```json
{
  "bookingId": 9950,
  "adults": 6,
  "stageId": "stg_abc123...",
  "actionPerformerURDD": 507
}
```

The `stageId` field was already supported — no frontend changes needed.

---

## Database Impact

### Tables Modified at Stage Time

| Table | Action | Condition |
|---|---|---|
| `booking_stages` | INSERT | Always (stores stage metadata) |
| `booking_items` | INSERT | Only when room re-assignment is needed |

### Hold Row Shape

```sql
INSERT INTO booking_items
  (booking_id, unit_id, guests, scheduled_start, scheduled_end,
   item_status, notes, status, created_by, updated_by)
VALUES
  (9950, 854, 3, '2026-08-01', '2026-08-05',
   'pending', 'stage:stg_abc123...', 'active', 507, 507)
```

### Why Existing Queries Treat Holds as Conflicts

The `pickAvailableUnitForService` function excludes units with active
non-cancelled/non-checked-out booking items:

```sql
AND NOT EXISTS (
  SELECT 1 FROM booking_items bi
  JOIN bookings b ON bi.booking_id = b.booking_id
  WHERE bi.unit_id = du.unit_id
    AND bi.status = 'active'
    AND bi.item_status NOT IN ('cancelled', 'checked_out')
    ...
)
```

Since `item_status = 'pending'` is NOT in the exclusion list, staged holds are
automatically treated as occupied — no changes to availability queries were needed.

Similarly, `computeSlots.js` checks:

```sql
SELECT unit_id, scheduled_start, scheduled_end FROM booking_items
WHERE unit_id IN (...) AND status = 'active'
  AND item_status NOT IN ('cancelled', 'checked_out')
  AND DATE(scheduled_start) = ?
```

Staged holds appear as conflicts here too, so the scheduler UI shows the held
slots as unavailable.

---

## Edge Cases

| Scenario | Behavior |
|---|---|
| Guest re-stages (calls stage again for same booking) | Previous holds are released, new holds are created |
| Stage expires without edit | Holds cancelled lazily on next stage call by any user |
| Edit without stageId | Falls back to re-pick (original behavior, may 409) |
| Edit with expired stageId | Returns `400: "Stage has expired. Please re-stage your changes."` |
| Staged holds partially missing (e.g., 1 of 2 rooms expired) | Falls back to re-pick for all rooms |
| Edit with stageId but no room changes | Staged holds not looked up (only room changes use holds) |

---

## Files Changed

| File | Change |
|---|---|
| `Src/HelperFunctions/PreProcessingFunctions/Guest/stageBookingChanges.js` | TTL 15→5 min, added `cleanupExpiredStageHolds`, `releaseExistingStageHolds`, unit pick + hold insertion, `heldUnitIds` in response |
| `Src/HelperFunctions/PreProcessingFunctions/Guest/editBooking.js` | Added `adoptOrPickUnits` helper, cancel step excludes staged holds, adopt-or-fallback logic |

---

## Frontend Impact

**No frontend changes required.** The stage and edit request formats are
identical. The only additions are:

- `expiresAt` now reflects 5 minutes (cosmetic — frontend already shows a timer)
- `changes.heldUnitIds` is a new optional field (can be ignored or shown as confirmation)

The frontend should continue to:
1. Call stage → show pricing preview
2. If additional payment needed → initiate payment with `stageId`
3. After payment → call edit with `stageId`
4. If stage expires → prompt guest to re-stage
