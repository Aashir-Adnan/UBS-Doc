# Deferred Delete (Probation)

This is the "what happens when you delete something that other things still depend on" reference. In HMS **nothing is ever hard‑deleted** — a delete flips a `status`. The deferred‑delete model adds a middle state, **`probation`**, so a delete with live dependencies isn't *blocked* and isn't *immediately* finalized: the row is parked, hidden from new consumers, and a daily cron finalizes it to `inactive` once the dependencies clear.

> **Prerequisite:** [governance-model.md](../tenant-governance-model/governance-model.md) (the four tiers, the RBAC chain, and the one isolation rule) and [per-tenant-cloning.md](../per-tenant-cloning/per-tenant-cloning.md) (what a tenant *clone* is). This page also pairs with [tenant-lifecycle-cron.md](../tenant-lifecycle-cron/tenant-lifecycle-cron.md) — that cron flips a hotel on/off by the calendar; *this* one finalizes deletes by dependency.

---

## 1. The one-paragraph version

Every delete is a soft-delete. When you delete a row, HMS asks one question: **does anything live still depend on it?** If **no**, it goes straight to `status='inactive'` (today's behaviour). If **yes**, it goes to `status='probation'` instead — it disappears from new pickers/availability immediately and stops accepting new references, but existing consumers keep resolving it, and a daily **probation-finalizer cron** re-checks the dependency and flips it to `inactive` the moment it clears. An admin can **cancel** a pending delete at any time by reactivating the row (it returns to `active`). So a Tenant Manager can "delete" a service/category/hotel that still has a live booking without being stonewalled — it tidies itself up automatically once the last booking checks out.

```
active ──delete, live deps──►  probation  ──cron: deps cleared──►  inactive
   ▲                              │
   └────── admin reactivates ─────┘
active ──delete, NO deps──►  inactive            (immediate — unchanged)
```

> **Services & packages finalize to `archived`, not `inactive`.** These two resources keep
> their publishing state and their delete-lifecycle in one `status` enum, so a finalized
> delete lands on `archived` (retired but preserved, still shown in admin lists) rather than
> `inactive` (which stays reserved for genuinely dead rows). And because status is one
> column, **leaving `active` via an Update is gated like a delete**: any admin change moving a
> service/package **off `active`** (to inactive/archived/draft/scheduled) is checked against
> the same active-booking probe — **booked → held in `probation`** (winds down to `archived`);
> **not booked → the admin's intended status is applied verbatim**. Non-`active`-origin changes
> and republish (`→active`) pass through, and the FE **reactivates** a parked row by sending
> `status = archived` directly. The gate never blocks a change — only a booked row is held in
> probation first. Every other resource keeps the plain `inactive` terminal and is guarded on
> DELETE only.
>
> **Second delete → `inactive`.** Because `archived` keeps a retired service/package **visible**
> in admin lists, deleting it again finishes the job: a **DELETE on a row already `archived`**
> finalizes it to **`inactive`** (it then drops out of List/View). This transition skips the
> probation probe — an archived row is already past the booking gate — but still runs the terminal
> Rule-2 hook for a service (idempotent, keeps its unit anchors / `deliver_unit` config clean). So
> the full lifecycle is `active` → *(delete)* → `archived` → *(delete again)* → `inactive`.

---

## 2. What counts as "still in use"

The dependency check is per resource. The recurring primitive is the **active booking**: a booking still counts unless its `booking_status` is `checked_out` / `no_show` / `cancelled`.

| Resource | Parked in `probation` while… |
|---|---|
| **service** | a booking_service ties it to an active booking — **or**, for a **Stay** service, one of its **rooms** is on an active booking (a stay holds a `delivery_unit` via `booking_items`, *not* a booking_service). A room belongs to the service when the unit's `service_locations` **anchor** — the row `delivery_units.location_id` points at — carries this `service_id` (`du.location_id = sl.id AND sl.service_id = <service>`), **not** merely because it shares a physical location. *(finalizes to `archived`; deactivation-guarded)* |
| **package** | the package — or any service it includes — has an active booking *(finalizes to `archived`; deactivation-guarded)* |
| **config value** (a possible value of a config key) | a **service** (per the service check above, incl. the Stay-room path) **or** **package** that is configured with this value **by id** (`hms_config.config_value` holds the value's id) has an active booking. Hidden from new-consumer pickers while parked; finalizes to `inactive` once those bookings close. Only the exact id reference counts — the mutable `services.common_attributes` value-label case is **not** guarded |
| **delivery unit** (room/table/…) | its `current_status` is `reserved` or `occupied` |
| **service category** | it still has active `services` / `packages` / `delivery_units` |
| **location / location_type** | a location of that type (or a descendant in the building › floor › zone tree) still has an **active service link to a live service** (status `active` / `probation` / `archived`) |
| **role / designation / department** | an active RDD still references it |
| **RDD** (role assignment) | a user holding it has an active booking |
| **permission group** | an active RDD↔PG mapping uses it |
| **plan** | a non-inactive tenant subscribes to it |
| **task config** (status/priority/category/flow/step) | an **open** task (`closed_at IS NULL`) uses it |
| **guest profile / user** | the guest/user has an active booking (a user also needs no remaining active URDD elsewhere) |
| **tenant** (whole hotel) | the hotel has any active booking |

> **The leaf exception — bookings & booking_services are *not* probation-managed.** They are the thing everything else waits on, so they don't get a grace period. A booking can only be deleted once it is **already closed** (`checked_out` / `no_show` / `cancelled`); deleting an *open* booking is **refused** (you must check it out / cancel / mark no-show first). On a valid delete it cascades to its own children (`booking_items`, `booking_services`, `booking_payments`, `booking_service_slots`).

---

## 3. The two outcomes of a delete

```
        delete request (soft)
                │
     ┌──────────┴───────────┐
  live deps?               live deps?
   = NO                     = YES
     │                        │
     ▼                        ▼
  inactive               probation
  (+ cascade now)        (cascade deferred to the cron)
```

- **No live deps → `inactive` immediately**, and any child cascade runs now.
- **Live deps → `probation`**, and the child cascade is **deferred** to finalize time. While parked, the row's **children stay active** (so a reactivation is a clean no-op) — only when the cron finalizes the parent do the children drop. This is the single rule across the whole model.

What "hidden" means in practice (the visibility split):

- **New-consumption reads** (dropdowns, availability, new-assignment lists, the **guest app**) show **`active` only** → nothing new can attach to a probation row.
- **Admin / management List & View** show **`active` + `probation`** (everything except `inactive`) and surface the `status`, so an admin sees the row is "winding down" and can reactivate it.

---

## 4. Reactivation — cancelling a pending delete

A `probation` row is **not gone** — it is a delete you can still call off. For a standalone entity, reactivation is just its **normal Update** (`probation → active`), gated by its existing `update_*` permission — no new permission, no special endpoint. For **assigned resources** it is a dedicated **restore verb** on the grouped CRUD: `PUT { resource_type, clone_id, status:"active", actionPerformerURDD }`. That verb is cross-tenant and status-only (a direct `UPDATE … WHERE <pk>=? AND status='probation'`, like revoke), so the admin sends the *same actor it used to revoke* — no per-tenant URDD to resolve, no full-row payload. **Re-assigning a `probation` clone is instead rejected with a 409** ("restore it explicitly before re-assigning"), so a restore can never be a silent side effect of a re-assign; the re-assign reactivation path applies only to an already-**`inactive`** clone. Because children stayed active during probation, reactivation needs **no restore step**; and the finalizer cron only ever touches rows *still* in `probation`, so a reactivated row is automatically out of its scope.

---

## 5. Per-resource cascades worth knowing

A few resources do more than flip one row at finalize:

- **Service category → config keys.** A category's dependent **config keys + possible values** stay active during probation and are cascaded to `inactive` only at finalize — and only the **orphaned** ones (a config key shared across several owned categories survives until the **last** owning category is revoked). They are **never** parked in probation themselves: that keeps reactivation trivial and respects shared ownership.
- **Service → delivery-unit anchors.** A delivery unit points at a `service_locations` "anchor" row that carries its assigned `service_id` (per-tenant-cloning aside, this is the delivery-unit model). So when a **service** is finalized (or immediately archived), its `service_locations` rows are **not** blindly inactivated — the anchor rows would strand the units. Instead the units are **unassigned** (their anchor's `service_id` is nulled but the row stays **active**, so the unit remains located) and only the service's **non-anchor offered** rows are inactivated. **Exception:** whole-tenant deletion (§4) inactivates the delivery units *and* their anchors together, so it doesn't unassign.
- **Location *type* → promote/splice.** Finalizing a location *type* doesn't delete its child nodes — it **re-parents** them to the grandparent (a root's children become roots), so a child is never left under an inactive parent. The subtree's live-service check (above) is what gates it.
- **Location *instance* → cascade down.** Finalizing (or immediately deleting) an actual building/floor/zone soft-deletes its **whole sub-tree** — descendant locations *and* each one's room/table units (`delivery_units`) and service links (`service_locations`) — so a deleted floor never leaves a live zone (or an occupied room) behind. Instances cascade **down** rather than promote/splice like the *type*: a zone can't sensibly move up to the building when its floor is removed. It only reaches finalize once nothing in the sub-tree is occupied or still serving, so nothing live is swept up.
- **Tenant → full cascade.** Finalizing a hotel runs the ordered §-cascade across every table it owns; on finalize a parent's FK children (e.g. `package_services`, `package_pricing`) go `inactive` in the same step.

---

## 6. The probation-finalizer cron

A single daily background job (`Services/Integrations/CronJobs/probationFinalizerCron.js`), modelled on the [tenant lifecycle cron](../tenant-lifecycle-cron/tenant-lifecycle-cron.md): an `isRunning` guard, idempotent, and the SaaS-Admin / system tenant is never finalized.

For every table in the delete-guard registry it walks the `probation` rows, **re-runs the same dependency check**, and:

- **still dirty** → leave it in `probation`;
- **clean** → flip to `inactive`, and run that table's cascade (generic FK children, or a custom finalizer — e.g. the service-category config-key cascade, the location_type promote/splice, the whole-tenant §-cascade).

Because it re-uses the *same* predicate the delete used, a reactivated row (now `active`) is skipped automatically, and a row whose blockers never clear simply stays parked until they do.

---

## 7. Where it lives

| Piece | Location |
|---|---|
| Dependency probes (the registry) | `Src/HelperFunctions/PreProcessingFunctions/DeleteGuards/deleteGuards.js` |
| The guard that soft-deletes (probation vs terminal) | `.../DeleteGuards/enforceDeleteGuard.js` (+ `deleteGuardResponse.js`) |
| The deactivation guard (Update off `active` → probation/archived; service & package) | `.../DeleteGuards/enforceDeactivationGuard.js` |
| Booking / booking_service gate + child cascade (leaf, not probation) | `.../DeleteGuards/enforceBookingDeleteGuard.js` |
| Location instance guard + sub-tree cascade-down | `.../DeleteGuards/enforceLocationDeleteGuard.js` + `cascadeSoftDeleteLocation.js` |
| Service delete → unassign delivery units (null anchors, keep active) | `.../CustomServices/serviceAnchors.js` (`unassignUnitsFromService`) — invoked by `enforceDeleteGuard('service')` `afterImmediate` + `probationFinalizerCron` `AFTER_FINALIZE.services` |
| Assignment revoke (service_category / location_type → probation) | `Src/HelperFunctions/PreProcessingFunctions/TenantAssignmentsGroupedCrud/revokeResource.js` |
| Assignment restore (probation → active, cross-tenant PUT `status:"active"`) | `Src/HelperFunctions/PreProcessingFunctions/TenantAssignmentsGroupedCrud/restoreResource.js` |
| The finalizer cron | `Services/Integrations/CronJobs/probationFinalizerCron.js` |
| `probation` enum added to every participating table | migration `20260619_1_add_probation_status_enum.sql` |
| `service_locations.service_id` foreign key (backs the location probe) | migration `20260623_4_add_service_locations_service_fk.sql` |

> Engineering detail (probes, cron internals, the full per-resource matrix, decisions) lives in the backend strategy doc `backend/docs/strategies/tenant_deletion_cascade_strategy.md`. This page is the reader-facing overview.
