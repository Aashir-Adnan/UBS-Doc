# Tenant Provisioning (Grouped CRUD)

| Operation | Method | Path | Permission |
|---|---|---|---|
| Add (provision) | POST | `/api/tenant/provisioning/grouped/crud` | `add_tenants` |
| List | GET | `/api/tenant/provisioning/grouped/crud` | `add_tenants` |
| View | GET | `/api/tenant/provisioning/grouped/crud?id=<tenantId>` | `add_tenants` |
| Update | PUT | `/api/tenant/provisioning/grouped/crud` | `add_tenants` |
| Delete | DELETE | `/api/tenant/provisioning/grouped/crud` | `add_tenants` |

Provisions a whole new tenant end-to-end in a single transaction — the tenant row, its Tenant-Manager URDD, the Tenant Admin user, the cloned RBAC dictionary, and a welcome email — and also exposes plain List / View / Update / Delete over the underlying `tenants` table. Intended for the **Tenant Manager** persona operating in the system-tenant context.

---

## Authentication & Authorization

Every verb is gated by the **`add_tenants`** permission (`requestMetaData.permission`). In the governance model `add_tenants` lives in the `tenant_mgmt` tier and is present only in **`PG-TENANT-MGMT`**, so only the **Tenant Manager** persona can call this endpoint. (SaaS Admin does *not* receive `add_tenants`.)

The **Add** flow additionally requires the actor to be in **system-tenant context**: the acting `actionPerformerURDD` must resolve to a URDD whose `tenant_id` equals the system tenant id (resolved via `getSystemTenantId()`). If the actor presents a per-tenant URDD instead, provisioning is rejected with **403 Forbidden**.

The **Delete** flow additionally guards the system tenant: attempting to delete/suspend the system tenant returns **403 Forbidden**.

---

## Request Payload

### Add (provision)

| Field | Type | Required | Description |
|---|---|---|---|
| `tenants_tenantName` | `string` | Yes | Display name of the new tenant. |
| `tenants_tenantCode` | `string` | Yes | Short code (e.g. `MRS-002`). |
| `tenants_tenantSlug` | `string` | Yes | URL slug. |
| `tenants_tenantType` | `string` | No | Tenant type; defaults to `'hotel'`. |
| `tenants_contactEmail` | `string` | No | Tenant contact email. |
| `tenants_contactPhone` | `string` | No | Tenant contact phone. |
| `tenants_tenantTimezone` | `string` | No | e.g. `Asia/Riyadh`. |
| `tenants_tenantLocale` | `string` | No | e.g. `en`. |
| `tenants_tenantCurrencyId` | `number` | No | FK into `currencies`. |
| `tenantAdmin_email` | `string` | Yes | Email for the new Tenant Admin user. |
| `tenantAdmin_firstName` | `string` | No | Tenant Admin first name. |
| `tenantAdmin_lastName` | `string` | No | Tenant Admin last name. |
| `actionPerformerURDD` | `number` | No | Actor identity — must be the Tenant Manager's URDD in the **system tenant**. |

```json
{
  "tenants_tenantName": "Marasi Resort",
  "tenants_tenantCode": "MRS-002",
  "tenants_tenantSlug": "marasi-resort",
  "tenants_tenantType": "hotel",
  "tenants_contactEmail": "ops@marasi.com",
  "tenants_tenantTimezone": "Asia/Riyadh",
  "tenants_tenantLocale": "en",
  "tenantAdmin_email": "admin@marasi.com",
  "tenantAdmin_firstName": "Layla",
  "tenantAdmin_lastName": "Nasser",
  "actionPerformerURDD": 12
}
```

### Update

Patches `tenant_name`, `contact_email`, `contact_phone`, `tenant_timezone`, `tenant_locale` for the row identified by `id` (or `tenants_tenantId`). Each column is `COALESCE`-guarded, so omitted fields keep their existing value; `updated_by` is stamped with `actionPerformerURDD`.

### View / Delete

Provide the target tenant via `id` (or `tenants_tenantId`). Delete is a **soft delete** (`is_active = 0`).

---

## Response

### Add

```json
{
  "success": true,
  "new_tenant_id": 7,
  "urdd_b_prime": 168,
  "rdd_tadmin_clone": 73,
  "new_user_id": 9,
  "urdd_c": 169,
  "welcome_email_sent": true,
  "mirror_summary": {
    "rolesMirrored": 7,
    "departmentsMirrored": 11,
    "designationsMirrored": 18,
    "rddsMirrored": 18
  }
}
```

