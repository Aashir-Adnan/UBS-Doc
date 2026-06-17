# Tenant Lifecycle Cron

This is the "what happens to a hotel when its trial or subscription runs out — and what happens when it pays" reference. It's the one automated job that flips a tenant's `status` on or off based on the calendar, and emails the hotel's admins along the way.

> **Prerequisite:** [governance-model.md](../tenant-governance-model/governance-model.md) §1–§3 (the four tiers and the **Tenant Admin = `TENANT` + `Admin`** persona). This page assumes you know what a Tenant Admin is and that a hotel is a row in `tenants`.

---

## 1. The one-paragraph version

A single daily background job (`Services/Integrations/CronJobs/tenantLifecycleCron.js`) wakes up once a day, looks at every hotel's trial and subscription dates, and does three things: **warns** admins before the clock runs out, **deactivates** the hotel after a grace period if nobody renews, and **reactivates** a hotel that's switched off but actually has a valid subscription. Nothing else in HMS deactivates a tenant on a timer — this is it.

It runs **two lifecycles** with the same engine:

| Lifecycle | Applies to a hotel whose… | Date it watches | Grace before shut-off |
|---|---|---|---|
| **Trial** | `subscription_status = 'trial'` | `trial_ends_at` | **1 day** |
| **Subscription** | `subscription_status = 'active'` | `subscription_ends_at` | **7 days** |

A trial hotel is switched off the **day after** its trial ends. A paying hotel whose subscription lapses keeps working for a **full week** first — then is switched off if it still hasn't renewed.

---

## 2. The timeline (what a hotel admin actually experiences)

Take a hotel on a **paid subscription** ending **June 20**. With the 7-day grace, here's the year-in-the-life:

```
 Jun 19   ──►  📧 "Your subscription ends tomorrow"        hotel: ACTIVE
 Jun 20   ──►  📧 "Ends today — you have 7 days, we'll      hotel: ACTIVE  (grace begins)
                   deactivate on Jun 27 unless you renew"
 Jun 21–26 ─►  (silence — still in grace)                   hotel: ACTIVE
 Jun 27   ──►  📧 "Your tenant has been deactivated"        hotel: INACTIVE
```

A **trial** hotel ending June 20 is the same shape but compressed to a 1-day grace:

```
 Jun 19   ──►  📧 "Your trial ends tomorrow"                hotel: ACTIVE
 Jun 20   ──►  📧 "Ends today — deactivated tomorrow         hotel: ACTIVE  (grace = today only)
                   unless you upgrade"
 Jun 21   ──►  📧 "Your tenant has been deactivated"        hotel: INACTIVE
```

The key promise: **during the grace window the hotel stays fully active.** `status` is only ever switched off *after* the grace has completely lapsed — never during it.

---

## 3. What "deactivate" actually writes

Deactivation is a soft switch-off, not a delete. One row update:

```sql
UPDATE tenants
   SET status = 'inactive',
       is_active = 0,
       subscription_status = 'expired',
       updated_at = NOW()
 WHERE tenant_id = ?
```

Flipping `subscription_status` to `expired` is deliberate — it takes the hotel out of every trial/subscription bucket, so the next day's run won't keep re-processing or re-emailing it. The hotel's data is untouched; it just can't be operated until it's reactivated.

---

## 4. Reactivation — the hotel that should be on but isn't

The cron also reconciles the other direction. If a hotel's `status` is **off** (`inactive` or `pending`) but its trial/subscription is **still valid** (end date in the future), the cron turns it back on:

```sql
-- matched by the reactivate stage
status <> 'active'  AND  subscription_status IN ('trial','active')  AND  <end_date> > NOW()
```
```sql
-- and restored with
UPDATE tenants SET status = 'active', is_active = 1, updated_at = NOW() WHERE tenant_id = ?
```

This handles a hotel that was switched off manually (or by an earlier lapse) and then paid — its `subscription_ends_at` moves into the future, and the next run flips it back on with a "you're active again" email.

**Two states are deliberately left alone:** `suspended` and `cancelled`. Those are *intentional* decisions, so the cron never auto-reactivates them — it only reconciles hotels that are genuinely on a live `trial`/`active` plan. And it never undoes its own shut-offs: a hotel the cron deactivated has `subscription_status = 'expired'`, which is outside the reactivation scope. It comes back only on a real renewal.

