# Dev Seed Tenant

| Operation | Method | Path | Permission |
|---|---|---|---|
| Add (seed) | POST | `/api/dev/seed/tenant` | None (`permission: null`) |

> **Dev / QA / testing only.** This endpoint runs on the **public (unencrypted) platform** with no permission gate. It exists to stand up a fully operational tenant in one call so guest-facing APIs return meaningful data. **Do not expose or invoke it in production.**

Seeds a complete tenant in a single request — the RBAC scaffold and Tenant Admin (via the same `provisionTenant` flow), all cloned framework resources (service categories, config keys, translations), and sample operational data (services, rooms, packages, pricing).

---

## Authentication & Authorization

Uses **`PUBLIC_PLATFORM`** — no encryption, no auth, no RBAC permission (`requestMetaData.permission = null`). This is intentional for a local dev/QA convenience tool and is the reason it must never be enabled in production.

---

## Request Payload

| Field | Type | Required | Default | Description |
|---|---|---|---|---|
| `tenantName` | `string` | Yes | — | Human-readable hotel name (stored as bilingual `{en,ar}` JSON). |
| `adminEmail` | `string` | Yes | — | Email for the Tenant Admin user. |
| `adminFirstName` | `string` | No | `"Tenant"` | Admin first name. |
| `adminLastName` | `string` | No | `"Admin"` | Admin last name. |
| `tenantCode` | `string` | No | auto from name | Uppercase code (e.g. `MY_HOTEL`). |
| `tenantSlug` | `string` | No | auto from name | URL slug (e.g. `my-hotel`). |
| `currencyCode` | `string` | No | `"SAR"` | Currency for catalog pricing. |

```json
{
  "tenantName": "Serenity Riyadh",
  "adminEmail": "admin@serenity-riyadh.com",
  "adminFirstName": "Omar",
  "adminLastName": "Al-Rashid"
}
```

---

## Response

```json
{
  "tenant_id": 42,
  "tenant_code": "SERENITY_RIYADH",
  "tenant_slug": "serenity-riyadh",
  "admin_user_id": 123,
  "admin_email": "admin@serenity-riyadh.com",
  "urdd_b_prime": 456,
  "urdd_c": 789,
  "mirror_summary": { "rolesMirrored": 5, "departmentsMirrored": 3 },
  "categories_cloned": 9,
  "config_keys_cloned": 18,
  "config_key_errors": [],
  "services_created": 14,
  "delivery_units_created": 8,
  "packages_created": 3,
  "catalog_prices_created": 17,
  "additional_permissions": 12
}
```

| Field | Type | Description |
|---|---|---|
| `tenant_id` | `number` | The seeded tenant id. |
| `tenant_code` / `tenant_slug` | `string` | Resolved code and slug. |
| `admin_user_id` / `admin_email` | | The Tenant Admin user id and email. |
| `urdd_b_prime` / `urdd_c` | `number` | Tenant-Manager and Tenant-Admin URDDs for the new tenant. |
| `mirror_summary` | `object` | Counts of mirrored roles/departments/designations/RDDs. |
| `categories_cloned` | `number` | Global service categories cloned (9). |
| `config_keys_cloned` | `number` | Global config keys cloned. |
| `config_key_errors` | `array` | Any per-config-key clone errors. |
| `services_created` | `number` | Sample services created (14). |
| `delivery_units_created` | `number` | Rooms/suites created (8). |
| `packages_created` | `number` | Sample packages created (3). |
| `catalog_prices_created` | `number` | Catalog price rows created (17). |
| `additional_permissions` | `number` | Extra Admin-group permissions added to the admin URDD. |

---

## Behavior

The seed runs in phases:

- **Phase 1 — Tenant provisioning.** Delegates to the same `provisionTenant` flow used by production provisioning: tenant row, Tenant-Manager URDD-B', mirrored org dictionary, persona permission groups (PG-TENANT-ADMIN, PG-SERVICE-MGR, PG-STANDARD-GUEST clones), per-tenant Guest RDD and Tenant-Admin RDD, the Tenant Admin user, and URDD-C with PG-TENANT-ADMIN permissions.
- **Phase 2a — Framework resource cloning.** Clones all 9 global service categories (STAY, DINE, SPA, BARB, GYM, KIDS, TRANS, NET, RMSVC), per-category Service Manager RDDs, all global config keys, config values/possible-values scoped to owned categories, and translations.
- **Phase 2b — Operational data.** Creates 14 services, a root hotel location plus one per category, service-location links, 8 delivery units (5 Deluxe rooms 101–105 + 3 Executive suites 201–203), 3 packages with their service links, and 17 catalog prices.
- **Phase 2c — Permission broadening.** Adds every permission from any `permission_groups` where `role_name = 'Admin'` to the admin URDD-C, beyond what PG-TENANT-ADMIN provides.

The result is a tenant where every guest-facing API (hotels, landing, categories, availability, bookings, profile, loyalty, favorites) returns meaningful data. See the directory README for the full guest-API-to-seed-data audit.

---

## Source Files

| File | Purpose |
|---|---|
| `Src/Apis/ProjectSpecificApis/DevSeedTenant/DevSeedTenant.js` | API object (public platform, Add-only). |
| `Src/Apis/ProjectSpecificApis/DevSeedTenant/CRUD_parameters.js` | Request field schema. |
| `Src/Apis/ProjectSpecificApis/DevSeedTenant/README.md` | Full seed contents + guest-API data audit. |
| `Src/HelperFunctions/PreProcessingFunctions/DevSeedTenant/seedTenantForDev.js` | The multi-phase seeding logic (Add preProcess). |
| `Src/HelperFunctions/PreProcessingFunctions/TenantProvisioningGroupedCrud/provisionTenant.js` | Phase 1 tenant provisioning (reused). |
