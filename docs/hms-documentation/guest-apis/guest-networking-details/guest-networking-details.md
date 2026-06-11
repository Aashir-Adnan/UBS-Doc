# Guest Networking Details

**GET** `/api/guest/networking/details`

Returns WiFi networking details (SSID and password) configured for a given service or package. The values are stored in the `hms_config` EAV table, keyed by `wifi_name` and `wifi_password` config keys.

---

## Authentication

Uses **AUTH_PLATFORM** — requires a valid JWT access token and platform encryption. The `actionPerformerURDD` is resolved by `ensureGuestUrdd` which stamps `tenant_id` on the payload.

---

## Request Payload

All fields are sent in the encrypted request body.

| Field | Type | Required | Description |
|---|---|---|---|
| `actionPerformerURDD` | `number` | Yes | Guest's URDD id for the current hotel (resolves `tenant_id`). |
| `recordId` | `number` | Yes | The `service_id` or `package_id` to look up networking config for. |
| `baseTable` | `string` | Yes | Must be `"services"` or `"packages"`. |

### Example: Fetch WiFi for a service

```json
{
  "actionPerformerURDD": 16,
  "recordId": 42,
  "baseTable": "services"
}
```

### Example: Fetch WiFi for a package

```json
{
  "actionPerformerURDD": 16,
  "recordId": 7,
  "baseTable": "packages"
}
```

---

## Response

### Success (200)

```json
{
  "return": {
    "wifi_name": "{\"en\":\"Hotel-Guest-WiFi\"}",
    "wifi_password": "{\"en\":\"welcome2024\"}"
  }
}
```

| Field | Type | Description |
|---|---|---|
| `wifi_name` | `string` \| `null` | The `config_value` from `hms_config` for the `wifi_name` key. JSON string — extract `$.en` for English. `null` if not configured. |
| `wifi_password` | `string` \| `null` | The `config_value` for the `wifi_password` key. `null` if not configured. |

### No Config Found

If no WiFi config rows exist for the given record, both fields return `null`:

```json
{
  "return": {
    "wifi_name": null,
    "wifi_password": null
  }
}
```

### Error Responses

| Status | Message | Condition |
|---|---|---|
| `400` | `"baseTable must be one of: services, packages"` | Invalid `baseTable` value. |
| `400` | `"actionPerformerURDD is required..."` | Missing URDD (from `ensureGuestUrdd`). |
| `401` | `"Authenticated user is required"` | No valid access token. |
| `403` | `"Invalid or expired URDD..."` | URDD does not belong to the authenticated user. |
| `500` | `"Failed to fetch networking details"` | Internal query error. |

---

## Behaviour

1. `ensureGuestUrdd` validates the `actionPerformerURDD`, confirms ownership, and stamps `tenant_id` on the payload.
2. `preProcessValidate` checks that `baseTable` is one of `"services"` or `"packages"`.
3. The query resolver runs the SQL query against `hms_config` joined with `hms_config_keys`.
4. The postProcess function maps the result rows into `{ wifi_name, wifi_password }`, defaulting to `null` for missing keys.

---

## Query

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

---

## Data Model

WiFi details are stored as config values attached to a service or package entity:

| Layer | Table | Role |
|---|---|---|
| Config key definitions | `hms_config_keys` | Defines `wifi_name` and `wifi_password` keys (category `service_details`, `applies_to = 'networking'`). |
| Config values | `hms_config` | Stores actual SSID / password per service or package (`base_table` + `record_id` polymorphic FK). |
| Service category | `service_categories` | The `networking` category (slug `networking`) groups networking services; hidden from guest catalog via `GUEST_HIDDEN_CATEGORY_SLUGS`. |

---

## Test Coverage

Sim test: `Services/SysScripts/TestScripts/sim/guestNetworkingDetailsCheck.js`

| # | Test | Expected |
|---|---|---|
| 1 | Fetch details for a networking service | Returns `wifi_name` and `wifi_password` keys in response. |
| 2 | Fetch details for a package | Returns valid response shape. |
| 3 | Invalid `baseTable` (`"bookings"`) | 400 error. |
| 4 | Non-existent `recordId` | Both fields are `null`. |
