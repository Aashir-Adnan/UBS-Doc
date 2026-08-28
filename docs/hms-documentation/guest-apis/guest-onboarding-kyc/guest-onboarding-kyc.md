# Guest Onboarding KYC

`/api/guest/onboarding/kyc`

Submits, retrieves and amends a guest's Know Your Customer (KYC) identity documents. Supports passport, national ID, and iqama (Saudi residence permit) documents.

Images are uploaded separately via the attachment flow. Every operation here works in **attachment IDs**, never in file bytes.

| Method | Operation | Purpose |
|---|---|---|
| `POST` | Add | submit a complete document |
| `GET` | List / View | read the guest's own documents |
| `PUT` | Update | replace individual sides of a document, or correct its details |

The guest's identity comes from the access token on every operation, so none of them can be pointed at another guest's records.

:::note Schema-level requirements are not enforced per field
The parameter schema marks every field optional because the same field list is shared by all
three operations — a `required` flag would demand a full submission payload on a plain `GET`.
Requirements are enforced inside each operation instead, exactly as documented below.
:::

---

## Authentication

Requires the **AUTH_PLATFORM** (guest JWT). The `userId` is resolved from the authenticated session and `actionPerformerURDD` is validated via the `ensureGuestUrdd` pre-process step.

---

## Submitting a document

**POST** `/api/guest/onboarding/kyc`

Sent as encrypted JSON (standard platform encryption). Submits a complete document — every side and every detail together.

| Field | Type | Required | Description |
|---|---|---|---|
| `actionPerformerURDD` | `number` | Yes | The guest's URDD ID. |
| `documentType` | `string` | Yes | One of: `national_id`, `iqama`, `passport` (case-insensitive). |
| `fullName` | `string` | Yes | Full name as it appears on the document. |
| `documentNumber` | `string` | Yes | The document's ID number. |
| `issuingCountry` | `string` | Yes | 2-letter ISO country code (e.g. `"SA"`, `"AE"`). Converted to uppercase. |
| `dateOfBirth` | `string` | Yes | Format: `YYYY-MM-DD`. |
| `expiryDate` | `string` | Yes | Format: `YYYY-MM-DD`. |
| `consent` | `boolean` | Yes | Must be `true`. Accepts boolean `true`, string `"true"`, or number `1`. |
| `frontImageId` | `number` | Yes | Attachment ID of the front image (uploaded separately). |
| `backImageId` | `number` | Conditional | Attachment ID of the back image. **Required for `national_id` and `iqama`**. Optional for `passport`. |
| `selfieId` | `number` | No | Attachment ID of a selfie for identity verification. |
| `tags` | `string[]` | No | Array of tag names to associate with the document attachments (e.g. `["visa", "KSA"]`). Stored as comma-separated in `dynamic_attachments.tags`. |

---

### Valid Document Types

| Value | Description | `backImageId` Required? |
|---|---|---|
| `passport` | Passport document | No |
| `national_id` | National identification card | Yes |
| `iqama` | Saudi Iqama (residence permit) | Yes |

The `documentType` field is **case-insensitive** — `"PASSPORT"`, `"Passport"`, and `"passport"` are all valid.

---

### Examples

#### Passport submission

```json
{
  "actionPerformerURDD": 16,
  "documentType": "passport",
  "fullName": "Ahmed Al-Rashid",
  "documentNumber": "A1234567",
  "issuingCountry": "SA",
  "dateOfBirth": "1990-05-15",
  "expiryDate": "2030-05-15",
  "consent": true,
  "frontImageId": 42
}
```

#### National ID submission (with tags)

```json
{
  "actionPerformerURDD": 16,
  "documentType": "national_id",
  "fullName": "Ahmed Al-Rashid",
  "documentNumber": "1234567890",
  "issuingCountry": "SA",
  "dateOfBirth": "1990-05-15",
  "expiryDate": "2030-05-15",
  "consent": true,
  "frontImageId": 42,
  "backImageId": 43,
  "tags": ["visa", "KSA"]
}
```

