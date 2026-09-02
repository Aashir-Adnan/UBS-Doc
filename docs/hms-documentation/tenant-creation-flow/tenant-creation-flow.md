---
title: "Overview"
sidebar_position: 0
---

# Tenant Creation Flow — API Reference

How a brand-new hotel goes from nothing to bookable, and the five endpoints that get it there.

| # | Endpoint | Creates |
|---|---|---|
| [1](./01-tenants-grouped-crud.md) | `/api/custom/tenants/grouped/crud` | the tenant, its URDD-B′, its admin, and a full clone of the global resource set |
| [2](./02-service-location-facets.md) | `/api/custom/service_location_facets` | location types and locations (building → floor → zone) |
| [3](./03-delivery-units.md) | `/api/custom/delivery/units` | the bookable instances — rooms, tables, chairs, vehicles |
| [4](./04-services.md) | `/api/custom/services` | what a guest books, with pricing, config and unit assignment |
| [5](./05-packages.md) | `/api/custom/packages` | bundles of services sold as one |

The order matters: a service can only be assigned delivery units that exist, and a delivery unit
can only sit at a location that exists. Step 1 already clones the global service categories,
location types, config keys and starter services/packages into the new tenant, so steps 2–5 are
usually **amendments to a populated tenant** rather than creation from an empty one.

---

## Conventions shared by every endpoint

### Transport

All five are standard pipeline APIs under `/api`. Requests carry the two-layer AES envelope; the
response comes back encrypted the same way.

```
outer   = AES(SECRET_KEY)   over { reqData, encryptionDetails: { PlatformName, PlatformVersion } }
reqData = AES(platform key [+ access token]) over the request payload
```

`POST` / `PUT` send the envelope in the body as `encryptedRequest`; `GET` and `DELETE` send it in
the `encryptedrequest` header.

Every `/api/**` request also needs three device headers, or it is refused with `400` before any
handler runs:

```
x-client-platform      ios | android | web
x-client-device-uuid   any non-empty value
x-app-version          any non-empty value
```

### `actionPerformerURDD`

Every payload carries the acting user's URDD id. It decides three separate things, so a wrong
value fails in three different ways:

- **Tenancy** — which tenant's rows the query resolver will let you see and write.
- **Authorization** — the permission check reads the URDD's materialized permissions (URDP).
- **Ownership** — it is stamped as `created_by` / `updated_by` on everything written.

For step 1 it must be a **system-tenant** URDD. For steps 2–5 it is normally the tenant's
**URDD-B′** (the Tenant-Manager leg created in step 1) or a tenant admin.

### Response envelope

Success:

```json
{
  "success": true,
  "data": { "...": "operation payload" },
  "meta": { "message": "Request processed successfully.", "status": 200, "priority": 1 }
}
```

Failure:

```json
{
  "success": false,
  "data": null,
  "meta": {
    "message": "Your request could not be completed. Please try again.",
    "status": 403,
    "detail": "You do not have permission to access this resource.",
    "priority": 2,
    "source": "Permission Check",
    "scc": "E41"
  },
  "error": {
    "message": "You do not have permission to access this resource.",
    "detail": "Your request could not be completed. Please try again.",
    "code": "E41",
    "source": "Permission Check"
  }
}
```

`meta.message` is the user-facing sentence, resolved per endpoint from the database message
catalog and localized. `error.details` / `meta.detail` carry the developer string. **Branch on
`meta.scc`, never on the message text** — the text is translated and editable from the DB.

### Common SCC codes

| SCC | HTTP | Means |
|---|---|---|
| `E10` | 400 | invalid or missing parameter, or decryption failure |
| `E14` | 400 | no encrypted payload found on the request |
| `E22` | 400/500 | business-rule violation |
| `E31` | 403 | ownership refused — the row belongs to another tenant |
| `E41` | 403 | permission refused |
| `E50` | 404 | not found |
| `DUPLICATE` | 409 | a unique constraint rejected the write |
| `E99` | 500 | unclassified |

### Multilingual fields

Text a guest may see is sent as an object, never a bare string:

```json
{ "serviceName": { "en": "Deep Tissue Massage", "ar": "تدليك الأنسجة العميقة" } }
```

`en` is written to the base table column; every other language goes to `translated_entries`. On
read, `language_code` in the payload selects which translation comes back, falling back to `en`.

### Deferred delete

`DELETE` is never a hard delete. A row with live dependents (an active booking, an assigned unit)
moves to **`probation`** and is finalized later by cron; a row with none goes straight to
**`archived`**. Both answer `200` with a body describing what happened — see each endpoint's
Delete section.
