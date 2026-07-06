---
sidebar_position: 2
title: "Split Filter Options & Pricing Pipeline"
description: "Architecture of the split filter options APIs, the centralized pricing pipeline, and how price bounds are computed with pricing rules."
---

# Split Filter Options & Pricing Pipeline

## Context

The HMS guest-facing search and filter system needed two improvements:

1. **Split filter endpoints** — Instead of one monolithic `GET /api/guest/filterOptions` that returns all filter metadata in a single payload, the client can now fetch each filter category independently via `GET /api/filter/options/<key>`. A keys endpoint lists all available categories.

2. **Pricing-rule-aware price bounds** — The price range filter must reflect actual guest-facing prices (after tenant pricing rules are applied), not raw catalog prices. This required integrating the centralized pricing pipeline into the price bounds calculation.

---

## Architecture

### Filter Options Split

Each filter category is served by its own API endpoint. All use `PUBLIC_ENCRYPTED_PLATFORM` (no JWT required).

```
GET /api/filter/options/keys          → ["pricerange","views","sort","hotelbrands",
                                         "roomtypes","amenities","rating","stayduration"]

GET /api/filter/options/pricerange    → { param, min, max, currency }
GET /api/filter/options/views         → { param, options: [...] }
GET /api/filter/options/sort          → { param, options: [...] }
GET /api/filter/options/hotelbrands   → { param, options: [...] }
GET /api/filter/options/roomtypes     → { param, options: [...] }
GET /api/filter/options/amenities     → { param, options: [...] }
GET /api/filter/options/rating        → { param, min, max, step }
GET /api/filter/options/stayduration  → { param, options: [...] }
```

The unified `GET /api/guest/filterOptions` endpoint remains available for clients that prefer a single call.

### URL → Global Object Resolution

The HMS dynamic router converts each URL path to PascalCase:

```
/api/filter/options/pricerange → FilterOptionsPricerange_object
/api/filter/options/keys       → FilterOptionsKeys_object
```

Each API object is auto-loaded from `Src/Apis/ProjectSpecificApis/GuestSpecificApis/FilterOptions<Key>/`.

---

## Centralized Pricing Pipeline

### Overview

All prices in HMS flow through a single module: `Src/HelperFunctions/Guest/v2/catalogPricing.js`.

```
catalog_pricing table          pricing_rules table
       │                              │
       ▼                              ▼
  getCatalogPrices()          fetchRulesForTenant()
       │                              │
       └──────────┬───────────────────┘
                  ▼
           applyRulesSync(basePrice, rules)
                  │
                  ▼
             currentPrice
```

### Tables Involved

**`catalog_pricing`** — One row per service/package with a base price:
- `base_table` — `'services'` or `'packages'`
- `record_id` — The service_id or package_id
- `price` — Base price in the tenant's currency
- `currency_id` — FK to currencies table
- `customer_segment` — `'regular'` (default) or `NULL`
- `valid_from` / `valid_to` — Optional date window for seasonal pricing
- `status` — Must be `'active'`

**`pricing_rules`** — Per-tenant rules that modify base prices:
- `tenant_id` — Which hotel this rule applies to
- `delta` — `'+'` (surcharge) or `'-'` (discount)
- `type` — `'percentage'` or `'flat'`
- `value` — The numeric amount
- `rule_type` — `'dynamic'`, `'seasonal'`, etc. (excludes `'base'` and `'tax'`)
- `condition` — Optional JSON `{ from, to }` date window
- `status` — Must be `'active'`

### Rule Application Order

Rules are applied in a fixed order to the base price:

1. **+percentage** — All percentage surcharges (applied to original base price)
2. **+flat** — All flat surcharges
3. **-percentage** — All percentage discounts (applied to original base price)
4. **-flat** — All flat discounts

Result is floored to 0 and rounded to 2 decimal places.

### Condition Filtering

Before applying, rules are filtered by their `condition` JSON:
- If `condition` is null or has no `from`/`to` → always active
- If `condition.from` exists → rule only active when `NOW() >= from`
- If `condition.to` exists → rule only active when `NOW() <= to`

---

## Price Bounds Computation

### Before (Raw Catalog Prices)

Previously, `fetchPriceBoundsForServices` and `fetchPriceBoundsForPackages` used SQL `MIN(cp.price)` / `MAX(cp.price)` directly from `catalog_pricing`. This returned raw base prices without tenant pricing rules.

### After (Rules-Aware Prices)

The updated functions:

