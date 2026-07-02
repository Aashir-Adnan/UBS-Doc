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
