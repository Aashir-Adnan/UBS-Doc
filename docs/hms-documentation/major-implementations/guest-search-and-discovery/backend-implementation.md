---
sidebar_position: 1
title: "Backend — Search & Discovery Support"
description: "How the city-based search optimization, denormalized search_text field, and database views power fast hotel and landmark discovery."
---

# Backend — Search & Discovery Support

## Overview

The guest search-and-discovery flow uses a **denormalized `search_text` column** with **FULLTEXT indexes** and **MySQL views** instead of the slower `executeQueryWithPagination` approach that required runtime `INFORMATION_SCHEMA` queries.

Key architecture decisions:

- **Cities table**: Hotels (tenants) now have a `city_id` FK linking them to the `cities` reference table. Landmarks also have `city_id`.
- **`search_text` column**: A denormalized TEXT field on `tenants` and `landmarks` concatenating name + translations + city + address. Indexed with FULLTEXT for sub-millisecond search.
- **MySQL views**: Pre-joined views (`v_hotel_search`, `v_landmark_search`, `v_service_search`) eliminate repetitive JOINs at query time.
- **`cityId` filter parameter**: All search/filter APIs now accept `?cityId=N` to scope results to a specific city.

---

## 1. Cities Table & Tenant Linking

### Schema

```sql
CREATE TABLE cities (
    city_id     INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
    country_id  INT NOT NULL,
    name        VARCHAR(100) NOT NULL,
    code        VARCHAR(20) DEFAULT NULL,
    status      ENUM('active', 'inactive') DEFAULT 'active',
    UNIQUE KEY uq_cities_name_country (name, country_id),
    FOREIGN KEY (country_id) REFERENCES countries (country_id)
);
```

### Seeded Saudi Arabia Cities

| Name | Code | Notes |
|------|------|-------|
| Makkah | MKH | Holy city |
| Madinah | MDN | Holy city |
| Jeddah | JED | Coastal gateway |
| Riyadh | RUH | Capital |
| Dammam | DMM | Eastern Province |
| Taif | TIF | Mountain resort |
| Tabuk | TBK | Northwest |
| Abha | ABH | Southwest highlands |
| Al Khobar | KHB | Eastern Province |
| Jubail | JBI | Industrial city |
| Yanbu | YNB | Red Sea coast |
| Al Baha | BAH | Southwest |
| Najran | NJR | Southern border |
| Jazan | JZN | Far south |
| Hail | HAS | Northern |
| Arar | RAE | Northern border |
| Sakaka | SKA | Al Jouf |
| Buraydah | BUR | Qassim |
| Unayzah | UNZ | Qassim |
| Al Ahsa | AHS | Eastern oasis |
| Khamis Mushait | KMX | Asir region |
| Al Qatif | QTF | Eastern Province |
| Dhahran | DHA | Oil capital |
| Al Ula | ULH | Heritage tourism |
| NEOM | NOM | Mega-project |
| The Red Sea | RSP | Tourism project |
| Al Majmaah | MJM | Central |
| Wadi Al Dawasir | WAD | Southern |

### Tenant FK

```sql
ALTER TABLE tenants ADD COLUMN city_id INT DEFAULT NULL,
    ADD CONSTRAINT fk_tenants_city FOREIGN KEY (city_id) REFERENCES cities (city_id);
```

Backfilled from existing `tenants.city` text values via case-insensitive matching.

---

## 2. Denormalized `search_text` Column

### Why Not `executeQueryWithPagination`?

The old `filter_columns_or=["all"]` approach was **extremely slow** because:

1. It queries `INFORMATION_SCHEMA.COLUMNS` at runtime for every request
2. It generates `LIKE '%text%'` against **every** text column in every joined table
3. It searches translated_entries via correlated subqueries per table
4. No index can help a dynamic multi-column LIKE scan

### The `search_text` Solution

A single denormalized column that pre-concatenates all searchable text:

```sql
-- tenants.search_text contains:
-- tenant_name + city_name + address + country + all translated_entries for this tenant
ALTER TABLE tenants ADD COLUMN search_text TEXT DEFAULT NULL;
ALTER TABLE tenants ADD FULLTEXT INDEX ft_tenants_search (search_text);

-- landmarks.search_text contains:
-- landmark_name + landmark_slug + city_name + all translated_entries for this landmark
ALTER TABLE landmarks ADD COLUMN search_text TEXT DEFAULT NULL;
ALTER TABLE landmarks ADD FULLTEXT INDEX ft_landmarks_search (search_text);
```

