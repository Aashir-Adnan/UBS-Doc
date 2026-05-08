---
sidebar_position: 4
---

# Plan Management

## GET /api/PlanGetSubscriptions/:urdd_id

Returns all subscriptions for a user, optionally filtered by status.

### Request

```http
GET /api/PlanGetSubscriptions/7?status=active
accessToken: <jwt_token>
```

| Parameter | Location | Type | Required | Description |
|---|---|---|---|---|
| `urdd_id` | path | integer | Yes | User Role Designation Department ID |
| `status` | query | string | No | Filter: `active`, `inactive`, or `all` (default: `all`) |

### Response — 200 OK

```json
{
  "success": true,
  "message": "Subscriptions retrieved successfully",
  "data": {
    "subscriptions": [
      {
        "subscription_id": 12,
        "plan_id": 3,
        "plan_name": "Pro",
        "status": "active",
        "started_at": "2025-01-15T10:00:00Z",
        "expires_at": "2026-01-15T10:00:00Z",
        "gateway": "stripe"
      }
    ]
  }
}
```

### Error Responses

| Status | `message` | Cause |
|---|---|---|
| `404` | `"User not found"` | Invalid `urdd_id` |
| `500` | `"Failed to retrieve subscriptions"` | Server-side exception |

---

## GET /api/PlanGetServiceSummary/:urdd_id

Returns service usage summary for a user — credits consumed, quota remaining, and per-service breakdown.

### Request

```http
GET /api/PlanGetServiceSummary/7
accessToken: <jwt_token>
```

| Parameter | Location | Type | Required | Description |
|---|---|---|---|---|
| `urdd_id` | path | integer | Yes | User Role Designation Department ID |

### Response — 200 OK

```json
{
  "success": true,
  "message": "Service summary retrieved successfully",
  "data": {
    "service_summary": [
      {
        "service_name": "premium_analytics",
        "total_credits": 100,
        "used_credits": 37,
        "remaining_credits": 63,
        "period_start": "2025-05-01",
        "period_end": "2025-05-31"
      }
    ]
  }
}
```

### Error Responses

| Status | `message` | Cause |
|---|---|---|
| `404` | `"User not found"` | Invalid `urdd_id` |
| `500` | `"Failed to retrieve service summary"` | Server-side exception |

---

## POST /api/PlanServiceUsage

Records consumption of a service by a user. Deducts credits from the user's current plan quota.

### Request

```http
POST /api/PlanServiceUsage
Content-Type: application/json
accessToken: <jwt_token>
```

```json
{
  "urdd_id": 7,
  "service_name": "premium_analytics",
  "credits_needed": 2
}
```

| Field | Type | Required | Default | Description |
|---|---|---|---|---|
| `urdd_id` | integer | Yes | — | User Role Designation Department ID |
| `service_name` | string | Yes | — | Name of the service being consumed |
| `credits_needed` | integer | No | `0` | Credits to deduct for this usage |

### Response — 200 OK

```json
{
  "success": true,
  "message": "Service usage tracked successfully",
  "data": {
    "remaining_credits": 61,
    "usage_id": 88
  }
}
```

### Error Responses

| Status | `message` | Cause |
|---|---|---|
| `400` | `"Insufficient credits"` | User does not have enough credits |
| `400` | `"Service usage tracking failed"` | Invalid service name or inactive subscription |
| `404` | `"Active subscription not found"` | No active plan for this user |
| `500` | `"Service usage tracking failed"` | Server-side exception |

---

## POST /api/PlanUpgrade

Upgrades a user from their current plan to a higher-tier plan. Initiates payment as part of the upgrade flow.

### Request

```http
POST /api/PlanUpgrade
Content-Type: application/json
accessToken: <jwt_token>
```

```json
{
  "urdd_id": 7,
  "from_plan_id": 1,
  "to_plan_id": 3,
  "payment_method_id": 15
}
```

| Field | Type | Required | Description |
|---|---|---|---|
| `urdd_id` | integer | Yes | User Role Designation Department ID |
| `from_plan_id` | integer | Yes | The user's current plan ID |
| `to_plan_id` | integer | Yes | The target plan ID (must be higher tier) |
| `payment_method_id` | integer | Yes | Active verified payment method ID |

### Response — 200 OK

```json
{
  "success": true,
  "message": "Plan upgraded successfully",
  "data": {
    "new_subscription_id": 25,
    "old_subscription_id": 12,
    "action": "upgraded"
  }
}
```

### Error Responses

| Status | `message` | Cause |
|---|---|---|
| `400` | `"Plan upgrade failed"` | Target plan is not higher, or payment failed |
| `404` | `"Plan not found"` | Invalid plan ID |
| `422` | `"Already on this plan"` | `from_plan_id` equals `to_plan_id` |
| `500` | `"Plan upgrade failed"` | Server-side exception |

---

## POST /api/PlanDowngrade

Downgrades a user to a lower-tier plan. May apply a grace period before the new plan takes effect.

### Request

```http
POST /api/PlanDowngrade
Content-Type: application/json
accessToken: <jwt_token>
```

```json
{
  "urdd_id": 7,
  "from_plan_id": 3,
  "to_plan_id": 1,
  "payment_method_id": 15
}
```

| Field | Type | Required | Description |
|---|---|---|---|
| `urdd_id` | integer | Yes | User Role Designation Department ID |
| `from_plan_id` | integer | Yes | The user's current plan ID |
| `to_plan_id` | integer | Yes | The target plan ID (must be lower tier) |
| `payment_method_id` | integer | Yes | Active verified payment method ID |

### Response — 200 OK

```json
{
  "success": true,
  "message": "Plan downgraded successfully",
  "data": {
    "new_subscription_id": 26,
    "old_subscription_id": 12,
    "grace_period_until": "2025-06-15T00:00:00Z",
    "action": "downgraded"
  }
}
```

### Error Responses

| Status | `message` | Cause |
|---|---|---|
| `400` | `"Plan downgrade failed"` | Target plan is not lower tier |
| `404` | `"Plan not found"` | Invalid plan ID |
| `422` | `"Already on this plan"` | `from_plan_id` equals `to_plan_id` |
| `500` | `"Plan downgrade failed"` | Server-side exception |
