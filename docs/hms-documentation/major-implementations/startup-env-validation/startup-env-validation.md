---
title: "Startup Environment Validation"
sidebar_position: 1
---

# Startup Environment Validation

The HMS backend checks its environment variables **before it boots**. If a required variable is missing, blank or malformed, the server refuses to start and prints one report that names every problem at once. The alternative is a server that starts, looks healthy, and loses a feature silently.

:::note
Backend branch: `backend/feature/env-fail-fast` (forked from `staging`). Code: `Src/Bootstrap/envContract.js` (the contract) and `Src/Bootstrap/validateEnv.js` (the validator). The in-repo design record is `backend/docs/startup-env-validation.md`.
:::

---

## Why it exists

Almost every configuration-driven dependency in the backend used to fail **silently**:

| Missing or wrong | What happened | Visible when |
|---|---|---|
| `EMAIL_USER` / `EMAIL_PASS` | No email channel was registered, so OTP, welcome and config-change mails were all dropped | when a user reported a missing OTP |
| Firebase service account | `getFirebaseApp()` returned `null`, so every push notification vanished | never, by itself |
| `ACCESS_TOKEN_SECONDS` | Token lifetime fell back to 3600s without a warning | never, by itself |
| `TENANCY_CHECK` | Tenant isolation was off, and queries returned other tenants' rows | a data leak |
| `FILE_STORAGE_PROVIDER` typo | Uploads went to local disk instead of S3/GCS | when files disappeared after a redeploy |
| `SECRET_KEY` empty | Every encrypted endpoint answered `E10` / `E14` | the first request |

Validation runs as the second line of `Src/server.js`, straight after `.env` is loaded and **before** `require("./app")`:

```js
require("./Bootstrap/env");
require("./Bootstrap/validateEnv").assertEnv();

const app = require("./app");
```

The order matters. Several modules read `process.env` when they are first loaded (`tokenConfig.js` computes the token lifetime once, at that point). A check placed later would run after those values were already fixed.

---

## Required variables

### Always required (every environment)

These **20 variables** must be present in every `backend/.env`. If any is missing, the server does not start.

| # | Variable | Group | Rule | Example |
|---|---|---|---|---|
| 1 | `SECRET_KEY` | Core runtime | non-blank | a random string |
| 2 | `NODE_ENV` | Core runtime | non-blank | `production` / `staging` / `development` |
| 3 | `SERVER_PORT` | Core runtime | positive integer | `3000` |
| 4 | `TENANCY_CHECK` | Core runtime | non-blank | `1` |
| 5 | `FILE_STORAGE_PROVIDER` | Core runtime | `local`, `s3` or `gcs` | `local` |
| 6 | `DB_TYPE` | Main database | non-blank | `mysql` |
| 7 | `DB_HOST` | Main database | non-blank | `127.0.0.1` |
| 8 | `DB_USER` | Main database | non-blank | `root` |
| 9 | `DB_PW` | Main database | **must be declared, may be empty** | `root` |
| 10 | `DB_DATABASE` | Main database | non-blank | `hms_db_10_0` |
| 11 | `DB_PORT` | Main database | positive integer | `3306` |
| 12 | `SECURITY_DB_HOST` | Security database | non-blank | `127.0.0.1` |
| 13 | `SECURITY_DB_USER` | Security database | non-blank | `root` |
| 14 | `SECURITY_DB_PW` | Security database | **must be declared, may be empty** | *(empty)* |
| 15 | `SECURITY_DB_DATABASE` | Security database | non-blank | `securitydb` |
| 16 | `SECURITY_DB_PORT` | Security database | positive integer | `3306` |
| 17 | `ACCESS_TOKEN_SECONDS` | Token lifetimes | positive integer | `3600` |
| 18 | `GUEST_REFRESH_TOKEN_SECONDS` | Token lifetimes | positive integer; **may be replaced by** `GUEST_REFRESH_TOKEN_DAYS` | `86400` |
| 19 | `EMAIL_USER` | Outbound email | non-blank | `no-reply@example.com` |
| 20 | `EMAIL_PASS` | Outbound email | non-blank | a Google app password |

### Minimum `.env`

Copy this and fill in the values. It is the smallest file that passes validation:

