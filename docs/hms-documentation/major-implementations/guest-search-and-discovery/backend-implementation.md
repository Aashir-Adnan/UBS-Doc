---
sidebar_position: 1
title: "Backend — Search & Discovery Support"
description: "How existing CRUD endpoints, executeQueryWithPagination, and the guest search/filter API support the map-based hotel discovery flow."
---

# Backend — Search & Discovery Support

## Overview

The guest search-and-discovery flow is supported entirely by **existing infrastructure** plus one new table. No new API endpoints are needed.

- **Hotel searching**: The existing **Tenants CRUD** (`GET /api/crud/tenants`) with `executeQueryWithPagination` already supports free-text search, filtering, sorting, and pagination.
- **Landmark searching**: A new **`landmarks`** table + standard CRUD (following the same pattern as Tenants) provides the same capabilities for locations.
- **Rooms & packages for a hotel**: The existing **`GET /api/guest/search/filter`** endpoint already supports `hotelId` scoping.
- **Distance calculation**: Performed **client-side** using coordinates from the above endpoints.

The frontend fires the Tenants and Landmarks CRUD List endpoints **concurrently** to populate the search suggestion dropdown, then uses the coordinates from those responses for client-side distance filtering.

---

## 1. How `executeQueryWithPagination` Works

All standard CRUD List endpoints in the framework route through `executeQueryWithPagination` when `pagination` is configured in the API object's `requestMetaData`. This module appends filtering, sorting, and pagination clauses to the base SQL query using `req.query` parameters.

### Supported Query Parameters

| Parameter | Type | Default | Description |
|---|---|---|---|
| `page_size` | `number\|"All"` | from API config | Items per page. `"All"` disables pagination. |
| `page_no` | `number` | `1` | Page number (1-based). |
| `sort_by` | `string` | — | Column name (or mapper alias) to sort by. |
| `sort_order` | `string` | `"ASC"` | `"ASC"` or `"DESC"`. |
| `filter_columns_and` | `JSON array` | `[]` | Column names for AND filtering. |
| `filter_values_and` | `JSON array` | `[]` | Values for AND filters (URI-encoded). |
| `filter_conditions_and` | `JSON array` | `[]` | Operators per AND column (default `"LIKE"`). |
| `filter_columns_or` | `JSON array` | `[]` | Column names for OR filtering. Supports special value `"all"`. |
| `filter_values_or` | `JSON array` | `[]` | Values for OR filters (URI-encoded). |
| `filter_conditions_or` | `JSON array` | `[]` | Operators per OR column (default `"="`). |

### Filter Value Types

Values in `filter_values_and` / `filter_values_or` can be:

| Value Shape | SQL Generated | Example |
|---|---|---|
| `"text"` (string) | `column LIKE '%text%'` (AND default) or `column = 'text'` (OR default) | `"Makkah"` |
| `["a","b","c"]` (array) | `column IN ('a','b','c')` | `["hotel","branch"]` |
| `{"min":10,"max":100}` (range) | `column BETWEEN 10 AND 100` | `{"min":0,"max":50}` |
| `{"min":10}` (open range) | `column >= 10` | `{"min":21}` |

### Special `"all"` Filter

When `filter_columns_or` includes `"all"`, the module searches across **every column** in every table referenced in the query's top-level FROM/JOIN. This is how full-text search works:

```
?filter_columns_or=["all"]&filter_values_or=["Makkah"]
```

This generates `OR table.column1 LIKE '%Makkah%' OR table.column2 LIKE '%Makkah%' ...` for every column in every joined table.

### How It Integrates

The `queryResolver` middleware checks `apiConfig.features.pagination` (set via `requestMetaData.pagination` in the API object). When enabled, it calls `executeQueryWithPagination(req, query, ...)` instead of `executeQuery(query, ...)`, which appends the filter/sort/pagination clauses to the base List SQL before execution.

---

## 2. Existing: Tenants CRUD (Hotel Search)

### Endpoint

```
GET /api/crud/tenants
```

This is the existing admin CRUD for tenants. Its List query selects all tenant columns including `tenant_name`, `city`, `country`, `latitude`, `longitude`, `tenant_logo`, `tenant_slug`, and has `pagination: { pageSize: 10 }` enabled — so all `executeQueryWithPagination` filter/sort/pagination keys are available.

### How the Frontend Searches Hotels

