---
title: Dev Console — Translations
---

# Dev Console — Translations

Progress and control for the English → Arabic backfill into `translated_entries`.

`POST /api/dev-console/translations`

Dev-team surface, same gate as the rest of the DB console. Every call is written to
`dev_console_audit`.

---

## Authentication & Authorization

| | |
|---|---|
| Platform | Admin dashboard default (no `platform` key) |
| Permission | `view_api_logs` |
| Audit | `translation_view` / `translation_scan` / `translation_run` |

---

## Request Payload

| Field | Type | Required | Description |
|---|---|---|---|
| `action` | `string` | No | `status` (default), `scan`, `run`, `stop`, or `acknowledge`. |
| `mode` | `string` | No | `run` only. `missing` (default) or `outdated`. See below. |
| `table` | `string` | No | `run` and `acknowledge`. Target just this table instead of walking every in-scope one. |
| `maxRecords` | `number` | No | `run` only. Defaults to 200, hard-capped at 2000. |
| `rescan` | `boolean` | No | `run` only. Recount before translating. |
| `actionPerformerURDD` | `number` | Yes | Acting admin's URDD. |

### What each action does

| `action` | Reads | Writes | Calls translation APIs |
|---|---|---|---|
| `status` | the ledger | nothing | no |
| `scan` | every translatable column | the ledger | no |
| `run` | records selected by `mode` | `translated_entries`, the ledger | **yes** |
| `stop` | nothing | nothing | no |
| `acknowledge` | outdated records | `translated_entries.updated_at`, the ledger | no |

`run` is bounded on purpose. An HTTP request is the wrong place for an unbounded job, so
the endpoint caps it; the nightly cron is the unbounded path and stops at 06:00 instead.

### The two run modes

| `mode` | Which records | What it writes |
|---|---|---|
| `missing` (default) | Source rows with no `translated_entries` row for that column and language | `INSERT` |
| `outdated` | Rows that are already translated, but whose English source has been edited since | `UPDATE` in place |

A record is outdated when the source row's `updated_at` is later than the translation's
`updated_at`. Use `missing` for the initial backfill, and `outdated` to keep translations in
step with edits — the nightly cron runs `outdated` (override with `TRANSLATION_CRON_MODE`).

:::caution Staleness is detected per row, not per column
`updated_at` belongs to the whole row, so editing any column flags every translated column of
that row. A false flag costs one translation API call, once, after which the record is stamped
current again — the result is still correct, just paid for.

The practical consequence is the cold start. An environment where a bulk migration touched
`updated_at` on every row can flag tens of thousands of translations that never actually
changed. Run `acknowledge` once to baseline it before enabling the cron.
:::

### `acknowledge`

Stamps every outdated translation as current **without calling any translation API** — it
only moves `translated_entries.updated_at` past the source's. The translated text is left
exactly as it is.

```json
{ "actionPerformerURDD": 1, "action": "acknowledge" }
```

Pass `table` to baseline a single table. The response carries an `acknowledged` block:

```json
{
  "ok": true,
  "action": "acknowledge",
  "acknowledged": {
    "table": null,
    "outcome": "acknowledged",
    "cells": 14,
    "rowsTouched": 19948,
    "tablesSkipped": ["guest_notifications"],
    "envKey": "development:dev-restructure_hms_1.9"
  }
}
```

`tablesSkipped` lists in-scope tables with no `updated_at` column — staleness cannot be
detected for them, so they are neither flagged nor acknowledged.

### Example — run a batch

```json
{
  "actionPerformerURDD": 1,
  "action": "run",
  "maxRecords": 500
}
```

### Example — fill one table

```json
{
  "actionPerformerURDD": 1,
  "action": "run",
  "table": "delivery_units",
  "maxRecords": 500
}
```

Without `table` the runner picks its own order, which is right for the cron and unhelpful
when you want one table filled now.

**Naming a table overrides the scope.** A table the cron would never walk is translated
anyway, because asking for it by name is taken as meaning it. The skip guard still applies —
JSON, URLs and identifiers are never sent to a provider.

**An unknown table is refused** with `outcome: "unknown-table"` rather than matching nothing,
so a typo is visible instead of looking like "already complete". The name must match
`/^[A-Za-z_][A-Za-z0-9_]*$/`; anything else is rejected before it reaches SQL, since table
names cannot be bound as query parameters.

### Example — stop

```json
{ "actionPerformerURDD": 1, "action": "stop" }
```

```json
{
  "ok": true,
  "action": "stop",
  "stop": { "stopped": true, "active": { "table": "delivery_units", "trigger": "dev-console:delivery_units" } }
}
```

The run finishes the record it is on, writes its checkpoint and exits with
`outcome: "stopped"`. Nothing is left half-written and the next run resumes from that point.
`stopped: false` means nothing was running to stop.

A run also refuses to start while another holds the process, returning
`outcome: "already-running"` with the active run's details — the console cannot stack a run
on top of the nightly cron.

:::caution The stop flag is per process
It is in-process state, so `stop` only reaches a run in the **same** Node process. On the
single-process PM2 servers that is always the case. On a multi-instance deployment the
request may land on an instance that is not translating, and it will report `stopped: false`
honestly rather than pretending.
:::

---

## Response

