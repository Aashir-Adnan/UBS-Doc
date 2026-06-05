# Guest Scheduler

**GET** `/api/guest/scheduler`

Returns the full scheduling tree for the guest booking UI: schedulable service categories, the locations that offer services in each category, the services available at each location (the "options"), and the time slots for each service across a date range. Excludes non-schedulable categories (`stay`, `amenities`, `networking`, `room-service`).

This is the primary endpoint powering the **Schedule now / Reschedule** flow for booking add-ons. The guest makes a two-step selection: (1) pick a service at a location, then (2) pick a date and time slot.

---

## Authentication

Uses **AUTH_PLATFORM** — requires a valid guest JWT (`accessToken`). The guest's identity is resolved via `ensureGuestUrdd`.

---

## Request Payload

| Field | Type | Required | Description |
|---|---|---|---|
| `from` | `string` | No | Start of date range (YYYY-MM-DD). Defaults to today. |
| `to` | `string` | No | End of date range (YYYY-MM-DD, inclusive). Defaults to `from + 6 days`. Maximum range: 14 days. |
| `categoryId` | `number` | No | Filter to a single service category. If omitted, all schedulable categories are returned. |

### Example: Week-long range

```json
{
  "from": "2026-07-01",
  "to": "2026-07-07"
}
```

### Example: Single day

```json
{
  "from": "2026-07-02",
  "to": "2026-07-02"
}
```

### Example: Single category with date range

```json
{
  "from": "2026-07-01",
  "to": "2026-07-03",
  "categoryId": 5
}
```

---

## Behavior

1. Resolves the guest's `urdd_id` from the JWT via `ensureGuestUrdd`.
2. Validates and expands the date range (`from` to `to`, inclusive). If `to` is omitted, defaults to `from + 6 days`. Maximum range is 14 days.
3. Fetches all active service categories, excluding non-schedulable categories (`stay`, `amenities`, `networking`, `room-service`). Stay is booked through the room/package flow; amenities are non-schedulable add-ons. Deduplicates by slug.
4. If `categoryId` is provided, filters to that single category.
5. For each category, finds all active services in that category and joins through `service_locations` → `locations` to build the location tree. Only services linked to at least one active location appear.
6. For each service, computes time slot availability **for every date in the range** using `computeServiceAvailability`, which:
   - Queries `unit_availability` windows for the service's delivery units and locations.
   - Breaks windows into discrete slots based on `slot_duration_min`.
   - Checks for conflicts against `booking_items` and `booking_service_slots`.
   - Applies booking gates: `advance_booking_min_days`, `advance_booking_max_days`, `blackout_dates`, `lead_time_hours`, `cutoff_time`.
   - Applies gender-restricted windows where configured.
