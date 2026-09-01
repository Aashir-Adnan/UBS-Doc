# Cascade Restore (Probation Tracking)

This is the "what comes back when you undo a delete" reference. [Deferred Delete (Probation)](../deferred-delete-probation/deferred-delete-probation.md) explains how a delete cascades **down**; this page explains how a reactivation puts it **back** — and, just as importantly, what it deliberately leaves switched off.

> **Prerequisite:** [deferred-delete-probation.md](../deferred-delete-probation/deferred-delete-probation.md). Everything here builds on the `probation` → `inactive` lifecycle described there.

---

## 1. The problem

Deleting a parent takes its dependencies with it. Delete a location and its service links, rooms and availability schedules go inactive too. Delete a hotel with no live bookings and its entire subtree goes — bookings, services, config, governance rows, even user accounts left with no other active tenant.

Reactivating that parent used to leave every one of those children inactive. There was no record of which rows the cascade had touched, so there was nothing to put back.

The naive fix — "reactivate the parent, then reactivate everything under it" — is wrong, and wrong in a way nobody notices until it causes an incident:

> A tenant switches one room off for renovation. Weeks later the whole floor is deleted, then restored. A blind restore brings that room back into service. Nobody asked for that, nobody is told, and the room is still under renovation.

Restore has to distinguish **"inactive because the parent was deleted"** from **"inactive because someone switched it off"**. That is what `probation_tracking` records.

---

## 2. How it works

Every cascade writes one row per child it inactivates, **before** it inactivates it:

| Column | Meaning |
|---|---|
| `base_table` + `record_id` | the **child** — the row that got inactivated |
| `source_table` + `source_id` | the **parent** — the row whose delete caused it |
| `previous_status` | the status the child held **before** the cascade |
| `status` | `active` = this link is still restorable; `inactive` = already consumed |

On reactivation the restore reads the links for that parent, writes each child back to its `previous_status`, and consumes the links.

### The exclusion rule is free

Every cascade already filters `status != 'inactive'`. A child an admin had **already** switched off is therefore not a candidate — the cascade never touches it, so it never gets a link, so restore can never resurrect it. The room under renovation stays off, with no special-casing anywhere.

### Why `previous_status` and not just "set it active"

Because a cascaded child is **not always** active. That same `status != 'inactive'` filter also catches a child sitting in `probation` — a row whose *own* delete was already requested and is waiting on the finalizer cron.

That collision is reachable. The location in-use probe counts only units whose status is `active`, so a **probation** unit does not hold its location back: the location finalizes, the cascade flips that unit to `inactive`, and the pending delete vanishes from view. Restoring it to `active` would **silently cancel a delete the tenant asked for**. Restoring it to `probation` lets the cron finish the job.

---

## 3. What is covered

| Delete | Parent | What comes back |
|---|---|---|
| Location | `locations` | the subtree's `service_locations`, `delivery_units`, child `locations`, and those units' `unit_availability` |
| Hotel / tenant | `tenants` | the whole subtree — bookings, tasks, services, locations, config, governance, plus user accounts orphaned by the delete |
| Delivery unit | `delivery_units` | its `unit_availability` schedules |
| Package | `packages` | `package_services`, `package_pricing` |
| Service | `services` | `service_location_attributes` |
| Service-category revoke | `service_categories` | the category's `hms_config_possible_values` and the `hms_config_keys` it orphaned |

Both delete routes are covered for each: the **immediate** finalize (no live dependencies, so the delete completes at once) and the **deferred** one (parked in `probation`, finalized later by the cron).

:::note Services keep their rooms
Deleting a service does **not** inactivate its delivery units. It *unassigns* them — the anchor is nulled and the unit stays active, deliberately, so retiring a service never destroys a hotel's rooms. Nothing to restore there, by design.
:::

---

## 4. Reactivating

Reactivation is the same `PUT` described in the deferred-delete page. What it does depends on where the row is coming from:

