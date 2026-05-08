---
sidebar_position: 6
---

# Permissions

## POST /api/AssignPermissions

Assigns a set of role-based permissions to a user. The caller must be authenticated and have permission to perform this action. The request is encrypted.

**Authentication:** Requires `encryptedRequest` + `accessToken` headers.

### Request

```http
POST /api/AssignPermissions
Content-Type: application/json
encryptedRequest: <encrypted_payload>
accessToken: <jwt_token>
```

Decrypted body:

```json
{
  "user_id": 42,
  "actionPerformerURDD": 7,
  "permissions": {
    "Admin": ["read_reports", "manage_users", "export_data"],
    "Viewer": ["read_reports"]
  }
}
```

| Field | Type | Required | Description |
|---|---|---|---|
| `user_id` | integer | Yes | ID of the user whose permissions are being assigned |
| `actionPerformerURDD` | integer | Yes | URDD ID of the admin performing the action (for audit trail) |
| `permissions` | object | Yes | Map of role name to array of permission name strings |

### `permissions` Object Structure

```json
{
  "<role_name>": ["<permission_name>", "<permission_name>"]
}
```

All roles and permissions referenced must exist in the database. Unknown names will be rejected.

### Response — 200 OK

```json
{
  "success": true,
  "message": "Permissions assigned successfully!",
  "data": {
    "user_id": 42,
    "assigned": {
      "Admin": ["read_reports", "manage_users", "export_data"],
      "Viewer": ["read_reports"]
    }
  }
}
```

### Error Responses

| Status | `message` | Cause |
|---|---|---|
| `400` | `"user_id is required"` | Missing required field |
| `400` | `"permissions is required"` | `permissions` object not provided |
| `401` | `"Unauthorized"` | Missing or invalid `accessToken` |
| `403` | `"Forbidden"` | `actionPerformerURDD` does not have permission to assign roles |
| `404` | `"User not found"` | `user_id` does not exist |
| `404` | `"Role not found: <role_name>"` | Referenced role does not exist |
| `404` | `"Permission not found: <permission_name>"` | Referenced permission does not exist |
| `500` | `"Failed to assign permissions."` | Server-side exception |

### Notes

- Existing permissions for the user are **replaced** (not merged) with each call.
- The `actionPerformerURDD` is recorded in the audit log for traceability.
- Only users with the appropriate system permission can call this endpoint.
