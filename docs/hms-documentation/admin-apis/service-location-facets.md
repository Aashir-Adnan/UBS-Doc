# Service Location Facets

| Operation | Method | Path | Permission |
|---|---|---|---|
| List | GET | `/api/custom/service/location/facets` | none |
| View | GET | `/api/custom/service/location/facets?id=<id>` | none |
| Add | POST | `/api/custom/service/location/facets` | none |
| Update | PUT | `/api/custom/service/location/facets?id=<id>` | none |
| Delete | DELETE | `/api/custom/service/location/facets?id=<id>` | none |

Manages the tenant's physical location tree used to place services. It handles **two entities**, selected by the `entity` field: `location_type` (the shared Building / Floor / Zone classifier catalog) and `locations` (the per-tenant building → floor → zone nodes). List returns the assembled facet tree (buildings, floors, zones and full building › floor › zone locations) that admins pick from when assigning a service to a location. A Tenant Admin uses this to build the location tree; only the system tenant may edit the shared `location_type` catalog.

---

## Authentication & Authorization

No CRUD permission is declared on this object (`permission: null`); access is governed by request-level tenant context (`tenant_id`, resolved from the encrypted `actionPerformerURDD` header) and per-entity guards:

| Guard | Applies to | Effect |
|---|---|---|
| `requireSystemTenantForLocationType` | Add / Update / Delete of `location_type` | Only the system tenant may create or modify the shared type catalog; others get **403** `LOCATION_TYPE_FORBIDDEN`. |
| `requireLocationsTenantMatch` | Update / Delete of `locations` | Rejects with `TENANT_MISMATCH` when the target location's `created_by` belongs to a URDD outside the caller's tenant. |
| `bindTenantLocationType` | Add / Update of `locations` | Remaps an incoming global `locationTypeId` to the acting tenant's own clone of that type (system tenant and un-cloned types pass through unchanged). |

`location_type` is a system-shared catalog and is intentionally left unguarded by the per-tenant location filters. `locations` List results are scoped so each tenant sees only its own rows.

---

## Request Payload

The `entity` field routes the request (`location_type` vs `locations`, defaulting to `locations`). Multilingual fields (`name`, `description`) apply to `locations` only and arrive as `{ "en": "...", "ar": "..." }`; `location_type` has no multilingual columns.