---

### Behavior

All attachment IDs are validated against the `attachments` table — they must exist and have `status = 'active'`.

#### For `passport`:

1. Upserts a row in `guest_passport_documents` with passport details and the provided attachment IDs. Uses `user_id` as the idempotency key — resubmitting overwrites the previous passport data.
2. Syncs `users.passport_number` and `users.date_of_birth`.

#### For `national_id` / `iqama`:

1. Updates `users` table: `cnic` (document number), `country` (issuing country), `date_of_birth`.
2. Creates `dynamic_attachments` rows linking the attachment IDs with keys:
   - `guest_kyc_{documentType}_front`
   - `guest_kyc_{documentType}_back`
   - `guest_kyc_{documentType}_selfie` (if selfieId provided)
3. If `tags` is provided, stores the array as a comma-separated string in `dynamic_attachments.tags` for each created row (e.g. `["visa", "KSA"]` becomes `"visa,KSA"`).

---

### Response

#### Success (200)

```json
{
  "kyc_status": "pending",
  "submitted_at": "2026-06-05T14:30:00.000Z"
}
```

| Field | Type | Description |
|---|---|---|
| `kyc_status` | `string` | Always `"pending"` on submission. |
| `submitted_at` | `string` | ISO 8601 timestamp of submission. |

#### Error Responses

Error details are returned in `error.details` (not `meta.message`). The `meta.message` field contains a generic user-facing string.

```json
{
  "success": false,
  "data": null,
  "meta": {
    "message": "An unexpected error occurred. Please try again or contact support if the problem persists.",
    "status": 400,
    "source": "Pre-Process",
    "scc": "E99"
  },
  "error": {
    "message": "An unexpected error occurred...",
    "code": "E99",
    "source": "Pre-Process",
    "details": "Invalid documentType"
  }
}
```

| Status | `error.details` | Condition |
|---|---|---|
| 400 | `Invalid documentType` | `documentType` is not `national_id`, `iqama`, or `passport`. |
| 400 | `fullName, documentNumber, dateOfBirth and expiryDate are required` | Any required text field is missing or empty. |
| 400 | `Consent is required` | `consent` is not `true`. |
| 400 | `frontImageId is required` | Missing `frontImageId`. |
| 400 | `frontImageId must be a valid attachment ID` | Non-numeric `frontImageId`. |
| 400 | `backImageId is required` | Missing `backImageId` for `national_id` or `iqama`. |
| 401 | `Authenticated user required` | No `userId` in the session. |
| 403 | `Invalid or expired URDD` | `actionPerformerURDD` validation failed. |
| 404 | `frontImageId: attachment not found` | Attachment ID does not exist or is inactive. |
| 404 | `backImageId: attachment not found` | Attachment ID does not exist or is inactive. |
| 404 | `selfieId: attachment not found` | Attachment ID does not exist or is inactive. |

---

### Validation Order

1. `documentType` must be one of the three allowed values
2. `fullName`, `documentNumber`, `dateOfBirth`, `expiryDate` must all be non-empty
3. `consent` must be truthy
4. `frontImageId` must be provided and reference an active attachment
5. `backImageId` must be provided for `national_id` / `iqama` and reference an active attachment
6. `selfieId` (if provided) must reference an active attachment

---

## Retrieving documents

**GET** `/api/guest/onboarding/kyc`

Returns every active KYC document belonging to the authenticated guest, grouped per document. No request payload is needed — the guest is identified from the token. `?id=` may be supplied and is ignored; it resolves to the same reader.