```bash
# Core runtime
SECRET_KEY=
NODE_ENV=development
SERVER_PORT=3000
TENANCY_CHECK=1
FILE_STORAGE_PROVIDER=local

# Main database
DB_TYPE=mysql
DB_HOST=127.0.0.1
DB_USER=root
DB_PW=
DB_DATABASE=
DB_PORT=3306

# Security database
SECURITY_DB_HOST=127.0.0.1
SECURITY_DB_USER=root
SECURITY_DB_PW=
SECURITY_DB_DATABASE=securitydb
SECURITY_DB_PORT=3306

# Token lifetimes
ACCESS_TOKEN_SECONDS=3600
GUEST_REFRESH_TOKEN_SECONDS=86400

# Outbound email
EMAIL_USER=
EMAIL_PASS=

# Optional, but recommended (see the OTP fallback warning below)
OTP_TTL_SECONDS=300
OTP_MAX_ATTEMPTS=5
```

`SECRET_KEY`, `DB_DATABASE`, `EMAIL_USER` and `EMAIL_PASS` are blank in the template and **must** be filled in. `DB_PW` and `SECURITY_DB_PW` may stay blank.

### Required only when an integration is used

When any variable of an integration is set, all of that integration's **required** variables below must also be set. If none are set, the integration is skipped.

| Integration | Required | Required unless an alternative is set | Optional |
|---|---|---|---|
| Firebase / FCM push | — | `FCM_SERVICE_ACCOUNT_JSON` **or** `FCM_SERVICE_ACCOUNT_PATH` (or a `FIREBASE_SERVICE_ACCOUNT_*` equivalent) | — |
| S3 storage | `S3_BUCKET`, `S3_REGION`, `S3_ACCESS_KEY`, `S3_SECRET_ACCESS_KEY` | — | — |
| Google Cloud Storage | `GCS_BUCKET`, `GCS_PROJECT_ID` | `GCS_CREDENTIALS_JSON` (unless `GCS_KEY_FILE` is set) | — |
| Stripe | `STRIPE_SECRET_KEY`, `STRIPE_PUBLISHABLE_KEY`, `STRIPE_WEBHOOK_SECRET` | — | — |
| Moyasar | `MOYASAR_SECRET_KEY`, `MOYASAR_PUBLISHABLE_KEY` | — | — |
| Authorize.net | `AUTHORIZE_NET_LOGIN_ID`, `AUTHORIZE_NET_TRANSACTION_KEY`, `AUTHORIZE_NET_BASE_URL` | — | — |
| Kuickpay | `KUICKPAY_INSTITUTION_ID`, `KUICKPAY_SECURED_KEY`, `KUICKPAY_BASE_URL` | — | — |
| Azure translator | `AZURE_TRANSLATOR_KEY` | — | `AZURE_TRANSLATOR_REGION`, `AZURE_TRANSLATOR_ENDPOINT` |
| Deployment / crash alerts | `OPS_ALERT_EMAILS` | — | `OPS_ALERT_ENABLED`, `OPS_ALERT_THROTTLE_SECONDS`, `OPS_ALERT_SEND_TIMEOUT_MS`, `APP_INSTANCE_NAME`, `DEPLOYMENT_STATE_PATH` |

Setting `FILE_STORAGE_PROVIDER=s3` or `FILE_STORAGE_PROVIDER=gcs` also turns on the matching storage row. `OPS_ALERT_ENABLED=false` skips the alerts row entirely.

### Optional everywhere

`GUEST_REFRESH_TOKEN_DAYS`, `OTP_TTL_SECONDS` and `OTP_MAX_ATTEMPTS` are never required. If set, each must be a positive integer.

---

## How variables are categorised

The contract works on two levels:

- A **group** decides *whether* its variables are checked at all.
- Each **variable** decides *how* it is checked.

### Group types

| Type | Meaning |
|---|---|
| **Always** | Checked in every environment, on every boot. |
| **Conditional** | Checked only once *any* variable of the group is set. An integration with nothing set is valid and boots. One that is only partly set is treated as a mistake and does not boot. |

### Variable rules