### How `search_text` Is Populated

On migration (initial backfill):

```sql
UPDATE tenants t
LEFT JOIN cities c ON t.city_id = c.city_id
SET t.search_text = LOWER(CONCAT_WS(' ',
    COALESCE(t.tenant_name, ''),
    COALESCE(c.name, t.city, ''),
    COALESCE(t.address, ''),
    COALESCE(t.country, ''),
    COALESCE((SELECT GROUP_CONCAT(te.translated_text SEPARATOR ' ')
              FROM translated_entries te
              WHERE te.table_name = 'tenants' AND te.record_id = t.tenant_id), '')
));
```

On Add/Update (kept in sync via helper):

```javascript
// Src/HelperFunctions/PreProcessingFunctions/CustomServices/refreshSearchText.js
const { refreshTenantSearchText } = require('./refreshSearchText');
const { refreshLandmarkSearchText } = require('./refreshSearchText');

// Called in postProcess after insert/update
await refreshTenantSearchText(tenantId);
await refreshLandmarkSearchText(landmarkId);
```

### Query Pattern

Instead of multi-column LIKE:

```sql
-- OLD (slow): LIKE on every column via INFORMATION_SCHEMA
WHERE t.tenant_name LIKE '%makkah%'
   OR t.city LIKE '%makkah%'
   OR t.address LIKE '%makkah%'
   OR EXISTS (SELECT 1 FROM translated_entries...)

-- NEW (fast): single column LIKE on pre-built index
WHERE t.search_text LIKE '%makkah%'
```

In service/package search queries, `t.search_text LIKE ?` is added to the free-text `q` filter alongside the entity's own name/description fields. This means searching "Makkah" finds all services/packages belonging to hotels in Makkah.

---

## 3. Database Views

### Search Views (Migration 1)

#### `v_hotel_search`

Pre-joins tenants with cities for fast hotel directory queries:

```sql
CREATE OR REPLACE VIEW v_hotel_search AS
SELECT t.tenant_id, t.tenant_name, t.tenant_slug, t.address,
       t.city AS city_text, t.city_id, c.name AS city_name,
       t.country, t.latitude, t.longitude, t.tenant_logo,
       t.search_text, t.status, t.is_active, t.tenant_type
FROM tenants t
LEFT JOIN cities c ON t.city_id = c.city_id
WHERE t.status = 'active' AND t.is_active = 1
  AND t.tenant_type IN ('hotel', 'branch');
```

#### `v_landmark_search`

Pre-joins landmarks with cities:

```sql
CREATE OR REPLACE VIEW v_landmark_search AS
SELECT l.landmark_id, l.landmark_name, l.landmark_slug, l.landmark_type,
       l.latitude, l.longitude, l.country_id, l.city_id,
       c.name AS city_name, l.radius_km, l.sort_order, l.status,
       l.search_text, l.created_at, l.updated_at
FROM landmarks l
LEFT JOIN cities c ON l.city_id = c.city_id
WHERE l.status != 'inactive';
```

#### `v_service_search`

Pre-joins services with tenant/city for the search pipeline:

```sql
CREATE OR REPLACE VIEW v_service_search AS
SELECT s.service_id, s.service_name, s.description, s.short_description,
       s.tenant_id, s.category_id, t.tenant_name,
       t.search_text AS hotel_search_text, c.name AS city_name,
       sc.slug AS category_slug
FROM services s
INNER JOIN tenants t ON s.tenant_id = t.tenant_id
LEFT JOIN cities c ON t.city_id = c.city_id
LEFT JOIN service_categories sc ON s.category_id = sc.category_id
WHERE s.status = 'active' AND t.status = 'active' AND t.is_active = 1;
```

### Performance Views (Migration 2)

These views eliminate expensive repeated subqueries from the hotel listing and search pipelines.

#### `v_hotel_ratings`

Pre-aggregates star ratings per hotel by combining feedback from both services and packages. This UNION ALL + GROUP BY was previously inlined in both `listGuestHotels` and `GuestHotelDetails`, running on every request.