```json
{
  "documents": [
    {
      "documentType": "national_id",
      "verification_status": null,
      "slots": {
        "front": {
          "dynamic_attachment_id": 293,
          "attachment_id": 1216,
          "attachment_name": "1216-1783589537280.png",
          "attachment_type": "image/png",
          "attachment_size": 20418,
          "attachment_link": "/api/upload/serve?encryptedRequest=U2FsdGVkX1...",
          "tags": [],
          "uploaded_at": "2026-08-20T19:15:32.000Z",
          "updated_at": "2026-08-20T19:15:32.000Z"
        },
        "back": { "...": "same shape" },
        "selfie": { "...": "same shape" }
      },
      "meta": {
        "full_name": "Ali Khan",
        "document_number": "1234567890",
        "issuing_country": "SA",
        "date_of_birth": "1990-01-01",
        "expiry_date": null,
        "nationality": "SA"
      }
    }
  ]
}
```

| Field | Description |
|---|---|
| `documentType` | `national_id`, `iqama` or `passport`. |
| `verification_status` | `pending` / `verified` / `rejected` for passports; `null` for national ID and iqama, which have no per-document status store. |
| `slots` | Present sides only — a document with no selfie simply has no `selfie` key. |
| `slots.*.attachment_link` | A ready-to-render URL for the image, signed for this guest. See the caveat below. |
| `meta` | Document details. For national ID / iqama these are read from the `users` row, so `expiry_date` is always `null` — it is not persisted for those types. |

:::caution `attachment_link` is a served URL, not a storage path
The link points at `GET /api/upload/serve` with an encrypted payload baked into the query string,
because a browser cannot attach a header to an `<img src>`. Use it verbatim; never build it
client-side, and never append an attachment id to it. See
[Attachment Upload & Serve](../../major-implementations/attachment-pipeline/attachment-pipeline.md).
:::

Only `status = 'active'` rows are returned, so a replaced image disappears from the response as soon as its replacement is stored.

---

## Updating a document

**PUT** `/api/guest/onboarding/kyc`

Replaces **individual sides** of a document, or corrects its details, leaving everything not sent exactly as it was. A guest whose back photo came out blurred can fix that one image without re-submitting the whole document.

| Field | Type | Required | Description |
|---|---|---|---|
| `documentType` | `string` | Yes | Which document to amend: `national_id`, `iqama` or `passport`. |
| `frontImageId` | `number` | No | New attachment ID for the front image. |
| `backImageId` | `number` | No | New attachment ID for the back image. |
| `selfieId` | `number` | No | New attachment ID for the selfie. |
| `fullName` | `string` | No | Corrected name. |
| `documentNumber` | `string` | No | Corrected document number. |
| `issuingCountry` | `string` | No | Corrected 2-letter ISO country code. |
| `dateOfBirth` | `string` | No | Corrected date of birth, `YYYY-MM-DD`. |
| `expiryDate` | `string` | No | Corrected expiry date, `YYYY-MM-DD`. Passport only. |
| `tags` | `string[]` | No | Tags applied to newly created attachment links. |

**At least one** image id or detail field must be sent.

```json
{
  "documentType": "national_id",
  "backImageId": 1300
}
```

```json
{
  "documentType": "national_id",
  "updated_slots": ["back"],
  "updated_fields": [],
  "kyc_status": "pending",
  "updated_at": "2026-08-28T09:12:44.180Z"
}
```

### Behaviour

**`national_id` / `iqama`** — for each slot sent, the current active `dynamic_attachments` row for that slot is set to `inactive` and a new active row is inserted. History is preserved, and slots that were not sent keep their existing rows untouched. Detail fields update the matching `users` columns only.

**`passport`** — the single `guest_passport_documents` row is updated with only the columns actually supplied. Sending just `frontImageId` changes only that column; every other field keeps its value.

:::warning Every update re-opens verification
`verification_status` returns to `pending` on any change. An image or a document number that has
just changed has not been checked by anyone.
:::

### Ownership

