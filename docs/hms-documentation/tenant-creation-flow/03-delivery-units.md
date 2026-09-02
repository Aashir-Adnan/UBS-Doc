---
title: "3 · Delivery Units"
sidebar_position: 3
---

# 3 · Delivery Units

`/api/custom/delivery/units` — the concrete bookable instances: rooms, tables, chairs, slots, vehicles.

A service is *what* a guest books; a delivery unit is *the thing they get*. "Deluxe King" is a
service; room 412 is a delivery unit.

| Method | Operation | Permission |
|---|---|---|
| `GET` | List | `list_delivery_units` |
| `GET ?id=` | View | `view_delivery_units` |
| `POST` | Add (single **or bulk**) | `add_delivery_units` |
| `PUT` | Update | `update_delivery_units` |
| `DELETE` | Delete | `delete_delivery_units` |

Ownership is enforced on top of the permission: a unit belonging to another tenant is refused
`403` even with the permission granted.

---

## The anchor model — read this before sending anything

`delivery_units.location_id` does **not** hold a `locations.id`. It holds a
**`service_locations.id`**, an *anchor* row that carries two things:

```
delivery_units.location_id ──► service_locations.id          (the ANCHOR)
                                 .service_id   = the unit's assigned service (NULL = unassigned)
                                 .location_id  = the unit's real physical location
```

So a unit's service assignment and its physical place are both read *through* the anchor. This
lets a unit be reassigned between services as a cheap repoint, with no schema churn and no touch
to `current_status` — which stays purely about bookings.

**In the API this is invisible.** You send a real `locations.id` as `locationId`; the backend
resolves or mints the anchor and stores that instead. You never send or receive an anchor id.

---

## POST · Add (single)

```json
{
  "actionPerformerURDD": 587,
  "categoryId": 3,
  "locationId": 41,
  "identifier": { "en": "412", "ar": "٤١٢" },
  "label": { "en": "Room 412", "ar": "غرفة ٤١٢" },
  "unitType": "room",
  "capacity": 2,
  "wifiName": "LM-Guest",
  "wifiPassword": "welcome123",
  "currentStatus": { "en": "available", "ar": "متاح" },
  "sortOrder": 12,
  "availability": [
    { "day": "mon", "from": "00:00", "to": "23:59" },
    { "day": "tue", "from": "00:00", "to": "23:59" }
  ],
  "unitStatus": "active"
}
```

**Success — 200**

```json
{
  "success": true,
  "data": { "insertId": 301, "delivery_unit_id": 301 },
  "meta": { "message": "Delivery unit created.", "status": 200, "priority": 1 }
}
```

**Three fields are multilingual: `identifier`, `label` and `currentStatus`.** A bare string is
still accepted — the flattening only kicks in when the value is an object — but sending
`en` / `ar` together is what gets the Arabic into `translated_entries`. `unitType` is **not**
multilingual; it is a plain string.

`locationId` is a **real location id**. The backend reuses an existing unused anchor at that
location, or mints a fresh one, and stores the anchor id. A newly created unit is unassigned
(`service_id NULL`) until a service claims it.

**`availability` omitted = untouched; sent as `[]` = cleared.** The schedule is shape-validated
before any write, so a malformed entry fails with `400 / E10` and nothing is persisted.

## POST · Add (bulk)

Rooms are created in blocks, so the endpoint takes an array under `objectArrayKey`:

```json
{
  "actionPerformerURDD": 587,
  "objectArrayKey": [
    { "categoryId": 3, "locationId": 41, "identifier": { "en": "412" }, "label": { "en": "Room 412" }, "unitType": "room", "capacity": 2 },
    { "categoryId": 3, "locationId": 41, "identifier": { "en": "413" }, "label": { "en": "Room 413" }, "unitType": "room", "capacity": 2 },
    { "categoryId": 3, "locationId": 41, "identifier": { "en": "414" }, "label": { "en": "Room 414" }, "unitType": "room", "capacity": 4 }
  ]
}
```

**Success — 200**

