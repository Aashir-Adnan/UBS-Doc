# Per-Tenant Cloning

This is the "what actually gets copied into a hotel, and when" reference. Every other governance behaviour is a consequence of the one rule below, so if any of the other guides felt abstract, this page makes it concrete with real before/after rows.

> **Prerequisite:** [governance-model.md](../tenant-governance-model/governance-model.md) §4–§5 (the `created_by` isolation rule and share-vs-clone). This page assumes them.

---

## 1. Why cloning exists at all

HMS isolates tenants with a single query-time filter:

```sql
WHERE <table>.created_by IN (
  SELECT user_role_designation_department_id
  FROM user_roles_designations_department
  WHERE tenant_id = <acting tenant>
)
```

A row is visible to tenant **X** **iff** its `created_by` is a URDD belonging to X. A SaaS-global row is owned by the *system* tenant, so X cannot see it. There are only two ways to make a row usable by X:

1. **Share it** — if it's platform-global reference data (`is_global=1` / `tenant_id NULL`), the filter's exempt/NULL-tolerant branch already exposes it to everyone. No copy needed.
2. **Clone it** — copy the row and stamp `created_by = URDD-B′` (the Tenant Manager's per-tenant URDD inside X). Now the *same* filter exposes the copy to X.

**Cloning is option 2.** It's how an *operational* global row (something each hotel must be able to edit independently) becomes a hotel's own editable copy — with zero framework change.

### Before / after — what a clone actually looks like

Take config key `67` (`base_price`), owned by the system tenant, assigned to Hotel 12 (whose URDD-B′ is, say, `880`):

```
ORIGINAL (system tenant)                    CLONE (Hotel 12)
hms_config_keys.config_key_id = 67          config_key_id = 412
  tenant_id                = "all"            tenant_id                = [12]
  created_by               = 1  (SaaS Admin)  created_by               = 880 (URDD-B′)
  source_hms_config_key_id = NULL             source_hms_config_key_id = 67   ← lineage link
  applies_to               = "*"              applies_to               = "*"
  enabled_for              = {"1":1,"2":1}    enabled_for              = {"31":1,"32":1}  ← remapped to Hotel 12's category ids
```

The clone is a near-copy with three differences that matter: it's **owned by Hotel 12's URDD** (so the filter shows it), it **remembers its origin** via `source_hms_config_key_id` (so `propagate` can re-sync it), and its category references are **remapped to Hotel 12's own category ids**.

### Two clone classes

| Class | Types | Lineage | Re-syncable? |
|---|---|---|---|
| **Source-tracked deep clone** | `config_key`, `service_category` | `source_*_id` column points to the global original | **Yes** — `propagate` can diff & re-sync |
| **Simple clone** | `location_type` | none — tenancy is only `created_by = URDD-B′` | No |

> Clones do **not** auto-update when the SaaS Admin edits the original. [Propagate](../per-tenant-resource-assignment/resource-assignments.md#8-propagate--re-sync-an-updated-original) is the explicit, diff-and-flag re-sync.

---

## 2. The three triggers — when cloning happens

Cloning is triggered by three **distinct, separate** events. The most common newcomer misconception is that provisioning a hotel gives it everything — it does not. Provisioning gives an *empty hotel with an org chart*; the actual resources arrive only when explicitly assigned.

| # | Trigger | Driven by | What it clones |
|---|---|---|---|
| **A** | **Tenant is provisioned** (or an admin is assigned to a pre-existing tenant) | `TenantProvisioningGroupedCrud` / `TenantsGroupedCrud` | The **RBAC scaffold** — the org chart (§2.1). |
| **B** | **A framework resource is assigned** to the tenant | [Resource Assignments](../per-tenant-resource-assignment/resource-assignments.md) | The **resource itself** — service categories (+ their cascaded config keys & value tables + the eager Service-Manager RDD), scenario configs, location types, translations. **Config keys are not picked individually — they cascade from their service category.** |
| **C** | **A Service Manager is provisioned** | `ServiceManagerProvisioning` | A per-tenant Service-Manager RDD (`Manager` / `<category>` / the tenant's staff dept; lazy — dedups onto the eager one from B) + the SM user + URDD-D. |

> **A and B are different events.** A new hotel after trigger A has staff personas but **zero** config keys, service categories, or location types. They appear one at a time as the Tenant Manager runs trigger B.

### 2.1 Trigger A — the RBAC scaffold

When a hotel is provisioned, it gets an org chart but no resources:

- **URDD-B′** — the Tenant Manager's per-tenant URDD. *The owner of everything later assigned* — this is the linchpin.
- The per-tenant **Tenant-Manager RDD** (`TENANT` + `Manager`).
- The single **staff department**, named after the tenant (created by `resolveTenantManagerUrdd` — **not** mirrored; **one department per tenant**, no `TENANT_` prefix).
- The mirrored **org dictionary** — roles and designations (`mirrorRbacDimensionsForTenant`; designations exclude `SYSTEM`/`TENANT`/`DEVELOPER`). Departments are **not** mirrored.
- The tenant-scoped **persona permission-group clones** (Tenant-Admin, Service-Manager, Standard-Guest groups).
- The **Tenant-Admin RDD** + the admin user + **URDD-C**.

> **Per-tenant seniority chain (2026-06-16).** Each tenant's **Tenant-Admin RDD** now reports up
> (`senior_rdd_id`) to that same tenant's **Tenant-Manager RDD** (URDD-B′'s RDD) — previously the
> cloned RDDs pointed at the global SaaS-Admin RDD, leaving the Tenant Manager and Tenant Admin as
> siblings. The intended per-tenant chain is **`TENANT+Manager → TENANT+Admin → <category> Managers`**.
> This is what lets the RDD role-picker compute each RDD's juniors correctly (a senior's juniors become
> non-selectable once it's chosen). Fixed for existing tenants by a backfill migration; paired by
> `tenant_id`, idempotent.

---

## 3. How the system decides what's "a default to clone"

There is **no `is_default` / `is_template` flag** anywhere. Eligibility is computed at runtime from **ownership + scope**, with two different regimes depending on the trigger.

### 3.1 Anchors resolved first

Both regimes start by resolving two anchors:

| Anchor | How it's resolved | Code |
|---|---|---|
| **System tenant** | the `tenant_id` of bootstrap URDD 1 (the SaaS-Admin URDD). Cached. Convention by ownership — there is no marker column. | `getSystemTenantId.js` |
| **SaaS-Admin URDD** | the active URDD whose RDD is `designation_code = 'SYSTEM'` **and** `role = 'Admin'` (role disambiguates the SaaS Admin from the platform-owner tier, which shares the `SYSTEM` designation). | `personaCodes.js` |

### 3.2 Regime 1 — the RBAC mirror (Trigger A): a *swept* predicate

`mirrorRbacDimensionsForTenant` finds the rows to clone with **one predicate per dimension table** (`roles`, `departments`, `designations`, and the operational `permission_groups`):

```sql
WHERE tenant_id = <systemTenantId>   -- the system tenant's own rows…
  AND created_by = <saasAdminUrdd>   -- …owned by the SaaS Admin…
  AND status    = 'active'           -- …and live
  -- and is_global = 0 for permission_groups (operational, not a persona group)
```

That predicate **is** the definition of "a default to clone." The `created_by = saasAdminUrdd` clause is load-bearing — a migration stamped that owner onto every previously-NULL system-tenant row, so SaaS-Admin ownership is now the sole, reliable identification basis.

### 3.3 Default (clone) vs global (share) — the key distinction

| Row scope | Identified by | Cloned? | Why |
|---|---|:---:|---|
| **System-tenant operational** | system tenant + `created_by = saasAdminUrdd` + active (`is_global=0`) | **Yes** | Visible only to the system tenant → the new tenant needs its own editable copy. |
| **Platform-global** | `tenant_id IS NULL` (`is_global=1`) | **No** | Already exposed to every tenant via the filter's `created_by IS NULL` branch. Cloning would duplicate it in pickers (one global + one clone). |
| **Governance persona** | persona designation codes; dept `HMS`; the `PG-*` groups | **Not by the sweep** | Persona roles/designations/depts/RDDs are reproduced only by the dedicated clone helpers, never by the dimension sweep. *(Exception: the three tenant-scoped persona permission groups ARE cloned — by their own helper, not the sweep.)* |

> **Global template RDDs are "anchored" to the system tenant (2026-06-16).** The dedicated clone helpers (URDD-B′ resolve, Tenant-Admin / Guest / Service-Manager RDD clones) resolve the **global template RDD** they copy from. Those templates originally lived at `tenant_id IS NULL`; an "anchor" migration re-homed them onto the **system tenant**. Since `roles_designations_department` has no `is_global` column, the helpers now resolve them via the shared `globalRddScope('rdd')` predicate (`tenant_id IS NULL OR tenant_id = <system tenant>`), tolerant of both pre- and post-anchor states. (Operational dimension rows still carry `is_global`, so the §3.2 sweep — which keys on `tenant_id = systemTenantId AND created_by = saasAdminUrdd` — was unaffected.)

### 3.4 ID remapping during a clone

When a sweep clones a batch of rows, it builds an **old→new id map**. Self-referential columns (`senior_role_id`, `senior_designation_id`, `parent_category_id`) and FK columns (a group's `role_id` / `designation_id`) are **rewritten through that map**. If a referenced row was *not* mirrored (it was global, or excluded), the column is **kept verbatim only if it still points at a valid global row, otherwise set NULL** — never left pointing across a tenant boundary. This is why a clone's category references match the *tenant's* ids, not the system tenant's (see the before/after in §1).

### 3.5 Regime 2 — Phase-8 assignment (Trigger B): an *explicitly picked* source

Framework resources are **not** swept automatically. The Tenant Manager **picks** a `source_id` (a service category, scenario config, or location type) and the system validates it is a genuine SaaS-global original (not already a clone) before deep-cloning it. **Config keys are the exception:** they are not picked individually — assigning a `service_category` cascade-clones every SaaS-global key whose `applies_to` includes that category (or is `*`), **plus the package-only keys** (`applies_to = ["package"]`, which ride on owning any category), and revoking the category cascade-revokes the keys it orphans (package-only keys drop only when the **last** category is revoked). See [resource-assignments.md](../per-tenant-resource-assignment/resource-assignments.md#63-side-effects--assigning-a-service_category).

---

## 4. Quick reference — what's cloned at each trigger

| Resource | A (provision) | B (assign) | C (provision SM) |
|---|:---:|:---:|:---:|
| URDD-B′, Tenant-Manager RDD | ✓ | | |
| Mirrored roles / depts / designations / RDDs | ✓ | | |
| Persona permission-group clones | ✓ | | |
| Tenant-Admin RDD + admin user + URDD-C | ✓ | | |
| `service_category` (+ eager Service-Manager RDD) | | ✓ | |
| `config_key` (+ value tables) | | (cascaded, via `service_category` assign) | |
| `location_type` | | ✓ | |
| Service-Manager RDD + SM user + URDD-D | | (RDD eagerly, via category assign) | ✓ (dedups onto B's RDD) |

> **Shared, never cloned:** currencies, regions, countries, supported payment methods, and framework lookups (`hms_config_categories`, `hms_scope_types`, `catalog`, …) are tenancy-exempt reference data shared with every tenant. (See the exempt-tables list in [governance-model.md](../tenant-governance-model/governance-model.md#45-exempt-tables-shared-reference-data).)

---

## 5. A worked trace — onboarding Hotel 12 from empty to running

To see the triggers in sequence:

1. **Provision Hotel 12** (Trigger A). The hotel now exists with: URDD-B′ (owner), a Tenant-Manager RDD, a mirrored org dictionary, persona permission-group clones, a Tenant-Admin RDD + admin user + URDD-C. **No config keys, no categories yet.**
2. **Assign the Stay `service_category`** (Trigger B). Three things happen in one transaction: (a) the category is deep-cloned into Hotel 12 (new local id, owned by URDD-B′); (b) **every SaaS-global config key that applies to Stay** (e.g. `base_price`) is cascade-cloned — each to a new clone id (say `412`), its `applies_to`/`enabled_for` pruned/remapped to Hotel 12's owned categories, its possible-values cloned for Stay and `possible_values` rebuilt; (c) the Stay Service-Manager RDD is eagerly cloned (`Manager`/`STAY`/the tenant's staff dept). Now Stay, its config keys, and "Stay Manager" all appear in pickers even though no one holds the persona yet.
3. **(No separate config-key step.)** Config keys arrive *with* their category in step 2 — there is no individual `config_key` assign. The **package-only** keys (`applies_to = ["package"]`) are cloned here too, alongside this first category. Assigning another category later cascade-clones *its* keys too (and back-fills any key shared with Stay), so the order categories are assigned never matters.
4. **Provision a Stay Service Manager** (Trigger C). The SM user is created with URDD-D; the per-tenant Stay Service-Manager RDD **dedups onto the eager one** from step 2 rather than creating a duplicate.

Hotel 12 is now a running hotel — and every row it owns traces back to a system original via either a mirror (step 1) or a `source_*_id` lineage link (steps 2–3).

---

## Database Tables Involved

| Table | Cloned at | Lineage column |
|---|---|---|
| `roles`, `designations`, `roles_designations_department` | A (RBAC mirror; designations exclude `SYSTEM`/`TENANT`/`DEVELOPER`) | — (id-remapped) |
| `departments` (one **staff** dept per tenant, named after the tenant) | A — created by `resolveTenantManagerUrdd`, **not** mirrored | — (`tenant_id`) |
| `permission_groups` (operational + persona groups) | A | — (id-remapped) |
| `user_roles_designations_department` | A (URDD-B′, URDD-C), C (URDD-D) | — |
| `hms_config_keys` (+ `hms_config` / `hms_config_possible_values`) | B (`config_key`) | `source_hms_config_key_id` |
| `service_categories` | B (`service_category`) | `source_service_category_id` |
| `location_type` | B (`location_type`) | — (simple clone) |

Every cloned row is stamped `created_by = URDD-B′`. **Never cloned** (shared): `currencies`, `regions`, `countries`, `supported_payment_methods`, `hms_config_categories`, `hms_scope_types`, `catalog`.

---

## Change Log

| Date | Change |
|---|---|
| 2026-06-18 | **One department per tenant** — org-chart departments are no longer mirrored; each tenant has a single **staff department** named after the tenant (no `TENANT_` prefix), resolved via `resolveTenantStaffDepartmentId` (the Tenant-Manager RDD's department). The `DEVELOPER` designation is also excluded from the designation mirror. |
| 2026-06-16 | Global template RDDs **anchored** to the system tenant — clone helpers resolve them via `globalRddScope` (§3.3). Per-tenant **seniority chain** fixed: Tenant-Admin RDD reports to the tenant's Tenant-Manager RDD (`TENANT+Manager → TENANT+Admin → service managers`, §2.1). |
| 2026-06-10 | Initial documentation of the per-tenant cloning model and the three triggers. |
| 2026-06-09 | Service-category clones now carry an eager Service-Manager RDD on the tenant's hotel department; category lives on the designation post re-model. |
| 2026-06-05 | SaaS-Admin `created_by` back-filled onto system RBAC rows, making ownership the sole basis for the RBAC-mirror sweep; shared reference-data clones deactivated. |

---

## Source references

| Topic | Source |
|---|---|
| Cloning facts distilled | `docs/strategies/per_tenant_cloning_reference.md` |
| Governance strategy (§8 assignment, §14 resolutions) | `docs/strategies/superadmin_tenant_governance_strategy.md` |
| Config-key clone correctness (`applies_to`/`possible_values`/`enabled_for`) | `docs/strategies/tenant_config_value_sync_strategy.md` |
| RBAC mirror | `Src/HelperFunctions/PayloadFunctions/Governance/mirrorRbacDimensionsForTenant.js` |
| Assign/revoke/propagate | [resource-assignments.md](../per-tenant-resource-assignment/resource-assignments.md) |
