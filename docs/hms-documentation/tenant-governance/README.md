# Tenant Governance

How HMS turns a single backend into a multi-tenant SaaS: who is allowed to do what, how one database keeps many hotels isolated, how a framework-owned resource becomes a single hotel's editable copy, and how each hotel is configured.

This folder is the **new-developer onboarding path** for the governance/tenancy/config-key area. The guides are reader-facing: they explain the *why* and the *how*, with worked examples, not just API signatures.

---

## Start here (reading order)

If you're new, read in this order — each builds on the last:

1. **[Governance Model](./tenant-governance-model/governance-model.md)** — the foundation. The four tiers, the RBAC chain (RDD → URDD → URDP), how a request resolves its actor and tenant, and the one isolation rule. **Don't skip this** — everything else assumes it.
2. **[Per-Tenant Cloning](./per-tenant-cloning/per-tenant-cloning.md)** — what gets copied into a hotel and when (with real before/after rows). Makes the isolation rule concrete.
3. **[Resource Assignments](./per-tenant-resource-assignment/resource-assignments.md)** — the API a Tenant Manager uses to hand framework resources to a hotel (assign / revoke / propagate).
4. **[Config Keys](./config-keys/config-keys.md)** — the configuration system a Tenant Admin operates once a hotel has its resources.
5. **[Config Keys Catalog](./config-keys/config-keys-catalog/config-keys-catalog.md)** — the full inventory of every config key, for lookup.
6. **[Original-to-Clone Propagation](./original-to-clone-propagation/original-to-clone-propagation.md)** — how an edit to a global original is re-synced into its tenant clones (the engine behind `apply_on_all` and the `propagate` verb).
7. **[Tenant Lifecycle Cron](./tenant-lifecycle-cron/tenant-lifecycle-cron.md)** — what happens to a hotel when its trial/subscription runs out (or when it pays): the daily warn → grace → deactivate → reactivate job and the emails it sends.
8. **[Deferred Delete (Probation)](./deferred-delete-probation/deferred-delete-probation.md)** — what happens when you delete something other things still depend on: the `active → probation → inactive` lifecycle, how a delete is hidden but reversible, and the daily finalizer cron that tidies it up once the dependencies clear.
9. **[Permission Groups → Permissions Reference](./permission-groups-permissions/permission-groups-permissions.md)** — a lookup reference: exactly which permissions each governance permission group (`PG-FRAMEWORK`, `PG-TENANT-MGMT`, `PG-TENANT-ADMIN`, `PG-SERVICE-MGR`, `PG-STANDARD-GUEST`, `PG-BOOKING-MGR`) grants, with per-group counts and the per-tenant clone mapping.
10. **[Permission Descriptions](./permission-descriptions/permission-descriptions.md)** — how every permission gets its plain-language `permission_description` (shown in permission-picker UIs): the verb→phrase + resource-label convention, the live catalog counts, and the idempotent backfill migration.

---

## The model in one picture

```
SYSTEM TENANT (the platform itself)
  SaaS Admin        owns the framework — config keys, service categories, location types, reference data
  Tenant Manager    provisions hotels, assigns framework resources to them
        │ provisions / assigns
        ▼
TENANT X (a real hotel)
  Tenant Admin      runs one hotel — everything inside it
  Service Manager   runs one service category (Stay, Dining, …) inside one hotel
```

Four tiers, all built from the same RBAC primitives — a **persona = an RDD**, a **person joining a tenant = a URDD**. There is **no separate tenancy engine**: the tiers are seed data plus permission-group wiring.

| Tier | role / designation / department | Owns |
|---|---|---|
| **SaaS Admin** | Admin / `SYSTEM` / `HMS` | The framework: config keys (+ values), service categories, location types, reference data. |
| **Tenant Manager** | Manager / `TENANT` / `GENERAL` | All non-framework CRUDs; creates hotels + their admins; **assigns** framework resources to a hotel. *(A second hat worn by the SaaS Admin user.)* |
| **Tenant Admin** | Admin / `TENANT` / `<Hotel>` | Everything inside one hotel. |
| **Service Manager** | Manager / `<category>` / `<Hotel>` | Every service under one service category of one hotel. |

---

## The one rule everything follows

HMS isolates tenants with a single query-time filter:

```sql
WHERE <table>.created_by IN (
  SELECT user_role_designation_department_id
  FROM user_roles_designations_department
  WHERE tenant_id = <acting tenant>
)
```

A row is visible to hotel **X** **iff** its `created_by` is a URDD that belongs to X. SaaS-global rows are owned by the system tenant, so they're invisible to X by default. **Cloning is how a global row enters a hotel's ownership:** copy the row, stamp `created_by` with the hotel's per-tenant Tenant-Manager URDD (URDD-B′), and the same filter exposes it — zero framework change.

That single idea — *ownership by `created_by`, made tenant-visible by cloning* — is what every guide here elaborates. If you understand this paragraph, you understand the spine of the system.

---

## Glossary

