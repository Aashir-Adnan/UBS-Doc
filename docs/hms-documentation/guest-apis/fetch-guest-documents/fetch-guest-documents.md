# Fetch Guest Documents

**GET** `/api/fetch/guest/documents`

Retrieves all documents (dynamic attachments) linked to a guest profile. Each document's `tags` field is returned as an array (stored as comma-separated in the database, e.g. `"visa,KSA"` becomes `["visa", "KSA"]`).

---

## Authentication

Requires the **AUTH_PLATFORM** (guest JWT). The `userId` is resolved from the authenticated session and `actionPerformerURDD` is validated via the `ensureGuestUrdd` pre-process step.

---

## Request Parameters

Sent as encrypted query parameters (standard platform encryption).

| Field | Type | Required | Source | Description |
|---|---|---|---|---|
| `guest_profile_id` | `number` | Yes | Query string | The guest profile ID to fetch documents for. |

### Example Request

```
GET /api/fetch/guest/documents?guest_profile_id=12
```

---

## Behavior

1. Validates that `guest_profile_id` is provided and is a valid number.
2. Queries `dynamic_attachments` where `table_name = 'guest_profiles'` and `primary_key = guest_profile_id`.
3. Joins the `attachments` table to include file metadata (name, type, link, size).
4. Splits the `tags` column (comma-separated string) into an array for each document.
5. Returns the full list of matching documents.

---

## Response

### Success (200)

```json
[
  {
    "dynamic_attachment_id": 1,
    "table_name": "guest_profiles",
    "primary_key": 12,
    "attachment_id": 42,
    "tags": ["visa", "KSA"],
    "status": "active",
    "attachment_name": "passport_scan.png",
    "attachment_type": "image/png",
    "attachment_link": "uploads/2026/06/passport_scan.png",
    "attachment_size": 245760,
    "created_by": 16,
    "updated_by": 16,
    "created_at": "2026-06-11T10:00:00.000Z",
    "updated_at": "2026-06-11T10:00:00.000Z"
  },
  {
    "dynamic_attachment_id": 2,
    "table_name": "guest_profiles",
    "primary_key": 12,
    "attachment_id": 43,
    "tags": ["passport_copy"],
    "status": "active",
    "attachment_name": "id_front.png",
    "attachment_type": "image/png",
    "attachment_link": "uploads/2026/06/id_front.png",
    "attachment_size": 180000,
    "created_by": 16,
    "updated_by": 16,
    "created_at": "2026-06-11T10:05:00.000Z",
    "updated_at": "2026-06-11T10:05:00.000Z"
  }
]
```

| Field | Type | Description |
|---|---|---|
| `dynamic_attachment_id` | `number` | PK of the dynamic attachment row. |
| `table_name` | `string` | Always `"guest_profiles"` for this endpoint. |
| `primary_key` | `number` | The guest profile ID. |
| `attachment_id` | `number` | FK to `attachments` table. |
| `tags` | `string[]` | Array of tag strings. Empty array `[]` if no tags. |
| `status` | `string` | Row status: `"active"`, `"inactive"`, or `"pending"`. |
| `attachment_name` | `string\|null` | File name from the attachments table. |
| `attachment_type` | `string\|null` | MIME type (e.g. `"image/png"`). |
| `attachment_link` | `string\|null` | Relative file path on the server. |
| `attachment_size` | `number\|null` | File size in bytes. |
| `created_by` | `number` | URDD ID of the creator. |
| `updated_by` | `number` | URDD ID of the last updater. |
| `created_at` | `string` | ISO 8601 creation timestamp. |
| `updated_at` | `string` | ISO 8601 last update timestamp. |

Returns an empty array `[]` if no documents exist for the given guest profile.

### Error Responses

| Status | `error.details` | Condition |
|---|---|---|
| 400 | `guest_profile_id is required` | Missing or invalid `guest_profile_id`. |
| 401 | `Authenticated user required` | No `userId` in the session. |
| 403 | `Invalid or expired URDD` | `actionPerformerURDD` validation failed. |

---

## Database Tables

### `dynamic_attachments`

| Column | Description |
|---|---|
| `dynamic_attachment_id` | PK, auto-increment. |
| `table_name` | Polymorphic table identifier. Filtered to `'guest_profiles'` for this API. |
| `primary_key` | FK to the parent record (guest_profile_id). |
| `attachment_id` | FK to `attachments.attachment_id`. |
| `tags` | Comma-separated tag string (e.g. `"visa,KSA"`). Nullable. |
| `status` | `'active'`, `'inactive'`, or `'pending'`. |

### `attachments` (joined)

| Column | Description |
|---|---|
| `attachment_name` | Original file name. |
| `attachment_type` | MIME type. |
| `attachment_link` | Server-side file path. |
| `attachment_size` | File size in bytes. |

---

## Test Coverage

### `guestDocumentTagsFlow.js`

The sim test at `Services/SysScripts/TestScripts/sim/guestDocumentTagsFlow.js` covers:

- Seeding `dynamic_attachments` rows linked to `guest_profiles`
- Fetching documents via this API and verifying tags are split into arrays
- Verifying empty results for non-existent guest profile IDs
- Full cleanup of all seeded data

```bash
node Services/SysScripts/TestScripts/sim/guestDocumentTagsFlow.js
```

Prerequisites: server running on `localhost:3000`, `credentials.json` populated (run `guestOtpFlow.js` first).
