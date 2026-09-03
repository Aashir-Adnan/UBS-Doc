---
sidebar_position: 5
---

# File Upload Flow — Frontend Integration Guide

Uploading and displaying attachments — profile images, KYC documents, service and package
imagery, or any other file.

Two endpoints matter, and both live **inside** `/api`, which means both go through the normal
middleware pipeline (platform encryption, parameter validation, per-request authorization):

| Endpoint | Purpose |
|---|---|
| `POST /api/upload/file` | put bytes behind an attachment id |
| `GET /api/upload/serve` | stream an attachment's bytes back |

:::danger The old `/upload` routes are deprecated
`POST /upload?token=...` and `GET /upload/serve?attachmentId=...` sit **outside** `/api`, so they
never enter the pipeline and carry no authorization. `GET /upload/serve` in particular means the
id *is* the capability — and ids are sequential, so anyone could enumerate every attachment on the
platform, KYC documents included.

Both are still mounted for backwards compatibility. Do not build anything new on them.
:::

---

## The model in one line

An attachment id is a **slot that may be filled exactly once, by the user who owns it**.

Uploading asks *"is this slot still empty, and is it yours?"* Serving asks *"who is allowed to
read this?"* Those are two different questions with two different answers, which is why the rules
below differ between the two endpoints.

---

## Step 1 — Mint an attachment id

Unchanged. Ask for an upload URL; what you actually need from the response is the
**`attachmentId`**.

```
GET /api/get/file/url/local?fileType=jpg
GET /api/get/file/url/s3?fileType=jpg
```

No auth required. `fileType` is the extension (`jpg`, `png`, `pdf`).

**Response:**

```json
{
  "success": true,
  "data": {
    "uploadUrl": "http://api.example.com/upload?token=eyJ...",
    "uploadToken": "eyJ...",
    "attachmentId": 42
  }
}
```

| Field | Use it? |
|---|---|
| `attachmentId` | **Yes.** This is the slot you are about to fill, and the id you reference forever after. |
| `uploadUrl` | **Local: no** — it points at the deprecated `/upload?token=` route; upload to `/api/upload/file` instead. **S3: yes** — it is a pre-signed S3 `PutObject` URL and the upload goes straight to S3. |
| `uploadToken` | No. |

:::warning `uploadToken` is not a session token
It is a short-lived, file-scoped JWT. The backend deliberately names it `uploadToken` rather than
`token` precisely so it is never adopted as the session access token.

It is also **not single-use**, despite what the legacy route intends: the check that was supposed
to enforce that compares against a status value nothing in the codebase ever writes, so it never
fires. A captured token can be replayed for its full hour. This is one of the reasons
`/api/upload/file` exists — it gates on whether the slot is *actually still empty*, which cannot
go stale.
:::

---

## Step 2 — Upload the bytes

### `POST /api/upload/file` (local storage)

Multipart, with the usual encrypted envelope in the header:

```
POST /api/upload/file
Headers:
  encryptedrequest: <envelope over { "attachmentId": 42, "actionPerformerURDD": 118 }>
Body:
  multipart/form-data
  file: <the binary>
```

Both `attachmentId` and `actionPerformerURDD` are **required**. The file part should be named
`file`; if it is not, the first part in the request is used.

**Response** (encrypted, like every other API response):

```json
{
  "attachmentId": 42,
  "name": "42-1722000000000.jpg",
  "type": "image/jpeg",
  "size": 184320
}
```

`name` is the **stored** filename, not the one you sent.

**Refusals** — all fail closed, checked in this order:

| Status | Meaning | What the frontend should do |
|---|---|---|
| **400** | no `attachmentId` in the payload | fix the request |
| **403** | `actionPerformerURDD` does not resolve to a user | re-authenticate |
| **404** | no such attachment row | mint a new id |
| **409** | **the slot is already filled** | mint a new id and upload again — never retry into the same id |
| **403** | the slot belongs to somebody else | mint your own id |

The 409 is the one-time guarantee, and it is enforced on `attachment_link IS NULL` — the actual
record of "nothing stored here yet". Re-uploading into a filled slot is not supported at any
level; get a fresh id.

