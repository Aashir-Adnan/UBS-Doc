---
sidebar_position: 2
title: "Frontend — Search & Discovery Flow"
description: "Frontend implementation spec for the guest search bar, suggestion dropdown, map-based hotel discovery, and nearby-hotel browsing."
---

# Frontend — Search & Discovery Flow

## Overview

This document specifies the frontend implementation for the guest search-and-discovery experience. The flow has four stages:

1. **Search bar** — User types in a search bar. A suggestion dropdown shows matching locations and hotels.
2. **Map view (location selected)** — When a location is selected, a map displays hotel pins within a 500 km radius.
3. **Hotel detail (hotel selected)** — When a hotel is selected, the app shows that hotel's rooms and packages.
4. **Nearby hotels** — Below the selected hotel's listings, an "Other Hotels Nearby" section shows hotels within 100 km.

No custom search endpoints are needed. The frontend uses the existing **Tenants CRUD** and future **Landmarks CRUD** (both powered by `executeQueryWithPagination`) to search, plus the existing guest APIs for hotel details, rooms, and packages.

---

## Stage 1: Search Bar & Suggestion Dropdown

### User Action

User begins typing in the search bar (e.g., "Makk", "Dar Al", "Jeddah").

### API Calls (Concurrent)

Fire **two CRUD List calls concurrently** on every keystroke (debounced to ~300ms), plus cache the guest hotels list:

#### Call 1: Search landmarks

```
GET /api/guest/crud/landmarks
  ?filter_columns_or=["all"]
  &filter_values_or=["{searchText}"]
  &filter_columns_and=["landmarks.status"]
  &filter_values_and=["active"]
  &sort_by=sort_order
  &sort_order=ASC
  &page_size=5
```

The `filter_columns_or=["all"]` tells `executeQueryWithPagination` to search across **all columns** in the landmarks table using `LIKE '%searchText%'`. The AND filter restricts to active landmarks.

#### Call 2: Search hotels (tenants)

```
GET /api/guest/crud/tenants
  ?filter_columns_or=["all"]
  &filter_values_or=["{searchText}"]
  &filter_columns_and=["tenants.tenant_type","tenants.status","tenants.is_active"]
  &filter_values_and=[["hotel","branch"],"active","1"]
  &page_size=5
```

The `["hotel","branch"]` array value generates an `IN ('hotel','branch')` clause. Combined with the `"all"` OR filter, this searches all tenant columns for the text while restricting to active hotel/branch tenants.

#### Call 3: (Once, cached) Full hotel list for map

```
GET /api/guest/hotels
```

Returns all hotels with coordinates. Cache this response — it rarely changes and is needed for map rendering and distance calculations later.

### Dropdown Display

Display the suggestion dropdown with **two sections**, prioritizing locations first:

```
+-------------------------------------------+
|  Locations                                |
|  +--------------------------------------+ |
|  | pin  Makkah                    city  | |
|  | pin  Al-Masjid Al-Haram       site  | |
|  +--------------------------------------+ |
|                                           |
|  Hotels                                   |
|  +--------------------------------------+ |
|  | hotel  Dar Al-Taqwa Hotel    Makkah  | |
|  | hotel  Dar Al-Iman Hotel     Madinah | |
|  +--------------------------------------+ |
+-------------------------------------------+
```

#### Landmark Row Fields (from CRUD response)

| CRUD Field | Display |
|---|---|
| `landmarks_landmarkName` | Primary text (name) |
| `landmarks_landmarkType` | Badge: "city", "site", "airport", etc. |
| `landmarks_latitude` / `landmarks_longitude` | Stored for map use on selection |
| `landmarks_radiusKm` | Stored for radius filtering on selection |

#### Hotel Row Fields (from CRUD response)

| CRUD Field | Display |
|---|---|
| `tenants_tenantName` | Primary text (name) |
| `tenants_city` | Secondary text |
| `tenants_tenantLogo` | Logo image (attachment ID) |
| `tenants_latitude` / `tenants_longitude` | Stored for map use on selection |
| `tenants_tenantId` | Used as `hotelId` for subsequent API calls |

### Selection Behavior

| Selection | Next Stage |
|---|---|
| User selects a **landmark** | Go to Stage 2 (Map View) with landmark coordinates as center |
| User selects a **hotel** | Go to Stage 3 (Hotel Detail) with hotel ID; also show map centered on hotel |

