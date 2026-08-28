# Fetching Package Oriented Pricing

**Date:** 2026-08-27
**Audience:** Guest-side frontend developers (mobile app + web app)
**Scope:** How to request package-scoped (discounted) prices from the service listing APIs.

---

## Background

A service can have a different price when booked as part of a specific package. For example:
> "Spa session is normally 400 SAR. When booked as part of the Wellness Package it's 300 SAR."

The backend resolves these discounts automatically when you pass a `packageId` query parameter. When a `packageId` is provided, a new `packageSpecificPrice` field is returned alongside the standard pricing fields.

---

## Affected Endpoints

### `GET /api/guest/hotel-services`

Used to show a hotel's service cards (e.g. on the package detail screen when the user is browsing which services are included or available to add on).

**Without `packageId` (generic price):**
```
GET /api/guest/hotel-services?hotelId=16
```

**With `packageId` (package-scoped price):**
```
GET /api/guest/hotel-services?hotelId=16&packageId=42
```

---

### `GET /api/guest/services`

Used for the full service detail view and the paginated service listing. Pass `packageId` when the user is viewing services in the context of a package (e.g. add-on selection during package booking).

**List with package pricing:**
```
GET /api/guest/services?hotelId=16&packageId=42
```

**Single service detail with package pricing:**
```
GET /api/guest/services?serviceId=101&packageId=42
```

---

## Response Shape

When a `packageId` is passed, three pricing fields are returned:

| Field | Description |
|-------|-------------|
| `base_price` | Generic catalog price — no package context, no tenant rules |
| `current_price` | Package-scoped catalog price **with** tenant pricing rules applied |
| `packageSpecificPrice` | Package-scoped catalog price **without** tenant pricing rules. `null` when no `packageId` is provided or no package-specific price row exists. |

**With `packageId`** (service is 400 SAR standalone, 300 SAR in this package, tenant rules apply a 5% discount):
```json
{
  "id": 101,
  "name": "Spa Session",
  "base_price": 400,
  "current_price": 285,
  "packageSpecificPrice": 300,
  "currency": "SAR"
}
```

**Without `packageId`** (generic pricing only):
```json
{
  "id": 101,
  "name": "Spa Session",
  "base_price": 400,
  "current_price": 380,
  "packageSpecificPrice": null,
  "currency": "SAR"
}
```

---

## When to Pass `packageId`

| Screen | Pass `packageId`? |
|--------|-------------------|
| General hotel services catalog | No |
| Services shown while viewing a package | Yes |
| Add-on selector during package booking checkout | Yes |
| Standalone service detail (not in a package context) | No |

When `packageId` is absent the APIs behave exactly as before — `packageSpecificPrice` will be `null` and only generic prices are returned.

---

## Booking Flows

No change needed in booking create / edit / stage / add-on flows. The backend automatically resolves the package-scoped price for services using the `package_id` already stored on the booking record.