```json
{
  "success": true,
  "data": { "success": true, "count": 3, "unit_ids": [301, 302, 303] },
  "meta": { "message": "Delivery units created.", "status": 200, "priority": 1 }
}
```

:::warning Bulk create is not transactional
Each row is created in its own step, exactly as the single-row path does. A failure partway leaves
the earlier units created. Read `unit_ids` to see what actually landed rather than assuming
all-or-nothing.
:::

The generic array-batch executor cannot drive this endpoint — it resolves neither the anchor nor
the multilingual fields, so every column would bind `NULL`. The bulk path is therefore the
single-row pipeline looped per row.

### Errors

| Status | `scc` | `error.details` | Cause |
|---|---|---|---|
| 400 | `E10` | `Identifier is required` | missing required field |
| 400 | `E22` | `Capacity must be uniform across the service's units` | a unit's capacity disagrees with its siblings on the same service |
| 403 | `E41` | `You do not have permission to access this resource.` | actor lacks `add_delivery_units` |
| 403 | `E31` | `Record belongs to another tenant` | `locationId` is not this tenant's |

---

## GET · List

```
GET /api/custom/delivery/units?page_no=1&page_size=10
```

Returns rows with the unit's **real location** and **assigned service** resolved back through the
anchor, so the caller never sees anchor ids:

```json
{
  "success": true,
  "data": [
    {
      "id": 301,
      "identifier": "412",
      "label": "Room 412",
      "unitType": "room",
      "capacity": 2,
      "currentStatus": "available",
      "unitStatus": "active",
      "locationId": 41,
      "locationName": "Floor 3",
      "serviceId": 70,
      "serviceName": "Deluxe King",
      "sortOrder": 12,
      "table_count": 48
    }
  ],
  "meta": { "message": "Delivery units fetched.", "status": 200, "priority": 0 }
}
```

`table_count` is the unpaginated total, attached to every row by the paginator.

## GET · View

```
GET /api/custom/delivery/units?id=301
```

Same row shape as List, plus the full `availability` schedule and wifi fields.

---

## PUT · Update

```
PUT /api/custom/delivery/units?id=301
```

```json
{
  "actionPerformerURDD": 587,
  "id": 301,
  "categoryId": 3,
  "locationId": 45,
  "identifier": { "en": "412", "ar": "٤١٢" },
  "label": { "en": "Room 412 (Renovated)", "ar": "غرفة ٤١٢ (مجددة)" },
  "capacity": 3,
  "currentStatus": { "en": "available", "ar": "متاح" },
  "unitStatus": "active"
}
```

**Moving a unit** — sending a different `locationId` reuses or mints an anchor at the new location.
A plain edit that omits `locationId`, or repeats the current one, keeps the existing anchor, so an
edit never silently drops the unit's service assignment.

### The booked-unit guard

```json
{
  "success": false,
  "data": null,
  "meta": {
    "message": "This unit cannot be changed while it is booked.",
    "status": 400,
    "detail": "Cannot free a unit with an active booking (booking 9001).",
    "priority": 2,
    "source": "Pre-Process",
    "scc": "E22"
  },
  "error": {
    "message": "Cannot free a unit with an active booking (booking 9001).",
    "detail": "This unit cannot be changed while it is booked.",
    "code": "E22",
    "source": "Pre-Process"
  }
}
```

An update that would release a unit currently held by a booking is refused. `current_status` is
driven by bookings alone — it is not a field managers set to make a room look free.

---

## DELETE

```
DELETE /api/custom/delivery/units?id=301
```

```json
{
  "success": true,
  "resource": "delivery_unit",
  "id": 301,
  "status_set": "probation",
  "deferred": true,
  "dependents": [ { "check": "active_bookings", "count": 1, "sample_ids": [9001] } ],
  "message": "Delivery unit moved to probation — 1 active booking still references it."
}
```

With no active booking, `status_set` is `archived` and `deferred` is `false`. The unit's anchor is
left in place as a reusable orphan; it is not deleted.

---

## After this endpoint

Units exist but most are unassigned. [Services](./04-services.md) claim them via `deliverUnitIds`.
