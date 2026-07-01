# Catalog CRUD

| Operation | Method | Path | Permission |
|---|---|---|---|
| List | **GET** | `/api/catalogs` | — |
| View | **GET** | `/api/catalogs?id=<id>` | — |
| Add | **POST** | `/api/catalogs` | — |
| Update | **PUT** | `/api/catalogs?id=<id>` | — |
| Delete | **DELETE** | `/api/catalogs?id=<id>` | — |

Manages the `catalog` table — the top-level catalog registry keyed by a `catalog_key`. A catalog is the parent grouping that pricing and other catalog-scoped records hang off of. Typically maintained by a **SaaS Admin** / platform operator.

> **Base path** is inferred from the object name `global.Catalogs_object` (the router PascalCases the URL path to resolve the object). If your router mounts this differently, the resource is `catalog` and the CRUD verbs below apply unchanged.

---

## Authentication & Authorization

No RBAC permission is enforced on any operation — `requestMetaData.permission` is `null` and `providedPermissions` is `false`. Access is therefore governed only by the platform/transport layer (the standard authenticated request pipeline), not by a per-operation permission check.

| Operation | Method | Permission |
|---|---|---|
| Add | POST | none (`null`) |
| View | GET (`?id=`) | none (`null`) |
| Update | PUT | none (`null`) |
| Delete | DELETE | none (`null`) |
| List | GET | none (`null`) |

---

## Request Payload

All fields resolve from the parameter schema. `actionPerformerURDD` identifies the acting user and is written to `created_by` / `updated_by`.

| Field | Type | Required | Description |
|---|---|---|---|
| `catalog_id` | number | No | Catalog primary key. Supplied as `?id=` (query) for View / Update / Delete. |
| `actionPerformerURDD` | number | No | Acting user's URDD. Stored as `created_by` (Add) and `updated_by` (Add/Update/Delete). |
| `language_code` | string | No | Language code (query) — reserved for translation resolution. |
| `catalog_catalogKey` | string | No | The catalog key value written to `catalog.catalog_key`. |

### Example — Add (POST)

```json
{
  "actionPerformerURDD": 42,
  "catalog_catalogKey": "SPA_SERVICES"
}
```

---

## Response

CRUD operations return the affected/queried rows via the standard CRUD template. List returns an array of catalog rows plus a `table_count` (total for pagination, page size 10); View returns the single matching row. Write operations return the query result (insert id / affected rows).

```json
{
  "id": 7,
  "catalog_catalogId": 7,
  "catalog_catalogKey": "SPA_SERVICES",
  "catalog_status": "active",
  "catalog_createdBy": 42,
  "catalog_updatedBy": 42,
  "catalog_createdAt": "2026-07-01T10:00:00.000Z",
  "catalog_updatedAt": "2026-07-01T10:00:00.000Z"
}
```

---

## Behavior

- **Soft delete.** Delete does not remove the row — it sets `status = 'inactive'` and updates `updated_by`. List and View still query by id; List explicitly filters out `status = 'inactive'` rows.
- **List filtering.** List returns only rows where `catalog.status != 'inactive'`.
- **No pre/post processing.** `preProcessFunctions` is empty and `postProcessFunction` is `null` — the query result is returned as-is.
- **Actor audit.** `created_by` and `updated_by` are populated from `actionPerformerURDD`.

---

## Source Files

| File | Purpose |
|---|---|
| `Src/Apis/ProjectSpecificApis/CatalogCrud/CatalogCrud.js` | API object definition (`global.Catalogs_object`) — CRUD SQL for the `catalog` table |
| `Src/Apis/ProjectSpecificApis/CatalogCrud/CRUD_parameters.js` | Request parameter schema + `colMapper` |
