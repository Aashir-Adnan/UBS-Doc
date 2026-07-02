# Tenant Admin Candidates Dropdown

| Operation | Method | Path | Permission |
|---|---|---|---|
| List | GET | `/api/tenants/admin/candidates/dropdown?tenant_id=<id>` | None (`permission: null`) |

Feeds the "Select Existing User" picker in the Tenant Admin assignment step. Returns the **staff** users who already hold an active URDD in the target tenant, as `{ value, label }` option rows.

---

## Authentication & Authorization

Encrypted request/response with **platform encryption + access token** (`platformEncryption: true`, `accessToken: true`). No RBAC permission is required on the object itself (`requestMetaData.permission = null`). The lookup is keyed strictly on the caller-supplied `tenant_id`, so no cross-tenant data can leak.

---

## Request Payload

Query parameters (any of the following resolves the target tenant, checked in order):

| Param | Type | Required | Description |
|---|---|---|---|
| `tenant_id` | `number` | Yes* | Target tenant whose existing staff users are offered as candidates. |
| `tenantId` | `number` | — | Alias for `tenant_id`. |
| `id` | `number` | — | Alias for `tenant_id`. |

The tenant id may also arrive in the body as `tenant_id`, `tenants_tenantId`, or `tenants_selectTenantId`. *If no tenant id is resolved, the endpoint returns an empty array.

```
GET /api/tenants/admin/candidates/dropdown?tenant_id=7
```

---

## Response

An array of option rows (empty for a brand-new tenant with no users yet):

```json
[
  {
    "value": 42,
    "label": "layla.nasser",
    "email": "layla.nasser@marasi.com",
    "profilePic": 118
  }
]
```

| Field | Type | Description |
|---|---|---|
| `value` | `number` | The candidate user's `user_id` (option value). |
| `label` | `string` | Display label — username, else email, else `User #<id>` (max 40 chars). |
| `email` | `string` | The user's email. |
| `profilePic` | `number` \| `null` | The user's `image_attachment_id`, if any. |

---

## Behavior

- Selects users who hold an **active** URDD (`urdd.status = 'active'`) in the target `tenant_id`, joined to an **active** RDD (`rdd.status = 'active'`), where the user's own `status` is not `inactive`.
- **Guests are excluded.** Because every guest is eagerly given an active per-tenant URDD, the query drops guest-only users by filtering out RDDs whose designation code is `STANDARD` or `DEFAULT` (the guest-leg designations). A mixed user (staff + guest legs) still appears via their staff leg.
- Results are grouped per user, ordered by label ascending, and capped at **200** rows.
- Runs as a **preProcess function** (not a standard query) to bypass `applyTenancyFilters`, which would otherwise scope the lookup to the acting (system) tenant and hide the target tenant's own users. Cross-tenant leakage is prevented by keying only on the explicit `tenant_id`.
- A brand-new tenant has no users, so the picker is empty and the admin must be created as a new user.

---

## Source Files

| File | Purpose |
|---|---|
| `Src/Apis/ProjectSpecificApis/TenantAdminCandidatesDropdown/Custom_Objects/tenant_admin_candidates_dropdown.js` | API object + candidate lookup (preProcess) + response shaper. |
| `Src/HelperFunctions/PreProcessingFunctions/Guest/userRoleType.js` | Canonical guest-vs-staff designation rule mirrored by the query. |
