---
title: "7 · Bulk Import — Frontend Integration"
sidebar_position: 7
---

# 7 · Bulk Import — Frontend Integration

The companion to [chapter 6](./06-bulk-import.md). Chapter 6 is the full wire
contract; this chapter is how the Admin dashboard's **"Import a hotel"** screen
calls it — the envelope in JS terms, the identity field, the two modes from the
UI's point of view, and how to render the report.

`POST /api/custom/tenant/import`

---

## The shape of the interaction

The operator picks an `.xlsx` file. You base64-encode its bytes, wrap the request
in the standard two-layer AES envelope, and POST it. The response `data` is an
encrypted **report** — a structured object describing what was parsed, what was
defaulted, what went wrong, and (on a real run) what was created.

Two calls make up the flow:

1. a **dry run** (`dryRun: true`) that validates and returns the report, writing
   nothing — always `HTTP 200`;
2. a **commit** (`dryRun: false`), gated on the dry-run report being free of
   `blocking` problems.

Build the screen around that: upload → preview the report → fix the sheet or
commit.

---

## `actionPerformerURDD` — always required

Every write in this framework carries the acting user's URDD explicitly in the
payload; it is never inferred from the token alone. This endpoint is no
exception. **`actionPerformerURDD` is a required field on every call**, dry run
included.

For this screen it is the operator's own **system-tenant URDD** — the same value
you already send on other system-scoped admin calls. It must resolve to the
system tenant:

| The URDD you send | Result |
|---|---|
| a system-tenant URDD | accepted |
| a URDD that does not exist / is not active | `403` · `scc: E31` |
| a URDD whose `tenant_id` is `NULL` (the global URDD) | `403` · `scc: E31` |
| a URDD in some other tenant | `403` · `scc: E31` |

