---
title: "Tenant Manager Management"
---

# Tenant Manager Management

How the platform creates, provisions, reads, and governs **Tenant Managers** through the grouped
user CRUD (`/api/custom/users/grouped/crud`). Companion to [Governance Model](../tenant-governance-model/governance-model.md)
and [Permission Groups → Permissions](../permission-groups-permissions/permission-groups-permissions.md).

---

## 1. What a Tenant Manager is

A **Tenant Manager** is any user holding an active `TENANT / Manager` URDD — matched by the role
**signature** (`designation_code = 'TENANT'` + `role_name = 'Manager'`), never by a role id (the role
is cloned per tenant, so its id differs everywhere). There are two flavours; **both count as a Tenant
Manager, only their reach differs**:

| Flavour | The leg | Reach | Permission group |
|---|---|---|---|
| **General manager of all hotels** (URDD-B′, e.g. `URDD 2`) | on the **global** `TENANT/Manager` RDD, anchored on the **system tenant** | every hotel (the tenancy filter no-ops) | **`PG-TENANT-MGMT`** |
| **Per-tenant Tenant Manager** | on that hotel's **clone** of the `TENANT/Manager` RDD | that one hotel | its tenant's persona-group clone |

The global `TENANT/Manager` RDD is resolved by natural key (`getGlobalTmgrRdd`: dept `GENERAL`,
`tenant_id IS NULL` **or** the system tenant — the "anchor SaaS globals to the system tenant" model).
The persona's **signature permission** is `tenant_manager_dashboard` (tier `tenant_mgmt`); its
governance group is **`PG-TENANT-MGMT`** — which is **never cloned** per tenant.

---

## 2. The general "manager of all hotels" leg

The leg the platform owner (URDD-B′ / `URDD 2`) carries, and the one this CRUD creates when
`includes_global: true` is submitted (see §4). Written by `ensureGlobalTenantManagerLeg`:

- **`tenant_id` = the system tenant** (a twin of `URDD 2`). This is a **staff** persona and logs in
  through the **staff** path, which honours the system-tenant leg — so the system tenant being
  `inactive` does **not** drop it.
- **PG = `PG-TENANT-MGMT`** (the Tenant-Manager group), resolved **by name** — matching the RDD's own
  permission-group link and the persona the manager actually is. Permissions are materialized onto the
  new leg.

:::note Guest vs staff
The `tenant_id IS NULL` rule belongs to the **guest-side** global guest leg — a different persona and
login path (governed by `buildGuestUrddList.js`). The Tenant Manager is a **staff** persona, so it is
anchored on the system tenant like `URDD 2`.
:::

:::info History
This leg previously used `tenant_id NULL` + `PG-TENANT-ADMIN`. Both were corrected on 2026-08-19 so the
general manager is a true twin of URDD-B′ (system tenant + `PG-TENANT-MGMT`).
:::

---

## 3. Managing a Tenant Manager — the grouped CRUD step 2

Step 2 takes three inputs that together shape a user's Tenant-Manager membership. All three are
**authoritative / desired-state**: dropping a role, a tenant, or the flag **revokes** the corresponding
leg.

| Field | Type | What it drives |
|---|---|---|
| `userRolesDesignationsDepartment_roleDesignationDepartmentId` | RDD id **set** | roles the user holds **in the actor's own tenant** — replace-all |
| `persona_of_tenants` + `tenants` | bool + tenant id list | provision the same role set into **each listed hotel** |
| `includes_global` | bool | the **general manager of all hotels** leg (§4) |

:::caution Input shape
`roleDesignationDepartmentId` is normalized to tolerate an array, a scalar, `[value]` option-objects, a
**JSON-string array** (`"[167, 53]"`), and a comma list (`"167,53"`). A value that fails to parse would
collapse the set to an empty array — which means "remove every role in this tenant" — so the
string-parsing is load-bearing.
:::

---

## 4. `includes_global` handling (create / revoke)

Gated behind `persona_of_tenants` being truthy **and** a **system-tenant actor**. Read from
`includes_global` (or `userRolesDesignationsDepartment_includesGlobal`).

