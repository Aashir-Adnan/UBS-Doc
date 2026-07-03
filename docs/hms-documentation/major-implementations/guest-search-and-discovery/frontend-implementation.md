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

All server communication uses the encrypted request/response protocol (PUBLIC_ENCRYPTED_PLATFORM).

---

## Stage 1: Search Bar & Suggestion Dropdown

### User Action

User begins typing in the search bar (e.g., "Makk", "Dar Al", "Jeddah").

### API Calls (Concurrent)

Fire both calls on every keystroke (debounced to ~300ms):

#### Call 1: Suggestions endpoint

```
GET /api/guest/search/suggestions?q={searchText}&limit=5
```

Returns two arrays: `landmarks` (locations) and `hotels`.

#### Call 2: (Optional) Full hotel list

If not already cached, also fetch the full hotel list for map use later:

```
GET /api/guest/hotels
```

This returns all hotels with coordinates. Cache this response — it rarely changes and is needed for map rendering.

### Dropdown Display

Display the suggestion dropdown with **two sections**, prioritizing locations:

```
┌─────────────────────────────────────────┐
│  Locations                              │
│  ┌────────────────────────────────────┐ │
│  │ 📍 Makkah                    city  │ │
│  │ 📍 Al-Masjid Al-Haram       site  │ │
│  └────────────────────────────────────┘ │
│                                         │
│  Hotels                                 │
│  ┌────────────────────────────────────┐ │
│  │ 🏨 Dar Al-Taqwa Hotel    Makkah  │ │
│  │ 🏨 Dar Al-Iman Hotel     Madinah │ │
│  └────────────────────────────────────┘ │
└─────────────────────────────────────────┘
```

#### Landmark Row

- Show `name` (use current locale: `name.en` or `name.ar`)
- Show `landmarkType` as a badge/label
- Icon: map pin

#### Hotel Row

- Show `name` (current locale)
- Show `city` (current locale) as secondary text
- Show `logo` image if available (fetch via attachment ID)
- Icon: hotel

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

From the suggestion response:
- `coordinates`: `{ lat, lng }` — the center point
- `suggestedRadiusKm`: default radius (e.g., 50 km for a city, 10 km for a site)

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

const selectedLocation = { lat: 21.4225, lng: 39.8262 }; // from landmark
const radiusKm = landmark.suggestedRadiusKm || DEFAULT_RADIUS_KM;

// Use the larger of suggestedRadius and 500km to ensure broad coverage
const effectiveRadius = Math.max(radiusKm, DEFAULT_RADIUS_KM);

const nearbyHotels = allHotels.filter(hotel => {
  if (!hotel.coordinates) return false;
  const dist = haversineKm(
    selectedLocation.lat, selectedLocation.lng,
    hotel.coordinates.lat, hotel.coordinates.lng
  );
  hotel._distanceKm = dist; // attach for sorting/display
  return dist <= effectiveRadius;
});

// Sort by distance (closest first)
nearbyHotels.sort((a, b) => a._distanceKm - b._distanceKm);
```

### Map Rendering

- Center the map on the landmark's `coordinates`.
- Set zoom level based on `effectiveRadius` (wider radius = more zoomed out).
- Place a **pin for each nearby hotel** on the map.
- Each pin shows:
  - Hotel name (on tap/hover)
  - Rating stars
  - Starting price (from the hotel list or fetched on demand)
- Place a **distinct marker** for the selected landmark (different color/icon).

### Hotel List Below Map

Below the map, show a scrollable card list of nearby hotels sorted by distance:

```
┌─────────────────────────────────────────┐
│  🏨 Dar Al-Taqwa Hotel     0.3 km away │
│  ★★★★½  128 reviews           from 800 SAR │
├─────────────────────────────────────────┤
│  🏨 Makkah Grand Hotel     1.2 km away │
│  ★★★★  96 reviews            from 650 SAR │
└─────────────────────────────────────────┘
```

Each card shows:
- Hotel name, logo
- Distance from selected landmark (computed via Haversine)
- Rating and review count (from `GET /api/guest/hotels` response)
- Tapping a card goes to Stage 3

### Optional: Travel Time

For visible hotels (not all), optionally fetch actual road distance/travel time using an external API:

| API | Endpoint |
|---|---|
| Google Maps Distance Matrix | `https://maps.googleapis.com/maps/api/distancematrix/json?origins=LAT,LNG&destinations=LAT,LNG&key=KEY` |
| Mapbox Directions | `https://api.mapbox.com/directions/v5/mapbox/driving/LNG1,LAT1;LNG2,LAT2?access_token=TOKEN` |
| OpenRouteService | `https://api.openrouteservice.org/v2/directions/driving-car?start=LNG1,LAT1&end=LNG2,LAT2` |

