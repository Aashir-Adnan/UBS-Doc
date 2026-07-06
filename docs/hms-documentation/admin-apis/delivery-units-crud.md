# Delivery Units CRUD

| Operation | Method | Path | Permission |
|---|---|---|---|
| List | GET | `/api/custom/delivery/units` | `list_delivery_units` |
| View | GET | `/api/custom/delivery/units?id=<unit_id>` | `view_delivery_units` |
| Add | POST | `/api/custom/delivery/units` | `add_delivery_units` |
| Update | PUT | `/api/custom/delivery/units?id=<unit_id>` | `update_delivery_units` |
| Delete | DELETE | `/api/custom/delivery/units?id=<unit_id>` | `delete_delivery_units` |
| Filtered List | POST | `/api/custom/delivery/units` (step 2) | none |

Manages **delivery units** — the concrete, bookable resources (tables, rooms, chairs, slots) that services are delivered on, each tied to a `service_category` and a leaf-zone `location`. A Tenant Admin or Service Manager uses these endpoints to maintain the unit inventory; the `current_status` field tracks live availability (`available` / `occupied` / `reserved` / `cleaning` / `maintenance`).

> **New (2026-07-06): the service-location anchor model.** A delivery unit no longer stores a raw location. Internally `delivery_units.location_id` now points at a **`service_locations` row (an "anchor")** whose `location_id` is the unit's real location and whose `service_id` is the unit's **currently-assigned service** (`NULL` = unassigned). The **API contract is unchanged** — you still send and receive `locationId` as a real location id — but responses now also expose `serviceLocationId` (the anchor) and `assignedServiceId`. See **[The service-location anchor model](#the-service-location-anchor-model)**.

---

## Authentication & Authorization

Each CRUD operation is gated by an RBAC permission held in the actor's URDP. The actor is identified by `actionPerformerURDD` and the encrypted `actionPerformerURDD` header, from which the tenant context (`tenant_id`) is resolved.

| Operation | Method | Permission |
|---|---|---|
| Add | POST | `add_delivery_units` |
| View | GET | `view_delivery_units` |
| List | GET | `list_delivery_units` |
| Update | PUT | `update_delivery_units` |
| Delete | DELETE | `delete_delivery_units` |
| Filtered List (step 2) | POST | none (`permission: null`) |

**Tenant ownership** — Update and Delete run a `requireDeliveryUnitsTenantMatch` guard first, rejecting with `TENANT_MISMATCH` when the existing unit's `created_by` belongs to a URDD outside the caller's tenant.

---

## Request Payload

Multilingual fields arrive as `{ "en": "...", "ar": "..." }`; `en` is stored on the `delivery_units` row and other languages go to `translated_entries`. (`currentStatus` is flattened to `en` on write, but its Arabic label comes from a fixed enum dictionary on read, not `translated_entries`.)

| Field | Type | Required | Description |
|---|---|---|---|
| `id` | `number` | View/Update/Delete | Unit ID (query param). |
| `actionPerformerURDD` | `number` | Yes | Acting user's URDD; recorded as `created_by`/`updated_by`. |
| `language_code` | `string` | No | Response language (query param; defaults to `en`). |
| `categoryId` | `number` | No | `service_categories` FK. |
| `locationId` | `number` | No | Leaf-zone **`locations`** id the unit belongs to (a real location). On Add/move the backend resolves this to a `service_locations` anchor internally — you always send the plain location id. |
| `identifier` | `object` | No | Unit identifier `{ en, ar }` (e.g. table number). |
| `label` | `object` | No | Display label `{ en, ar }`. |
| `unitType` | `object` | No | Unit type `{ en, ar }`. |
| `capacity` | `number` | No | Seating/occupancy capacity. |
| `currentStatus` | `object` | No | Live status `{ en, ar }` (`available`/`occupied`/`reserved`/`cleaning`/`maintenance`). |
| `sortOrder` | `number` | No | Display order. |
| `unitStatus` | `string` | No | Lifecycle `active`/`inactive`; on Update applied via `COALESCE` so omitting it preserves the current status. |

### Filtered List (step 2)

A separate POST step returns the full, enriched unit set filtered in-memory.

| Field | Type | Required | Description |
|---|---|---|---|
| `filters` | `object` | No | Filter map, e.g. `{ "current_status": [...], "categoryId": [...] }`. Empty array = no filter for that field. |
| `language_code` | `string` | No | Response language. |
| `actionPerformerURDD` | `number` | No | Acting user's URDD. |

### Example (Add)

```json
{
  "actionPerformerURDD": 1,
  "categoryId": 4,
  "locationId": 8,
  "identifier": { "en": "T-12", "ar": "ط-١٢" },
  "label": { "en": "Table 12", "ar": "طاولة ١٢" },
  "unitType": { "en": "table", "ar": "طاولة" },
  "capacity": 4,
  "currentStatus": { "en": "available", "ar": "متاح" },
  "sortOrder": 12
}
```

---

## Response

**Add** returns driver metadata plus the new `unit_id`:

```json
{ "insertId": 3273, "unit_id": 3273 }
```

**View** returns one enriched unit; **List** and **Filtered List** return arrays of the same shape (List rows carry `table_count`). Each row is hydrated with its category and the full building → floor → zone location hierarchy.

```json
{
  "id": 3273,
  "unitId": 3273,
  "categoryId": 4,
  "locationId": 8,
  "serviceLocationId": 316,
  "assignedServiceId": null,
  "identifier": { "en": "T-12", "ar": "ط-١٢" },
  "label": { "en": "Table 12", "ar": "طاولة ١٢" },
  "unitType": { "en": "table", "ar": "طاولة" },
  "currentStatus": { "en": "available", "ar": "متاح" },
  "capacity": 4,
  "sortOrder": 12,
  "unitStatus": "active",
  "service_categories_categoryName": "Restaurant",
  "building": { "id": 1, "name": "Main Building", "code": "MB" },
  "floor": { "id": 2, "name": "Ground", "code": "G" },
  "zone": { "id": 8, "name": "East Wing", "code": "EW" }
}
```

---

## Behavior

- **Soft delete.** Delete never removes the row. The `enforceDeleteGuard("delivery_unit")` pre-process probes for live dependents: a **clean delete** sets `delivery_units.status = 'inactive'`; a delete with **live dependents** sets `status = 'probation'`, finalized later by a cron once dependents clear. The ID is preserved so a future Update can reactivate it.
- **Delete response.** Reports `status_set` (`inactive` or `probation`), `deferred`, and the `dependents` list.
- **Status on Update** uses `status = COALESCE({{unitStatus}}, status)`, so a partial Update that omits `unitStatus` keeps the existing status. Note: `unitStatus` (lifecycle) is distinct from `currentStatus` (live availability enum).
- **Tenancy.** Update/Delete are blocked across tenants (`TENANT_MISMATCH`).
- **Multilingual.** Identifier, label, and unit-type round-trip as `{ en, ar }`; `en` on the base row, other languages in `translated_entries`. `currentStatus` Arabic comes from a fixed enum dictionary.
- **Anchor on create/move.** On **Add**, the backend reuses an existing unused `service_locations(NULL, thatLocation)` anchor for the same tenant (recycling one a prior service assignment left behind), or mints a fresh one, and stores its id in `location_id`. On **Update**, the anchor is kept unless you move the unit to a *different* `locationId` (a plain edit never drops an assigned service).
- **`current_status` is decoupled from service assignment (changed 2026-07-06).** Assigning or unassigning a service to a unit **no longer** flips `reserved`/`available` — the unit stays `available` and only real **bookings** move `current_status`. Assignment is now tracked by *which anchor the unit points at* (see below).

---

## The service-location anchor model

Since **2026-07-06** (migration `20260706_2_repoint_delivery_units_location_to_service_locations`), `delivery_units.location_id` is a **`service_locations.id` anchor**, not a raw `locations.id`:

```
delivery_units.location_id ──► service_locations.id            (the ANCHOR)
                                 .service_id  = assigned service (NULL = unassigned)
                                 .location_id ─► locations.id   (real zone ► floor ► building)
```

A unit's **real location** and its **assigned service** are both read through the anchor. To support it, `service_locations.service_id` became **nullable** and its `UNIQUE(service_id, location_id)` key was **dropped** (a location can hold many anchors).

### Lifecycle

| Event | Effect on the anchor | `current_status` |
|---|---|---|
| **Create unit** (this API) | Reuse an active, unused, same-tenant `(NULL, location)` anchor — else mint one; store its id in `location_id`. | untouched (`available`) |
| **Move unit** (this API, different `locationId`) | Reuse-or-mint a `(NULL, newLocation)` anchor; plain edits keep the current anchor. | untouched |
| **Assign service** (Services CRUD `deliver_unit`) | Mint `(serviceId, location)` and **repoint** the unit to it; old anchor left as a reusable orphan. | **stays `available`** |
| **Unassign service** (Services CRUD) | Null the `service_id` on the unit's **own** anchor in place; **inactivate** orphaned `NULL`-service anchors at that location (same tenant, referenced by no unit). | stays `available` |
| **Delete unit** (this API) | Anchor untouched; the unit row goes `probation`/`inactive` per the delete guard. | — |

> **API impact:** you still send/receive `locationId` as a real location. Responses add `serviceLocationId` (the anchor id) and `assignedServiceId` (the anchor's `service_id`, `null` when the unit has no service). Assignment/unassignment happens through the **Services CRUD** `deliver_unit` config, not here.

> **In progress:** the admin Bookings / Booking_rooms / Unit_availability / dropdown APIs and the **guest booking/availability engine** are being migrated to the anchor join separately; until then those surfaces resolve unit locations through a future update.

---

## Source Files

| File | Purpose |
|---|---|
| `Src/Apis/ProjectSpecificApis/CustomDeliveryUnits/Crud_Objects/Delivery_units.js` | API object definition, SQL templates, pre/post-process + filtered-list step; **anchor create/move** (`resolveOrCreateNullAnchor`) |
| `Src/Apis/ProjectSpecificApis/CustomDeliveryUnits/Crud_Objects/CRUD_parameters.js` | Request parameter schema + colMapper |
| `Src/Apis/ProjectSpecificApis/CustomDeliveryUnits/CONTEXT.md` | Engineering context for the anchor model (this API's internals) |
| `Src/HelperFunctions/PreProcessingFunctions/CustomServices/deliveryUnitsEnrichment.js` | Row hydration (multilingual + location via the `service_locations` hop; exposes `serviceLocationId` / `assignedServiceId`) |
| `Src/Apis/ProjectSpecificApis/CustomServices/Crud_Objects/Services.js` | **Assign/unassign** a service to units (`assignServiceToUnits` / `unassignServiceFromUnits`) via the `deliver_unit` config |
| `Src/HelperFunctions/PreProcessingFunctions/DeleteGuards/enforceDeleteGuard.js` | Deferred-delete guard (probation vs inactive) |
| `Src/HelperFunctions/PreProcessingFunctions/DeleteGuards/deleteGuards.js` · `cascadeSoftDeleteLocation.js` | Delivery-unit occupancy probe + location cascade (both hop through the anchor) |
| `Src/HelperFunctions/PreProcessingFunctions/tenantOwnership.js` | Cross-tenant Update/Delete guard factory |
| `data/migrations_completed/20260706_2_repoint_delivery_units_location_to_service_locations.sql` | The repoint migration (schema + backfill) |

---

## Change Log

| Date | Change |
|---|---|
| 2026-07-06 | **Anchor model.** `delivery_units.location_id` repointed to `service_locations.id`; `service_locations.service_id` made nullable + unique key dropped; per-unit backfill (migration `20260706_2`). Create/move now reuse-or-mint a `NULL`-service anchor; Services assign/unassign repoint the anchor and clean orphans; **`current_status` decoupled from assignment** (stays `available`). Responses add `serviceLocationId` + `assignedServiceId`. Admin/Default + guest surfaces to be migrated to the anchor join in a follow-up. |