```json
{
  "ok": true,
  "action": "status",
  "environment": "127.0.0.1/dev-restructure_hms_1.9",
  "progress": {
    "envKey": "development:dev-restructure_hms_1.9",
    "scopeMode": "whitelist",
    "scannedAt": "2026-09-30T07:12:04.881Z",
    "lastRunAt": "2026-09-30T06:00:41.002Z",
    "lastRunTrigger": "cron",
    "lastRunMode": "outdated",
    "lastRunOutcome": "deadline",
    "outdatedScannedAt": "2026-09-30T07:12:04.881Z",
    "total": 415008,
    "done": 83636,
    "skipped": 61,
    "pending": 331311,
    "outdated": 19948,
    "percent": 20.2,
    "scoped": { "total": 49818, "done": 41520, "skipped": 61, "pending": 8237, "outdated": 19948, "percent": 83.4 },
    "tables": [
      {
        "table": "delivery_units",
        "inScope": true,
        "total": 8926, "done": 2548, "skipped": 0, "pending": 6378,
        "outdated": 0, "hasUpdatedAt": true,
        "errors": 0, "complete": false,
        "cells": [
          { "key": "delivery_units.unit_name.ar", "column": "unit_name", "language": "ar",
            "total": 8926, "done": 2548, "skipped": 0, "pending": 6378,
            "outdated": 0, "refreshed": 0, "errors": 0, "lastError": null }
        ]
      }
    ]
  },
  "environments": [
    { "envKey": "development:dev-restructure_hms_1.9", "updatedAt": "2026-09-30T07:12:04.881Z",
      "fingerprint": "6b1f9c02d5a74e11", "nodeEnv": "development",
      "database": "dev-restructure_hms_1.9", "readable": true }
  ]
}
```

A `run` response adds a `run` block with `mode`, `outcome`, `inserted`, `refreshed`,
`skipped`, `skippedStructural`, `errors` and `exhaustedApis`. `inserted` counts new
translations (`missing` mode); `refreshed` counts overwritten ones (`outdated` mode).

`hasUpdatedAt: false` on a table means staleness cannot be detected for it — its `outdated`
count is always `0` and `outdated` runs skip it. Nineteen tables are in this position.

### `outcome` values

| Value | Meaning |
|---|---|
| `complete` | nothing left pending in scope |
| `max-records` | hit the batch cap — call again to continue |
| `deadline` | hit the cron's stop hour |
| `stopped` | a `stop` action was received; progress is checkpointed |
| `already-running` | another run holds the process; nothing was done |
| `unknown-table` | the requested `table` has no translatable column |
| `apis-exhausted` | every translation provider refused; progress is checkpointed |
| `failed` | the run threw; `error` carries the message |

---

## Two totals, and why

`total` counts every translatable value in the database. `scoped` counts only the tables the
run will actually touch.

They differ by a lot — on the dev database, 415,008 against 49,818. The larger number
includes `landmarks` (195,420 values, mostly slugs and denormalised search text),
`probation_tracking`, `guest_notifications`, `audit_logs` and `dev_console_audit`. None of
those should be translated, and translating them would burn a third-party quota to no
purpose.

**`scoped` is the number to act on.** `total` is reported so the out-of-scope tables are
visible rather than silently dropped, and so the ratio between them stays obvious.

Scope is controlled by `TRANSLATION_TABLES_MODE`, `whitelist` by default. Setting it to
`all` opts every table in — the `scopeMode` field echoes which is active, and the console
colours the chip when it is not the default.

---

## Skipped is not pending

A value that cannot sensibly be translated is recorded as **skipped**, not left pending:
JSON documents, URLs, pure numbers, and snake-case identifiers. Completion is
`done + skipped`, so a run terminates instead of retrying the same unusable rows nightly.

This matters in practice. `hms_config_possible_values.config_possible_value` is whitelisted
but holds JSON for some rows, and a provider returned `{" fields ":[{" key ":" na…` for one
— spaces inserted inside the JSON quotes, no longer parseable. The guard exists because
that reached the database once.

---

## Where progress lives

An encrypted, per-environment ledger committed to the repo at
`backend/Services/SysScripts/DatabaseScripts/dbHelpers/translationLedger.json`. The envelope
is plaintext so git can merge two environments' entries; each environment's payload is
AES-encrypted with `DB_ENCRYPTION_KEY`. Nothing identifying appears in the readable part.

Environments are keyed `<NODE_ENV>:<DB_DATABASE>`. Two hosts sharing both values share an
entry, and the more recent write wins with a warning; give them distinct `NODE_ENV` values
to keep them apart.

:::warning `DB_ENCRYPTION_KEY` is required
Without it the endpoint returns `configured: false` and refuses every action — the ledger
cannot be read. An entry written under a different key comes back with `readable: false` in
the `environments` list rather than failing the request.
:::

---

## Source Files

| File | Purpose |
|---|---|
| `Src/Apis/ProjectSpecificApis/DevConsoleTranslations/DevConsoleTranslations.js` | API object, permission, audit wiring |
| `Src/HelperFunctions/PreProcessingFunctions/DevConsole/devTranslations.js` | action dispatch, run caps, audit |
| `Services/SysScripts/DatabaseScripts/translationRunner.js` | scan, run, scope, skip guard, deadline |
| `Services/SysScripts/DatabaseScripts/dbHelpers/translationLedger.js` | encrypted per-environment ledger, id ranges |
| `Services/Integrations/CronJobs/translationCron.js` | nightly schedule |
| `frontend/…/DevTeam/DbConsole/TranslationsTab.jsx` | the console tab |

Background and design rationale: `backend/docs/translation-ledger.md`.
