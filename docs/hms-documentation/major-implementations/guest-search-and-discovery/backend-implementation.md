---
sidebar_position: 1
title: "Backend — Search & Discovery APIs"
description: "Backend implementation spec for guest search bar suggestions, landmarks table, hotel geolocation, and supporting the map-based discovery flow."
---

# Backend — Search & Discovery APIs

## Overview

This document specifies the backend work required to support the guest search-and-discovery flow: a search bar that suggests both **locations/landmarks** and **hotels**, a map view showing nearby hotels, and drill-down into a hotel's rooms and packages.

The backend provides:

1. A new `landmarks` table for searchable locations (cities, holy sites, districts).
2. A new `GET /api/guest/search/suggestions` endpoint that searches both landmarks and hotels concurrently.
3. The existing `GET /api/guest/hotels` endpoint enhanced with `lat`/`lng` exposure (already present).
4. The existing `GET /api/guest/search/filter` endpoint for rooms/packages within a hotel.

Distance calculation between coordinates is performed **client-side** using an external API — the backend does not compute distances.

---

## 1. New Table: `landmarks`

### Purpose

Stores searchable locations that guests can use as starting points for hotel discovery. Examples: "Makkah", "Madinah", "Al-Masjid Al-Haram", "Mina", "Arafat".

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
  created_at      TIMESTAMP       DEFAULT CURRENT_TIMESTAMP,
  updated_at      TIMESTAMP       DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);
```

### Arabic Translations

Landmark names are bilingual. Arabic translations are stored in the existing `translated_entries` table:

```
table_name   = 'landmarks'
column_name  = 'landmark_name'
record_id    = landmark_id
```

### Seed Data

The seed script (`seedTenant.js`) and/or a standalone migration should insert the core landmarks:

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

## 2. New Endpoint: `GET /api/guest/search/suggestions`

### Purpose

Powers the search bar autocomplete dropdown. Returns matching **landmarks** and **hotels** as two separate arrays so the frontend can prioritize displaying locations first.

### Authentication

**PUBLIC_ENCRYPTED_PLATFORM** — encrypted request/response, no guest JWT required.

### Query Parameters

| Parameter | Type | Required | Default | Description |
|---|---|---|---|---|
| `q` | `string` | Yes | — | Search text (minimum 1 character). Matched via `LIKE '%q%'` against names. |
| `limit` | `number` | No | `5` | Max results per category (landmarks and hotels each return up to this many). |

### Implementation

The endpoint handler runs two queries **concurrently** and returns both result sets:

#### Query 1: Landmarks

```sql
SELECT l.landmark_id, l.landmark_name, l.landmark_slug,
       l.landmark_type, l.latitude, l.longitude, l.radius_km
  FROM landmarks l
 WHERE l.status = 'active'
   AND l.landmark_name LIKE CONCAT('%', ?, '%')
 ORDER BY l.sort_order ASC, l.landmark_name ASC
 LIMIT ?
```

Arabic translations are fetched from `translated_entries` (same pattern as tenant names) and merged into bilingual `{ en, ar }` objects.

#### Query 2: Hotels (tenants)

```sql
SELECT t.tenant_id, t.tenant_name, t.tenant_slug,
       t.city, t.country, t.latitude, t.longitude, t.tenant_logo
  FROM tenants t
 WHERE t.status = 'active' AND t.is_active = 1
   AND t.tenant_type IN ('hotel', 'branch')
   AND t.tenant_name LIKE CONCAT('%', ?, '%')
 ORDER BY t.tenant_name ASC
 LIMIT ?