| Term | Meaning |
|---|---|
| **Tenant** | A hotel. One backend serves many; each is isolated. |
| **RDD** | `roles_designations_department` — a reusable persona template (one role + designation + department). |
| **URDD** | `user_roles_designations_department` — a user assigned an RDD, scoped to a tenant. The identity behind `actionPerformerURDD`. |
| **URDP** | `user_role_designation_permissions` — the flat, resolved permission list of a URDD; what the runtime check reads. |
| **URDD-B′** | The Tenant Manager's **per-tenant** URDD. Every resource cloned/assigned into a hotel is `created_by` this URDD. |
| **System tenant** | The tenant that owns the framework. Identified by convention (the tenant of bootstrap URDD 1), not a flag column. |
| **Clone** | A per-tenant copy of a global row, owned by URDD-B′. Source-tracked (with lineage) or simple (no lineage). |
| **Assign / Revoke / Propagate** | Hand a resource to a hotel / take it back / re-sync an edited original into clones. |

> **Persona codes were re-modelled on 2026-06-09.** Codes are now NON-UNIQUE — **always disambiguate by `role`**. The current vocabulary is used throughout; the old→new mapping is in [governance-model.md §6](./tenant-governance-model/governance-model.md#6-persona-codes-current-vocabulary).

---

## The guides

| Guide | Covers |
|---|---|
| [governance-model.md](./tenant-governance-model/governance-model.md) | The four tiers, the RBAC chain, how a request resolves actor + tenant, tenant isolation (primary vs joined, exempt tables, system-actor narrowing), persona codes, and an end-to-end request trace. |
| [per-tenant-cloning.md](./per-tenant-cloning/per-tenant-cloning.md) | What gets cloned into a hotel and when — the three triggers, share-vs-clone, id remapping, with before/after rows and a full onboarding trace. |
| [resource-assignments.md](./per-tenant-resource-assignment/resource-assignments.md) | The assign / revoke / propagate API — verbs, payloads, the two clone paths, bulk, dependency guards, permissions, worked examples. |
| [config-keys.md](./config-keys/config-keys.md) | The configuration system (`hms_config_keys`, `enabled_for`, `possible_values`) and the dual-mode CRUD that manages it, with a full end-to-end example. |
| [config-keys-catalog.md](./config-keys/config-keys-catalog/config-keys-catalog.md) | The full inventory of system-tenant config keys, grouped by admin-UI category — every active key's scope, value type, and meaning. Includes the read-only **Catalog API** (`GET /api/hms_config_keys_catalog`, dual-locale List + View). |
| [original-to-clone-propagation.md](./original-to-clone-propagation/original-to-clone-propagation.md) | The `propagateAssignmentUpdates` engine — how an edited global original is re-synced into its clones (merge rules, edit-detection, conflicts left as-is, best-effort/notification). Shared by `apply_on_all` (config-keys) and the `propagate` verb (assignments). |
| [tenant-lifecycle-cron.md](./tenant-lifecycle-cron/tenant-lifecycle-cron.md) | The daily trial/subscription wind-down job — warn → grace window → deactivate (soft `status='inactive'`), plus reactivation of still-valid hotels. Grace lengths, Tenant-Admin emails, renewal behaviour, and a full worked run. |
| [permission-groups-permissions.md](./permission-groups-permissions/permission-groups-permissions.md) | Reference: every permission assigned to each governance permission group (active mappings only), per-group totals, the global originals in full, and the per-tenant clone id ranges that mirror them. Generated from `permission_groups` / `permission_groups_permissions` / `permissions`. |
| [permission-descriptions.md](./permission-descriptions/permission-descriptions.md) | How each permission's plain-language `permission_description` is composed (verb→phrase + resource label), the live catalog counts, and the idempotent backfill migration. The `import_*` family is gated on `add_`/create and worded "Upload (import) …". |

---

## Change Log

| Date | Change |
|---|---|
| 2026-07-03 | [resource-assignments.md](./per-tenant-resource-assignment/resource-assignments.md) + [deferred-delete-probation.md](./deferred-delete-probation/deferred-delete-probation.md): revoke is deferred-delete (**probation**, 200 with `deferred/status_set/dependents` — not a 409 block); re-assigning a `probation` clone is **rejected (409)**; **restore** is a new grouped-CRUD verb — `PUT { resource_type, clone_id, status:"active" }` (cross-tenant, status-only, same actor as revoke). |
| 2026-06-30 | Added [permission-descriptions.md](./permission-descriptions/permission-descriptions.md) — the plain-language permission-description convention + backfill. Regenerated [permission-groups-permissions.md](./permission-groups-permissions/permission-groups-permissions.md) from `hms_db_10.0` (current totals, `import_*` family gated on `add_`/create, legacy/test groups dropped). |
| 2026-06-17 | Added [permission-groups-permissions.md](./permission-groups-permissions/permission-groups-permissions.md) — the per-group permission reference (governance originals + per-tenant clones), generated from the live `permission_groups_permissions` join. |
| 2026-06-12 | Added [original-to-clone-propagation.md](./original-to-clone-propagation/original-to-clone-propagation.md) (the shared re-sync engine); updated config-keys / resource-assignments to drop the obsolete `needs_review` flag — edited clones are now left as-is and reported as conflicts. |
| 2026-06-10 | Initial tenant-governance documentation set; guides reshaped onto the `guest-apis` doc template (Authentication / Request Payload / Response / Database Changes / Change Log). |