| Rule | Meaning |
|---|---|
| **required** | Must be present and non-blank. |
| **required-if** | Required unless an alternative is supplied. |
| **optional** | Never required, but validated when set. |
| **may be empty** | Must be declared in `.env`; a blank value is allowed. |
| **validated** | Format-checked: positive or non-negative integer, JSON, email list, or an allowed value. |

### Always-checked groups

| Group | Variable | Rule |
|---|---|---|
| Core runtime | `SECRET_KEY` | required |
| | `NODE_ENV` | required |
| | `SERVER_PORT` | required · positive integer |
| | `TENANCY_CHECK` | required |
| | `FILE_STORAGE_PROVIDER` | required · `local`, `s3` or `gcs` |
| Main database | `DB_TYPE`, `DB_HOST`, `DB_USER`, `DB_DATABASE` | required |
| | `DB_PW` | may be empty |
| | `DB_PORT` | required · positive integer |
| Security database | `SECURITY_DB_HOST`, `SECURITY_DB_USER`, `SECURITY_DB_DATABASE` | required |
| | `SECURITY_DB_PW` | may be empty |
| | `SECURITY_DB_PORT` | required · positive integer |
| Token lifetimes and OTP | `ACCESS_TOKEN_SECONDS` | required · positive integer |
| | `GUEST_REFRESH_TOKEN_SECONDS` | required unless `GUEST_REFRESH_TOKEN_DAYS` is set · positive integer |
| | `GUEST_REFRESH_TOKEN_DAYS` | optional · positive integer |
| | `OTP_TTL_SECONDS`, `OTP_MAX_ATTEMPTS` | optional · positive integer |
| Outbound email | `EMAIL_USER`, `EMAIL_PASS` | required |

### Conditional groups

| Group | Switched on by | Then requires |
|---|---|---|
| Firebase / FCM push | any `FCM_SERVICE_ACCOUNT_*`, `FIREBASE_SERVICE_ACCOUNT_*` or `FIREBASE_PROJECT_ID` | one credential source; inline JSON must parse |
| S3 storage | `FILE_STORAGE_PROVIDER=s3`, or any `S3_*` key | `S3_BUCKET`, `S3_REGION`, `S3_ACCESS_KEY`, `S3_SECRET_ACCESS_KEY` |
| Google Cloud Storage | `FILE_STORAGE_PROVIDER=gcs`, `GCS_BUCKET` or `GCS_PROJECT_ID` | bucket, project, and valid-JSON `GCS_CREDENTIALS_JSON` unless `GCS_KEY_FILE` is set |
| Stripe | either Stripe key | both keys and `STRIPE_WEBHOOK_SECRET` |
| Moyasar | `MOYASAR_SECRET_KEY` or `MOYASAR_SECRET_API_KEY` | secret and publishable keys |
| Authorize.net | login id or transaction key | login id, transaction key, `AUTHORIZE_NET_BASE_URL` |
| Kuickpay | institution id or secured key | institution id, secured key, `KUICKPAY_BASE_URL` |
| Azure translator | any `AZURE_TRANSLATOR_*` | `AZURE_TRANSLATOR_KEY` only (region and endpoint are optional) |
| Deployment / crash alerts | `OPS_ALERT_EMAILS`, `OPS_ALERT_THROTTLE_SECONDS`, `OPS_ALERT_SEND_TIMEOUT_MS` or `DEPLOYMENT_STATE_PATH`, **unless** `OPS_ALERT_ENABLED=false` | `OPS_ALERT_EMAILS` as a valid email list; the rest are optional |

The deployment / crash alert group describes the settings of the separate alert-email feature (`backend/feature/deployment-alert-emails`). It is declared here so the contract is complete once both branches are merged.

### Ignored keys

Some keys look like configuration, but **no code reads them**. The validator never fails on them. It prints a warning that names the key and the variable actually in use:

| Key | Use instead |
|---|---|
| `TOKEN_LIFETIME_MINUTES` | `ACCESS_TOKEN_SECONDS` |
| `TOKEN_RENEWAL_THRESHOLD_SECONDS` | derived automatically as 20% of `ACCESS_TOKEN_SECONDS` |
| `GUEST_ACCESS_TOKEN_SECONDS` | `ACCESS_TOKEN_SECONDS` (guest tokens use the same lifetime) |

---