| Field | Type | Required | Description |
|---|---|---|---|
| `id` | `number` | View/Update/Delete | Row ID (query param). |
| `actionPerformerURDD` | `number` | Yes | Acting user's URDD; recorded as `created_by`/`updated_by`. |
| `language_code` | `string` | No | Response language (query param; defaults to `en`). |
| `entity` | `string` | No | `location_type` or `locations` (default `locations`). |
| `type` | `string` | `location_type` only | Type name: `building` / `floor` / `zone`. |
| `parentId` | `number` | No | Parent node ID (floor→building, zone→floor; parent type→type). |
| `locationTypeId` | `number` | `locations` only | The `location_type` classifier for this location (remapped to the tenant's clone). |
| `name` | `object` | `locations` only | Location name `{ en, ar }`. |
| `description` | `object` | `locations` only | Description `{ en, ar }`. |
| `code` | `string` | `locations` only | Short code. |
| `typeStatus` | `string` | `location_type` only | `active`/`inactive`; on Update applied via `COALESCE`. |
| `locationStatus` | `string` | `locations` only | `active`/`inactive`; on Update applied via `COALESCE`. |

### Example (Add a location)

```json
{
  "actionPerformerURDD": 1,
  "entity": "locations",
  "locationTypeId": 3,
  "name": { "en": "East Wing", "ar": "الجناح الشرقي" },
  "description": { "en": "Ground floor east zone", "ar": "منطقة شرق الطابق الأرضي" },
  "code": "EW",
  "parentId": 2
}
```

### Example (Add a location type — system tenant only)

```json
{
  "actionPerformerURDD": 1,
  "entity": "location_type",
  "type": "zone",
  "parentId": 12
}
```

---

## Response

**Add** returns driver metadata plus the new `id`:

```json
{ "insertId": 8, "id": 8 }
```

**View** returns one row shaped by entity. For `locations`, multilingual fields are `{ en, ar }` and a leaf zone also carries a `hierarchy` walk:

```json
{
  "id": 8,
  "record_id": 8,
  "locationTypeId": 3,
  "name": { "en": "East Wing", "ar": "الجناح الشرقي" },
  "description": { "en": "Ground floor east zone", "ar": "منطقة شرق الطابق الأرضي" },
  "code": "EW",
  "parentId": 2,
  "locationStatus": "active",
  "hierarchy": { "building": {}, "floor": {}, "zone": {} }
}
```

**List** returns the assembled facet tree (no `entity` needed):

```json
{
  "locations": [
    {
      "location_id": 8,
      "code": "G/EW",
      "label": { "en": "Main Building › Ground › East Wing", "ar": "المبنى الرئيسي › الأرضي › الجناح الشرقي" },
      "building": { "id": 1, "code": "MB", "en": "Main Building", "ar": "المبنى الرئيسي", "status": "active" },
      "floor": { "id": 2, "code": "G", "en": "Ground", "ar": "الأرضي", "status": "active" },
      "zone": { "id": 8, "code": "EW", "en": "East Wing", "ar": "الجناح الشرقي", "status": "active" }
    }
  ],
  "buildings": [ { "id": 1, "key": "MB", "en": "Main Building", "ar": "المبنى الرئيسي", "status": "active" } ],
  "floors": [ { "id": 2, "key": "G", "en": "Ground", "ar": "الأرضي", "status": "active" } ],
  "zones": [ { "id": 8, "key": "EW", "en": "East Wing", "ar": "الجناح الشرقي", "status": "active" } ]
}
```

`locations` in the List are only the fully-resolved building → floor → zone chains; orphaned nodes are skipped.

---

## Behavior

- **Soft delete.** Delete never removes the row; the ID is preserved so a future Update can reactivate it.
  - `location_type` → generic `enforceDeleteGuard("location_type")`: a **clean delete** sets `status = 'inactive'`; a delete with **live dependents** sets `status = 'probation'`, finalized by a cron.
  - `locations` → `enforceLocationDeleteGuard`, which **cascades the building → floor → zone subtree** below the target down as part of the delete.
- **Delete response.** Reports `status_set` (`inactive` or `probation`), `deferred`, and the `dependents` list.
- **Status on Update** uses `COALESCE` (`typeStatus`/`locationStatus`), so a partial Update that omits status keeps the existing value.
- **Two entities, one endpoint.** `entity` selects `location_type` vs `locations`; the SQL, guards, and enrichment branch accordingly.
- **Tenancy.** `location_type` is a system-shared catalog editable only by the system tenant; `locations` are per-tenant, cross-tenant Update/Delete is blocked, and List returns only the caller tenant's locations. Incoming `locationTypeId` is remapped to the tenant's own type clone on write.
- **Multilingual.** `locations` name/description round-trip as `{ en, ar }` via `translated_entries`; `location_type` has none.

---

## Source Files

| File | Purpose |
|---|---|
| `Src/Apis/ProjectSpecificApis/ServiceLocationFacets/Custom_Objects/serviceLocationFacets.js` | API object definition, per-entity SQL/guards, facet-tree List builder |
| `Src/Apis/ProjectSpecificApis/ServiceLocationFacets/Custom_Objects/CRUD_parameters.js` | Request parameter schema + colMapper |
| `Src/HelperFunctions/PreProcessingFunctions/DeleteGuards/enforceDeleteGuard.js` | Deferred-delete guard for `location_type` (probation vs inactive) |
| `Src/HelperFunctions/PreProcessingFunctions/DeleteGuards/enforceLocationDeleteGuard.js` | Custom location delete guard — cascades the building › floor › zone subtree |
| `Src/HelperFunctions/PreProcessingFunctions/tenantOwnership.js` | Cross-tenant location Update/Delete guard |
| `Src/HelperFunctions/PayloadFunctions/Governance/getSystemTenantId.js` | Resolves the system tenant for the `location_type` gate |
