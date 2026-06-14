# Original-to-Clone Propagation — re-syncing an edited original into its clones

When the SaaS Admin edits a **global original** (a config key, service category, or scenario config), the tenant **clones** of that original do **not** change automatically — a clone is the hotel's own editable copy. **Propagation** is the explicit, conflict-safe re-sync that pushes an original's edit down into its clones. This guide documents the one engine behind it (`propagateAssignmentUpdates`) — the algorithm, what it merges, what it leaves alone, and the failure mode that once made it silently do nothing.

> **Prerequisite:** read [governance-model.md](../tenant-governance-model/governance-model.md) (the `created_by` isolation rule and the SaaS-Admin-owns-the-original / tenant-owns-a-clone split) and skim [per-tenant-cloning.md](../per-tenant-cloning/per-tenant-cloning.md). A clone here is a source-tracked clone — it carries a `source_*_id` lineage column pointing back to the original.

---

## Authentication

Propagation is never called directly by an end user — it runs **inside** an authenticated admin-platform request (the two triggers below), under that request's actor (`actionPerformerURDD`). It writes only to clones of an original the actor is allowed to edit.

---

## 1. The two triggers

The same function, `propagateAssignmentUpdates(resourceType, sourceId, connection)`, runs from two places:

| Trigger | Where | When |
|---|---|---|
| **`apply_on_all`** on an `enabled_for` edit | [config-keys API](../config-keys/config-keys.md#apply_on_all--propagate-a-system-level-change-to-tenants) (`PUT …/enabled_for`) | A **side effect** — after the original's `enabled_for` is saved, when `apply_on_all` is truthy and the edited row is a global original. |
| **`propagate`** (the PUT verb) | [Resource Assignments](../per-tenant-resource-assignment/resource-assignments.md#8-propagate--re-sync-an-updated-original) (`PUT /api/tenantAssignmentsGroupedCrud`) | The **primary action** — a SaaS Admin explicitly re-syncs one (or a batch of) edited originals. |

Both paths are **best-effort and non-fatal**: the original is already committed before propagation runs, so a failure anywhere is logged and never fails the save.

---

## 2. The algorithm

Given the `sourceId` of an edited original:

1. **Load the source row.**
2. **Find its active clones** — `WHERE source_*_id = <sourceId> AND status = 'active'`. (Inactive/revoked clones are skipped; the lineage column is what links clone → original.)
3. **For each clone, decide edited vs. unedited** — by **who** last wrote it, not just when:

   ```
   changedAfterCreate = clone.updated_at  >  clone.created_at + 1 second
   editedByNonOwner   = clone.updated_by IS NOT NULL
                        AND clone.updated_by != clone.created_by
   tenantEdited       = changedAfterCreate AND editedByNonOwner
   ```

   Every cloned config row is `created_by` the tenant's **Tenant-Manager URDD (URDD-B′)**. So:
   - `updated_by` **NULL** (back-sync writes don't stamp it) **or** `updated_by == created_by` (the owning Tenant Manager touched it) → **not a tenant edit** → treated as unedited.
   - `updated_by` present **and** different from `created_by` (a tenant **Admin** edited its own copy) → a real customisation.

   Then:
   - **Unedited** → **auto-apply** the diff (below). Added to `updated[]` *only if a field actually changed* (a clone already in sync is a silent no-op — so it never triggers a spurious "your setting changed" email).
   - **Edited by a non-owner** → **leave it exactly as-is.** No write, no status change. Added to `conflicts[]` for visibility only.

   > **Why the updater check.** A timestamp-only test (`updated_at > created_at + 1s`) wrongly flagged *fresh, untouched* clones as edited: clone-creation back-sync (`rebuildPossibleValuesMap` / category backfill / reactivation) writes the row right after insert — sometimes seconds later in a separate transaction — bumping `updated_at` without any tenant involvement. Those writes leave `updated_by` NULL or set it to the owner, so gating on the updater identity keeps such clones re-syncable. Only a non-owner write counts.

4. **Return** `{ updated: number[], conflicts: number[] }` (clone ids).

### 2.1 What "auto-apply the diff" copies

- **Scalar fields** (per resource type — e.g. for `config_key`: `config_name`, `target_table`, `value_type`, `is_required`, `description`, …) are straight-copied where the clone differs from the source.
- **`enabled_for` is *merged*, not overwritten** (config_key only) — see §2.2.

### 2.2 The `enabled_for` merge (config keys)

A clone's `enabled_for` keys are the **tenant's own** category ids, and a clone may carry tenant-only scope keys. So `enabled_for` is merged, not replaced:

1. **Remap** the source's category keys (global ids) to **this tenant's** category ids (`buildCategoryIdMap` on the clone's owner). Non-numeric keys (`package`, `user`, `parent_id`, …) are preserved verbatim.
2. **Preserve clone-only keys** — anything present in the clone but absent from the remapped source (typically `parent_id` lineage and tenant-added scopes).
3. `merged = { ...remappedSource, ...cloneOnly }` — for any key present in both, **source wins**.
4. Write only if `merged` differs from the clone's current `enabled_for`.

> **Adding a brand-new scope key propagates cleanly.** Edit the original to add e.g. `"user":1` → it rides in via `remappedSource`, so every *unedited* clone gains `"user":1`. (Edited clones are left as-is — see the worked example.)

---

## 3. Why there is no `needs_review` status

Earlier, an edited clone was flagged `status = 'needs_review'` instead of being skipped. **That value does not exist:** `hms_config_keys.status` (and `service_categories.status`) are `enum('active','inactive')`, and no migration ever added `needs_review`. Under `STRICT_TRANS_TABLES` the write threw `Data truncated for column 'status'`, which **aborted the entire propagation transaction** — so a *single* tenant-edited clone in the set meant **no clone, edited or not, ever received the update**, while the error was swallowed as non-fatal. The save looked successful; nothing propagated.

The flag was removed. Edited clones are now simply **left untouched** and reported in `conflicts` — the tenant adopts the change on its own terms. No schema change is required, and a mixed set (some edited, some not) propagates correctly to the unedited ones.

---

## 4. Notifications

After propagation commits, for each tenant whose clone was **actually updated** (`updated[]` only), the active **Tenant Admin(s)** get a deliberately **non-technical** email — it names the config and the hotel, says the setting was updated and is active, and points them to *Service & Package Configurations*. No scope keys, JSON, or "clone" wording. Clones in `conflicts[]` are **not** emailed (their value didn't change). For the batch `propagate` verb, a tenant gets **one** consolidated email per request (up to 3 config names spelled out, the rest folded into "and N more"). Notification is best-effort.

---

## 5. Worked example

Original `laundry` (`enabled_for`) edited to add `"user":1`, with `apply_on_all: true`. Three of its clones:

| clone | edited since creation? | result |
|---|---|---|
| Tenant A — `{"31":1,"package":0,"parent_id":135}` | no | merged → `{"31":1,"package":0,"user":1,"parent_id":135}` → `updated[]`, admin emailed |
| Tenant B — already `{"…","user":1,…}` | no | no change (already in sync) → **not** in `updated[]`, not emailed |
| Tenant C — customised after creation | yes | **left as-is** → `conflicts[]`, not emailed |

Returned report: `{ updated: [A], conflicts: [C] }`.

---

## 6. Response

Propagation itself returns `{ updated: number[], conflicts: number[] }`. How that surfaces depends on the trigger:

| Trigger | Surfaced as |
|---|---|
| `apply_on_all` (config-keys Update) | The Update result is augmented with `{ propagation: { updated, conflicts }, notification }` (best-effort; absent on a non-propagating edit). |
| `propagate` (assignments PUT) | `{ success, resource_type, source_id, updated[], conflicts[], notification }`; a `source_id` array returns the per-item bulk envelope. |

---

## 7. Database Changes

| Table | Written when |
|---|---|
| `hms_config_keys` / `service_categories` | Auto-apply on **unedited** clones — scalar-field UPDATE and (config_key) the merged `enabled_for`. **No write** for edited clones. |

All writes target clones (`source_*_id IS NOT NULL`); the original is untouched by propagation (it was saved by the triggering request).

---

## 8. Gotchas

- **Edit-detection is keyed on the updater, not just the timestamp.** A clone is "tenant-edited" only when `updated_by` is **present and ≠ `created_by`** (a tenant Admin) **and** it changed after creation. A NULL `updated_by` or `updated_by == created_by` (the owning Tenant Manager / back-sync) is **not** an edit, so those clones stay re-syncable — this is what stops fresh, back-sync-touched clones from being wrongly skipped. Caveat: a governance write by a *different* manager URDD (not this tenant's URDD-B′) would stamp a non-owner `updated_by` and be treated as a tenant edit; in practice clones are only ever written by their own URDD-B′ or a tenant Admin.
- **Source wins on shared `enabled_for` keys.** Merge precedence is `{ ...remappedSource, ...cloneOnly }`; a key present in both takes the source's value. Only keys *absent* from the source are preserved from the clone.
- **`conflicts` is informational.** Nothing is written for an edited clone — it is neither updated nor flagged. Resolving the divergence is a tenant action.
- **No-op clones are omitted from `updated[]`.** A clone already matching the source produces no email — intended, so re-running propagation doesn't spam tenants.
- **Best-effort.** The original is committed first; a propagation/notification failure is logged, never surfaced as a save failure. Check server logs (e.g. `enabled_for propagation failed for config_key <id>`) when a propagation seems to have done nothing.

---

## Change Log

| Date | Change |
|---|---|
| 2026-06-12 | Initial dedicated propagation guide. Documents the removal of the `status='needs_review'` write (the enum has no such value; under strict SQL mode it threw and rolled back the whole propagation) — edited clones are now left as-is and reported as `conflicts`. Edit-detection now keys on the **updater** (`updated_by` present and ≠ `created_by`) in addition to the timestamp, so fresh, back-sync-touched clones are no longer mis-flagged as tenant edits. |

---

## Source references

| Topic | Source |
|---|---|
| The propagation engine | `Src/HelperFunctions/PayloadFunctions/Governance/propagateAssignmentUpdates.js` |
| `apply_on_all` trigger (side effect of an `enabled_for` edit) | `Src/Apis/ProjectSpecificApis/HmsConfigKeysEnabledForCrud/` (`updatePostProcess`); [config-keys.md](../config-keys/config-keys.md#apply_on_all--propagate-a-system-level-change-to-tenants) |
| `propagate` trigger (the PUT verb) | `Src/Apis/ProjectSpecificApis/TenantAssignmentsGroupedCrud/`; [resource-assignments.md](../per-tenant-resource-assignment/resource-assignments.md#8-propagate--re-sync-an-updated-original) |
| `enabled_for` key remap / category id map | `Governance/materializeConfigValuesForCategory.js` (`buildCategoryIdMap`, `remapEnabledForKeys`) |
| Tenant-Admin notification | `Governance/notifyTenantAdminsOfConfigChange.js` |
