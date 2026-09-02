# Config Constraints (value bounds for config keys)

Some config keys cannot take an arbitrary value — the value is **bounded** by something else in the
system. This page documents how the backend advertises those bounds and the read API that returns
them: `/api/config/constraints`.

> **Source of truth for the key list on this page:** the live **`dev-restructure_hms_1.9`** database,
> read **2026-09-02**. The constraint *definitions* themselves live in backend code
> (`Src/Apis/ProjectSpecificApis/ConfigConstraints/ConfigConstraints.js` → `CONSTRAINTS_BY_KEY`);
> the database only supplies the `has_constraint` flag and tenancy.

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

**Currently six key names are constrained** (each spans its SaaS-original plus every tenant clone —
row counts below are per-DB and include clones):

| Config key | Rows (`has_constraint = 1`) | Bound (summarised — full shapes in §4) |
|---|---:|---|
| `max_adults` | 39 | Service: `<=` delivery-unit capacity, and `>=` capacity − `max_children`. Package: `<=` Σ over stay services of `max_adults × quantity`. |
| `max_children` | 39 | Service: `<=` delivery-unit capacity, and `>=` capacity − `max_adults`. Package: `<=` Σ over stay services of `max_children × quantity`. |
| `checkin_anchor` | 40 | `<` `checkout_anchor`. |
| `checkout_anchor` | 40 | `>` `checkin_anchor`. |
| `min_guests_age` | 36 | `<=` `max_guests_age`. |
| `max_guests_age` | 36 | `>=` `min_guests_age`. |

