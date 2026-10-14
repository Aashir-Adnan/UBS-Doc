# Background Jobs (Crons)

Every scheduled job the HMS backend runs: when it runs, what it does, the rules it applies, and whether it is switched on. It also lists the states that have **no** job yet and stay until someone fixes them by hand.

Updated 2026-10-12.

---

## How the jobs run

- All jobs are `node-cron` tasks inside the API server process, started by `initCron()` in `Src/Bootstrap/cron.js`. There is no separate worker.
- Each job has an `isRunning` guard, so a slow run is skipped instead of overlapping the next one.
- **Every server instance runs every job.** With more than one instance, each job runs once per instance. They are written to be idempotent, but sends (emails, webhooks, Moyasar calls) can race. Run the cron-bearing process on a single instance.
- **Time zone:** when `DB_TIMEZONE` is UTC, the server runs with `TZ=UTC`, so cron times below are **UTC** unless the job has its own time-zone setting (translation, database backup).
- Every schedule can be changed with the environment variable named in the table, using standard cron syntax (5 fields, or 6 with seconds).

---

## Summary

| Job | Status | Default schedule | Override | Purpose |
|---|---|---|---|---|
| [Partner events](#partner-events) | Running | every 10 seconds, purge daily 03:45 | `PARTNER_EVENTS_SCHEDULE`, `PARTNER_EVENTS_PURGE_SCHEDULE`, `PARTNER_EVENTS_RETENTION_DAYS` | deliver webhooks to partner platforms, purge old events |
| [Payment reconciliation](#payment-reconciliation) | Running | every 15 minutes | `PAYMENT_RECONCILIATION_SCHEDULE`, `PAYMENT_STALE_MINUTES`, `PAYMENT_ABANDON_HOURS` | settle Moyasar payments that the app or webhook never confirmed |
| [Notification scheduler](#notification-scheduler) | Running | every 15 minutes | `NOTIFICATION_CRON_SCHEDULE` | check-in, checkout and review reminders to guests |
| [Overflow refund](#overflow-refund) | Running | every 30 minutes | `OVERFLOW_REFUND_SCHEDULE` | refund overpayment after checkout |
| [Visit lifecycle](#visit-lifecycle) | Running | daily 03:15 | `VISIT_LIFECYCLE_SCHEDULE` | unpublish visits that can no longer be sold, restore them when fixed |
| [Probation finalizer](#probation-finalizer) | Running | daily 09:30 | `PROBATION_FINALIZER_CRON_SCHEDULE` | finish deferred deletes once nothing depends on the row |
| [Translation](#translation) | Running (on unless turned off) | daily 00:00 Asia/Riyadh | `TRANSLATION_CRON_ENABLED`, `TRANSLATION_CRON_SCHEDULE`, `TRANSLATION_CRON_TIMEZONE`, `TRANSLATION_CRON_MODE`, `TRANSLATION_CRON_DEADLINE_HOUR` | refresh outdated Arabic translations, then fill missing ones |
| [Database backup](#database-backup) | **Off unless enabled** | daily 02:00 | `DB_BACKUP_CRON_ENABLED`, `DB_BACKUP_CRON_SCHEDULE`, `DB_BACKUP_CRON_TIMEZONE` | encrypted database dumps with rotation |
| [Tenant lifecycle](#tenant-lifecycle) | **Disabled** (commented out) | daily 09:00 | `TENANT_LIFECYCLE_CRON_SCHEDULE` | trial and subscription reminders and deactivation |
| [Auto-renewal](#auto-renewal) | **Disabled** on purpose | every minute | none | subscription auto-renewal and permission clean-up |
| Issue scanner | Not loaded | — | — | developer tool that scans GitHub issues for agent tasks; not part of the product |

Jobs that run once when the server starts, not on a schedule, are listed under [Startup jobs](#startup-jobs). Unpaid bookings have **no** job: see [Unpaid bookings](#unpaid-bookings).

---

## Partner events

`Services/Integrations/CronJobs/partnerEventsCron.js`, logic in `Src/HelperFunctions/Visits/partnerEvents.js`.

**Delivery, every 10 seconds**
- Picks up to 100 due events from `platform_event_outbox` (`status = 'pending'`, `next_attempt_at` reached). Events are written by a trigger on `bookings` (status and date changes of partner legs) and by visit changes.
- **Order:** an event for a booking is held back while an older event for the same booking is still pending, so one leg's events arrive in order.
- POSTs the frozen payload to the platform's webhook URL with `X-Event-Id`, `X-Timestamp` and `X-Signature` (HMAC-SHA256 of timestamp + body), 10-second timeout, no redirects.
- **Success:** any 2xx marks the event `delivered`.
- **Failure:** retried after 1 min, 5 min, 30 min, 2 h, 6 h and 15 h. After the 7th failure the event is `dead` (it stays available through partner replay, and the log asks for an operator).
- **No webhook or secret configured:** delivery fails the same way and ends `dead`; replay still has the event.
- **`leg.rejected`:** before delivering it, the job cancels the purchase's other pending or confirmed legs (each sends `booking.cancelled_by_system`).

**Purge, daily 03:45**
- Deletes `delivered` and `dead` events older than 30 days (`PARTNER_EVENTS_RETENTION_DAYS`), 5,000 per run.

## Payment reconciliation

`Services/Integrations/CronJobs/paymentReconciliationCron.js`.

- **Selects** Moyasar transactions still `pending` and older than 30 minutes (`PAYMENT_STALE_MINUTES`).
- **Finds the payment** by the Moyasar id saved on the transaction, or by the `[HMS:<transactionId>]` description, then checks it with Moyasar server to server.

| Moyasar says | Result |
|---|---|
| paid or captured, amount matches | transaction `completed`, booking `paid_amount` increased, guest notified, saved card stored if requested |
| amount does not match | skipped and logged, never auto-completed |
| failed, expired or voided | transaction `failed`, guest notified |
| still initiated or pending | left for the next run; after 24 h (`PAYMENT_ABANDON_HOURS`) marked `abandoned` |

- Only adds to `paid_amount` if it is the one that moves the transaction to `completed`, so a payment confirmed at the same time by the app or the webhook is never counted twice.
- **Never changes `booking_status` and never releases rooms.** See [Unpaid bookings](#unpaid-bookings).

### Where the cron fits

A Moyasar payment can be confirmed by any of four paths. The first one to move the transaction from `pending` to `completed` adds the amount to `paid_amount`; the others find it already completed and change nothing.

| Path | Trigger | File |
|---|---|---|
| App confirm | the app calls `POST /api/guest/payments/confirm` after the payment sheet closes | `Src/HelperFunctions/PreProcessingFunctions/Guest/guestMoyasarPayments.js` |
| Webhook | Moyasar calls `POST /callback/moyasar` | `Src/Routes/moyasarWebhook.js` |
| Redirect | the guest's browser returns to `GET /callback/moyasar` after 3-D Secure | `Src/Routes/moyasarWebhook.js` |
| **Reconciliation cron** | every 15 minutes, for transactions still `pending` after 30 minutes | `paymentReconciliationCron.js` |

The cron exists for payments where the app was closed before confirming **and** the webhook never arrived (or failed). Without it those payments would stay `pending` even though Moyasar took the money.

Full payment flow: [Booking payment lifecycle](../../payment-gateways/moyasar/booking-payment-lifecycle.md) and [Moyasar webhook](../../payment-gateways/moyasar/webhook.md).

### Unpaid bookings

No job acts on a booking that was never paid. The cron above only settles **transactions**; it does not touch the booking.

| Situation | What happens today |
|---|---|
| Booking created, payment never started | stays `confirmed` with `paid_amount = 0`, rooms and slots stay reserved |
| Payment started, then failed or expired at Moyasar | the transaction becomes `failed` and the guest is notified; the booking stays `confirmed` and reserved |
| Payment started and abandoned (still `initiated` at Moyasar after 24 hours) | the transaction becomes `abandoned`; the booking stays `confirmed` and reserved |
| Partly paid | stays as is; the balance is due at the hotel |

Staff have to cancel these by hand. A booking-lifecycle job that cancels unpaid bookings after a deadline and releases their rooms is proposed under [States with no job](#states-with-no-job).

## Notification scheduler

`Services/Integrations/CronJobs/notificationSchedulerCron.js`.

| Notification | When it is sent |
|---|---|
| `booking_reminder_24h` | 24 h before check-in |
| `booking_reminder_sameday` | morning of check-in (08:00 to 09:00) |
| `checkout_reminder` | morning of checkout (08:00 to 09:00) |
| `review_request` | 3 h after checkout, or 09:00 next day for a late checkout |
| `review_reminder` | 3 days after the review request, once, skipped if already reviewed |

- **Idempotent:** each send is keyed `<type>:<bookingId>` in `guest_notifications`; an existing row means it is not sent again.
- Cancelled and checked-out bookings are excluded at send time.
- **Known limits:** the "hotel-local" windows and quiet hours (22:00 to 08:00) use the server clock, not each hotel's time zone. Reminders also go to `pending` and `no_show` bookings.

## Overflow refund

`Services/Integrations/CronJobs/overflowRefundCron.js`.

- **Selects** active `checked_out` bookings where `paid_amount > total_amount` (overpaid after an edit) with no overflow refund already pending or completed.
- **Refunds** the difference through Moyasar partial refunds, spread over the booking's completed purchase transactions, newest first.
- Writes a `refund` transaction per refund (`overflow_refund`), lowers `paid_amount`, and notifies the guest.

## Visit lifecycle

`Services/Integrations/CronJobs/visitLifecycleCron.js`, logic in `Src/HelperFunctions/PreProcessingFunctions/Visits/visitLifecycle.js`.

- **Checks** every active visit that is published, plus drafts the job itself unpublished earlier.
- **Unpublishes** a published visit (back to `draft`, with `auto_unpublished_at` and a reason) when any leg has a problem:

| Reason | Problem |
|---|---|
| `component_missing` | the package or room was deleted |
| `component_probation` | the package or room is in probation |
| `component_archived` | the package or room is inactive or archived |
| `tenant_inactive` | the hotel is inactive |
| `consent_off` | the hotel turned off `allow_visit_bundling` |
| `visit_empty` | no legs left |

- **Restores** an auto-unpublished visit to `published` once its problems are gone and it has an active price. A curator's own draft is never restored.
- Sends `visit.invalidated` or `visit.restored` to every active partner platform (one outbox row each, delivered by the partner events job).
- The same check runs at once, for the affected visits only, when a package's or room's status changes or it is deleted, when a hotel's status changes or it is deleted or restored, and when a hotel's `allow_visit_bundling` consent changes. The full list is in [Visits admin APIs](../../visits/visits-admin-apis.md#automatic-unpublishing). The cron is the safety net for changes made outside those APIs.

## Probation finalizer

`Services/Integrations/CronJobs/probationFinalizerCron.js`.

- **Walks** every table in the delete-guard registry (`DeleteGuards/deleteGuards.js`) for rows in `status = 'probation'` (a delete that was blocked by live dependents).
- **Re-runs** each row's dependency checks. If nothing depends on it any more (bookings, units, tasks, roles), the row becomes `inactive` and its child rows are inactivated too. Otherwise it stays in probation.
- Some tables have their own finalizer, run in one transaction. For example, a service category also prunes its tenant's config keys and their options.
- An admin who reactivates a row (probation back to active) takes it out of scope.
- The SaaS admin and system tenant are never touched.

## Translation

`Services/Integrations/CronJobs/translationCron.js`, logic in `Services/SysScripts/DatabaseScripts/translationRunner.js`.

- Translates text from English into every active target language (Arabic today), writing `translated_entries` (`record_id`, `table_name`, `column_name`, `language_code_id`, `translated_text`).
- **Two passes per run, in order** (`TRANSLATION_CRON_MODE`, default `outdated,missing`):
  1. `outdated`: re-translates rows that already have a translation but whose English source changed since, overwriting the entry in place.
  2. `missing`: then translates rows that have no translation yet.

  The `missing` pass runs only when the `outdated` pass finished. If the `outdated` pass stops early (deadline, every translation API exhausted, a manual stop, or a run already in progress), the run ends there, and the next night starts again with `outdated`. Both passes share the same deadline.
- `TRANSLATION_CRON_MODE` takes an ordered, comma-separated list: `outdated` alone keeps the old single pass, `missing` alone backfills only, and an unknown value falls back to the default.
- **Deadline:** stops at 06:00 (`TRANSLATION_CRON_DEADLINE_HOUR`) in its time zone, or when every translation API is exhausted, and continues on the next run.
- Off when `TRANSLATION_CRON_ENABLED` is anything other than `true` (it defaults to `true`).

### What it translates

- **Tables:** by default only a whitelist (`TRANSLATION_TABLES_MODE=whitelist`), config-key tables first:
  - config tables: `hms_config_keys` (`config_name`, `description`), `hms_config_categories`, `hms_config_possible_values` (`config_possible_value`), `hms_scope_types`, `delivery_units`, `service_categories` (`label`, `description`);
  - catalog and reference tables: `api_messages` (`message_text`), `attachments`, `cities`, `countries`, `currencies`, `regions`, `departments`, `designations`, `locations`, `location_types`, `permissions`, `pricing_rules`, `roles`, `roles_designations_departments`, `guest_support_tickets`, `bookings`.

  `TRANSLATION_TABLES_MODE=all` walks every table with a text column.
- **Columns:** a whitelisted table translates only its listed columns, so slugs, codes and enum values stay in English.
- **Skipped values** (counted as skipped, never retried every night): empty text, JSON (`{` or `[`), URLs, text with no letters, and machine identifiers such as `snake_case` or `dotted.keys`.
- **Outdated:** a translation is outdated when the source row's `updated_at` is newer than the translation's `updated_at`. The whole row counts, so editing any column marks every translated column of that row outdated. Tables without `updated_at` are skipped by the `outdated` pass.

### Translation providers

Each text is tried against these services in order. A service that runs out of quota or has no key is marked exhausted for the rest of the run, and the next one is used:

1. Azure Translator (`AZURE_TRANSLATOR_KEY`, `AZURE_TRANSLATOR_REGION`, `AZURE_TRANSLATOR_ENDPOINT`), the main one: 2 million characters a month on the free tier.
2. MyMemory, 3. Google (free endpoint), 4. Lingva, 5. LibreTranslate, 6. Apertium: free public services used as fallbacks.

- Replies that look like a quota or error message (for example `MYMEMORY WARNING`) are rejected and the next service is tried.
- There is a 300 ms pause between texts.
- When every service is exhausted the run stops with outcome `apis-exhausted`, and the next night carries on.

### Progress and manual runs

- **Ledger:** progress is kept in an encrypted file, `Services/SysScripts/DatabaseScripts/dbHelpers/translationLedger.json`, one entry per environment (`NODE_ENV` and `DB_DATABASE`). It needs `DB_ENCRYPTION_KEY`. A run resumes where the last one stopped instead of rescanning every row.
- **Only one run at a time:** a manual run and the cron never overlap. The second one returns `already-running`, and the cron then skips the night.
- **Dev console:** `POST /api/dev-console/translations` shows progress, starts a run (`missing` or `outdated`, optionally one table and a record cap), stops a run after the current record, and marks outdated rows as acknowledged so they are not re-translated. See [Dev Console — Translations](../../admin-apis/dev-console-translations.md).

## Database backup

`Services/Integrations/CronJobs/databaseBackupCron.js`, configuration in `Services/Integrations/DatabaseBackup/backupConfig.js`. Full guide: [Database Backups](../database-backups/database-backups.md).

- **Off by default.** It only runs when `DB_BACKUP_CRON_ENABLED=true`. The dev `.env` does not set it.
- Dumps each target database, encrypts it (`DB_BACKUP_ENCRYPTION_KEY`) and stores it locally, on S3 or on GCS (`DB_BACKUP_STORAGE_PROVIDER`).
- **Rotation:** keeps 14 days (`DB_BACKUP_RETENTION_DAYS`) but never fewer than 3 backups (`DB_BACKUP_KEEP_MIN`).
- Emails `DB_BACKUP_NOTIFY_EMAILS` on failure, and on success when `DB_BACKUP_NOTIFY_ON_SUCCESS` is on.
- An invalid schedule or configuration logs an error and the job does not start.

## Tenant lifecycle

`Services/Integrations/CronJobs/tenantLifecycleCron.js`. **Disabled:** commented out in `initCron()` with no reason recorded.

What it would do daily:

| Track | Date | Grace | Day before | End day | After grace |
|---|---|---|---|---|---|
| Trial (`subscription_status = 'trial'`) | `trial_ends_at` | 1 day | reminder email | warning email | tenant deactivated, `subscription_status = 'expired'`, notice email |
| Subscription (`'active'`) | `subscription_ends_at` | 7 days | reminder email | warning email | same |

- Emails go to the tenant's active Tenant Admins (or `contact_email`), branded with the tenant.
- Renewing moves the date forward, so the tenant stops matching.

**While disabled:** trials never expire, ended subscriptions are never deactivated, and no reminders are sent.

## Auto-renewal

`Services/Integrations/CronJobs/autoRenewalCron.js`. **Disabled on purpose:** it runs every minute, takes real payments, and has a known bug (an undefined `connection` in `findSubscriptionsBeyondGracePeriod`). It should be re-enabled only after that bug is fixed and the schedule corrected.

What it would do: retry renewal payments for subscriptions within a 2-day grace period, and clean up permissions for subscriptions past it.

---

## Startup jobs

These run once, in order, each time the server starts (`Src/server.js`), before the crons are scheduled and before the server accepts requests. A failure stops the start-up and sends a startup-failure alert.

| Step | Status | What it does |
|---|---|---|
| `initializeLogger` | Running | sets up log files |
| `runMigrationsOnStart` | Running | runs every `.sql` file in `data/migrations/` (flat folder, not sub-folders), then moves it to `data/migrations_completed/` |
| `runSecurityMigrationsOnStart` | Running | the same for the security database |
| `initFolders`, `initNotifications` | Running | creates upload folders, wires notification channels |
| `initCron` | Running | schedules every job on this page |
| `dumpDatabaseOnStart` | **Off** (commented out) | dumped the database on start, optionally pushing it to a branch (`CREATE_BRANCH_FOR_DUMP`) |
| `exportSchemaOnStart` | **Off** (commented out) | wrote the schema to a file |
| `translateAllOnStart` | **Off** (commented out) | translated everything on start. Replaced by the [Translation](#translation) cron, which works within a nightly window and resumes |

---

## States with no job

These states have no job that moves them on. They stay until someone fixes them by hand.

| State | Effect today | Who moves it now |
|---|---|---|
| Unpaid booking, or one whose payment failed or was abandoned (see [Unpaid bookings](#unpaid-bookings)) | stays `confirmed` with `paid_amount = 0`; its rooms and slots stay reserved | staff only |
| `pending`, waiting for hotel approval (including partner visit legs) | rooms stay reserved with no deadline; the partner sees `awaiting_approval` indefinitely | staff only |
| Expired edit holds (stage) | held rooms are released only when the next stage request runs, anywhere in the system | the next stage request |
| Confirmed booking whose guest never arrived | the rest of the stay stays reserved until staff mark `no_show` (marking it now releases the rooms) | staff only |
| Guest checked in after their check-out date | the room stays blocked through each night until checkout (fixed 2026-10-11); nobody is alerted | staff checkout |
| Service slots past their time still `scheduled`, or `unscheduled` forever | wrong agendas and reports; nothing is blocked | staff checkout marks `missed` |
| Log and history tables (`api_logs`, `audit_logs`, `user_activity`, `qr_scan_logs`, `guest_notifications`, `dev_console_audit`, `device_otp`, `guest_qr_tokens`, `guest_quotes`, `booking_stages`) | grow forever; expiry is checked when read, so nothing breaks | no purge |

Proposed: one booking-lifecycle job (every 5 minutes) for unpaid and approval timeouts, expired holds, auto no-show and an overstay alert, plus a daily retention job for the log tables.

---

## Adding a job

1. Put the class in `Services/Integrations/CronJobs/` with `start()`, an `isRunning` guard and a schedule from an environment variable with a default.
2. Keep the logic in a helper you can call directly from a sim test (as `revalidateVisits` and `processDueEvents` are), so it can be tested without waiting for the schedule.
3. Register it in `initCron()` (`Src/Bootstrap/cron.js`) and add it to the startup log line.
4. Make it idempotent and safe to run on more than one server instance.
5. Add it to this page.