```

Arabic translations for `tenant_name` and `city` are fetched from `translated_entries`.

### Response Shape

```json
{
  "landmarks": [
    {
      "id": 1,
      "type": "landmark",
      "name": { "en": "Makkah", "ar": "مكة المكرمة" },
      "landmarkType": "city",
      "coordinates": { "lat": 21.4225, "lng": 39.8262 },
      "suggestedRadiusKm": 50
    }
  ],
  "hotels": [
    {
      "id": 56,
      "type": "hotel",
      "name": { "en": "Dar Al-Taqwa Hotel", "ar": "فندق دار التقوى" },
      "slug": "dar-al-taqwa-hotel",
      "city": { "en": "Makkah", "ar": "مكة المكرمة" },
      "coordinates": { "lat": 21.4225, "lng": 39.8262 },
      "logo": "581"
    }
  ]
}
```

### Response Fields

#### Landmark Object

| Field | Type | Description |
|---|---|---|
| `id` | `number` | Landmark ID. |
| `type` | `string` | Always `"landmark"`. Helps frontend distinguish from hotels. |
| `name` | `object` | Bilingual name `{ en, ar }`. |
| `landmarkType` | `string` | One of: `city`, `district`, `site`, `airport`, `transit`. |
| `coordinates` | `object` | `{ lat, lng }`. |
| `suggestedRadiusKm` | `number` | Default radius for "nearby hotels" search around this landmark. |

#### Hotel Object

| Field | Type | Description |
|---|---|---|
| `id` | `number` | Tenant/hotel ID. |
| `type` | `string` | Always `"hotel"`. |
| `name` | `object` | Bilingual name `{ en, ar }`. |
| `slug` | `string` | URL-safe slug. |
| `city` | `object` | Bilingual city `{ en, ar }`. |
| `coordinates` | `object` | `{ lat, lng }` or `null`. |
| `logo` | `string\|null` | Attachment ID for the hotel logo. |

### API Object Registration

Create a new directory and API object:

```
Src/Apis/ProjectSpecificApis/GuestSpecificApis/
  GuestSearchSuggestions/
    GuestSearchSuggestions.js
    CRUD_parameters.js
