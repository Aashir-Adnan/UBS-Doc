# Fetch Guest Document Tags

**GET** `/api/fetch/guest/document/tags`

Retrieves all available document tag definitions from the `dynamic_attachment_tags` lookup table. Tags are grouped by their `title` field, enabling the client to display categorized tag options (e.g. "Travel Documents", "Identity", "Medical") when uploading or tagging documents.

---

## Authentication

Requires the **AUTH_PLATFORM** (guest JWT). The `userId` is resolved from the authenticated session and `actionPerformerURDD` is validated via the `ensureGuestUrdd` pre-process step.

---

## Request Parameters

No request parameters required. This is a simple list endpoint.

### Example Request

```
GET /api/fetch/guest/document/tags
```

---

## Behavior

1. Queries all rows from `dynamic_attachment_tags` where `status = 'active'`, ordered by `title` then `name`.
2. Groups the results by `title` into an array of objects.
3. Each group contains the title and an array of tag objects (`id`, `name`).

---

## Response

### Success (200)

```json
[
  {
    "title": "Identity",
    "tags": [
      { "id": 3, "name": "national_id_copy" },
      { "id": 4, "name": "passport_copy" }
    ]
  },
  {
    "title": "Medical",
    "tags": [
      { "id": 5, "name": "health_certificate" }
    ]
  },
  {
    "title": "Travel Documents",
    "tags": [
      { "id": 2, "name": "KSA" },
      { "id": 1, "name": "visa" }
    ]
  }
]
```

| Field | Type | Description |
|---|---|---|
| `title` | `string` | The tag category/group title. |
| `tags` | `array` | Array of tag objects within this category. |
| `tags[].id` | `number` | PK of the `dynamic_attachment_tags` row. |
| `tags[].name` | `string` | Tag name (used as the value when tagging documents). |

Returns an empty array `[]` if no active tags exist.

### Error Responses

| Status | `error.details` | Condition |
|---|---|---|
| 401 | `Authenticated user required` | No `userId` in the session. |
| 403 | `Invalid or expired URDD` | `actionPerformerURDD` validation failed. |

---

## Database Tables

### `dynamic_attachment_tags`

Created by migration `20260611_1_dynamic_attachment_tags_and_tags_column.sql`.

| Column | Type | Description |
|---|---|---|
| `id` | `int` PK | Auto-increment primary key. |
| `name` | `varchar(255)` | The tag value (e.g. `"visa"`, `"KSA"`, `"passport_copy"`). |
| `title` | `varchar(255)` | The grouping category (e.g. `"Travel Documents"`, `"Identity"`). |
| `status` | `enum` | `'active'` or `'inactive'`. Only active rows are returned. |
| `created_by` | `int` FK | URDD ID of the creator. |
| `updated_by` | `int` FK | URDD ID of the last updater. |
| `created_at` | `datetime` | Auto-set on creation. |
| `updated_at` | `datetime` | Auto-updated on modification. |

---

## Usage with Document Uploads

This API is typically called **before** uploading or tagging documents. The client uses the returned tag names when submitting documents via the onboarding KYC endpoint (`POST /api/guest/onboarding/kyc`) or when creating `dynamic_attachments` entries linked to `guest_profiles`.

**Flow:**
1. `GET /api/fetch/guest/document/tags` — display available tags to the user
2. User selects tags from the grouped list
3. Selected tag names are sent as `tags: ["visa", "KSA"]` in the upload/KYC request
4. Tags are stored as comma-separated string in `dynamic_attachments.tags`
5. `GET /api/fetch/guest/documents` — returns documents with tags split back into arrays

---

## Test Coverage

### `guestDocumentTagsFlow.js`

The sim test at `Services/SysScripts/TestScripts/sim/guestDocumentTagsFlow.js` covers:

- Seeding `dynamic_attachment_tags` rows across multiple title categories
- Fetching tags via this API and verifying correct grouping by title
- Verifying tag counts per group (e.g. "Travel Documents" has 2 tags)
- Full cleanup of all seeded data

```bash
node Services/SysScripts/TestScripts/sim/guestDocumentTagsFlow.js
```

Prerequisites: server running on `localhost:3000`, `credentials.json` populated (run `guestOtpFlow.js` first).