Every attachment id sent must belong to the requesting guest — matched by **user**, so an image uploaded from any of their hotel sessions is accepted. Pointing at another user's attachment id is refused with `403`, which is what stops a guest attaching someone else's photo to their own record.

### Error Responses

| Status | `error.details` | Condition |
|---|---|---|
| 400 | `Invalid documentType` | Not `national_id`, `iqama` or `passport`. |
| 400 | `Send at least one of frontImageId, backImageId, selfieId, or a metadata field to update` | Nothing to change. |
| 400 | `<field> must be a valid attachment id` | A non-numeric or non-positive attachment id. |
| 401 | `Guest identity could not be resolved` | No `userId` on the session. |
| 403 | `<field>: this attachment does not belong to you` | The attachment belongs to another user. |
| 404 | `<field>: attachment not found` | Unknown or inactive attachment. |
| 404 | `No passport document to update — submit one first` | `PUT` with `documentType: "passport"` before any passport was submitted. |

---

## Database Tables

### `guest_passport_documents` (passport only)

Primary key: `guest_passport_document_id` (auto-increment). Upsert uses `idempotency_key` = `user_id`.

| Column | Description |
|---|---|
| `guest_passport_document_id` | PK, auto-increment. |
| `user_id` | The authenticated user's ID. |
| `tenant_id` | Hotel/tenant ID from the URDD. |
| `idempotency_key` | Set to `user_id` — ensures one record per user (upsert). |
| `passport_number` | The document number. |
| `passport_issuing_country` | 2-letter ISO country code. |
| `passport_expiry_date` | Expiry date. |
| `nationality` | Set to `issuingCountry`. |
| `date_of_birth` | Date of birth from the document. |
| `full_name_as_on_passport` | Full name from the document. |
| `passport_front_attachment_id` | FK to `attachments` for front image. |
| `passport_back_attachment_id` | FK to `attachments` for back image (nullable). |
| `selfie_attachment_id` | FK to `attachments` for selfie (nullable). |
| `verification_status` | Set to `"pending"` on submission. |

### `dynamic_attachments` (national_id / iqama)

| Column | Description |
|---|---|
| `table_name` | Key format: `guest_kyc_{docType}_{side}` (e.g. `guest_kyc_national_id_front`). |
| `primary_key` | The user's ID. |
| `attachment_id` | FK to `attachments` table. |
| `tags` | Comma-separated tag string (e.g. `"visa,KSA"`). Nullable. Set from the `tags` array in the request payload. |

---

## Attachment Upload Flow (prerequisite)

Before submitting or updating KYC, each image must be uploaded through the two-step attachment flow. Both steps are platform-encrypted like every other endpoint.

| Step | Call | Returns |
|------|------|---------|
| 1. Reserve | `GET /api/get/file/url/local?step=1` | `attachmentId` — an empty slot |
| 2. Upload | `POST /api/upload/file` — the file in a multipart part named `file`, with `attachmentId` and `actionPerformerURDD` in the encrypted payload | `attachmentId`, `name`, `type`, `size` |

The `attachmentId` from step 1 is the value passed to `frontImageId`, `backImageId` or `selfieId` here.

:::caution An attachment slot can be filled only once
Re-uploading to an id that already holds a file is refused with `409`. To replace an image,
reserve a **new** id and send that to `PUT`. This is why the update endpoint takes attachment
ids rather than files.
:::

Full details — encryption, ownership rules, storage providers and error codes — are in
[Attachment Upload & Serve](../../major-implementations/attachment-pipeline/attachment-pipeline.md).

---

## Tests

`Services/SysScripts/TestScripts/sim/guestOnboardingKyc.js` exercises the submission flow end-to-end: uploads three images via the real attachment API, verifies each DB row, then runs all KYC validation and submission tests. Run `guestOtpFlow.js` first to populate `credentials.json`.

`Services/SysScripts/TestScripts/fileFlowEdgeCases.test.js` covers the attachment endpoints these operations depend on, across every storage provider.
