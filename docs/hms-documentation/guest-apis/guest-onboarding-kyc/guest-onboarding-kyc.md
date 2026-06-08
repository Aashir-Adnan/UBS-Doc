# Guest Onboarding KYC

**POST** `/api/guest/onboarding/kyc`

Submits a guest's Know Your Customer (KYC) identity document for verification. Supports passport, national ID, and iqama (Saudi residence permit) documents.

Images are uploaded separately via the file upload endpoint. This endpoint accepts **attachment IDs** referencing the already-uploaded images.

---

## Authentication

Requires the **AUTH_PLATFORM** (guest JWT). The `userId` is resolved from the authenticated session and `actionPerformerURDD` is validated via the `ensureGuestUrdd` pre-process step.

---

## Request Payload

Sent as encrypted JSON (standard platform encryption).

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

---

## Valid Document Types

| Value | Description | `backImageId` Required? |
|---|---|---|
| `passport` | Passport document | No |
| `national_id` | National identification card | Yes |
| `iqama` | Saudi Iqama (residence permit) | Yes |

The `documentType` field is **case-insensitive** — `"PASSPORT"`, `"Passport"`, and `"passport"` are all valid.

---

## Examples

### Passport submission

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

### National ID submission

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
  "backImageId": 43
}
```

---

## Behavior

All attachment IDs are validated against the `attachments` table — they must exist and have `status = 'active'`.

### For `passport`:

1. Upserts a row in `guest_passport_documents` with passport details and the provided attachment IDs. Uses `user_id` as the idempotency key — resubmitting overwrites the previous passport data.
2. Syncs `users.passport_number` and `users.date_of_birth`.

### For `national_id` / `iqama`:

1. Updates `users` table: `cnic` (document number), `country` (issuing country), `date_of_birth`.
2. Creates `dynamic_attachments` rows linking the attachment IDs with keys:
   - `guest_kyc_{documentType}_front`
   - `guest_kyc_{documentType}_back`
   - `guest_kyc_{documentType}_selfie` (if selfieId provided)

---

## Response

### Success (200)

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

### Error Responses

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

## Validation Order

1. `documentType` must be one of the three allowed values
2. `fullName`, `documentNumber`, `dateOfBirth`, `expiryDate` must all be non-empty
3. `consent` must be truthy
4. `frontImageId` must be provided and reference an active attachment
5. `backImageId` must be provided for `national_id` / `iqama` and reference an active attachment
6. `selfieId` (if provided) must reference an active attachment

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

---

## Known Issue — Attachment Upload Status (Issue #236)

:::caution Resolved
The two-step attachment upload flow (`GET /api/get/file/url/local` → `POST /upload?token=…`) creates rows with `status = 'pending'` and the upload handler never transitions them to `'active'`. Because `validateAttachment` queries `WHERE status = 'active'`, freshly uploaded attachments are rejected with `"attachment not found"`.

**Root cause:** `Src/Routes/upload.router.js` line 56 — the `UPDATE` sets `attachment_name`, `attachment_type`, `attachment_size`, and `attachment_link` but omits `status = 'active'`.

**Fix:** Add `status = 'active'` to the upload router's UPDATE statement.
:::

---

## Attachment Upload Flow (prerequisite)

Before submitting KYC, the client must upload each image through the two-step attachment flow:

| Step | Call | Returns |
|------|------|---------|
| 1. Reserve | `GET /api/get/file/url/local` | `{ uploadUrl, attachmentId }` |
| 2. Upload | `POST {uploadUrl}` — raw bytes with `Content-Type: image/…` | `{ success, data: { name, attachmentId } }` |

The `attachmentId` returned in step 1 is the value passed to `frontImageId`, `backImageId`, or `selfieId` in the KYC payload.

### Sim test

The test script at `Services/SysScripts/TestScripts/sim/guestOnboardingKyc.js` exercises the full flow end-to-end: uploads three images via the real attachment API, verifies each DB row, then runs all KYC validation and submission tests. Run `guestOtpFlow.js` first to populate `credentials.json`.
