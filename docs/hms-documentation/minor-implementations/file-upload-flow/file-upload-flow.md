---
sidebar_position: 5
---

# File Upload Flow — Frontend Integration Guide

This document covers the complete file upload and retrieval flow for the HMS backend. It is written for frontend developers integrating file uploads (profile images, KYC documents, service images, or any attachment).

---

## Overview

There are two upload patterns in the system:

| Pattern | Used for | Transport |
|---|---|---|
| **Token-based upload** | General-purpose attachments, KYC documents | Two-step: get URL → PUT binary |
| **Multipart direct upload** | Guest profile image | Single POST with `multipart/form-data` |

Both patterns write to the `attachments` table and return an `attachmentId`. Retrieval always goes through the backend via `attachmentId`.

---

## Pattern 1 — Token-Based Upload (Two-Step)

This is the primary framework-level upload pattern. The backend issues a short-lived upload URL and token. The client uploads the raw binary file to that URL. The backend then stores the file and marks the attachment as active.

### Step 1 — Get an Upload URL

Call the appropriate endpoint based on your environment's configured storage:

**Local storage:**
```
GET /api/get/file/url/local?fileType=jpg
```

**S3 storage:**
```
GET /api/get/file/url/s3?fileType=jpg
```

Both endpoints require no auth (no `accesstoken` header needed). Pass `fileType` as the file extension (e.g. `jpg`, `png`, `pdf`).

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

| Field | Description |
|---|---|
| `uploadUrl` | The URL to PUT the file binary to. For local storage, this points to the backend's `/upload` endpoint. For S3, this is a pre-signed S3 URL that expires in 1 hour. |
| `uploadToken` | The same JWT embedded in `uploadUrl`. Provided as a separate field for reference — the upload path already contains it. Do not confuse this with the session access token. |
| `attachmentId` | The DB record ID created for this upload. Store this — you will reference it later to link the file to a record or retrieve it. |

> **Warning:** Do not treat `uploadToken` as a session access token. It is a short-lived, single-use file upload token only. The backend deliberately names it `uploadToken` (not `token`) to prevent it from being accidentally adopted as the session credential.

### Step 2 — Upload the File

The HTTP method and destination depend on the storage backend:

**Local storage — POST to the backend:**
```
POST <uploadUrl>
Content-Type: image/jpeg
x-filename: photo.jpg

<raw binary body>
```

The `uploadUrl` points to the backend's `/upload?token=...` endpoint. The request body must be the raw binary — not form data, not JSON.

| Header | Required | Notes |
|---|---|---|
| `Content-Type` | Recommended | MIME type of the file (e.g. `image/jpeg`, `application/pdf`). Used to set the correct type in the DB. |
| `x-filename` | Optional | Original filename including extension. If omitted, the server infers the extension from `Content-Type`. |
| `Content-Disposition` | Optional | Alternative way to supply the filename: `attachment; filename="photo.jpg"`. |

**S3 storage — PUT directly to S3:**
```
PUT <uploadUrl>
Content-Type: image/jpeg

<raw binary body>
```

The `uploadUrl` is a pre-signed S3 `PutObject` URL. The PUT goes directly to S3 — it does not go through the backend. The backend has already created the `attachments` row and reserved the S3 key before returning the URL. `x-filename` and `Content-Disposition` headers are not needed for S3 uploads; the key was determined when the URL was generated.

**Response (local only — S3 responds with an empty 200):**
```json
{
  "success": true,
  "data": {
    "name": "42-1722000000000.jpg",
    "attachmentId": 42
  }
}
```

The upload token is single-use. Attempting to upload again with the same token returns an error — request a new URL for each file.

**Error responses:**

| Status | Cause |
|---|---|
| 400 | Token missing, expired, or already used |
| 400 | Empty request body |
| 500 | Storage write failed |

### Step 3 — Attach to a Record

After a successful upload, pass `attachmentId` to whatever API expects the file reference. For example, saving a user document after KYC upload:

```json
{
  "attachmentId": 42,
  "documentType": "passport"
}
```

The specific field name varies by endpoint — check the endpoint's parameter schema.

---

## Pattern 2 — Multipart Direct Upload (Profile Image)

The guest profile image endpoint accepts a standard `multipart/form-data` POST. No pre-upload URL step is required.

```
POST /api/guest/profile/image
Content-Type: multipart/form-data
accesstoken: <jwt>
```

Send the image as the `file` field in the form body.

**Response:**
```json
{
  "success": true,
  "data": {
    "profile_image_url": "/uploads/guest_profile_images/5_1722000000000_avatar.jpg",
    "attachment_id": 42
  }
}
```

| Field | Description |
|---|---|
| `attachment_id` | The attachment record ID. Use this with `GET /api/get/file?attachmentId=42` to retrieve a displayable URL. This is the canonical reference to store and pass around. |
| `profile_image_url` | A raw server-relative path. Treat this as a fallback only — use `attachment_id` with the standard retrieval endpoint for consistency across local and S3 environments. |