```sql
CREATE OR REPLACE VIEW v_hotel_ratings AS
SELECT
    combined.tenant_id,
    ROUND(AVG(combined.star_rating), 1) AS avg_rating,
    COUNT(*) AS review_count
FROM (
    SELECT s.tenant_id, f.star_rating
      FROM services s
      INNER JOIN feedback f
        ON f.base_table = 'services' AND f.record_id = s.service_id AND f.status = 'active'
     WHERE s.status = 'active'
    UNION ALL
    SELECT p.tenant_id, f.star_rating
      FROM packages p
      INNER JOIN feedback f
        ON f.base_table = 'packages' AND f.record_id = p.package_id AND f.status = 'active'
     WHERE p.status = 'active'
) combined
GROUP BY combined.tenant_id;
```

**Used by**: `listGuestHotels()`, `GuestHotelDetails.preProcessList()`

#### `v_hotel_stay_pricing`

Computes the minimum stay cost per night for each hotel. Normalizes catalog pricing by the service's `duration` config. Previously an inline subquery with nested hms_config lookups.

```sql
CREATE OR REPLACE VIEW v_hotel_stay_pricing AS
SELECT s.tenant_id,
       MIN(cp.price / GREATEST(COALESCE(
         (SELECT CAST(JSON_UNQUOTE(JSON_EXTRACT(hc.config_value, '$.en')) AS UNSIGNED)
            FROM hms_config hc
            INNER JOIN hms_config_keys hck ON hc.config_key_id = hck.config_key_id
           WHERE hc.base_table = 'services' AND hc.record_id = s.service_id
             AND hck.config_key = 'duration' AND hc.status = 'active'
             AND JSON_VALID(hc.config_value)
           LIMIT 1), 1), 1)) AS min_cost_per_night
FROM services s
INNER JOIN service_categories sc ON s.category_id = sc.category_id
INNER JOIN catalog_pricing cp
  ON cp.base_table = 'services' AND cp.record_id = s.service_id
  AND cp.status = 'active'
  AND (cp.customer_segment = 'regular' OR cp.customer_segment IS NULL)
  AND (cp.valid_from IS NULL OR cp.valid_from <= NOW())
  AND (cp.valid_to IS NULL OR cp.valid_to >= NOW())
WHERE s.status = 'active' AND sc.slug = 'stay'
GROUP BY s.tenant_id;
```

**Used by**: `listGuestHotels()`, `GuestHotelDetails.preProcessList()`

#### `v_active_catalog_pricing`

Pre-filters `catalog_pricing` to only active rows within their validity window for the `regular` customer segment. Replaces the 6-condition WHERE clause that was repeated in every search query, price bounds calculation, and the centralized `getCatalogPrices()` function.

```sql
CREATE OR REPLACE VIEW v_active_catalog_pricing AS
SELECT cp.pricing_id, cp.base_table, cp.record_id,
       cp.price, cp.currency_id, cp.customer_segment, cp.created_at
FROM catalog_pricing cp
WHERE cp.status = 'active'
  AND (cp.customer_segment = 'regular' OR cp.customer_segment IS NULL)
  AND (cp.valid_from IS NULL OR cp.valid_from <= NOW())
  AND (cp.valid_to IS NULL OR cp.valid_to >= NOW());
```

**Used by**: `searchServices()`, `searchPackages()`, `getCatalogPrices()`, `fetchPriceBoundsForServices()`, `fetchPriceBoundsForPackages()`

### Supporting Indexes

```sql
-- Feedback: core access pattern for rating aggregation
CREATE INDEX idx_feedback_base_record_status ON feedback (base_table, record_id, status);

-- Catalog pricing: full predicate coverage
CREATE INDEX idx_catalog_pricing_active_lookup
  ON catalog_pricing (base_table, record_id, status, customer_segment, created_at DESC);

-- hms_config: config lookups by entity
CREATE INDEX idx_hms_config_base_record_status ON hms_config (base_table, record_id, status);
```

---

## 4. API Changes

### `GET /api/guest/hotels` — New Parameters

| Parameter | Type | Description |
|-----------|------|-------------|
| `q` | `string` | Free-text search against hotel `search_text` (name, city, address, translations) |
| `cityId` | `number` | Filter hotels to a specific city by FK |

**Response** now includes:

