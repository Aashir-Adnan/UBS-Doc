# Landmarks CRUD

A CRUD endpoint that manages the **`landmarks`** reference table — searchable locations (cities, districts, holy sites, airports, transit hubs) that guests use as starting points for hotel discovery. **Global scope** (no `tenant_id`), modelled on [Region & Countries CRUD](./region-countries-crud.md). The landmark name is **multilingual** (`{ en, ar }`): the English value lives on `landmarks.landmark_name`, while other languages are stored in `translated_entries` (`table_name = 'landmarks'`, `column_name = 'landmark_name'`). List returns the full active set ordered for display.

| Operation | Method | Path | Permission |
|---|---|---|---|
| List | GET | `/api/crud/landmarks` | none |
| View | GET | `/api/crud/landmarks?id=<id>` | none |
| Add | POST | `/api/crud/landmarks` | none |
| Update | PUT | `/api/crud/landmarks?id=<id>` | none |
| Delete | DELETE | `/api/crud/landmarks?id=<id>` | none |

---

## Authentication & Authorization

No RBAC permission is declared (`permission: null`, `providedPermissions: false`) — `landmarks` is shared, global reference data. `actionPerformerURDD` is recorded as `created_by` / `updated_by` on writes.

---

## Request Payload

| Field | Type | Required | Description |
|---|---|---|---|
| `id` | number | View / Update / Delete | Landmark id (`landmark_id`). Read from the **query string**. |
| `landmarkName` | object | Add (Update optional) | Multilingual name `{ "en": "...", "ar": "..." }`. `en` is stored on the row; other languages upsert into `translated_entries`. |
| `landmarkSlug` | string | Add (Update optional) | URL-safe, globally **unique** slug (e.g. `makkah-sa`). |
| `landmarkType` | string | No | One of `city` \| `district` \| `site` \| `airport` \| `transit`. Defaults to `city` on Add when omitted. |
| `latitude` | number | Add (Update optional) | Decimal degrees, `-90..90` (`DECIMAL(10,7)`). |
| `longitude` | number | Add (Update optional) | Decimal degrees, `-180..180` (`DECIMAL(10,7)`). |
| `countryId` | number | Add (Update optional) | FK → `countries.country_id`. |
| `radiusKm` | number | No | Suggested discovery radius. Defaults to `50` on Add when omitted. |
| `sortOrder` | number | No | Display order (ascending). Defaults to `0` on Add when omitted. |
| `status` | string | Update only | `active` \| `inactive`. |
| `actionPerformerURDD` | number | Yes | Acting user's URDD id (recorded as `created_by` / `updated_by`). |
| `language_code` | string | No | Language hint. |

### Example (Add)

```json
{
  "landmarkName": { "en": "Makkah", "ar": "مكة المكرمة" },
  "landmarkSlug": "makkah-sa",
  "landmarkType": "city",
  "latitude": 21.4225000,
  "longitude": 39.8261800,
  "countryId": 1,
  "radiusKm": 50,
  "sortOrder": 10,
  "actionPerformerURDD": 42
}
```

### Example (Update — partial)

Only the fields you send are changed; omitted fields keep their current value (see [Partial updates](#defaults--partial-updates)). `id` is read from the query string (`?id=17`).

```json
{
  "sortOrder": 5,
  "landmarkName": { "en": "Makkah", "ar": "مكة المكرمة" },
  "actionPerformerURDD": 42
}
```

---

## Response

### List

Returns **all active landmarks** as a flat array (fetched fresh in the post-process, ordered by `sortOrder` then `id`; inactive rows excluded). Each name is a `{ en, ar }` object:

```json
[
  {
    "id": 1,
    "landmarkName": { "en": "Makkah", "ar": "مكة المكرمة" },
    "landmarkSlug": "makkah-sa",
    "landmarkType": "city",
    "latitude": "21.4225000",
    "longitude": "39.8261800",
    "countryId": 1,
    "radiusKm": 50,
    "sortOrder": 10,
    "status": "active",
    "createdAt": "2026-07-06T10:00:00.000Z",
    "updatedAt": "2026-07-06T10:00:00.000Z"
  }
]
```

### View

Returns the single landmark with its multilingual `landmarkName` (same shape as one List element), or `null` if not found.

### Add

Returns the write result plus the new landmark id:

```json
{ "insertId": 319, "id": 319 }
```

### Update / Delete

Return the underlying write result. Delete is a soft-delete (see below).

---

## Behavior

### Multilingual name handling

On **Add** and **Update**, `landmarksWritePreProcess` flattens `landmarkName`: the full `{ en, ar }` object is stashed on `_mlName`, and `landmarkName` is reduced to its `en` value for the base-table INSERT/UPDATE. After the write, the post-process **upserts every non-`en` language** into `translated_entries` (`table_name = 'landmarks'`, `column_name = 'landmark_name'`) via `upsertTranslation`.

On read, `mlName` composes the response `landmarkName` by pairing the row's English value with the Arabic translation fetched from `translated_entries`, **falling back to the English value** when a translation is absent. List batch-fetches all translations in one query.

### Defaults & partial updates

- **Add** uses `COALESCE` on the optional columns so a caller may omit `landmarkType` (→ `city`), `radiusKm` (→ `50`), and `sortOrder` (→ `0`) and the DB defaults apply instead of `NULL`. `status` is always set to `active`.
- **Update** wraps **every** column in `COALESCE({{field}}, <column>)`, so a partial payload never NULL-wipes an omitted field — only the fields you send are changed. Targeted by `landmark_id = {{id}}`.

### Delete (soft-delete)

Delete sets `status = 'inactive'` on the row (no hard delete). List and View exclude inactive rows.

### Ordering

List and View select `WHERE status != 'inactive'`; List orders by `sort_order ASC, landmark_id ASC` — lower `sortOrder` shows first (curated/featured landmarks are seeded with low values).

---

## Source Files

| File | Purpose |
|---|---|
| `Src/Apis/ProjectSpecificApis/CrudLandmarks/CrudLandmarks.js` | API object (`global.CrudLandmarks_object`); multilingual pre/post processing; List/View shaping; CRUD SQL with COALESCE guards |
| `Src/Apis/ProjectSpecificApis/CrudLandmarks/CRUD_parameters.js` | Request parameter schema (incl. `multilingualTextField` for `landmarkName`) |
| `Src/HelperFunctions/PreProcessingFunctions/CustomServices/translationUpsert.js` | `upsertTranslation` — writes non-`en` names into `translated_entries` |

> **Seed data.** The `landmarks` table is seeded by the `20260706_*_seed_landmarks_*` migrations (a curated featured overlay with Arabic names + an optional exhaustive dataset import). See `backend/docs/strategies/landmarks_seed_plan.md`.