To search hotels by name (for the suggestion dropdown):

```
GET /api/crud/tenants
  ?filter_columns_or=["all"]
  &filter_values_or=["Dar Al"]
  &filter_columns_and=["tenants.tenant_type","tenants.status","tenants.is_active"]
  &filter_values_and=[["hotel","branch"],"active","1"]
  &page_size=5
```

This searches all columns for "Dar Al" while AND-filtering to only active hotel/branch tenants, returning at most 5 results.

### Response Fields Available

The Tenants List query already returns (among others):

| Field | Column Alias | Description |
|---|---|---|
| Hotel name | `tenants_tenantName` | Resolved via `translated_entries` for the requested `language_code` |
| City | `tenants_city` | City name |
| Country | `tenants_country` | Country name |
| Latitude | `tenants_latitude` | DECIMAL(10,7) — used for map pins |
| Longitude | `tenants_longitude` | DECIMAL(10,7) — used for map pins |
| Logo | `tenants_tenantLogo` | Attachment ID |
| Slug | `tenants_tenantSlug` | URL-safe identifier |
| Status | `tenants_status` | `active` / `inactive` |

---

## 3. New Table: `landmarks`

### Purpose

Stores searchable locations (cities, holy sites, districts, airports) that guests can use as starting points for hotel discovery.

### Schema

```sql
CREATE TABLE landmarks (
  landmark_id     BIGINT AUTO_INCREMENT PRIMARY KEY,
  landmark_name   VARCHAR(255)    NOT NULL COMMENT 'English name (Arabic via translated_entries)',
  landmark_slug   VARCHAR(100)    NOT NULL UNIQUE,
  landmark_type   ENUM('city', 'district', 'site', 'airport', 'transit')
                                  NOT NULL DEFAULT 'city',
  latitude        DECIMAL(10,7)   NOT NULL,
  longitude       DECIMAL(10,7)   NOT NULL,
  country         VARCHAR(100)    DEFAULT 'Saudi Arabia',
  region          VARCHAR(100)    DEFAULT NULL,
  radius_km       INT             DEFAULT 50 COMMENT 'Suggested search radius for this landmark',
  sort_order      INT             DEFAULT 0,
  status          VARCHAR(20)     DEFAULT 'active',
  created_by      INT             DEFAULT NULL,
  updated_by      INT             DEFAULT NULL,
  created_at      TIMESTAMP       DEFAULT CURRENT_TIMESTAMP,
  updated_at      TIMESTAMP       DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);
```

### Arabic Translations

Bilingual names use the existing `translated_entries` table (same pattern as tenants):

```
table_name   = 'landmarks'
column_name  = 'landmark_name'
record_id    = landmark_id
```

### CRUD API

A standard CRUD API object is created following the same pattern as Tenants:

```
Src/Apis/GeneratedApis/Default/Landmarks/Crud_Objects/
  Landmarks.js
  CRUD_parameters.js
```

The API object must set `pagination: { pageSize: 10 }` in `requestMetaData` to enable `executeQueryWithPagination`. The List query should select all landmark columns with `COUNT(*) OVER () AS table_count`.

### How the Frontend Searches Landmarks

```
GET /api/crud/landmarks
  ?filter_columns_or=["all"]
  &filter_values_or=["Makk"]
  &filter_columns_and=["landmarks.status"]
  &filter_values_and=["active"]
  &sort_by=sort_order
  &sort_order=ASC
  &page_size=5
```

This searches all columns for "Makk", filters to active landmarks, and returns at most 5 results sorted by `sort_order`.

### Seed Data

| landmark_name | landmark_type | latitude | longitude | radius_km |
|---|---|---|---|---|
| Makkah | city | 21.4225 | 39.8262 | 50 |
| Madinah | city | 24.4672 | 39.6112 | 50 |
| Al-Masjid Al-Haram | site | 21.4225 | 39.8262 | 10 |
| Al-Masjid An-Nabawi | site | 24.4672 | 39.6112 | 10 |
| Mina | site | 21.4133 | 39.8933 | 15 |
| Arafat | site | 21.3547 | 39.9842 | 20 |
| Muzdalifah | site | 21.3886 | 39.9264 | 15 |
| Jeddah | city | 21.5433 | 39.1728 | 80 |
| King Abdulaziz International Airport | airport | 21.6796 | 39.1565 | 30 |

