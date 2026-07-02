# Region & Countries CRUD

A single CRUD endpoint that manages both **regions** and **countries** on one object, switched by a `type` discriminator (`region` | `country`). Names are **multilingual** (`{ en, ar }`) — the English value lives on the base table while other languages are stored in `translated_entries`. List returns the full region tree with countries grouped under their region.

| Operation | Method | Path | Permission |
|---|---|---|---|
| List | GET | `/api/region/countries` | none |
| View | GET | `/api/region/countries?id=<id>&type=<region\|country>` | none |
| Add | POST | `/api/region/countries` | none |
| Update | PUT | `/api/region/countries` | none |
| Delete | DELETE | `/api/region/countries?id=<id>&type=<region\|country>` | none |

---

## Authentication & Authorization

No RBAC permission is declared (`permission: null`). These are shared reference-data tables. `actionPerformerURDD` is recorded as `created_by` / `updated_by` on writes.

---

## Request Payload

| Field | Type | Required | Description |
|---|---|---|---|
| `type` | string | Yes | `region` or `country` — selects which table the operation targets. |
| `id` | number | View/Update/Delete | Record id (`region_id` or `country_id`). Read from the query string. |
| `name` | object | Add/Update | Multilingual name `{ "en": "...", "ar": "..." }`. `en` is stored on the row; other languages upsert into `translated_entries`. |
| `code` | string | Add/Update | ISO-style code (region e.g. `ME`, country e.g. `SA`). |
| `regionId` | number | Country ops | Parent region id — required when `type` is `country`. |
| `actionPerformerURDD` | number | Yes | Acting user's URDD id. |
| `language_code` | string | No | Language hint. |

### Example (Add a country)

```json
{
  "type": "country",
  "regionId": 3,
  "name": { "en": "Saudi Arabia", "ar": "المملكة العربية السعودية" },
  "code": "SA",
  "actionPerformerURDD": 42
}
```

---

## Response

### List

Returns **all** regions and countries in full (fetched fresh, independent of pagination), with countries grouped by region id. Names are returned as `{ en, ar }`:

```json
{
  "regions": [
    {
      "id": 3,
      "name": { "en": "Middle East", "ar": "الشرق الأوسط" },
      "code": "ME",
      "status": "active",
      "createdAt": "2026-06-01T10:00:00.000Z",
      "updatedAt": "2026-06-01T10:00:00.000Z"
    }
  ],
  "regionCountries": {
    "3": [
      {
        "id": 11,
        "regionId": 3,
        "name": { "en": "Saudi Arabia", "ar": "المملكة العربية السعودية" },
        "code": "SA",
        "status": "active",
        "createdAt": "2026-06-01T10:00:00.000Z",
        "updatedAt": "2026-06-01T10:00:00.000Z"
      }
    ]
  }
}
```

### View

Returns the single row with its multilingual `name`:

```json
{
  "id": 11,
  "regionId": 3,
  "name": { "en": "Saudi Arabia", "ar": "المملكة العربية السعودية" },
  "code": "SA",
  "status": "active",
  "createdAt": "2026-06-01T10:00:00.000Z",
  "updatedAt": "2026-06-01T10:00:00.000Z"
}
```

### Add

Returns the write result plus the new `id` (`insertId`).

---

## Behavior

### Multilingual name handling

On **Add** and **Update**, `regionCountriesWritePreProcess` flattens `name`: the full `{ en, ar }` object is stashed on `_mlName`, and `name` is reduced to its `en` value for the base-table INSERT/UPDATE. After the write, the postProcess **upserts every non-`en` language** into `translated_entries` (`table_name` = `regions`/`countries`, `column_name` = `name`) via `upsertTranslation`.

On read, `mlName` composes the response `name` by pairing the row's English value with translations fetched from `translated_entries`, falling back to the English value when a translation is absent.

### Region vs country routing

Every operation branches on `type`:
- `region` → `regions` table, keyed by `region_id`.
- `country` → `countries` table, keyed by `country_id` (requires `regionId`).

### Delete

Delete is a **soft-delete**: it sets `status = 'inactive'` on the targeted row (no hard delete). List/View exclude inactive rows.

---

## Source Files

| File | Purpose |
|---|---|
| `Src/Apis/ProjectSpecificApis/RegionCountriesCrud/RegionCountriesCrud.js` | API object; region/country routing; multilingual pre/post processing; List grouping |
| `Src/Apis/ProjectSpecificApis/RegionCountriesCrud/CRUD_parameters.js` | Request parameter schema (incl. `multilingualTextField` name) |
| `Src/HelperFunctions/PreProcessingFunctions/CustomServices/translationUpsert.js` | `upsertTranslation` — writes non-`en` names into `translated_entries` |
