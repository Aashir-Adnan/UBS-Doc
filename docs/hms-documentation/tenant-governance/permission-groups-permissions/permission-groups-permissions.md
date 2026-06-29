# Permission Groups → Permissions Reference

> **Source:** live `hms_db_1.9` database (regenerated 2026-06-11 from the live tables — reflects all migrations applied to date, including the persona re-model `20260609_2`/`20260609_3`, the per-tenant persona-group cloning, and the `20260611_4` Service-Manager config-catalog grants).
> **Update 2026-06-16 (RDD-write governance):** `20260616_1` revoked **`add_roles_designations_department`** + **`update_roles_designations_department`** from `PG-TENANT-MGMT` and `PG-TENANT-ADMIN`; `20260616_2` then **re-granted only `update_roles_designations_department`** (edit). Net: both personas keep **edit** but lose **create** of staff role assignments (RDDs). The look-alike `*_roles_designations_department_permissions` perms are untouched. Counts/listings below reflect this net state.
> **Generated from:** `permission_groups`, `permission_groups_permissions`, and `permissions` tables (active mappings + active permissions only).
> **Update 2026-06-16 (URDP materialization fix):** assigning a permission group to a user (URDD) now fans out **only the group's ACTIVE mappings** into `user_role_designation_permissions`. The user-grouped-CRUD fan-out (`CustomUsersGroupedCrud/syncUserRddSet.js` → `syncUrdps`) previously selected `permission_groups_permissions` **without** a `status='active'` filter, so a user assigned e.g. `PG-TENANT-MGMT` inherited every permission the group **ever** had — including the **revoked (inactive)** ones — and got `count(all mappings)` URDP instead of `count(active)`. Net: a newly assigned/updated user's active URDP now equals the **active** counts listed here (e.g. `PG-TENANT-MGMT` → its active total, not the active+inactive total). Pre-existing URDDs created before this fix may still carry stale (revoked) perms until re-materialized.
> **Update 2026-06-17 (staging↔local governance sync — regenerated from `hms_db_10.0`):** the counts and listings below now reflect the canonical dev DB `hms_db_10.0`. Migrations `20260617_4` (group matrix) + `20260617_5` (URDP materialization) bring dev/staging into line with it across the global originals **and** every per-tenant clone. Net governance changes vs. the prior `1.9` snapshot: the **`*_admin_code`** family (9 perms, tenant tier) is now granted to `PG-FRAMEWORK`, `PG-TENANT-MGMT`, `PG-TENANT-ADMIN`; **`update_users`** added to `PG-SERVICE-MGR`; `PG-TENANT-ADMIN` drops the `guest_booking_history` family; the system / QR-scan / user-device / user-activity log families stay **`PG-FRAMEWORK`-exclusive** (any dev drift onto the tenant personas is revoked). `PG-SERVICE-MGR` also reflects the booking-read grant / `booking_services`-write revoke already present in `hms_db_10.0`. New totals: `PG-FRAMEWORK` 246, `PG-TENANT-MGMT` 463, `PG-TENANT-ADMIN` 470, `PG-SERVICE-MGR` 159, `PG-STANDARD-GUEST` 0.
> **Update 2026-06-18 (Tenant-Admin permission-governance grant):** `20260618_1` grants `PG-TENANT-ADMIN` the full permission-governance set — `*_permission_groups` (5), `*_permission_groups_permissions` (5), and the `permissions` reads `view_permissions` + `list_permissions` — across the global original and every clone, and materializes the same onto every active Tenant-Admin URDD. Net new vs. the prior state was just **`view_permissions`** (the other 11 were already granted); `PG-TENANT-ADMIN` total `470 → 471` (tenant tier `336 → 337`).
> **Update 2026-06-22 (Booking Manager persona):** migration `20260622_3` adds a new persona **Booking Manager** (designation `BOOKING` + role `Manager`, RDD title "Manager of Bookings", per-tenant senior = the Tenant-Admin RDD) with a new permission group **`PG-BOOKING-MGR`** (global original + a per-tenant clone for every active tenant). It also creates the new permission **`booking_manager_dashboard`**. `PG-BOOKING-MGR` = **34** perms: full CRUD on `bookings` + `booking_services` (9 actions each) + `privacy_policy` + `account`; read-only (`view`/`list`) on `services` / `packages` / `package_services` / `service_categories` / `users` / `guest_profiles`; plus `dashboard` + `booking_manager_dashboard`. (Tenants without a Tenant-Admin RDD are skipped until one exists — see the migration note.)
> **Update 2026-06-29 (`import_*` permission family):** migration `20260629_2_add_import_permissions_mirroring_export` adds an `import_<resource>` permission for **every active `export_<resource>`** (80 new perms in the catalog) and grants each to **every group that already holds the matching `export_*`** — the global originals **and** every per-tenant clone. So "import" tracks "export" 1:1 in both the catalog and group memberships. Per-persona increments (= that persona's active `export_*` count): `PG-FRAMEWORK` **+27**, `PG-TENANT-MGMT` **+49**, `PG-TENANT-ADMIN` **+51**, `PG-SERVICE-MGR` **+15**, `PG-BOOKING-MGR` **+2** (`PG-STANDARD-GUEST` unchanged). The per-group listings below show only the `export_*` half — for each `export_*` a group holds, read in the matching `import_*` (same tier/category). New `import_*` descriptions mirror the export wording (`Download (export) …` → `Upload (import) …`; the bespoke `import_admin_code` reads "Import admin codes").
> **Context:** [governance-model.md](../tenant-governance-model/governance-model.md) (personas, the `created_by` isolation rule), [per-tenant-cloning.md](../per-tenant-cloning/per-tenant-cloning.md) (how per-tenant group clones are created), and [resource-assignments.md](../per-tenant-resource-assignment/resource-assignments.md). Backend design docs: `docs/strategies/superadmin_tenant_governance_strategy.md`, `docs/strategies/tenant_admin_assignment.md`, `docs/system_context/07_rbac.md`.

This document lists **every permission assigned to each governance permission group**, taken directly from the `permission_groups_permissions` join table. Only rows with `status = 'active'` in the join table **and** an active `permissions` row are counted. Permissions are grouped by their `permission_category` tier and sorted alphabetically.

> **Current governance totals:** `PG-FRAMEWORK` 246, `PG-TENANT-MGMT` 463, `PG-TENANT-ADMIN` 471, `PG-SERVICE-MGR` 159, `PG-STANDARD-GUEST` 0, `PG-BOOKING-MGR` 34. *(PG-TENANT-MGMT/ADMIN each −1 vs. pre-2026-06-16: `add_roles_designations_department` revoked, see the RDD-write note above; `PG-TENANT-ADMIN` +1 on 2026-06-18 = `view_permissions`.)* System/QR logs remain SaaS-Admin-exclusive (`PG-FRAMEWORK`). `PG-SERVICE-MGR` now also carries 20 framework config-catalog reads + 3 `manage_config_*` perms (`20260611_4`). Persona codes shown are the re-modelled ones (`SYSTEM`/`TENANT`/`STANDARD`, role-disambiguated).

## 1. Permission groups overview

### 1.1 Global governance groups (`is_global = 1` / `tenant_id IS NULL`)

| `permission_group_id` | Group name | Status | Active permissions | Persona (per strategy) |
|---|---|---|---:|---|
| 9 | `PG-FRAMEWORK` | active | 246 | SaaS Admin (`SYSTEM` + `Admin`) |
| 10 | `PG-TENANT-MGMT` | active | 463 | Tenant Manager (`TENANT` + `Manager`) |
| 11 | `PG-TENANT-ADMIN` | active | 471 | Tenant Admin (`TENANT` + `Admin`) |
| 12 | `PG-SERVICE-MGR` | active | 159 | Service Manager (`<service-category>` designation, e.g. `STAY`) |
| 19 | `PG-STANDARD-GUEST` | active | 0 | Standard Guest (`STANDARD`) |
| _(new, `20260622_3`)_ | `PG-BOOKING-MGR` | active | 34 | Booking Manager (`BOOKING` + `Manager`) |

> **Governance groups** are the active global rows **9–12** plus **19** (`PG-STANDARD-GUEST`, guest persona — no permissions seeded yet) and **`PG-BOOKING-MGR`** (added 2026-06-22). These six are the active permission groups in the governance model.


### 1.2 Per-tenant cloned governance groups (ids 20–91)

Tenant onboarding clones a subset of the governance groups per tenant (`tenant_id` set, `is_global = 0`, owned by URDD-B'). Each clone **mirrors the permission set of its global original** and is stamped with the persona's `role_id`/`designation_id`. `PG-FRAMEWORK` and `PG-TENANT-MGMT` are **not** cloned per tenant (platform/system only). 24 tenants currently have clones.

| Cloned group | # tenant clones | id range | Active permissions each | Mirrors original |
|---|---:|---|---:|---|
| `PG-SERVICE-MGR` | 24 | 21–90 | 159 | Group 12 |
| `PG-STANDARD-GUEST` | 24 | 22–91 | 0 | Group 19 |
| `PG-TENANT-ADMIN` | 24 | 20–89 | 471 | Group 11 |
| `PG-BOOKING-MGR` | per active tenant (`20260622_3`) | _(assigned at migration)_ | 34 | the global `PG-BOOKING-MGR` |

## 2. Permissions per group

The global governance originals in detail. Per-tenant clones of `PG-TENANT-ADMIN` / `PG-SERVICE-MGR` / `PG-STANDARD-GUEST` carry the same sets shown here for groups 11 / 12 / 19.

### Group 9 — `PG-FRAMEWORK`

*SaaS Admin — full framework access plus global config management*

- **Status:** `active`
- **Total active permissions:** 246

**By tier:** framework: 180, tenant: 65, common: 1

<details>
<summary><b>framework</b> (180)</summary>

- `add_audit_logs`
- `add_crash_log`
- `add_currencies`
- `add_email_log`
- `add_error_log`
- `add_hms_config`
- `add_hms_config_categories`
- `add_hms_config_keys`
- `add_hms_scenario_config`
- `add_hms_scope_types`
- `add_language_codes`
- `add_payment_providers`
- `add_platforms`
- `add_platform_versions`
- `add_security_log`
- `add_service_categories`
- `add_supported_payment_methods`
- `add_templates`
- `add_translated_entries`
- `add_versions`
- `delete_audit_logs`
- `delete_crash_log`
- `delete_currencies`
- `delete_email_log`
- `delete_error_log`
- `delete_hms_config`
- `delete_hms_config_categories`
- `delete_hms_config_keys`
- `delete_hms_scenario_config`
- `delete_hms_scope_types`
- `delete_language_codes`
- `delete_payment_providers`
- `delete_platforms`
- `delete_platform_versions`
- `delete_security_log`
- `delete_service_categories`
- `delete_supported_payment_methods`
- `delete_templates`
- `delete_translated_entries`
- `delete_versions`
- `export_audit_logs`
- `export_crash_log`
- `export_currencies`
- `export_email_log`
- `export_error_log`
- `export_hms_config`
- `export_hms_config_categories`
- `export_hms_config_keys`
- `export_hms_scenario_config`
- `export_hms_scope_types`
- `export_language_codes`
- `export_payment_providers`
- `export_platforms`
- `export_platform_versions`
- `export_security_log`
- `export_service_categories`
- `export_supported_payment_methods`
- `export_templates`
- `export_translated_entries`
- `export_versions`
- `filter_audit_logs`
- `filter_crash_log`
- `filter_currencies`
- `filter_email_log`
- `filter_error_log`
- `filter_hms_config`
- `filter_hms_config_categories`
- `filter_hms_config_keys`
- `filter_hms_scenario_config`
- `filter_hms_scope_types`
- `filter_language_codes`
- `filter_payment_providers`
- `filter_platforms`
- `filter_platform_versions`
- `filter_security_log`
- `filter_service_categories`
- `filter_supported_payment_methods`
- `filter_templates`
- `filter_translated_entries`
- `filter_versions`
- `list_audit_logs`
- `list_crash_log`
- `list_currencies`
- `list_email_log`
- `list_error_log`
- `list_hms_config`
- `list_hms_config_categories`
- `list_hms_config_keys`
- `list_hms_scenario_config`
- `list_hms_scope_types`
- `list_language_codes`
- `list_payment_providers`
- `list_platforms`
- `list_platform_versions`
- `list_security_log`
- `list_service_categories`
- `list_supported_payment_methods`
- `list_templates`
- `list_translated_entries`
- `list_versions`
- `search_audit_logs`
- `search_crash_log`
- `search_currencies`
- `search_email_log`
- `search_error_log`
- `search_hms_config`
- `search_hms_config_categories`
- `search_hms_config_keys`
- `search_hms_scenario_config`
- `search_hms_scope_types`
- `search_language_codes`
- `search_payment_providers`
- `search_platforms`
- `search_platform_versions`
- `search_security_log`
- `search_service_categories`
- `search_supported_payment_methods`
- `search_templates`
- `search_translated_entries`
- `search_versions`
- `sort_audit_logs`
- `sort_crash_log`
- `sort_currencies`
- `sort_email_log`
- `sort_error_log`
- `sort_hms_config`
- `sort_hms_config_categories`
- `sort_hms_config_keys`
- `sort_hms_scenario_config`
- `sort_hms_scope_types`
- `sort_language_codes`
- `sort_payment_providers`
- `sort_platforms`
- `sort_platform_versions`
- `sort_security_log`
- `sort_service_categories`
- `sort_supported_payment_methods`
- `sort_templates`
- `sort_translated_entries`
- `sort_versions`
- `update_audit_logs`
- `update_crash_log`
- `update_currencies`
- `update_email_log`
- `update_error_log`
- `update_hms_config`
- `update_hms_config_categories`
- `update_hms_config_keys`
- `update_hms_scenario_config`
- `update_hms_scope_types`
- `update_language_codes`
- `update_payment_providers`
- `update_platforms`
- `update_platform_versions`
- `update_security_log`
- `update_service_categories`
- `update_supported_payment_methods`
- `update_templates`
- `update_translated_entries`
- `update_versions`
- `view_audit_logs`
- `view_crash_log`
- `view_currencies`
- `view_email_log`
- `view_error_log`
- `view_hms_config`
- `view_hms_config_categories`
- `view_hms_config_keys`
- `view_hms_scenario_config`
- `view_hms_scope_types`
- `view_language_codes`
- `view_payment_providers`
- `view_platforms`
- `view_platform_versions`
- `view_security_log`
- `view_service_categories`
- `view_supported_payment_methods`
- `view_templates`
- `view_translated_entries`
- `view_versions`

</details>

<details>
<summary><b>tenant</b> (65)</summary>

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

<details>
<summary><b>common</b> (1)</summary>

- `saas_admin_dashboard`

</details>

### Group 10 — `PG-TENANT-MGMT`

*Tenant Manager — tenant management, all operational permissions, and assignable framework reads*

- **Status:** `active`
- **Total active permissions:** 463

**By tier:** framework: 8, tenant_mgmt: 35, tenant: 301, service: 113, common: 6

<details>
<summary><b>framework</b> (8)</summary>

- `list_hms_config_categories`
- `list_hms_config_keys`
- `list_hms_scenario_config`
- `list_service_categories`
- `view_hms_config_categories`
- `view_hms_config_keys`
- `view_hms_scenario_config`
- `view_service_categories`

</details>

<details>
<summary><b>tenant_mgmt</b> (35)</summary>

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
- `list_tenants`
- `list_tenant_domains`
- `list_tenant_settings`
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
- `update_tenants`
- `update_tenant_domains`
- `update_tenant_settings`
- `view_tenants`
- `view_tenant_domains`
- `view_tenant_settings`

</details>

<details>
<summary><b>tenant</b> (301)</summary>

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
- `add_users`
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
- `delete_permission_groups`
- `delete_permission_groups_permissions`
- `delete_plans`
- `delete_plan_groups`
- `delete_qr_codes`
- `delete_roles`
- `delete_roles_designations_department`
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
- `export_users`
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
- `list_users`
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
- `sort_users`
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
- `update_permission_groups`
- `update_permission_groups_permissions`
- `update_plans`
- `update_plan_groups`
- `update_qr_codes`
- `update_roles`
- `update_roles_designations_department`
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
- `view_users`
- `view_user_roles_designations_department`
- `view_user_role_designation_permissions`

</details>

<details>
<summary><b>service</b> (113)</summary>

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
<summary><b>common</b> (6)</summary>

- `account`
- `dashboard`
- `privacy_policy`
- `profile`
- `security`
- `tenant_manager_dashboard`

</details>

### Group 11 — `PG-TENANT-ADMIN`

*Tenant Admin — all operational permissions within one tenant*

- **Status:** `active`
- **Total active permissions:** 471

**By tier:** framework: 2, tenant: 336, service: 126, common: 6

<details>
<summary><b>framework</b> (2)</summary>

- `list_service_categories`
- `view_service_categories`

</details>

<details>
<summary><b>tenant</b> (336)</summary>

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
- `delete_memberships`
- `delete_messages`
- `delete_notifications`
- `delete_permission_groups`
- `delete_permission_groups_permissions`
- `delete_plans`
- `delete_plan_groups`
- `delete_qr_codes`
- `delete_roles`
- `delete_roles_designations_department`
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
- `export_transactions`
- `export_users`
- `export_user_payment_methods`
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
- `sort_transactions`
- `sort_users`
- `sort_user_payment_methods`
- `sort_user_roles_designations_department`
- `sort_user_role_designation_permissions`
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
- `update_permission_groups`
- `update_permission_groups_permissions`
- `update_plans`
- `update_plan_groups`
- `update_qr_codes`
- `update_roles`
- `update_roles_designations_department`
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
- `view_memberships`
- `view_messages`
- `view_notifications`
- `view_permission_groups`
- `view_permission_groups_permissions`
- `view_permissions`
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
<summary><b>common</b> (6)</summary>

- `account`
- `dashboard`
- `privacy_policy`
- `profile`
- `security`
- `tenant_admin_dashboard`

</details>

### Group 12 — `PG-SERVICE-MGR`

*Service Manager — service + common permissions, plus config-catalog reads and `manage_config_*` configure perms for its own tenant / managed category (added by `20260611_4`)*

- **Status:** `active`
- **Total active permissions:** 159

**By tier:** framework: 20, tenant: 10, service: 123, common: 6

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
<summary><b>tenant</b> (10)</summary>

- `export_bookings`
- `filter_bookings`
- `list_bookings`
- `manage_config_key_category_flags`
- `manage_config_key_user_visibility`
- `manage_config_possible_values`
- `search_bookings`
- `sort_bookings`
- `update_users`
- `view_bookings`

</details>

<details>
<summary><b>service</b> (123)</summary>

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
<summary><b>common</b> (6)</summary>

- `account`
- `dashboard`
- `privacy_policy`
- `profile`
- `security`
- `service_manager_dashboard`

</details>

### Group 19 — `PG-STANDARD-GUEST`

*Standard Guest — guest-facing permissions (none yet; populated in a later migration)*

- **Status:** `active`
- **Total active permissions:** 0

### `PG-BOOKING-MGR` (new — `20260622_3`)

*Booking Manager (`BOOKING` + `Manager`) — owns check-in & booking handling. Global original + a per-tenant clone for every active tenant (mirrors this set).*

- **Status:** `active`
- **Total active permissions:** 34
- **Full CRUD** (9 actions each — `add`/`delete`/`update`/`view`/`list`/`export`/`filter`/`search`/`sort`): `bookings`, `booking_services`
- **Singletons (full):** `privacy_policy`, `account`
- **Read-only** (`view` + `list`): `services`, `packages`, `package_services`, `service_categories`, `users`, `guest_profiles`
- **Dashboards:** `dashboard`, `booking_manager_dashboard` *(the latter is created by the same migration)*

> Not granted: `booking_items` / `booking_payments` / `guest_booking_history` (can be added if check-in needs them).

