---
sidebar_position: 1
title: "Booking Changes Pipeline — Implementation Guide"
description: "Stage booking changes API, dual-price storage, scheduler slot availability with delivery unit awareness, and the stage → payment → commit flow."
---

# Booking Changes Pipeline — Implementation Guide

This document covers four interconnected features that together establish a
**stage → payment → commit** workflow for all booking modifications. It also
introduces dual-price storage on booking services and delivery-unit-aware slot
availability in the scheduler.

---

## Overview

### Problem

1. **No preview before payment.** When a guest edits a booking or adds services,
   the system immediately mutates the booking and then tells the guest how much
   more they owe. There is no way to preview the financial impact before
   committing.

2. **Missing current price on booking details.** The `services[].unitPrice`
   returned in upcoming/current bookings is the catalog base price at the time of
   booking. The guest never sees the *rules-adjusted* price they actually paid per
   unit. Frontend has no way to show "was X, you paid Y" without re-running
   pricing rules client-side.

3. **Scheduler slots ignore delivery unit capacity.** The scheduler API returns
   time slots but does not subtract slots already tentatively held by an
   uncommitted stage or by other guests currently browsing. Two guests can select
   the same slot and only one succeeds at commit time.

### Solution

| # | Feature | Summary |
|---|---------|---------|
| 1 | **Stage Booking Changes API** | New endpoint that simulates a booking modification (date change, party size change, add/remove services) and returns the pricing delta, new total, and required down payment — without mutating the booking. |
| 2 | **Dual-Price Storage** | Store both `base_price` (catalog price) and `current_price` (after pricing rules) on each `booking_services` row at insert time. Return both in the API response. |
| 3 | **Scheduler Delivery Unit Awareness** | Enhance the scheduler API to factor in how many delivery units exist per service, which are already reserved, and optionally which are tentatively held (via request body). |
| 4 | **Stage → Payment → Commit Flow** | Update booking edit and add-services docs/APIs to enforce the ordering: stage first, pay the delta, then commit the actual changes. |

---

## 1. Stage Booking Changes API

### API Endpoint

```
POST /api/guest/booking/stage
```

**Platform:** `AUTH_PLATFORM` (encrypted, authenticated)

### Request Body

