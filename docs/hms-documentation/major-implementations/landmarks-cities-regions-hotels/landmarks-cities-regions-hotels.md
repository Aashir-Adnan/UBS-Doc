# Landmarks, Cities, Regions and Hotels

This document covers the guest-facing **location hierarchy APIs** that power search, discovery, and filtering in the HMS guest app.

---

## Location Hierarchy

The HMS database models a four-level geographic hierarchy:

```
Region → Country → City → Landmark → Hotel (tenant)
```

| Level | Table | Parent FK | Example |
|---|---|---|---|
| Region | `regions` | — | Middle East |
| Country | `countries` | `region_id` | Saudi Arabia |
| City | `cities` | `country_id` | Madinah |
| Landmark | `landmarks` | `city_id` | Al-Masjid an-Nabawi |
| Hotel | `tenants` | (via `landmark_id` or location config) | Dar Al-Taqwa Hotel |

All names are bilingual (en/ar) via the `translated_entries` table.

---

## Why Separate APIs?

Each level of the hierarchy is exposed as its **own endpoint** rather than a single nested tree. The reasons are:

1. **Payload size** — A single combined endpoint would return the entire geography tree on every call. Splitting lets the client fetch only what it needs (e.g., only cities for a known country).

2. **Independent caching** — Regions and cities change rarely while landmarks may be added more often. Separate endpoints allow different cache TTLs on the client.

3. **Progressive disclosure** — The guest app UI loads regions first, then cities for the selected region, then landmarks for the selected city. Each API call maps to one user action, keeping each response fast and focused.

4. **Filter compatibility** — The search and filter pipeline (`/api/filter/options/*`) already references `cityId` and `landmarkId` individually. Matching this granularity in the listing APIs keeps the data model consistent.

5. **Referential linking** — Rather than nesting full child objects, each parent returns the **IDs** of its children (e.g., a city returns `landmarkIds`, a region returns `cityIds`). This keeps payloads flat and lets the client join locally or fetch children on demand.

---

## API Reference

### 1. List Regions

**GET** `/api/guest/regions`

Returns all active regions. Each region includes `cityIds` — the IDs of every active city reachable through the region's countries.

#### Authentication

Uses **PUBLIC_ENCRYPTED_PLATFORM** — encrypted with the platform key only, no JWT required.

#### Query Parameters

| Parameter | Type | Required | Description |
|---|---|---|---|
| `q` | `string` | No | Text search on region name, code, or Arabic translation. |

#### Response Example

```json
{
  "items": [
    {
      "id": 1,
      "name": { "en": "Middle East", "ar": "الشرق الأوسط" },
      "code": "ME",
      "cityIds": [10, 11, 12, 15, 18]
    },
    {
      "id": 2,
      "name": { "en": "South Asia", "ar": "جنوب آسيا" },
      "code": "SA",
      "cityIds": [20, 21, 22]
    }
  ]
}
```

#### How `cityIds` is resolved

The chain is `region → countries → cities`. The API joins `countries` (filtered by `region_id`) to `cities` (filtered by `country_id`) and collects all active `city_id` values.

---

### 2. List Cities

**GET** `/api/guest/cities`

Returns all active cities. Each city includes `landmarkIds` — the IDs of every active landmark in that city.

#### Authentication

Uses **PUBLIC_ENCRYPTED_PLATFORM** — encrypted with the platform key only, no JWT required.

#### Query Parameters

| Parameter | Type | Required | Description |
|---|---|---|---|
| `q` | `string` | No | Text search on city name, code, or Arabic translation. |
| `countryId` | `number` | No | Filter cities by country. |

#### Response Example

```json
{
  "items": [
    {
      "id": 10,
      "name": { "en": "Madinah", "ar": "المدينة المنورة" },
      "code": "MED",
      "countryId": 1,
      "countryName": "Saudi Arabia",
      "landmarkIds": [100, 101, 102]
    },
    {
      "id": 11,
      "name": { "en": "Makkah", "ar": "مكة المكرمة" },
      "code": "MKX",
      "countryId": 1,
      "countryName": "Saudi Arabia",
      "landmarkIds": [110, 111]
    }
  ]
}
```

---

### 3. List Landmarks

**GET** `/api/guest/landmarks`

Returns all active landmarks with coordinates and type classification.

#### Authentication