```

The API object uses `PUBLIC_ENCRYPTED_PLATFORM`, `GET` method, no permissions. The `preProcessList` function runs both queries and returns the combined response.

### `executeQueryWithPagination` Support

The `landmarks` table queries use the standard `executeQuery` helper (not `executeQueryWithPagination`) since the response is a small suggestion list (max 5+5 items). The pagination module is not needed here.

For the **existing** endpoints that already support `executeQueryWithPagination`, the supported filter/sort keys remain:

| Key | Module | Description |
|---|---|---|
| `filter_columns_and` | Pagination | Array of column names for AND filtering |
| `filter_values_and` | Pagination | Array of values (supports arrays for IN, range objects for BETWEEN) |
| `filter_columns_or` | Pagination | Array of column names for OR filtering (supports `"all"` for full-text) |
| `filter_values_or` | Pagination | Array of values for OR filtering |
| `filter_conditions_and` | Pagination | Operators per AND column (default `LIKE`) |
| `filter_conditions_or` | Pagination | Operators per OR column (default `=`) |
| `sort_by` | Pagination | Column name to sort by |
| `sort_order` | Pagination | `ASC` or `DESC` |
| `page_size` | Pagination | Items per page (or `"All"`) |
| `page_no` | Pagination | Page number (1-based) |

---

## 3. Existing Endpoint: `GET /api/guest/hotels`

### Current Behavior (No Changes Needed)

This endpoint already returns all the data the frontend needs for map pins:

```json
[
  {
    "id": 56,
    "key": "dar-al-taqwa-hotel",
    "label": { "en": "Dar Al-Taqwa Hotel", "ar": "فندق دار التقوى" },
    "city": { "en": "Makkah", "ar": "مكة المكرمة" },
    "country": { "en": "Saudi Arabia", "ar": "المملكة العربية السعودية" },
    "address": { "en": "Ibrahim Al-Khalil Road", "ar": "طريق إبراهيم الخليل" },
    "images": ["581"],
    "rating": 4.5,
    "reviewCount": 128,
    "coordinates": { "lat": 21.4225, "lng": 39.8262 }
  }
]
```

Each hotel object includes `coordinates` with `lat` and `lng`. The frontend uses these coordinates with an external distance API to filter hotels within a radius.

### Source

- Handler: `Src/HelperFunctions/Guest/v2/guestDiscoveryData.js` → `listGuestHotels()`
- Reads from `tenants` table: `latitude`, `longitude` columns (DECIMAL(10,7))
- Coordinates are only included when both `latitude` and `longitude` are non-null and finite numbers.

---

## 4. Existing Endpoint: `GET /api/guest/search/filter`

### Current Behavior (No Changes Needed)

This endpoint already supports the `hotelId` parameter to scope results to a specific hotel:

```
GET /api/guest/search/filter?hotelId=56&include=rooms,packages&pageSize=20
```

This returns rooms and packages for hotel 56 with pagination. The frontend uses this when a user selects a hotel from the map.

For the "Other Hotels Nearby" section, the frontend can pass multiple hotel IDs:

```
GET /api/guest/search/filter?hotelId=56,57,58&include=rooms,packages&pageSize=10
```

### Supported Parameters (Relevant to This Flow)

| Parameter | Usage in This Flow |
|---|---|
| `hotelId` | CSV of hotel IDs — scope to selected hotel or nearby hotels |
| `include` | `rooms,packages` — show both rooms and packages |
| `q` | Free-text search within results |
| `minPrice` / `maxPrice` | Price range filter |
| `sort` | `recommended`, `priceAsc`, `priceDesc`, `highestRated`, `newest` |
| `checkIn` / `checkOut` | Availability date filter |
| `adults` / `children` | Capacity filter |
| `page` / `pageSize` | Pagination |

See the full [Guest Search & Filter documentation](../../guest-apis/guest-search-filter/guest-search-filter.md) for all parameters.

---

## 5. Existing Endpoint: `GET /api/guest/hotel/details`

### Current Behavior (No Changes Needed)

When a user taps a hotel pin on the map, the frontend can fetch full details:

```
GET /api/guest/hotel/details?hotelId=56
```

Returns name, logo, contact, location with coordinates, currency, rating, and review count. See the full [Guest Hotel Details documentation](../../guest-apis/guest-hotel-details/guest-hotel-details.md).

---

## 6. Distance Calculation

Distance between two geographic coordinates is **not computed by the backend**. The frontend uses an external API to calculate distances client-side.

### Why Client-Side?

- The backend would need to compute distances for every hotel on every request, which is expensive.
- The frontend already has both coordinate sets (landmark/hotel origin + all hotel coordinates from `GET /api/guest/hotels`).
- External APIs provide accurate road/travel distance, not just straight-line — more useful for guests.
- Client-side computation avoids adding an external API dependency (and cost) to the backend.

### Recommended External Distance APIs

| API | Type | Free Tier | Notes |
|---|---|---|---|
| **Haversine formula (in-app)** | Great-circle (straight-line) | Unlimited (pure math) | No API call needed. ~5 lines of code. Sufficient for radius filtering. Not road distance. |
| **Google Maps Distance Matrix API** | Road/travel distance | 10,000 elements/month free | Most accurate. Returns driving/walking distance and duration. Requires API key. |
| **Mapbox Directions API** | Road distance | 100,000 requests/month free | Good alternative to Google. Returns route geometry + distance. |
| **OpenRouteService** | Road distance | 2,000 requests/day free | Open-source. Self-hostable. Good for Hajj-season traffic estimates. |
| **HERE Routing API** | Road distance | 250,000 transactions/month free | Enterprise-grade. Good coverage in Saudi Arabia. |
| **OSRM (Open Source Routing Machine)** | Road distance | Unlimited (self-hosted) | Free, self-hosted. Uses OpenStreetMap data. No API key needed if self-hosted. |

### Recommended Approach

For **radius filtering** (is hotel within X km?), use the **Haversine formula** directly in the app — no API call needed:

```javascript
function haversineKm(lat1, lng1, lat2, lng2) {
  const R = 6371; // Earth radius in km
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a = Math.sin(dLat/2) ** 2 +
            Math.cos(lat1 * Math.PI / 180) *
            Math.cos(lat2 * Math.PI / 180) *
            Math.sin(dLng/2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}
```

For **displaying travel time** on hotel cards, optionally call Google Maps Distance Matrix or Mapbox for the visible hotels only (not all hotels — just the ones already filtered by Haversine).

---

## 7. Data Requirements Summary

### New Table

| Table | Purpose |
|---|---|
| `landmarks` | Searchable locations (cities, holy sites, districts, airports) |

### New API

| Endpoint | Purpose |
|---|---|
| `GET /api/guest/search/suggestions?q=...` | Search bar autocomplete — returns landmarks + hotels |

### Existing APIs (No Changes)

| Endpoint | Purpose in This Flow |
|---|---|
| `GET /api/guest/hotels` | Full hotel list with coordinates for map pins |
| `GET /api/guest/hotel/details?hotelId=N` | Hotel detail when user taps a pin |
| `GET /api/guest/search/filter?hotelId=N&include=rooms,packages` | Rooms and packages for selected hotel |
| `GET /api/filter/options/*` | Filter metadata (price range, amenities, etc.) |

### Seed Script Updates

The `seedTenant.js` script should be updated to:

1. Insert seed landmarks (Makkah, Madinah, holy sites, Jeddah, airport).
2. Ensure all seeded tenants have `latitude` and `longitude` populated (already done for Dar Al-Taqwa: 21.4225, 39.8262).

### Migration

A new migration file should create the `landmarks` table and seed the initial rows:

```
data/migrations_completed/YYYYMMDD_1_create_landmarks_table.sql
```
