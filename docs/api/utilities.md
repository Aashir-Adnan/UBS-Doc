---
sidebar_position: 7
---

# Utilities

## POST /api/CustomSendEmail

Sends a transactional email to a specified recipient. No authentication is required by default (encryption is disabled), but this endpoint should be protected at the infrastructure level.

### Request

```http
POST /api/CustomSendEmail
Content-Type: application/json
```

```json
{
  "email": "recipient@example.com",
  "subject": "Welcome to the platform",
  "body": "<h1>Hello!</h1><p>Thanks for signing up.</p>",
  "actionPerformerURDD": 7
}
```

| Field | Type | Required | Description |
|---|---|---|---|
| `email` | string | Yes | Recipient email address (also accepted as `toEmail`) |
| `subject` | string | Yes | Email subject line |
| `body` | string | No | Email body — supports HTML (also accepted as `message`) |
| `actionPerformerURDD` | integer | No | URDD of the user triggering the email (for logging) |

### Response — 200 OK

```json
{
  "success": true,
  "message": "Email sent successfully!",
  "data": {
    "email": "recipient@example.com",
    "subject": "Welcome to the platform"
  }
}
```

### Error Responses

| Status | `message` | Cause |
|---|---|---|
| `400` | `"Recipient email is required"` | `email` / `toEmail` not provided |
| `500` | `"Failed to send email."` | SMTP or transporter failure |

---

## GET /api/GetFile

Downloads a file from local or cloud storage. The file path is typically embedded in the request or resolved from a prior query. No authentication is required by default.

### Request

```http
GET /api/GetFile?filename=<filename>
```

| Parameter | Location | Type | Required | Description |
|---|---|---|---|---|
| `filename` | query | string | Yes | Name of the file to retrieve |

### Response — 200 OK

Binary file stream with appropriate `Content-Type` and `Content-Disposition` headers:

```
Content-Type: image/png
Content-Disposition: attachment; filename="report.png"
```

### Error Responses

| Status | `message` | Cause |
|---|---|---|
| `404` | `"File not found"` | File does not exist in storage |
| `500` | `"Failed to retrieve file."` | Storage read error |

### Storage Configuration

The storage target is set per-API in the config object:

| Value | Description |
|---|---|
| `"local"` | Reads from the local filesystem |
| `"s3"` | Reads from the configured AWS S3 bucket (`ubs-framework-bucket`) |

Two variants exist:

- `GET /api/GetFileUrlLocal` — returns a pre-signed or direct URL for a locally stored file
- `GET /api/GetFileUrlS3` — returns a pre-signed S3 URL for a cloud-stored file
