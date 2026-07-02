# Admin Code Verify

Verifies whether a submitted **admin code** matches the active code stored for a given URDD. Used to gate sensitive admin actions behind a shared/secret code check. The endpoint returns a simple boolean verdict — it does not reveal the stored code and does not mutate any data.

| Operation | Method | Path | Permission |
|---|---|---|---|
| Verify | POST | `/api/admin/code/verify` | none |

---

## Authentication & Authorization

No RBAC permission is declared (`permission: null`). The endpoint itself *is* the authorization check — the caller proves possession of the admin code for a specific `urdd_id`.

---

## Request Payload

| Field | Type | Required | Description |
|---|---|---|---|
| `urdd_id` | number | Yes | The URDD whose stored admin code is being checked. |
| `code` | string | Yes | The code to verify against the stored active code. |

### Example

```json
{
  "urdd_id": 42,
  "code": "483920"
}
```

---

## Response

```json
{ "verified": true }
```

| Field | Type | Description |
|---|---|---|
| `verified` | boolean | `true` if an **active** `admin_code` row exists for the given `urdd_id` with a matching `code`; otherwise `false`. |

A non-match returns `{ "verified": false }` with a normal `200` — it is not treated as an error.

---

## Behavior

The verify flow runs the query and derives the boolean from whether any row came back:

1. Runs a single guarded lookup against `admin_code`:
   ```sql
   SELECT 1 FROM admin_code
   WHERE urdd_id = {{urdd_id}}
     AND code = {{code}}
     AND status = 'active'
   LIMIT 1
   ```
2. The postProcess sets `verified = rows.length > 0`.

Only **active** codes match — a revoked/inactive code returns `verified: false`. The stored code is never returned to the caller.

---

## Error Responses

The endpoint has no explicit gating branches; a missing/invalid `urdd_id` or `code` simply yields no matching row and returns `{ "verified": false }`. Malformed requests surface the framework's generic validation/500 error (`errorMessage: "Failed to verify admin code"`).

---

## Source Files

| File | Purpose |
|---|---|
| `Src/Apis/ProjectSpecificApis/AdminCodeVerify/AdminCodeVerify.js` | API object; verify query + boolean postProcess |
| `Src/Apis/ProjectSpecificApis/AdminCodeVerify/CRUD_parameters.js` | Request parameter schema (`urdd_id`, `code`) |
