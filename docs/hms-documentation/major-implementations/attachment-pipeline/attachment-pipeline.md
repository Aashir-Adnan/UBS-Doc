---
title: "Attachment Upload & Serve"
sidebar_position: 1
---

# Attachment Upload & Serve

Every file in HMS — a room photo, a hotel logo, a guest's passport scan — is an **attachment**: one row in `attachments` holding the stored filename, its MIME type, its size, and the storage key where the bytes live.

Two endpoints move those bytes, and both run inside the standard middleware pipeline with platform encryption:

| Endpoint | Method | Purpose |
|---|---|---|
| `/api/upload/file` | POST | store bytes against an attachment id |
| `/api/upload/serve` | GET | stream those bytes back |

Everything about who may do what is decided from the database, per attachment — never from a URL that happens to be hard to guess.

```
UPLOAD                                    SERVE
  1. mint an id      GET  /get/file/url/local     <img src="/api/upload/serve?encryptedRequest=…">
  2. send the bytes  POST /api/upload/file                │
        │                                                  ├─ decrypt the envelope
        ├─ decrypt the envelope                            ├─ resolve visibility (public / owner / staff)
        ├─ authorize: is the slot empty, and yours?        └─ stream the file
        ├─ store via the configured provider
        └─ finish the row
```

---

## Encryption

**Every endpoint here is platform-encrypted in both directions.** Requests carry the usual two-layer envelope; responses come back encrypted. There is no file endpoint that answers in plaintext, and no client-side special case.

```
outer   = AES(SECRET_KEY)   over { reqData, encryptionDetails: { PlatformName, PlatformVersion } }
reqData = AES(platform key) over the request payload
```

No access token is required. Catalog imagery has to load for a signed-out visitor, so requiring a JWT would break public browsing; the protection is per-attachment authorization instead.

:::info Why serve accepts the envelope in the query string
The envelope normally travels in the `encryptedrequest` **header**. A browser cannot set a header on an `<img src>`, so an attachment URL meant for direct rendering would be unusable.

For that one case the envelope is built **server-side** and carried as `?encryptedRequest=…`. It is decrypted and validated identically — a transport, not a bypass. Because AES-ECB is deterministic, the same attachment and actor always produce the same URL, so browser and CDN caching still work.
:::

---

## Uploading

### Step 1 — mint an attachment id

```
GET /get/file/url/local?step=1
```

Creates an empty `attachments` row and returns its id. The decrypted response contains `attachmentId`; use only that field.

### Step 2 — send the bytes

```
POST /api/upload/file
Header : encryptedrequest  →  { attachmentId, actionPerformerURDD }
Body   : multipart/form-data, file in a part named "file"
```

The decrypted response is `{ attachmentId, name, type, size }`, where **`name` is the stored filename**, not the one that was uploaded.

The file rides in a multipart part while the payload rides in the encrypted header, so the two never contend for the request body. Multer already runs ahead of every `/api` route, so the parts arrive parsed.

:::danger Three mistakes that break the upload silently
1. **Do not set `Content-Type` by hand.** With FormData the browser must set `multipart/form-data` plus its boundary. A hand-set value means the server parses zero file parts and answers `400`.
2. **Do not encrypt the file.** Only the small JSON payload is encrypted, and it travels in the header. The FormData body goes out as-is.
3. **`actionPerformerURDD` is required.** The upload records who owns the attachment; without it the answer is `403`.
:::

### Who may upload

Checked in order, all failing closed:

| # | Condition | Failure |
|---|---|---|
| 1 | an `attachmentId` is present | `400` |
| 2 | `actionPerformerURDD` resolves to a user | `403` |
| 3 | the attachment row exists | `404` |
| 4 | `attachment_link IS NULL` — the slot is still empty | `409` |
| 5 | `created_by` is NULL (**claim**) or resolves to the same user (**owner**) | `403` |

**A slot may be filled exactly once.** `attachment_link IS NULL` is the record of "nothing stored yet"; once bytes are written the id is closed forever. To replace an image, mint a **new** id — never re-post to the old one.

**The first uploader claims the row.** `created_by` is set with `COALESCE(created_by, actor)`, so a claim can never re-stamp an already-owned row onto someone else; `updated_by` always records the writer.

**Ownership is matched by user, not by URDD.** A person holds one URDD per tenant, so comparing URDD ids literally would refuse someone their own file whenever they act from a different tenant's leg.

---

## Serving

```
GET /api/upload/serve?encryptedRequest=…      →  { attachmentId, actionPerformerURDD }
```

The response is the **file itself**, not a JSON envelope. `Content-Type` comes from the stored MIME type and `Content-Disposition` is `inline`.

### How visibility is decided

An attachment is **public** or **private**, and which one it is depends entirely on **what references it**. There are several reference models and all of them are consulted:

