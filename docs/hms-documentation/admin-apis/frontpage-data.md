# Frontpage Data

CRUD over the `frontpage_data` table — the global platform / front-page content (each row a single `data` payload with linked media). Managed by the **SaaS-Admin** persona; media is linked through `dynamic_attachments` rather than a column on the table.

| Operation | Method | Path | Permission |
|---|---|---|---|
| List | **GET** | `/api/custom-frontpage-data` | `list_frontpage_data` |
| View | **GET** | `/api/custom-frontpage-data?id=<id>` | `view_frontpage_data` |
| Add | **POST** | `/api/custom-frontpage-data` | `add_frontpage_data` |
| Update | **PUT** | `/api/custom-frontpage-data` | `update_frontpage_data` |
| Delete | **DELETE** | `/api/custom-frontpage-data?id=<id>` | `delete_frontpage_data` |

The route `/api/custom-frontpage-data` resolves to `global.CustomFrontpageData_object` via PascalCase conversion (stated in the source header). Permissions live on the framework tier / `PG-FRAMEWORK` group.

---

## Authentication & Authorization

Runs behind the standard authenticated pipeline. Unlike the config APIs, this object **declares a per-operation permission** in `requestMetaData.permission`, enforced by the framework permission check.

| Operation | RBAC permission |
|---|---|
| List | `list_frontpage_data` |
| View | `view_frontpage_data` |
| Add | `add_frontpage_data` |
| Update | `update_frontpage_data` |
| Delete | `delete_frontpage_data` |

These permissions are seeded on the framework tier (`PG-FRAMEWORK`) — see migration `20260622_1_create_frontpage_data_and_permissions`. The acting admin is identified by `actionPerformerURDD` (`created_by` / `updated_by`).

---

## Request Payload

| Field | Type | Source | Required | Description |
|---|---|---|---|---|
| `id` | `number` | query | View / Update / Delete | PK (`frontpage_data_id`) of the row. |
| `data` | `string` \| `object` | body | Add (Update optional) | The content payload stored in `frontpage_data.data`. |
| `attachmentId` | `number` \| `number[]` | body | No | One or more attachment IDs to link as media. Omitting it on Update leaves existing media untouched. |
| `frontpageDataStatus` | `string` | body | No | Row status; on Update, `COALESCE`d so omitting it preserves the current status. |
| `actionPerformerURDD` | `number` | body | Yes | Acting admin's URDD. |
| `language_code` | `string` | query | No | Language hint. |

### Example — Add

```json
{
  "actionPerformerURDD": 1,
  "data": { "hero_title": "Welcome", "cta": "Book now" },
  "attachmentId": [512, 513]
}
```

---

## The `data` document

`data` is one JSON object whose top-level keys are the page's sections, in render order.
The column is `TEXT`, and the API `JSON.parse`s it on read, so **key order is preserved
end to end** — insert a new section where it belongs rather than appending it.

```
hero · facilities · about_us · about_banner · service_banner · contact_banner ·
contact_us · terms_conditions · privacy_policy · gallery · footer
```

Bilingual fields are always `{ "en": "...", "ar": "..." }`.

### `terms_conditions` and `privacy_policy`

Added 2026-09-30. Both are **bare arrays** of numbered clauses — there is no section
wrapper and no section heading, so the page title is the frontend's to supply:

```json
{
  "terms_conditions": [
    {
      "id": 1,
      "title": { "en": "Acceptance of Terms", "ar": "قبول الشروط" },
      "description": {
        "en": "<p>By downloading, accessing, or using the AlMuttahed mobile application…</p>",
        "ar": "<p>بتنزيلك أو وصولك أو استخدامك تطبيق المتحد الجوال…</p>"
      },
      "media": []
    }
  ]
}
```

Every clause carries exactly four keys, in this order: `id`, `title`, `description`,
`media`.

- **`id`** is positional and 1-based — `terms_conditions` ships ids 1 to 8,
  `privacy_policy` ids 1 to 6. It is stable copy numbering, not a database key, so
  renumber deliberately rather than as a side effect of reordering.
- **`description.en` / `description.ar` are HTML fragments**, each wrapped in a single
  `<p>` tag, and must be rendered as HTML rather than escaped as plain text. Ampersands
  and angle brackets inside the copy arrive as entities (`&amp;`, `&gt;`).