**Platform / SaaS-Admin-owned tenants are excluded entirely.** Every stage (warn, deactivate, **and** reactivate) skips any tenant whose `created_by` is the **SaaS-Admin URDD** — i.e. the system/platform tenant and anything the SaaS Admin owns. These aren't subscription-driven hotels, so the cron must never flip their `status` on a timer. This matters specifically when the **system tenant is intentionally left `inactive`**: it carries `subscription_status = 'active'` with a far-future `subscription_ends_at`, which would otherwise make the reactivate stage switch it back on every night. The SaaS-Admin URDD is resolved once per run (by natural key, never hard-coded); if it can't be resolved the exclusion is simply skipped (fail-open to the prior behaviour).

---

## 5. Who gets the email, and how it's branded

Recipients are the hotel's **active Tenant Admins** — users on an active URDD whose RDD is `designation_code = 'TENANT'` + `role_name = 'Admin'`, scoped to that tenant. If a hotel has no admins (e.g. a brand-new tenant), it falls back to `tenants.contact_email`. If there's neither, the status change still happens; only the email is skipped.

Emails are branded with the **hotel's own** `tenant_name` and `tenant_logo` (the logo is the attachment id, passed straight through). When a hotel has no name, the platform **Serenity** brand is the fallback. Each admin gets their own copy; a send failure is logged and never blocks the status change.

---

## 6. Renewing is automatic — there's no "renew" hook here

You don't tell this cron anything when a hotel pays. Renewal just means **pushing the end date into the future** (`subscription_ends_at` / `trial_ends_at`) and setting `subscription_status` back to `active`/`trial`. Once that's true:

- the hotel stops matching the "ends tomorrow / ends today / past grace" buckets, so no more warnings or shut-off; and
- if it had been switched off, the reactivate stage turns it back on.

So the renewal flow lives wherever payments are handled — this cron simply reacts to the dates.

---

## 7. Worked example — a full run

Suppose **today is Jun 14** and the run finds these hotels:

| Hotel | `subscription_status` | end date | What the cron does |
|---|---|---|---|
| Alpha (trial) | `trial` | `trial_ends_at = Jun 15` | 📧 "trial ends tomorrow" |
| Bravo (trial) | `trial` | `trial_ends_at = Jun 13` | switched **off** (1-day grace lapsed) + 📧 deactivated |
| Charlie (sub) | `active` | `subscription_ends_at = Jun 14` | 📧 "ends today — deactivated Jun 21 unless you renew" |
| Delta (sub) | `active` | `subscription_ends_at = Jun 10` | still **active** — only 4 days into the 7-day grace |
| Echo (sub) | `active` | `subscription_ends_at = Jun 5` | switched **off** (9 days > 7-day grace) + 📧 deactivated |
| Foxtrot | `active` (but `status = inactive`) | `subscription_ends_at = 2027-01-01` | switched **back on** + 📧 "active again" |
| Golf | `suspended` | `subscription_ends_at = 2027-01-01` | **untouched** (intentional state) |
| Sys (platform) | `active` (but `status = inactive`, `created_by = SaaS-Admin URDD`) | `subscription_ends_at = 2027-01-01` | **untouched** (SaaS-Admin-owned — excluded from every stage; *not* reactivated) |

Each hotel lands in exactly one bucket, so each gets exactly one action that day.

---

## 8. Operational notes

- **Schedule:** once a day at **09:00 server time** by default. Override with the `TENANT_LIFECYCLE_CRON_SCHEDULE` env var (a cron expression).
- **Grace lengths** are env-tunable: `TRIAL_GRACE_DAYS` (default `1`), `SUBSCRIPTION_GRACE_DAYS` (default `7`).
- **Safe to run daily.** Buckets are calendar-day based, so each email fires once per day, and a deactivated hotel drops out of all buckets. A hotel reactivated in a run is skipped by that same run's "ends soon" warnings, so it never gets "you're active again" and "you're expiring" back to back.
- **Enablement:** the job is started from `initCron()` (`Src/Bootstrap/cron.js`), called in `Src/server.js`. A separate, unrelated billing cron (`AutoRenewalCron`) is intentionally left disabled and should not be switched on without review.
- **One thing to know:** there's no persistent "already emailed" ledger — duplicate-suppression relies on the once-a-day cadence. If the process restarts and the daily tick re-fires the same day, a hotel could be emailed twice. Add a notifications-log table if you ever need hard-once guarantees.

---

## See also

- [Governance Model](../tenant-governance-model/governance-model.md) — the Tenant Admin persona and the four tiers.
- Backend system-context module `15_tenant_lifecycle_cron.md` (`hms/backend/docs/system_context/`) — the code-level reference: exact SQL buckets, method map, and column usage.