**Ownership** is matched on the underlying **user**, not the URDD. One person holds a separate
URDD per tenant, so acting from a different tenant's leg still gets you your own file. The first
uploader **claims** an unowned slot; a claim can never re-stamp a slot that already has an owner.

### `PUT <uploadUrl>` (S3 / cloud storage) — unchanged

For S3 the flow is exactly what it always was, and **none of the rules above apply to it**:

```
PUT <uploadUrl>
Content-Type: image/jpeg

<raw binary body>
```

`uploadUrl` from Step 1 is a pre-signed S3 `PutObject` URL that **expires in 1 hour**. The PUT
goes **directly to S3** — it never reaches the API server, so there is no envelope, no
`actionPerformerURDD`, and no ownership check. S3 governs the size and content-type limits, and
answers with an **empty `200 OK`**.

`x-filename` and `Content-Disposition` are **not** needed. The object key was fixed when the URL
was generated: the backend inserted the `attachments` row, computed
`uploads/<attachmentId>-<timestamp>.<fileType>`, and wrote that key to `attachment_link` **before**
handing you the URL. Nothing you send can change it.

:::danger Do not send an S3-minted id to `/api/upload/file`
Because the S3 path writes `attachment_link` at mint time, the slot is already "filled" as far as
the one-time gate is concerned. `POST /api/upload/file` would answer **409** immediately.

The two paths are chosen by the server's `FILE_STORAGE_PROVIDER`, not by the client: use whichever
Step 1 endpoint matches your environment, then the upload method that goes with it.
:::

:::note The S3 row stays `pending`
Since the bytes bypass the backend entirely, nothing reports back that the upload happened — the
row keeps `status = 'pending'` and never gets `attachment_name`, `attachment_type` or
`attachment_size`. Only `attachment_link` is populated. This is by design today and retrieval works
regardless (the serve path does not filter on `attachments.status`), but do not rely on
`status = 'active'` to mean "a file exists" on an S3 environment.
:::

---

## Step 3 — Attach it to a record

Pass `attachmentId` to whatever endpoint expects the reference. The field name varies per
endpoint — check its parameter schema.

```json
{ "attachmentId": 42, "documentType": "passport" }
```

This step matters more than it looks: **an attachment nothing references is unreachable.** See
below.

---

## Displaying a file

### Prefer `attachment_link` — it is already a URL

Services, packages and similar responses now return `attachment_link` as a **ready-to-render
relative URL**:

```json
{
  "attachment_id": 86,
  "attachment_link": "/api/upload/serve?encryptedRequest=U2FsdGVkX1..."
}
```

Drop it straight into `<img src>`. Do **not** append `attachmentId`, and do **not** try to build
this URL yourself — only the server holds the platform key needed to sign it.

A `null` link means "no image". It never means "a path you should assemble by hand".

### Why the payload is in the query string

`/api/upload/serve` is platform-encrypted, and the pipeline normally reads the envelope from the
`encryptedrequest` header. **A browser cannot set a header on an `<img src>`.** So for this one
endpoint the envelope is built server-side and carried as `?encryptedRequest=`, decrypted and
validated by exactly the same code path as a header call. A transport, not a bypass.

The **actor is baked into the URL at build time** — that is what lets a private document render in
an `<img>` at all. The consequence is that the URL is a **bearer capability**: anyone holding that
string can fetch that one attachment. Treat these links the way you would treat a signed S3 URL —
don't paste them into logs, tickets, or analytics. It is still strictly tighter than the
`?attachmentId=5` links it replaces, where any guessable integer worked.

The encryption is deterministic, so the same attachment and actor always produce the same string —
browser and CDN caching still work.

### `GET /api/get/file` still works

```
GET /api/get/file?attachmentId=42
```

| Storage | What comes back |
|---|---|
| **Local** | an absolute `/api/upload/serve?encryptedRequest=...` URL (**not** the old `/upload/serve?attachmentId=` form) |
| **S3 / GCS** | a pre-signed URL valid for 7 days |
| **External** | the stored absolute URL, as-is |

Do not cache pre-signed URLs long-term; re-fetch on demand.

---

## Who can see what

Visibility is decided by **what references the attachment**, not by a flag on the row.

