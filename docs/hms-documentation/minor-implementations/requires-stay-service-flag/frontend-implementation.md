---
title: "Frontend Implementation"
sidebar_position: 2
---

# Requires Stay Service Flag — Frontend

## Overview

The backend now returns a `requiresStayService` boolean on every service object. The frontend should use this flag to control whether a service can be booked independently or only as an add-on to an existing stay.

## Response Field

Every service object across all guest endpoints now includes:

```json
{
  "requiresStayService": false
}
```

| Value | Meaning |
|-------|---------|
| `false` | Service can be booked standalone |
| `true` | Service requires an active stay booking — show it as add-on only |

## Where It Appears

The flag is present on service objects returned by:

- `GET /guest/hotel/services` — hotel service listings
- `GET /guest/services` — service detail and list views
- `GET /guest/landing` — featured services on landing page
- `GET /guest/packages` — services within package line items
- `GET /guest/search/filter` — search result service cards

## Expected Frontend Behavior

When `requiresStayService` is `true`:

1. **Service cards / listings** — show an indicator (e.g. badge or subtitle) that the service requires a stay booking
2. **Book button** — disable or hide the standalone "Book Now" action; guide the user to book it as part of a stay or package instead
3. **Add-on flow** — when the guest has an active stay booking, these services should appear in the add-on service picker

When `requiresStayService` is `false` (or absent for backward compatibility):

- No change to current behavior — the service is bookable standalone

## Backward Compatibility

If the field is missing from the response (older API versions or services without the config), treat it as `false` (standalone allowed). Use optional chaining or a default:

```js
const requiresStay = service.requiresStayService ?? false;
```
