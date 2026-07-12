# Service Manager Provisioning

Provisions a **Service Manager** — a staff user scoped to exactly one service category of one tenant. This is **not** a plain CRUD write: the `Add` operation runs a multi-step transactional provisioning routine that clones an RDD template, creates the user and their tenant mapping (URDD), materializes permissions, and sends a branded welcome email. `View` and `List` read back provisioned Service Managers.

| Operation | Method | Path | Permission |
|---|---|---|---|
| Add (provision) | POST | `/api/service/manager/provisioning` | `add_users` |
| View | GET | `/api/service/manager/provisioning?id=<urdd_id>` | `add_users` |
| List | GET | `/api/service/manager/provisioning?tenant_id=<id>` | `add_users` |

> Update / Delete are wired but no-ops (no query, no preProcess).

---

## Authentication & Authorization

Requires the **`add_users`** permission. Per the governance strategy, both **PG-TENANT-MGMT** (Tenant Manager) and **PG-TENANT-ADMIN** (Tenant Admin) carry `add_users`, so both personas can provision Service Managers. (A dedicated `add_service_managers` permission may replace this later.)

The provisioning routine additionally enforces the acting context:

- `actionPerformerURDD` must resolve to an **active** URDD.
- The acting tenant is derived from that URDD. Provisioning **from the system tenant is rejected** (403) — Service Managers must be created from a per-tenant context (a per-tenant Tenant Manager URDD-B′ or a Tenant Admin URDD-C).

---

## Request Payload (Add)

| Field | Type | Required | Description |
|---|---|---|---|
| `target_category_clone_id` | number | Yes | The **tenant's clone** of the service category (not the SaaS-global source id). The category must already be assigned to the tenant. |
| `sm_email` | string | Yes | The Service Manager's email. |
| `sm_firstName` | string | No | First name. |
| `sm_lastName` | string | No | Last name. |
| `actionPerformerURDD` | number | Yes | The acting Tenant Manager (URDD-B′) or Tenant Admin (URDD-C) id. Determines the acting tenant. |

### Example

```json
{
  "target_category_clone_id": 128,
  "sm_email": "spa.manager@hotel1.com",
  "sm_firstName": "Layla",
  "sm_lastName": "Haddad",
  "actionPerformerURDD": 42
}
```

---

## Response (Add)

```json
{
  "success": true,
  "acting_tenant_id": 3,
  "category_clone_id": 128,
  "category_code": "SPA",
  "per_tenant_department_id": 57,
  "rdd_svcmgr_clone": 910,
  "new_user_id": 204,
  "urdd_d": 831,
  "welcome_email_sent": true
}
```

| Field | Type | Description |
|---|---|---|
| `success` | boolean | Always `true` on a completed provision. |
| `acting_tenant_id` | number | Tenant the Service Manager was created in (derived from the actor). |
| `category_clone_id` | number | The tenant category clone the SM is scoped to. |
| `category_code` | string | The category's code (drives the RDD template lookup). |
| `per_tenant_department_id` | number | The tenant's single staff department the SM is placed in. |
| `rdd_svcmgr_clone` | number | The tenant-local RDD clone assigned to the SM. |
| `new_user_id` | number | The newly created user id. |
| `urdd_d` | number | The SM's URDD id (user ↔ RDD ↔ tenant mapping). |
| `welcome_email_sent` | boolean | Whether the welcome email dispatched successfully. |

### List / View

Return Service Manager URDD rows (id, user, email, name, department). List is scoped to `tenant_id` and filtered to active service-category designations; View reads a single SM by `urdd_id`. Both use a data-driven predicate: the RDD designation name must match an active, tenant-owned `service_categories` row — the SM category set is **not** a frozen code list.

---

## Behavior

The `Add` handler (`provisionServiceManager`) runs inside a single DB transaction (rolled back on any error):

1. **Resolve acting tenant** from `actionPerformerURDD`; reject if missing/inactive (403) or if it resolves to the system tenant (403).
2. **Validate the category clone** — `target_category_clone_id` must be an active `service_categories` row owned by the acting tenant (else 409, "run Phase 8 assign first"). Loads its `category_code`.
3. **Resolve the tenant's staff department** — all of a tenant's Service Managers share one staff department and differ only by their category designation (409 if not found).
4. **Locate the global Service-Manager RDD template** (`manager / <categoryCode> / GENERAL`), then **clone it for the tenant**, overriding `department_id` to the staff department and localizing the role to the tenant-local Manager (500 if the template is missing).
5. **Link the cloned RDD to `PG-SERVICE-MGR`** (idempotent) so the SM's permission group drives its URDP.
6. **Insert the user** (`users`, status `active`).
7. **Insert the URDD-D** mapping (user ↔ cloned RDD ↔ tenant) and **sync URDP** from the tenant's `PG-SERVICE-MGR` group (prefers the tenant clone, falls back to global; 500 if the group is missing).
8. **Commit.**
9. **Send a welcome email** branded with the tenant's name (falls back to the platform Destination brand). Sent *outside* the transaction so a mail failure doesn't unprovision the SM. No login OTP is pre-issued — the SM's first OTP is generated on demand at login.

---

## Error Responses

| Status | Condition |
|---|---|
| 400 | Missing `actionPerformerURDD`, `target_category_clone_id`, or `sm_email` |
| 403 | Actor URDD not found/inactive; or acting context is the system tenant |
| 409 | Category clone not assigned to the acting tenant; or the tenant staff department is missing |
| 500 | Global Service-Manager RDD template not found, or `PG-SERVICE-MGR` group missing |

---

## Source Files

| File | Purpose |
|---|---|
| `Src/Apis/ProjectSpecificApis/ServiceManagerProvisioning/ServiceManagerProvisioning.js` | API object; `add_users` gate; List/View predicate; Add postProcess shaping |
| `Src/Apis/ProjectSpecificApis/ServiceManagerProvisioning/CRUD_parameters.js` | Request parameter schema |
| `Src/HelperFunctions/PreProcessingFunctions/ServiceManagerProvisioning/provisionServiceManager.js` | Transactional provisioning routine (RDD clone, user + URDD, URDP sync, welcome email) |
| `Src/HelperFunctions/PayloadFunctions/Governance/sendServiceManagerWelcome.js` | Tenant-branded welcome email |
