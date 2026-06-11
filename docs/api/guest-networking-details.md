---
sidebar_position: 9
---

# Guest Networking Details

## Overview

Returns WiFi networking details (SSID and password) configured for a given service or package. The values are stored in the `hms_config` EAV table, keyed by `wifi_name` and `wifi_password` config keys.

This is an **authenticated** endpoint — the guest must provide their `actionPerformerURDD` so the middleware can resolve the tenant and scope the config-key lookup.

---

## GET /api/guest/networking/details

### Request

```http
GET /api/guest/networking/details
Content-Type: application/json
accesstoken: <jwt>
encryptedrequest: <encrypted_payload>
```

Encrypted payload body:

```json
{
  "actionPerformerURDD": 16,
  "recordId": 42,
  "baseTable": "services"
}
```

| Field | Type | Required | Description |
|---|---|---|---|
| `actionPerformerURDD` | number | Yes | Guest's URDD id for the current hotel (resolves `tenant_id`) |
| `recordId` | number | Yes | The `service_id` or `package_id` to look up networking config for |
| `baseTable` | string | Yes | Must be `"services"` or `"packages"` |

### Response — 200 OK

```json
{
  "success": true,
  "data": {
    "return": {
      "wifi_name": "{\"en\":\"Hotel-Guest-WiFi\"}",
      "wifi_password": "{\"en\":\"welcome2024\"}"
    }
  }
}
```

| Field | Type | Description |
|---|---|---|
| `wifi_name` | string \| null | The `config_value` from `hms_config` for the `wifi_name` key. JSON string (extract `$.en` for English). `null` if not configured. |
| `wifi_password` | string \| null | The `config_value` for the `wifi_password` key. `null` if not configured. |

### Error Responses

| Status | Message | Cause |
|---|---|---|
| `400` | `"baseTable must be one of: services, packages"` | Invalid `baseTable` value |
| `400` | `"actionPerformerURDD is required..."` | Missing URDD (from `ensureGuestUrdd`) |
| `401` | `"Authenticated user is required"` | No valid access token |
| `403` | `"Invalid or expired URDD..."` | URDD does not belong to the authenticated user |

### No Config Scenario

If no WiFi config rows exist for the given record, the response is:

```json
{
  "return": {
    "wifi_name": null,
    "wifi_password": null
  }
}
```

---

## How It Works

### Query

```sql
SELECT hck.config_key, hc.config_value
FROM hms_config hc
INNER JOIN hms_config_keys hck ON hc.config_key_id = hck.config_key_id
WHERE hc.base_table = :baseTable
  AND hc.record_id  = :recordId
  AND hck.config_key IN ('wifi_name', 'wifi_password')
  AND hc.status  = 'active'
  AND hck.status = 'active'
  AND (hck.tenant_id = '"all"'
       OR JSON_CONTAINS(hck.tenant_id, CAST(:tenant_id AS JSON)))
```

### Data Model

WiFi details are stored as **config values** attached to a service or package entity:

| Layer | Table | Role |
|---|---|---|
| Config key definitions | `hms_config_keys` | Defines `wifi_name` and `wifi_password` keys (category `service_details`, `applies_to = 'networking'`) |
| Config values | `hms_config` | Stores actual SSID / password per service or package (`base_table` + `record_id` polymorphic FK) |
| Service category | `service_categories` | The `networking` category (slug `networking`) groups networking services; hidden from guest catalog via `GUEST_HIDDEN_CATEGORY_SLUGS` |

### Encryption

Uses `AUTH_PLATFORM` — two-layer AES with access token + platform key. See [Token Lifecycle](./guest-auth-refresh-tokens.md) for details.
