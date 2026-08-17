# Duplicate Entity Check

A **generic** "does this value already exist?" probe the frontend can call before submitting a form — so the login / signup / user-create screens stop re-implementing per-field uniqueness checks (email, passport, cnic, tenant_code, …). One endpoint, any table, any column.

| Operation | Method | Path | Permission |
|---|---|---|---|
| Add | **POST** | `/api/validation/duplicate` | *(none — public)* |

> **Route note.** The URL resolves to `global.ValidationDuplicate_object` via PascalCase conversion (`validation` + `duplicate` → `ValidationDuplicate`).

---

## Authentication & Authorization

Public. Runs on the **`PUBLIC_ENCRYPTED_PLATFORM`** — AES-encrypted bodies with the platform key only, **no access token and no permission check** (`requestMetaData.permission` is `null`). Callable from pre-auth screens.

> **Injection safety.** `target_table` and `entity.field` are identifiers that arrive from the client, so they are **never** string-interpolated blindly. Each is (a) matched against a strict identifier regex `[a-zA-Z_][a-zA-Z0-9_]*` and (b) verified to actually exist in `INFORMATION_SCHEMA` for the **current** database before use — anything else is rejected `400`. The searched **value** is always a bound `?` parameter. The shape is generic, but there is no SQL-injection surface.

---

## Request Payload

Two params by design (`entity` + `target_table`), so the endpoint is reusable for any future field:

| Field | Type | Source | Required | Description |
|---|---|---|---|---|
| `target_table` | `string` | body | Yes | Table to look in, e.g. `"users"`. Validated against the live schema. |
| `entity` | `object` | body | Yes | `[ field, value ]` — WHAT to check and its value. Optional `exclude_id` for edit forms. |

The `entity` object accepts **two shapes**:

- **Explicit** — `[ "field": "<column>", "value": "<value>" ]`
- **Shorthand** — `[ "<column>": "<value>" ]` (the first non-reserved key is taken as the field). Reserved keys: `field`, `value`, `exclude_id`.

An optional **`exclude_id`** makes an EDIT form ignore the row being edited ("is this email taken by someone **other** than me?"). It is applied against the table's primary key, and only when the table actually has one.

### Example — signup email check

```json
{
  "target_table": "users",
  "entity": { "field": "email", "value": "guest@example.com" }
}
```

### Example — shorthand + edit-form exclusion

```json
{
  "target_table": "users",
  "entity": { "passport_number": "AB1234567", "exclude_id": 108 }
}
```

Errors (all `400`, `scc: "E10"`): missing `target_table`, missing/non-object `entity`, missing `entity.field`, missing `entity.value`, unknown table, unknown column on that table.

---

## Response

The check result (inside the standard encrypted `{ success, data, meta, error }` envelope):

| Field | Type | Description |
|---|---|---|
| `target_table` | `string` | The validated table. |
| `field` | `string` | The validated column. |
| `exists` | `boolean` | `true` when at least one live row matches. |
| `count` | `number` | Number of matching live rows. |
| `excluded_id` | `number` \| `null` | Present only when `exclude_id` was sent — the id actually excluded (or `null` if the table had no PK to exclude by). |

### Example — value is taken

```json
{
  "target_table": "users",
  "field": "email",
  "exists": true,
  "count": 1
}
```

### Example — value is free (with edit-form exclusion)

```json
{
  "target_table": "users",
  "field": "passport_number",
  "exists": false,
  "count": 0,
  "excluded_id": 108
}
```

---

## Behavior

**Case-insensitive, trimmed string match.** String values compare with `TRIM(LOWER(col)) = TRIM(LOWER(?))` — matching how the platform enforces email/passport uniqueness. Non-string values compare with `=`.

**Soft-deleted rows are not duplicates.** If the table has a `status` column, rows with `status = 'inactive'` are excluded — a deleted record is not a live duplicate. Tables without a `status` column skip this clause.

**Edit-form exclusion.** When `exclude_id` is supplied, the check resolves the table's primary-key column from `INFORMATION_SCHEMA` and adds `` `<pk>` <> ? `` — so an edit doesn't flag the row against itself. If the table has no primary key, the exclusion is silently skipped and `excluded_id` comes back `null`.

Response messages are **bare `en` strings** (not multilingual) — this is a pre-auth utility endpoint.

---

## Source Files

| File | Purpose |
|---|---|
| `Src/Apis/ProjectSpecificApis/ValidationDuplicate/ValidationDuplicate.js` | API object (public encrypted platform, POST, `permission: null`) |
| `Src/Apis/ProjectSpecificApis/ValidationDuplicate/CRUD_parameters.js` | Request field schema (`entity`, `target_table`) |
| `Src/HelperFunctions/PreProcessingFunctions/Validation/checkDuplicateEntityPreProcess.js` | Schema-validated, injection-safe lookup; writes `decryptedPayload._duplicateCheck` |