**`includes_global: true`** → ensure the general-manager leg:
- if an active system-tenant leg on the global TMGR RDD already exists → **kept** (idempotent, no
  duplicate; also dedups against a leg the in-tenant sync may have created);
- otherwise → **insert** the system-tenant leg + materialize `PG-TENANT-MGMT` permissions.

**`includes_global: false` (or omitted)** → **authoritative revoke**:
- the active system-tenant leg on the global TMGR RDD is **inactivated** and its **permissions (URDP)
  deleted** (soft-delete + permission cleanup).

Matched on the **system-tenant leg by the exact global-TMGR RDD id** — never the `tenant_id IS NULL`
legs (the guest-side global guest leg lives there).

:::warning Payload consistency
Because the general-manager leg now lives in the actor's own tenant (the system tenant), it shares scope
with the in-tenant role-set sync. Sending the global TMGR RDD in `roleDesignationDepartmentId` **and**
`includes_global: false` in the same request is contradictory — the authoritative `includes_global: false`
runs last and inactivates the leg. Keep the two in sync on the frontend.
:::

---

## 5. `persona_of_tenants` fan-out (into many hotels)

When `persona_of_tenants` is truthy, the same submitted role set is provisioned into every tenant in
`tenants` (excluding the actor's own tenant). Each tenant runs the **full provisioning sequence** (the
same one tenant-admin assignment uses): resolve/create URDD-B′ + staff department + TMGR clone, mirror
the tenant's RBAC dimensions, clone the selected RDD into the tenant (localized), re-own it by URDD-B′,
seed the permission-group link, re-link seniority, then insert the user's URDD + permissions.

Authoritative: a tenant dropped from `tenants` has its leg **revoked** (matched by role signature, never
the actor's own tenant, never the `tenant_id IS NULL` legs).

---

## 6. Reading Tenant-Manager membership

- **`is_tenant_manager`** — stamped on every **Users CRUD** List/View row. `true` iff the user holds an
  **active** `TENANT/Manager` URDD (any tenant). Emitted **only for system-tenant callers** — omitted
  (not `false`) for anyone else, so the frontend can tell "not applicable" from "applicable and not one".
- **Tenant Manager Candidates Dropdown** — the cross-reference API:
  - **GET** → a `value` / `label` row for every Tenant Manager (the "Select Existing User" picker).
  - **POST** (`entity_type` = `"users"` or `"tenants"`, `entity_id` = list of ids):
    - `users` → per user: the `tenants` they manage per-tenant + `includes_global` (holds the global leg).
    - `tenants` → per tenant: the `users` who manage it — its per-tenant TM holders **plus** every global TM (a global TM manages all hotels).
- The grouped CRUD's own List/View **no longer** attach the persona-of-tenants read state — that moved
  to the candidates dropdown.

---

## 7. Who may manage a Tenant Manager (seniority)

Role writes go through the shared [Seniority Scope](../../major-implementations/seniority-scope/seniority-scope.md)
guard. The branch that makes Tenant-Manager onboarding work:

- **Provisioning into the actor's own tenant** — when the target holds **no active leg in the actor's
  tenant**, it cannot be senior *there*, so a **Tenant-Manager** or **SaaS-Admin** may assign it a fresh
  role (onboarding a user who holds roles only in other tenants, or none). Gated on the target **not**
  being a SYSTEM/SaaS-Admin; assigning a role senior to the actor is still separately blocked.

This is what lets the **system-tenant Tenant-Manager (URDD-B′)** manage a Tenant-Admin who has no
system-tenant leg.

---

## 8. The `manage_tenants_manager` permission

A dedicated permission **`manage_tenants_manager`** (tier `tenant_mgmt`) is granted to
**`PG-TENANT-MGMT` only** (the global, never-cloned Tenant-Manager group) and materialized onto the
**system-tenant `TENANT/Manager` URDD** holders (the general Tenant-Manager persona). Its Arabic
description is pre-seeded so the runtime translator does not overwrite it.