- **`media`** is an empty array on every seeded clause. It exists so a clause can carry
  an image later, and is enriched by List exactly like any other `media` array.
- Render in array order. The numbering in the legal copy is positional, so sorting or
  filtering the array changes what the document says.

Both are edited like any other section: send the whole `data` object back through
Update. There is no per-section endpoint.

:::warning Renamed on 2026-09-30
These sections were briefly specified as `terms` / `privacy`, each an object with
`title` and `items`. The shipped shape is the one above — `terms_conditions` and
`privacy_policy`, both bare arrays whose clauses carry `id` and `media`. Any frontend
still reading `data.terms.items` must move to `data.terms_conditions`.
:::

:::warning Editing this copy through SQL
The clause text contains 35 semicolons, some inside the HTML entities, and the migration
runner splits files on every semicolon without parsing string literals. A migration that
writes this copy has to tokenise them first, and double every backslash, since the copy
carries escaped quotes — see `20260930_1_frontpage_terms_privacy.sql` for the pattern.
Editing through the API has no such constraint.
:::

---

## Response

### List (enriched with media)

```json
[
  {
    "id": 7,
    "frontpageDataId": 7,
    "data": { "hero_title": "Welcome", "cta": "Book now" },
    "frontpageDataStatus": "active",
    "createdBy": 1,
    "updatedBy": 1,
    "createdAt": "2026-06-22T10:00:00.000Z",
    "updatedAt": "2026-06-24T09:12:00.000Z",
    "attachmentIds": [512, 513],
    "media": [
      {
        "attachment_id": 512,
        "attachment_name": "hero.jpg",
        "attachment_type": "image/jpeg",
        "attachment_size": 84213,
        "attachment_link": "/upload/serve?attachmentId=512",
        "storage_path": "…",
        "status": "active"
      }
    ],
    "table_count": 3
  }
]
```

| Field | Type | Description |
|---|---|---|
| `data` | `object` \| `string` | The stored content payload. |
| `attachmentIds` | `number[]` | IDs of the active linked attachments. |
| `media` | `array` | Full attachment rows; `attachment_link` rewritten to the served URL (`/upload/serve?attachmentId=…`). |
| `table_count` | `number` | Total row count (List only; `pageSize: 10`). |

`View` returns a single enriched row. **Add** returns the insert result plus `frontpage_data_id` and `id` (the new PK).

---

## Behavior

**Media lives in `dynamic_attachments`, not on the table.** Links use `table_name = 'frontpage_data'`, `primary_key = frontpage_data_id`, `attachment_id = <id>` — mirroring how CustomServices links its attachments.

**Attachment id handling.** The write pre-process stashes incoming `attachmentId`(s) off the top level of the payload and **deletes the original key** so the query resolver's array-scan can't mistake it for a batch-insert. The INSERT/UPDATE template never references `{{attachmentId}}`.

**Attachment sync.**
- **Add** inserts the row, then (if attachment IDs were supplied) soft-deactivates any existing active links and inserts the incoming ones.
- **Update** re-syncs attachments **only when `attachmentId` was supplied**; an Update that omits it leaves existing media untouched.

**Delete is a soft-delete** (`status = 'inactive'`) that also cascades the soft-delete to the row's active `dynamic_attachments` links.

**Reads hydrate media.** List/View post-processes fetch the active linked attachments and rewrite each `attachment_link` to the served URL. (`View`'s SQL includes `OR frontpage_data_id IS NULL`, tolerating a null-id lookup.)

---

## Source Files

| File | Purpose |
|---|---|
| `Src/Apis/ProjectSpecificApis/CustomFrontpageData/Crud_Objects/Frontpage_data.js` | API object; write pre-process (attachment stash), attachment sync, read enrichment, SQL, per-op permissions |
| `Src/Apis/ProjectSpecificApis/CustomFrontpageData/Crud_Objects/CRUD_parameters.js` | Request field schema + `colMapper` |
| `data/migrations/20260622_1_create_frontpage_data_and_permissions.sql` | Creates the table + seeds the framework-tier `*_frontpage_data` permissions (`PG-FRAMEWORK`) |
