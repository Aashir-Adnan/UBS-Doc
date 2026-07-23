---
title: "Seniority Scope"
sidebar_position: 1
---

# Seniority Scope — who may act on whom

Three related questions govern every user-management write:

1. **Who may I act on?** — may this admin edit *that* user's profile, roles, or permissions?
2. **What may I grant?** — may this admin hand out *that* role?
3. **Who may I delete?** — the Users CRUD Delete forbids removing anyone *senior* to you.

All three are answered from one place, `Governance/seniorityScope.js`, so the rules cannot drift between the endpoints that use them.

---

## The hierarchy

Seniority lives on **`roles_designations_department.senior_rdd_id`**, which points **UP** at the role a row reports to. An RDD is a `(role, designation, department)` triple scoped to a tenant; a user is attached to one via a **URDD** (a "leg" — a user may hold several, one per tenant).

Here is a real tenant's role tree:

```
  275  TENANT/Admin          senior_rdd_id = NULL     ← ROOT (top)
   ├── 276  STAY/Manager     senior_rdd_id = 275
   ├── 277  DINE/Manager     senior_rdd_id = 275
   ├── 278  SPA/Manager      senior_rdd_id = 275
   └── 515  BOOKING/Manager  senior_rdd_id = 275

  274  STANDARD/Guest        senior_rdd_id = NULL     ← GUEST (bottom)
```

:::warning `senior_rdd_id IS NULL` means two opposite things
| On a… | It means | Therefore |
|---|---|---|
| **guest** role (`STANDARD`) | reports to nobody — the **bottom** | junior to everyone |
| **any other** role | nothing above it — a **root**, the **top** | senior to anyone who *does* sit on a chain |

The chain walk cannot distinguish them — both are simply unreachable — so each gets its **own branch**, never the walk.
:::

---

## Rule 1 — who may I act on?

An actor may act on **juniors, peers and guests**. Never on **itself**, never on a **senior**.

Evaluated in this order — the order matters, and self is deliberately first:

| # | Branch | Outcome |
|---|---|---|
| 1 | **Self** — the target is the acting user, incl. via another leg of the same user | ⛔ **403**, always |
| 2 | **Guest target** — the target's roles are all guest roles | ✅ pass (same tenant, or no tenant yet) |
| 3 | **Root actor** — acting role is non-guest with no `senior_rdd_id` | ✅ pass (same tenant, target on a chain) |
| 4 | **Persona override** — SaaS-Admin anywhere; Tenant-Manager in its own tenant | ✅ pass |
| 5 | **Chain walk** — walk UP from the target's **own** role; reached the acting role? | ✅ pass / ⛔ **403** |

**Self is checked before everything else** so that neither the persona overrides nor the peer rule can re-open self-service. A SaaS-Admin cannot edit its own account either.

### Worked examples

Using the tree above:

| Actor | Target | Result | Why |
|---|---|---|---|
| `275` TENANT/Admin | `276` STAY/Manager | ✅ allowed | walk from 276 → \{276, **275**\}; the actor's role is in it |
| `276` STAY/Manager | `275` TENANT/Admin | ⛔ 403 | walk from 275 → \{275\}; 276 never appears — the target is a **senior** |
| `276` STAY/Manager | `276` STAY/Manager *(different user)* | ✅ allowed | **peer** — the walk seeds at the target's own role, so it matches at depth 0 |
| `276` STAY/Manager | *itself* | ⛔ 403 | branch 1 — self, regardless of the peer rule |
| `276` STAY/Manager | `277` DINE/Manager *(and no other staff role)* | ⛔ 403 | **siblings are not peers** — walk from 277 → \{277, 275\}; 276 is not there |
| any staff | `274` STANDARD/Guest | ✅ allowed | branch 2 — guests are junior to every non-guest role |
| `276` STAY/Manager | a brand-new user | ✅ allowed | branch 2 — a new user holds only the global guest leg |

:::info Peer ≠ sibling
A **peer** is someone on the **same RDD**. Two *different* roles at the same depth (`STAY/Manager` and `DINE/Manager`) are **siblings**, and neither may act on the other — a spa manager has no business editing the restaurant manager.
:::

:::caution A user is judged on ALL of their roles at once
The walk is seeded from **every** non-guest role the target holds and passes if **any one** of them is reachable. A user holding both `STAY/Manager` and `DINE/Manager` is therefore manageable by the stay manager — matched on the shared `276` leg, not on `277`.

So the effective rule is **"is any of the target's roles at or below mine?"**, not "are all of them". Granting someone an extra junior role makes them *more* manageable, never less.
:::

---

## Rule 2 — what may I grant?

The first rule alone is bypassable **by proxy**: an actor forbidden from editing a senior could simply create a user (or edit a junior), hand them a senior role, and end up with an account that outranks itself.

So every requested role is checked too: **you may not assign a role that is a strict ancestor of your own.**

> Rejects with: `You cannot assign a role that is senior to your own (TENANT/Admin).`

| Actor | Assigning | Result | Why |
|---|---|---|---|
| `276` STAY/Manager | `275` TENANT/Admin | ⛔ 403 | 275 is an ancestor of 276 |
| `276` STAY/Manager | `276` STAY/Manager | ✅ allowed | own level — strict ancestors only |
| `276` STAY/Manager | `277` DINE/Manager | ✅ allowed | a sibling is not an ancestor — see the caveat below |
| `275` TENANT/Admin | anything in its tenant | ✅ allowed | a root has nothing above it, so nothing is ever refused |

It runs on the shared role-sync engine, so **adding** roles and **updating** them both carry it — guarding only the create path would leave the identical escalation one update away.

---

## Rule 3 — who may I delete?