This endpoint creates an `attachments` row and links it to the user record automatically. When displaying the profile image, resolve it via `GET /api/get/file?attachmentId=<attachment_id>` — this ensures the correct URL is returned regardless of which storage backend is active.

---

## File Retrieval

Once a file is uploaded, use the backend's retrieval endpoint to get a displayable URL. The backend handles all storage variants transparently.

### Get a File URL

```
GET /api/get/file?attachmentId=42
```

No auth required. Pass the `attachmentId` returned at upload time.

**Response:**
```json
{
  "success": true,
  "data": {
    "url": "https://..."
  }
}
```

The `url` value differs based on storage:

| Storage | URL returned |
|---|---|
| **Local** | `http://api.example.com/upload/serve?attachmentId=42` — the backend serves the file directly |
| **S3** | A pre-signed S3 `GetObject` URL valid for 7 days |
| **External URL** | The stored URL returned as-is |

### Serve Endpoint (Local Only)

For local-stored files, the retrieval response points to the serve endpoint:

```
GET /upload/serve?attachmentId=42
```

This streams the raw file bytes with appropriate `Content-Type` and `Cache-Control` headers. Use it as the `src` for images or as a download link. It is safe to use in `<img>` tags directly.

For S3 files, the pre-signed URL from `/api/get/file` can be used directly as an `<img src>` or download link — no additional proxy step is needed.

---

## Storage Modes and URL Patterns

The backend storage provider is configured server-side via the `FILE_STORAGE_PROVIDER` environment variable. Frontend code does not need to know which storage mode is active — the retrieval API abstracts it. However, understanding the patterns helps debug raw `attachment_link` values from the DB:

| Storage | `attachment_link` format | How retrieval resolves it |
|---|---|---|
| **Local** | `Uploads/42-1722000000000.jpg` | Returns `/upload/serve?attachmentId=42` |
| **S3** | `uploads/42-1722000000000.jpg` (lowercase `u`) | Returns a 7-day pre-signed S3 URL |
| **External / absolute URL** | `https://cdn.example.com/image.jpg` | Returns the URL as-is |

> Note the case difference: `Uploads/` (capital U) = local disk. `uploads/` (lowercase) = S3/cloud key. The backend uses this to distinguish them.

### S3 Upload vs Local Upload

For **local storage**, the `uploadUrl` points to the backend (`/upload?token=...`) and the client POSTs the raw binary there.

For **S3 storage**, the `uploadUrl` is a **pre-signed S3 `PutObject` URL**. The client PUTs the raw binary directly to S3 — the request does not go through the backend. The backend has already created the `attachments` row and stored the S3 key before returning the URL.

This means for S3 uploads, Step 2's request goes to `https://s3.amazonaws.com/...` (or your configured S3 endpoint), not to the API server. The `Content-Type` and file size limits for that PUT are governed by S3, not the backend. S3 responds with an empty `200 OK` body on success.

---

## Service and Package Images

Service and package images are stored as a JSON array in the `services.image_url` DB column. Each element can be either:

- A numeric attachment ID (e.g. `42`)
- An already-resolved URL string

When the API returns service or package objects, the `image_url` field (or `images` array, depending on the endpoint) contains string values that may be either form. The frontend should:

1. Check if the value is a valid URL (starts with `http://` or `https://`). If so, use it directly.
2. If it looks like a numeric ID, resolve it via `GET /api/get/file?attachmentId=<id>`.

In practice, fully resolved URL strings are the common case for admin-uploaded assets. Numeric IDs may appear for older records or when an admin uploads via the token-based flow without the admin panel pre-resolving the URL.

---

## KYC Documents

KYC file submission uses the multipart pattern on a dedicated endpoint (see the Guest Onboarding KYC doc). The server automatically selects local or S3 storage based on the `GUEST_KYC_STORAGE` env var. The response includes an `attachmentId` for each uploaded document. To display a KYC document later, use `GET /api/get/file?attachmentId=<id>` — the retrieval flow is identical to any other attachment.

---

## Integration Checklist

- Request a new upload URL for each file. URLs are single-use.
- Store the `attachmentId` from Step 1 — you need it for retrieval.
- Send raw binary in Step 2, not JSON or form data (for token-based uploads).
- Always set `Content-Type` on the Step 2 request.
- For S3 environments, the Step 2 PUT goes directly to S3, not to the API server.
- Use `GET /api/get/file?attachmentId=<id>` for retrieval — do not construct file paths manually.
- For local-storage serve URLs, the path is proxied through the backend — these URLs require the API server to be reachable.
- S3 pre-signed URLs expire after 7 days. Do not cache them long-term; re-fetch on demand.
- Do not store `uploadToken` as the session access token — it is a short-lived file-only credential.