## What a failure looks like

```
════════════════════════════════════════════════════════════════════════
  ENVIRONMENT VALIDATION FAILED — 2 problem(s)
════════════════════════════════════════════════════════════════════════

  Token lifetimes & OTP
    [MISSING] ACCESS_TOKEN_SECONDS
        needed  : Access-token lifetime, and the only token-lifetime key any code reads…
        example : ACCESS_TOKEN_SECONDS=3600

  Deployment / crash alert emails
    [INVALID] OPS_ALERT_EMAILS
        problem : not an email address: ops-team
        needed  : Recipients for deployment, restart and crash alerts…

  Fix backend/.env (see sample_env) and restart.
  ENV_VALIDATION_MODE=warn downgrades this to a warning for local debugging.
════════════════════════════════════════════════════════════════════════
```

The process then exits with code `1`.

| Kind | Meaning | Stops the boot |
|---|---|---|
| `MISSING` | required and not defined | yes |
| `EMPTY` | required, defined, but blank | yes |
| `INVALID` | set, but malformed | yes |
| `IGNORED` / `WEAK` / `CONTRACT` | warning only | no |

The report goes straight to `stderr`, so `LOG_MESSAGES=false` cannot hide it.

:::caution
`ENV_VALIDATION_MODE=warn` turns fatal problems into warnings so a local machine can start. Never set it on a deployed environment.
:::

---

## Decisions taken

| # | Decision | Outcome |
|---|---|---|
| 1 | Add `ACCESS_TOKEN_SECONDS` and `GUEST_REFRESH_TOKEN_SECONDS` to `.env` | **Added.** |
| 2 | Which token lifetimes to use | **Keep the values already in effect:** `ACCESS_TOKEN_SECONDS=3600`, `GUEST_REFRESH_TOKEN_SECONDS=86400`. Session length does not change. |
| 3 | Remove the three ignored token keys from `.env` | **Removed.** They stay on the ignored list, so the warning returns if a key is added back. |
| 4 | `SECRET_KEY` is 7 characters | **Keep its current length.** No length warning is printed. A missing or blank key still stops the boot. |
| 5 | Add the alert-email settings to this contract | **Yes**, as the conditional *Deployment / crash alerts* group. |

`OTP_TTL_SECONDS` and `OTP_MAX_ATTEMPTS` were also changed from required to **optional**.

:::warning OTP fallbacks disagree
When `OTP_TTL_SECONDS` is unset, `sendGuestOtp.js` and `otpVerif.js` fall back to **60 seconds**, but `OTPGeneration.js` and the OTP email text fall back to **300 seconds**. A guest can then receive an email saying the code is valid for five minutes while it expires after one. Set `OTP_TTL_SECONDS` explicitly in every environment until the fallbacks are unified.
:::

---

## Deployment checklist

Before this branch reaches an environment, that environment's `.env` needs:

```
ACCESS_TOKEN_SECONDS=3600
GUEST_REFRESH_TOKEN_SECONDS=86400
```

It also needs every variable in [Required variables](#required-variables), plus the full set for each integration it uses. Recommended: `OTP_TTL_SECONDS=300`, because of the fallback mismatch above.

To check an environment without starting the server, run this from `backend/`:

```bash
node -e 'require("./Src/Bootstrap/env"); const r = require("./Src/Bootstrap/validateEnv").collectProblems(); console.log(r.problems, r.advisories)'
```

---

## Adding a variable

1. Add an entry to `VARIABLES` in `Src/Bootstrap/envContract.js`:

```js
{
  name: "NEW_THING_KEY",
  group: "payments-stripe",
  why: "One line on what breaks without it — printed to the operator.",
  example: "sk_live_…",
  check: positiveInt("seconds"),          // fatal when it fails
  optional: true,                         // documented, never required
  presence: "declared",                   // may be empty, must be declared
  requiredWhen: (env) => !env.ALTERNATE,  // conditional within an enabled group
}
```

2. For a new integration, also add a `GROUPS` entry with an `enabledWhen` check that lists the integration's variables.
3. Mirror the variable into `backend/sample_env`.
4. Add a test case to `Services/SysScripts/TestScripts/envValidation.test.js`. It currently has 27 cases, all passing.