Only fetch for the ~5 closest/visible hotels to limit API calls. Display as "5 min drive" or "2.3 km by road" on the hotel card.

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
┌─────────────────────────────────────────┐
│  [Hotel Hero: logo, name, rating]       │
│  ★★★★½  128 reviews                    │
│  📍 Ibrahim Al-Khalil Road, Makkah     │
├─────────────────────────────────────────┤
│  [Filter Bar]                           │
│  Price ▼  Amenities ▼  Sort ▼          │
├─────────────────────────────────────────┤
│  Rooms & Packages                       │
│  ┌───────────────┐ ┌───────────────┐   │
│  │ Haram View    │ │ Family Suite  │   │
│  │ Room          │ │               │   │
│  │ 800 SAR/night │ │ 1500 SAR/ngt  │   │
│  └───────────────┘ └───────────────┘   │
│  ┌───────────────┐ ┌───────────────┐   │
│  │ Hajj Essential│ │ Family Hajj   │   │
│  │ Package       │ │ Package       │   │
│  │ 3500 SAR      │ │ 5000 SAR      │   │
│  └───────────────┘ └───────────────┘   │
├─────────────────────────────────────────┤
│  Other Hotels Nearby                    │
│  (see Stage 4)                          │
└─────────────────────────────────────────┘
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
┌──────────────┐ ┌──────────────┐ ┌──────────────┐
│ Makkah Grand │ │ Hilton Suites│ │ Al-Safwa     │
│ Hotel        │ │ Makkah       │ │ Tower        │
│ 1.2 km away  │ │ 3.5 km away  │ │ 5.0 km away  │
│ ★★★★ 96 rev │ │ ★★★★½ 210   │ │ ★★★★★ 50    │
└──────────────┘ └──────────────┘ └──────────────┘
```

Each card shows:
- Hotel name and logo
- Distance from selected hotel
- Rating and review count

Tapping a nearby hotel card navigates to Stage 3 for that hotel (full cycle).

---

## API Endpoint Summary

| Stage | Endpoint | Purpose | When to Call |
|---|---|---|---|
| 1 | `GET /api/guest/search/suggestions?q=...` | Search bar autocomplete | On keystroke (debounced) |
| 1 | `GET /api/guest/hotels` | Full hotel list with coordinates | Once (cache it) |
| 2 | *(no API call — use cached data)* | Filter hotels by Haversine distance | On landmark selection |
| 3 | `GET /api/guest/hotel/details?hotelId=N` | Hotel detail for header | On hotel selection |
| 3 | `GET /api/guest/search/filter?hotelId=N&include=rooms,packages` | Rooms & packages listing | On hotel selection + filter changes |
| 3 | `GET /api/filter/options/*?hotelId=N` | Filter metadata for UI | On hotel selection |
| 4 | *(no API call — use cached data)* | Filter hotels by Haversine distance | On hotel selection |
| Optional | External distance API (Google/Mapbox/ORS) | Road distance & travel time | For visible hotel cards only |

---

## Constants

| Constant | Value | Description |
|---|---|---|
| `DEFAULT_LOCATION_RADIUS_KM` | `500` | Default radius when a location/landmark is selected. Hotels beyond this are hidden from the map. |
| `NEARBY_HOTEL_RADIUS_KM` | `100` | Radius for the "Other Hotels Nearby" section when a hotel is selected. |
| `SEARCH_DEBOUNCE_MS` | `300` | Debounce delay for search bar keystrokes before firing the suggestion API call. |
| `SUGGESTION_LIMIT` | `5` | Max suggestions per category (landmarks and hotels). |
| `DEFAULT_PAGE_SIZE` | `20` | Default items per page for rooms/packages listing. |
| `MAX_PAGE_SIZE` | `100` | Maximum items per page (server-enforced). |

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
- **Cache suggestions**: Debounce and cache the last few suggestion results to avoid redundant API calls when the user is typing/backspacing.
- **Persist selected hotel**: When navigating from Stage 3 to Stage 4 and back (user taps a nearby hotel), maintain a navigation stack so the back button returns to the previous hotel.
- **Coordinate availability**: Hotels without `coordinates` (null) should be excluded from map rendering and distance calculations but can still appear in non-geographic lists.
