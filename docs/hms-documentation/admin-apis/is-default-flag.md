# The `is_default` Flag

| Endpoint | Operations carrying the flag |
|---|---|
| `/api/crud/permission-groups` | List, View |
| `/api/crud/roles-designations-department` | List, View |

Both tables are **cloned into a tenant** from the system tenant's templates when the tenant is
provisioned. `is_default` tells the frontend which rows came from the platform, so it can badge
them and block renaming or restructuring.

```json
{ "id": 822, "rolesDesignationsDepartment_tenantId": 88, "is_default": 1 }
```

| Value | Meaning |
|---|---|
| `1` | Platform-provided — a system-tenant **template**, a per-tenant **clone** of one, or a row written by a **general manager of all hotels** |
| `0` | The tenant authored this row itself |

---

## How a platform row is identified

Neither table has a `source_*_id` column, so the origin is inferred from **`created_by`**.

Every clone helper stamps the new row with that tenant's **URDD-B′** — the platform-owned
`TENANT`/`Manager` leg that carries tenant ownership. A row the tenant creates through the UI
carries the acting admin's own URDD instead.

The property that separates the two is the **general manager of all hotels** leg: an active URDD
on the **global** `TENANT`/`Manager` RDD, anchored on the system tenant, carrying
`PG-TENANT-MGMT`. That is platform staff — the flavour URDD-B′'s own user carries, and the one
[`includes_global: true`](../tenant-governance/tenant-manager-management/tenant-manager-management.md) grants. So:

> `is_default = 1` when the row belongs to the **system tenant**, **or** its `created_by` is
> **a general-manager leg**, **or** its `created_by` is a `TENANT`/`Manager` URDD **in this row's
> own tenant whose user holds a general-manager leg** (this is how URDD-B′ qualifies — it belongs
> to the platform user, who is a general manager).

The system tenant, the platform user and the global `TENANT`/`Manager` RDD are all resolved live
by natural key — never a hard-coded id — so this holds in every environment.

:::warning A per-tenant Tenant Manager creating a role is not a default
It is not enough that `created_by` is "some `TENANT`/`Manager` URDD". Every human tenant manager
is one, and a tenant manager authoring a role through the UI is authoring, not cloning. The writer
must additionally be a **general manager** — hold, or belong to a user who holds, the global
`TENANT`/`Manager` leg on the system tenant.

Without that, tenant-authored roles are wrongly returned as platform defaults. On the reference DB
seven users hold the global leg; a per-tenant Tenant Manager who does not (user 155) authored
RDDs 901 / 903 / 904, which the earlier broad predicate flagged as platform defaults.
:::

:::tip Granting the flag to a person
Giving a user `includes_global: true` through the grouped user CRUD makes every governance row
they subsequently write read as a platform default in every tenant. Revoking it does **not**
retro-actively unflag rows they already wrote — the flag is evaluated against the leg's state at
read time, so revocation flips their past rows back to `0`.
:::

---

## Why not a timestamp, or a name match

Two approaches that look reasonable and do **not** work:

**Time window** — "clones land near the tenant's `created_at`". The windows overlap in both
directions. On the reference DB, tenant 88 holds a genuine `STANDARD/Guest` clone created
**26,428 minutes** (18 days) after the tenant, while a tenant-authored row exists at **minute
6**, inside any window that would catch the initial clone batch. No cutoff separates them.

**Name or `(designation_code, role_name)` signature** — has false negatives: tenant 88's
`GYM/Manager` clone matches no global RDD, because only some service-category RDDs exist
globally. It also has false positives, since nothing stops a tenant creating a row whose
signature matches a template.

`created_by` is exact on the same data: all 14 clones on one side, all 3 tenant-authored rows
on the other, no overlap.