Uses **PUBLIC_ENCRYPTED_PLATFORM** — encrypted with the platform key only, no JWT required.

#### Query Parameters

| Parameter | Type | Required | Description |
|---|---|---|---|
| `q` | `string` | No | Text search on landmark name, slug, search text, or Arabic translation. |
| `cityId` | `number` | No | Filter landmarks by city. |

#### Response Example

```json
{
  "items": [
    {
      "id": 100,
      "name": { "en": "Al-Masjid an-Nabawi", "ar": "المسجد النبوي" },
      "slug": "al-masjid-an-nabawi",
      "type": "site",
      "latitude": 24.4672000,
      "longitude": 39.6112000,
      "cityId": 10,
      "countryId": 1,
      "radiusKm": 50
    }
  ]
}
```

#### Landmark Types

The `type` field is an ENUM with these values:

| Value | Meaning |
|---|---|
| `city` | City-level landmark (broad area) |
| `district` | Neighbourhood or district within a city |
| `site` | Specific point of interest (mosque, monument, etc.) |
| `airport` | Airport |
| `transit` | Train station, bus terminal, etc. |

---

## Frontend Search & Caching Strategy

### Cache on App Start

On app launch, the frontend should fetch and cache **all three datasets** plus hotels in a single burst:

```
GET /api/guest/hotels
GET /api/guest/cities
GET /api/guest/landmarks
GET /api/guest/regions       (optional — only if region picker is shown)
```

These datasets are small (tens to low hundreds of items) and change infrequently, so they can be cached for the entire session or with a long TTL (e.g. 24 hours). There is no need to re-fetch on every search interaction.

### Local Search (Search Bar)

When the user types in the search bar, **match locally against the cached data** — do not call the backend on every keystroke. The search should match across all translated fields:

| Dataset | Fields to Match |
|---|---|
| Hotels | `label.en`, `label.ar`, `city.en`, `city.ar`, `address.en`, `address.ar` |
| Cities | `name.en`, `name.ar`, `code` |
| Landmarks | `name.en`, `name.ar`, `slug` |

Display results grouped by type (e.g. "Hotels", "Cities", "Landmarks") as the user types. This gives instant, lag-free autocomplete without any network calls.

### Map Behaviour on Selection

**When a landmark is selected:**
- Centre the map on the landmark's `latitude`/`longitude`.
- Use the landmark's `radiusKm` to set the map zoom level.
- Fetch hotels filtered to the landmark's city: `GET /api/guest/hotels?cityId=<landmark.cityId>`.
- Display each hotel as a pin on the map using its `coordinates` (`lat`, `lng`).
- Tapping a hotel pin navigates to that hotel's detail/services view.

**When a city is selected:**
- Filter the cached landmarks to those matching `cityId` (each landmark has a `cityId` field).
- Display all matching landmarks as pins on the map.
- The map should auto-fit to show all landmark pins.
- Tapping a landmark pin selects it (triggers the landmark-selected flow above).

**When a hotel is selected:**
- Navigate directly to the hotel detail/services view (no map step needed).

### Typical Progressive Flow

```
1. User opens app → hotels, cities, landmarks cached
2. User types "مكة" in search bar → local match finds Makkah city + landmarks
3. User taps Makkah (city) → map shows all landmarks in Makkah as pins
4. User taps Al-Haram (landmark) → map zooms in, shows nearby hotel pins
5. User taps a hotel pin → hotel detail / service listing
```

### When to Use Server-Side Search

The `?q=` parameter on each endpoint exists as a fallback for scenarios where local search is insufficient:
- **Deep text search** — The server searches additional fields like `search_text` (which may contain transliterations, aliases, and alternate spellings not present in the cached `name` object).
- **Refreshing stale caches** — If the cache is old, a server call with `?q=` ensures up-to-date results.

In normal operation, prefer local matching for speed and use server `?q=` only when the local cache returns no results for a query the user expects to find.

---

## Source Files

| File | Purpose |
|---|---|
| `Src/Apis/ProjectSpecificApis/GuestSpecificApis/GuestRegions/GuestRegions.js` | Regions list API object |
| `Src/Apis/ProjectSpecificApis/GuestSpecificApis/GuestCities/GuestCities.js` | Cities list API object |
| `Src/Apis/ProjectSpecificApis/GuestSpecificApis/GuestLandmarks/GuestLandmarks.js` | Landmarks list API object |
