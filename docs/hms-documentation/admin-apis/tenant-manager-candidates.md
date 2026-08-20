# Tenant Manager Candidates

**Object:** `TenantsManagerCandidates_object` · **Route:** `/api/tenants/manager-candidates`

| Operation | Method | Handler | Purpose |
|---|---|---|---|
| List / View | GET | `tenantManagerCandidates` | Dropdown — every Tenant Manager (the "Select Existing User" picker) |
| Add | POST | `tenantManagerCrossRef` | Cross-reference — map Tenant-Manager membership **users ⇄ tenants** |
| Update / Delete | PUT / DELETE | — | **405** `E52 Incorrect Request Method` |

> **Renamed (2026-08).** This endpoint was previously documented as *"Tenant Admin Candidates Dropdown"* at `/api/tenants/admin/candidates/dropdown`, and returned the staff users already holding a URDD in a target tenant. It has been **replaced**: it now returns the **Tenant-Manager population** (GET) and a bidirectional **cross-reference** (POST). The object name is derived from the URL — `tenants` + `manager-candidates` → `TenantsManagerCandidates_object`.

GET resolves to `View` when the query string carries `?id=`, else `List` — both wired to the *same* handler, so the two are indistinguishable (`?id=` is ignored, not a filter).

---

## What a "Tenant Manager" is

A user holding an **active `TENANT / Manager` URDD**. The role is *cloned per tenant* (`Governance/resolveTenantManagerUrdd`), so its `role_designation_department_id` differs in every hotel — which is why every query here matches on the role **signature** (`designation_code` + `role_name`) and never on an RDD id. Codes resolve live through `personaCodes`.

Reach is decided purely by the URDD's own `tenant_id`, compared against the system tenant (resolved by natural key via `getSystemTenantId`, never hard-coded):

| leg's `tenant_id` | meaning |
|---|---|
| = system tenant | **global** — "manager of all hotels", manages every tenant |
| any other tenant | **per-tenant** — manages just that hotel |

The same definition backs the `is_tenant_manager` flag on the Users CRUD (`PostProcessingFunctions/Users/attachTenantManagerFlag.js`), so the screens agree.

---

## Authentication & Authorization

Encrypted transport on all methods: `platformEncryption: true` + `accessToken: true` (the body rides in the `encryptedrequest` header, and a valid access token is required). `permission: null` — no RBAC gate (see *Scope & tenancy*). `pagination: false` — the GET path caps at 200 rows in SQL instead.

---

## `GET` — Tenant-Manager dropdown

Feeds the "Select Existing User" picker in the Tenant Admin step. Takes **no parameters**; `tenant_id` is deliberately not read.

**Request** — empty body (encrypted into the `encryptedrequest` header):

```jsonc
{}
```

**Response** — one entry per Tenant Manager, `label` ASC, capped at 200:

```jsonc
{
  "return": [
    { "value": 1,   "label": "admin",          "email": "info@granjur.com",              "profilePic": 1 },
    { "value": 44,  "label": "admin_serenity", "email": "serenity.super.admin@gmail.com", "profilePic": null },
    { "value": 123, "label": "Hamza",          "email": "hamzawaqar924+128@gmail.com",    "profilePic": null }
  ]
}
```

| field | type | notes |
|---|---|---|
| `value` | int | `users.user_id` — the id to post back |
| `label` | string | `username`, falling back to `email`, then `User #<id>`; truncated to 40 chars |
| `email` | string \| null | `users.email` |
| `profilePic` | int \| null | `users.image_attachment_id` (an id, not a URL) |

The GET pool is the **whole Tenant-Manager population** (global **and** per-tenant holders) — it is **not** restricted to a target tenant's staff, so a manager can be offered as admin of a hotel they hold no leg in, including a brand-new one.

Dropdown rows carry **no** `tenants` / `includes_global` — that is the POST shape.

---

## `POST` — entity cross-reference

Maps Tenant-Manager membership in **both directions**, chosen by `entity_type`.

### Request

```jsonc
{
  "entity_type": "tenants",  // "users" | "tenants" — anything else yields []
  "entity": 99,              // a BARE id; an array [99, 16] is also accepted
  "actionPerformerURDD": 2,  // read by the framework, not by this handler
  "userId": 1,               // ignored here
  "tenantId": "all"          // ignored here — the read is not tenancy-scoped
}
```

| field | required | accepts |
|---|---|---|
| `entity_type` | yes | `"users"` or `"tenants"`, case-insensitive |
| `entity` | yes | bare id (`99`), numeric string (`"99"`), or array (`[99, 16]`). `entity_id` is honoured as a legacy alias of the same field |

Ids are de-duplicated and non-integers dropped. Rows come back **in the requested id order**; ids that match no row are skipped rather than erroring.

### `entity_type: "users"` → which tenants each user manages

```jsonc
// request: { "entity_type": "users", "entity": 44 }
{
  "return": [
    {
      "value": 44,
      "label": "admin_serenity",
      "email": "serenity.super.admin@gmail.com",
      "profilePic": null,
      "tenants": [],            // hotels managed via a PER-TENANT leg (inactive tenants excluded)
      "includes_global": true   // also holds the GLOBAL (system-tenant) leg → manages every hotel
    }
  ]
}
```

