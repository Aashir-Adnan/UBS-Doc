---
title: "Database Backups"
sidebar_position: 1
---

# Database Backups

The HMS backend backs up its databases (main and security by default) on a schedule. Each backup is dumped with the native client tool, compressed, **encrypted**, and uploaded through the existing file-storage providers. Old backups are pruned, and every run emails a report.

:::note
Backend branch: `backend/feature/db-backups` (forked from `staging`). Code: `Services/Integrations/DatabaseBackup/`, the cron in `Services/Integrations/CronJobs/databaseBackupCron.js` (wired in `Src/Bootstrap/cron.js`), scripts in `Services/SysScripts/ServerScripts/DatabaseBackup/`. Tests: `Services/SysScripts/TestScripts/databaseBackup.test.js`. The in-repo design record is `backend/docs/database-backups.md`.
:::

---

## Why it exists

There was no backup mechanism in the codebase. Protecting the main and security databases depended entirely on the hosting, which differed per environment and wasn't visible from the application:

- nothing was configured per environment;
- nothing reported a failure;
- nothing covered a database added later.

---

## Decisions

| # | Decision | Outcome |
|---|---|---|
| 1 | **Where backups are stored** | A **dedicated bucket** on production and preproduction; local disk only on development. The live environments reach Google Cloud Storage **through the S3 interface** (`FILE_STORAGE_PROVIDER=s3`, `S3_ENDPOINT` pointing at Google, `S3_REGION=auto`, HMAC keys). Backups use the same `s3` provider and keys, with `DB_BACKUP_S3_BUCKET` pointing at a separate bucket. |
| 2 | **Scheduling** | **Dev and production VMs** (single PM2 process): the in-process cron (`DB_BACKUP_CRON_ENABLED=true`). **Preproduction (Cloud Run):** a Cloud Run Job running the backup script, triggered by Cloud Scheduler. |
| 3 | **Encryption key** | **Always required.** A run without a valid `DB_BACKUP_ENCRYPTION_KEY` fails and is reported. So the key is never lost, every report with at least one successful backup emails the key, in the body only. Every report carries a key fingerprint (the first 16 hex characters of SHA-256). |
| 4 | **MySQL client in Docker** | Debian's `default-mysql-client` (the MariaDB client). The code detects it and leaves out MySQL-only flags. |
| 5 | **Dedicated backup login** | Optional per database: `DB_BACKUP_USER` / `DB_BACKUP_PW`, `SECURITY_DB_BACKUP_USER` / `SECURITY_DB_BACKUP_PW`. When set, the app's password is never used with it. |
| 6 | **`@google-cloud/storage`** | Installed at `^7.22.0` (version 8 needs Node 22; the runtime is Node 20). Only used by `FILE_STORAGE_PROVIDER=gcs`. |
| 7 | **Uploads over 5 GB** | No change for now. The main dump is about 21 MB compressed. Switch to multipart (`@aws-sdk/lib-storage`) if a database gets near the limit. |
| 8 | **Env validation** | `DB_BACKUP_*` is a conditional `database-backups` group in `envContract.js`. See [Startup Environment Validation](../startup-env-validation/startup-env-validation.md). |
| 9 | **Restores** | Stay **manual**. See [Restoring a backup](#restoring-a-backup). |

:::warning About emailing the key
Anyone who can read both the ops mailbox and the backup bucket can read the backups. Keep the bucket's access narrow, and set `DB_BACKUP_NOTIFY_EMAILS` to a small group rather than a wide alias.
:::

---

## How a run works

One run backs up every configured database, one after another.

```text
resolve targets (DB_BACKUP_TARGETS)
  └─ run lock ── held by another instance ──► skip the run
       │
       ▼  for each database, one at a time
     mysqldump / pg_dump ─► gzip ─► AES-256-GCM ─► temp file (0600)
       │
       ▼
     putFile to the storage provider
       ├─ uploaded ──► prune this database's old backups
       └─ failed ────► record the failure, prune nothing
       │
       ▼  after the last database
     email one report
```

*Derived from `Services/Integrations/DatabaseBackup/runDatabaseBackups.js`.*

1. **Resolve the targets.** `DB_BACKUP_TARGETS` lists env prefixes (default `DB_,SECURITY_DB_`). Each prefix reads the same variables the app already uses: `PREFIX + HOST`, `PORT`, `USER`, `PW`, `DATABASE`, and optionally `TYPE`.
   - **Adding a database is one env change**, e.g. `DB_BACKUP_TARGETS=DB_,SECURITY_DB_,REPORTING_DB_`.
   - Two prefixes that point at the same database are backed up once; the second is reported as a duplicate.
2. **Take a run lock.** MySQL uses `GET_LOCK('hms_db_backup:<database>', 0)` and Postgres uses `pg_try_advisory_lock`. If another instance holds the lock, the run is skipped, so running the cron and a scheduler together, or several instances, is safe.
3. **Dump each database** with the native tool, streamed through gzip and encryption into a temp file. Nothing is held in memory.
   - **MySQL:** `mysqldump --single-transaction --quick --routines --triggers --hex-blob --no-tablespaces`, plus `--set-gtid-purged=OFF --column-statistics=0` on the MySQL client only.
   - **Postgres:** `pg_dump --no-owner --no-privileges`.
4. **Upload** to `DB_BACKUP_PATH_PREFIX/target/host-database/target-database-UTCtimestamp.sql.gz.enc`.
5. **Prune** that database's backups, and only after its upload succeeded: files older than `DB_BACKUP_RETENTION_DAYS` are deleted, but the newest `DB_BACKUP_KEEP_MIN` are always kept. Only files matching the backup naming pattern are considered. A failing backup never deletes anything.
6. **Report** by email to `DB_BACKUP_NOTIFY_EMAILS` (falls back to `OPS_ALERT_EMAILS`):
   - a **failure** report when any database failed or the configuration is invalid;
   - a **success** report otherwise, unless `DB_BACKUP_NOTIFY_ON_SUCCESS=false`.

One database failing doesn't stop the others, and the temp folder is removed in every case.

### Triggers

| Trigger | How | Use when |
|---|---|---|
| Command line | `npm run db:backup`. Exits `0` on success or when skipped by the lock, `1` on any failure. | System cron, CI, or a Cloud Run Job with Cloud Scheduler |
| In-process cron | `DB_BACKUP_CRON_ENABLED=true`, `DB_BACKUP_CRON_SCHEDULE` (default `0 2 * * *`), `DB_BACKUP_CRON_TIMEZONE` | A single long-lived server process (the PM2 VMs) |

### Password handling

- **MySQL:** the password goes into a temporary `[client]` option file (mode `0600`) passed as `--defaults-extra-file`, deleted right after the dump. It is never a command-line argument (visible in `ps`) and never in the deprecated `MYSQL_PWD`.
- **Postgres:** `PGPASSWORD` is set only in the child process's environment, and `--no-password` stops `pg_dump` from waiting for a prompt.

---

## Encryption

### File format

`HMSDBK01` (8 bytes) · IV (12 bytes) · ciphertext · GCM authentication tag (16 bytes).

Decryption checks the tag. A truncated or modified file, or the wrong key, fails instead of producing a corrupt SQL file.

### Why not the system's `aes.js`

The shared cipher in `Services/SysFunctions/Encryption/aes.js` is CryptoJS **AES-ECB / PKCS7** over a `JSON.stringify`'d value, returned as base64. That suits its jobs: request/response transport, and the `api_logs` columns, where ECB's determinism is what makes equality search on an encrypted column work. It's the wrong tool for backup files:

| Problem | `aes.js` | Backup encryption |
|---|---|---|
| **Streaming** | The whole input must be one in-memory string, plus the CryptoJS and base64 copies | Streams dump → gzip → cipher → file with flat memory |
| **Pattern leakage** | ECB has no IV; identical blocks give identical ciphertext | Random IV per file |
| **Tamper / corruption detection** | None; a bad file gives garbage or a `JSON.parse` error | GCM tag fails loudly |
| **Key strength** | `adjustKeyLength` pads with `'0'` or truncates, so a 7-character key becomes 7 characters plus 25 zeros | 32 real bytes, validated |

**The existing keys can't be shared either:**

- `SECRET_KEY` is the transport key the **frontend also holds**, so it ships in the client build. Anyone with the bundle could decrypt the backups.
- `DB_ENCRYPTION_KEY` already protects `api_logs`. Sharing it would tie the two rotations together: rotating it would make the retained backups unreadable.
- Success reports **email** the backup key. That's only acceptable because the key protects nothing else.

---

## Storage providers

The feature reuses the existing file-storage providers in `Services/Integrations/FileHandling/providers/`. Attachment code paths are unchanged, and `getStorageProvider()` still returns the same singleton.

Backups can use a different provider (`DB_BACKUP_STORAGE_PROVIDER`), bucket (`DB_BACKUP_S3_BUCKET` / `DB_BACKUP_GCS_BUCKET`) or local folder (`DB_BACKUP_LOCAL_DIR`) than attachments, so their access rules can be stricter.

| Change | Why it's needed | If reverted |
|---|---|---|
| `createStorageProvider(name, options)` factory | The backup run needs its own instance. The singleton is tied to `FILE_STORAGE_PROVIDER` and the attachment bucket. | Every backup run fails (`createStorageProvider` is undefined). |
| `options.bucket` / `options.baseDir` in each constructor | Carries the backup bucket or folder settings. | Settings silently ignored; full dumps land in the **attachment bucket**. |
| `putFile(key, sourcePath, mimetype)` | Streams a file from disk to a full key. `upload()` takes a Buffer and hardcodes `uploads/` + filename. | Every database is reported failed. |
| `listObjects(prefix)` | Retention must enumerate existing backups; S3 follows `ContinuationToken` past 1000 objects. | Backups succeed, but old ones are **never deleted**. |
| S3 `fileClient` with `WHEN_REQUIRED` checksums | Needed for streamed uploads through `S3_ENDPOINT`. See below. | Backups fail on **preprod and prod only**. Dev on `local` still passes. |
| Base-class `putFile` / `listObjects` stubs | Documents the interface and gives a clear error. | Almost no effect. |

### S3-compatible storage (Google Cloud Storage)

With `S3_ENDPOINT` pointing at Google's S3-compatible XML API and HMAC keys, the `s3` provider talks to a GCS bucket using path-style requests. The live environments are configured this way, so **backups there use the `s3` provider, not `gcs`**.

AWS SDK v3.729+ (installed: 3.1002) adds checksums to every upload by default. For a **streamed** body it sends `content-encoding: aws-chunked` with a trailing CRC32 checksum, which GCS doesn't support. Attachments were unaffected because they upload a Buffer. The backup upload streams from disk, so it would have been rejected.

**Fix:** when `S3_ENDPOINT` is set, `putFile` and `listObjects` use a second client with `requestChecksumCalculation` and `responseChecksumValidation` set to `WHEN_REQUIRED`. The upload becomes a plain `PUT` (`UNSIGNED-PAYLOAD`, `Content-Length`, raw body). The attachment client (`upload`, `getServeUrl`, `delete`) is untouched, and real AWS (no endpoint) keeps its default integrity checks.

Folder names include the target, host and database, so two environments sharing a bucket and prefix don't prune each other's backups as long as their hosts or database names differ. If they don't, give each environment its own `DB_BACKUP_PATH_PREFIX`.

---

## Configuration

```bash
DB_BACKUP_TARGETS=DB_,SECURITY_DB_             # env prefixes of the databases to back up
DB_BACKUP_STORAGE_PROVIDER=local               # local | s3 | gcs; default FILE_STORAGE_PROVIDER
DB_BACKUP_LOCAL_DIR=/var/backups/hms           # local only; default LOCAL_FILE_BASE, else the backend root
DB_BACKUP_S3_BUCKET=                           # default S3_BUCKET
DB_BACKUP_GCS_BUCKET=                          # default GCS_BUCKET
DB_BACKUP_PATH_PREFIX=DatabaseBackups
DB_BACKUP_RETENTION_DAYS=14                    # 0 keeps everything
DB_BACKUP_KEEP_MIN=3                           # never delete the newest N per database
DB_BACKUP_ENCRYPTION_KEY=                      # REQUIRED; 32 bytes, base64 or hex
DB_BACKUP_USER=hms_backup                      # optional backup-only login for DB_
DB_BACKUP_PW=
SECURITY_DB_BACKUP_USER=hms_backup             # optional backup-only login for SECURITY_DB_
SECURITY_DB_BACKUP_PW=
DB_BACKUP_CRON_ENABLED=false
DB_BACKUP_CRON_SCHEDULE=0 2 * * *
DB_BACKUP_CRON_TIMEZONE=Asia/Karachi
DB_BACKUP_TIMEOUT_MINUTES=60                   # the dump is killed after this
DB_BACKUP_MYSQLDUMP_PATH=mysqldump
DB_BACKUP_MYSQLDUMP_EXTRA_ARGS=--events
DB_BACKUP_PG_DUMP_PATH=pg_dump
DB_BACKUP_PG_DUMP_EXTRA_ARGS=
DB_BACKUP_NOTIFY_EMAILS=                       # default OPS_ALERT_EMAILS
DB_BACKUP_NOTIFY_ON_SUCCESS=true               # success reports carry the key
```

Generate a key with `openssl rand -base64 32`. `DatabaseBackups/` is in `.gitignore`, and local backup files are never served over HTTP: the only file-serving routes resolve paths from `attachments` rows.

---

## Environment setup

### Development (VM, PM2)

```bash
DB_BACKUP_ENCRYPTION_KEY=<openssl rand -base64 32>
DB_BACKUP_STORAGE_PROVIDER=local
DB_BACKUP_LOCAL_DIR=/var/backups/hms
DB_BACKUP_CRON_ENABLED=true
DB_BACKUP_CRON_TIMEZONE=Asia/Karachi
DB_BACKUP_NOTIFY_EMAILS=<small ops group>
```

### Production (Azure VM, PM2)

Storage follows the existing S3-interface settings (`FILE_STORAGE_PROVIDER=s3`, `S3_ENDPOINT`, `S3_REGION=auto`, `S3_ACCESS_KEY`, `S3_SECRET_ACCESS_KEY`). Only the bucket changes:

```bash
DB_BACKUP_ENCRYPTION_KEY=<its own key>
DB_BACKUP_S3_BUCKET=<dedicated backup bucket in the same Google project>
DB_BACKUP_CRON_ENABLED=true
DB_BACKUP_CRON_TIMEZONE=Asia/Karachi
DB_BACKUP_USER=hms_backup
DB_BACKUP_PW=<password>
SECURITY_DB_BACKUP_USER=hms_backup
SECURITY_DB_BACKUP_PW=<password>
DB_BACKUP_NOTIFY_EMAILS=<small ops group>
```

- The VM needs `mysqldump` (`sudo apt-get install default-mysql-client`).
- The backup bucket should block public access. The service account behind the HMAC key needs `roles/storage.objectAdmin` **on that bucket only**.
- If `DB_BACKUP_S3_BUCKET` is unset, backups go to the attachment bucket (`S3_BUCKET`).

### Preproduction (Cloud Run)

The in-process cron stays **off**. One-time setup, with the service's env vars and secrets copied to the job:

```bash
gcloud run jobs create hms-preprod-db-backup \
  --image=<current preprod image> --region=<GCP_REGION> --project=<GCP_PROJECT_ID> \
  --command=node --args=Services/SysScripts/ServerScripts/DatabaseBackup/backupDatabases.js \
  --tasks=1 --max-retries=1 --task-timeout=75m \
  --set-env-vars=FILE_STORAGE_PROVIDER=s3,S3_ENDPOINT=<same as the service>,S3_REGION=auto,DB_BACKUP_S3_BUCKET=<bucket>,... \
  --set-secrets=DB_BACKUP_ENCRYPTION_KEY=<secret>:latest,S3_ACCESS_KEY=<secret>:latest,S3_SECRET_ACCESS_KEY=<secret>:latest,DB_PW=<secret>:latest,...

gcloud scheduler jobs create http hms-preprod-db-backup-nightly \
  --location=<GCP_REGION> --schedule="0 2 * * *" --time-zone="Asia/Karachi" \
  --http-method=POST \
  --uri="https://run.googleapis.com/v2/projects/<GCP_PROJECT_ID>/locations/<GCP_REGION>/jobs/hms-preprod-db-backup:run" \
  --oauth-service-account-email=<scheduler service account>
```

Then set the repository variable **`PREPROD_DB_BACKUP_JOB=hms-preprod-db-backup`** on the `preproduction` environment. From then on, the *Update database backup job* step in `staging-gcp-deploy-backend.yml` points the job at every newly deployed image, keeping its env vars and secrets. The step is skipped while the variable is unset. The deploy service account needs `roles/run.developer`.

### Dedicated backup login (MySQL)

```sql
CREATE USER 'hms_backup'@'%' IDENTIFIED BY '<password>';
GRANT SELECT, SHOW VIEW, TRIGGER, EVENT, LOCK TABLES ON `<main database>`.* TO 'hms_backup'@'%';
GRANT SELECT, SHOW VIEW, TRIGGER, EVENT, LOCK TABLES ON `<security database>`.* TO 'hms_backup'@'%';
GRANT SHOW_ROUTINE ON *.* TO 'hms_backup'@'%';
```

`SHOW_ROUTINE` exists from MySQL 8.0.20; on older servers grant `SELECT ON mysql.proc` instead. Restrict the host part (`'%'`) to the servers that run backups.

---

## Restoring a backup

```bash
# 1. Download the file from the bucket (or copy it from DB_BACKUP_LOCAL_DIR)
# 2. Decrypt it with the key from the report that listed this backup
DB_BACKUP_ENCRYPTION_KEY=<key> \
npm run db:backup:decrypt -- DatabaseBackups/main/127.0.0.1-hms/main-hms-20260917T020000Z.sql.gz.enc main.sql.gz
# 3. Load it into a NEW or scratch database first and check it
mysql -h HOST -P PORT -u USER -p -e 'CREATE DATABASE hms_restore_check'
gunzip -c main.sql.gz | mysql -h HOST -P PORT -u USER -p hms_restore_check
#    Postgres: gunzip -c main.sql.gz | psql -h HOST -p PORT -U USER -d restore_db
```

Only once the scratch copy checks out should the live database be replaced, and only with the server stopped.

### The decrypt script

`npm run db:backup:decrypt -- INPUT [OUTPUT]`

| Case | Behaviour |
|---|---|
| `INPUT` is the path to one backup file | Required. Local backups live under `DB_BACKUP_LOCAL_DIR/DB_BACKUP_PATH_PREFIX/target/host-database/`. A folder or a database label is not accepted. |
| `INPUT` doesn't exist or isn't a file | Prints `Backup file not found: INPUT` and exits `2`. |
| `OUTPUT` omitted, `INPUT` ends in `.enc` | The suffix is removed: `x.sql.gz.enc` → `x.sql.gz`. |
| `OUTPUT` omitted, any other `INPUT` | `.sql.gz` is appended: `x` → `x.sql.gz`. |
| `OUTPUT` equals `INPUT` | Refused with `Output path must differ from the input path`. A default can never cause this. |
| `DB_BACKUP_ENCRYPTION_KEY` missing | Exits `2`. |
| Wrong key or damaged file | GCM check fails; `Decryption failed: …`, exit `1`. |

The output is still gzip-compressed: `gunzip -c` it, or pipe it straight into the client as above.

---

## Tests

`node --test Services/SysScripts/TestScripts/databaseBackup.test.js` runs 54 cases, none touching a real database or bucket:

- **Configuration:** required key, defaults, provider fallback, dedicated buckets, number and recipient validation, path-prefix cleaning.
- **Encryption key:** hex and base64 accepted; wrong length or encoding rejected.
- **Targets:** naming, the default pair, the dedicated backup login, other engines, duplicates, invalid settings.
- **Retention:** timestamp round trip, the age window, the newest-N floor, retention 0, foreign files left alone.
- **Encryption:** round trip (including empty input), tampered file, wrong key, non-backup file.
- **Dump commands:** password kept out of arguments, MariaDB flag handling, option-file escaping, `pg_dump` arguments, timeout kill.
- **Storage:** local put/list/delete; against a local fake S3 endpoint, a backup upload without `aws-chunked` or trailers, the attachment upload unchanged, and `ListObjectsV2` pagination.
- **Full runs** with a fake `mysqldump`: both databases backed up and readable, no temp files left, pruning, one failure not stopping the other, nothing pruned after a failure, report emails (key only in a success body, HTML escaped).

**End-to-end** against local MySQL 8.0.40: both backups succeeded (main 21.2 MB, security 151.8 KB, mode `0600`), and the decrypted main dump was complete (129 `CREATE TABLE` statements, the stored procedures, and the "Dump completed" footer).

**Not yet verified:** uploads to a real GCS bucket through `S3_ENDPOINT` (only the request shape was checked), the Cloud Run Job step, the Cloud Scheduler setup, and a report email reaching a real inbox.

---

## Not included

- **Restore automation.** Deliberate (decision 9).
- **Point-in-time recovery.** Backups are full daily snapshots, so writes between two runs are lost if the database fails. Binlog or WAL archiving would be a separate feature.
- **Restore verification.** A run confirms the dump tool exited cleanly and the file uploaded; it doesn't load the file into a database. Rehearse restores manually.
