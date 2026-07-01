# URDD Dropdown

| Operation | Method | Path | Permission |
|---|---|---|---|
| List | GET | `/api/urdds` | None (`permission: null`) |

A helper dropdown/lookup endpoint that returns the top 5 rows from each of the four URDD building-block tables — **users, roles, designations, and departments** — for populating role/designation/department pickers.

---

## Authentication & Authorization

No encryption (`encryption: false`) and no RBAC permission (`requestMetaData.permission = null`). No OTP or access-token verification is enforced by the object.

---

## Request Payload

No parameters. Plain GET.

```
GET /api/urdds
```

---

## Response

A single object with four arrays, each holding up to **5** rows (ordered by primary key ascending). Each array contains the full table rows (`SELECT *`):

```json
{
  "users": [
    { "user_id": 1, "email": "system@hms", "username": "system", "...": "..." }
  ],
  "roles": [
    { "role_id": 1, "role_name": "Admin", "...": "..." }
  ],
  "designations": [
    { "designation_id": 1, "designation_code": "SYSADMIN", "...": "..." }
  ],
  "departments": [
    { "department_id": 1, "department_code": "HMSSYS", "...": "..." }
  ]
}
```

| Field | Type | Description |
|---|---|---|
| `users` | `array` | Up to 5 rows from `users` (by `user_id ASC`). |
| `roles` | `array` | Up to 5 rows from `roles` (by `role_id ASC`). |
| `designations` | `array` | Up to 5 rows from `designations` (by `designation_id ASC`). |
| `departments` | `array` | Up to 5 rows from `departments` (by `department_id ASC`). |

Any table that yields no rows returns an empty array.

---

## Behavior

- Runs four `SELECT * ... ORDER BY <pk> ASC LIMIT 5` queries in parallel (one per table) and assembles them into a single object.
- No filtering or tenancy scoping is applied — it is a lightweight sample/preview lookup for building URDD (user–role–designation–department) pickers, not a full listing endpoint.

---

## Source Files

| File | Purpose |
|---|---|
| `Src/Apis/ProjectSpecificApis/UrddDropdown/Custom_Objects/urddDropdown.js` | API object + top-5 fetch (preProcess) + response shaper. |