---

## Stage 2: Map View (Location Selected)

### Trigger

User selected a landmark from the suggestion dropdown (e.g., "Makkah").

### Data Available

From the landmarks CRUD response:
- `landmarks_latitude` / `landmarks_longitude` — the center point
- `landmarks_radiusKm` — suggested radius (e.g., 50 km for a city, 10 km for a site)

From the cached hotel list (`GET /api/guest/hotels`):
- All hotels with their `coordinates`

### Distance Calculation (Client-Side)

Use the **Haversine formula** to compute the straight-line distance from the selected landmark to each hotel:

```javascript
function haversineKm(lat1, lng1, lat2, lng2) {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 +
            Math.cos(lat1 * Math.PI / 180) *
            Math.cos(lat2 * Math.PI / 180) *
            Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}
```

#### Filtering Logic

```javascript
const DEFAULT_RADIUS_KM = 500;

const selectedLocation = {
  lat: Number(landmark.landmarks_latitude),
  lng: Number(landmark.landmarks_longitude),
};
const suggestedRadius = Number(landmark.landmarks_radiusKm) || DEFAULT_RADIUS_KM;
const effectiveRadius = Math.max(suggestedRadius, DEFAULT_RADIUS_KM);

const nearbyHotels = allHotels.filter(hotel => {
  if (!hotel.coordinates) return false;
  const dist = haversineKm(
    selectedLocation.lat, selectedLocation.lng,
    hotel.coordinates.lat, hotel.coordinates.lng
  );
  hotel._distanceKm = dist; // attach for sorting/display
  return dist <= effectiveRadius;
});

nearbyHotels.sort((a, b) => a._distanceKm - b._distanceKm);
```

### Map Rendering

- Center the map on the landmark's coordinates.
- Set zoom level based on `effectiveRadius` (wider radius = more zoomed out).
- Place a **pin for each nearby hotel** on the map.
- Each pin shows: hotel name (on tap/hover), rating stars, starting price.
- Place a **distinct marker** for the selected landmark (different color/icon).

### Hotel List Below Map

Below the map, show a scrollable card list of nearby hotels sorted by distance:

```
+-------------------------------------------+
|  hotel  Dar Al-Taqwa Hotel     0.3 km away|
|  rating: 4.5  128 reviews     from 800 SAR|
+-------------------------------------------+
|  hotel  Makkah Grand Hotel     1.2 km away|
|  rating: 4.0  96 reviews      from 650 SAR|
+-------------------------------------------+
```

Each card shows:
- Hotel name, logo (from cached `GET /api/guest/hotels` response)
- Distance from selected landmark (computed via Haversine)
- Rating and review count
- Tapping a card goes to Stage 3

### Optional: Travel Time

For the closest ~5 visible hotels, optionally fetch actual road distance/travel time using an external API:

| API | Endpoint |
|---|---|
| Google Maps Distance Matrix | `GET https://maps.googleapis.com/maps/api/distancematrix/json?origins=LAT,LNG&destinations=LAT,LNG&key=KEY` |
| Mapbox Directions | `GET https://api.mapbox.com/directions/v5/mapbox/driving/LNG1,LAT1;LNG2,LAT2?access_token=TOKEN` |
| OpenRouteService | `GET https://api.openrouteservice.org/v2/directions/driving-car?start=LNG1,LAT1&end=LNG2,LAT2` |

Only fetch for visible hotels to limit API calls. Display as "5 min drive" or "2.3 km by road" on the hotel card.

---

## Stage 3: Hotel Selected — Rooms & Packages

### Trigger

User selected a hotel — either from the suggestion dropdown (Stage 1) or from the map/list (Stage 2).

### API Calls

#### Call 1: Hotel details

```
GET /api/guest/hotel/details?hotelId={hotelId}
```

Returns full hotel information: name, logo, contact, address, coordinates, currency, rating, review count.

#### Call 2: Rooms and packages for this hotel

```
GET /api/guest/search/filter?hotelId={hotelId}&include=rooms,packages&pageSize=20&sort=recommended
```

Returns paginated rooms and packages. Each item includes:
- `name`, `description` (bilingual)
- `base_price`, `current_price`, `currency`
- `images` (attachment IDs)
- `duration`, `amenities`, `tags`
- `type`: `"Service"` or `"Package"`

