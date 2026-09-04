---
title: "1 · Tenants Grouped CRUD"
sidebar_position: 1
---

# 1 · Tenants Grouped CRUD

`/api/custom/tenants/grouped/crud` — creates the tenant and attaches its admin.

A **two-step grouped CRUD**: one endpoint, two form steps, selected with `?step=`. Step 1 makes the
tenant; step 2 gives it an admin. They do **not** share a transaction — step 1 can commit a tenant
with no admin, which is accepted and recoverable.

| Method | Step | Operation | Purpose |
|---|---|---|---|
| `POST` | 1 | Add | create a tenant (or pick an existing one) and clone the global resource set into it |
| `POST` | 2 | Add | attach one or more Tenant Admins |
| `GET` | 1 | View | read a tenant plus its current admin ids |
| `PUT` | 1 | Update | edit the tenant |
| `PUT` | 2 | Update | change the admin assignment |

**Encryption:** platform + access token. **Permission:** `null` — authorization is the
**system-tenant guard** instead: `actionPerformerURDD` must belong to the system tenant, or the
request is refused `403`. A tenant admin cannot create tenants.

---

## POST · step 1 — create the tenant

```
POST /api/custom/tenants/grouped/crud?step=1
```

```json
{
  "actionPerformerURDD": 1,
  "tenants_addNewTenant": true,
  "tenants_tenantName": "Le Meridien Makkah",
  "tenants_tenantCode": "LE_MERIDIEN_MAKKAH",
  "tenants_tenantType": "hotel",
  "tenants_tenantSlug": "le-meridien-makkah",
  "tenants_contactEmail": "front.desk@lemeridien-makkah.com",
  "tenants_contactPhone": "+966500000000",
  "tenants_address": "123 Ibrahim Al Khalil Road",
  "tenants_city": "Makkah",
  "tenants_latitude":21.4202500,
  "tenants_longitude":39.8291800,
  "tenants_country": "Saudi Arabia",
  "tenants_postalCode": "24231",
  "tenants_tenantTimezone": "Asia/Riyadh",
  "tenants_tenantLocale": "en",
  "tenants_tenantCurrencyId": 1,
  "tenants_status": "active"
}
```

Set `"tenants_addNewTenant": false` and pass `"tenants_selectTenantId": 88` instead to run step 1
against an existing tenant — nothing is created, the id is returned and the flow moves to step 2.

**Success — 200**

```json
{
  "success": true,
  "data": {
    "tenant_id": 88,
    "urdd_b_prime": 587,
    "resources_assigned": {
      "service_category": { "assigned": 9, "already_existed": 0 },
      "location_type": { "assigned": 3, "already_existed": 0 },
      "location_type_hierarchy": { "reparented": 2 }
    }
  },
  "meta": { "message": "Tenant created successfully.", "status": 200, "priority": 1 }
}
```

### What this one call actually does

1. Inserts the `tenants` row, stamped `created_by = actionPerformerURDD`.
2. Computes `search_text` server-side — a lowercased concat of name + city + address + country, so
   tenant search matches any of them in one column. **The frontend sends nothing for this.**
3. Resolves or creates the **URDD-B′**: the acting user's new Tenant-Manager leg on this tenant. It
   becomes `created_by` on everything the tenant later owns. Wrapped in a savepoint — if it fails,
   the tenant still commits and `urdd_b_prime` comes back `null`.
4. **Clones every SaaS-global service category and location type into the tenant**, which cascades
   the config keys and the per-category Service-Manager RDDs. Then reconciles the location-type
   `parent_id` chain so the tenant's clones mirror the global building → floor → zone shape.

Step 4 is why a create is slow and why a brand-new tenant is **not** empty. It is idempotent —
re-running reports `already_existed` rather than duplicating.

**Non-fatal by design:** the tenant is already committed before cloning starts, so a cloning glitch
is reported inside `resources_assigned` instead of failing the request.

### Errors

| Status | `scc` | `error.details` | Cause |
|---|---|---|---|
| 400 | `E10` | `Tenant Name is required` | a required `tenants_*` field is missing |
| 403 | `E31` | `Action must be performed from the system tenant` | `actionPerformerURDD` is not a system-tenant leg |
| **409** | `DUPLICATE` | `A tenant named "Le Meridien Makkah" already exists…` | an **active** tenant already has that name |

```json
{
  "success": false,
  "data": null,
  "meta": {
    "message": "That name is already taken. Please choose another.",
    "status": 409,
    "detail": "A tenant named \"Le Meridien Makkah\" already exists.",
    "priority": 2,
    "source": "Pre-Process",
    "scc": "DUPLICATE"
  },
  "error": {
    "message": "A tenant named \"Le Meridien Makkah\" already exists.",
    "detail": "That name is already taken. Please choose another.",
    "code": "DUPLICATE",
    "source": "Pre-Process"
  }
}
```