7. Enriches each service with Arabic translations, catalog pricing, and parsed image arrays.
8. Enriches each category with its `duration_unit` from `hms_config`.
9. Returns the nested tree grouped as: category → location → service → `availability[]` (one entry per date, each containing that date's slots).

---

## Excluded Categories

The following categories are excluded from the scheduler because they are not schedulable add-ons:

| Slug | Reason |
|---|---|
| `stay` | Booked through the room/package flow, not the add-on scheduler. |
| `amenities` | Non-schedulable add-ons (checkbox selections, not time-based). |
| `networking` | Internal-only, not guest-facing (Phase 6). |
| `room-service` | Handled through a separate in-room flow (Phase 6). |

---

## Data Model

The scheduler tree is built from the following join path:

```
service_categories
  └─ services (category_id)
       └─ service_locations (service_id → location_id)
            └─ locations (id)
                 └─ delivery_units (location_id)
                      └─ unit_availability (unit_id / location_id)
                           └─ computed slots
```

Each **service** at a location is a schedulable option. Each **delivery unit** (table, chair, spa room, vehicle) at that location provides availability windows that are expanded into discrete time slots.

---

## Response

### Success (200)

```json
{
  "from": "2026-07-01",
  "to": "2026-07-03",
  "categories": [
    {
      "categoryId": 5,
      "slug": "dining",
      "label": { "en": "Dining", "ar": "مطاعم" },
      "icon": "utensils",
      "unit": "meal",
      "standaloneBookable": true,
      "locations": [
        {
          "locationId": 12,
          "name": "Main Restaurant",
          "code": "SCHED-REST",
          "services": [
            {
              "serviceId": 76,
              "label": { "en": "Breakfast Buffet", "ar": "بوفيه إفطار" },
              "shortDescription": "International breakfast selection",
              "images": ["20", "21"],
              "unitPrice": 75,
              "currency": "SAR",
              "availability": [
                {
                  "date": "2026-07-01",
                  "unavailableReason": null,
                  "slots": [
                    {
                      "start": "07:00",
                      "end": "08:00",
                      "unitId": 5,
                      "locationId": 12,
                      "available": true,
                      "genderConstraint": null
                    },
                    {
                      "start": "08:00",
                      "end": "09:00",
                      "unitId": 5,
                      "locationId": 12,
                      "available": false,
                      "genderConstraint": null
                    }
                  ]
                },
                {
                  "date": "2026-07-02",
                  "unavailableReason": null,
                  "slots": [
                    {
                      "start": "07:00",
                      "end": "08:00",
                      "unitId": 5,
                      "locationId": 12,
                      "available": true,
                      "genderConstraint": null
                    }
                  ]
                },
                {
                  "date": "2026-07-03",
                  "unavailableReason": "blackout",
                  "slots": []
                }
              ]
            },
            {
              "serviceId": 77,
              "label": { "en": "Lunch Set Menu", "ar": "غداء" },
              "shortDescription": null,
              "images": [],
              "unitPrice": 120,
              "currency": "SAR",
              "availability": [
                { "date": "2026-07-01", "unavailableReason": null, "slots": [{ "start": "12:00", "end": "13:00", "unitId": 6, "locationId": 12, "available": true, "genderConstraint": null }] },
                { "date": "2026-07-02", "unavailableReason": null, "slots": [{ "start": "12:00", "end": "13:00", "unitId": 6, "locationId": 12, "available": true, "genderConstraint": null }] },
                { "date": "2026-07-03", "unavailableReason": "blackout", "slots": [] }
              ]
            }
          ]
        }
      ]
    },
    {
      "categoryId": 7,
      "slug": "spa",
      "label": { "en": "Spa", "ar": "سبا" },
      "icon": "spa",
      "unit": "session",
      "standaloneBookable": true,
      "locations": [
        {
          "locationId": 15,
          "name": "Wellness Center",
          "code": "SCHED-SPA",
          "services": [
            {
              "serviceId": 90,
              "label": { "en": "Swedish Massage", "ar": "مساج سويدي" },
              "shortDescription": "60-minute relaxation massage",
              "images": ["30"],
              "unitPrice": 250,
              "currency": "SAR",
              "availability": [
                {
                  "date": "2026-07-01",
                  "unavailableReason": null,
                  "slots": [
                    { "start": "09:00", "end": "10:00", "unitId": 20, "locationId": 15, "available": true, "genderConstraint": null },
                    { "start": "10:00", "end": "11:00", "unitId": 20, "locationId": 15, "available": true, "genderConstraint": "female" }
                  ]
                },
                { "date": "2026-07-02", "unavailableReason": null, "slots": [{ "start": "09:00", "end": "10:00", "unitId": 20, "locationId": 15, "available": true, "genderConstraint": null }] },
                { "date": "2026-07-03", "unavailableReason": null, "slots": [{ "start": "09:00", "end": "10:00", "unitId": 20, "locationId": 15, "available": true, "genderConstraint": null }] }
              ]
            }
          ]
        }
      ]
    },
    {
      "categoryId": 8,
      "slug": "barber",
      "label": { "en": "Barber", "ar": "حلاق" },
      "icon": "scissors",
      "unit": "session",
      "standaloneBookable": true,
      "locations": [
        {
          "locationId": 18,
          "name": "Barber Shop",
          "code": "SCHED-BARB",
          "services": [
            {
              "serviceId": 95,
              "label": { "en": "Haircut", "ar": "قص شعر" },
              "shortDescription": null,
              "images": [],
              "unitPrice": 80,
              "currency": "SAR",
              "availability": [
                { "date": "2026-07-01", "unavailableReason": null, "slots": [
                  { "start": "08:00", "end": "08:30", "unitId": 25, "locationId": 18, "available": true, "genderConstraint": null },
                  { "start": "08:30", "end": "09:00", "unitId": 25, "locationId": 18, "available": true, "genderConstraint": null }
                ]},
                { "date": "2026-07-02", "unavailableReason": null, "slots": [
                  { "start": "08:00", "end": "08:30", "unitId": 25, "locationId": 18, "available": true, "genderConstraint": null }
                ]},
                { "date": "2026-07-03", "unavailableReason": null, "slots": [
                  { "start": "08:00", "end": "08:30", "unitId": 25, "locationId": 18, "available": true, "genderConstraint": null }
                ]}
              ]
            }
          ]
        }
      ]
    }
  ]
}
```

### Category Fields

| Field | Type | Description |
|---|---|---|
| `categoryId` | `number` | Service category ID. |
| `slug` | `string` | Category slug (e.g. `"dining"`, `"spa"`, `"barber"`, `"transport"`). |
| `label` | `{ en, ar }` | Localized category name. |
| `icon` | `string\|null` | Icon identifier. |
| `unit` | `string` | Duration unit for services in this category (`"meal"`, `"session"`, `"ride"`, `"visit"`). |
| `standaloneBookable` | `boolean` | Always `true` in the scheduler response (stay and amenities are excluded). |
| `locations` | `array` | Locations offering services in this category. Empty array if none. |

### Location Fields

| Field | Type | Description |
|---|---|---|
| `locationId` | `number` | Location ID from the `locations` table. |
| `name` | `string` | Location display name (e.g. `"Main Restaurant"`, `"Barber Shop"`, `"Wellness Center"`). |
| `code` | `string` | Short location code (e.g. `"SCHED-REST"`, `"SCHED-SPA"`). |
| `services` | `array` | Services available at this location within the parent category. These are the "options" the guest picks from. |

### Service (Option) Fields

| Field | Type | Description |
|---|---|---|
| `serviceId` | `number` | Service ID. This is the option identifier sent back to the reschedule API. |
| `label` | `{ en, ar }` | Localized service name (e.g. `"Breakfast Buffet"`, `"Swedish Massage"`, `"Haircut"`). |
| `shortDescription` | `string\|null` | Brief description of the service. |
| `images` | `string[]` | Attachment IDs / URLs for service images. |
| `unitPrice` | `number` | Catalog price per unit. |
| `currency` | `string\|null` | Currency code (e.g. `"SAR"`). |
| `availability` | `array` | One entry per date in the requested range. Each contains that date's slots. |

### Availability Entry Fields

| Field | Type | Description |
|---|---|---|
| `date` | `string` | The date (YYYY-MM-DD). |
| `unavailableReason` | `string\|null` | If the entire service is unavailable for this date: `"advance_booking_min_days"`, `"advance_booking_max_days"`, `"blackout"`, `"cutoff_time"`. `null` if available. |
| `slots` | `array` | Time slots for this service on this date. Empty if unavailable. |

### Slot Fields

| Field | Type | Description |
|---|---|---|
| `start` | `string` | Slot start time (`HH:MM`). |
| `end` | `string` | Slot end time (`HH:MM`). |
| `unitId` | `number\|null` | Delivery unit ID (table, chair, spa room, vehicle). `null` for location-level availability. |
| `locationId` | `number\|null` | Location ID for the slot. |
| `available` | `boolean` | `true` if the slot is bookable, `false` if conflicted or restricted. |
| `genderConstraint` | `string\|null` | If the slot falls in a gender-restricted window (e.g. `"female"`). `null` otherwise. |

---

## Selection Model

The tree maps to the guest UI as a uniform two-step selection for every category:

| Category | Step 1: Pick a Service (Option) | Step 2: Pick a Slot |
|---|---|---|
| Dining | Breakfast Buffet, Lunch Set Menu, Dinner Tasting | Time slot at the restaurant |
| Barber | Haircut, Beard Grooming, Hot Towel Shave | 30-min slot at the barber shop |
| Spa | Swedish Massage, Thai Massage, Facial Treatment | 60-min slot at the wellness center |
| Transport | Airport Pickup, City Transfer | Pickup time slot |
| Gym | Open Gym, Personal Training | Session slot |

The `serviceId` chosen in step 1 and the slot's `(start, end, unitId)` from step 2 are sent back to the reschedule API.

---

## Availability Gates

Per-service configs from `hms_config` control availability:

| Config Key | Effect |
|---|---|
| `advance_booking_min_days` | Reject dates before today + N days. |
| `advance_booking_max_days` | Reject dates beyond today + N days. |
| `blackout_dates` | All slots unavailable during defined closure periods. |
| `lead_time_hours` / `lead_time_minutes` | Same-day slots within the lead time window are marked unavailable. |
| `cutoff_time` | If current time exceeds the daily cutoff, all same-day slots are unavailable. |
| `gender_restricted_windows` | Slots in restricted windows show a `genderConstraint` flag. |

---

## Seeded Test Data

The test sim (`guestScheduler.js`) seeds the following real data when all assertions pass:

| Category | Location | Services | Unit Type | Slot Duration | Hours |
|---|---|---|---|---|---|
| Dining | Main Restaurant | Breakfast Buffet (75 SAR), Lunch Set Menu (120 SAR), Dinner Tasting (200 SAR) | table | 60 min | 07:00–22:00 |
| Spa | Wellness Center | Swedish Massage (250 SAR), Thai Massage (300 SAR), Facial Treatment (180 SAR) | staff_slot | 60 min | 09:00–20:00 |
| Barber | Barber Shop | Haircut (80 SAR), Beard Grooming (50 SAR), Hot Towel Shave (60 SAR) | chair | 30 min | 08:00–21:00 |

Each service has its own delivery unit with availability windows for all 7 days of the week and catalog pricing in SAR.

---

## Error Responses

| Status | Message | Condition |
|---|---|---|
| 400 | `Invalid 'from' date format. Use YYYY-MM-DD.` | Malformed `from` parameter. |
| 400 | `Invalid 'to' date format. Use YYYY-MM-DD.` | Malformed `to` parameter. |
| 400 | `'to' must be on or after 'from'.` | `to` is before `from`. |
| 400 | `Date range cannot exceed 14 days.` | Range exceeds the maximum. |
| 401 | Unauthenticated | Missing or invalid access token. |
| 500 | `Failed to fetch scheduler` | Internal query or processing error. |