| Field | Type | Description |
|---|---|---|
| `success` | `boolean` | Provisioning succeeded. |
| `new_tenant_id` | `number` | The newly created tenant id. |
| `urdd_b_prime` | `number` | Tenant-Manager URDD scoped to the new tenant (carrier of `created_by` for mirrored rows). |
| `rdd_tadmin_clone` | `number` | Per-tenant clone of the global Tenant-Admin RDD. |
| `new_user_id` | `number` | The new Tenant Admin user id. |
| `urdd_c` | `number` | The Tenant Admin's URDD in the new tenant. |
| `welcome_email_sent` | `boolean` | Whether the welcome email dispatched (non-fatal if `false`). |
| `mirror_summary` | `object` | Counts of roles/departments/designations/RDDs mirrored from the system tenant. |

### List / View

Returns `tenants` rows aliased with the `tenants_*` field convention (`tenants_tenantId`, `tenants_tenantName`, `tenants_tenantCode`, `tenants_tenantType`, `tenants_subscriptionStatus`, `tenants_isActive`, `tenants_createdAt`, …). List excludes the system tenant, returns only `is_active = 1`, newest first, and includes a `table_count` window value for pagination.

---

## Behavior

### Provisioning flow (Add)

All steps run in a **single transaction**; a failure at any step rolls back. The welcome email is sent **after COMMIT**, so a mail failure never un-provisions the tenant.

1. **Guard** — actor must be in system-tenant context (else 403).
2. **Step 1 — INSERT `tenants`** — `subscription_status = 'trial'`, `created_by = actor`.
3. **Step 2 — INSERT URDD-B'** — a Tenant-Manager URDD for user 1 scoped to the new tenant; becomes the `created_by` carrier for everything mirrored into the tenant.
4. **Step 2b — `mirrorRbacDimensionsForTenant`** — clones the system tenant's operational roles, departments, designations, and RDDs into the new tenant (globals and governance personas excluded; dedup makes re-runs a no-op).
5. **Step 3 — `cloneRddForTenant`** — clones the global Tenant-Admin RDD (Admin role + Tenant Admin designation + Tenants department) into the new tenant.
6. **Step 4 — INSERT `users`** — the Tenant Admin user, owned by URDD-B'.
7. **Step 5 — INSERT URDD-C + `syncUrddPermissions`** — the Tenant Admin URDD, with URDP materialized from **`PG-TENANT-ADMIN`** (tenant + service + common tiers).
8. **Step 6 — COMMIT, then welcome email** — Destination-branded onboarding email; the first-login OTP is generated on demand at login, not pre-issued.

### List / View / Update / Delete

The `tenants` table is exempt from per-tenant filtering, so List returns all tenants (with its own `WHERE tenant_id != systemTenantId` clause hiding the system tenant). Update is COALESCE-guarded (partial-safe). Delete is a soft delete guarded against removing the system tenant.

> **Tip:** If `GET` returns an empty list, the caller likely presented URDD-B' (a per-tenant URDD) instead of URDD-B (system tenant). Tenant management is system-tenant work — switch the acting URDD first.

---

## Source Files

| File | Purpose |
|---|---|
| `Src/Apis/ProjectSpecificApis/TenantProvisioningGroupedCrud/TenantProvisioningGroupedCrud.js` | API object — wires steps, permission, and the List/View/Update/Delete queries. |
| `Src/Apis/ProjectSpecificApis/TenantProvisioningGroupedCrud/CRUD_parameters.js` | Add-step request field schema. |
| `Src/Apis/ProjectSpecificApis/TenantProvisioningGroupedCrud/README.md` | Full provisioning strategy notes. |
| `Src/HelperFunctions/PreProcessingFunctions/TenantProvisioningGroupedCrud/provisionTenant.js` | The transactional provisioning flow (Add preProcess). |
| `Src/HelperFunctions/PayloadFunctions/Governance/getSystemTenantId.js` | Resolves the system tenant id (context guard). |
| `Src/HelperFunctions/PayloadFunctions/Governance/cloneRddForTenant.js` | Clones a global RDD into a target tenant. |
| `Src/HelperFunctions/PayloadFunctions/Governance/mirrorRbacDimensionsForTenant.js` | Mirrors system-tenant roles/departments/designations/RDDs. |
| `Src/HelperFunctions/PayloadFunctions/Governance/syncUrddPermissions.js` | Materializes URDP for a URDD from a permission group. |
