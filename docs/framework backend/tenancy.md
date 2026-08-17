---
sidebar_position: 3
---

# Multi-Tenant Query Scoping

The framework supports multi-tenant data isolation through a two-layer filtering system in the query resolver. When enabled, every SELECT query that passes through the middleware pipeline is automatically scoped to the acting user's tenant.

---

## Enabling Tenancy

Set the environment variable in `.env`:

```
TENANCY_CHECK=true
```

When disabled (or absent), all tenancy filters are skipped and queries return unscoped results.

---

## How It Works

### Layer 1: Query Resolver Tenancy Filter (`created_by`)

The query resolver extracts `actionPerformerURDD` from the request, resolves the URDD's `tenant_id`, and appends a `created_by IN (...)` clause to every non-exempt table in the SELECT:

```
actionPerformerURDD (from payload or query string)
  -> getTenantIdForActionPerformer(urdd)
     -> SELECT tenant_id FROM user_roles_designations_department WHERE ... = urdd
     -> returns tenant_id (or null)
  -> applyTenancyFilters(query, tenantId)
     -> appends: table.created_by IN (
          SELECT user_role_designation_department_id
          FROM user_roles_designations_department
          WHERE tenant_id = <tenantId>
        )
```

The filter is applied to all top-level tables in the query except those in the exempt list (see below).

### Layer 2: Explicit Tenant Status Filter

Individual queries may also include explicit tenant checks in their SQL:

```sql
INNER JOIN tenants t ON s.tenant_id = t.tenant_id
WHERE t.status = 'active' AND t.is_active = 1
```

This is a data-integrity filter that runs regardless of whether `TENANCY_CHECK` is enabled. It ensures records from disabled or pending tenants are never returned.

---

## Tenant ID Resolution

The tenant is resolved from the acting URDD's row in `user_roles_designations_department`:

| URDD tenant_id | getTenantIdForActionPerformer returns | Tenancy filter behavior |
|---|---|---|
| Valid ID (e.g. `3`) | `3` | Filter active -- scoped to tenant 3 |
| `NULL` | `null` | Filter skipped -- cross-tenant results |
| `0` | `0` (falsy) | Filter skipped -- cross-tenant results |
| URDD not found | `null` | Filter skipped -- cross-tenant results |
| No `actionPerformerURDD` sent | `null` | Filter skipped -- cross-tenant results |

The guard in `applyTenancyFilters` is:

```js
if (!tenantId) return query; // null, 0, undefined -> no filter
```

---

## Global URDD (Cross-Tenant Access)

A URDD with `tenant_id = NULL` is the **global URDD**. When this URDD is sent as `actionPerformerURDD`, the tenancy filter is naturally bypassed because `getTenantIdForActionPerformer` returns `null`.

This is the mechanism for cross-tenant access on public endpoints. The frontend stores a `tenantUrddMap` after login:

```json
{
  "1": 15,
  "3": 16,
  "global": 14
}
```

| Endpoint type | Which URDD to send | Result |
|---|---|---|
| Public catalog (`/guest/services`, `/guest/packages`, `/guest/service-categories`) | `tenantUrddMap.global` | Cross-tenant -- sees all active tenants |
| Authenticated scoped (`/guest/bookings/current`, `/guest/booking/checkin`) | `tenantUrddMap[tenantId]` | Scoped to that tenant |

---

## Exempt Tables

The following tables are excluded from the `created_by` tenancy filter because they hold cross-tenant reference data:

| Table | Reason |
|---|---|
| `tenants` | Tenant registry itself |
| `currencies` | Platform-wide reference |
| `countries` | Platform-wide reference |
| `regions` | Platform-wide reference |
| `supported_payment_methods` | Gateway reference |
| `language_codes` | Platform-wide reference |
| `platforms` | Platform registry |
| `versions` | Version registry |
| `platform_versions` | Version registry |
| `catalog` | Shared catalog |
| `hms_scope_types` | Framework-global config |
| `hms_config_categories` | Framework-global config |

These tables always return all rows regardless of the acting tenant.

---

## Service Manager Scope

When the acting URDD belongs to a Service Manager (`designation_code = 'SVCMGR'`), an additional category-scoping filter is applied on top of the tenant filter. The Service Manager only sees records related to their assigned service category:

```sql
services.category_id = <categoryId>
```

This is resolved via the URDD's department code (`DEPT_<category_code>`) and the `service_categories` table.

---

## Platform Types and Tenancy

| Platform | Token verified | URDD source | Tenancy behavior |
|---|---|---|---|
| `AUTH_PLATFORM` | Yes | Verified JWT | Tenant scoped (URDD has tenant_id) |
| `PUBLIC_ENCRYPTED_PLATFORM` | No | Encrypted payload | Depends on URDD sent -- use global for cross-tenant |
| `PUBLIC_PLATFORM` | No | Plain body | Depends on URDD sent -- use global for cross-tenant |

For `PUBLIC_ENCRYPTED_PLATFORM` endpoints, the access token is not verified, but `actionPerformerURDD` is still read from the decrypted payload. The frontend controls scoping by choosing which URDD to send:

- **Global URDD** (tenant_id = NULL) -> tenancy filter disabled -> cross-tenant catalog
- **Tenant URDD** (tenant_id = N) -> tenancy filter active -> scoped to tenant N

---

## Query Resolver Pipeline

The tenancy filter is applied at step 5 in the middleware pipeline:

```
1. getApiObjectHandler      -- resolve the API object from the URL
2. platformConfigHandler    -- validate platform
3. encryptionHandler        -- decrypt payload
4. accessTokenValidator     -- verify JWT (if required by platform)
5. tenantResolver           -- resolve tenant_id from actionPerformerURDD
6. queryResolverHandler     -- execute SQL with tenancy + permission filters
7. postProcessHandler       -- transform results
```

The `queryResolverHandler` calls `applyTenancyFilters` which modifies the SQL before execution. Queries executed directly via `executeQuery` (e.g. in postProcess functions or helper modules) bypass this filter entirely.

---

## Bypassing the Query Resolver

Some endpoints set `queryPayload` to `null` and perform all data fetching in their `postProcessFunction` using direct `executeQuery` calls. These endpoints are **not affected** by the tenancy filter because their queries never pass through the query resolver.

Examples:
- `GET /guest/landing` -- uses `searchQueries.js` with direct `executeQuery`
- `POST /guest/bookings/service` -- all logic in preProcess/postProcess
- `POST /guest/booking/checkin` -- all logic in preProcess

Endpoints with real SQL in `queryPayload` (e.g. `GET /guest/services`, `GET /guest/packages`) **are affected** and rely on the global URDD mechanism for cross-tenant access.

---

## Tenants Table Schema

```sql
tenants.status    ENUM('active', 'inactive', 'pending')
tenants.is_active TINYINT(1)  -- 1 = active, 0 = disabled
```

Both `status = 'active'` AND `is_active = 1` must be true for a tenant's records to appear in guest-facing queries.

---

## Diagnostic Script

Run the tenancy check sim to verify behavior:

```bash
# Ensure TENANCY_CHECK=true in .env, then restart the server
node backend/Services/SysScripts/TestScripts/sim/guestTenancyCheck.js
```

The script tests:
1. Baseline with no URDD (cross-tenant)
2. Global URDD (should match baseline)
3. Tenant-specific URDDs (should show scoped counts)
4. Service/package detail consistency
5. Authenticated endpoint scoping
6. Landing vs services hotel coverage
