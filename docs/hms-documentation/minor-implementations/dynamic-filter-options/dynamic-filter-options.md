---
title: "Dynamic Filter Options"
sidebar_position: 1
---

# Dynamic Filter Options

## Overview

`GET /api/guest/filters/dynamic` returns filter option data for **only the
sections the client asks for**, in a single call. It replaces the pattern of
hitting the eight split `GET /api/filter/options/<key>` endpoints one by one.

The guest filter surface is now two endpoints:

| # | Endpoint | Use |
|---|----------|-----|
| 1 | `GET /api/guest/filter/options` | Everything, always — all filter sections in one payload. |
| 2 | `GET /api/guest/filters/dynamic?include=...` | A chosen subset of sections (or all, if `include` is omitted). |

Both are **GET** on **PUBLIC_ENCRYPTED_PLATFORM** (encrypted, no JWT).

## Query Parameters

| Parameter | Type | Required | Description |
|---|---|---|---|
| `include` | `string` | No | Comma-separated list of sections to return. Omitted or empty → every section. If provided but no token resolves to a known section → `422`. |
| `hotelId` | `string` | No | Comma-separated hotel IDs to scope counts and price bounds. |
| `displayCurrency` | `string` | No | ISO 4217 code. Adds a converted `price.displayPrice` block. |

### Section tokens

`include` accepts the canonical section name or the matching split-endpoint key:

| Canonical | Aliases accepted | Response key |
|---|---|---|
| `sort` | — | `sort` |
| `price` | `pricerange` | `price` |
| `hotelBrands` | `hotelbrands`, `brand`, `brands` | `hotelBrands` |
| `roomTypes` | `roomtypes`, `roomtype` | `roomTypes` |
| `viewTypes` | `views`, `viewtypes`, `view` | `viewTypes` |
| `amenities` | `amenity` | `amenities` |
| `minRating` | `rating`, `minrating` | `minRating` |
| `stayDuration` | `stayduration`, `stay` | `stayDuration` |

Tokens are case-insensitive. Unknown tokens are ignored as long as at least one
valid token remains.

## Response

Each returned section is **the exact same object the unified
`GET /api/guest/filter/options` returns for that key** — the endpoint calls the
same helper functions (`fetchPriceBoundsForServices` / `...Packages`,
`fetchHotelBrands`, `fetchAllRoomTypeOptions`, `fetchAllAmenityOptions`,
`fetchViewOptions`, and the `SORT_ROWS` / `STAY_DURATION_ROWS` constants) and
does not reshape their output.

### Example — `GET /api/guest/filters/dynamic?include=price,hotelBrands,roomTypes`

```json
{
  "price": {
    "param": { "min": "minPrice", "max": "maxPrice" },
    "min": 35,
    "max": 4500,
    "currency": "SAR"
  },
  "hotelBrands": {
    "param": "hotelId",
    "options": [
      { "id": 86, "key": "le-meridien-makkah", "label": { "en": "Le Meridien Makkah", "ar": "..." } }
    ]
  },
  "roomTypes": {
    "param": "roomType",
    "options": [
      { "id": 100, "key": "deluxe", "label": { "en": "Deluxe", "ar": "..." }, "count": 10 }
    ]
  }
}
```

Each option's bilingual label is a `[en, ar]` object.

### Section shapes

| Section | Shape |
|---|---|
| `sort` | `param: "sort"`, `options: [ { id, key, label, default? } ]` |
| `price` | `param: [ min, max ]` object, `min`, `max`, `currency`, optional `displayPrice` |
| `hotelBrands` | `param: "hotelId"`, `options: [ { id, key, label } ]` |
| `roomTypes` | `param: "roomType"`, `options: [ { id, key, label, count } ]` |
| `viewTypes` | `param: "viewType"`, `options: [ { id, key, label, count } ]` |
| `amenities` | `param: "amenity"`, `options: [ { id, key, label, count } ]` |
| `minRating` | `param: "minRating"`, `min: 3`, `max: 5`, `step: 0.5` |
| `stayDuration` | `param: "stayDuration"`, `options: [ { id, key, label } ]` |

> The split `GET /api/filter/options/<key>` endpoints run their output through a
> response-shape validator that drops the `count` and `default` fields and
> reorders object keys. `filters/dynamic` matches the **unified**
> `filter/options` payload instead, so it keeps `count` and `default`.

## Error Responses

```json
{
  "statusCode": 422,
  "message": "validation_failed"
}
```

Returned when `include` is supplied but resolves to zero known sections.

## Files

| File | Purpose |
|---|---|
| `Src/Apis/ProjectSpecificApis/GuestSpecificApis/GuestFiltersDynamic/GuestFiltersDynamic.js` | API object (`global.GuestFiltersDynamic_object`) |
| `Src/Apis/ProjectSpecificApis/GuestSpecificApis/GuestFiltersDynamic/CRUD_parameters.js` | Parameter schema |
| `Src/HelperFunctions/Guest/v2/guestDiscoveryData.js` | `resolveDynamicFilterSections`, `buildDynamicFilterOptions`; `buildAllFilterOptions` now delegates to the latter |
| `Services/SysScripts/TestScripts/sim/guestFiltersDynamic.js` | Sim test — subset selection, aliasing, 422, hotel scoping, parity with unified + split endpoints |

## Related

- [Filter Options (Split APIs)](/hms-documentation/guest-apis/filter-options/filter-options)
- [Guest Search & Filter](/hms-documentation/guest-apis/guest-search-filter/guest-search-filter)

## Change Log

| Date | Change |
|---|---|
| 2026-09-08 | Initial creation — `GET /api/guest/filters/dynamic`. |