| Reactivating from | Cascade ran? | Restore |
|---|---|---|
| `probation` | **No** — children were never touched | Nothing to restore. Cancelling the pending delete is enough |
| `inactive` / `archived` (finalized) | Yes | **Children are restored** |

For a revoked **service category**, the reactivation is a **re-assign** through the assignments API rather than a status `PUT` — the restore runs there, inside the same transaction as the re-clone.

### Response

When a restore actually runs, the response carries a `cascadeRestore` object. It is absent otherwise.

```json
{
  "cascadeRestore": {
    "restored": {
      "locations": 2,
      "service_locations": 2,
      "delivery_units": 3,
      "unit_availability": 2
    },
    "links": 9,
    "skipped": 0
  }
}
```

Sum `restored` for a single "N items restored" count, or use the per-table breakdown to name them.

:::danger Reactivation cannot be undone
Restoring consumes the tracking links. There is no "undo restore" — reversing it means manually re-deleting whatever came back. There is also **no preview** endpoint and **no separate permission**: anyone who can edit the row can trigger it.

Confirm before the `PUT` whenever the row is leaving its finalized state. Do **not** confirm for a `probation` → `active` reactivation; nothing is restored there.
:::

---

## 5. Rules worth knowing

**Rows switched off individually stay off.** The single most important behaviour. If the tenant disabled something before the parent was deleted, restore leaves it disabled.

**A child mid-delete stays mid-delete.** A row in `probation` when the cascade hit it returns to `probation`, not `active`, so its own pending delete still completes.

**A child edited since the cascade is not overwritten.** Restore only touches rows still `inactive`. If someone reactivated a child by hand in the meantime, their newer state wins.

**Restore is idempotent.** Running it twice changes nothing the second time.

**One parent wins.** If two parents ever cascaded the same child, restoring either one revives it and retires the other's claim, so a later restore cannot re-claim it.

**Links stay inside the tenant.** Each link is owned by the parent row's owner, so a tenant's links are visible to that tenant. Where the parent has no owner, the platform SaaS-Admin identity is used as a fallback.

---

## 6. Limits

**Retiring a row by editing its status does not track.** Only a **DELETE** — immediate or cron-finalized — records links. Setting a row's status to inactive through a normal update cascades without tracking, and those children are **not** restorable. Two admins doing what looks like the same thing get different outcomes; use Delete when the intent is a reversible retirement.

**Config values parked by a booking are not restorable.** A config possible value held back because a *booked* service still references it is parked by the config API, not by a cascade. Its "parent" is a booking reference, not an owning row, so there is nothing to reactivate. Re-add the value through the config API instead.

This produces **two classes of config row in the same table**: one retired by a service category (restorable), one parked by a booking reference (not). Wording shown to tenants should not imply otherwise.

**Tenant restores are large.** A tenant delete can write links across ~50 tables. That is intended — the alternative was an unrestorable hotel — but it is not a small operation.

**Nothing prunes the table.** Consumed links are kept as history. A retention sweep is not yet designed.

---

## 7. Related

- [Deferred Delete (Probation)](../deferred-delete-probation/deferred-delete-probation.md) — the delete lifecycle this extends
- [Per-tenant Resource Assignment](../per-tenant-resource-assignment/resource-assignments.md) — assign / revoke / restore of tenant clones
- [Per-tenant Cloning](../per-tenant-cloning/per-tenant-cloning.md) — what a tenant clone is
- [Tenant Lifecycle Cron](../tenant-lifecycle-cron/tenant-lifecycle-cron.md) — the calendar-driven on/off, distinct from dependency-driven deletes

---

## Changelog

- **2026-08-06** — Cascade restore introduced. `probation_tracking` added; every cascade that inactivates a child now records it; reactivation restores exactly that set. Also fixed: `services` and `packages` could not actually hold the `probation` status (their enums lacked the value), so a deferred delete of a **booked** service or package never parked correctly. Location deletes now also take down each unit's availability schedule, which previously survived its unit.