*(The list grew from the original two keys — `max_adults` / `max_children` — as the check-in/out
anchor pair and the guest-age pair were flagged. Any key whose name is not in `CONSTRAINTS_BY_KEY`
returns `has_constraint = 1` but an empty constraint set, so the FE simply has nothing to enforce.)*

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

  // SINGLE constraint → an object; MULTIPLE → an array of these objects.
  "configConstraint_constraints": [
    { "scope": "service", "constraint_operator": "<=",
      "constraint_reference": "service.basics.service_location.delivery_unit.capacity" },
    { "scope": "service", "constraint_operator": ">=",
      "constraint_reference": { "key": "service.basics.service_location.delivery_unit.capacity",
                                "op": "-", "ref": "service.availability.max_children" } },
    { "scope": "package", "constraint_operator": "<=",
      "constraint_reference": { "aggregate": "sum",
        "over": "package.composition.package_composition[service.category=stay]",
        "value": { "key": "service.availability.max_adults", "op": "*",
                   "ref": "package.composition.package_composition.quantity" } } }
  ]
}
```

A **constraint object** is `{ [scope], constraint_operator, constraint_reference }`:

- `scope` *(optional)* — the entity context the constraint applies to: `"service"` or `"package"`.
  **Absent = applies in every context.** When present, the FE enforces it **only** while editing
  that entity type (a service form applies the `"service"` constraints; a package form the
  `"package"` ones). The anchor / guest-age keys carry **no** `scope` (they apply wherever the key
  is edited).
- `constraint_operator` — the comparison the value must satisfy (`<`, `<=`, `>`, `>=`, `=`).
- `constraint_reference` — what the value is compared against. One of three shapes:
  - a **dotted-path string** — e.g. `service.basics.service_location.delivery_unit.capacity`, or a
    sibling config key such as `checkout_anchor`;
  - a **compound expression** `{ key, op, ref }` — `key <op> ref`, where `key`/`ref` are themselves
    references (e.g. capacity − `max_children`);
  - an **aggregate** `{ aggregate, over, value }` — fold `value` over the `over` collection (§4a).

`configConstraint_constraints` is **polymorphic by count**: an **object** when the key has exactly
one constraint, an **array of objects** when it has several. The FE branches on
`Array.isArray(...)`, then filters the array by `scope` for the entity it is editing.

---

## 3. Where the constraints come from

The constraint definitions are held **in the backend**, keyed by config_key **name**
(`CONSTRAINTS_BY_KEY` in `ConfigConstraints.js`). Because they are keyed by name, the SaaS-original
key and every tenant clone resolve to the **same** constraint set — global and per-tenant configs
share the same constraints per config. The database supplies the key row, the `has_constraint` flag
and tenancy; the API attaches the matching definition on top.

The endpoint is **read-only** (List / View). The read contract above is stable, so the storage can
later move behind a table without changing the response.

---

## 4. The constraint definitions in full

The exact set returned per key (verbatim from `CONSTRAINTS_BY_KEY`):

### `max_adults`
1. `{ scope: "service", <=, "service.basics.service_location.delivery_unit.capacity" }`
2. `{ scope: "service", >=, { key: "…delivery_unit.capacity", op: "-", ref: "service.availability.max_children" } }` — Max Adults ≥ capacity − Max Children.
3. `{ scope: "package", <=, aggregate }` — see §4a.

### `max_children`
1. `{ scope: "service", <=, "service.basics.service_location.delivery_unit.capacity" }`
2. `{ scope: "service", >=, { key: "…delivery_unit.capacity", op: "-", ref: "service.availability.max_adults" } }` — Max Children ≥ capacity − Max Adults.
3. `{ scope: "package", <=, aggregate }` — mirror of `max_adults` with `service.availability.max_children`.

### `checkin_anchor` / `checkout_anchor` (no scope)
- `checkin_anchor`: `{ <, "checkout_anchor" }` — check-in must be before check-out.
- `checkout_anchor`: `{ >, "checkin_anchor" }` — check-out must be after check-in.

### `min_guests_age` / `max_guests_age` (no scope)
- `min_guests_age`: `{ <=, "max_guests_age" }`.
- `max_guests_age`: `{ >=, "min_guests_age" }`.

---

## 4a. Package rule for `max_adults` / `max_children` (aggregate reference)

For a **package**, Max Adults / Max Children aren't bounded by a single delivery unit — a package
bundles stay services, so its guest capacity is the total across those services. The bound is the
**sum, over each stay service in the package, of that stay service's own bound × its quantity in the
package**:

```
package.max_adults   <= Σ (stay_service.max_adults   × stay_service.quantity)
package.max_children <= Σ (stay_service.max_children × stay_service.quantity)
```

e.g. a package with *Stay A* (max_adults 2, qty 3) and *Stay B* (max_adults 4, qty 1) →
`2×3 + 4×1 = 10`, so the package's `max_adults` must be `<= 10`. Relevant when the package has more
than one stay service; with a single stay service it reduces to `max_adults × quantity`.

This is expressed as an **aggregate** `constraint_reference`, scoped to `"package"`. Paths follow the
FE resolver's contract (there is no `stay_services` collection — it is derived from the Package
Composition rows, filtered to stay-category services):

```jsonc
{
  "scope": "package",
  "constraint_operator": "<=",
  "constraint_reference": {
    "aggregate": "sum",                                                    // fold across the collection
    "over": "package.composition.package_composition[service.category=stay]", // Composition rows, stay only
    "value": {
      "key": "service.availability.max_adults",                            // the row's service bound
      "op":  "*",
      "ref": "package.composition.package_composition.quantity"            // the row's quantity
    }
  }
}
```

- `over` — `<scope>.<tab>.<field>` addressing the **Package Composition** rows; the
  `[service.category=stay]` filter keeps only rows whose selected service's category slug is `stay`.
- `value.key` — inside the iteration, `service.*` is the **row's selected service**; its `max_adults`
  comes from that service's own `configs[]` (already present in the `/services` list rows — no new
  backend data needed).
- `value.ref` — the row's `quantity` sub-field (`package_services.quantity`).
- `op` — applied generically (`- + * / %`).
- `aggregate` — `"sum"` (the FE also accepts `min` / `max`).

`max_children` is identical with `service.availability.max_children`.

**FE resolver status:** the studio currently resolves the `delivery_unit_capacity` kind and compound
`{ key, op, ref }` expressions; the `aggregate` shape is **not yet resolved**, so today it
**fails open** — never blocks the wizard. Enforcement is a frontend follow-up: filter constraints by
`scope` at load, then resolve `aggregate` / `over` / `value` by iterating the package's stay-category
composition rows and their quantities. **Fail-open cases** (all leave the bound unenforced): no
composition / no stay rows; any stay row whose service `max_adults` or `quantity` is unresolvable;
unknown `aggregate` or `op`. This endpoint already ships the definition.

---

## 5. Related

- `data/migrations_completed/20260722_2_add_has_constraint_hms_config_keys.sql` — adds the flag
- `Src/Apis/ProjectSpecificApis/ConfigConstraints/README.md` — the canonical backend reference
- [config-keys.md](../config-keys/config-keys.md) — config-key data model
