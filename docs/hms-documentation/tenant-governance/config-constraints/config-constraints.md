# Config Constraints (value bounds for config keys)

Some config keys cannot take an arbitrary value — the value is **bounded** by something else in the
system. This page documents how the backend advertises those bounds and the read API that returns
them: `/api/config/constraints`.

> **Prerequisite:** read [config-keys.md](../config-keys/config-keys.md) first — this page assumes
> you know what a config **key** and an **applied value** are, plus the SaaS-original / tenant-clone
> split.

---

## 1. The `has_constraint` flag

Every config key carries a boolean `hms_config_keys.has_constraint` (added in migration
`20260722_2`, placed right after `is_multi_value`):

- `has_constraint = 0` (the default) — the value is free; nothing extra to do.
- `has_constraint = 1` — the value is bounded. The frontend must call the Config Constraints API for
  that key to learn the bound, then enforce / display it.

The flag is a property of the **key**, identical for the SaaS-original and every tenant clone, so it
is set by config_key **name** across all rows at once.

The FE receives it on the normal config-keys catalog read (`GET /api/hms_config_keys_catalog`) as
`hmsConfigKeys_hasConstraint` — no separate call is needed just to learn *whether* a key is
constrained; only to fetch the bound itself (§2).

Currently exactly two keys are constrained:

| Config key | Bound |
|---|---|
| `max_adults` | `value` &le; the delivery unit capacity |
| `max_children` | `value` &le; the delivery unit capacity |

---

## 2. The API

| Operation | Call |
|---|---|
| List | `GET /api/config/constraints` |
| List (one key) | `GET /api/config/constraints?config_key_id=<id>` |
| View | `GET /api/config/constraints?id=<config_key_id>` |

**Tenancy.** The tenant is resolved from the acting `actionPerformerURDD`; callers never send a
tenant id. Only the tenant's own, non-inactive, constraint-bearing keys are returned.

### Read shape

```jsonc
{
  "configConstraint_configKeyId": 4176,
  "configConstraint_configKey": "max_adults",
  "configConstraint_configName": "Maximum Adults",
  "configConstraint_hasConstraint": 1,

  "configConstraint_constraints": {
    "constraint_operator": "<=",
    "constraint_reference": "basics.service_locations.delivery_unit.capacity"
  }
}
```

A **constraint object** is always two fields:

- `constraint_operator` — the comparison the value must satisfy (`<=`, `=`, …).
- `constraint_reference` — a dotted path to what it is compared against
  (here, the delivery unit capacity).

`configConstraint_constraints` is **polymorphic by count**: a single constraint comes back as an
**object**, several constraints come back as an **array of objects**. Branch on whether the value is
an array.

---

## 3. Where the constraints come from

The constraint definitions are held **in the backend**, keyed by config_key **name**. Because they
are keyed by name, the SaaS-original key and every tenant clone resolve to the **same** constraint
set — global and per-tenant configs share the same constraints per config. The database supplies the
key row, the `has_constraint` flag and tenancy; the API attaches the matching definition on top.

The endpoint is **read-only** for now (List / View). The read contract above is stable, so the
storage can later move behind a table without changing the response.
