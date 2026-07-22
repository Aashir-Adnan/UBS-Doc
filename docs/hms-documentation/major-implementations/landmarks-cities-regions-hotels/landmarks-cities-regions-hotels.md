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
| `q` | `string` | No | Text search on landmark name, slug, or search text. |
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

## Typical Client Flow

```
1. GET /api/guest/regions          → user picks a region
2. GET /api/guest/cities?countryId=1  → show cities for that region's country
   (or use the cityIds from step 1 to filter locally)
3. GET /api/guest/landmarks?cityId=10 → show landmarks near that city
4. GET /api/guest/hotels?landmarkId=100 → show hotels near that landmark
```

Each step is a separate, lightweight call that returns only the data the user needs at that point in the flow.

---

## Source Files

| File | Purpose |
|---|---|
| `Src/Apis/ProjectSpecificApis/GuestSpecificApis/GuestRegions/GuestRegions.js` | Regions list API object |
| `Src/Apis/ProjectSpecificApis/GuestSpecificApis/GuestCities/GuestCities.js` | Cities list API object |
| `Src/Apis/ProjectSpecificApis/GuestSpecificApis/GuestLandmarks/GuestLandmarks.js` | Landmarks list API object |
