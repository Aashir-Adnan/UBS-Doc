# Roles / Designations / Departments Dropdowns

| Operation | Method | Path | Permission |
|---|---|---|---|
| List assignable roles | GET | `/api/roles/dropdown` | None (persona-filtered) |
| List assignable designations | GET | `/api/designations/dropdown` | None (persona-filtered) |
| List assignable departments | GET | `/api/departments/dropdown` | None (persona-filtered) |
| List / view designations | GET | `/api/crud/designations` | `list_designations` / `view_designations` |

The three pickers that build an **RDD** (role + designation + department) — the triple that defines what a user *is*. Each returns only the rows the acting admin is entitled to hand out, scoped by **seniority** and by **tenant ownership**.

The Designations CRUD's read paths carry the same scope, so what an actor can *list* is exactly what it can *select*.

---

## Authentication & Authorization

Encrypted with **platform encryption + access token** (`platformEncryption: true`, `accessToken: true`). The three dropdowns carry no RBAC gate (`permission: null`) — visibility is bounded by **persona filtering** instead, exactly as with the [Permissions Dropdown](./permissions-dropdown.md).

---

## Two independent axes

A row is offered only if it passes **both**:

**1. Tenant ownership — which rows.** A tenant-scoped actor sees strictly its **own tenant's** rows. Every tenant is provisioned with its own clones (3 roles, 11 designations, 1 department), so this is a complete set, not a subset. A **global** actor — one whose leg sits on the system tenant, or on no tenant — sees the global rows instead. Never both, so a picker never lists the same designation twice.

**2. Seniority — which kinds.** You may hand out a role at or below your own level, and a designation for a persona you are entitled to create.

---

## The scope table

| Actor persona | Roles | Designations | Departments |
|---|---|---|---|
| **SaaS Admin** (`SYSTEM` + `Admin`) | all | all | all |
| **Tenant Manager** (`TENANT` + `Manager`) | Admin, Manager | 9 service categories + `STANDARD` + `BOOKING` | `GENERAL` when global; own tenant's when tenant-scoped |
| **Tenant Admin** (`TENANT` + `Admin`) | Admin, Manager | 9 service categories + `STANDARD` + `BOOKING` | own tenant's |
| **Service Manager** (a service-category designation + `Manager`) | Manager, Guest | `STANDARD` | own tenant's |
| **Booking Manager** (`BOOKING` + `Manager`) | Manager, Guest | `STANDARD` | own tenant's |
| **Guest** (`STANDARD` + `Guest`) | none | none | none |
| **Unresolved actor** | none | none | none |

:::warning `TENANT`, `SYSTEM` and `DEVELOPER` are SaaS-Admin only
`TENANT` is the designation behind **both** the Tenant-Manager and Tenant-Admin personas, so offering it to a tenant would let that tenant mint its own governance legs. It is therefore absent from every tier below the SaaS Admin, along with the platform-only `SYSTEM` and `DEVELOPER`.

This is not a gap: **Tenant Admins are provisioned through the [tenant creation flow](./tenant-provisioning-grouped-crud.md)**, never by picking a designation in this dropdown.
:::

:::note A global Tenant Manager gets `GENERAL` only
That is where the global Tenant-Manager legs actually sit. `HMS` is the SaaS Admin's own department, and the per-tenant departments belong to their tenants. A Tenant Manager acting through a **per-tenant** leg (URDD-B′) gets that tenant's department instead — the scope follows the acting leg, not the person.
:::

---

## Request

| Param | Type | Required | Description |
|---|---|---|---|
| `actionPerformerURDD` | `number` | Yes | Acting URDD — determines the persona **and** the tenant. |
| `version` | `string` | Yes | API version (e.g. `1.0`). |

```
GET /api/roles/dropdown?version=1.0&actionPerformerURDD=644
```

The frontend saga injects `actionPerformerURDD` into every request by default, so no client change is needed.

---

## Response

```json
[
  { "value": 240, "label": "Admin" },
  { "value": 241, "label": "Manager" }
]
```

| Field | Type | Description |
|---|---|---|
| `value` | `number` | The row id (`role_id` / `designation_id` / `department_id`). |
| `label` | `string` | Display name, **truncated to 10 characters** by the query (`Room Service` renders as `Room Servi`). Pre-existing behaviour, unchanged. |

Inactive rows (`status = 'inactive'`) are always excluded.

A worked example — Tenant Admin on tenant 88:

```json
{
  "roles":        ["Admin", "Manager"],
  "designations": ["Standard", "Stay", "Dining", "Spa", "Barber", "Gym",
                   "Kids", "Transport", "Networking", "Room Servi", "Booking"],
  "departments":  ["Le Meridie"]
}
```

---

## Behavior

- **The scope is a SQL fragment** appended to each picker's `WHERE`, built by the shared resolver — the same shape [`buildAssignableScopeSql`](./permissions-dropdown.md) uses for permissions, so the two governance scopes read alike.

- **The tenant comes from the acting leg, never from the payload.** The frontend also sends a `tenantId` — but that is the tenant chosen in the UI's tenant picker, so it is user-controlled. It is ignored here; a forged or omitted `tenantId` cannot widen what is returned.

- **Fails closed.** An actor that cannot be resolved to a persona receives an **empty** list (`1 = 0`), not an unfiltered one. Because these pickers carry no RBAC gate, this scope is the only gate on them.

- **Global lists are de-duplicated.** Several codes exist both on the system tenant and at `tenant_id IS NULL` (`GENERAL`, `STANDARD`, `Guest`). The global branch prefers the system-tenant row and admits an unowned one only when its code has no system-tenant equivalent — otherwise a picker would show two identical labels resolving to different ids.

- **The picker is the friendly half, not the enforcement.** Assigning a senior role is rejected at write time regardless of what the dropdown offered. This scope stops the UI from offering a choice that would be refused.

:::info Designations CRUD reads are scoped identically
`GET /api/crud/designations` (List and View) applies the same fragment, so a Tenant Admin cannot page through — or fetch by id — a designation it is not entitled to select. View keeps its prefill arm (`designation_id IS NULL`) parenthesised, so the scope binds to both branches rather than to the prefill arm alone.
:::
