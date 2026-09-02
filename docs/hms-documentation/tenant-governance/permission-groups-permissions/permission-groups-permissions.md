# Permission Groups → Permissions Reference

> **Source:** live `hms_db_1.9` database (regenerated 2026-06-11 from the live tables — reflects all migrations applied to date, including the persona re-model `20260609_2`/`20260609_3`, the per-tenant persona-group cloning, and the `20260611_4` Service-Manager config-catalog grants).
> **Update 2026-06-16 (RDD-write governance):** `20260616_1` revoked **`add_roles_designations_department`** + **`update_roles_designations_department`** from `PG-TENANT-MGMT` and `PG-TENANT-ADMIN`; `20260616_2` then **re-granted only `update_roles_designations_department`** (edit). Net: both personas keep **edit** but lose **create** of staff role assignments (RDDs). The look-alike `*_roles_designations_department_permissions` perms are untouched. Counts/listings below reflect this net state.
> **Generated from:** `permission_groups`, `permission_groups_permissions`, and `permissions` tables (active mappings + active permissions only).
> **Update 2026-06-16 (URDP materialization fix):** assigning a permission group to a user (URDD) now fans out **only the group's ACTIVE mappings** into `user_role_designation_permissions`. The user-grouped-CRUD fan-out (`CustomUsersGroupedCrud/syncUserRddSet.js` → `syncUrdps`) previously selected `permission_groups_permissions` **without** a `status='active'` filter, so a user assigned e.g. `PG-TENANT-MGMT` inherited every permission the group **ever** had — including the **revoked (inactive)** ones — and got `count(all mappings)` URDP instead of `count(active)`. Net: a newly assigned/updated user's active URDP now equals the **active** counts listed here (e.g. `PG-TENANT-MGMT` → its active total, not the active+inactive total). Pre-existing URDDs created before this fix may still carry stale (revoked) perms until re-materialized.
> **Update 2026-06-17 (staging↔local governance sync — regenerated from `hms_db_10.0`):** the counts and listings below now reflect the canonical dev DB `hms_db_10.0`. Migrations `20260617_4` (group matrix) + `20260617_5` (URDP materialization) bring dev/staging into line with it across the global originals **and** every per-tenant clone. Net governance changes vs. the prior `1.9` snapshot: the **`*_admin_code`** family (9 perms, tenant tier) is now granted to `PG-FRAMEWORK`, `PG-TENANT-MGMT`, `PG-TENANT-ADMIN`; **`update_users`** added to `PG-SERVICE-MGR`; `PG-TENANT-ADMIN` drops the `guest_booking_history` family; the system / QR-scan / user-device / user-activity log families stay **`PG-FRAMEWORK`-exclusive** (any dev drift onto the tenant personas is revoked). `PG-SERVICE-MGR` also reflects the booking-read grant / `booking_services`-write revoke already present in `hms_db_10.0`. New totals: `PG-FRAMEWORK` 246, `PG-TENANT-MGMT` 463, `PG-TENANT-ADMIN` 470, `PG-SERVICE-MGR` 159, `PG-STANDARD-GUEST` 0.
> **Update 2026-06-18 (Tenant-Admin permission-governance grant):** `20260618_1` grants `PG-TENANT-ADMIN` the full permission-governance set — `*_permission_groups` (5), `*_permission_groups_permissions` (5), and the `permissions` reads `view_permissions` + `list_permissions` — across the global original and every clone, and materializes the same onto every active Tenant-Admin URDD. Net new vs. the prior state was just **`view_permissions`** (the other 11 were already granted); `PG-TENANT-ADMIN` total `470 → 471` (tenant tier `336 → 337`).
> **Update 2026-06-22 (Booking Manager persona):** migration `20260622_3` adds a new persona **Booking Manager** (designation `BOOKING` + role `Manager`, RDD title "Manager of Bookings", per-tenant senior = the Tenant-Admin RDD) with a new permission group **`PG-BOOKING-MGR`** (global original + a per-tenant clone for every active tenant). It also creates the new permission **`booking_manager_dashboard`**. `PG-BOOKING-MGR` = **34** perms: full CRUD on `bookings` + `booking_services` (9 actions each) + `privacy_policy` + `account`; read-only (`view`/`list`) on `services` / `packages` / `package_services` / `service_categories` / `users` / `guest_profiles`; plus `dashboard` + `booking_manager_dashboard`. (Tenants without a Tenant-Admin RDD are skipped until one exists — see the migration note.)
> **Update 2026-06-29 (`import_*` permission family — gated on `add_`/create):** migration `20260629_2_add_import_permissions_mirroring_add_create` makes the `import_<resource>` family track the **CREATE** permission `add_<resource>`, **not** `export_`. Importing data creates records, so a group/user gets `import_X` **iff** it holds `add_X`; a read-only role that can `export_` but not `add_` does **not** get `import_`. Catalog: an `import_<resource>` for every active `add_<resource>` (**81** perms — the 80 CRUD resources **plus `frontpage_data`**, which has `add_` but no `export_`). The migration **grants** `import_X` to every group (global + every per-tenant clone) holding active `add_X`, **revokes** any `import_X` on a group lacking `add_X` (superseding an earlier export-based revision), and **materializes** the same into `user_role_designation_permissions` for existing users (so `permissionChecker` honours it now, not only for new assignees). Per-persona `import_*` counts (= that persona's active `add_*`): `PG-FRAMEWORK` **+28**, `PG-TENANT-MGMT` **+49**, `PG-TENANT-ADMIN` **+50**, `PG-SERVICE-MGR` **+13**, `PG-BOOKING-MGR` **+2** (`PG-STANDARD-GUEST` unchanged). For each `add_*` a group holds, read in the matching `import_*` (same tier/category); `import_*` descriptions read "Upload (import) …" (bespoke `import_admin_code` = "Import admin codes").
> **Update 2026-07-01 (config-management revoke + Service-Manager booking scope):** migration `20260701_1` makes three changes at BOTH the group and URDP layers (matched by `group_name` / signature perm — global originals + every clone): **(1)** revokes the 3 config-management perms `manage_config_key_category_flags` / `manage_config_key_user_visibility` / `manage_config_possible_values` from **every group except `PG-FRAMEWORK` and `PG-TENANT-MGMT`** (so `PG-TENANT-ADMIN` and `PG-SERVICE-MGR` lose them); **(2)** grants **`PG-SERVICE-MGR`** the booking / service-operations management set — `add/delete/update/import_bookings`, `add/delete/update/import_booking_services`, `list/view_guest_profiles`, `list/view_users` (12 net-new; the read verbs + services/packages reads already existed); **(3)** revokes the package-write perms `add/update/delete_packages` + `add/update/delete_package_services` from `PG-SERVICE-MGR` (a Service Manager may read packages, not author them); **(4)** revokes **`update_users`** from `PG-SERVICE-MGR` (may read users, not edit); **(5)** revokes the `view/list/update/delete/import/export` verbs of `packages` / `package_services` / `package_pricing` from `PG-SERVICE-MGR` — and then **(6)** revokes the remaining `filter/search/sort` of those three + `add_package_pricing` too — so the Service-Manager persona ends with **no package/package_services/package_pricing permissions at all**. Net totals: `PG-TENANT-ADMIN` `521 → 518` (tenant `373 → 370`), `PG-SERVICE-MGR` `172 → 150` (tenant `10 → 14`, service `136 → 110`).
> **Update 2026-07-24 (`manage_checkin` / `manage_checkout` booking-ops perms — APPLIED):** migration `20260713_2_add_manage_checkin_checkout_perms_to_bookings_sm_bm_groups` creates two non-CRUD **tenant**-tier perms `manage_checkin` / `manage_checkout` (check guests in / out of their bookings) and grants them to **`PG-FN-BOOKINGS`**, **`PG-SERVICE-MGR`**, **`PG-BOOKING-MGR`** and **`PG-TENANT-ADMIN`** — the global originals **and every per-tenant clone** (clone-aware) — then materializes URDP onto every existing holder. `PG-FN-BOOKINGS` fans out via `rddp` (Model B); the persona groups materialize directly by their signature perms, and **`PG-TENANT-ADMIN` via BOTH** paths (`rddp` **and** `tenant_admin_dashboard`, `NOT EXISTS`-deduped) — on dev all **68/68** Tenant-Admin URDDs carry both. Net (+2 tenant each): `PG-TENANT-ADMIN` `522 → 524`, `PG-SERVICE-MGR` `160 → 162`, `PG-BOOKING-MGR` `46 → 48`, `PG-FN-BOOKINGS` `50 → 52`.
> **Update 2026-08-18 (`manage_tenants_manager` tenant-mgmt perm — PENDING, staged not applied):** migration `20260818_1_add_manage_tenants_manager_perm` creates a new non-CRUD **tenant_mgmt**-tier perm `manage_tenants_manager` ("Manage the Tenant-Manager assignments of tenants.") and grants it to **`PG-TENANT-MGMT` only** — the global, never-cloned Tenant-Manager governance group (no per-tenant clones) — then materializes URDP onto the **SYSTEM-tenant `TENANT`/`Manager` URDD legs** (the general / global Tenant-Manager persona), resolved by natural key. The Arabic `permission_description` is pre-seeded. Net (+1 tenant_mgmt): `PG-TENANT-MGMT` `512 → 513` (tenant_mgmt `38 → 39`).
> **Context:** [governance-model.md](../tenant-governance-model/governance-model.md) (personas, the `created_by` isolation rule), [per-tenant-cloning.md](../per-tenant-cloning/per-tenant-cloning.md) (how per-tenant group clones are created), and [resource-assignments.md](../per-tenant-resource-assignment/resource-assignments.md). Backend design docs: `docs/strategies/superadmin_tenant_governance_strategy.md`, `docs/strategies/tenant_admin_assignment.md`, `docs/system_context/07_rbac.md`.

This document lists **every permission assigned to each governance permission group**, taken directly from the `permission_groups_permissions` join table. Permissions within a group are bucketed by their `permission_category` tier and sorted alphabetically. There are two families of groups:

- **Persona groups** (`PG-FRAMEWORK`, `PG-TENANT-MGMT`, `PG-TENANT-ADMIN`, `PG-SERVICE-MGR`, `PG-STANDARD-GUEST`, `PG-BOOKING-MGR`) — the full permission bundle a persona receives.
- **Functional groups** (`PG-FN-*`) — narrow, resource-scoped bundles (Model B) that compose into personas and roles.

## 0. Permissions catalog snapshot (`dev-restructure_hms_1.9`, 2026-09-02)

> **Update 2026-07-21 (`api_logs` + `hms_tenants_config` permission families):** three migrations add two new resources and grant them along strict tier lines. **(1) `api_logs` (FRAMEWORK tier, 5 perms).** `20260713_2` **Step 6** creates `list_api_logs` / `view_api_logs` / `delete_api_logs` / `export_api_logs` and grants them to **`PG-FRAMEWORK` only**; `20260720_3_add_api_logs_perms_to_pg_fn_logs` then creates the missing **`search_api_logs`** and grants the full five to **`PG-FRAMEWORK` (+1 net) AND the LOGS functional group `PG-FN-LOGS` (+5)** — mirroring the sibling `audit_logs` family, which both groups already hold. Neither group is cloned per tenant, so there are no clones to cover. These back the API Logs CRUD, which is gated on them. **(2) `hms_tenants_config` (TENANT tier, 4 perms).** `20260721_2_add_hms_tenants_config_perms_to_tenant_admin` creates `list_` / `view_` / `add_` / `delete_hms_tenants_config` and grants them to **`PG-TENANT-ADMIN` ONLY** — the global original **and every per-tenant clone** (clone-aware; dev: 1 global + 26 clones = 27 groups x 4 = 108 memberships). No other persona or functional group holds them. Note the deliberate tier split: the pre-existing `*_hms_config` family stays **`framework`** (the SaaS-Admin's platform-wide config catalogue), while `*_hms_tenants_config` is **`tenant`** — the hotel-facing counterpart a Tenant Admin owns. URDP materialization for `PG-TENANT-ADMIN` runs through **both** paths, since neither alone reaches every Tenant-Admin URDD: the `rddp` link (Model B) **and** the persona-direct path matched by the exclusive signature perm **`tenant_admin_dashboard`**; `PG-FN-LOGS` uses the `rddp` path, `PG-FRAMEWORK` the signature perm `saas_admin_dashboard`. All inserts are `NOT EXISTS`-guarded, so a holder reachable both ways is inserted once. Each migration also pre-seeds the Arabic `permission_description`.
>
> **Current governance totals (regenerated 2026-06-30 from `hms_db_10.0`, + `20260709_4`):** `PG-FRAMEWORK` 279, `PG-TENANT-MGMT` 513, `PG-TENANT-ADMIN` 518, `PG-SERVICE-MGR` **160**, `PG-STANDARD-GUEST` 0, `PG-BOOKING-MGR` **46** (pre-`20260713_2`; +2 each after the 2026-07-24 note above). Counts are active `permission_groups_permissions` rows with an active `permissions` row. The `import_*` family now mirrors `add_*` (create) — see the 2026-06-29 note above. Persona codes are the re-modelled `SYSTEM`/`TENANT`/`STANDARD` (role-disambiguated).

## 1. Permission groups overview

### 1.1 Persona governance groups (`is_global = 1`)

| `permission_group_id` | Group name | Status | Active permissions | Persona |
|---|---|---|---:|---|
| 9 | `PG-FRAMEWORK` | active | 279 | SaaS Admin (`SYSTEM` + `Admin`) |
| 10 | `PG-TENANT-MGMT` | active | 513 | Tenant Manager (`TENANT` + `Manager`) |
| 11 | `PG-TENANT-ADMIN` | active | 520 | Tenant Admin (`TENANT` + `Admin`) |
| 12 | `PG-SERVICE-MGR` | active | 162 | Service Manager (`<service-category>` designation, e.g. `STAY`) |
| 19 | `PG-STANDARD-GUEST` | active | 0 | Standard Guest (`STANDARD`) |
| 682 | `PG-BOOKING-MGR` | active | 48 | Booking Manager (`BOOKING` + `Manager`) |
| 13 | `PG-FRAMEWORK` | inactive | 0 | — (inactive duplicate) |
| 14 | `PG-TENANT-MGMT` | inactive | 0 | — (inactive duplicate) |
| 15 | `PG-TENANT-ADMIN` | inactive | 0 | — (inactive duplicate) |
| 16 | `PG-SERVICE-MGR` | inactive | 0 | — (inactive duplicate) |

### 1.2 Functional groups (`PG-FN-*`, `is_global = 1`)

Narrow resource bundles that compose into personas/roles. 36 active functional groups:

| `permission_group_id` | Group name | Active permissions |
|---|---|---:|
| 136 | `PG-FN-ADMIN-CODES` | 10 |
| 137 | `PG-FN-ATTACHMENTS` | 20 |
| 138 | `PG-FN-BOOKINGS` | 52 |
| 139 | `PG-FN-CHAT` | 30 |
| 140 | `PG-FN-CONFIG` | 15 |
| 141 | `PG-FN-CONFIG-ADMIN` | 35 |
| 142 | `PG-FN-CONFIG-MANAGE` | 4 |
| 143 | `PG-FN-DELIVERY-UNITS` | 20 |
| 144 | `PG-FN-DEPARTMENTS` | 10 |
| 145 | `PG-FN-DESIGNATIONS` | 10 |
| 146 | `PG-FN-DEVICE-OTP` | 10 |
| 147 | `PG-FN-FINANCE` | 20 |
| 148 | `PG-FN-FRONTPAGE` | 0 |
| 149 | `PG-FN-GUESTS` | 30 |
| 150 | `PG-FN-INVENTORY` | 20 |
| 151 | `PG-FN-LOCALIZATION` | 30 |
| 152 | `PG-FN-LOGS` | 55 |
| 153 | `PG-FN-NOTIFICATIONS` | 10 |
| 154 | `PG-FN-PACKAGES` | 30 |
| 155 | `PG-FN-PAYMENTS-CONFIG` | 30 |
| 156 | `PG-FN-PERMISSIONS-ADMIN` | 8 |
| 157 | `PG-FN-PLANS` | 20 |
| 158 | `PG-FN-PLATFORM` | 30 |
| 159 | `PG-FN-PRICING` | 20 |
| 160 | `PG-FN-QR` | 10 |
| 161 | `PG-FN-QR-SCANS` | 10 |
| 162 | `PG-FN-RBAC` | 64 |
| 163 | `PG-FN-ROLES` | 10 |
| 164 | `PG-FN-SERVICE-CATEGORIES` | 5 |
| 165 | `PG-FN-SERVICE-CATEGORIES-ADMIN` | 5 |
| 166 | `PG-FN-SERVICES` | 40 |
| 167 | `PG-FN-TASKS` | 90 |
| 168 | `PG-FN-TENANT-RESOURCE-ASSIGN` | 8 |
| 169 | `PG-FN-TENANTS` | 30 |
| 170 | `PG-FN-USER-TELEMETRY` | 30 |
| 171 | `PG-FN-USERS` | 10 |

### 1.3 Per-tenant cloned groups

Tenant onboarding clones a subset of groups per tenant (`tenant_id` set, `is_global = 0`). Each governance/functional clone **mirrors the permission set of its global original**. `PG-FRAMEWORK` and `PG-TENANT-MGMT` are **not** cloned (platform/system only). **5 tenants** currently hold per-tenant groups. Rows whose name is not `PG-*` (e.g. `Front Desk Staff`) are **custom tenant-authored** groups, not clones of a global original.

| Per-tenant group | # tenant rows | id range | Active permissions each |
|---|---:|---|---:|
| `Front Desk Staff` | 1 | 2 | 3 |
| `Housekeeping & Maintenance` | 1 | 3 | 3 |
| `Kids Center Manager` | 1 | 4 | 3 |
| `PG-BOOKING-MGR` | 4 | 1768–2020 | 61 |
| `PG-FN-ADMIN-CODES` | 4 | 1769–2021 | 10 |
| `PG-FN-ATTACHMENTS` | 4 | 1770–2022 | 20 |
| `PG-FN-BOOKINGS` | 4 | 1771–2023 | 52 |
| `PG-FN-CHAT` | 4 | 1772–2024 | 30 |
| `PG-FN-CONFIG` | 4 | 1773–2025 | 15 |
| `PG-FN-DELIVERY-UNITS` | 4 | 1774–2026 | 20 |
| `PG-FN-DEPARTMENTS` | 4 | 1775–2027 | 10 |
| `PG-FN-DESIGNATIONS` | 4 | 1776–2028 | 10 |
| `PG-FN-DEVICE-OTP` | 4 | 1777–2029 | 10 |
| `PG-FN-FINANCE` | 4 | 1778–2030 | 20 |
| `PG-FN-FRONTPAGE` | 4 | 1779–2031 | 0 |
| `PG-FN-GUESTS` | 4 | 1780–2032 | 30 |
| `PG-FN-INVENTORY` | 4 | 1781–2033 | 20 |
| `PG-FN-NOTIFICATIONS` | 4 | 1782–2034 | 10 |
| `PG-FN-PACKAGES` | 4 | 1783–2035 | 30 |
| `PG-FN-PLANS` | 4 | 1784–2036 | 20 |
| `PG-FN-PRICING` | 4 | 1785–2037 | 20 |
| `PG-FN-QR` | 4 | 1786–2038 | 10 |
| `PG-FN-RBAC` | 4 | 1787–2039 | 64 |
| `PG-FN-ROLES` | 4 | 1788–2040 | 10 |
| `PG-FN-SERVICE-CATEGORIES` | 4 | 1789–2041 | 5 |
| `PG-FN-SERVICES` | 4 | 1790–2042 | 40 |
| `PG-FN-TASKS` | 4 | 1791–2043 | 90 |
| `PG-FN-USERS` | 4 | 1792–2044 | 10 |
| `PG-SERVICE-MGR` | 4 | 1766–2018 | 166 |
| `PG-STANDARD-GUEST` | 4 | 1767–2019 | 0 |
| `PG-TENANT-ADMIN` | 4 | 1765–2017 | 505 |

### 1.4 Legacy / non-governance groups

Pre-existing or test groups outside the governance model (not personas; listed for completeness):

| `permission_group_id` | Group name | Status | Active permissions |
|---|---|---|---:|
| 1 | `Legacy_SuperAdmin` | inactive | 6 |
| 5 | `Test-ABC` | inactive | 4 |
| 6 | `TEST1-ABC123` | inactive | 4 |
| 7 | `Manager-22` | inactive | 3 |
| 8 | `Designation-Teacher fellow-24` | inactive | 2 |

## 2. Permissions per group

Per-tenant clones of a group carry the same set shown for its global original.

### 2.1 Persona groups

### Group 9 — `PG-FRAMEWORK`

- **Status:** `active`
- **Total active permissions:** 248

**By tier:** framework: 176, tenant: 72

<details>
<summary><b>framework</b> (176)</summary>

- `add_audit_logs`
- `add_crash_log`
- `add_email_log`
- `add_error_log`
- `add_hms_config`
- `add_hms_config_categories`
- `add_hms_config_keys`
- `add_hms_scenario_config`
- `add_hms_scope_types`
- `add_language_codes`
- `add_platforms`
- `add_platform_versions`
- `add_security_log`
- `add_service_categories`
- `add_templates`
- `add_translated_entries`
- `add_versions`
- `delete_api_logs`
- `delete_audit_logs`
- `delete_crash_log`
- `delete_email_log`
- `delete_error_log`
- `delete_hms_config`
- `delete_hms_config_categories`
- `delete_hms_config_keys`
- `delete_hms_scenario_config`
- `delete_hms_scope_types`
- `delete_language_codes`
- `delete_platforms`
- `delete_platform_versions`
- `delete_security_log`
- `delete_service_categories`
- `delete_templates`
- `delete_translated_entries`
- `delete_versions`
- `export_api_logs`
- `export_audit_logs`
- `export_crash_log`
- `export_email_log`
- `export_error_log`
- `export_hms_config`
- `export_hms_config_categories`
- `export_hms_config_keys`
- `export_hms_scenario_config`
- `export_hms_scope_types`
- `export_language_codes`
- `export_platforms`
- `export_platform_versions`
- `export_security_log`
- `export_service_categories`
- `export_templates`
- `export_translated_entries`
- `export_versions`
- `filter_audit_logs`
- `filter_crash_log`
- `filter_email_log`
- `filter_error_log`
- `filter_hms_config`
- `filter_hms_config_categories`
- `filter_hms_config_keys`
- `filter_hms_scenario_config`
- `filter_hms_scope_types`
- `filter_language_codes`
- `filter_platforms`
- `filter_platform_versions`
- `filter_security_log`
- `filter_service_categories`
- `filter_templates`
- `filter_translated_entries`
- `filter_versions`
- `import_audit_logs`
- `import_crash_log`
- `import_email_log`
- `import_error_log`
- `import_hms_config`
- `import_hms_config_categories`
- `import_hms_config_keys`
- `import_hms_scenario_config`
- `import_hms_scope_types`
- `import_language_codes`
- `import_platforms`
- `import_platform_versions`
- `import_security_log`
- `import_service_categories`
- `import_templates`
- `import_translated_entries`
- `import_versions`
- `list_api_logs`
- `list_audit_logs`
- `list_crash_log`
- `list_email_log`
- `list_error_log`
- `list_hms_config`
- `list_hms_config_categories`
- `list_hms_config_keys`
- `list_hms_scenario_config`
- `list_hms_scope_types`
- `list_language_codes`
- `list_platforms`
- `list_platform_versions`
- `list_security_log`
- `list_service_categories`
- `list_templates`
- `list_translated_entries`
- `list_versions`
- `saas_admin_dashboard`
- `search_api_logs`
- `search_audit_logs`
- `search_crash_log`
- `search_email_log`
- `search_error_log`
- `search_hms_config`
- `search_hms_config_categories`
- `search_hms_config_keys`
- `search_hms_scenario_config`
- `search_hms_scope_types`
- `search_language_codes`
- `search_platforms`
- `search_platform_versions`
- `search_security_log`
- `search_service_categories`
- `search_templates`
- `search_translated_entries`
- `search_versions`
- `sort_audit_logs`
- `sort_crash_log`
- `sort_email_log`
- `sort_error_log`
- `sort_hms_config`
- `sort_hms_config_categories`
- `sort_hms_config_keys`
- `sort_hms_scenario_config`
- `sort_hms_scope_types`
- `sort_language_codes`
- `sort_platforms`
- `sort_platform_versions`
- `sort_security_log`
- `sort_service_categories`
- `sort_templates`
- `sort_translated_entries`
- `sort_versions`
- `update_audit_logs`
- `update_crash_log`
- `update_email_log`
- `update_error_log`
- `update_hms_config`
- `update_hms_config_categories`
- `update_hms_config_keys`
- `update_hms_scenario_config`
- `update_hms_scope_types`
- `update_language_codes`
- `update_platforms`
- `update_platform_versions`
- `update_security_log`
- `update_service_categories`
- `update_templates`
- `update_translated_entries`
- `update_versions`
- `view_api_logs`
- `view_audit_logs`
- `view_crash_log`
- `view_email_log`
- `view_error_log`
- `view_hms_config`
- `view_hms_config_categories`
- `view_hms_config_keys`
- `view_hms_scenario_config`
- `view_hms_scope_types`
- `view_language_codes`
- `view_platforms`
- `view_platform_versions`
- `view_security_log`
- `view_service_categories`
- `view_templates`
- `view_translated_entries`
- `view_versions`

</details>

<details>
<summary><b>tenant</b> (72)</summary>

- `add_admin_code`
- `add_permissions`
- `add_permission_groups`
- `add_qr_scan_logs`
- `add_user_activity`
- `add_user_devices`
- `add_user_device_notifications`
- `delete_admin_code`
- `delete_permissions`
- `delete_permission_groups`
- `delete_qr_scan_logs`
- `delete_user_activity`
- `delete_user_devices`
- `delete_user_device_notifications`
- `export_admin_code`
- `export_permissions`
- `export_permission_groups`
- `export_qr_scan_logs`
- `export_user_activity`
- `export_user_devices`
- `export_user_device_notifications`
- `filter_admin_code`
- `filter_permissions`
- `filter_permission_groups`
- `filter_qr_scan_logs`
- `filter_user_activity`
- `filter_user_devices`
- `filter_user_device_notifications`
- `import_admin_code`
- `import_permissions`
- `import_permission_groups`
- `import_qr_scan_logs`
- `import_user_activity`
- `import_user_devices`
- `import_user_device_notifications`
- `list_admin_code`
- `list_permissions`
- `list_permission_groups`
- `list_qr_scan_logs`
- `list_user_activity`
- `list_user_devices`
- `list_user_device_notifications`
- `manage_config_key_category_flags`
- `manage_config_key_user_visibility`
- `search_admin_code`
- `search_permissions`
- `search_permission_groups`
- `search_qr_scan_logs`
- `search_user_activity`
- `search_user_devices`
- `search_user_device_notifications`
- `sort_admin_code`
- `sort_permissions`
- `sort_permission_groups`
- `sort_qr_scan_logs`
- `sort_user_activity`
- `sort_user_devices`
- `sort_user_device_notifications`
- `update_admin_code`
- `update_permissions`
- `update_permission_groups`
- `update_qr_scan_logs`
- `update_user_activity`
- `update_user_devices`
- `update_user_device_notifications`
- `view_admin_code`
- `view_permissions`
- `view_permission_groups`
- `view_qr_scan_logs`
- `view_user_activity`
- `view_user_devices`
- `view_user_device_notifications`

</details>

### Group 10 — `PG-TENANT-MGMT`

- **Status:** `active`
- **Total active permissions:** 513

**By tier:** framework: 8, tenant_mgmt: 39, tenant: 334, service: 126, common: 6

<details>
<summary><b>framework</b> (42)</summary>

- `add_currencies`
- `add_frontpage_data`
- `add_supported_payment_methods`
- `delete_currencies`
- `delete_frontpage_data`
- `delete_supported_payment_methods`
- `export_currencies`
- `export_supported_payment_methods`
- `filter_currencies`
- `filter_hms_config_categories`
- `filter_hms_config_keys`
- `filter_hms_scenario_config`
- `filter_service_categories`
- `filter_supported_payment_methods`
- `import_currencies`
- `import_frontpage_data`
- `import_supported_payment_methods`
- `list_currencies`
- `list_frontpage_data`
- `list_hms_config_categories`
- `list_hms_config_keys`
- `list_hms_scenario_config`
- `list_service_categories`
- `list_supported_payment_methods`
- `search_currencies`
- `search_hms_config_categories`
- `search_hms_config_keys`
- `search_hms_scenario_config`
- `search_service_categories`
- `search_supported_payment_methods`
- `sort_currencies`
- `sort_supported_payment_methods`
- `update_currencies`
- `update_frontpage_data`
- `update_supported_payment_methods`
- `view_currencies`
- `view_frontpage_data`
- `view_hms_config_categories`
- `view_hms_config_keys`
- `view_hms_scenario_config`
- `view_service_categories`
- `view_supported_payment_methods`

</details>

<details>
<summary><b>tenant_mgmt</b> (39)</summary>

- `add_tenants`
- `add_tenant_domains`
- `add_tenant_settings`
- `assign_hms_config_keys_to_tenant`
- `assign_location_type_to_tenant`
- `assign_scenario_config_to_tenant`
- `assign_service_categories_to_tenant`
- `delete_tenants`
- `delete_tenant_domains`
- `delete_tenant_settings`
- `export_tenants`
- `export_tenant_domains`
- `export_tenant_settings`
- `filter_tenants`
- `filter_tenant_domains`
- `filter_tenant_settings`
- `import_tenants`
- `import_tenant_domains`
- `import_tenant_settings`
- `list_tenants`
- `list_tenant_domains`
- `list_tenant_settings`
- `manage_tenants_manager`
- `revoke_hms_config_keys_from_tenant`
- `revoke_location_type_from_tenant`
- `revoke_scenario_config_from_tenant`
- `revoke_service_categories_from_tenant`
- `search_tenants`
- `search_tenant_domains`
- `search_tenant_settings`
- `sort_tenants`
- `sort_tenant_domains`
- `sort_tenant_settings`
- `tenant_manager_dashboard`
- `update_tenants`
- `update_tenant_domains`
- `update_tenant_settings`
- `view_hms_config_keys_configuration`
- `view_tenants`
- `view_tenant_domains`
- `view_tenant_settings`

</details>

<details>
<summary><b>tenant</b> (352)</summary>

- `add_admin_code`
- `add_attachments`
- `add_bookings`
- `add_booking_items`
- `add_booking_payments`
- `add_chatting_groups`
- `add_chatting_group_members`
- `add_departments`
- `add_designations`
- `add_device_otp`
- `add_dynamic_attachments`
- `add_memberships`
- `add_messages`
- `add_notifications`
- `add_permission_groups`
- `add_permission_groups_permissions`
- `add_plans`
- `add_plan_groups`
- `add_qr_codes`
- `add_roles`
- `add_roles_designations_department_permissions`
- `add_tasks`
- `add_task_categories`
- `add_task_comments`
- `add_task_flows`
- `add_task_flow_steps`
- `add_task_history`
- `add_task_priorities`
- `add_task_statuses`
- `add_task_watchers`
- `add_transactions`
- `add_users`
- `add_user_payment_methods`
- `add_user_roles_designations_department`
- `add_user_role_designation_permissions`
- `delete_admin_code`
- `delete_attachments`
- `delete_booking_items`
- `delete_booking_payments`
- `delete_chatting_groups`
- `delete_chatting_group_members`
- `delete_departments`
- `delete_designations`
- `delete_device_otp`
- `delete_dynamic_attachments`
- `delete_memberships`
- `delete_messages`
- `delete_notifications`
- `delete_permission_groups_permissions`
- `delete_plans`
- `delete_plan_groups`
- `delete_qr_codes`
- `delete_roles`
- `delete_roles_designations_department_permissions`
- `delete_tasks`
- `delete_task_categories`
- `delete_task_comments`
- `delete_task_flows`
- `delete_task_flow_steps`
- `delete_task_history`
- `delete_task_priorities`
- `delete_task_statuses`
- `delete_task_watchers`
- `delete_transactions`
- `delete_users`
- `delete_user_payment_methods`
- `delete_user_roles_designations_department`
- `delete_user_role_designation_permissions`
- `export_admin_code`
- `export_attachments`
- `export_booking_items`
- `export_booking_payments`
- `export_chatting_groups`
- `export_chatting_group_members`
- `export_departments`
- `export_designations`
- `export_device_otp`
- `export_dynamic_attachments`
- `export_memberships`
- `export_messages`
- `export_notifications`
- `export_permission_groups`
- `export_permission_groups_permissions`
- `export_plans`
- `export_plan_groups`
- `export_qr_codes`
- `export_roles`
- `export_roles_designations_department`
- `export_roles_designations_department_permissions`
- `export_tasks`
- `export_task_categories`
- `export_task_comments`
- `export_task_flows`
- `export_task_flow_steps`
- `export_task_history`
- `export_task_priorities`
- `export_task_statuses`
- `export_task_watchers`
- `export_transactions`
- `export_users`
- `export_user_payment_methods`
- `export_user_roles_designations_department`
- `export_user_role_designation_permissions`
- `filter_admin_code`
- `filter_attachments`
- `filter_booking_items`
- `filter_booking_payments`
- `filter_chatting_groups`
- `filter_chatting_group_members`
- `filter_departments`
- `filter_designations`
- `filter_device_otp`
- `filter_dynamic_attachments`
- `filter_memberships`
- `filter_messages`
- `filter_notifications`
- `filter_permissions`
- `filter_permission_groups`
- `filter_permission_groups_permissions`
- `filter_plans`
- `filter_plan_groups`
- `filter_qr_codes`
- `filter_roles`
- `filter_roles_designations_department`
- `filter_roles_designations_department_permissions`
- `filter_tasks`
- `filter_task_categories`
- `filter_task_comments`
- `filter_task_flows`
- `filter_task_flow_steps`
- `filter_task_history`
- `filter_task_priorities`
- `filter_task_statuses`
- `filter_task_watchers`
- `filter_transactions`
- `filter_users`
- `filter_user_payment_methods`
- `filter_user_roles_designations_department`
- `filter_user_role_designation_permissions`
- `import_admin_code`
- `import_attachments`
- `import_bookings`
- `import_booking_items`
- `import_booking_payments`
- `import_chatting_groups`
- `import_chatting_group_members`
- `import_departments`
- `import_designations`
- `import_device_otp`
- `import_dynamic_attachments`
- `import_memberships`
- `import_messages`
- `import_notifications`
- `import_permission_groups`
- `import_permission_groups_permissions`
- `import_plans`
- `import_plan_groups`
- `import_qr_codes`
- `import_roles`
- `import_roles_designations_department_permissions`
- `import_tasks`
- `import_task_categories`
- `import_task_comments`
- `import_task_flows`
- `import_task_flow_steps`
- `import_task_history`
- `import_task_priorities`
- `import_task_statuses`
- `import_task_watchers`
- `import_transactions`
- `import_users`
- `import_user_payment_methods`
- `import_user_roles_designations_department`
- `import_user_role_designation_permissions`
- `list_admin_code`
- `list_attachments`
- `list_booking_items`
- `list_booking_payments`
- `list_chatting_groups`
- `list_chatting_group_members`
- `list_departments`
- `list_designations`
- `list_device_otp`
- `list_dynamic_attachments`
- `list_memberships`
- `list_messages`
- `list_notifications`
- `list_permissions`
- `list_permission_groups`
- `list_permission_groups_permissions`
- `list_plans`
- `list_plan_groups`
- `list_qr_codes`
- `list_roles`
- `list_roles_designations_department`
- `list_roles_designations_department_permissions`
- `list_tasks`
- `list_task_categories`
- `list_task_comments`
- `list_task_flows`
- `list_task_flow_steps`
- `list_task_history`
- `list_task_priorities`
- `list_task_statuses`
- `list_task_watchers`
- `list_transactions`
- `list_users`
- `list_user_payment_methods`
- `list_user_roles_designations_department`
- `list_user_role_designation_permissions`
- `manage_config_key_category_flags`
- `manage_config_key_user_visibility`
- `manage_config_possible_values`
- `search_admin_code`
- `search_attachments`
- `search_booking_items`
- `search_booking_payments`
- `search_chatting_groups`
- `search_chatting_group_members`
- `search_departments`
- `search_designations`
- `search_device_otp`
- `search_dynamic_attachments`
- `search_memberships`
- `search_messages`
- `search_notifications`
- `search_permissions`
- `search_permission_groups`
- `search_permission_groups_permissions`
- `search_plans`
- `search_plan_groups`
- `search_qr_codes`
- `search_roles`
- `search_roles_designations_department`
- `search_roles_designations_department_permissions`
- `search_tasks`
- `search_task_categories`
- `search_task_comments`
- `search_task_flows`
- `search_task_flow_steps`
- `search_task_history`
- `search_task_priorities`
- `search_task_statuses`
- `search_task_watchers`
- `search_transactions`
- `search_users`
- `search_user_payment_methods`
- `search_user_roles_designations_department`
- `search_user_role_designation_permissions`
- `sort_admin_code`
- `sort_attachments`
- `sort_booking_items`
- `sort_booking_payments`
- `sort_chatting_groups`
- `sort_chatting_group_members`
- `sort_departments`
- `sort_designations`
- `sort_device_otp`
- `sort_dynamic_attachments`
- `sort_memberships`
- `sort_messages`
- `sort_notifications`
- `sort_permission_groups`
- `sort_permission_groups_permissions`
- `sort_plans`
- `sort_plan_groups`
- `sort_qr_codes`
- `sort_roles`
- `sort_roles_designations_department`
- `sort_roles_designations_department_permissions`
- `sort_tasks`
- `sort_task_categories`
- `sort_task_comments`
- `sort_task_flows`
- `sort_task_flow_steps`
- `sort_task_history`
- `sort_task_priorities`
- `sort_task_statuses`
- `sort_task_watchers`
- `sort_transactions`
- `sort_users`
- `sort_user_payment_methods`
- `sort_user_roles_designations_department`
- `sort_user_role_designation_permissions`
- `update_admin_code`
- `update_attachments`
- `update_booking_items`
- `update_booking_payments`
- `update_chatting_groups`
- `update_chatting_group_members`
- `update_departments`
- `update_designations`
- `update_device_otp`
- `update_dynamic_attachments`
- `update_memberships`
- `update_messages`
- `update_notifications`
- `update_permission_groups_permissions`
- `update_plans`
- `update_plan_groups`
- `update_qr_codes`
- `update_roles`
- `update_roles_designations_department_permissions`
- `update_tasks`
- `update_task_categories`
- `update_task_comments`
- `update_task_flows`
- `update_task_flow_steps`
- `update_task_history`
- `update_task_priorities`
- `update_task_statuses`
- `update_task_watchers`
- `update_transactions`
- `update_users`
- `update_user_payment_methods`
- `update_user_roles_designations_department`
- `update_user_role_designation_permissions`
- `view_admin_code`
- `view_attachments`
- `view_booking_items`
- `view_booking_payments`
- `view_chatting_groups`
- `view_chatting_group_members`
- `view_departments`
- `view_designations`
- `view_device_otp`
- `view_dynamic_attachments`
- `view_memberships`
- `view_messages`
- `view_notifications`
- `view_permission_groups`
- `view_permission_groups_permissions`
- `view_plans`
- `view_plan_groups`
- `view_qr_codes`
- `view_roles`
- `view_roles_designations_department`
- `view_roles_designations_department_permissions`
- `view_tasks`
- `view_task_categories`
- `view_task_comments`
- `view_task_flows`
- `view_task_flow_steps`
- `view_task_history`
- `view_task_priorities`
- `view_task_statuses`
- `view_task_watchers`
- `view_transactions`
- `view_users`
- `view_user_payment_methods`
- `view_user_roles_designations_department`
- `view_user_role_designation_permissions`

</details>

<details>
<summary><b>service</b> (126)</summary>

- `add_delivery_units`
- `add_discounts`
- `add_inventory_items`
- `add_inventory_variants`
- `add_packages`
- `add_package_pricing`
- `add_package_services`
- `add_pricing_rules`
- `add_services`
- `add_service_locations`
- `add_service_location_attributes`
- `add_service_pricing`
- `add_unit_availability`
- `delete_delivery_units`
- `delete_discounts`
- `delete_inventory_items`
- `delete_inventory_variants`
- `delete_packages`
- `delete_package_pricing`
- `delete_package_services`
- `delete_pricing_rules`
- `delete_services`
- `delete_service_locations`
- `delete_service_location_attributes`
- `delete_service_pricing`
- `delete_unit_availability`
- `export_delivery_units`
- `export_discounts`
- `export_inventory_items`
- `export_inventory_variants`
- `export_packages`
- `export_package_pricing`
- `export_package_services`
- `export_pricing_rules`
- `export_services`
- `export_service_locations`
- `export_service_location_attributes`
- `export_service_pricing`
- `export_unit_availability`
- `filter_delivery_units`
- `filter_discounts`
- `filter_inventory_items`
- `filter_inventory_variants`
- `filter_packages`
- `filter_package_pricing`
- `filter_package_services`
- `filter_pricing_rules`
- `filter_services`
- `filter_service_locations`
- `filter_service_location_attributes`
- `filter_service_pricing`
- `filter_unit_availability`
- `import_delivery_units`
- `import_discounts`
- `import_inventory_items`
- `import_inventory_variants`
- `import_packages`
- `import_package_pricing`
- `import_package_services`
- `import_pricing_rules`
- `import_services`
- `import_service_locations`
- `import_service_location_attributes`
- `import_service_pricing`
- `import_unit_availability`
- `list_discounts`
- `list_inventory_items`
- `list_inventory_variants`
- `list_package_pricing`
- `list_package_services`
- `list_pricing_rules`
- `list_service_location_attributes`
- `list_service_pricing`
- `list_unit_availability`
- `search_delivery_units`
- `search_discounts`
- `search_inventory_items`
- `search_inventory_variants`
- `search_packages`
- `search_package_pricing`
- `search_package_services`
- `search_pricing_rules`
- `search_services`
- `search_service_locations`
- `search_service_location_attributes`
- `search_service_pricing`
- `search_unit_availability`
- `sort_delivery_units`
- `sort_discounts`
- `sort_inventory_items`
- `sort_inventory_variants`
- `sort_packages`
- `sort_package_pricing`
- `sort_package_services`
- `sort_pricing_rules`
- `sort_services`
- `sort_service_locations`
- `sort_service_location_attributes`
- `sort_service_pricing`
- `sort_unit_availability`
- `update_delivery_units`
- `update_discounts`
- `update_inventory_items`
- `update_inventory_variants`
- `update_packages`
- `update_package_pricing`
- `update_package_services`
- `update_pricing_rules`
- `update_services`
- `update_service_locations`
- `update_service_location_attributes`
- `update_service_pricing`
- `update_unit_availability`
- `view_delivery_units`
- `view_discounts`
- `view_inventory_items`
- `view_inventory_variants`
- `view_packages`
- `view_package_pricing`
- `view_package_services`
- `view_pricing_rules`
- `view_services`
- `view_service_locations`
- `view_service_location_attributes`
- `view_service_pricing`
- `view_unit_availability`

</details>

<details>
<summary><b>common</b> (5)</summary>

- `account`
- `dashboard`
- `privacy_policy`
- `profile`
- `security`

</details>

### Group 11 — `PG-TENANT-ADMIN`

- **Status:** `active`
- **Total active permissions:** 505

**By tier:** framework: 5, tenant: 355, service: 140, common: 5

<details>
<summary><b>framework</b> (5)</summary>

- `filter_service_categories`
- `list_hms_config_keys`
- `list_service_categories`
- `search_service_categories`
- `view_service_categories`

</details>

<details>
<summary><b>tenant</b> (370)</summary>
{/* manage_checkin / manage_checkout added by migration 20260713_2 */}
- `manage_checkin`
- `manage_checkout`

- `add_admin_code`
- `add_attachments`
- `add_bookings`
- `add_booking_items`
- `add_booking_payments`
- `add_chatting_groups`
- `add_chatting_group_members`
- `add_departments`
- `add_designations`
- `add_device_otp`
- `add_dynamic_attachments`
- `add_guest_profiles`
- `add_hms_tenants_config`
- `add_memberships`
- `add_messages`
- `add_notifications`
- `add_permission_groups`
- `add_permission_groups_permissions`
- `add_plans`
- `add_plan_groups`
- `add_qr_codes`
- `add_roles`
- `add_roles_designations_department_permissions`
- `add_tasks`
- `add_task_categories`
- `add_task_comments`
- `add_task_flows`
- `add_task_flow_steps`
- `add_task_history`
- `add_task_priorities`
- `add_task_statuses`
- `add_task_watchers`
- `add_users`
- `add_user_roles_designations_department`
- `add_user_role_designation_permissions`
- `delete_admin_code`
- `delete_attachments`
- `delete_bookings`
- `delete_booking_items`
- `delete_booking_payments`
- `delete_chatting_groups`
- `delete_chatting_group_members`
- `delete_departments`
- `delete_designations`
- `delete_device_otp`
- `delete_dynamic_attachments`
- `delete_guest_profiles`
- `delete_hms_tenants_config`
- `delete_memberships`
- `delete_messages`
- `delete_notifications`
- `delete_permission_groups_permissions`
- `delete_plans`
- `delete_plan_groups`
- `delete_qr_codes`
- `delete_roles`
- `delete_roles_designations_department_permissions`
- `delete_tasks`
- `delete_task_categories`
- `delete_task_comments`
- `delete_task_flows`
- `delete_task_flow_steps`
- `delete_task_history`
- `delete_task_priorities`
- `delete_task_statuses`
- `delete_task_watchers`
- `delete_users`
- `delete_user_roles_designations_department`
- `delete_user_role_designation_permissions`
- `export_admin_code`
- `export_attachments`
- `export_bookings`
- `export_booking_items`
- `export_booking_payments`
- `export_chatting_groups`
- `export_chatting_group_members`
- `export_departments`
- `export_designations`
- `export_device_otp`
- `export_dynamic_attachments`
- `export_guest_profiles`
- `export_memberships`
- `export_messages`
- `export_notifications`
- `export_permission_groups`
- `export_permission_groups_permissions`
- `export_plans`
- `export_plan_groups`
- `export_qr_codes`
- `export_roles`
- `export_roles_designations_department`
- `export_roles_designations_department_permissions`
- `export_tasks`
- `export_task_categories`
- `export_task_comments`
- `export_task_flows`
- `export_task_flow_steps`
- `export_task_history`
- `export_task_priorities`
- `export_task_statuses`
- `export_task_watchers`
- `export_users`
- `export_user_roles_designations_department`
- `export_user_role_designation_permissions`
- `filter_admin_code`
- `filter_attachments`
- `filter_bookings`
- `filter_booking_items`
- `filter_booking_payments`
- `filter_chatting_groups`
- `filter_chatting_group_members`
- `filter_departments`
- `filter_designations`
- `filter_device_otp`
- `filter_dynamic_attachments`
- `filter_guest_profiles`
- `filter_memberships`
- `filter_messages`
- `filter_notifications`
- `filter_permissions`
- `filter_permission_groups`
- `filter_permission_groups_permissions`
- `filter_plans`
- `filter_plan_groups`
- `filter_qr_codes`
- `filter_roles`
- `filter_roles_designations_department`
- `filter_roles_designations_department_permissions`
- `filter_tasks`
- `filter_task_categories`
- `filter_task_comments`
- `filter_task_flows`
- `filter_task_flow_steps`
- `filter_task_history`
- `filter_task_priorities`
- `filter_task_statuses`
- `filter_task_watchers`
- `filter_users`
- `filter_user_roles_designations_department`
- `filter_user_role_designation_permissions`
- `import_admin_code`
- `import_attachments`
- `import_bookings`
- `import_booking_items`
- `import_booking_payments`
- `import_chatting_groups`
- `import_chatting_group_members`
- `import_departments`
- `import_designations`
- `import_device_otp`
- `import_dynamic_attachments`
- `import_guest_profiles`
- `import_memberships`
- `import_messages`
- `import_notifications`
- `import_permission_groups`
- `import_permission_groups_permissions`
- `import_plans`
- `import_plan_groups`
- `import_qr_codes`
- `import_roles`
- `import_roles_designations_department_permissions`
- `import_tasks`
- `import_task_categories`
- `import_task_comments`
- `import_task_flows`
- `import_task_flow_steps`
- `import_task_history`
- `import_task_priorities`
- `import_task_statuses`
- `import_task_watchers`
- `import_users`
- `import_user_roles_designations_department`
- `import_user_role_designation_permissions`
- `list_admin_code`
- `list_attachments`
- `list_bookings`
- `list_booking_items`
- `list_booking_payments`
- `list_chatting_groups`
- `list_chatting_group_members`
- `list_departments`
- `list_designations`
- `list_device_otp`
- `list_dynamic_attachments`
- `list_guest_profiles`
- `list_hms_tenants_config`
- `list_memberships`
- `list_messages`
- `list_notifications`
- `list_permissions`
- `list_permission_groups`
- `list_permission_groups_permissions`
- `list_plans`
- `list_plan_groups`
- `list_qr_codes`
- `list_roles`
- `list_roles_designations_department`
- `list_roles_designations_department_permissions`
- `list_tasks`
- `list_task_categories`
- `list_task_comments`
- `list_task_flows`
- `list_task_flow_steps`
- `list_task_history`
- `list_task_priorities`
- `list_task_statuses`
- `list_task_watchers`
- `list_users`
- `list_user_roles_designations_department`
- `list_user_role_designation_permissions`
- `manage_checkin`
- `manage_checkout`
- `search_admin_code`
- `search_attachments`
- `search_bookings`
- `search_booking_items`
- `search_booking_payments`
- `search_chatting_groups`
- `search_chatting_group_members`
- `search_departments`
- `search_designations`
- `search_device_otp`
- `search_dynamic_attachments`
- `search_guest_profiles`
- `search_memberships`
- `search_messages`
- `search_notifications`
- `search_permissions`
- `search_permission_groups`
- `search_permission_groups_permissions`
- `search_plans`
- `search_plan_groups`
- `search_qr_codes`
- `search_roles`
- `search_roles_designations_department`
- `search_roles_designations_department_permissions`
- `search_tasks`
- `search_task_categories`
- `search_task_comments`
- `search_task_flows`
- `search_task_flow_steps`
- `search_task_history`
- `search_task_priorities`
- `search_task_statuses`
- `search_task_watchers`
- `search_users`
- `search_user_roles_designations_department`
- `search_user_role_designation_permissions`
- `sort_admin_code`
- `sort_attachments`
- `sort_bookings`
- `sort_booking_items`
- `sort_booking_payments`
- `sort_chatting_groups`
- `sort_chatting_group_members`
- `sort_departments`
- `sort_designations`
- `sort_device_otp`
- `sort_dynamic_attachments`
- `sort_guest_profiles`
- `sort_memberships`
- `sort_messages`
- `sort_notifications`
- `sort_permission_groups`
- `sort_permission_groups_permissions`
- `sort_plans`
- `sort_plan_groups`
- `sort_qr_codes`
- `sort_roles`
- `sort_roles_designations_department`
- `sort_roles_designations_department_permissions`
- `sort_tasks`
- `sort_task_categories`
- `sort_task_comments`
- `sort_task_flows`
- `sort_task_flow_steps`
- `sort_task_history`
- `sort_task_priorities`
- `sort_task_statuses`
- `sort_task_watchers`
- `sort_users`
- `sort_user_roles_designations_department`
- `sort_user_role_designation_permissions`
- `tenant_admin_dashboard`
- `update_admin_code`
- `update_attachments`
- `update_bookings`
- `update_booking_items`
- `update_booking_payments`
- `update_chatting_groups`
- `update_chatting_group_members`
- `update_departments`
- `update_designations`
- `update_device_otp`
- `update_dynamic_attachments`
- `update_guest_profiles`
- `update_memberships`
- `update_messages`
- `update_notifications`
- `update_permission_groups_permissions`
- `update_plans`
- `update_plan_groups`
- `update_qr_codes`
- `update_roles`
- `update_roles_designations_department_permissions`
- `update_tasks`
- `update_task_categories`
- `update_task_comments`
- `update_task_flows`
- `update_task_flow_steps`
- `update_task_history`
- `update_task_priorities`
- `update_task_statuses`
- `update_task_watchers`
- `update_users`
- `update_user_roles_designations_department`
- `update_user_role_designation_permissions`
- `view_admin_code`
- `view_attachments`
- `view_bookings`
- `view_booking_items`
- `view_booking_payments`
- `view_chatting_groups`
- `view_chatting_group_members`
- `view_departments`
- `view_designations`
- `view_device_otp`
- `view_dynamic_attachments`
- `view_guest_profiles`
- `view_hms_tenants_config`
- `view_memberships`
- `view_messages`
- `view_notifications`
- `view_permissions`
- `view_permission_groups`
- `view_permission_groups_permissions`
- `view_plans`
- `view_plan_groups`
- `view_qr_codes`
- `view_roles`
- `view_roles_designations_department`
- `view_roles_designations_department_permissions`
- `view_tasks`
- `view_task_categories`
- `view_task_comments`
- `view_task_flows`
- `view_task_flow_steps`
- `view_task_history`
- `view_task_priorities`
- `view_task_statuses`
- `view_task_watchers`
- `view_users`
- `view_user_roles_designations_department`
- `view_user_role_designation_permissions`

</details>

<details>
<summary><b>service</b> (140)</summary>

- `add_booking_services`
- `add_delivery_units`
- `add_discounts`
- `add_inventory_items`
- `add_inventory_variants`
- `add_packages`
- `add_package_pricing`
- `add_package_services`
- `add_pricing_rules`
- `add_services`
- `add_service_locations`
- `add_service_location_attributes`
- `add_service_pricing`
- `add_unit_availability`
- `delete_booking_services`
- `delete_delivery_units`
- `delete_discounts`
- `delete_inventory_items`
- `delete_inventory_variants`
- `delete_packages`
- `delete_package_pricing`
- `delete_package_services`
- `delete_pricing_rules`
- `delete_services`
- `delete_service_locations`
- `delete_service_location_attributes`
- `delete_service_pricing`
- `delete_unit_availability`
- `export_booking_services`
- `export_delivery_units`
- `export_discounts`
- `export_inventory_items`
- `export_inventory_variants`
- `export_packages`
- `export_package_pricing`
- `export_package_services`
- `export_pricing_rules`
- `export_services`
- `export_service_locations`
- `export_service_location_attributes`
- `export_service_pricing`
- `export_unit_availability`
- `filter_booking_services`
- `filter_delivery_units`
- `filter_discounts`
- `filter_inventory_items`
- `filter_inventory_variants`
- `filter_packages`
- `filter_package_pricing`
- `filter_package_services`
- `filter_pricing_rules`
- `filter_services`
- `filter_service_locations`
- `filter_service_location_attributes`
- `filter_service_pricing`
- `filter_unit_availability`
- `import_booking_services`
- `import_delivery_units`
- `import_discounts`
- `import_inventory_items`
- `import_inventory_variants`
- `import_packages`
- `import_package_pricing`
- `import_package_services`
- `import_pricing_rules`
- `import_services`
- `import_service_locations`
- `import_service_location_attributes`
- `import_service_pricing`
- `import_unit_availability`
- `list_booking_services`
- `list_delivery_units`
- `list_discounts`
- `list_inventory_items`
- `list_inventory_variants`
- `list_packages`
- `list_package_pricing`
- `list_package_services`
- `list_pricing_rules`
- `list_services`
- `list_service_locations`
- `list_service_location_attributes`
- `list_service_pricing`
- `list_unit_availability`
- `search_booking_services`
- `search_delivery_units`
- `search_discounts`
- `search_inventory_items`
- `search_inventory_variants`
- `search_packages`
- `search_package_pricing`
- `search_package_services`
- `search_pricing_rules`
- `search_services`
- `search_service_locations`
- `search_service_location_attributes`
- `search_service_pricing`
- `search_unit_availability`
- `sort_booking_services`
- `sort_delivery_units`
- `sort_discounts`
- `sort_inventory_items`
- `sort_inventory_variants`
- `sort_packages`
- `sort_package_pricing`
- `sort_package_services`
- `sort_pricing_rules`
- `sort_services`
- `sort_service_locations`
- `sort_service_location_attributes`
- `sort_service_pricing`
- `sort_unit_availability`
- `update_booking_services`
- `update_delivery_units`
- `update_discounts`
- `update_inventory_items`
- `update_inventory_variants`
- `update_packages`
- `update_package_pricing`
- `update_package_services`
- `update_pricing_rules`
- `update_services`
- `update_service_locations`
- `update_service_location_attributes`
- `update_service_pricing`
- `update_unit_availability`
- `view_booking_services`
- `view_delivery_units`
- `view_discounts`
- `view_inventory_items`
- `view_inventory_variants`
- `view_packages`
- `view_package_pricing`
- `view_package_services`
- `view_pricing_rules`
- `view_services`
- `view_service_locations`
- `view_service_location_attributes`
- `view_service_pricing`
- `view_unit_availability`

</details>

<details>
<summary><b>common</b> (5)</summary>

- `account`
- `dashboard`
- `privacy_policy`
- `profile`
- `security`

</details>

### Group 12 — `PG-SERVICE-MGR`

- **Status:** `active`
- **Total active permissions:** 166

**By tier:** framework: 20, tenant: 30, service: 111, common: 5

<details>
<summary><b>framework</b> (20)</summary>

- `filter_hms_config`
- `filter_hms_config_categories`
- `filter_hms_config_keys`
- `filter_service_categories`
- `list_hms_config`
- `list_hms_config_categories`
- `list_hms_config_keys`
- `list_service_categories`
- `search_hms_config`
- `search_hms_config_categories`
- `search_hms_config_keys`
- `search_service_categories`
- `sort_hms_config`
- `sort_hms_config_categories`
- `sort_hms_config_keys`
- `sort_service_categories`
- `view_hms_config`
- `view_hms_config_categories`
- `view_hms_config_keys`
- `view_service_categories`

</details>

<details>
<summary><b>tenant</b> (24)</summary>
{/* manage_checkin / manage_checkout added by migration 20260713_2 */}
- `manage_checkin`
- `manage_checkout`

{/* admin_code family added by migration 20260709_4 */}
- `add_admin_code`
- `add_bookings`
- `delete_admin_code`
- `delete_bookings`
- `export_admin_code`
- `export_bookings`
- `filter_admin_code`
- `filter_bookings`
- `filter_guest_profiles`
- `filter_users`
- `import_admin_code`
- `import_bookings`
- `list_admin_code`
- `list_bookings`
- `list_guest_profiles`
- `list_users`
- `manage_checkin`
- `manage_checkout`
- `search_admin_code`
- `search_bookings`
- `search_guest_profiles`
- `search_users`
- `sort_admin_code`
- `sort_bookings`
- `update_admin_code`
- `update_bookings`
- `view_admin_code`
- `view_bookings`
- `view_guest_profiles`
- `view_users`

</details>

<details>
<summary><b>service</b> (111)</summary>

- `add_booking_services`
- `add_delivery_units`
- `add_discounts`
- `add_inventory_items`
- `add_inventory_variants`
- `add_pricing_rules`
- `add_services`
- `add_service_locations`
- `add_service_location_attributes`
- `add_service_pricing`
- `add_unit_availability`
- `delete_booking_services`
- `delete_delivery_units`
- `delete_discounts`
- `delete_inventory_items`
- `delete_inventory_variants`
- `delete_pricing_rules`
- `delete_services`
- `delete_service_locations`
- `delete_service_location_attributes`
- `delete_service_pricing`
- `delete_unit_availability`
- `export_booking_services`
- `export_delivery_units`
- `export_discounts`
- `export_inventory_items`
- `export_inventory_variants`
- `export_pricing_rules`
- `export_services`
- `export_service_locations`
- `export_service_location_attributes`
- `export_service_pricing`
- `export_unit_availability`
- `filter_booking_services`
- `filter_delivery_units`
- `filter_discounts`
- `filter_inventory_items`
- `filter_inventory_variants`
- `filter_pricing_rules`
- `filter_services`
- `filter_service_locations`
- `filter_service_location_attributes`
- `filter_service_pricing`
- `filter_unit_availability`
- `import_booking_services`
- `import_delivery_units`
- `import_discounts`
- `import_inventory_items`
- `import_inventory_variants`
- `import_pricing_rules`
- `import_services`
- `import_service_locations`
- `import_service_location_attributes`
- `import_service_pricing`
- `import_unit_availability`
- `list_booking_services`
- `list_delivery_units`
- `list_discounts`
- `list_inventory_items`
- `list_inventory_variants`
- `list_pricing_rules`
- `list_services`
- `list_service_locations`
- `list_service_location_attributes`
- `list_service_pricing`
- `list_unit_availability`
- `search_booking_services`
- `search_delivery_units`
- `search_discounts`
- `search_inventory_items`
- `search_inventory_variants`
- `search_pricing_rules`
- `search_services`
- `search_service_locations`
- `search_service_location_attributes`
- `search_service_pricing`
- `search_unit_availability`
- `service_manager_dashboard`
- `sort_booking_services`
- `sort_delivery_units`
- `sort_discounts`
- `sort_inventory_items`
- `sort_inventory_variants`
- `sort_pricing_rules`
- `sort_services`
- `sort_service_locations`
- `sort_service_location_attributes`
- `sort_service_pricing`
- `sort_unit_availability`
- `update_booking_services`
- `update_delivery_units`
- `update_discounts`
- `update_inventory_items`
- `update_inventory_variants`
- `update_pricing_rules`
- `update_services`
- `update_service_locations`
- `update_service_location_attributes`
- `update_service_pricing`
- `update_unit_availability`
- `view_booking_services`
- `view_delivery_units`
- `view_discounts`
- `view_inventory_items`
- `view_inventory_variants`
- `view_pricing_rules`
- `view_services`
- `view_service_locations`
- `view_service_location_attributes`
- `view_service_pricing`
- `view_unit_availability`

</details>

<details>
<summary><b>common</b> (5)</summary>

- `account`
- `dashboard`
- `privacy_policy`
- `profile`
- `security`

</details>

### Group 15 — `PG-STANDARD-GUEST`

- **Status:** `active`
- **Total active permissions:** 0

_No active permissions._
### Group 128 — `PG-BOOKING-MGR`

- **Status:** `active`
- **Total active permissions:** 61

**By tier:** framework: 5, tenant: 30, service: 23, common: 3

<details>
<summary><b>framework</b> (5)</summary>

- `filter_service_categories`
- `list_hms_config_keys`
- `list_service_categories`
- `search_service_categories`
- `view_service_categories`

</details>

<details>
<summary><b>tenant</b> (24)</summary>
{/* manage_checkin / manage_checkout added by migration 20260713_2 */}
- `manage_checkin`
- `manage_checkout`

{/* admin_code family added by migration 20260709_4 */}
- `add_admin_code`
- `add_bookings`
- `delete_admin_code`
- `delete_bookings`
- `export_admin_code`
- `export_bookings`
- `filter_admin_code`
- `filter_bookings`
- `filter_guest_profiles`
- `filter_users`
- `import_admin_code`
- `import_bookings`
- `list_admin_code`
- `list_bookings`
- `list_guest_profiles`
- `list_users`
- `manage_checkin`
- `manage_checkout`
- `search_admin_code`
- `search_bookings`
- `search_guest_profiles`
- `search_users`
- `sort_admin_code`
- `sort_bookings`
- `update_admin_code`
- `update_bookings`
- `view_admin_code`
- `view_bookings`
- `view_guest_profiles`
- `view_users`

</details>

<details>
<summary><b>service</b> (23)</summary>

- `add_booking_services`
- `booking_manager_dashboard`
- `delete_booking_services`
- `export_booking_services`
- `filter_booking_services`
- `filter_packages`
- `filter_package_services`
- `filter_services`
- `import_booking_services`
- `list_booking_services`
- `list_packages`
- `list_package_services`
- `list_services`
- `search_booking_services`
- `search_packages`
- `search_package_services`
- `search_services`
- `sort_booking_services`
- `update_booking_services`
- `view_booking_services`
- `view_packages`
- `view_package_services`
- `view_services`

</details>

<details>
<summary><b>common</b> (3)</summary>

- `account`
- `dashboard`
- `privacy_policy`

</details>

### 2.2 Functional groups

### Group 136 — `PG-FN-ADMIN-CODES`

- **Status:** `active`
- **Total active permissions:** 10

**By tier:** tenant: 10

<details>
<summary><b>tenant</b> (10)</summary>

- `add_admin_code`
- `delete_admin_code`
- `export_admin_code`
- `filter_admin_code`
- `import_admin_code`
- `list_admin_code`
- `search_admin_code`
- `sort_admin_code`
- `update_admin_code`
- `view_admin_code`

</details>

### Group 137 — `PG-FN-ATTACHMENTS`

- **Status:** `active`
- **Total active permissions:** 20

**By tier:** tenant: 20

<details>
<summary><b>tenant</b> (20)</summary>

- `add_attachments`
- `add_dynamic_attachments`
- `delete_attachments`
- `delete_dynamic_attachments`
- `export_attachments`
- `export_dynamic_attachments`
- `filter_attachments`
- `filter_dynamic_attachments`
- `import_attachments`
- `import_dynamic_attachments`
- `list_attachments`
- `list_dynamic_attachments`
- `search_attachments`
- `search_dynamic_attachments`
- `sort_attachments`
- `sort_dynamic_attachments`
- `update_attachments`
- `update_dynamic_attachments`
- `view_attachments`
- `view_dynamic_attachments`

</details>

### Group 138 — `PG-FN-BOOKINGS`

- **Status:** `active`
- **Total active permissions:** 52

**By tier:** tenant: 42, service: 10

<details>
<summary><b>tenant</b> (42)</summary>

- `add_admin_code`
- `add_bookings`
- `add_booking_items`
- `add_booking_payments`
- `delete_admin_code`
- `delete_bookings`
- `delete_booking_items`
- `delete_booking_payments`
- `export_admin_code`
- `export_bookings`
- `export_booking_items`
- `export_booking_payments`
- `filter_admin_code`
- `filter_bookings`
- `filter_booking_items`
- `filter_booking_payments`
- `import_admin_code`
- `import_bookings`
- `import_booking_items`
- `import_booking_payments`
- `list_admin_code`
- `list_bookings`
- `list_booking_items`
- `list_booking_payments`
- `manage_checkin`
- `manage_checkout`
- `search_admin_code`
- `search_bookings`
- `search_booking_items`
- `search_booking_payments`
- `sort_admin_code`
- `sort_bookings`
- `sort_booking_items`
- `sort_booking_payments`
- `update_admin_code`
- `update_bookings`
- `update_booking_items`
- `update_booking_payments`
- `view_admin_code`
- `view_bookings`
- `view_booking_items`
- `view_booking_payments`

</details>

<details>
<summary><b>service</b> (10)</summary>

- `add_booking_services`
- `delete_booking_services`
- `export_booking_services`
- `filter_booking_services`
- `import_booking_services`
- `list_booking_services`
- `search_booking_services`
- `sort_booking_services`
- `update_booking_services`
- `view_booking_services`

</details>

### Group 139 — `PG-FN-CHAT`

- **Status:** `active`
- **Total active permissions:** 30

**By tier:** tenant: 30

<details>
<summary><b>tenant</b> (30)</summary>

- `add_chatting_groups`
- `add_chatting_group_members`
- `add_messages`
- `delete_chatting_groups`
- `delete_chatting_group_members`
- `delete_messages`
- `export_chatting_groups`
- `export_chatting_group_members`
- `export_messages`
- `filter_chatting_groups`
- `filter_chatting_group_members`
- `filter_messages`
- `import_chatting_groups`
- `import_chatting_group_members`
- `import_messages`
- `list_chatting_groups`
- `list_chatting_group_members`
- `list_messages`
- `search_chatting_groups`
- `search_chatting_group_members`
- `search_messages`
- `sort_chatting_groups`
- `sort_chatting_group_members`
- `sort_messages`
- `update_chatting_groups`
- `update_chatting_group_members`
- `update_messages`
- `view_chatting_groups`
- `view_chatting_group_members`
- `view_messages`

</details>

### Group 140 — `PG-FN-CONFIG`

- **Status:** `active`
- **Total active permissions:** 15

**By tier:** framework: 15

<details>
<summary><b>framework</b> (15)</summary>

- `filter_hms_config`
- `filter_hms_config_categories`
- `filter_hms_config_keys`
- `list_hms_config`
- `list_hms_config_categories`
- `list_hms_config_keys`
- `search_hms_config`
- `search_hms_config_categories`
- `search_hms_config_keys`
- `sort_hms_config`
- `sort_hms_config_categories`
- `sort_hms_config_keys`
- `view_hms_config`
- `view_hms_config_categories`
- `view_hms_config_keys`

</details>

### Group 141 — `PG-FN-CONFIG-ADMIN`

- **Status:** `active`
- **Total active permissions:** 35

**By tier:** framework: 35

<details>
<summary><b>framework</b> (35)</summary>

- `add_hms_config`
- `add_hms_config_categories`
- `add_hms_config_keys`
- `add_hms_scenario_config`
- `add_hms_scope_types`
- `delete_hms_config`
- `delete_hms_config_categories`
- `delete_hms_config_keys`
- `delete_hms_scenario_config`
- `delete_hms_scope_types`
- `export_hms_config`
- `export_hms_config_categories`
- `export_hms_config_keys`
- `export_hms_scenario_config`
- `export_hms_scope_types`
- `filter_hms_scenario_config`
- `filter_hms_scope_types`
- `import_hms_config`
- `import_hms_config_categories`
- `import_hms_config_keys`
- `import_hms_scenario_config`
- `import_hms_scope_types`
- `list_hms_scenario_config`
- `list_hms_scope_types`
- `search_hms_scenario_config`
- `search_hms_scope_types`
- `sort_hms_scenario_config`
- `sort_hms_scope_types`
- `update_hms_config`
- `update_hms_config_categories`
- `update_hms_config_keys`
- `update_hms_scenario_config`
- `update_hms_scope_types`
- `view_hms_scenario_config`
- `view_hms_scope_types`

</details>

### Group 142 — `PG-FN-CONFIG-MANAGE`

- **Status:** `active`
- **Total active permissions:** 4

**By tier:** tenant_mgmt: 1, tenant: 3

<details>
<summary><b>tenant_mgmt</b> (1)</summary>

- `view_hms_config_keys_configuration`

</details>

<details>
<summary><b>tenant</b> (3)</summary>

- `manage_config_key_category_flags`
- `manage_config_key_user_visibility`
- `manage_config_possible_values`

</details>

### Group 143 — `PG-FN-DELIVERY-UNITS`

- **Status:** `active`
- **Total active permissions:** 20

**By tier:** service: 20

<details>
<summary><b>service</b> (20)</summary>

- `add_delivery_units`
- `add_unit_availability`
- `delete_delivery_units`
- `delete_unit_availability`
- `export_delivery_units`
- `export_unit_availability`
- `filter_delivery_units`
- `filter_unit_availability`
- `import_delivery_units`
- `import_unit_availability`
- `list_delivery_units`
- `list_unit_availability`
- `search_delivery_units`
- `search_unit_availability`
- `sort_delivery_units`
- `sort_unit_availability`
- `update_delivery_units`
- `update_unit_availability`
- `view_delivery_units`
- `view_unit_availability`

</details>

### Group 144 — `PG-FN-DEPARTMENTS`

- **Status:** `active`
- **Total active permissions:** 10

**By tier:** tenant: 10

<details>
<summary><b>tenant</b> (10)</summary>

- `add_departments`
- `delete_departments`
- `export_departments`
- `filter_departments`
- `import_departments`
- `list_departments`
- `search_departments`
- `sort_departments`
- `update_departments`
- `view_departments`

</details>

### Group 145 — `PG-FN-DESIGNATIONS`

- **Status:** `active`
- **Total active permissions:** 10

**By tier:** tenant: 10

<details>
<summary><b>tenant</b> (10)</summary>

- `add_designations`
- `delete_designations`
- `export_designations`
- `filter_designations`
- `import_designations`
- `list_designations`
- `search_designations`
- `sort_designations`
- `update_designations`
- `view_designations`

</details>

### Group 146 — `PG-FN-DEVICE-OTP`

- **Status:** `active`
- **Total active permissions:** 10

**By tier:** tenant: 10

<details>
<summary><b>tenant</b> (10)</summary>

- `add_device_otp`
- `delete_device_otp`
- `export_device_otp`
- `filter_device_otp`
- `import_device_otp`
- `list_device_otp`
- `search_device_otp`
- `sort_device_otp`
- `update_device_otp`
- `view_device_otp`

</details>

### Group 147 — `PG-FN-FINANCE`

- **Status:** `active`
- **Total active permissions:** 20

**By tier:** tenant: 20

<details>
<summary><b>tenant</b> (20)</summary>

- `add_transactions`
- `add_user_payment_methods`
- `delete_transactions`
- `delete_user_payment_methods`
- `export_transactions`
- `export_user_payment_methods`
- `filter_transactions`
- `filter_user_payment_methods`
- `import_transactions`
- `import_user_payment_methods`
- `list_transactions`
- `list_user_payment_methods`
- `search_transactions`
- `search_user_payment_methods`
- `sort_transactions`
- `sort_user_payment_methods`
- `update_transactions`
- `update_user_payment_methods`
- `view_transactions`
- `view_user_payment_methods`

</details>

### Group 148 — `PG-FN-FRONTPAGE`

- **Status:** `active`
- **Total active permissions:** 0

_No active permissions._
### Group 149 — `PG-FN-GUESTS`

- **Status:** `active`
- **Total active permissions:** 30

**By tier:** tenant: 30

<details>
<summary><b>tenant</b> (30)</summary>

- `add_guest_booking_history`
- `add_guest_profiles`
- `add_memberships`
- `delete_guest_booking_history`
- `delete_guest_profiles`
- `delete_memberships`
- `export_guest_booking_history`
- `export_guest_profiles`
- `export_memberships`
- `filter_guest_booking_history`
- `filter_guest_profiles`
- `filter_memberships`
- `import_guest_booking_history`
- `import_guest_profiles`
- `import_memberships`
- `list_guest_booking_history`
- `list_guest_profiles`
- `list_memberships`
- `search_guest_booking_history`
- `search_guest_profiles`
- `search_memberships`
- `sort_guest_booking_history`
- `sort_guest_profiles`
- `sort_memberships`
- `update_guest_booking_history`
- `update_guest_profiles`
- `update_memberships`
- `view_guest_booking_history`
- `view_guest_profiles`
- `view_memberships`

</details>

### Group 150 — `PG-FN-INVENTORY`

- **Status:** `active`
- **Total active permissions:** 20

**By tier:** service: 20

<details>
<summary><b>service</b> (20)</summary>

- `add_inventory_items`
- `add_inventory_variants`
- `delete_inventory_items`
- `delete_inventory_variants`
- `export_inventory_items`
- `export_inventory_variants`
- `filter_inventory_items`
- `filter_inventory_variants`
- `import_inventory_items`
- `import_inventory_variants`
- `list_inventory_items`
- `list_inventory_variants`
- `search_inventory_items`
- `search_inventory_variants`
- `sort_inventory_items`
- `sort_inventory_variants`
- `update_inventory_items`
- `update_inventory_variants`
- `view_inventory_items`
- `view_inventory_variants`

</details>

### Group 151 — `PG-FN-LOCALIZATION`

- **Status:** `active`
- **Total active permissions:** 30

**By tier:** framework: 30

<details>
<summary><b>framework</b> (30)</summary>

- `add_language_codes`
- `add_templates`
- `add_translated_entries`
- `delete_language_codes`
- `delete_templates`
- `delete_translated_entries`
- `export_language_codes`
- `export_templates`
- `export_translated_entries`
- `filter_language_codes`
- `filter_templates`
- `filter_translated_entries`
- `import_language_codes`
- `import_templates`
- `import_translated_entries`
- `list_language_codes`
- `list_templates`
- `list_translated_entries`
- `search_language_codes`
- `search_templates`
- `search_translated_entries`
- `sort_language_codes`
- `sort_templates`
- `sort_translated_entries`
- `update_language_codes`
- `update_templates`
- `update_translated_entries`
- `view_language_codes`
- `view_templates`
- `view_translated_entries`

</details>

### Group 152 — `PG-FN-LOGS`

- **Status:** `active`
- **Total active permissions:** 55

**By tier:** framework: 55

<details>
<summary><b>framework</b> (55)</summary>

- `add_audit_logs`
- `add_crash_log`
- `add_email_log`
- `add_error_log`
- `add_security_log`
- `delete_api_logs`
- `delete_audit_logs`
- `delete_crash_log`
- `delete_email_log`
- `delete_error_log`
- `delete_security_log`
- `export_api_logs`
- `export_audit_logs`
- `export_crash_log`
- `export_email_log`
- `export_error_log`
- `export_security_log`
- `filter_audit_logs`
- `filter_crash_log`
- `filter_email_log`
- `filter_error_log`
- `filter_security_log`
- `import_audit_logs`
- `import_crash_log`
- `import_email_log`
- `import_error_log`
- `import_security_log`
- `list_api_logs`
- `list_audit_logs`
- `list_crash_log`
- `list_email_log`
- `list_error_log`
- `list_security_log`
- `search_api_logs`
- `search_audit_logs`
- `search_crash_log`
- `search_email_log`
- `search_error_log`
- `search_security_log`
- `sort_audit_logs`
- `sort_crash_log`
- `sort_email_log`
- `sort_error_log`
- `sort_security_log`
- `update_audit_logs`
- `update_crash_log`
- `update_email_log`
- `update_error_log`
- `update_security_log`
- `view_api_logs`
- `view_audit_logs`
- `view_crash_log`
- `view_email_log`
- `view_error_log`
- `view_security_log`

</details>

### Group 153 — `PG-FN-NOTIFICATIONS`

- **Status:** `active`
- **Total active permissions:** 10

**By tier:** tenant: 10

<details>
<summary><b>tenant</b> (10)</summary>

- `add_notifications`
- `delete_notifications`
- `export_notifications`
- `filter_notifications`
- `import_notifications`
- `list_notifications`
- `search_notifications`
- `sort_notifications`
- `update_notifications`
- `view_notifications`

</details>

### Group 154 — `PG-FN-PACKAGES`

- **Status:** `active`
- **Total active permissions:** 30

**By tier:** service: 30

<details>
<summary><b>service</b> (30)</summary>

- `add_packages`
- `add_package_pricing`
- `add_package_services`
- `delete_packages`
- `delete_package_pricing`
- `delete_package_services`
- `export_packages`
- `export_package_pricing`
- `export_package_services`
- `filter_packages`
- `filter_package_pricing`
- `filter_package_services`
- `import_packages`
- `import_package_pricing`
- `import_package_services`
- `list_packages`
- `list_package_pricing`
- `list_package_services`
- `search_packages`
- `search_package_pricing`
- `search_package_services`
- `sort_packages`
- `sort_package_pricing`
- `sort_package_services`
- `update_packages`
- `update_package_pricing`
- `update_package_services`
- `view_packages`
- `view_package_pricing`
- `view_package_services`

</details>

### Group 155 — `PG-FN-PAYMENTS-CONFIG`

- **Status:** `active`
- **Total active permissions:** 30

**By tier:** framework: 30

<details>
<summary><b>framework</b> (30)</summary>

- `add_currencies`
- `add_payment_providers`
- `add_supported_payment_methods`
- `delete_currencies`
- `delete_payment_providers`
- `delete_supported_payment_methods`
- `export_currencies`
- `export_payment_providers`
- `export_supported_payment_methods`
- `filter_currencies`
- `filter_payment_providers`
- `filter_supported_payment_methods`
- `import_currencies`
- `import_payment_providers`
- `import_supported_payment_methods`
- `list_currencies`
- `list_payment_providers`
- `list_supported_payment_methods`
- `search_currencies`
- `search_payment_providers`
- `search_supported_payment_methods`
- `sort_currencies`
- `sort_payment_providers`
- `sort_supported_payment_methods`
- `update_currencies`
- `update_payment_providers`
- `update_supported_payment_methods`
- `view_currencies`
- `view_payment_providers`
- `view_supported_payment_methods`

</details>

### Group 156 — `PG-FN-PERMISSIONS-ADMIN`

- **Status:** `active`
- **Total active permissions:** 8

**By tier:** tenant: 8

<details>
<summary><b>tenant</b> (8)</summary>

- `add_permissions`
- `delete_permissions`
- `export_permissions`
- `filter_permissions`
- `import_permissions`
- `search_permissions`
- `sort_permissions`
- `update_permissions`

</details>

### Group 157 — `PG-FN-PLANS`

- **Status:** `active`
- **Total active permissions:** 20

**By tier:** tenant: 20

<details>
<summary><b>tenant</b> (20)</summary>

- `add_plans`
- `add_plan_groups`
- `delete_plans`
- `delete_plan_groups`
- `export_plans`
- `export_plan_groups`
- `filter_plans`
- `filter_plan_groups`
- `import_plans`
- `import_plan_groups`
- `list_plans`
- `list_plan_groups`
- `search_plans`
- `search_plan_groups`
- `sort_plans`
- `sort_plan_groups`
- `update_plans`
- `update_plan_groups`
- `view_plans`
- `view_plan_groups`

</details>

### Group 158 — `PG-FN-PLATFORM`

- **Status:** `active`
- **Total active permissions:** 30

**By tier:** framework: 30

<details>
<summary><b>framework</b> (30)</summary>

- `add_platforms`
- `add_platform_versions`
- `add_versions`
- `delete_platforms`
- `delete_platform_versions`
- `delete_versions`
- `export_platforms`
- `export_platform_versions`
- `export_versions`
- `filter_platforms`
- `filter_platform_versions`
- `filter_versions`
- `import_platforms`
- `import_platform_versions`
- `import_versions`
- `list_platforms`
- `list_platform_versions`
- `list_versions`
- `search_platforms`
- `search_platform_versions`
- `search_versions`
- `sort_platforms`
- `sort_platform_versions`
- `sort_versions`
- `update_platforms`
- `update_platform_versions`
- `update_versions`
- `view_platforms`
- `view_platform_versions`
- `view_versions`

</details>

### Group 159 — `PG-FN-PRICING`

- **Status:** `active`
- **Total active permissions:** 20

**By tier:** service: 20

<details>
<summary><b>service</b> (20)</summary>

- `add_discounts`
- `add_pricing_rules`
- `delete_discounts`
- `delete_pricing_rules`
- `export_discounts`
- `export_pricing_rules`
- `filter_discounts`
- `filter_pricing_rules`
- `import_discounts`
- `import_pricing_rules`
- `list_discounts`
- `list_pricing_rules`
- `search_discounts`
- `search_pricing_rules`
- `sort_discounts`
- `sort_pricing_rules`
- `update_discounts`
- `update_pricing_rules`
- `view_discounts`
- `view_pricing_rules`

</details>

### Group 160 — `PG-FN-QR`

- **Status:** `active`
- **Total active permissions:** 10

**By tier:** tenant: 10

<details>
<summary><b>tenant</b> (10)</summary>

- `add_qr_codes`
- `delete_qr_codes`
- `export_qr_codes`
- `filter_qr_codes`
- `import_qr_codes`
- `list_qr_codes`
- `search_qr_codes`
- `sort_qr_codes`
- `update_qr_codes`
- `view_qr_codes`

</details>

### Group 161 — `PG-FN-QR-SCANS`

- **Status:** `active`
- **Total active permissions:** 10

**By tier:** tenant: 10

<details>
<summary><b>tenant</b> (10)</summary>

- `add_qr_scan_logs`
- `delete_qr_scan_logs`
- `export_qr_scan_logs`
- `filter_qr_scan_logs`
- `import_qr_scan_logs`
- `list_qr_scan_logs`
- `search_qr_scan_logs`
- `sort_qr_scan_logs`
- `update_qr_scan_logs`
- `view_qr_scan_logs`

</details>

### Group 162 — `PG-FN-RBAC`

- **Status:** `active`
- **Total active permissions:** 64

**By tier:** tenant: 64

<details>
<summary><b>tenant</b> (64)</summary>

- `add_permission_groups`
- `add_permission_groups_permissions`
- `add_roles_designations_department`
- `add_roles_designations_department_permissions`
- `add_user_roles_designations_department`
- `add_user_role_designation_permissions`
- `delete_permission_groups`
- `delete_permission_groups_permissions`
- `delete_roles_designations_department`
- `delete_roles_designations_department_permissions`
- `delete_user_roles_designations_department`
- `delete_user_role_designation_permissions`
- `export_permission_groups`
- `export_permission_groups_permissions`
- `export_roles_designations_department`
- `export_roles_designations_department_permissions`
- `export_user_roles_designations_department`
- `export_user_role_designation_permissions`
- `filter_permissions`
- `filter_permission_groups`
- `filter_permission_groups_permissions`
- `filter_roles_designations_department`
- `filter_roles_designations_department_permissions`
- `filter_user_roles_designations_department`
- `filter_user_role_designation_permissions`
- `import_permission_groups`
- `import_permission_groups_permissions`
- `import_roles_designations_department`
- `import_roles_designations_department_permissions`
- `import_user_roles_designations_department`
- `import_user_role_designation_permissions`
- `list_permissions`
- `list_permission_groups`
- `list_permission_groups_permissions`
- `list_roles_designations_department`
- `list_roles_designations_department_permissions`
- `list_user_roles_designations_department`
- `list_user_role_designation_permissions`
- `search_permissions`
- `search_permission_groups`
- `search_permission_groups_permissions`
- `search_roles_designations_department`
- `search_roles_designations_department_permissions`
- `search_user_roles_designations_department`
- `search_user_role_designation_permissions`
- `sort_permission_groups`
- `sort_permission_groups_permissions`
- `sort_roles_designations_department`
- `sort_roles_designations_department_permissions`
- `sort_user_roles_designations_department`
- `sort_user_role_designation_permissions`
- `update_permission_groups`
- `update_permission_groups_permissions`
- `update_roles_designations_department`
- `update_roles_designations_department_permissions`
- `update_user_roles_designations_department`
- `update_user_role_designation_permissions`
- `view_permissions`
- `view_permission_groups`
- `view_permission_groups_permissions`
- `view_roles_designations_department`
- `view_roles_designations_department_permissions`
- `view_user_roles_designations_department`
- `view_user_role_designation_permissions`

</details>

### Group 163 — `PG-FN-ROLES`

- **Status:** `active`
- **Total active permissions:** 10

**By tier:** tenant: 10

<details>
<summary><b>tenant</b> (10)</summary>

- `add_roles`
- `delete_roles`
- `export_roles`
- `filter_roles`
- `import_roles`
- `list_roles`
- `search_roles`
- `sort_roles`
- `update_roles`
- `view_roles`

</details>

### Group 164 — `PG-FN-SERVICE-CATEGORIES`

- **Status:** `active`
- **Total active permissions:** 5

**By tier:** framework: 5

<details>
<summary><b>framework</b> (5)</summary>

- `filter_service_categories`
- `list_service_categories`
- `search_service_categories`
- `sort_service_categories`
- `view_service_categories`

</details>

### Group 165 — `PG-FN-SERVICE-CATEGORIES-ADMIN`

- **Status:** `active`
- **Total active permissions:** 5

**By tier:** framework: 5

<details>
<summary><b>framework</b> (5)</summary>

- `add_service_categories`
- `delete_service_categories`
- `export_service_categories`
- `import_service_categories`
- `update_service_categories`

</details>

### Group 166 — `PG-FN-SERVICES`

- **Status:** `active`
- **Total active permissions:** 40

**By tier:** service: 40

<details>
<summary><b>service</b> (40)</summary>

- `add_services`
- `add_service_locations`
- `add_service_location_attributes`
- `add_service_pricing`
- `delete_services`
- `delete_service_locations`
- `delete_service_location_attributes`
- `delete_service_pricing`
- `export_services`
- `export_service_locations`
- `export_service_location_attributes`
- `export_service_pricing`
- `filter_services`
- `filter_service_locations`
- `filter_service_location_attributes`
- `filter_service_pricing`
- `import_services`
- `import_service_locations`
- `import_service_location_attributes`
- `import_service_pricing`
- `list_services`
- `list_service_locations`
- `list_service_location_attributes`
- `list_service_pricing`
- `search_services`
- `search_service_locations`
- `search_service_location_attributes`
- `search_service_pricing`
- `sort_services`
- `sort_service_locations`
- `sort_service_location_attributes`
- `sort_service_pricing`
- `update_services`
- `update_service_locations`
- `update_service_location_attributes`
- `update_service_pricing`
- `view_services`
- `view_service_locations`
- `view_service_location_attributes`
- `view_service_pricing`

</details>

### Group 167 — `PG-FN-TASKS`

- **Status:** `active`
- **Total active permissions:** 90

**By tier:** tenant: 90

<details>
<summary><b>tenant</b> (90)</summary>

- `add_tasks`
- `add_task_categories`
- `add_task_comments`
- `add_task_flows`
- `add_task_flow_steps`
- `add_task_history`
- `add_task_priorities`
- `add_task_statuses`
- `add_task_watchers`
- `delete_tasks`
- `delete_task_categories`
- `delete_task_comments`
- `delete_task_flows`
- `delete_task_flow_steps`
- `delete_task_history`
- `delete_task_priorities`
- `delete_task_statuses`
- `delete_task_watchers`
- `export_tasks`
- `export_task_categories`
- `export_task_comments`
- `export_task_flows`
- `export_task_flow_steps`
- `export_task_history`
- `export_task_priorities`
- `export_task_statuses`
- `export_task_watchers`
- `filter_tasks`
- `filter_task_categories`
- `filter_task_comments`
- `filter_task_flows`
- `filter_task_flow_steps`
- `filter_task_history`
- `filter_task_priorities`
- `filter_task_statuses`
- `filter_task_watchers`
- `import_tasks`
- `import_task_categories`
- `import_task_comments`
- `import_task_flows`
- `import_task_flow_steps`
- `import_task_history`
- `import_task_priorities`
- `import_task_statuses`
- `import_task_watchers`
- `list_tasks`
- `list_task_categories`
- `list_task_comments`
- `list_task_flows`
- `list_task_flow_steps`
- `list_task_history`
- `list_task_priorities`
- `list_task_statuses`
- `list_task_watchers`
- `search_tasks`
- `search_task_categories`
- `search_task_comments`
- `search_task_flows`
- `search_task_flow_steps`
- `search_task_history`
- `search_task_priorities`
- `search_task_statuses`
- `search_task_watchers`
- `sort_tasks`
- `sort_task_categories`
- `sort_task_comments`
- `sort_task_flows`
- `sort_task_flow_steps`
- `sort_task_history`
- `sort_task_priorities`
- `sort_task_statuses`
- `sort_task_watchers`
- `update_tasks`
- `update_task_categories`
- `update_task_comments`
- `update_task_flows`
- `update_task_flow_steps`
- `update_task_history`
- `update_task_priorities`
- `update_task_statuses`
- `update_task_watchers`
- `view_tasks`
- `view_task_categories`
- `view_task_comments`
- `view_task_flows`
- `view_task_flow_steps`
- `view_task_history`
- `view_task_priorities`
- `view_task_statuses`
- `view_task_watchers`

</details>

### Group 168 — `PG-FN-TENANT-RESOURCE-ASSIGN`

- **Status:** `active`
- **Total active permissions:** 8

**By tier:** tenant_mgmt: 8

<details>
<summary><b>tenant_mgmt</b> (8)</summary>

- `assign_hms_config_keys_to_tenant`
- `assign_location_type_to_tenant`
- `assign_scenario_config_to_tenant`
- `assign_service_categories_to_tenant`
- `revoke_hms_config_keys_from_tenant`
- `revoke_location_type_from_tenant`
- `revoke_scenario_config_from_tenant`
- `revoke_service_categories_from_tenant`

</details>

### Group 169 — `PG-FN-TENANTS`

- **Status:** `active`
- **Total active permissions:** 30

**By tier:** tenant_mgmt: 30

<details>
<summary><b>tenant_mgmt</b> (30)</summary>

- `add_tenants`
- `add_tenant_domains`
- `add_tenant_settings`
- `delete_tenants`
- `delete_tenant_domains`
- `delete_tenant_settings`
- `export_tenants`
- `export_tenant_domains`
- `export_tenant_settings`
- `filter_tenants`
- `filter_tenant_domains`
- `filter_tenant_settings`
- `import_tenants`
- `import_tenant_domains`
- `import_tenant_settings`
- `list_tenants`
- `list_tenant_domains`
- `list_tenant_settings`
- `search_tenants`
- `search_tenant_domains`
- `search_tenant_settings`
- `sort_tenants`
- `sort_tenant_domains`
- `sort_tenant_settings`
- `update_tenants`
- `update_tenant_domains`
- `update_tenant_settings`
- `view_tenants`
- `view_tenant_domains`
- `view_tenant_settings`

</details>

### Group 170 — `PG-FN-USER-TELEMETRY`

- **Status:** `active`
- **Total active permissions:** 30

**By tier:** tenant: 30

<details>
<summary><b>tenant</b> (30)</summary>

- `add_user_activity`
- `add_user_devices`
- `add_user_device_notifications`
- `delete_user_activity`
- `delete_user_devices`
- `delete_user_device_notifications`
- `export_user_activity`
- `export_user_devices`
- `export_user_device_notifications`
- `filter_user_activity`
- `filter_user_devices`
- `filter_user_device_notifications`
- `import_user_activity`
- `import_user_devices`
- `import_user_device_notifications`
- `list_user_activity`
- `list_user_devices`
- `list_user_device_notifications`
- `search_user_activity`
- `search_user_devices`
- `search_user_device_notifications`
- `sort_user_activity`
- `sort_user_devices`
- `sort_user_device_notifications`
- `update_user_activity`
- `update_user_devices`
- `update_user_device_notifications`
- `view_user_activity`
- `view_user_devices`
- `view_user_device_notifications`

</details>

### Group 171 — `PG-FN-USERS`

- **Status:** `active`
- **Total active permissions:** 10

**By tier:** tenant: 10

<details>
<summary><b>tenant</b> (10)</summary>

- `add_users`
- `delete_users`
- `export_users`
- `filter_users`
- `import_users`
- `list_users`
- `search_users`
- `sort_users`
- `update_users`
- `view_users`

</details>