| Class | Referenced by | Who may fetch |
|---|---|---|
| **public** | an active link on `services`, `packages`, `frontpage_data` | anyone, signed in or not |
| **public** | a gallery image (`media` config on a service or package) | anyone |
| **public** | `tenants.tenant_logo` | anyone — branding renders pre-login |
| **public** | `users.image_attachment_id` | anyone — avatars appear in user pickers |
| **owner** | a guest's passport / selfie / visa document | that guest |
| **owner** | a message, task, or task-comment attachment | that row's creator |
| **staff** | any *referenced* private attachment | staff holding `manage_checkin`, `manage_checkout`, `update_bookings` or `add_bookings` |
| **denied** | **nothing at all** | **nobody** |

Three consequences worth designing around:

1. **Upload then attach, in that order, promptly.** Between the two, the file is private and
   reachable only by its owner. If you never attach it, it becomes permanently unreachable — on
   the reference database, 294 of 506 filled attachments are orphans in exactly this way.
2. **A profile picture is public.** Deliberately: user pickers render other people's avatars, and
   owner-only would blank every one of them.
3. **The staff override does not reach orphans.** A front-desk clerk can open a guest's passport
   because check-in requires it — but only for attachments something actually references. That
   keeps the override from becoming a way to enumerate arbitrary uploads.

Private files are served with `Cache-Control: private, no-store`, so they are never parked in a
shared proxy where the next user could be handed them. Public files get `public, max-age=86400`.

---

## Storage modes

Configured server-side by `FILE_STORAGE_PROVIDER`. Frontend code should not branch on it — the
retrieval API abstracts it. Useful only when debugging a raw `attachment_link` from the database:

| Storage | Stored `attachment_link` | How retrieval resolves it |
|---|---|---|
| **Local** | `Uploads/42-1722000000000.jpg` — capital `U` | a signed `/api/upload/serve?encryptedRequest=...` URL |
| **S3 / GCS** | `uploads/42-1722000000000.jpg` — lowercase `u` | a pre-signed `GetObject` URL, valid **7 days** |
| **External** | `https://cdn.example.com/image.jpg` | returned as-is |

The case difference is load-bearing: `isCloudKey` distinguishes a local disk path from a cloud key
on exactly that capital `U`.

### Local vs S3 in one paragraph

**Local:** the backend mints an id with `attachment_link` still `NULL`, you upload through
`POST /api/upload/file`, and the backend fills in the link, name, type, size and
`status = 'active'` — with the ownership and one-time checks applied.

**S3 / GCS:** the backend mints an id, reserves and stores the object key up front, and hands you
a pre-signed URL; you `PUT` straight to S3 and the backend is never involved again. Faster and it
keeps large bodies off the API server, but it also means the one-time and ownership guarantees of
`/api/upload/file` do not exist on this path — the pre-signed URL is the only credential, and it
is replayable for its full hour.

---

## KYC documents

KYC submission uses its own multipart endpoint (see the Guest Onboarding KYC doc) and returns an
`attachmentId` per document. Retrieval is identical to any other attachment. These are **owner**
class — the guest sees their own, and front-desk staff with a check-in permission can see them
during verification.

---

## Integration checklist

- Mint a fresh `attachmentId` for every file. Never re-upload into one that already has bytes.
- Upload to `POST /api/upload/file` for local storage; `PUT` to the pre-signed URL for S3.
- Send `actionPerformerURDD` with the upload — the slot is claimed by whoever fills it.
- A **409** means the slot is taken. Mint a new id; do not retry.
- Attach the id to a record promptly. An unreferenced attachment is unreachable by design.
- Render from `attachment_link` as returned. Never construct a serve URL client-side.
- Treat serve URLs as bearer capabilities — they carry the viewer's identity.
- S3 environments: `PUT` to the pre-signed URL (1-hour expiry), never to `/api/upload/file` — an
  S3-minted id already has its link set and would 409.
- Re-fetch S3 pre-signed **GetObject** URLs on demand; they expire after 7 days.
- Never store `uploadToken` as the session access token.
- Do not build against `/upload?token=` or `/upload/serve?attachmentId=` — both are deprecated and
  unauthenticated.
