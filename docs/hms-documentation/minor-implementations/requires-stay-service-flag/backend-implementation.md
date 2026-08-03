---
title: "Backend Implementation"
sidebar_position: 1
---

# Requires Stay Service Flag — Backend

## Overview

Services can now be flagged as requiring an active stay booking before they can be booked independently. This is controlled by the `requires_booking` config key in `hms_config`, exposed to the guest app as `requiresStayService` (boolean) on every service object.

## Config Source

| Table | Key | Type | Values |
|-------|-----|------|--------|
| `hms_config` | `requires_booking` | `is_input=0` (pv_ref) | `0` = standalone allowed, `1` = requires stay |

The value is stored as a possible value ID referencing `hms_config_possible_values`. The `is_input` flag is `0`, so `fetchRawConfigs` and `fetchGuestConfigs` resolve the ID to its scalar value (`"0"` or `"1"`).

## Response Field

All service objects in guest API responses now include:

```json
{
  "requiresStayService": false
}
```

- `true` — the service can only be booked as an add-on to a stay booking
- `false` — the service can be booked standalone (default when config is missing)

## Affected Endpoints

| Endpoint | Builder | Config Fetch |
|----------|---------|--------------|
| `GET /guest/hotel/services` | `buildMinimalServiceObjects` → `buildServiceShape` | `fetchRawConfigs` |
| `GET /guest/services` | `buildDetailedServiceObjects` | `fetchGuestConfigs` |
| `GET /guest/landing` | `buildLandingServiceObjects` → `buildServiceShape` | `fetchRawConfigs` |
| `GET /guest/packages` | `buildPackageObjects` → spreads from detailed service | inherited |
| `GET /guest/search/filter` | `buildLandingServiceObjects` → `buildServiceShape` | `fetchRawConfigs` |

## Files Changed

| File | Change |
|------|--------|
| `Src/HelperFunctions/Guest/v2/serviceObjects.js` | Added `requires_booking` to `fetchGuestConfigs` keys; added `requiresStayService` to response shape |
| `Src/HelperFunctions/Guest/v2/landingObjects.js` | Added `requires_booking` to all three `fetchRawConfigs` key lists; added `requiresStayService` to `buildServiceShape` output |

## Resolution Logic

```
serviceObjects.js (fetchGuestConfigs path):
  scalar.requires_booking === "1" → true
  otherwise → false

landingObjects.js (fetchRawConfigs path):
  cfg.requires_booking === "1" → true
  otherwise → false
```

Both paths resolve the pv_ref ID before comparison. If no `requires_booking` config row exists for a service, the value is `undefined` and the flag defaults to `false`.
