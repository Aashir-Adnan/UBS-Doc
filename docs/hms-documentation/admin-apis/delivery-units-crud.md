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
| `locationId` | `number` | No | Leaf-zone `locations` FK the unit belongs to. |
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
- **Reservation coupling.** A unit's `current_status` is flipped between `reserved` and `available` by the Services CRUD when a `deliver_unit` config is added or removed; that reservation logic lives with Services, not here.

---

## Source Files

| File | Purpose |
|---|---|
| `Src/Apis/ProjectSpecificApis/CustomDeliveryUnits/Crud_Objects/Delivery_units.js` | API object definition, SQL templates, pre/post-process + filtered-list step |
| `Src/Apis/ProjectSpecificApis/CustomDeliveryUnits/Crud_Objects/CRUD_parameters.js` | Request parameter schema + colMapper |
| `Src/HelperFunctions/PreProcessingFunctions/CustomServices/deliveryUnitsEnrichment.js` | Row hydration (multilingual + joined location) |
| `Src/HelperFunctions/PreProcessingFunctions/DeleteGuards/enforceDeleteGuard.js` | Deferred-delete guard (probation vs inactive) |
| `Src/HelperFunctions/PreProcessingFunctions/tenantOwnership.js` | Cross-tenant Update/Delete guard factory |