#### Call 3: Filter options for this hotel

```
GET /api/filter/options/pricerange?hotelId={hotelId}
GET /api/filter/options/amenities?hotelId={hotelId}
GET /api/filter/options/roomtypes?hotelId={hotelId}
GET /api/filter/options/views?hotelId={hotelId}
```

Fetch filter metadata scoped to this hotel so the filter UI shows relevant options.

### Display Layout

```
+-------------------------------------------+
|  [Hotel Hero: logo, name, rating]         |
|  rating: 4.5  128 reviews                |
|  pin  Ibrahim Al-Khalil Road, Makkah     |
+-------------------------------------------+
|  [Filter Bar]                             |
|  Price v  Amenities v  Sort v            |
+-------------------------------------------+
|  Rooms & Packages                         |
|  +-----------------+ +-----------------+ |
|  | Haram View Room | | Family Suite    | |
|  | 800 SAR/night   | | 1500 SAR/night  | |
|  +-----------------+ +-----------------+ |
|  +-----------------+ +-----------------+ |
|  | Hajj Essential  | | Family Hajj     | |
|  | Package 3500 SAR| | Package 5000 SAR| |
|  +-----------------+ +-----------------+ |
+-------------------------------------------+
|  Other Hotels Nearby                      |
|  (see Stage 4)                            |
+-------------------------------------------+
```

### Filtering & Sorting

When the user applies filters, re-fetch with the appropriate query parameters:

```
GET /api/guest/search/filter
  ?hotelId=56
  &include=rooms,packages
  &minPrice=500
  &maxPrice=2000
  &amenity=wifi,pool
  &sort=priceAsc
  &page=1
  &pageSize=20
```

All filter parameters are documented in the [Guest Search & Filter API docs](../../guest-apis/guest-search-filter/guest-search-filter.md).

### Pagination

Use the `pagination` object in the response to implement infinite scroll or page buttons:

```json
{
  "pagination": {
    "page": 1,
    "pageSize": 20,
    "totalItems": 45,
    "totalPages": 3
  }
}
```

Load next page:

```
GET /api/guest/search/filter?hotelId=56&include=rooms,packages&page=2&pageSize=20
```

---

## Stage 4: Other Hotels Nearby

### Trigger

Displayed as a section below the selected hotel's rooms and packages.

### Distance Calculation (Client-Side)

Use the selected hotel's `coordinates` (from `GET /api/guest/hotel/details`) and the cached hotel list (from `GET /api/guest/hotels`):

```javascript
const NEARBY_RADIUS_KM = 100;

const selectedHotel = hotelDetails.location.coordinates;
const nearbyHotels = allHotels
  .filter(h => h.id !== selectedHotelId && h.coordinates != null)
  .map(h => ({
    ...h,
    _distanceKm: haversineKm(
      selectedHotel.lat, selectedHotel.lng,
      h.coordinates.lat, h.coordinates.lng
    )
  }))
  .filter(h => h._distanceKm <= NEARBY_RADIUS_KM)
  .sort((a, b) => a._distanceKm - b._distanceKm);
```

### Display

Show a horizontal scrollable card list:

```
Other Hotels Nearby
+--------------+ +--------------+ +--------------+
| Makkah Grand | | Hilton Suites| | Al-Safwa     |
| Hotel        | | Makkah       | | Tower        |
| 1.2 km away  | | 3.5 km away  | | 5.0 km away  |
| 4.0  96 rev  | | 4.5  210 rev | | 5.0  50 rev  |
+--------------+ +--------------+ +--------------+
```

Tapping a nearby hotel card navigates to Stage 3 for that hotel (full cycle).

---

## API Endpoint Summary