| Class | Reference | Who may fetch |
|---|---|---|
| **public** | active `dynamic_attachments` link whose `table_name` is `services`, `packages` or `frontpage_data` | anyone, signed in or not |
| **public** | active `hms_config` row with `base_table` of `services` or `packages` and `config_key = 'media'`, whose `config_value` is the attachment id | anyone — the catalog gallery |
| **public** | `tenants.tenant_logo` | anyone — hotel branding, shown pre-login |
| **public** | `users.image_attachment_id` | anyone — profile pictures appear in user pickers |
| **owner** | `guest_passport_documents` selfie / passport / visa columns | the guest on that row |
| **owner** | `messages`, `tasks`, `task_comments` attachment columns | the row's creator |
| **owner** | any other active link, or `attachments.created_by` | that user |
| **staff** | any *referenced* private attachment, when the actor holds a booking-desk permission | that staff member |
| **denied** | nothing references it | nobody |

:::warning A gallery image is not a link row
A service's or package's gallery lives in **`hms_config`**, one `media` row per image holding a bare attachment id — not in `dynamic_attachments`. Most catalog imagery is published this way and by nothing else, so a rule that consulted only the link table would refuse it.

`config_value` is a longtext that carries JSON on other rows, so the lookup requires an all-digit value before casting. Only `active` rows publish; an inactive one publishes nothing.
:::

### The staff override

A private attachment is also readable by an actor whose URDD carries any one of:

`manage_checkin` · `manage_checkout` · `update_bookings` · `add_bookings`

Front-desk work makes ownership alone unworkable: verifying a guest at check-in means looking at the id document that **guest** uploaded, and the clerk is by definition someone else.

The permission lookup requires both the grant and the assignment to be active, matching how permissions are checked everywhere else, so a revoked grant stops working here at the same moment.

**The override does not reach orphans.** It applies only to an attachment something actually references. An unreferenced upload is not a guest document, and letting staff read those would turn the override into a way to enumerate arbitrary files.

:::note Not tenant-scoped yet
A clerk holding one of these permissions at one tenant can open a private attachment belonging to a guest of another. Scoping it needs the attachment's tenant, which the data does not yet record reliably.
:::

### Caching

`Cache-Control` follows visibility. Public files get `public, max-age=86400`; **owner and staff files get `private, no-store`**, so a guest's identity document is never held in a shared proxy because a clerk viewed it once.

---

## Displaying attachments

API responses return `attachment_link` as a **complete, ready-to-render URL**:

```json
{ "attachment_id": 86, "attachment_link": "/api/upload/serve?encryptedRequest=U2FsdGVkX1..." }
```

Drop it straight into an image tag or a download link.

- Do **not** append an attachment id to it.
- Do **not** construct the URL on the client — the payload is encrypted with a key only the server holds.
- `attachment_link` may be **null**, meaning "no image". Render a placeholder; never fall back to building a path by hand.

To resolve a URL for an attachment you already know the id of:

```
GET /get/file?attachmentId=N     →  { url }
```

---

## Storage providers

The provider is chosen by the `FILE_STORAGE_PROVIDER` environment variable. All three implement the same interface, and the **storage key each returns is load-bearing**:

| Provider | Key returned | How serve delivers it |
|---|---|---|
| `local` | `Uploads/<id>-<epoch><ext>` | read from disk and streamed |
| `s3` | `uploads/<id>-<epoch><ext>` | signed URL, proxied |
| `gcs` | `uploads/<id>-<epoch><ext>` | signed URL, proxied |

Two details that look cosmetic and are not:

- **The capital `U` is the switch.** Cloud detection matches lowercase `uploads/` only. A local key written in lowercase would be routed to a signed-URL proxy that cannot sign it.
- **The filename pattern is a contract.** The local provider recovers the attachment id by splitting the basename on the first `-`, so `<attachmentId>-<epoch><ext>` must hold.

The extension is taken from the uploaded filename when it has one, otherwise from a MIME map, otherwise `.bin`.

---

## Error reference

**Upload**

| Status | Meaning |
|---|---|
| `400` | missing `attachmentId`, or no/empty file part |
| `403` | missing or unresolvable `actionPerformerURDD`, or the slot belongs to another user |
| `404` | the attachment id does not exist |
| `409` | a file was already uploaded for this attachment |

**Serve**

| Status | Meaning |
|---|---|
| `400` | no attachment id supplied |
| `403` | private, and the caller is neither its owner nor booking-desk staff |
| `404` | unknown attachment, or its file is missing from storage |

---

## Adding a new attachment-bearing table

A new column holding an attachment id is **invisible** to the visibility resolver until it is declared there, and its attachments will be refused for everyone. That is the safe direction to fail, but it is a maintenance obligation: whenever a table starts referencing `attachments`, add it to the public or private reference list and state which it is.

---

## Testing

`Services/SysScripts/TestScripts/fileFlowEdgeCases.test.js` covers both endpoints against **all three storage providers**:

```bash
node Services/SysScripts/TestScripts/fileFlowEdgeCases.test.js
```

Storage-provider selection is memoised per process, so the script spawns itself once per provider and aggregates the results. The S3 and GCS providers run for real — only the network call at the very edge is stubbed, so key derivation and branch selection stay genuinely exercised.

30 cases per provider: the provider contract, every upload rejection and acceptance path, visibility for each reference model, the staff override, and delivery headers. All fixtures are torn down afterwards, including on failure.