The endpoint is a **system-admin tool**. To add data into a specific hotel, the
operator still authenticates as themselves (system URDD) and names the target
hotel with `targetTenantId` — see [Two modes](#two-modes).

The token must also carry the `add_tenants` permission (the same permission
`TenantProvisioningGroupedCrud` requires) or the request is `403` · `scc: E41`.

---

## The request envelope

Identical to every other `AUTH_PLATFORM` call — two nested AES-ECB layers. The one
wrinkle: a base64 workbook is far too big for an HTTP header, so send the outer
envelope in the **JSON body** as `encryptedRequest`.

```
inner  reqData          = AES(payload, accessToken + PLATFORM_ENCRYPTION_KEY)
outer  encryptedRequest = AES({ reqData, encryptionDetails }, SECRET_KEY)
```

```ts
const payload = {
  actionPerformerURDD: OPERATOR_SYSTEM_URDD, // required, always
  workbookBase64: btoaOfXlsxBytes,           // base64 of the raw .xlsx
  dryRun: true,
  // targetTenantId: 88,                     // optional — see Two modes
};

const reqData = aesEncrypt(payload, accessToken + PLATFORM_ENCRYPTION_KEY);
const encryptedRequest = aesEncrypt(
  { reqData, encryptionDetails: { PlatformName, PlatformVersion, accessToken } },
  SECRET_KEY,
);

const res = await fetch("/api/custom/tenant/import", {
  method: "POST",
  headers: { ...deviceHeaders, accesstoken: accessToken, "Content-Type": "application/json" },
  body: JSON.stringify({ encryptedRequest }),
});

const body = await res.json();
const report = aesDecrypt(body.data, accessToken + PLATFORM_ENCRYPTION_KEY);
```

AES-ECB, PKCS7, 256-bit. Keys are the UTF-8 bytes of the concatenated string,
right-padded with `0` or truncated to 32 chars. **Reuse the app's shared crypto
helper** — do not hand-roll a second implementation for this one screen.

`express.json` allows a `25mb` body; a decoded workbook over 15&nbsp;MB is
rejected with a blocking `WORKBOOK_TOO_LARGE` problem, so check the file size
before sending.

On an error the pipeline returns `success: false`; for the blocking-gate case the
report rides in `body.error.details` rather than `body.data` — read both.

---

## Two modes

| Field | Type | Meaning |
|---|---|---|
| `actionPerformerURDD` | number | **Required.** The operator's system-tenant URDD. |
| `workbookBase64` | string | **Required.** Base64 of the raw `.xlsx` bytes. |
| `dryRun` | boolean | Default `false`. `true` = validate + default + report, write nothing. |
| `targetTenantId` | number | Optional. Add the data **into this existing tenant**. |

### Onboard a new hotel — `targetTenantId` omitted

The importer derives a `tenant_code` from `hotel_name` and looks for a match:

- **match** → reuse that tenant, `report.mode: "reused"`;
- **no match** → **provision** a new tenant — row, URDD-B′, a Tenant Admin user,
  a full resource clone, and a welcome email — `report.mode: "created"`.

The tenant's own columns (name, timezone, address, currency, logo) are written
from the `Hotel Info` sheet.

### Add to an existing hotel — `targetTenantId: 88`

Adds the workbook's locations, units, services, packages and translations into
tenant `88`. It **never provisions**, and the tenant's own columns are **left
untouched** — `Hotel Info` is used only as defaults context. `report.mode:
"targeted"`.

`404` · `scc: E50` if `88` is not an active tenant.

### Idempotent either way

Re-POST the same workbook and any record that already exists — tenant by code,
service / package / location by name, unit by identifier — comes back with
`action: "exists"` and is not touched. A re-run to *change* a record does nothing
(full update-in-place is a later version). Make "import again" a first-class
action.

---

## Rendering the report

The decrypted `data` (or `error.details` on the gate) is one object. See
[chapter 6 → The report](./06-bulk-import.md#the-report) for the full field
reference; the fields the UI leans on:

| Key | Use it for |
|---|---|
| `dryRun` / `committed` | which phase this response is; `committed: true` = data written |
| `mode` | `"created"` \| `"reused"` \| `"targeted"` — drives the confirmation copy |
| `tenant` | `{ id, code, urddBPrime }` on commit, `null` on a dry run — link the operator here afterwards |
| `counts` vs `parsed` | what was written vs what the parser saw — a gap means rows were dropped |
| `problems[]` | the main thing to render — each is `{ severity, code, sheet, row, column, message, hint? }` |
| `defaultsApplied[]` | every gap filled — `{ sheet, row, field, value, reason }` — show as an expandable "N fields defaulted" |
| `skipped[]` | rows deliberately not imported (media, unresolved translation targets) |
| `perEntity` | per-record outcome; `action` is `created` \| `exists` \| `targeted` |
| `partial` / `blockingAfterCommit` | present only when rows failed **during** the commit — the tenant is incomplete, surface it and offer "Re-run to finish" |

:::warning Problems are collapsed
When more than 20 problems share a `code`, the report keeps the first 20 and
appends one `"… and N more rows"` line. Do not treat `problems.length` as the
true count — a messy workbook can carry hundreds of `SERVICE_NOT_FOUND` rows.
:::

The full problem-code catalog — structural, cross-sheet, and commit-phase — is in
[chapter 6 → Problem codes](./06-bulk-import.md#problem-codes). `blocking` means a
real run is refused; `warning` means it proceeds and the operator should still
look.

---

## Errors

Branch on `meta.scc` / `error.code`, never the message text — messages are
localized and editable from the database.

| HTTP | `scc` | Cause / where the report is |
|---|---|---|
| `401` | `unauthenticated` | bad or missing token — no report |
| `403` | `E41` | missing `add_tenants` — no report |
| `403` | `E31` | `actionPerformerURDD` is not a system-tenant URDD — no report |
| `404` | `E50` | `targetTenantId` is not an active tenant — message names the id |
| `400` | `E22` | real run refused: the report has blocking problems. **Full report in `body.error.details`** — render it exactly like a dry-run report |
| `500` | `E22` | `COMMIT_FAILED` — partial report in `body.error.details` |

---

## The screen

1. **Upload.** One file input, `.xlsx` only. Read as an ArrayBuffer, base64-encode.
   Show the filename and size; block anything over ~15&nbsp;MB before sending.
2. **Dry run on upload.** POST with `dryRun: true`. Never write on the first
   interaction — the operator has not seen the data yet.
3. **Render the report.** A header line from `counts` and `mode` — *"3 services, 5
   units, 1 package; will create a new tenant"* vs *"… will add to `LE_MERIDIEN`"*.
   Then blocking problems first (grouped by sheet, each linking to
   `sheet`/`row`), then warnings, then collapsed "N fields defaulted" and "N rows
   skipped".
4. **Gate the commit button.** Enabled only when there are zero blocking problems.
   Otherwise the primary action is "Fix the workbook and re-upload".
5. **Commit.** Same payload, `dryRun: false` (plus `targetTenantId` if the
   operator chose an existing hotel). This can take tens of seconds for a large
   workbook — show progress, disable the button, prevent double-submit.
6. **Confirm.** On `committed: true`: the `counts`, a link to `tenant.id`, and the
   `perEntity` breakdown. If `partial` is set, say so and offer "Re-run to finish"
   — a re-run skips what already landed.

---

## Local testing

`Services/SysScripts/TestScripts/sim/importWorkbookCli.js` runs a real import
against a running dev server — it forges a system-tenant token and builds the
envelope for you:

```bash
node Services/SysScripts/TestScripts/sim/importWorkbookCli.js <workbook.xlsx>            # dry run
node Services/SysScripts/TestScripts/sim/importWorkbookCli.js <workbook.xlsx> --commit   # create / match a tenant
node Services/SysScripts/TestScripts/sim/importWorkbookCli.js <workbook.xlsx> --commit --tenant 88
```
