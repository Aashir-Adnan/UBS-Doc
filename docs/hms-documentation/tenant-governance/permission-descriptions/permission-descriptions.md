# Permission Descriptions (plain-language)

> **Purpose.** Specify the idempotent migration that populates the
> `permissions.permission_description` column for **every** permission row, so each
> permission carries a **clear, plain-language** description.
>
> **Audience of the text — read this first.** Descriptions are shown in permission-picker
> UIs to people assigning access to roles. Many of those people are **non-technical**
> (a hotel's **Tenant Admin**, a **Service Manager**) — not just SaaS Admins / Tenant
> Managers. So the wording must be understandable to a non-technical hotel operator:
> - **No internal jargon or acronyms.** Never write "RDD", "URDP", "HMS config key",
>   "enabled_for flag", "join table", "fan-out". Expand them into everyday terms
>   ("staff role assignment", "a user's access rights", "configurable setting",
>   "whether a setting is shown to guests").
> - **Say what the user can *do*, in business terms** ("Add new guest bookings."), not how
>   the system stores it.
> - A short clarifying phrase in parentheses is encouraged for anything non-obvious
>   (e.g. *delivery units (e.g. rooms, tables, time slots)*).
>
> **Safe on live.** The migration runs on boot (→ `migrations_completed/`): it resolves
> nothing by hard-coded id and keys strictly on `permission_name`.
>
> **Related:** [permission-groups-permissions.md](../permission-groups-permissions/permission-groups-permissions.md)
> (which permission each group holds) · [governance-model.md](../tenant-governance-model/governance-model.md)
> (personas, the `created_by` isolation rule). Backend design docs:
> `docs/strategies/superadmin_tenant_governance_strategy.md`,
> `docs/strategies/tenant_admin_assignment.md`, `docs/system_context/07_rbac.md`,
> `docs/system_context/12_migrations.md`.
>
> **Update 2026-06-29 (`import_*` family — gated on `add_`/create).** Migration
> `20260629_2_add_import_permissions_mirroring_add_create` adds an `import_<resource>`
> permission for every active **`add_<resource>`** (81 today — every createable
> resource, incl. `frontpage_data`) and grants/materializes it wherever the holder has
> `add_X` (NOT `export_X`): importing creates records, so it follows the CREATE perm.
> Descriptions read *"Upload (import) \<label>."* — derived from the `add` wording
> (`Add new …` → `Upload (import) …`; the bespoke `import_admin_code` = *"Import admin
> codes"*). The `import` verb is in the §2.1 phrase-prefix table below; everything else
> in this guide (resource labels, idempotency, verification) applies unchanged.
>
> **Update 2026-07-02 (signature-dashboard `permission_category` retier).** Migration
> `20260702_1_set_signature_dashboard_permission_categories` gives each persona **signature
> dashboard** permission a tier-accurate `permission_category` (so an actor's tier is derived
> from `permissions.permission_category`, never from group names): `saas_admin_dashboard`→
> `framework`, `tenant_manager_dashboard`→`tenant_mgmt`, `tenant_admin_dashboard`→`tenant`,
> `service_manager_dashboard`→`service`, `booking_manager_dashboard`→`service` (was
> uncategorized/NULL); the generic `dashboard` stays `common`. This moves **only**
> `permission_category` — descriptions are untouched. Live active category breakdown refreshed
> in §1.1.
>
> **Update 2026-07-21 (two new resources — `api_logs` + `hms_tenants_config`).** Three
> migrations add nine permissions that follow these conventions unchanged (standard
> `<verb>_<resource>` names, plain-language descriptions, and the Arabic description pre-seeded
> into `translated_entries` by the migration itself so the runtime translator skips them):
>
> | migration | permissions | tier |
> |---|---|---|
> | `20260713_2…checkin_checkout…` (Step 6) | `list` / `view` / `delete` / `export_api_logs` | `framework` |
> | `20260720_3_add_api_logs_perms_to_pg_fn_logs` | `search_api_logs` | `framework` |
> | `20260721_2_add_hms_tenants_config_perms_to_tenant_admin` | `list` / `view` / `add` / `delete_hms_tenants_config` | `tenant` |
>
> Both resources are registered in the §2.2 label tables below. Note the deliberate tier split:
> **`api_logs` is `framework`** (the platform's own request/response log, sibling of
> `audit_logs`), while **`hms_tenants_config` is `tenant`** — the hotel-facing counterpart of the
> framework-tier `hms_config` catalogue, so a Tenant Admin owns it. Who receives them is covered
> in the Permission Groups → Permissions reference (2026-07-21 note).

---

## 1. Pre-backfill snapshot (verified on `hms_db_1.9`, 2026-06-09)

*(The original state this migration was written against — descriptions all NULL. For the
live catalog today see §1.1 below.)*

`permissions` schema (relevant columns):

| Column | Type | Notes |
|---|---|---|
| `permission_id` | `int` PK auto | — |
| `permission_name` | `varchar(255)` | the natural key, `<action>_<resource>` for CRUD perms |
| `permission_key` | `varchar(255)` | currently `NULL` everywhere |
| **`permission_description`** | `text` | **`NULL` on all 742 rows — this migration fills it** |
| `permission_category` | `varchar(100)` | tier: `framework` / `tenant_mgmt` / `tenant` / `service` / `common` |
| `status` | `enum('active','inactive')` | 731 active, 11 inactive |

Counts:

| Metric | Value |
|---|---:|
| Total permission rows | **742** |
| Rows with a non-empty `permission_description` | **0** |
| Rows with `NULL`/empty description | **742** |
| Active | 731 |
| Distinct categories | 5 |

Category breakdown: `framework` 180 · `tenant` 384 · `service` 126 · `tenant_mgmt` 43 · `common` 9.

**Shape of the data.** 9 standard CRUD verbs × **79 resources** = 711 permissions, plus a
small set of special (non-CRUD) permissions. The 9 standard leading verbs are:
`list`, `add`, `update`, `delete`, `view`, `export`, `filter`, `sort`, `search`
(each appears 79 times).

### 1.1 Live catalog (regenerated 2026-06-30 from `hms_db_10.0`)

The catalog has grown since the backfill (new resources, the Booking-Manager / dashboard
perms, the `*_admin_code` family, and the **`import_*`** family — see the verb note below).
Descriptions are now filled (this migration ran), so only governance/runtime additions
remain to describe.

| Metric | Value |
|---|---:|
| Total permission rows | **838** |
| Active | **827** |
| Rows with a non-empty `permission_description` | **837** |
| Rows with `NULL`/empty description | **1** |

Category breakdown (active, refreshed 2026-07-02 after `20260702_1`): `tenant` 434 ·
`framework` 207 · `service` 142 · `tenant_mgmt` 39 · `common` 5 — **no uncategorized rows**
(that migration categorized `booking_manager_dashboard`). The four persona signature dashboards
left `common` for their tier; the generic `dashboard` remains `common`. *(Prior to `20260702_1`:
`tenant` 433 · `framework` 206 · `service` 140 · `tenant_mgmt` 38 · `common` 9 + 1 uncategorized.)*

**Verbs (active).** The 9 original verbs now sit at **81** each (resource set grew), and a
**10th** standard verb — **`import`** (81) — was added 2026-06-29 (gated on `add_`/create;
descriptions read "Upload (import) …"). `export`/`filter`/`sort`/`search` are at 80 (no
`export_frontpage_data`). New `import_*` descriptions are produced by the import migration,
not by §4/§5 below.

> **Duplicates note.** Several `tenant`/`tenant_mgmt` special permissions exist as **two
> rows** (one `active`, one `inactive`) sharing the same `permission_name` (e.g.
> `manage_config_possible_values`, `assign_*_to_tenant`, `revoke_*_from_tenant`). Keying on
> `permission_name` updates **both** copies — which is the desired behaviour (the description
> describes the capability, regardless of row status). No id targeting is needed.

---

## 2. Description convention (plain-language)

A description is composed as **`<action phrase> <resource label>.`** for the standard
CRUD permissions, and a **bespoke plain sentence** for each special permission (§5).

### 2.1 Action phrase (leading verb → everyday text)

Each verb maps to a full prefix; the suffix is always a period. The resource labels (§2.2)
are written to read naturally after every prefix.

| Leading verb | Phrase prefix | Example (`bookings`) |
|---|---|---|
| `list`   | `See the list of `              | `See the list of guest bookings.` |
| `view`   | `View detailed information about ` | `View detailed information about guest bookings.` |
| `add`    | `Add new `                      | `Add new guest bookings.` |
| `update` | `Edit existing `                | `Edit existing guest bookings.` |
| `delete` | `Delete `                       | `Delete guest bookings.` |
| `export` | `Download (export) `            | `Download (export) guest bookings.` |
| `import` | `Upload (import) `              | `Upload (import) guest bookings.` |
| `filter` | `Filter the list of `           | `Filter the list of guest bookings.` |
| `sort`   | `Sort the list of `             | `Sort the list of guest bookings.` |
| `search` | `Search for `                   | `Search for guest bookings.` |

### 2.2 Resource labels (the `_<resource>` suffix → plain noun phrase)

Labels are plural, jargon-free, and carry a short clarifying parenthetical wherever the bare
term wouldn't be obvious to a non-technical hotel operator. Grouped by the resource's
`permission_category`.

**`framework`** — system-wide reference data; a Tenant Admin rarely touches these, but the
wording must still be plain.

| resource | label |
|---|---|
| `api_logs` | API request/response log records |
| `audit_logs` | activity audit records (who changed what) |
| `crash_log` | application crash records |
| `currencies` | currencies |
| `email_log` | records of emails the system has sent |
| `error_log` | system error records |
| `hms_config` | system setting values |
| `hms_config_categories` | groups of system settings |
| `hms_config_keys` | configurable settings |
| `hms_scenario_config` | scenario-based settings |
| `hms_scope_types` | setting scope types |
| `language_codes` | supported languages |
| `payment_providers` | payment providers (card/online gateways) |
| `platforms` | platforms (web, mobile app, etc.) |
| `platform_versions` | platform version records |
| `security_log` | security event records |
| `service_categories` | service categories (e.g. Stay, Dining, Spa) |
| `supported_payment_methods` | accepted payment methods |
| `templates` | message and document templates |
| `translated_entries` | translated text shown across the app |
| `versions` | app version records |

**`service`**

| resource | label |
|---|---|
| `booking_services` | services added to a booking |
| `delivery_units` | bookable units (e.g. rooms, tables, time slots) |
| `discounts` | discounts |
| `inventory_items` | inventory items |
| `inventory_variants` | inventory item variations (e.g. size, type) |
| `packages` | service packages |
| `package_pricing` | package prices |
| `package_services` | the services included in a package |
| `pricing_rules` | pricing rules |
| `services` | services offered to guests |
| `service_locations` | service locations |
| `service_location_attributes` | service location details |
| `service_pricing` | service prices |
| `unit_availability` | availability of bookable units |

**`tenant`** — the day-to-day data a hotel operates on.

| resource | label |
|---|---|
| `attachments` | uploaded files |
| `bookings` | guest bookings |
| `booking_items` | items within a booking |
| `booking_payments` | payments made on bookings |
| `chatting_groups` | chat groups |
| `chatting_group_members` | members of a chat group |
| `departments` | staff departments |
| `designations` | staff job titles |
| `device_otp` | device one-time login codes |
| `dynamic_attachments` | form-based file uploads |
| `guest_booking_history` | a guest's past bookings |
| `guest_profiles` | guest profiles |
| `hms_tenants_config` | the hotel's own setting values |
| `memberships` | guest memberships |
| `messages` | chat messages |
| `notifications` | notifications |
| `permissions` | individual access permissions |
| `permission_groups` | permission groups (ready-made bundles of access) |
| `permission_groups_permissions` | which permissions belong to each permission group |
| `plans` | membership/subscription plans |
| `plan_groups` | groups of plans |
| `qr_codes` | QR codes |
| `qr_scan_logs` | QR code scan records |
| `roles` | staff roles |
| `roles_designations_department` | staff role assignments (role + job title + department) |
| `roles_designations_department_permissions` | the access rights given to each staff role assignment |
| `tasks` | staff tasks |
| `task_categories` | task categories |
| `task_comments` | comments on tasks |
| `task_flows` | task workflows |
| `task_flow_steps` | steps within a task workflow |
| `task_history` | task change history |
| `task_priorities` | task priority levels |
| `task_statuses` | task statuses |
| `task_watchers` | people following a task |
| `transactions` | financial transactions |
| `users` | user accounts |
| `user_activity` | user activity records |
| `user_devices` | devices a user has signed in from |
| `user_device_notifications` | notifications sent to users' devices |
| `user_payment_methods` | a user's saved payment methods |
| `user_roles_designations_department` | which roles each user holds |
| `user_role_designation_permissions` | the access rights given to each user |

**`tenant_mgmt`**

| resource | label |
|---|---|
| `tenants` | hotels/properties (tenants) |
| `tenant_domains` | a hotel's web addresses |
| `tenant_settings` | hotel-level settings |

> **Maintenance rule.** If a new `<action>_<resource>` permission is ever added whose
> resource is **not** in the table above, the CASE composition (§4) yields a `NULL` resource
> label → `permission_description` stays `NULL` and the verification query (§6) flags it. Add
> the new plain-language label and re-run. The migration never invents a label from the raw
> snake_case name (which would read poorly **and** technically, e.g. "Hms Config Keys").

---

## 3. Migration design principles

1. **Idempotent.** Every `UPDATE` is guarded by
   `(permission_description IS NULL OR permission_description = '')`. After the first run no
   row matches → re-running is a no-op. It will **not** overwrite a description a human later
   curated by hand.
2. **No hard-coded ids.** Keyed entirely on `permission_name` and the parsed
   `action`/`resource`. Safe to run on any environment (dev, staging, live).
3. **Set-based, minimal.** One composition `UPDATE` covers all standard CRUD permissions; one
   short batch covers the special permissions (§5). The two sets are disjoint (no special
   permission starts with a CRUD verb), so they never collide.
4. **Status-agnostic.** Matching by name updates both `active` and `inactive` duplicate rows.
5. **Plain-language (§2 audience rule).** No jargon/acronyms in any stored description.

**Filename:** `backend/data/migrations/20260609_1_backfill_permission_descriptions.sql`.

---

## 4. Step 1 — compose descriptions for the standard CRUD permissions

Parse `action = SUBSTRING_INDEX(permission_name,'_',1)` and
`resource = SUBSTRING(permission_name, LOCATE('_',permission_name)+1)`, then `CONCAT` the
action prefix + resource label + period. The `WHERE` restricts to the CRUD verbs and the
idempotency guard.

```sql
-- ─── Step 1: standard <action>_<resource> permissions (plain-language) ──────────
UPDATE permissions
SET permission_description = CONCAT(
  CASE SUBSTRING_INDEX(permission_name,'_',1)
    WHEN 'list'   THEN 'See the list of '
    WHEN 'view'   THEN 'View detailed information about '
    WHEN 'add'    THEN 'Add new '
    WHEN 'update' THEN 'Edit existing '
    WHEN 'delete' THEN 'Delete '
    WHEN 'export' THEN 'Download (export) '
    WHEN 'filter' THEN 'Filter the list of '
    WHEN 'sort'   THEN 'Sort the list of '
    WHEN 'search' THEN 'Search for '
  END,
  CASE SUBSTRING(permission_name, LOCATE('_',permission_name)+1)
    -- framework
    WHEN 'audit_logs'                  THEN 'activity audit records (who changed what)'
    WHEN 'crash_log'                   THEN 'application crash records'
    WHEN 'currencies'                  THEN 'currencies'
    WHEN 'email_log'                   THEN 'records of emails the system has sent'
    WHEN 'error_log'                   THEN 'system error records'
    WHEN 'hms_config'                  THEN 'system setting(used to create service/package) values'
    WHEN 'hms_config_categories'       THEN 'groups of system settings(used to create service/package)'
    WHEN 'hms_config_keys'             THEN 'configurable settings(used to create service/package)'
    WHEN 'hms_scenario_config'         THEN 'scenario-based settings(used to create service/package)'
    WHEN 'hms_scope_types'             THEN 'setting scope types'
    WHEN 'language_codes'              THEN 'supported languages'
    WHEN 'payment_providers'           THEN 'payment providers (card/online gateways)'
    WHEN 'platforms'                   THEN 'platforms (web, mobile app, etc.)'
    WHEN 'platform_versions'           THEN 'platform version records'
    WHEN 'security_log'                THEN 'security event records'
    WHEN 'service_categories'          THEN 'service categories (e.g. Stay, Dining, Spa)'
    WHEN 'supported_payment_methods'   THEN 'accepted payment methods'
    WHEN 'templates'                   THEN 'message and document templates'
    WHEN 'translated_entries'          THEN 'translated text shown across the app'
    WHEN 'versions'                    THEN 'app version records'
    -- service
    WHEN 'booking_services'            THEN 'services added to a booking'
    WHEN 'delivery_units'              THEN 'bookable units (e.g. rooms, tables, time slots)'
    WHEN 'discounts'                   THEN 'discounts'
    WHEN 'inventory_items'             THEN 'inventory items'
    WHEN 'inventory_variants'          THEN 'inventory item variations (e.g. size, type)'
    WHEN 'packages'                    THEN 'service packages'
    WHEN 'package_pricing'             THEN 'package prices'
    WHEN 'package_services'            THEN 'the services included in a package'
    WHEN 'pricing_rules'               THEN 'pricing rules'
    WHEN 'services'                    THEN 'services offered to guests'
    WHEN 'service_locations'           THEN 'service locations'
    WHEN 'service_location_attributes' THEN 'service location details'
    WHEN 'service_pricing'             THEN 'service prices'
    WHEN 'unit_availability'           THEN 'availability of bookable units'
    -- tenant
    WHEN 'attachments'                 THEN 'uploaded files'
    WHEN 'bookings'                    THEN 'guest bookings'
    WHEN 'booking_items'               THEN 'items within a booking'
    WHEN 'booking_payments'            THEN 'payments made on bookings'
    WHEN 'chatting_groups'             THEN 'chat groups'
    WHEN 'chatting_group_members'      THEN 'members of a chat group'
    WHEN 'departments'                 THEN 'staff departments'
    WHEN 'designations'                THEN 'staff job titles'
    WHEN 'device_otp'                  THEN 'device one-time login codes'
    WHEN 'dynamic_attachments'         THEN 'form-based file uploads'
    WHEN 'guest_booking_history'       THEN 'a guest''s past bookings'
    WHEN 'guest_profiles'              THEN 'guest profiles'
    WHEN 'memberships'                 THEN 'guest memberships'
    WHEN 'messages'                    THEN 'chat messages'
    WHEN 'notifications'               THEN 'notifications'
    WHEN 'permissions'                 THEN 'individual access permissions'
    WHEN 'permission_groups'           THEN 'permission groups (ready-made bundles of access)'
    WHEN 'permission_groups_permissions' THEN 'which permissions belong to each permission group'
    WHEN 'plans'                       THEN 'membership/subscription plans'
    WHEN 'plan_groups'                 THEN 'groups of plans'
    WHEN 'qr_codes'                    THEN 'QR codes'
    WHEN 'qr_scan_logs'                THEN 'QR code scan records'
    WHEN 'roles'                       THEN 'staff roles'
    WHEN 'roles_designations_department' THEN 'staff role assignments (role + job title + department)'
    WHEN 'roles_designations_department_permissions' THEN 'the access rights given to each staff role assignment'
    WHEN 'tasks'                       THEN 'staff tasks'
    WHEN 'task_categories'             THEN 'task categories'
    WHEN 'task_comments'               THEN 'comments on tasks'
    WHEN 'task_flows'                  THEN 'task workflows'
    WHEN 'task_flow_steps'             THEN 'steps within a task workflow'
    WHEN 'task_history'                THEN 'task change history'
    WHEN 'task_priorities'             THEN 'task priority levels'
    WHEN 'task_statuses'               THEN 'task statuses'
    WHEN 'task_watchers'               THEN 'people following a task'
    WHEN 'transactions'                THEN 'financial transactions'
    WHEN 'users'                       THEN 'user accounts'
    WHEN 'user_activity'               THEN 'user activity records'
    WHEN 'user_devices'                THEN 'devices a user has signed in from'
    WHEN 'user_device_notifications'   THEN 'notifications sent to users'' devices'
    WHEN 'user_payment_methods'        THEN 'a user''s saved payment methods'
    WHEN 'user_roles_designations_department' THEN 'which roles each user holds'
    WHEN 'user_role_designation_permissions'  THEN 'the access rights given to each user'
    -- tenant_mgmt
    WHEN 'tenants'                     THEN 'hotels/properties (tenants)'
    WHEN 'tenant_domains'              THEN 'a hotel''s web addresses'
    WHEN 'tenant_settings'             THEN 'hotel-level settings'
    ELSE NULL   -- unknown resource → leaves description NULL; verification (§6) flags it
  END,
  '.'
)
WHERE SUBSTRING_INDEX(permission_name,'_',1)
        IN ('list','add','update','delete','view','export','filter','sort','search')
  AND (permission_description IS NULL OR permission_description = '');
```

> **Note on escaped quotes.** Apostrophes inside labels (`a guest''s past bookings`,
> `users'' devices`) are doubled for SQL string literals — keep them when copying.
>
> **Guard against the `ELSE NULL`.** If any resource falls through to `ELSE NULL`, the whole
> `CONCAT` becomes `NULL` and that row is left for the §6 check to catch — fix the label and
> re-run.

> **`import_*` are NOT composed here.** The `import` verb isn't in the Step-1 WHERE list — the
> `import_*` descriptions are produced by the import migration
> (`20260629_2_add_import_permissions_mirroring_add_create`), which derives them from the
> matching `add_*` row (`Add new …` → `Upload (import) …`).

---

## 5. Step 2 — plain descriptions for special (non-CRUD) permissions

These do not follow `<action>_<resource>` and are **excluded** from Step 1 (none start with a
CRUD verb). Set each explicitly, in everyday language. Same idempotency guard. Keying on
`permission_name` covers the active + inactive duplicate rows together.

```sql
-- ─── Step 2: special permissions — plain-language ───────────────────────────────
UPDATE permissions SET permission_description = CASE permission_name
  -- common (screens / navigation)
  WHEN 'account'                    THEN 'Open the account area.'
  WHEN 'dashboard'                  THEN 'Open the main dashboard.'
  WHEN 'privacy_policy'             THEN 'Read the privacy policy.'
  WHEN 'profile'                    THEN 'Open the personal profile area.'
  WHEN 'security'                   THEN 'Open the security settings area.'
  WHEN 'saas_admin_dashboard'       THEN 'Open the SaaS Admin dashboard.'
  WHEN 'service_manager_dashboard'  THEN 'Open the Service Manager dashboard.'
  WHEN 'tenant_admin_dashboard'     THEN 'Open the Tenant Admin dashboard.'
  WHEN 'tenant_manager_dashboard'   THEN 'Open the Tenant Manager dashboard.'
  -- managing configurable settings
  WHEN 'manage_config_possible_values'      THEN 'Manage the list of allowed options for a configurable setting.'
  WHEN 'manage_config_key_category_flags'   THEN 'Choose which service categories a setting applies to.'
  WHEN 'manage_config_key_user_visibility'  THEN 'Control whether a setting is shown to guests.'
  -- giving a hotel access to shared items
  WHEN 'assign_hms_config_keys_to_tenant'     THEN 'Give a hotel access to specific configurable settings.'
  WHEN 'assign_location_type_to_tenant'       THEN 'Give a hotel access to a location type.'
  WHEN 'assign_scenario_config_to_tenant'     THEN 'Give a hotel access to a scenario-based setting.'
  WHEN 'assign_service_categories_to_tenant'  THEN 'Give a hotel access to specific service categories.'
  -- removing a hotel's access to shared items
  WHEN 'revoke_hms_config_keys_from_tenant'    THEN 'Remove a hotel''s access to specific configurable settings.'
  WHEN 'revoke_location_type_from_tenant'      THEN 'Remove a hotel''s access to a location type.'
  WHEN 'revoke_scenario_config_from_tenant'    THEN 'Remove a hotel''s access to a scenario-based setting.'
  WHEN 'revoke_service_categories_from_tenant' THEN 'Remove a hotel''s access to specific service categories.'
  ELSE permission_description
END
WHERE permission_name IN (
  'account','dashboard','privacy_policy','profile','security',
  'saas_admin_dashboard','service_manager_dashboard','tenant_admin_dashboard','tenant_manager_dashboard',
  'manage_config_possible_values','manage_config_key_category_flags','manage_config_key_user_visibility',
  'assign_hms_config_keys_to_tenant','assign_location_type_to_tenant','assign_scenario_config_to_tenant','assign_service_categories_to_tenant',
  'revoke_hms_config_keys_from_tenant','revoke_location_type_from_tenant','revoke_scenario_config_from_tenant','revoke_service_categories_from_tenant'
)
AND (permission_description IS NULL OR permission_description = '');
```

---

## 6. Verification (run after, expect zero gaps)

```sql
-- A. No permission should be left without a description.
SELECT permission_id, permission_name, permission_category
FROM permissions
WHERE permission_description IS NULL OR permission_description = '';
-- Expected: 0 rows. Any row here = a resource label missing from §2.2 / a special perm
-- missing from §5 → add it and re-run.

-- B. Spot-check a sample across tiers (confirm the wording reads plainly).
SELECT permission_name, permission_category, permission_description
FROM permissions
WHERE permission_name IN
  ('add_bookings','view_hms_config_keys','delete_service_pricing','list_tenants',
   'view_user_role_designation_permissions','add_roles_designations_department',
   'saas_admin_dashboard','assign_service_categories_to_tenant','manage_config_key_user_visibility')
ORDER BY permission_name;

-- C. Coverage count — should equal total row count.
SELECT
  (SELECT COUNT(*) FROM permissions) AS total,
  (SELECT COUNT(*) FROM permissions
     WHERE permission_description IS NOT NULL AND permission_description <> '') AS described;
```

Expected sample output for query B (note: no acronyms, no internal terms):

| permission_name | description |
|---|---|
| `add_bookings` | Add new guest bookings. |
| `add_roles_designations_department` | Add new staff role assignments (role + job title + department). |
| `assign_service_categories_to_tenant` | Give a hotel access to specific service categories. |
| `delete_service_pricing` | Delete service prices. |
| `list_tenants` | See the list of hotels/properties (tenants). |
| `manage_config_key_user_visibility` | Control whether a setting is shown to guests. |
| `saas_admin_dashboard` | Open the SaaS Admin dashboard. |
| `view_hms_config_keys` | View detailed information about configurable settings. |
| `view_user_role_designation_permissions` | View detailed information about the access rights given to each user. |

---

## 7. Idempotency & rollback

- **Idempotency.** Both steps are guarded by `permission_description IS NULL OR = ''`. A
  second run matches nothing. Hand-edited descriptions are never overwritten.
- **Rollback.** No automated rollback (the migration cannot distinguish a value it wrote from
  one written later). For a precise revert on live, restore from a pre-migration dump (verify
  on a scratch restore of a dump — never against the live DB).
