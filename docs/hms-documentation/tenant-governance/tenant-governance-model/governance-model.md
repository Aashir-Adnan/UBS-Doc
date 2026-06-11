# Governance Model

This is the foundational guide. Read it before the others — they all assume the vocabulary and the one isolation rule defined here.

If you are new to the codebase, the goal of this page is to leave you able to answer three questions:

1. **Who is allowed to do what** (the four governance tiers and how permissions reach a user).
2. **How one database serves many hotels without them seeing each other's data** (tenant isolation).
3. **Why "cloning" keeps coming up** (how a framework-owned row becomes a single hotel's editable copy).

---

## 1. The problem this solves

HMS is a single backend that runs **many hotels** at once. Each hotel ("tenant") has its own users, services, bookings, prices, and configuration, and must never see another hotel's data. At the same time, there is a layer *above* all hotels — the **platform/framework** — that defines the building blocks every hotel starts from (what a "config key" is, what service categories exist, etc.).

So there are really two kinds of actor:

- **Platform-level** actors who maintain the framework and onboard hotels.
- **Hotel-level** actors who run a single hotel.

The governance model is the four-tier structure that expresses this, and it is built **entirely out of the existing RBAC tables** — there is no separate "tenancy engine." Understanding that the four tiers are *just seed data + permission wiring* is the first mental unlock.

---

## 2. The four tiers

| Tier | role / designation / department | Scope | What they own / do |
|---|---|---|---|
| **SaaS Admin** | Admin / `SYSTEM` / `HMS` | Global (system tenant) | The framework: `platforms`, `versions`, reference data; **creates** `hms_config_keys` (+ their values), `service_categories`, `location_type`. |
| **Tenant Manager** | Manager / `TENANT` / `GENERAL` | Global (system tenant) | All non-framework CRUDs; **creates tenants** and their Tenant Admin users; **assigns** framework resources to specific tenants. |
| **Tenant Admin** | Admin / `TENANT` / `<Hotel>` | One tenant | Runs one hotel — everything inside it. |
| **Service Manager** | Manager / `<category>` / `<Hotel>` | One category in one tenant | Runs one service category (Stay, Dining, …) inside one hotel. |

A narrative for each, so the table isn't abstract:

- **SaaS Admin** is the platform owner's "build the product" hat. When the SaaS Admin adds a new config key like `base_price`, *no hotel has it yet* — it exists only at the platform level.
- **Tenant Manager** is the platform owner's "run the business" hat. It creates a new hotel ("provision a tenant"), then hands that hotel the framework pieces it needs by **assigning** them (e.g. "give Hotel X the Stay category and the `base_price` key"). Assigning is where cloning happens (§5).
- **Tenant Admin** logs in for one hotel and configures it: turns config keys on/off for their categories, sets prices, manages staff.
- **Service Manager** is scoped down to a single category in a single hotel — e.g. the Dining manager at Hotel X sees and edits only Dining services there.

> **The SaaS Admin and Tenant Manager are two URDDs on the same bootstrap user** (`user_id = 1`) in the system tenant. One physical login, two "hats." The SaaS Admin URDD holds framework permissions; the Tenant Manager URDD holds everything else. The Tenant Manager *also* gets a **per-tenant URDD** (we call it **URDD-B′**) inside every hotel it provisions, so it can *own* the rows it assigns there — that ownership is the whole trick behind isolation (§4–§5).

```
user (user_id 1) ──┬── URDD-A  SaaS Admin        → FRAMEWORK permissions      (system tenant)
                   └── URDD-B  Tenant Manager    → ALL non-framework perms     (system tenant)
                                   │ provisions a hotel, then assigns resources to it
                                   ▼
                              TENANT X (a hotel)
                                URDD-B′  Tenant Manager, scoped to X  → OWNS rows assigned to X
                                URDD-C   Tenant Admin                 → all tenant-level perms
                                URDD-D   Service Manager (per category)→ service perms for one category
```

Why does user 1 wear two hats instead of being one all-powerful admin? Because **there is no "super-admin bypass"** in HMS (see §3.4). Every action is checked against concrete permissions, and framework vs. tenant permissions are deliberately split so that "editing the product" and "running the business" stay separate concerns.

---

## 3. The RBAC chain — how a permission reaches a user

This is the machinery the four tiers are built on. Every persona above is literally a row in `roles_designations_department`.

### 3.1 The building blocks

```
roles ─┐
designations ─┼─→ roles_designations_department (RDD)   — a reusable {role, designation, department} persona
departments ─┘            │
                          ▼
            user_roles_designations_department (URDD)    — assigns an RDD to a user, scoped to a tenant
                          │
                          ▼
            user_role_designation_permissions (URDP)     — the resolved permissions of that URDD
                          │
                          ▼
                     permissions                         — atomic permission strings
```

| Table | What it is | Newcomer analogy |
|---|---|---|
| `roles`, `designations`, `departments` | The three dimensions. Each carries `tenant_id`, `is_global`, audit columns. `roles`/`designations` also carry a seniority self-reference (`senior_*_id`). | The three "axes" that describe a job. |
| `roles_designations_department` (**RDD**) | One row pinning *one* role + *one* designation + *one* department. A reusable **persona template**. | A job description ("Dining Manager at Hotel X"). |
| `user_roles_designations_department` (**URDD**) | A specific user *holding* that persona, scoped to a tenant. | A person hired into that job. **This is the identity behind `actionPerformerURDD`.** |
| `permission_groups` | A named bundle of permissions, optionally tied to a role/designation. | A starter pack of permissions for a persona. |
| `user_role_designation_permissions` (**URDP**) | The flat, resolved `(URDD, permission)` rows the runtime check actually reads. | The actual keys on a person's keyring. |
| `permissions` | Atomic permission strings, named `<action>_<resource_plural>` (`list_roles`, `add_users`, `assign_service_categories_to_tenant`). | Individual locks a key can open. |

### 3.2 Two ways a permission reaches a URDD

1. **Directly** — a URDP row `(URDD, permission_id)` exists.
2. **Via a group** — a `permission_group` is attached to the persona's RDD; when the URDD is created, the group's permissions are **fanned out** into individual URDP rows.

Either way, the **runtime check only ever reads URDP** — the flat list. Groups are just a convenient way to populate it.

### 3.3 What the runtime check actually does

Permission enforcement happens in **Stage 2 of the request pipeline** (`permissionHandler` → `permissionChecker`; see the request-lifecycle reference). For a normal request, for each permission the operation requires:

```sql
SELECT p.permission_name
FROM user_roles_designations_department urdd
JOIN user_role_designation_permissions urdp
     ON urdd.user_role_designation_department_id = urdp.user_role_designation_department_id
JOIN permissions p ON urdp.permission_id = p.permission_id
WHERE urdd.user_role_designation_department_id = {{actionPerformerURDD}}
  AND p.permission_name = '<required permission>';
```

- A row comes back → **allowed**.
- Nothing comes back, but the API object sets `providedPermissions: true` and the request's JWT carries that permission → **allowed** (scoped delegated tokens).
- Otherwise → **`E41` Forbidden** (a `403`). A missing `actionPerformerURDD` is **`E22`**.

The checker also produces **data-scoping hints** the query resolver later uses (§4): `meta.created_by` is the caller's URDD *plus* the URDDs of its subordinates (found by walking the `senior_designation_id` hierarchy), which is how a manager can see rows created by their team.

### 3.4 No super-admin bypass

There is **no "skip all checks" flag** anywhere. Even an Admin URDD must hold the relevant `permission_name` rows in URDP. "Power" comes from two ordinary mechanisms:

- holding a **wide permission set** (e.g. a big permission group), and
- the **designation hierarchy** granting visibility over subordinates' rows.

Keep this in mind when a request unexpectedly 403s: the fix is almost always "the URDD is missing a URDP row," never "flip the admin bit."

---

## 4. Tenant isolation — one database, many hotels

This is the single most important mechanism in the whole system. **There are no separate databases per hotel** (in the current single-DB deployment). Instead, isolation is enforced when SQL is resolved, by the query resolver (`queryResolverHandler`, Stage 2 of the pipeline).

### 4.1 The one rule

Every row records **who created it** in `created_by` — and `created_by` holds a **URDD id**, never a user id. When the `TENANCY_CHECK` flag is on, the resolver appends a filter to top-level `SELECT`s:

```sql
WHERE <table>.created_by IN (
  SELECT user_role_designation_department_id
  FROM user_roles_designations_department
  WHERE tenant_id = <resolved tenant_id>
)
```

In plain English: **"only return rows created by a URDD that belongs to my tenant."** Because every URDD belongs to exactly one tenant, this scopes the result set to one hotel. That's the whole isolation model — internalise it and the rest of these guides follow.

### 4.2 How "my tenant" is resolved on each request

You don't pass `tenant_id` explicitly; it is derived from *who is acting*:

1. The frontend sends the acting identity (`actionPerformerURDD`) in an **encrypted header on every request — including GETs** — which the platform-encryption middleware decrypts into `decryptedPayload`. (A plain `actionPerformerURDD` query param is accepted only as an explicit override.)
2. The resolver looks up that URDD's tenant: `SELECT tenant_id FROM user_roles_designations_department WHERE user_role_designation_department_id = ?`.
3. That becomes the **scope tenant** plugged into the filter above.

> If tenancy is on but **no actor resolves** (no `actionPerformerURDD`, or an unknown URDD), well-behaved endpoints **fail closed** — they return zero rows rather than leaking every tenant's data. (The config-keys CRUD does this explicitly with an `AND (1=0)` suffix; see that guide.)

### 4.3 Primary table vs joined tables

The predicate is not applied uniformly — and the difference matters when you write or read SQL:

```sql
-- PRIMARY (FROM) table — STRICT. It defines the row set:
X.created_by IN (SELECT … WHERE tenant_id = <scope tenant>)

-- JOINed tables — NULL-tolerant. They only decorate already-scoped rows:
( Y.created_by IS NULL OR Y.created_by IN (<same subquery>) )
```

| Rule | Why it exists |
|---|---|
| **Primary is strict** (no `IS NULL` branch, no special admin branch) | Only the scope tenant's own rows are returned. Platform-shared data must be made exempt (§4.5), not smuggled in via ownership special-cases. |
| **Joined tables are NULL-tolerant** | A strict `IN` on a LEFT-JOINed alias drops every primary row that has *no* join match (`NULL IN (…)` is false) — e.g. a users list that LEFT JOINs attachments would lose every user without an attachment. The NULL branch keeps unmatched LEFT-JOIN rows and platform-owned label rows alive; isolation is already guaranteed by the primary predicate. |

> **Practical consequence:** a legacy row with `created_by IS NULL` on a *primary* table is invisible to **everyone** under the strict predicate. If such rows matter, back-fill `created_by` with the owning tenant's URDD in a migration — there is no NULL escape hatch on the primary table by design.

### 4.4 System actors can narrow, never widen

A **system-tenant actor** (SaaS Admin, or the base Tenant Manager URDD-B) is scoped to the *system* tenant by default. It may **narrow** to one specific hotel by sending `target_tenant_id` (preferred) or the transport's `tenantId`. The gate is `getSystemTenantId()` — only an actor whose own URDD is in the system tenant is allowed to narrow. **A non-system actor's requested target is ignored**, so this field can never be used to widen access.

> **There is no Tenant-Manager "see all tenants" bypass** (it was removed 2026-06-05). Every actor, the Tenant Manager included, is scoped to a single tenant per request. The TM picks a hotel context either by presenting that hotel's **URDD-B′** as `actionPerformerURDD`, or — as a system actor — via `target_tenant_id`. Genuinely cross-tenant admin reads (e.g. "list a target tenant's assigned resources") live in **explicit pre-processors that resolve their own scope**, not in the generic filter — see [resource-assignments.md](../per-tenant-resource-assignment/resource-assignments.md).

### 4.5 Exempt tables (shared reference data)

Some tables are **platform-shared** and must be visible to everyone — filtering them by the acting tenant's URDDs would empty any join. These are listed in `TENANCY_FILTER_EXEMPT_TABLES` and skipped entirely:

`tenants`, `currencies`, `countries`, `regions`, `supported_payment_methods`, `language_codes`, `platforms`, `versions`, `platform_versions`, `catalog`, `hms_scope_types`, `hms_config_categories`.

Matching is **by the alias used in FROM/JOIN**. A custom alias bypasses the exemption and gets the standard predicate — so be deliberate with aliases on these tables in hand-written SQL.

### 4.6 Writes are not filtered

The tenancy filter only rewrites `SELECT`s. **INSERT/UPDATE/DELETE are not tenant-scoped by the resolver.** Anywhere that matters, an explicit **ownership guard** runs in the API's pre-process before the write — see the guards in [config-keys.md](../config-keys/config-keys.md#5-tenancy--ownership) and [resource-assignments.md](../per-tenant-resource-assignment/resource-assignments.md). This is a common source of "why is there a manual tenant check here?" — that's why.

---

## 5. `is_global` vs cloning — share the global, clone the operational

A row is reusable across tenants in one of two ways, and they are **not** interchangeable:

| Kind | Marked by | How a tenant gets it | Why |
|---|---|---|---|
| **Platform-global** | `is_global = 1` (and `tenant_id NULL`) | **Shared directly** via the exempt / NULL-tolerant branch of the filter. | One copy serves everyone; cloning it would duplicate it in pickers (one global + one clone). |
| **System-tenant operational** | owned by the SaaS Admin, `is_global = 0` | **Cloned** into the tenant — a copy stamped `created_by = URDD-B′`. | It is visible *only* to the system tenant by default, so each hotel needs its own **editable** copy. |

> `is_global` is **a data marker only** — the tenancy filter does **not** consult it. Under the strict primary predicate, SaaS-Admin-authored rows are *not* visible to other tenants through the resolver; tenants see RBAC dimensions through their own **per-tenant mirrors**, not the system originals.

This is the distinction that drives the whole [per-tenant-cloning](../per-tenant-cloning/per-tenant-cloning.md) guide: **share the global, clone the operational.**

---

## 6. Persona codes (current vocabulary)

> **Re-modelled 2026-06-09.** Designation/department codes changed and are now **NON-UNIQUE** — a code no longer identifies one persona on its own. **Always disambiguate by `role`.** The single source of truth is `Src/HelperFunctions/PayloadFunctions/Governance/personaCodes.js` — check it before hard-coding any code.

| Persona | `designation_code` | role | department |
|---|---|---|---|
| SaaS Admin | `SYSTEM` | `Admin` | `HMS` |
| Platform owner | `SYSTEM` | `system` | `system` |
| Tenant Manager | `TENANT` | `Manager` | `GENERAL` / `TENANT_<code>` |
| Tenant Admin | `TENANT` | `Admin` | `GENERAL` / `TENANT_<code>` |
| Service Manager | `<category code>` (`STAY`, `DINE`, `SPA`, `BARB`, `GYM`, `KIDS`, `TRANS`, `NET`, `RMSVC`) | `Manager` | `TENANT_<code>` (hotel) |
| Guest | `STANDARD` | `Guest` | `GENERAL` (global) / `<Tenant>` (per tenant) |

Notice `SYSTEM` appears twice (SaaS Admin vs platform owner) and `TENANT` appears twice (Manager vs Admin). That is why **role is mandatory** for disambiguation — e.g. `getSystemTenantId()` resolves the SaaS Admin specifically as *designation `SYSTEM` **and** role `Admin`*.

### 6.1 What the re-model changed

| Old | New | Note |
|---|---|---|
| `SYSADMIN` designation | `SYSTEM` (role `Admin`) | Rename; now shares its code with the platform-owner tier — disambiguate by role. |
| `TMGR` + `TADMIN` (two designations) | one `TENANT` designation | Folded into one; **Manager vs Admin role** distinguishes Tenant Manager from Tenant Admin. |
| `GUEST` designation | `STANDARD` | Guest persona consolidated into one `Guest / STANDARD / GENERAL` RDD, cloned per tenant. |
| single `SVCMGR` designation | **one designation per service category** | **Dimension inversion** — see below. |
| depts `HMSSYS` → `HMS`, `TENANTS` → `GENERAL` | rename | |
| Service Manager dept `DEPT_<category>` | hotel dept `TENANT_<code>` | The category moved off the department onto the designation. |

> **The Service-Manager dimension inverted — the most important code change to understand.** Previously **service category = department** (`DEPT_STAY`, …) and a Service Manager's category was read from its *department*. Now **service category = designation** and the SM's **department is the hotel** (`TENANT_<code>`). Any code that scoped a Service Manager by department must now read the **designation** instead. The query resolver already does this (§7).

The **platform-owner tier** (role `system`, RDDs 593/594) sits outside the governance re-model and is kept exactly as-is.

---

## 7. Putting it together — a request, end to end

To see how the pieces interact, trace one concrete request: **the Dining Service Manager at Hotel X opens the services list** (`GET /api/services`).

1. **Transport / decrypt.** The FE sends the request with the encrypted actor header. Middleware decrypts it; `decryptedPayload.actionPerformerURDD` = the SM's URDD (URDD-D for Dining at Hotel X).
2. **Permission check** (`permissionChecker`). Does this URDD hold `list_services` in URDP? If not → `E41`. If yes, the checker also computes `meta.created_by` (this URDD + subordinates).
3. **Tenant resolution.** The resolver reads the URDD's `tenant_id` → Hotel X. That's the scope tenant. (The SM is *not* a system actor, so any `target_tenant_id` it sends is ignored.)
4. **Tenancy filter** appended to the `SELECT services …`:
   `services.created_by IN (SELECT … WHERE tenant_id = <Hotel X>)`.
5. **Service-Manager category scope** added on top. Because the actor's **designation** is a category code (`DINE`), the resolver resolves it to Hotel X's local `service_categories.category_id` for Dining and adds `services.category_id = <that id>`. (Pre-re-model this came from the department; post-re-model it comes from the designation — §6.1.)
6. **Placeholders** substituted, query executed (with pagination if enabled).
7. **Result:** only Hotel X's Dining services — isolated by tenant (step 4) *and* narrowed to one category (step 5).

That request touched every concept on this page: the persona (an RDD/URDD), the permission check (URDP), tenant isolation (`created_by` filter), system-vs-tenant scope, and the designation-driven category scope from the re-model. The other guides zoom into the pieces:

- [config-keys.md](../config-keys/config-keys.md) — the configuration system a Tenant Admin operates.
- [config-keys-catalog.md](../config-keys/config-keys-catalog/config-keys-catalog.md) — the full inventory of config keys.
- [resource-assignments.md](../per-tenant-resource-assignment/resource-assignments.md) — how the Tenant Manager hands framework resources to a hotel.
- [per-tenant-cloning.md](../per-tenant-cloning/per-tenant-cloning.md) — exactly what gets copied into a tenant, and when.

---

## Database Tables Involved

| Table | Role |
|---|---|
| `roles`, `designations`, `departments` | The three persona dimensions. |
| `roles_designations_department` (RDD) | Persona templates. |
| `user_roles_designations_department` (URDD) | A user holding a persona in a tenant; the identity behind `actionPerformerURDD`; its `tenant_id` drives isolation. |
| `user_role_designation_permissions` (URDP) | The flat resolved permission list the runtime check reads. |
| `permission_groups`, `permission_groups_permissions`, `roles_designations_department_permissions` | The group route that populates URDP. |
| `permissions` | Atomic permission strings. |
| `tenants` | The hotels; tenancy-exempt reference data. |

Every governed table also carries a `created_by` column holding a **URDD id** — the basis of the tenancy filter (§4).

---

## Change Log

| Date | Change |
|---|---|
| 2026-06-10 | Initial documentation of the governance model and tenant isolation. |
| 2026-06-09 | Persona codes re-modelled — codes are now non-unique (disambiguate by role); the Service-Manager dimension inverted (category → designation, department → hotel). See §6. |
| 2026-06-05 | Tenant-Manager cross-tenant bypass removed — every actor is scoped to one tenant per request; system actors narrow via `target_tenant_id`. Primary-table tenancy predicate made strict. |

---

## Source references

| Topic | Source |
|---|---|
| RBAC tables & runtime check | `docs/system_context/07_rbac.md`; `Services/Middlewares/PermissionCheck/permissionChecker.js` |
| Request pipeline & stages | `docs/system_context/02_request_lifecycle_and_middleware.md` |
| Tenancy filter internals | `docs/system_context/13_query_resolver_and_tenancy.md`; `Services/Middlewares/QueryResolver/queryResolver.js` |
| Persona codes | `Src/HelperFunctions/PayloadFunctions/Governance/personaCodes.js` |
| Full governance strategy | `docs/strategies/superadmin_tenant_governance_strategy.md` |