| Stage | Endpoint | Purpose | When to Call |
|---|---|---|---|
| 1 | `GET /api/guest/crud/landmarks?filter_columns_or=["all"]&filter_values_or=["..."]&page_size=5` | Search landmarks by name | On keystroke (debounced) |
| 1 | `GET /api/guest/crud/tenants?filter_columns_or=["all"]&filter_values_or=["..."]&page_size=5` | Search hotels by name | On keystroke (debounced, concurrent with landmarks) |
| 1 | `GET /api/guest/hotels` | Full hotel list with coordinates | Once (cache it) |
| 2 | *(no API call — use cached data)* | Filter hotels by Haversine distance | On landmark selection |
| 3 | `GET /api/guest/hotel/details?hotelId=N` | Hotel detail for header | On hotel selection |
| 3 | `GET /api/guest/search/filter?hotelId=N&include=rooms,packages` | Rooms & packages listing | On hotel selection + filter changes |
| 3 | `GET /api/filter/options/*?hotelId=N` | Filter metadata for UI | On hotel selection |
| 4 | *(no API call — use cached data)* | Filter hotels by Haversine distance | On hotel selection |
| Optional | External distance API (Google/Mapbox/ORS) | Road distance & travel time | For visible hotel cards only |

---

## `executeQueryWithPagination` Quick Reference

Both the Tenants and Landmarks CRUD endpoints use `executeQueryWithPagination`. The key query parameters for search:

| Parameter | Value for Search | Effect |
|---|---|---|
| `filter_columns_or` | `["all"]` | Search across ALL columns in the table |
| `filter_values_or` | `["search text"]` | The text to match (LIKE %text%) |
| `filter_columns_and` | `["column1","column2"]` | AND conditions (e.g., status filter) |
| `filter_values_and` | `["value1",["a","b"]]` | Values — arrays become IN clauses |
| `sort_by` | `"column_name"` | Column to sort by |
| `sort_order` | `"ASC"` or `"DESC"` | Sort direction |
| `page_size` | `5` | Limit results |
| `page_no` | `1` | Page number |

---

## Constants

| Constant | Value | Description |
|---|---|---|
| `DEFAULT_LOCATION_RADIUS_KM` | `500` | Default radius when a location/landmark is selected. Hotels beyond this are hidden from the map. |
| `NEARBY_HOTEL_RADIUS_KM` | `100` | Radius for the "Other Hotels Nearby" section when a hotel is selected. |
| `SEARCH_DEBOUNCE_MS` | `300` | Debounce delay for search bar keystrokes before firing the CRUD search calls. |
| `SUGGESTION_LIMIT` | `5` | `page_size` value for landmark and hotel search results. |
| `DEFAULT_PAGE_SIZE` | `20` | Default items per page for rooms/packages listing. |
| `MAX_PAGE_SIZE` | `100` | Maximum items per page (server-enforced by search/filter). |

---

## External Distance APIs Reference

For optional road-distance display on hotel cards:

| API | Free Tier | Request Format |
|---|---|---|
| **Haversine (in-app math)** | Unlimited | No API call — pure math, ~5 lines |
| **Google Maps Distance Matrix** | 10,000 elements/month | `GET https://maps.googleapis.com/maps/api/distancematrix/json?origins=LAT,LNG&destinations=LAT,LNG\|LAT,LNG&key=KEY` |
| **Mapbox Directions** | 100,000 req/month | `GET https://api.mapbox.com/directions/v5/mapbox/driving/LNG1,LAT1;LNG2,LAT2?access_token=TOKEN` |
| **OpenRouteService** | 2,000 req/day | `GET https://api.openrouteservice.org/v2/directions/driving-car?start=LNG,LAT&end=LNG,LAT` |
| **HERE Routing** | 250,000 tx/month | `GET https://router.hereapi.com/v8/routes?origin=LAT,LNG&destination=LAT,LNG&transportMode=car&apiKey=KEY` |
| **OSRM (self-hosted)** | Unlimited | `GET https://your-server/route/v1/driving/LNG1,LAT1;LNG2,LAT2?overview=false` |

**Recommendation**: Use Haversine for radius filtering (always). Optionally add Google Maps or Mapbox for travel-time display on the closest ~5 hotels.

---

## State Management Notes

- **Cache the hotel list**: `GET /api/guest/hotels` should be called once and cached. It contains all hotels with coordinates needed for both map rendering and "nearby" calculations.
- **Cache suggestions**: Debounce and cache the last few search results to avoid redundant API calls when the user is typing/backspacing.
- **Persist selected hotel**: When navigating from Stage 3 to Stage 4 and back (user taps a nearby hotel), maintain a navigation stack so the back button returns to the previous hotel.
- **Coordinate availability**: Hotels without `coordinates` (null) should be excluded from map rendering and distance calculations but can still appear in non-geographic lists.