---

## 4. Existing: `GET /api/guest/hotels`

### No Changes Needed

This endpoint already returns all hotels with coordinates for map pins:

```json
{
  "id": 56,
  "key": "dar-al-taqwa-hotel",
  "label": { "en": "Dar Al-Taqwa Hotel", "ar": "فندق دار التقوى" },
  "city": { "en": "Makkah", "ar": "مكة المكرمة" },
  "images": ["581"],
  "rating": 4.5,
  "reviewCount": 128,
  "coordinates": { "lat": 21.4225, "lng": 39.8262 }
}
```

Source: `guestDiscoveryData.js` → `listGuestHotels()` reads `tenants.latitude` and `tenants.longitude` (DECIMAL(10,7)).

---

## 5. Existing: `GET /api/guest/search/filter`

### No Changes Needed

Already supports `hotelId` scoping for rooms and packages within a hotel:

```
GET /api/guest/search/filter?hotelId=56&include=rooms,packages&pageSize=20
```

Supports CSV hotel IDs for multi-hotel queries:

```
GET /api/guest/search/filter?hotelId=56,57,58&include=rooms,packages
```

See the full [Guest Search & Filter documentation](../../guest-apis/guest-search-filter/guest-search-filter.md) for all parameters.

---

## 6. Existing: `GET /api/guest/hotel/details`

### No Changes Needed

Returns full hotel detail when user selects a hotel:

```
GET /api/guest/hotel/details?hotelId=56
```

Includes name, logo, contact, location with coordinates, currency, rating, review count. See [Guest Hotel Details documentation](../../guest-apis/guest-hotel-details/guest-hotel-details.md).

---

## 7. Distance Calculation

Distance between coordinates is **not computed by the backend**. The frontend handles this client-side.

### Why Client-Side?

- The frontend already has both coordinate sets (from CRUD responses + guest hotels list).
- Avoids adding external API cost/dependency to the backend.
- External APIs provide road/travel distance — more useful than DB-computed straight-line.

### Recommended External Distance APIs

| API | Type | Free Tier | Notes |
|---|---|---|---|
| **Haversine formula (in-app)** | Great-circle (straight-line) | Unlimited (pure math) | No API call needed. Sufficient for radius filtering. |
| **Google Maps Distance Matrix API** | Road/travel distance | 10,000 elements/month free | Most accurate. Returns driving/walking distance and duration. |
| **Mapbox Directions API** | Road distance | 100,000 requests/month free | Good alternative to Google. |
| **OpenRouteService** | Road distance | 2,000 requests/day free | Open-source. Self-hostable. |
| **HERE Routing API** | Road distance | 250,000 transactions/month free | Good Saudi Arabia coverage. |
| **OSRM (Open Source Routing Machine)** | Road distance | Unlimited (self-hosted) | Free, uses OpenStreetMap data. |

### Recommended Approach

Use **Haversine** for radius filtering (no API call), optionally add Google/Mapbox for road-distance display on visible hotels only.

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

## 8. Summary

### New Table

| Table | Purpose |
|---|---|
| `landmarks` | Searchable locations with coordinates and suggested radius |

### New CRUD

| Endpoint | Purpose |
|---|---|
| `GET /api/crud/landmarks` | Standard CRUD with `executeQueryWithPagination` for landmark search |

### Existing APIs (No Changes)

| Endpoint | Role in This Flow |
|---|---|
| `GET /api/crud/tenants` | Hotel search via `executeQueryWithPagination` filter keys |
| `GET /api/guest/hotels` | Full hotel list with coordinates for map pins |
| `GET /api/guest/hotel/details?hotelId=N` | Hotel detail on pin tap |
| `GET /api/guest/search/filter?hotelId=N&include=rooms,packages` | Rooms and packages for selected hotel |
| `GET /api/filter/options/*` | Filter metadata (price range, amenities, etc.) |

### Migration

```
data/migrations_completed/YYYYMMDD_1_create_landmarks_table.sql
```

### Coordinate Precision Fix

The `tenants.latitude` and `tenants.longitude` columns were originally `DECIMAL(10,0)` (zero decimal places, truncating coordinates). This has been fixed to `DECIMAL(10,7)` via migration `20260703_1_fix_tenant_coordinate_precision.sql`. The `landmarks` table uses `DECIMAL(10,7)` from the start.