The Users CRUD **Delete** applies a *narrower* rule than Rule 1: it does not require the target to be junior — it only forbids deleting someone **senior** to you. Peers and juniors may be deleted; a senior may not.

Because a target may hold several roles, seniority is judged by the target's **most senior** role: if **any** of the target's roles sits above the actor in the chain, the whole user outranks the actor and is protected.

> Rejects with: `You cannot delete a user who is senior to you.`

| Actor | Deleting | Result | Why |
|---|---|---|---|
| `276` STAY/Manager | a `275` TENANT/Admin user | ⛔ 403 | 275 is an ancestor of 276 — the target is senior |
| `276` STAY/Manager | a user holding **both** `274` Guest and `275` TENANT/Admin | ⛔ 403 | judged by the **most senior** leg (275), not the guest one |
| `276` STAY/Manager | a `277` DINE/Manager user | ✅ allowed | a sibling is not senior |
| `276` STAY/Manager | a guest / a peer | ✅ allowed | neither is senior |
| `275` TENANT/Admin | anyone in its tenant | ✅ allowed | a root has no seniors |

Self-delete is handled separately by a dedicated self-delete block; this rule covers only the "above me" direction. It **fails open** where the chain is un-backfilled, so it only ever tightens the previous behaviour (Delete had no seniority check at all). As seeded, only the tenant root persona holds `delete_users`, so today it is defense-in-depth — it bites the moment `delete_users` is granted to a non-root persona.

---

## Where each rule applies

| Endpoint / step | Act-on (R1) | Grant (R2) | Delete-senior (R3) | Other gates |
|---|---|---|---|---|
| **Grouped user CRUD** — step 1 **Add** (create user) | — *(no target yet)* | — | — | duplicate **email** + **passport** (409) |
| **Grouped user CRUD** — step 1 **Update** (profile) | ✅ | — | — | — |
| **Grouped user CRUD** — step 2 **Add** (attach roles) | ✅ | ✅ | — | role must belong to the actor's tenant |
| **Grouped user CRUD** — step 2 **Update** (re-sync roles) | ✅ | ✅ | — | role must belong to the actor's tenant |
| **Grouped user CRUD** — step 2 **Delete** (remove a role) | — | — | — | target URDD must be in the actor's tenant |
| **Permission Manager** (`POST /api/assign/permissions`) | ✅ | — | — | capability, tenant equality, persona-bound assignable set |
| **Users CRUD** — Add / Update | *not used* | *not used* | — | — |
| **Users CRUD** — Delete | — | — | ✅ | self-delete block + `delete_users` permission |
| **All List / View reads** | — | — | tenancy filter in the query resolver |

:::note Reads are not seniority-scoped
Seniority governs **writes** only. What an admin can *see* is decided by the tenancy filter in the query resolver, which is a separate mechanism.
:::

---

## Personas that outrank the chain

Applied only **after** the self check:

| Persona | Scope |
|---|---|
| **SaaS-Admin / SYSTEM** | senior to everyone, unconditionally |
| **Tenant-Manager** | senior to everyone **inside its own tenant only** — **except a SaaS-Admin (SYSTEM) target** (they share the SYSTEM tenant; this carve-out stops a Tenant-Manager editing a genuine senior) |

**Why they exist:** `senior_rdd_id` is not consistently backfilled. Measured on the dev database, the raw chain alone rejected **263 of 287** legitimate Tenant-Manager operations and **50 of 50** SaaS-Admin ones — it locked platform and tenant admins out of their own tooling. Tenant equality keeps the Tenant-Manager override from becoming a cross-tenant escape hatch.

The long-term fix is a seniority backfill so every tenant role chains up to its Tenant-Manager role, after which that override could be dropped.

---

## Tenant isolation

Normally the chain provides it for free: a tenant's roles report up to *that* tenant's root, so another tenant's role can never appear in the walk.

The two branches that **skip** the walk — guest target and root actor — assert tenant equality **explicitly** instead, since nothing else would.

---

## Known limits

- **Fails open where the chain is missing.** An RDD with no `senior_rdd_id` is simply unreachable, so it is not reported as senior. This is why the persona overrides above are needed. It also means the assignment rule can only ever *tighten* current behaviour, never break an assignment that works today.
- **Sibling roles can grant each other.** A `STAY/Manager` may assign the `DINE/Manager` role, since a sibling is not an ancestor. Preventing this needs a policy for lateral grants, not a seniority rule.
- **Any-leg matching is permissive.** As noted above, one reachable role makes the whole user manageable — including their other, unreachable roles. Splitting authority per-leg would be a deeper change to how the write endpoints resolve their target.
- **Reads are unaffected**, as noted above.
- **Grouped-CRUD deletes carry no seniority check** — neither grouped step-1 Delete nor grouped step-2 Delete consults it; they rely on tenant ownership and permissions. Only the **Users CRUD** Delete carries the delete-senior rule (Rule 3).

---

## Verification

The rules are exercised end-to-end against a live server by `sim/admin_side_full_flow/step10_seniority_scope.js`, which drives the real encrypted APIs rather than calling the helper directly:

| Case | Asserts |
|---|---|
| **A** | creating a user via the real two-request flow is not blocked |
| **B** | self-action is refused on every write path, and nothing changed |
| **C** | a junior in the actor's own tenant is manageable |
| **D** | a junior cannot act on its senior, with no-escalation-landed checks |
| **E** | ordinary staff — no persona override — may edit a guest of its own tenant |
| **F** | a peer sharing the actor's role is manageable; self still is not |
| **G** | a senior role cannot be granted, via Add **or** Update; own level still can |
| **H** | Users CRUD Delete refuses a senior target (holding `delete_users`); the same actor may delete a peer |
