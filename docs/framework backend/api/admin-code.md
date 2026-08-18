---
sidebar_position: 10
---

# Admin Code

## Overview

The admin code system allows associating a verification code with a specific URDD (user–role–designation–department assignment). A standard CRUD API manages the codes, and a separate verification endpoint checks whether a submitted code matches.

### Database Table — `admin_code`

| Column | Type | Description |
|---|---|---|
| `id` | int (PK, auto-increment) | Primary key |
| `urdd_id` | int, NOT NULL | FK → `user_roles_designations_department.user_role_designation_department_id` |
| `code` | varchar(255), NOT NULL | The admin code value |
| `status` | enum(`active`, `inactive`) | Soft-delete flag (default `active`) |
| `created_by` | int | URDD of the creator |
| `updated_by` | int | URDD of the last updater |
| `created_at` | datetime | Auto-set on insert |
| `updated_at` | datetime | Auto-updated on change |

Migration: `data/migrations_completed/20260611_1_create_admin_code_table.sql`

---

## CRUD — `/api/crud/admin-code`

Standard framework CRUD for managing admin code records.

### Permissions

| Operation | Method | Permission |
|---|---|---|
| List | GET | `list_admin_code` |
| View | GET (`?id=`) | `view_admin_code` |
| Add | POST | `add_admin_code` |
| Update | PUT | `update_admin_code` |
| Delete | DELETE | `delete_admin_code` |

### Add — POST

```json
{
  "adminCode_urddId": 16,
  "adminCode_code": "SECRET123",
  "actionPerformerURDD": 1
}
```

| Field | Type | Required | Description |
|---|---|---|---|
| `adminCode_urddId` | number | Yes | The URDD to associate the code with |
| `adminCode_code` | string | Yes | The admin code value |
| `actionPerformerURDD` | number | Yes | Performing user's URDD (sets `created_by` / `updated_by`) |

### Update — PUT

```
PUT /api/crud/admin-code?id=5
```

```json
{
  "adminCode_urddId": 16,
  "adminCode_code": "NEWSECRET456",
  "actionPerformerURDD": 1
}
```

### List — GET

```
GET /api/crud/admin-code
```

Returns all active admin code records with pagination.

```json
{
  "return": [
    {
      "admin_code_id": 1,
      "id": 1,
      "adminCode_urddId": 16,
      "adminCode_code": "SECRET123",
      "adminCode_status": "active",
      "adminCode_createdBy": 1,
      "adminCode_updatedBy": 1,
      "adminCode_createdAt": "2026-06-11T10:00:00.000Z",
      "adminCode_updatedAt": "2026-06-11T10:00:00.000Z"
    }
  ]
}
```

### View — GET with id

```
GET /api/crud/admin-code?id=1
```

Returns a single record by `id`.

### Delete — DELETE (soft delete)

```
DELETE /api/crud/admin-code?id=1
```

Sets `status = 'inactive'`. The record is excluded from future List queries.

---

## Verification — POST `/api/admin/code/verify`

Checks whether a given code matches the stored admin code for a URDD. No permission gate — open to any authenticated user.

### Request

```http
POST /api/admin/code/verify
Content-Type: application/json
```

```json
{
  "urdd_id": 16,
  "code": "SECRET123"
}
```

| Field | Type | Required | Description |
|---|---|---|---|
| `urdd_id` | number | Yes | The URDD to verify the code against |
| `code` | string | Yes | The code to check |

### Response — 200 OK (match)

```json
{
  "return": {
    "verified": true
  }
}
```

### Response — 200 OK (no match)

```json
{
  "return": {
    "verified": false
  }
}
```

The endpoint always returns 200. The `verified` boolean indicates whether an active `admin_code` row exists with the given `urdd_id` and `code`.

### Query

```sql
SELECT 1
FROM admin_code
WHERE urdd_id = :urdd_id
  AND code = :code
  AND status = 'active'
LIMIT 1
```

---

## File Locations

| File | Purpose |
|---|---|
| `data/migrations_completed/20260611_1_create_admin_code_table.sql` | Table creation migration |
| `Src/Apis/GeneratedApis/Default/Admin_code/Crud_Objects/Admin_code.js` | CRUD API object |
| `Src/Apis/GeneratedApis/Default/Admin_code/Crud_Objects/CRUD_parameters.js` | CRUD parameters |
| `Src/Apis/ProjectSpecificApis/AdminCodeVerify/AdminCodeVerify.js` | Verification API object |
| `Src/Apis/ProjectSpecificApis/AdminCodeVerify/CRUD_parameters.js` | Verification parameters |
