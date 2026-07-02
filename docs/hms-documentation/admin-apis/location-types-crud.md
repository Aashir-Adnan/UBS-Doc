# Location Types CRUD

CRUD for the tenant-scoped **location type** catalog (e.g. Floor, Wing, Pool Area) that categorizes physical locations. Types can be nested via `parentId`. Each tenant maintains its own set — uniqueness of `type` is enforced per tenant, and Delete is a soft-delete guarded against locations that are still in use.

| Operation | Method | Path | Permission |
|---|---|---|---|
| List | GET | `/api/location/types` | none |
| View | GET | `/api/location/types?id=<id>` | none |
| Add | POST | `/api/location/types` | none |
| Update | PUT | `/api/location/types` | none |
| Delete | DELETE | `/api/location/types?id=<id>` | none |

---

## Authentication & Authorization

No RBAC permission is declared on the object (`permission: null`). Access control is enforced structurally instead:

- **Update** and **Delete** run `makeTenantOwnershipPreProcess("location_type")` first, which rejects any attempt to modify a record that a **different tenant** created. The acting tenant is resolved from the requester's URDD (`decryptedPayload.tenant_id`), and the owning tenant from the row's `created_by` URDD.
- **Add** and **Update** enforce that the `type` value is unique within the tenant.

---

## Request Payload

| Field | Type | Required | Description |
|---|---|---|---|
| `id` | number | View/Update/Delete | Location type id. Read from the query string (`?id=`). |
| `type` | string | Add | The location type label (e.g. `Floor`, `Wing`). Unique per tenant. |
| `parentId` | number | No | Parent location type id, for nesting types into a hierarchy. |
| `status` | string | No | On Update only: `active` / `inactive`. Omit to leave unchanged (`COALESCE`d). |
| `actionPerformerURDD` | number | Yes | The acting user's URDD id. Recorded as `created_by` / `updated_by`. |
| `language_code` | string | No | Language hint (query param). |
| `tenant_id` | number | Yes (derived) | Acting tenant, resolved from the URDD; used for the uniqueness check. |

### Example (Add)

```json
{
  "actionPerformerURDD": 42,
  "type": "Floor",
  "parentId": null
}
```

---

## Response

**List** returns all non-inactive types for the tenant (paginated, `pageSize: 10`), each with a `table_count` window count:

```json
{
  "id": 7,
  "locationTypeId": 7,
  "type": "Floor",
  "parentId": null,
  "status": "active",
  "createdBy": 42,
  "updatedBy": 42,
  "createdAt": "2026-06-01T10:00:00.000Z",
  "updatedAt": "2026-06-01T10:00:00.000Z"
}
```

**View** returns the same shape for a single row by `id`. **Add** / **Update** return the standard CRUD write acknowledgement. **Delete** returns the soft-delete outcome (see Behavior).

---

## Behavior

### Uniqueness (Add / Update)

Before the INSERT/UPDATE runs, the object checks that no other **non-inactive** `location_type` row with the same `type` exists for the acting tenant (joined via `created_by` → `urdd.tenant_id`). On Update, the record being edited is excluded from the check. A collision throws `DUPLICATE_LOCATION_TYPE` (409).

### Update status handling

`status` is written with `COALESCE({{status}}, status)` — omitting it preserves the current value; sending `inactive` retires the type.

### Delete — soft-delete with probation guard

Delete uses `enforceDeleteGuard("location_type")` and a **no-op** `queryPayload.Delete`; the guard performs the write itself:

1. Resolves the target `id` (from `?id=`).
2. Runs the `in_use_services` probe: any **location of this type (or a descendant)** that still has an active `service_locations` link to a live service.
3. Soft-deletes the row **in place**:
   - If dependents exist → `status = 'probation'` (deferred; the id is preserved so a later PUT can reactivate it).
   - If none → `status = 'inactive'`.

The `deleteGuardResponse` postProcess surfaces the outcome (`status_set`, `deferred`, `dependents`).

---

## Error Responses

| Status | Condition |
|---|---|
| 400 | `id` missing on Delete |
| 403 | Tenant mismatch on Update/Delete — acting tenant differs from the record's owning tenant (`TENANT_MISMATCH`) |
| 404 | Record not found on Update/Delete (`RECORD_NOT_FOUND`) |
| 409 | Duplicate `type` for this tenant (`DUPLICATE_LOCATION_TYPE`) |
| 422 | Record's `created_by` URDD is missing/unlinked so the owning tenant can't be resolved (`OWNER_TENANT_UNRESOLVED`) |

When Delete finds live dependents it does **not** error — it returns `200` with `deferred: true` and `status_set: "probation"`.

---

## Source Files

| File | Purpose |
|---|---|
| `Src/Apis/ProjectSpecificApis/LocationTypesCrud/LocationTypesCrud.js` | API object definition; per-tenant uniqueness checks; CRUD SQL |
| `Src/Apis/ProjectSpecificApis/LocationTypesCrud/CRUD_parameters.js` | Request parameter schema + column mapper |
| `Src/HelperFunctions/PreProcessingFunctions/tenantOwnership.js` | `makeTenantOwnershipPreProcess` — cross-tenant write guard |
| `Src/HelperFunctions/PreProcessingFunctions/DeleteGuards/enforceDeleteGuard.js` | Delete guard factory — probes dependents, soft-deletes to probation/inactive |
| `Src/HelperFunctions/PreProcessingFunctions/DeleteGuards/deleteGuards.js` | `location_type` guard config (`in_use_services` probe) |
| `Src/HelperFunctions/PreProcessingFunctions/DeleteGuards/deleteGuardResponse.js` | Delete postProcess — surfaces the soft-delete outcome |
