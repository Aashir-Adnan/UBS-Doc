# Guest Favorites

Manage a guest's favorite stay rooms and packages. Three dedicated endpoints handle listing, adding, and removing favorites, plus two shortcut endpoints for rooms and packages specifically.

---

## Endpoints Overview

| Method | Path | Description |
|---|---|---|
| `GET` | `/api/guest/favorites` | List all favorites (rooms + packages) |
| `POST` | `/api/guest/favorites/rooms` | Add a room favorite |
| `DELETE` | `/api/guest/favorites/rooms` | Remove a room favorite |
| `POST` | `/api/guest/favorites/packages` | Add a package favorite |
| `DELETE` | `/api/guest/favorites/packages` | Remove a package favorite |

---

## Authentication

All endpoints require the **AUTH_PLATFORM** (guest JWT). The `userId` is resolved from the authenticated session and `actionPerformerURDD` is validated via the `ensureGuestUrdd` pre-process step.

---

## List Favorites

**GET** `/api/guest/favorites`

Returns all active favorites for the authenticated user, grouped by type.

### Request Payload

| Field | Type | Required | Description |
|---|---|---|---|
| `actionPerformerURDD` | `number` | Yes | The guest's URDD ID. |

### Response (200)

```json
{
  "rooms": [
    {
      "id": 1,
      "entityType": "room",
      "packageId": null,
      "serviceId": 71,
      "favorited": true
    }
  ],
  "packages": [
    {
      "id": 2,
      "entityType": "package",
      "packageId": 329,
      "serviceId": null,
      "favorited": true
    }
  ]
}
```

| Field | Type | Description |
|---|---|---|
| `rooms` | `array` | Favorite stay rooms. |
| `packages` | `array` | Favorite packages. |
| `rooms[].id` | `number` | The `guest_favorites` row ID. |
| `rooms[].serviceId` | `number` | The favorited service (stay room) ID. |
| `packages[].packageId` | `number` | The favorited package ID. |
| `*.favorited` | `boolean` | Always `true` for listed items. |

---

## Add Room Favorite

**POST** `/api/guest/favorites/rooms`

Adds a stay room to the guest's favorites. Idempotent — re-adding an existing favorite reactivates it without error.

### Request Payload

| Field | Type | Required | Description |
|---|---|---|---|
| `actionPerformerURDD` | `number` | Yes | The guest's URDD ID. |
| `serviceId` | `number` | Yes | The service ID of the stay room to favorite. |

### Example

```json
{
  "actionPerformerURDD": 16,
  "serviceId": 71
}
```

### Behavior

1. **Validates** the service exists, is active, and belongs to the `stay` category (slug or `category_id = 1`).
2. **Upserts** a row in `guest_favorites` with `entity_type = 'room'`. If a row already exists for this user + service, its status is set back to `active`.

### Response (200)

```json
{
  "serviceId": 71,
  "favorited": true
}
```

### Error Responses

| Status | Message | Condition |
|---|---|---|
| 401 | `Authenticated user required` | No `userId` in the session. |
| 404 | `Unknown service` | Service ID does not exist or is inactive. |
| 422 | `Service is not a stay room` | Service does not belong to the stay category. |
| 422 | `serviceId is required` | Missing or invalid `serviceId`. |

---

## Remove Room Favorite

**DELETE** `/api/guest/favorites/rooms`

Removes a stay room from the guest's favorites by setting its status to `inactive`.

### Request Payload

| Field | Type | Required | Description |
|---|---|---|---|
| `actionPerformerURDD` | `number` | Yes | The guest's URDD ID. |
| `serviceId` | `number` | Yes | The service ID of the room to unfavorite. |

### Example

```json
{
  "actionPerformerURDD": 16,
  "serviceId": 71
}
```

### Response (200)

```json
{
  "serviceId": 71,
  "favorited": false
}
```

---

## Add Package Favorite

**POST** `/api/guest/favorites/packages`

Adds a package to the guest's favorites. Idempotent — re-adding reactivates.

### Request Payload

| Field | Type | Required | Description |
|---|---|---|---|
| `actionPerformerURDD` | `number` | Yes | The guest's URDD ID. |
| `packageId` | `number` | Yes | The package ID to favorite. |

### Example

```json
{
  "actionPerformerURDD": 16,
  "packageId": 329
}
```

### Behavior

1. **Validates** the package exists and is active.
2. **Upserts** a row in `guest_favorites` with `entity_type = 'package'`.

### Response (200)

```json
{
  "packageId": 329,
  "favorited": true
}
```

### Error Responses

| Status | Message | Condition |
|---|---|---|
| 401 | `Authenticated user required` | No `userId` in the session. |
| 404 | `Unknown package` | Package ID does not exist or is inactive. |
| 422 | `packageId is required` | Missing or invalid `packageId`. |

---

## Remove Package Favorite

**DELETE** `/api/guest/favorites/packages`

Removes a package from the guest's favorites by setting its status to `inactive`.

### Request Payload

| Field | Type | Required | Description |
|---|---|---|---|
| `actionPerformerURDD` | `number` | Yes | The guest's URDD ID. |
| `packageId` | `number` | Yes | The package ID to unfavorite. |

### Example

```json
{
  "actionPerformerURDD": 16,
  "packageId": 329
}
```

### Response (200)

```json
{
  "packageId": 329,
  "favorited": false
}
```

---

## Database Schema

### `guest_favorites` table

| Column | Type | Description |
|---|---|---|
| `id` | `bigint` PK | Auto-increment row ID. |
| `user_id` | `bigint` | The authenticated user's ID (from JWT). |
| `entity_type` | `enum('package','room')` | Type of favorited entity. |
| `package_id` | `bigint` | Package ID (set for `package` type, `NULL` for `room`). |
| `service_id` | `bigint` | Service ID (set for `room` type, `NULL` for `package`). |
| `status` | `varchar(16)` | `active` or `inactive` (soft delete). |
| `created_at` | `datetime` | Row creation timestamp. |
| `updated_at` | `datetime` | Last update timestamp. |

### Unique Constraints

- `uq_guest_favorites_pkg` — `(user_id, package_id)` — one favorite per user per package.
- `uq_guest_favorites_room` — `(user_id, service_id)` — one favorite per user per room.

These constraints enable the `ON DUPLICATE KEY UPDATE` upsert pattern used by the add endpoints.