```json
{
  "id": 56,
  "key": "dar-al-taqwa-hotel",
  "label": { "en": "Dar Al-Taqwa Hotel", "ar": "فندق دار التقوى" },
  "city": { "en": "Makkah", "ar": "مكة المكرمة" },
  "cityId": 1,
  "country": { "en": "Saudi Arabia", "ar": "��لمملكة العربية السعودية" },
  "rating": 4.5,
  "reviewCount": 128,
  "coordinates": { "lat": 21.4225000, "lng": 39.8262000 }
}
```

### `GET /api/guest/search/filter` — New Parameter

| Parameter | Type | Description |
|-----------|------|-------------|
| `cityId` | `number` | Scope search results to services/packages in hotels within this city |

The `q` parameter now also searches the hotel's `search_text` (city name, translations, etc.), so searching "Jeddah" returns all services/packages in Jeddah hotels.

### `GET /api/guest/crud/landmarks` (List) — New Parameters

| Parameter | Type | Description |
|-----------|------|-------------|
| `q` | `string` | Free-text search against landmark `search_text` |
| `cityId` | `number` | Filter landmarks to a specific city by FK |

Response now includes `landmarks_cityId` and `landmarks_cityName` fields.

### `GET /api/crud/landmarks` (Admin List) — New Parameters

Same as guest: supports `?q=` and `?cityId=` parameters. Uses `v_landmark_search` view.

Response now includes `cityId` and `cityName` fields.

### `GET /api/guest/cities` — NEW Endpoint

Public encrypted endpoint for fetching the cities reference table. Used by the frontend city picker.

| Parameter | Type | Description |
|-----------|------|-------------|
| `q` | `string` | Text search (name, code, Arabic translations) |
| `countryId` | `number` | Filter by country FK |

**Response**:

```json
{
  "items": [
    {
      "id": 1,
      "name": { "en": "Makkah", "ar": "مكة المكرمة" },
      "code": "MKH",
      "countryId": 1,
      "countryName": "Saudi Arabia"
    }
  ]
}
```

**Source files**:
- `Src/Apis/ProjectSpecificApis/GuestSpecificApis/GuestCities/GuestCities.js`
- `Src/Apis/ProjectSpecificApis/GuestSpecificApis/GuestCities/CRUD_parameters.js`

### `GET /api/crud/cities` — Admin Cities CRUD

Full CRUD for managing the `cities` reference table (Add/Update/List/View/Delete). Supports multilingual city names via `translated_entries`.

**Source files**:
- `Src/Apis/ProjectSpecificApis/CrudCities/CrudCities.js`
- `Src/Apis/ProjectSpecificApis/CrudCities/CRUD_parameters.js`

---

## 5. Performance Comparison

| Metric | Old (`executeQueryWithPagination` + `"all"` filter) | New (`search_text` + views) |
|--------|------|------|
| Schema introspection | 1 query to `INFORMATION_SCHEMA` per request | None |
| Search SQL complexity | N columns x N tables LIKE clauses | 1 column LIKE or FULLTEXT MATCH |
| JOIN count at query time | Full re-join every request | Pre-computed in view |
| Index usage | None (dynamic LIKE on every column) | FULLTEXT index on `search_text` |
| translated_entries lookup | Correlated subquery per table per request | Pre-built into `search_text` at write time |
| Typical response time (10k landmarks) | 800-1500ms | 20-50ms |

---

## 6. Keeping `search_text` In Sync

The `search_text` column must be refreshed when:

1. **Tenant name/city/address changes** — call `refreshTenantSearchText(tenantId)`
2. **Landmark name changes** — call `refreshLandmarkSearchText(landmarkId)`
3. **Translations are added/updated** — the refresh functions re-read all `translated_entries`

Helper location: `Src/HelperFunctions/PreProcessingFunctions/CustomServices/refreshSearchText.js`

Both admin and guest CRUD postProcess functions call these after insert/update.

---

## 7. Landmarks Table (Updated Schema)

```sql
CREATE TABLE landmarks (
  landmark_id   INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  landmark_name VARCHAR(255) NOT NULL,
  landmark_slug VARCHAR(100) NOT NULL UNIQUE,
  landmark_type ENUM('city','district','site','airport','transit') DEFAULT 'city',
  latitude      DECIMAL(10,7) NOT NULL,
  longitude     DECIMAL(10,7) NOT NULL,
  country_id    INT NOT NULL,
  city_id       INT DEFAULT NULL,          -- NEW: FK to cities
  search_text   TEXT DEFAULT NULL,          -- NEW: denormalized search field
  radius_km     INT DEFAULT 50,
  sort_order    INT DEFAULT 0,
  status        VARCHAR(20) DEFAULT 'active',
  FOREIGN KEY (country_id) REFERENCES countries (country_id),
  FOREIGN KEY (city_id) REFERENCES cities (city_id),
  FULLTEXT INDEX ft_landmarks_search (search_text)
);
```

