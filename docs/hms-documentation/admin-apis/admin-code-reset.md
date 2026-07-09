# Admin Code Reset

Generates a new **admin code**, overwrites the previous one for the given URDD, and emails the new code to the user. Used when an admin forgets their code and needs a fresh one sent to their registered email address.

| Operation | Method | Path | Permission |
|---|---|---|---|
| Reset | POST | `/api/admin/code/reset` | none |

---

## Authentication & Authorization

No RBAC permission is declared (`permission: null`). The caller must be authenticated (valid access token). The endpoint is intended for the admin dashboard's "Forgot Code" flow.

---

## Request Payload

| Field | Type | Required | Description |
|---|---|---|---|
| `urdd_id` | number | Yes | The URDD whose admin code should be reset and emailed. |

### Example

```json
{
  "urdd_id": 42
}
```

---

## Response

```json
{
  "message": "A new admin code has been sent to your email",
  "sent_to": "admin@example.com"
}
```

| Field | Type | Description |
|---|---|---|
| `message` | string | Confirmation message. |
| `sent_to` | string | The email address the new code was sent to (partially confirms delivery target). |

---

## Behavior

1. **Lookup user** — resolves the `urdd_id` to a user record via `user_roles_designations_department` → `users`. Both the URDD and user must have `status = 'active'`.
2. **Generate code** — creates a 6-character alphanumeric code using `crypto.randomBytes(3).toString("hex").toUpperCase()` (e.g. `A1B2C3`).
3. **Upsert** — if an active `admin_code` row already exists for the URDD, the `code` column is overwritten. Otherwise a new row is inserted. The previous code is immediately invalidated.
4. **Send email** — emails the new code to the user's registered address using the branded email template (auto-rendered as an OTP-style code block). Branding is resolved per-user via `resolveEmailBranding`.

---

## Error Responses

| Condition | Status | Message |
|---|---|---|
| URDD not found or inactive | 404 | `User not found for the given URDD` |
| User has no email on file | 400 | `No email address on file for this user` |
| Framework validation failure | 500 | `Failed to reset admin code` |

---

## Related Endpoints

| Endpoint | Description |
|---|---|
| [`POST /api/admin/code/verify`](./admin-code-verify.md) | Verify a code against the stored admin code |
| `CRUD /api/crud/admin-code` | Full CRUD management of admin codes |

---

## Source Files

| File | Purpose |
|---|---|
| `Src/Apis/ProjectSpecificApis/AdminCodeReset/AdminCodeReset.js` | API object; wires preProcess + postProcess |
| `Src/Apis/ProjectSpecificApis/AdminCodeReset/CRUD_parameters.js` | Request parameter schema (`urdd_id`) |
| `Src/HelperFunctions/PreProcessingFunctions/resetAdminCode.js` | Business logic: code generation, DB upsert, email dispatch |
