---
title: "2 · Service Location Facets"
sidebar_position: 2
---

# 2 · Service Location Facets

`/api/custom/service_location_facets` — the tenant's physical map.

**One endpoint, two entities.** Every request carries `entity`, which selects the table:

| `entity` | Table | What it is |
|---|---|---|
| `location_type` | `location_type` | the *kind* of place — building, floor, zone. A hierarchy in itself. |
| `location` | `locations` | an actual place of that kind — "Tower A", "Floor 3", "Poolside" |

Omitting `entity` resolves to `location`.

| Method | Operation | Purpose |
|---|---|---|
| `GET` | List | the whole facet tree for the tenant |
| `GET ?id=` | View | one row |
| `POST` | Add | create a type or a location |
| `PUT` | Update | edit one |
| `DELETE` | Delete | soft-delete, cascading down the subtree |

**Permission:** `null`. Authorization is by **tenant ownership** — a row whose tenant differs from
the actor's is refused `403` — plus one extra rule below.

:::warning `location_type` is system-tenant only
Creating, editing or deleting a **location type** requires a system-tenant actor. Types are cloned
into every tenant by step 1; a hotel manager arranges *locations* within those types but cannot
invent new types. `location` operations are open to the tenant's own managers.
:::

---

## GET · List

```
GET /api/custom/service_location_facets
```

```json
{
  "actionPerformerURDD": 587,
  "language_code": "en"
}
```

**Success — 200.** Both facets in one response, each with its parent chain intact:

```json
{
  "success": true,
  "data": {
    "location_types": [
      { "id": 12, "type": "building", "parentId": null, "typeStatus": "active" },
      { "id": 13, "type": "floor",    "parentId": 12,   "typeStatus": "active" },
      { "id": 14, "type": "zone",     "parentId": 13,   "typeStatus": "active" }
    ],
    "locations": [
      { "id": 40, "name": "Tower A", "code": "TWR-A", "locationTypeId": 12, "parentId": null, "locationStatus": "active" },
      { "id": 41, "name": "Floor 3", "code": "F3",    "locationTypeId": 13, "parentId": 40,   "locationStatus": "active" },
      { "id": 42, "name": "Poolside","code": "POOL",  "locationTypeId": 14, "parentId": 41,   "locationStatus": "active" }
    ]
  },
  "meta": { "message": "Locations fetched.", "status": 200, "priority": 0 }
}
```

## GET · View

```
GET /api/custom/service_location_facets?id=41&entity=location
```

```json
{
  "success": true,
  "data": {
    "id": 41,
    "locationTypeId": 13,
    "name": "Floor 3",
    "description": "Third floor, west wing",
    "code": "F3",
    "parentId": 40,
    "locationStatus": "active",
    "createdBy": 587,
    "createdAt": "2026-08-21T09:14:02.000Z"
  },
  "meta": { "message": "Location fetched.", "status": 200, "priority": 0 }
}
```

With `entity=location_type` the same call returns the type columns instead — `id`, `type`,
`parentId`, `typeStatus` and the audit fields.

---

## POST · Add

**A location** — the ordinary case:

```json
{
  "actionPerformerURDD": 587,
  "entity": "location",
  "locationTypeId": 14,
  "name": "Poolside",
  "description": "Outdoor pool deck, level 3",
  "code": "POOL",
  "parentId": 41
}
```

**A location type** — system-tenant actors only:

```json
{
  "actionPerformerURDD": 1,
  "entity": "location_type",
  "type": "wing",
  "parentId": 12
}
```

**Success — 200**

```json
{
  "success": true,
  "data": { "insertId": 43, "id": 43, "entity": "location" },
  "meta": { "message": "Location created.", "status": 200, "priority": 1 }
}
```

`parentId` is what builds the tree. A root node sends `null`. Keep the chain consistent with the
type hierarchy — a `zone` location should hang off a `floor` location — because delivery units are
placed against these nodes and a broken chain makes a unit unreachable in the picker.

### Errors

| Status | `scc` | `error.details` | Cause |
|---|---|---|---|
| 400 | `E10` | `Name is required` | missing field for the chosen entity |
| 403 | `E31` | `Location types can only be managed from the system tenant` | `entity=location_type` with a tenant actor |
| 403 | `E31` | `Record belongs to another tenant` | the `parentId` or row is not this tenant's |

---

## PUT · Update

```
PUT /api/custom/service_location_facets?id=42
```

```json
{
  "actionPerformerURDD": 587,
  "entity": "location",
  "id": 42,
  "locationTypeId": 14,
  "name": "Poolside Terrace",
  "description": "Outdoor pool deck, level 3",
  "code": "POOL",
  "parentId": 41,
  "locationStatus": "active"
}
```

Status is applied as `COALESCE(<sent>, current)` — omit `locationStatus` / `typeStatus` and the
existing status is preserved rather than nulled.

Same errors as Add, plus `404 · E50` when the id does not exist or is not this tenant's.

---

## DELETE

```
DELETE /api/custom/service_location_facets?id=42&entity=location
```

Soft delete, and it **cascades down the subtree** — deleting a building parks its floors and their
zones. Deleting a `location_type` instead splices the type hierarchy, promoting child type nodes
so the chain stays connected.

**Success — 200, nothing blocking:**

```json
{
  "success": true,
  "resource": "location",
  "id": 42,
  "status_set": "archived",
  "deferred": false,
  "dependents": [],
  "message": "Location archived."
}
```

**Success — 200, dependents present:**

```json
{
  "success": true,
  "resource": "location",
  "id": 40,
  "status_set": "probation",
  "deferred": true,
  "dependents": [
    { "check": "delivery_units", "count": 12, "sample_ids": [301, 302, 303] },
    { "check": "active_bookings", "count": 3, "sample_ids": [9001, 9002, 9003] }
  ],
  "message": "Location moved to probation — 3 active bookings still reference it."
}
```

Both are `200`. **Read `deferred` and `status_set`, not the HTTP status**, to know whether the row
is gone or merely parked. A parked row is finalized later by the cron once its dependents clear,
and can be restored before then.

---

## After this endpoint

The map exists. Next come the [delivery units](./03-delivery-units.md) that sit on it.