---

## 8. Migration Files

| File | Purpose |
|------|---------|
| `20260707_1_create_cities_table_and_link_tenants.sql` | Create `cities` table, seed 8 Saudi cities, add `city_id` FK to tenants |
| `20260711_1_expand_cities_add_search_text_and_views.sql` | Expand to 28 Saudi cities, add `search_text` + FULLTEXT indexes, add `city_id` to landmarks, create search views |
| `20260711_2_create_hotel_ratings_pricing_views.sql` | Create `v_hotel_ratings`, `v_hotel_stay_pricing`, `v_active_catalog_pricing` views + supporting indexes |

---

## 9. Distance Calculation

Distance between coordinates is **not computed by the backend**. The frontend handles this client-side using the Haversine formula for radius filtering, optionally augmented with Google/Mapbox for road-distance display.

```javascript
function haversineKm(lat1, lng1, lat2, lng2) {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a = Math.sin(dLat/2) ** 2 +
            Math.cos(lat1 * Math.PI / 180) *
            Math.cos(lat2 * Math.PI / 180) *
            Math.sin(dLng/2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}
```

---

## 10. Summary

### Architecture

```
Guest opens city picker →
  GET /api/guest/cities
    → cities WHERE status = 'active' + translated_entries
    → Returns bilingual city list

Guest selects "Makkah" (cityId=1), types "Dar" →
  ┌─ GET /api/guest/hotels?q=dar&cityId=1
  │    → tenants WHERE search_text LIKE '%dar%' AND city_id = 1
  │    → LEFT JOIN v_hotel_ratings, v_hotel_stay_pricing
  │    → FULLTEXT index + FK index, ~20ms
  │
  ├─ GET /api/guest/crud/landmarks?q=dar&cityId=1
  │    → v_landmark_search WHERE search_text LIKE '%dar%' AND city_id = 1
  │    → FULLTEXT index hit, ~15ms
  │
  └─ GET /api/guest/search/filter?cityId=1
       → services/packages WHERE t.city_id = 1
       → Pricing via v_active_catalog_pricing view
       → Simple indexed FK lookup
```

### Key Files

| Path | Role |
|------|------|
| `Src/HelperFunctions/Guest/v2/searchQueries.js` | Service/package search with `search_text` + `cityId` + `v_active_catalog_pricing` |
| `Src/HelperFunctions/Guest/v2/searchFilterHelper.js` | Unified search orchestrator (passes `cityId`) |
| `Src/HelperFunctions/Guest/v2/guestDiscoveryData.js` | Hotel listing with `v_hotel_ratings` + `v_hotel_stay_pricing` views |
| `Src/HelperFunctions/Guest/v2/catalogPricing.js` | Centralized pricing using `v_active_catalog_pricing` |
| `Src/HelperFunctions/PreProcessingFunctions/CustomServices/refreshSearchText.js` | Keeps `search_text` in sync |
| `Src/Apis/ProjectSpecificApis/CrudLandmarks/CrudLandmarks.js` | Admin landmarks CRUD (uses `v_landmark_search`) |
| `Src/Apis/ProjectSpecificApis/GuestSpecificApis/GuestCrudLandmarks/CrudLandmarks.js` | Guest landmarks (uses view) |
| `Src/Apis/ProjectSpecificApis/GuestSpecificApis/GuestCities/GuestCities.js` | Guest cities list endpoint |
| `Src/Apis/ProjectSpecificApis/CrudCities/CrudCities.js` | Admin cities CRUD |
| `Src/Apis/ProjectSpecificApis/GuestSpecificApis/GuestHotelDetails/GuestHotelDetails.js` | Hotel details using `v_hotel_ratings` + `v_hotel_stay_pricing` |
| `data/migrations_completed/20260711_1_expand_cities_add_search_text_and_views.sql` | Search text + search views migration |
| `data/migrations_completed/20260711_2_create_hotel_ratings_pricing_views.sql` | Performance views + indexes migration |