```json
{
  "bookingId": 9724,
  "changes": {
    "checkIn": "2026-08-01",
    "checkOut": "2026-08-10",
    "adults": 3,
    "children": 1,
    "addServices": [
      {
        "serviceId": 228,
        "quantity": 2,
        "sessions": [
          { "date": "2026-08-02", "slot": "10:00-10:30" },
          { "date": "2026-08-03", "slot": "14:00-14:30" }
        ]
      }
    ],
    "removeServices": [1003]
  }
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `bookingId` | `number` | Yes | The booking to simulate changes on. |
| `changes` | `object` | Yes | The proposed modifications (same shape as edit booking body). |
| `changes.checkIn` | `string` | No | New check-in date (`YYYY-MM-DD`). |
| `changes.checkOut` | `string` | No | New check-out date (`YYYY-MM-DD`). |
| `changes.adults` | `number` | No | New adult count. |
| `changes.children` | `number` | No | New children count. |
| `changes.addServices` | `array` | No | Services to add (same shape as add-services-to-booking `addons`). |
| `changes.removeServices` | `array` | No | `booking_service_id` values to remove. |

### Response

```json
{
  "staged": true,
  "stageId": "stg_a1b2c3d4",
  "expiresAt": "2026-07-20T09:15:00.000Z",
  "current": {
    "subtotal": 11280,
    "appliedRules": [
      { "ruleId": 18, "ruleName": "Summer Discount", "type": "percentage", "value": 10, "contribution": -1128 }
    ],
    "grandTotal": 10152,
    "paidAmount": 15323,
    "currency": "SAR"
  },
  "proposed": {
    "subtotal": 9280,
    "appliedRules": [
      { "ruleId": 18, "ruleName": "Summer Discount", "type": "percentage", "value": 10, "contribution": -928 }
    ],
    "grandTotal": 8352,
    "currency": "SAR"
  },
  "delta": {
    "subtotalChange": -2000,
    "grandTotalChange": -1800,
    "additionalPaymentRequired": 0,
    "estimatedRefund": 6971,
    "currency": "SAR"
  },
  "changes": {
    "dates": { "checkIn": "2026-08-01", "checkOut": "2026-08-10", "nights": 9 },
    "partySize": { "adults": 3, "children": 1, "total": 4 },
    "servicesAdded": [
      { "serviceId": 228, "label": { "en": "Head Shave (Halq)", "ar": "حلق الرأس" }, "quantity": 2, "basePrice": 80, "currentPrice": 72, "lineTotal": 144 }
    ],
    "servicesRemoved": [
      { "bookingServiceId": 1003, "serviceId": 228, "label": { "en": "Head Shave (Halq)", "ar": "حلق الرأس" }, "refundAmount": 80 }
    ],
    "slotAvailability": [
      { "serviceId": 228, "date": "2026-08-02", "slot": "10:00-10:30", "available": true, "unitId": 45 },
      { "serviceId": 228, "date": "2026-08-03", "slot": "14:00-14:30", "available": true, "unitId": 46 }
    ]
  },
  "validation": {
    "valid": true,
    "errors": []
  }
}
```

| Response Field | Type | Description |
|----------------|------|-------------|
| `staged` | `boolean` | Whether the staging succeeded (all validations passed). |
| `stageId` | `string` | Unique identifier for this staged change set. Used by commit endpoint. |
| `expiresAt` | `string` | ISO timestamp after which the stage expires (default: 15 minutes). |
| `current` | `object` | Current booking pricing breakdown. |
| `proposed` | `object` | Pricing breakdown if the changes were applied. |
| `delta` | `object` | Difference between current and proposed. |
| `delta.additionalPaymentRequired` | `number` | How much more the guest must pay before committing (0 if refund scenario). |
| `delta.estimatedRefund` | `number` | Amount to be refunded if proposed total is less than paid amount. |
| `changes.slotAvailability` | `array` | For each requested session slot, whether a delivery unit is available. |
| `validation.valid` | `boolean` | `false` if any change would violate business rules. |
| `validation.errors` | `array` | List of error messages (e.g., `"Check-in date is in a blackout window"`). |

### What To Implement

**New files:**
- `Src/Apis/ProjectSpecificApis/GuestSpecificApis/GuestBookingStage/GuestBookingStage.js` — API object
- `Src/Apis/ProjectSpecificApis/GuestSpecificApis/GuestBookingStage/CRUD_parameters.js` — parameter schema
- `Src/HelperFunctions/PreProcessingFunctions/Guest/stageBookingChanges.js` — preProcess function

**Logic (preProcess):**

1. Load the booking and verify ownership (same as `editBooking.js`).
2. Clone the booking state in-memory (no DB writes).
3. Apply each proposed change to the clone:
   - Date changes → recalculate nights, validate min/max stay, blackout, advance booking.
   - Party size changes → validate against `max_persons_per_booking`.
   - Add services → validate `max_quantity_per_booking`, fetch catalog prices, check slot availability against delivery units.
   - Remove services → subtract from cloned total.
4. Run `applyPricingRules(clonedSubtotal, tenantId)` to get proposed grand total.
5. Compute delta: `proposedTotal - currentTotal`, `additionalPayment = max(0, proposedTotal - paidAmount)`.
6. Generate a `stageId` (prefixed `stg_`, random hex) and store the staged payload in a lightweight store (Redis key or `booking_stages` table) with a 15-minute TTL.
7. Return the full pricing comparison without touching the booking.

**Storage option — `booking_stages` table:**

```sql
CREATE TABLE booking_stages (
  stage_id        VARCHAR(32) PRIMARY KEY,
  booking_id      INT NOT NULL,
  urdd_id         INT NOT NULL,
  staged_changes  JSON NOT NULL,
  proposed_total  DECIMAL(12,2) NOT NULL,
  expires_at      DATETIME NOT NULL,
  status          ENUM('pending','committed','expired') DEFAULT 'pending',
  created_at      DATETIME DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_booking_expires (booking_id, expires_at)
);
```

### Validation Rules

| Condition | HTTP | Error Message |
|-----------|------|---------------|
| Booking not found or not owned | 404 | `Booking not found` |
| Booking status is cancelled/checked_out/completed | 400 | `Booking cannot be modified in its current status` |
| Check-in in the past | 400 | `Check-in date cannot be in the past` |
| Check-out before check-in | 400 | `Check-out must be after check-in` |
| Stay duration outside min/max nights | 400 | `Stay duration must be between N and M nights` |
| Date in blackout window | 400 | `Check-in date falls in a blackout period` |
| Service not found or inactive | 404 | `Service N not found` |
| Service belongs to different hotel | 400 | `Service does not belong to this hotel` |
| Quantity exceeds max_quantity_per_booking | 400 | `Maximum N booking(s) allowed for service "..."` |
| Requested slot unavailable (no delivery unit free) | 200 | Returned in `changes.slotAvailability[].available = false` (not a hard error) |

### Frontend Requirements

- Before calling edit booking or add services, call `POST /api/guest/booking/stage` with the same change payload.
- Display the `current` vs `proposed` pricing side by side.
- Show each line item in `changes.servicesAdded` / `changes.servicesRemoved` with prices.
- If `delta.additionalPaymentRequired > 0`, show a payment prompt with that amount.
- If `delta.estimatedRefund > 0`, inform the guest of the expected refund.
- If `validation.valid === false`, disable the confirm button and display `validation.errors`.
- If any `slotAvailability[].available === false`, warn the guest and allow slot re-selection.
- Pass `stageId` to the commit endpoint (edit booking / add services) so the backend can verify the staged state.

---

## 2. Dual-Price Storage on Booking Services

### Problem

`booking_services.unit_price` stores the catalog base price. The guest sees
`unitPrice: 80` in the response but actually paid a discounted amount (e.g., 72
after a 10% rule). There is no stored record of the rules-adjusted price per
service line.

### What To Implement

**Database migration:**

```sql
-- Add current_price column to booking_services
ALTER TABLE booking_services
  ADD COLUMN current_price DECIMAL(12,2) NULL AFTER unit_price;
