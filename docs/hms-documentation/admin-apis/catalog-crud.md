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
| `catalog_catalogKey` | string | No | A JSON string `{"key": …, "label": {"en": …, "ar": …}}`. The key is stored in `catalog.catalog_key`, `label.en` in `catalog.catalog_name`, and `label.ar` as the Arabic of both columns in `translated_entries`. A plain string is accepted and used as both key and name. On Update, omitting it leaves the row unchanged. |

### Example — Add (POST)

```json
{
  "actionPerformerURDD": 42,
  "catalog_catalogKey": "{\"key\": \"service\", \"label\": {\"en\": \"service\", \"ar\": \"خدمة\"}}"
}
```

---

## Response

CRUD operations return the affected/queried rows via the standard CRUD template. List returns an array of catalog rows plus a `table_count` (total for pagination, page size 10); View returns the single matching row. Write operations return the query result (insert id / affected rows).

```json
{
  "id": 1,
  "catalog_catalogId": 1,
  "catalog_catalogKey": "{\"key\": \"service\", \"label\": {\"en\": \"service\", \"ar\": \"خدمة\"}}",
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
- **Storage.** Since migration `20261004_6_catalog_name_column`, `catalog.catalog_key` holds the plain English key, the new `catalog.catalog_name` (after `catalog_id`) the English name, and `translated_entries` (`table_name = 'catalog'`, columns `catalog_key` and `catalog_name`, language `ar`) the Arabic. List and View rebuild `catalog_catalogKey` as the JSON string above, so the response is unchanged; the Arabic falls back to the English name when no translation exists.
- **Filtering and sorting.** `catalog_catalogKey` filters on the plain key and `catalog_catalogName` on the English name.
- **Actor audit.** `created_by` and `updated_by` are populated from `actionPerformerURDD`.

---

## Source Files

| File | Purpose |
|---|---|
| `Src/Apis/ProjectSpecificApis/CatalogCrud/CatalogCrud.js` | API object definition (`global.Catalogs_object`) — CRUD SQL for the `catalog` table |
| `Src/Apis/ProjectSpecificApis/CatalogCrud/CRUD_parameters.js` | Request parameter schema + `colMapper` |
| `Src/HelperFunctions/PreProcessingFunctions/Catalog/catalogCrud.js` | Splits the incoming JSON on write, stores the Arabic, rebuilds the JSON string on read |