| field | type | notes |
|---|---|---|
| `value` `label` `email` `profilePic` | | as GET |
| `tenants` | int[] | tenant ids held via a **per-tenant** TM leg, **excluding inactive tenants**; `[]` when none. The system tenant never appears here — that leg is reported as `includes_global`. |
| `includes_global` | bool | holds the **global** (system-tenant) TM leg |

A requested user who is **not** a Tenant Manager still echoes back with the empty shape (`tenants: []`, `includes_global: false`), so the caller can render "not a manager" without a second lookup.

> `tenants: []` + `includes_global: true` does **not** mean "manages nothing" — a global manager reaches every hotel without holding a per-hotel leg. Read the two fields together.

### `entity_type: "tenants"` → which users manage each tenant

```jsonc
// request: { "entity_type": "tenants", "entity": 16 }
{
  "return": [
    {
      "value": 16,
      "label": "Destination Grand Hotel",
      "code": "DGH",
      "slug": "destination-grand-hotel",
      "logo": null,
      "users": [1, 242]
    }
  ]
}
```

| field | type | notes |
|---|---|---|
| `value` | int | `tenants.tenant_id` |
| `label` | string | `tenant_name`, falling back to `tenant_code`, `tenant_slug`, `Tenant #<id>` |
| `code` / `slug` / `logo` | | `tenant_code` / `tenant_slug` / `tenant_logo` |
| `users` | int[] | **only this tenant's own per-tenant TM holders** |

> **Only per-tenant holders — global TMs are NOT unioned in (2026-08-19).** Earlier this branch added every "manager of all hotels" (global) TM to every tenant's `users[]`. It no longer does: a global leg is a separate, independently-toggled assignment, so attributing it to each hotel would list a manager the hotel never selected — and it would wrongly re-appear after the global leg is unselected. The tenant's own **URDD-B'** ownership carrier **is** included (its per-tenant leg exists). This matches the write-side reader `readTenantPersonaUserIds` and the TenantsGroupedCrud `personas` list, so the read agrees with the tenant-side write.

### Which tenants count as live

The filter is `status != 'inactive'`, not `status = 'active'`. The `tenants.status` enum is `active | inactive | pending | probation`, and the three non-inactive states are all manageable (`pending` = being set up, `probation` = mid deferred-delete, still restorable). The **system tenant** is exempt in the `users` branch — it anchors the *global* TM leg rather than being a bookable hotel, so an inactive system tenant does not silently flip `includes_global` to `false`. It is resolved live by natural key (`getSystemTenantId`), never hard-coded.

### Empty results

`[]` — never an error — when: no id matched (including: every id was an inactive tenant), `entity` was empty/absent, or `entity_type` was neither `users` nor `tenants`.

---

## Envelopes

**Success** (HTTP 200) — `data` is the encrypted body; decrypting it yields the `{ "return": … }` object shown above.

```jsonc
{
  "success": true,
  "data": "3CiMETd7J53YZQV3R56N…",  // encrypted
  "meta": { "message": "Tenant manager candidates retrieved.", "priority": 1, "status": 200 },
  "error": null
}
```

**Wrong method** (HTTP 405, plaintext) — `scc: "E52"`, `"Incorrect Request Method"`. No 4xx is raised for bad input: unknown ids, an unknown `entity_type` and a missing `entity` all return `200 []`.

---

## Scope, tenancy & access — read before reusing

**Not tenancy-scoped, by design.** Both handlers run as `preProcessFunctions` with `query: null`, which bypasses `applyTenancyFilters`. That filter scopes any top-level `users`/URDD SELECT to the *acting* tenant's URDDs, and every per-tenant TM leg is owned by that hotel's own URDD-B' — so under the standard query path they would all be dropped. `tenantId` / `tenant_id` in the request are consequently **not read**.

**Consequences to weigh:**

- `permission: null` plus no tenancy fence means **any authenticated caller** gets the cross-tenant manager map. Gating this to system-tenant callers (as `is_tenant_manager` is) is worth considering if it is exposed outside the platform-owner screen.
- `user_id = 1` is the platform user and holds a URDD-B' (Tenant-Manager) leg in nearly every provisioned tenant, so it legitimately appears in both branches — including the per-tenant `users[]`. That is accurate, not a bug — exclude it at the call site if the screen should not offer it.

---

## Source Files

| File | Purpose |
|---|---|
| `Src/Apis/ProjectSpecificApis/TenantManagerCandidates/Custom_Objects/tenant_manager_candidates.js` | API object — GET dropdown (`tenantManagerCandidates`) + POST cross-reference (`tenantManagerCrossRef`). |
| `Src/HelperFunctions/PreProcessingFunctions/CustomUsersGroupedCrud/syncPersonaTenantUrdds.js` | `readTenantPersonaUserIds` / `readPersonaOfTenantsBulk` — the write-side readers this cross-reference agrees with. |
| `Src/HelperFunctions/PayloadFunctions/Governance/getSystemTenantId.js` | Resolves the system tenant (global-vs-per-tenant split), by natural key. |