:::note
The name check is case- and space-insensitive, and applies to **active** tenants only — a
soft-deleted name is free to reuse. A functional unique index (`uq_tenants_active_name`) is the
race-safe backstop, so two simultaneous submits still produce exactly one tenant and one 409.
:::

---

## POST · step 2 — assign the admin

```
POST /api/custom/tenants/grouped/crud?step=2
```

Admin fields use the **`tenantAdmin_`** prefix (the `users_` prefix is also accepted).

**New user:**

```json
{
  "actionPerformerURDD": 1,
  "tenants_selectTenantId": 88,
  "tenantAdmin_addNewUser": true,
  "tenantAdmin_email": "gm@lemeridien-makkah.com",
  "tenantAdmin_username": "lm_gm",
  "tenantAdmin_firstName": "Omar",
  "tenantAdmin_lastName": "Haddad",
  "tenantAdmin_phoneNo": "+966500000001"
}
```

**Existing user(s)** — `tenantAdmin_selectUserId` accepts an array, `"[2,3]"`, `"2,3"` or a single id:

```json
{
  "actionPerformerURDD": 1,
  "tenants_selectTenantId": 88,
  "tenantAdmin_addNewUser": false,
  "tenantAdmin_selectUserId": [104, 158]
}
```

**Success — 200**

```json
{
  "success": true,
  "data": {
    "tenant_id": 88,
    "urdd_b_prime": 587,
    "admins": [ { "user_id": 231, "urdd_id": 604, "created": true } ]
  },
  "meta": { "message": "Tenant admin assigned.", "status": 200, "priority": 1 }
}
```

Step 2 seeds the tenant's RBAC dictionary on first run: it clones the global roles and
designations, the persona permission groups (`PG-TENANT-ADMIN`, `PG-SERVICE-MGR`,
`PG-STANDARD-GUEST`, `PG-BOOKING-MGR`) and the tenant-scope functional `PG-FN-*` bundles, all owned
by URDD-B′, then fans the permissions out onto the new admin's URDD. Platform-level groups
(`PG-FRAMEWORK`, `PG-TENANT-MGMT`) are deliberately **not** cloned.

:::note `PG-FN-FRONTPAGE` is not cloned either
The front page is **platform** content owned by the system tenant, so a hotel has nothing to
manage there. The group sits with the framework-scope bundles rather than the tenant-scope
ones, and a new tenant gets no copy of it.
:::

### Errors

| Status | `scc` | `error.details` | Cause |
|---|---|---|---|
| 400 | `E10` | `Email is required` | `addNewUser: true` without `tenantAdmin_email` |
| 403 | `E31` | `Action must be performed from the system tenant` | actor is not a system-tenant leg |
| 409 | `DUPLICATE` | `A user with that email already exists` | email collides with an existing account |

:::warning On create the admin must be a new user
A tenant that was just created has no users, so the existing-user picker is empty. The
existing-user branch is only useful when re-running step 2 on an established tenant.
:::

---

## GET · step 1 — read the tenant

```
GET /api/custom/tenants/grouped/crud?step=1&id=88
```

Returns the `tenants` columns aliased `tenants_*`, plus `tenantAdmin_selectUserId` — the active
Tenant-Admin user ids for that tenant, supplied as a prefilled select rather than a joined list.

```json
{
  "success": true,
  "data": {
    "tenants_tenantId": 88,
    "tenants_tenantName": "Le Meridien Makkah",
    "tenants_tenantCode": "LE_MERIDIEN_MAKKAH",
    "tenants_city": "Makkah",
    "tenants_country": "Saudi Arabia",
    "tenants_status": "active",
    "tenantAdmin_selectUserId": [231]
  },
  "meta": { "message": "Tenant fetched.", "status": 200, "priority": 0 }
}
```

---

## PUT · step 1 — edit the tenant

```
PUT /api/custom/tenants/grouped/crud?step=1&id=88
```

Same `tenants_*` field set as Add. Two things happen automatically:

- **A rename propagates** to the tenant's staff department name, so the department never drifts
  from the hotel it belongs to. Only the name syncs; `department_code` is a stable label.
- **`search_text` is recomputed** from the values actually persisted, re-read after the update — so
  editing just the city keeps the haystack correct, and rows where it was null get backfilled.

Resource cloning does **not** re-run on update. It is a create-only action.

## PUT · step 2 — change the admin assignment

```
PUT /api/custom/tenants/grouped/crud?step=2&id=88
```

Same payload as step-2 Add. Runs the same shared core, so re-assigning an existing admin is
idempotent rather than an error.

---

## After this endpoint

The tenant now owns cloned service categories, location types, config keys and the starter
services and packages. What it does **not** have is a physical map or anything bookable — that is
[locations](./02-service-location-facets.md) and [delivery units](./03-delivery-units.md).