```

Migration file: `data/migrations_completed/YYYYMMDD_1_add_current_price_to_booking_services.sql`

**Backend changes:**

1. **`addBookingServices.js` — `insertAddon()` function:**
   - After fetching `getCatalogPrice()`, also call `resolvePrice("services", serviceId, tenantId)` to get `currentPrice`.
   - Store both in the INSERT:
     ```javascript
     const { basePrice, currentPrice } = await resolvePrice("services", service.service_id, tenantId);
     // unit_price = basePrice (unchanged, backwards compatible)
     // current_price = currentPrice (new column)
     ```

2. **`createServiceBooking.js`, `createRoomBooking.js`, `createPackageBooking.js`:**
   - Same pattern: resolve both prices at booking creation time and store `current_price`.

3. **`editBooking.js` — date change repricing:**
   - When the stay `booking_services` row is repriced, update both `unit_price` and `current_price`.

4. **`bookingsBundle.js` — response builder:**
   - Read `current_price` from the `booking_services` row.
   - Add `basePrice` and `currentPrice` to the service object alongside existing `unitPrice`:
     ```javascript
     // In the addon object (line ~605):
     basePrice: asNumber(a.unit_price),          // catalog price at booking time
     currentPrice: asNumber(a.current_price),    // rules-adjusted price at booking time
     unitPrice: asNumber(a.unit_price),           // kept for backwards compatibility
     ```
   - Same for the primary service in the pricing block.

5. **`stageBookingChanges.js`:**
   - Use `resolvePrice()` for proposed add-services to show both `basePrice` and `currentPrice` in the staged response.

### Response Change

**Before:**
```json
{
  "serviceId": 228,
  "unitPrice": 80,
  "totalPrice": 80
}
```

**After:**
```json
{
  "serviceId": 228,
  "basePrice": 80,
  "currentPrice": 72,
  "unitPrice": 80,
  "totalPrice": 80
}
```

`unitPrice` is kept for backwards compatibility (same value as `basePrice`).
`currentPrice` is the price after pricing rules were applied at booking time.

The `pricing` block already shows `appliedRules` with the discount breakdown.
`currentPrice` simply makes it possible to show the per-line discounted price
without client-side math.

### Files Changed

- `data/migrations_completed/YYYYMMDD_1_add_current_price_to_booking_services.sql`
- `Src/HelperFunctions/PreProcessingFunctions/Guest/addBookingServices.js`
- `Src/HelperFunctions/PreProcessingFunctions/Guest/createServiceBooking.js`
- `Src/HelperFunctions/PreProcessingFunctions/Guest/createRoomBooking.js`
- `Src/HelperFunctions/PreProcessingFunctions/Guest/createPackageBooking.js`
- `Src/HelperFunctions/PreProcessingFunctions/Guest/editBooking.js`
- `Src/HelperFunctions/Guest/v2/bookingsBundle.js`

### Frontend Requirements

- Use `currentPrice` for display where the guest expects to see "what they paid per unit".
- Use `basePrice` if showing a strikethrough/original price comparison.
- The `pricing.appliedRules` block remains the authoritative source for rule-by-rule breakdown.

---

## 3. Scheduler Delivery Unit Awareness

### Problem

The scheduler API (`GET /api/guest/scheduler`) computes slots using
`computeServiceAvailability()` which already checks `booking_items` and
`booking_service_slots` for conflicts. However:

1. It does not account for **tentatively held** slots (staged but not yet
   committed).
2. It does not communicate **remaining capacity** — a slot with 3 units where 2
   are reserved still shows `available: true` but does not indicate only 1 unit
   remains.
3. The guest building a multi-slot booking (e.g., 3 barber sessions) cannot
   signal which slots they have already selected, so the scheduler does not
   subtract those from availability.

### API Endpoint Change

```
POST /api/guest/scheduler
```

**Note:** The scheduler changes from `GET` to `POST` to accept a request body.
The existing `GET` endpoint remains functional (backwards compatible) but without
the new `holdSlots` parameter.

### New Request Body Parameters

```json
{
  "from": "2026-08-01",
  "to": "2026-08-07",
  "categoryId": 305,
  "serviceId": 228,
  "holdSlots": [
    { "serviceId": 228, "date": "2026-08-02", "slot": "10:00-10:30" },
    { "serviceId": 228, "date": "2026-08-03", "slot": "14:00-14:30" }
  ]
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `from` | `string` | No | Start date (defaults to today). |
| `to` | `string` | No | End date (defaults to `from + 6`). |
| `categoryId` | `number` | No | Filter to single category. |
| `serviceId` | `number` | No | Filter to single service. |
| `holdSlots` | `array` | No | Slots the guest has already selected in this session. Treated as occupied when computing remaining availability. |

### Response Change

Each slot gains a `remaining` field:

```json
{
  "start": "10:00",
  "end": "10:30",
  "unitId": 45,
  "locationId": 12,
  "available": true,
  "remaining": 2,
  "total": 3,
  "genderConstraint": null
}
```

| Field | Type | Description |
|-------|------|-------------|
| `remaining` | `number` | How many delivery units are still available for this slot (after subtracting confirmed bookings, staged holds, and `holdSlots` from the request). |
| `total` | `number` | Total delivery units that serve this slot. |

A slot is `available: false` when `remaining === 0`.

### What To Implement

**Changes to `computeSlots.js` — `computeServiceAvailability()`:**

1. Accept an optional `holdSlots` array parameter.
2. After fetching conflicting `booking_items` and `booking_service_slots`, also
   fetch active staged holds from `booking_stages` (where `status = 'pending'`
   and `expires_at > NOW()`).
3. Add `holdSlots` entries as synthetic conflicts for the same service.
4. For each time slot:
   - Count total units serving that slot (from `unit_availability` × `max_concurrent`).
   - Count confirmed conflicts + staged conflicts + holdSlot conflicts.
   - `remaining = total - conflicts`.
   - `available = remaining > 0`.

**Changes to `buildSchedulerTree.js`:**

1. Accept `holdSlots` parameter and pass it through to `computeServiceAvailability()`.
2. Include `remaining` and `total` in slot objects.

**Changes to `GuestScheduler.js`:**

1. Add `POST` as an accepted request method (alongside existing `GET`).
2. Read `holdSlots` from `req.body` when method is POST.

### Files Changed

- `Src/HelperFunctions/Guest/v2/availability/computeSlots.js`
- `Src/HelperFunctions/Guest/v2/availability/buildSchedulerTree.js`
- `Src/Apis/ProjectSpecificApis/GuestSpecificApis/GuestScheduler/GuestScheduler.js`
- `Src/Apis/ProjectSpecificApis/GuestSpecificApis/GuestScheduler/CRUD_parameters.js`

### Frontend Requirements

- When the guest selects a slot for a multi-quantity booking, add it to a local
  `holdSlots` array and re-fetch the scheduler with that array in the body.
- Display `remaining` / `total` as a capacity indicator (e.g., "2 of 3 slots
  available").
- Disable slot selection when `remaining === 0`.
- On page unload or session timeout, the holds expire automatically (no cleanup
  needed).

---

## 4. Stage → Payment → Commit Flow

### Updated Booking Modification Flow

The existing edit booking (`PUT /api/guest/booking/edit`) and add services
(`POST /api/guest/bookings/services`) endpoints continue to work, but they now
accept an optional `stageId` to link back to a staged preview.

```
┌─────────────────────────────────────────────────────────────────┐
│                    BOOKING MODIFICATION FLOW                    │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  1. STAGE                                                       │
│     POST /api/guest/booking/stage                               │
│     ├─ Validate all proposed changes                            │
│     ├─ Compute pricing delta (current vs proposed)              │
│     ├─ Check slot availability with delivery units              │
│     ├─ Return stageId + pricing comparison                      │
│     └─ Hold tentative slots for 15 minutes                      │
│                                                                 │
│  2. PAYMENT (if additionalPaymentRequired > 0)                  │
│     POST /api/guest/payment                                     │
│     ├─ Charge the delta amount                                  │
│     ├─ Record transaction with stageId reference                │
│     └─ Return paymentId / confirmation                          │
│                                                                 │
│  3. COMMIT                                                      │
│     PUT /api/guest/booking/edit                                  │
│       or POST /api/guest/bookings/services                      │
│     ├─ Verify stageId is still valid (not expired)              │
│     ├─ Verify payment completed (if required)                   │
│     ├─ Apply the actual changes to the booking                  │
│     ├─ Mark stage as committed                                  │
│     └─ Return updated booking                                   │
│                                                                 │
│  EXPIRY                                                         │
│     If 15 minutes pass without commit:                          │
│     ├─ Stage status → 'expired'                                 │
│     ├─ Tentative slot holds released                            │
│     └─ If payment was made, trigger refund                      │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### Changes to Edit Booking API

**Endpoint:** `PUT /api/guest/booking/edit`

**New optional parameter:**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `stageId` | `string` | No | Links to a prior stage call. When provided, the backend verifies the stage is valid and the changes match. |

**Behaviour when `stageId` is provided:**

1. Load the stage record from `booking_stages`.
2. Verify `status = 'pending'` and `expires_at > NOW()`.
3. Verify `booking_id` matches.
4. If `additionalPaymentRequired > 0`, verify a matching payment transaction exists.
5. Apply the changes (existing edit logic).
6. Update stage `status = 'committed'`.

**Behaviour when `stageId` is NOT provided:**

- Existing behaviour unchanged. The edit proceeds immediately (backwards
  compatible). This allows admin or system-initiated edits that don't need
  staging.

### Changes to Add Services API

**Endpoint:** `POST /api/guest/bookings/services`

**New optional parameter:**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `stageId` | `string` | No | Links to a prior stage call. |

Same verification logic as edit booking.

### Files Changed

- `Src/HelperFunctions/PreProcessingFunctions/Guest/editBooking.js` — add `stageId` verification
- `Src/HelperFunctions/PreProcessingFunctions/Guest/addBookingServices.js` — add `stageId` verification
- `Src/Apis/ProjectSpecificApis/GuestSpecificApis/GuestBookingEdit/CRUD_parameters.js` — add `stageId` param
- `Src/Apis/ProjectSpecificApis/GuestSpecificApis/GuestBookingServices/CRUD_parameters.js` — add `stageId` param

### Stage Expiry Cleanup

A cron job or TTL-based mechanism should mark expired stages:

```sql
UPDATE booking_stages
   SET status = 'expired'
 WHERE status = 'pending'
   AND expires_at < NOW();
```

This can run on the existing cron infrastructure (see `Services/CronManager/`).

---

## Error Responses

| HTTP | Condition | Message |
|------|-----------|---------|
| 400 | `stageId` provided but expired | `Stage has expired. Please re-stage your changes.` |
| 400 | `stageId` provided but already committed | `Stage has already been committed.` |
| 400 | `stageId` booking_id mismatch | `Stage does not match this booking.` |
| 402 | `stageId` requires payment but none found | `Payment required before committing changes. Additional amount: N SAR.` |
| 404 | `stageId` not found | `Stage not found.` |

---

## Database Changes Summary

| Change | Table | Description |
|--------|-------|-------------|
| New table | `booking_stages` | Stores staged change sets with TTL. |
| New column | `booking_services.current_price` | Rules-adjusted unit price at booking time. |

---

## Migration SQL

```sql
-- Migration: YYYYMMDD_1_booking_changes_pipeline.sql

-- 1. Staged booking changes table
CREATE TABLE IF NOT EXISTS booking_stages (
  stage_id        VARCHAR(32) PRIMARY KEY,
  booking_id      INT NOT NULL,
  urdd_id         INT NOT NULL,
  staged_changes  JSON NOT NULL,
  current_total   DECIMAL(12,2) NOT NULL,
  proposed_total  DECIMAL(12,2) NOT NULL,
  expires_at      DATETIME NOT NULL,
  status          ENUM('pending','committed','expired') DEFAULT 'pending',
  created_by      INT DEFAULT NULL,
  updated_by      INT DEFAULT NULL,
  created_at      DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at      DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_booking_expires (booking_id, expires_at),
  INDEX idx_status_expires (status, expires_at)
);

-- 2. Dual-price column on booking_services
ALTER TABLE booking_services
  ADD COLUMN current_price DECIMAL(12,2) NULL AFTER unit_price;
```

---

## New Files Summary

| File | Purpose |
|------|---------|
| `Src/Apis/ProjectSpecificApis/GuestSpecificApis/GuestBookingStage/GuestBookingStage.js` | API object for stage endpoint |
| `Src/Apis/ProjectSpecificApis/GuestSpecificApis/GuestBookingStage/CRUD_parameters.js` | Parameter schema |
| `Src/HelperFunctions/PreProcessingFunctions/Guest/stageBookingChanges.js` | Core staging logic |
| `data/migrations_completed/YYYYMMDD_1_booking_changes_pipeline.sql` | DB migration |

## Modified Files Summary

| File | Change |
|------|--------|
| `Src/HelperFunctions/PreProcessingFunctions/Guest/addBookingServices.js` | Store `current_price`, verify `stageId` |
| `Src/HelperFunctions/PreProcessingFunctions/Guest/createServiceBooking.js` | Store `current_price` |
| `Src/HelperFunctions/PreProcessingFunctions/Guest/createRoomBooking.js` | Store `current_price` |
| `Src/HelperFunctions/PreProcessingFunctions/Guest/createPackageBooking.js` | Store `current_price` |
| `Src/HelperFunctions/PreProcessingFunctions/Guest/editBooking.js` | Store `current_price`, verify `stageId` |
| `Src/HelperFunctions/Guest/v2/bookingsBundle.js` | Return `basePrice` + `currentPrice` |
| `Src/HelperFunctions/Guest/v2/availability/computeSlots.js` | Accept `holdSlots`, return `remaining`/`total` |
| `Src/HelperFunctions/Guest/v2/availability/buildSchedulerTree.js` | Pass `holdSlots` through |
| `Src/Apis/ProjectSpecificApis/GuestSpecificApis/GuestScheduler/GuestScheduler.js` | Accept POST + `holdSlots` |
| `Src/Apis/ProjectSpecificApis/GuestSpecificApis/GuestScheduler/CRUD_parameters.js` | Add `holdSlots` param |
| `Src/Apis/ProjectSpecificApis/GuestSpecificApis/GuestBookingEdit/CRUD_parameters.js` | Add `stageId` param |
| `Src/Apis/ProjectSpecificApis/GuestSpecificApis/GuestBookingServices/CRUD_parameters.js` | Add `stageId` param |

---

## What Is NOT Built Yet (Decisions Needed)

1. **Stage storage backend:** This doc assumes a MySQL `booking_stages` table.
   Redis with TTL is an alternative if the team prefers in-memory expiry over
   cron-based cleanup.

2. **Payment integration for staged delta:** The payment endpoint that accepts a
   `stageId` and charges the delta needs to be designed alongside the payment
   team. The stage API only computes the amount — it does not initiate payment.

3. **Concurrent stage conflict resolution:** If two guests stage changes to the
   same booking (e.g., same URDD on two devices), only the first committed stage
   should succeed. The second commit should re-validate against the new state.

4. **Backfill `current_price`:** Existing `booking_services` rows have
   `current_price = NULL`. Options: leave as-is (frontend falls back to
   `unitPrice`) or run a one-time backfill script that resolves prices for
   historical bookings.

5. **Stage expiry cron interval:** Suggested every 5 minutes. Needs alignment
   with cron manager schedule.