1. **Fetch** all active catalog prices with their `tenant_id` (respecting `valid_from`/`valid_to`, `customer_segment`, `status`)
2. **Fetch pricing rules** per tenant (deduplicated — each tenant's rules fetched once)
3. **Apply rules** to each base price via `applyRulesSync(basePrice, rules)`
4. **Compute** min/max from the resulting `currentPrice` values

```javascript
// Simplified flow
async function computePriceBoundsWithRules(rows) {
  // 1. Get unique tenant IDs from the price rows
  const tenantIds = [...new Set(rows.map(r => r.tenant_id))];

  // 2. Fetch rules per tenant (parallel, deduplicated)
  const rulesMap = new Map();
  await Promise.all(tenantIds.map(async tid => {
    rulesMap.set(tid, await fetchRulesForTenant(tid));
  }));

  // 3. Apply rules to each base price, track min/max
  let min = Infinity, max = -Infinity;
  for (const r of rows) {
    const currentPrice = applyRulesSync(Number(r.price), rulesMap.get(r.tenant_id) || []);
    if (currentPrice < min) min = currentPrice;
    if (currentPrice > max) max = currentPrice;
  }

  return { min, max, currency };
}
```

### Catalog Pricing Conditions Respected

The SQL query already filters by:
- `cp.status = 'active'`
- `cp.customer_segment = 'regular' OR NULL`
- `cp.valid_from IS NULL OR cp.valid_from <= NOW()`
- `cp.valid_to IS NULL OR cp.valid_to >= NOW()`

This means expired or future-only prices are excluded before rule application.

---

## View Types Filter

### Data Source

View types are sourced from `amenities_tags` in `hms_config` where `group.key = "views"`. Each room service stores its view type as an amenity tag:

```json
{
  "key": "haram-view",
  "icon": "mosque",
  "label": { "en": "Haram View", "ar": "إطلالة على الحرم" },
  "group": { "key": "views", "en": "Views", "ar": "الإطلالات" }
}
```

### How It Works

1. Query `hms_config` rows with `config_key = 'amenities_tags'` and `config_value LIKE '%"views"%'` (pre-filter for performance)
2. Parse each row's JSON and verify `group.key === "views"` in JS
3. Deduplicate by view key, count distinct service IDs per view
4. Return sorted by count descending

This produces contextual results like "Haram View", "City View", "Panoramic View" instead of generic placeholders.

---

## Hotel Details API

A companion endpoint was added to fetch full details for a single hotel:

```
GET /api/guest/hotel/details?hotelId=56
```

Returns: name (bilingual), slug, logo, contact (email, phone), location (address, city, state, country, postal code, coordinates), currency, rating, and review count.

Uses `PUBLIC_ENCRYPTED_PLATFORM`. Returns 422 if `hotelId` is missing, 404 if not found or inactive.

---

## Seed Script Fix

The standalone seed script (`Services/SysScripts/seedTenant.js`) was writing `base_price` to `hms_config` but not creating corresponding `catalog_pricing` rows. Since the pricing module reads exclusively from `catalog_pricing`, newly seeded tenants had blank prices.

**Fix**: Added `INSERT INTO catalog_pricing` for both services and packages after each record creation in the seed script, using the same price and currency.

---

## File Reference

| File | Purpose |
|---|---|
| `Src/HelperFunctions/Guest/v2/catalogPricing.js` | Centralized pricing: `getCatalogPrices`, `applyRulesSync`, `fetchRulesForTenant`, `resolvePrices` |
| `Src/HelperFunctions/Guest/v2/guestDiscoveryData.js` | Filter data fetchers: `fetchPriceBoundsForServices`, `fetchPriceBoundsForPackages`, `fetchViewOptions`, `fetchAllRoomTypeOptions`, `fetchAllAmenityOptions`, `fetchHotelBrands`, `buildAllFilterOptions` |
| `Src/Apis/ProjectSpecificApis/GuestSpecificApis/FilterOptions*/` | Individual filter option API objects (9 endpoints) |
| `Src/Apis/ProjectSpecificApis/GuestSpecificApis/GuestHotelDetails/` | Hotel details API object |
| `Src/Apis/ProjectSpecificApis/GuestSpecificApis/GuestFilterOptions/` | Original unified filter options endpoint (unchanged) |
| `Services/SysScripts/seedTenant.js` | Tenant seed script (fixed to include `catalog_pricing` inserts) |

---

## Change Log

| Date | Change |
|---|---|
| 2026-07-02 | Initial implementation — split filter endpoints, pricing-rule-aware bounds, views from amenities_tags, hotel details API, seed script fix |
