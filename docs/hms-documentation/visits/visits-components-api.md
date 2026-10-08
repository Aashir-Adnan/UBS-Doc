# Visit Components API

**GET** `/api/crud/visits/components`

The component picker the visit builder uses to choose a visit's **legs**. It lists the packages and stay services (room types) of every participating hotel. Given a party (adults and children), it also tells you which components can take that party, how many units each needs, and what that costs.

A visit is a chain of stays with no gaps (see [Visits Admin APIs](./visits-admin-apis.md#legs)): each leg is a package or a stay service, and each starts the day the previous one ends. This page covers everything the frontend needs to fill that chain from the picker.

---

## Request

| | |
|---|---|
| Method | `GET /api/crud/visits/components` |
| Auth | admin session (`accesstoken`), standard platform encryption |
| Permission | `list_visits` (SaaS Admin, Visits Curator, general Tenant Manager) |
| `actionPerformerURDD` | the curator's URDD, in the encrypted payload as on every admin call |

Query parameters (all optional):

| Parameter | Type | Default | Meaning |
|---|---|---|---|
| `type` | `package` \| `stay` | both | `service` is accepted as `stay` |
| `hotelId` | number | all hotels | one hotel only |
| `q` | string | — | matches the component name or the hotel name (contains) |
| `consentOnly` | `true` \| `false` | `true` | `true`: only hotels that consent to bundling. `false`: all hotels, with `hotelConsents` telling them apart |
| `adults` | integer ≥ 1 | — | the party. Send it with `children` to filter and annotate by party |
| `children` | integer ≥ 0 | `0` | children in the party. Sending only `children` without `adults` is `422 invalid_party` |
| `page_no` | integer | `1` | |
| `page_size` | integer | `50` | at most `200` |

```
GET /api/crud/visits/components?hotelId=86&adults=4&children=1&page_no=1&page_size=50
GET /api/crud/visits/components?type=stay&q=suite
```

---

## Response

```json
{
  "total": 18,
  "pageNo": 1,
  "pageSize": 50,
  "items": [
    {
      "baseTable": "services",
      "recordId": 383,
      "name": "Classic Guest Room, City View, 1 Queen Bed",
      "hotelId": 86,
      "hotelName": "Le Meridien Makkah",
      "category": { "slug": "stay", "name": "Stay" },
      "price": { "base": 120, "current": 120, "currency": "SAR" },
      "priceBasis": "per_unit_block",
      "priceBlockNights": 1,
      "durationNights": null,
      "extraNightsAllowed": null,
      "maxExtraNights": null,
      "maxQuantityPerBooking": null,
      "perUnit": { "maxAdults": 2, "maxChildren": 1, "maxOccupancy": 2 },
      "minPersonsPerBooking": null,
      "unitCount": 44,
      "party": { "adults": 4, "children": 1, "fitsNatively": false, "unitsRequired": 3, "adjustedPrice": 360 },
      "hotelConsents": true,
      "configs": [
        { "config_key_id": 7148, "config_key": "duration", "operator": "=", "config_value": [ { "en": "1", "ar": "" } ], "is_input": 1 },
        { "config_key_id": 7094, "config_key": "advance_booking_min_days", "operator": "=", "config_value": [ { "en": "0", "ar": "" } ], "is_input": 1 },
        { "config_key_id": 7127, "config_key": "base_currency", "operator": "=", "config_value": [], "is_input": 0 }
      ]
    },
    {
      "baseTable": "packages",
      "recordId": 383,
      "name": "abc",
      "hotelId": 86,
      "hotelName": "Le Meridien Makkah",
      "category": null,
      "price": { "base": 150, "current": 150, "currency": "SAR" },
      "priceBasis": "per_package",
      "priceBlockNights": null,
      "durationNights": 1,
      "extraNightsAllowed": false,
      "maxExtraNights": null,
      "maxQuantityPerBooking": null,
      "perUnit": { "maxAdults": 1, "maxChildren": null, "maxOccupancy": null },
      "minPersonsPerBooking": 1,
      "unitCount": 4,
      "party": { "adults": 4, "children": 1, "fitsNatively": false, "unitsRequired": 4, "adjustedPrice": 600 },
      "hotelConsents": true,
      "configs": [
        { "config_key_id": 7094, "config_key": "advance_booking_min_days", "operator": "=", "config_value": [ { "en": "0", "ar": "" } ], "is_input": 1 }
      ]
    }
  ]
}
```

`configs` is shortened here; it lists all of the component's own configs.

### Field reference

| Field | Type | Nullable | Meaning |
|---|---|---|---|
| `total` | number | no | matching components (with a party: only those that fit) |
| `pageNo`, `pageSize` | number | no | the page returned |
| `items[].baseTable` | string | no | `packages` or `services`. A `services` item is always a stay (room type) |
| `items[].recordId` | number | no | package id or service id; send it as the leg's `recordId` |
| `items[].name` | string | no | component name |
| `items[].hotelId`, `items[].hotelName` | number, string | no | the hotel the component belongs to |
| `items[].category` | object | yes | `{ slug: "stay", name }` for stays, `null` for packages |
| `items[].price` | object | yes | `base` (list), `current` (after active discount) and `currency`. `null` when the component has no active price |
| `items[].priceBasis` | string | no | `per_package` for packages; `per_unit_block` for stays (price per room per block of nights) |
| `items[].priceBlockNights` | number | yes | stays: nights one price covers (the room's `duration` config, else `1`). `null` for packages |
| `items[].durationNights` | number | yes | packages: the nights one package covers. `null` for stays |
| `items[].extraNightsAllowed` | boolean | yes | packages: whether extra nights may be added. `null` for stays |
| `items[].maxExtraNights` | number | yes | packages: most extra nights (`null`: no cap). `null` for stays |
| `items[].maxQuantityPerBooking` | number | yes | most units (packages or rooms) one purchase may take; `null`: no cap |
| `items[].perUnit.maxAdults` | number | yes | adults one unit takes; `null`: no adult cap |
| `items[].perUnit.maxChildren` | number | yes | children one unit takes on top of free adult places; `null`: no child cap |
| `items[].perUnit.maxOccupancy` | number | yes | stays: people per room (room capacity, capped by `max_persons_per_booking`). `null` for packages |
| `items[].minPersonsPerBooking` | number | yes | minimum party: per room for stays, per booking for packages |
| `items[].unitCount` | number | yes | rooms the hotel has: the room type's active rooms, or for a package its stay service's rooms. `null` when a package has no stay service |
| `items[].party` | object | yes | `null` when no party was sent |
| `items[].party.adults`, `.children` | number | no | the party you sent |
| `items[].party.unitsRequired` | number | no | units this party needs (rule below) |
| `items[].party.fitsNatively` | boolean | no | `true` when one unit is enough |
| `items[].party.adjustedPrice` | number | yes | `price.current × unitsRequired`: per package for packages, per room block for stays. `null` without a price |
| `items[].hotelConsents` | boolean | no | the hotel's `allow_visit_bundling` consent. Always `true` with `consentOnly=true` |
| `items[].configs[]` | array | no | the component's own configs: `config_key_id`, `config_key`, `operator`, `is_input`, `config_value` (typed values as `en`/`ar` pairs, option keys as option ids, `base_currency` as currency objects) |

---

## Rules the API applies

### Which components are listed

A component is listed only when all of these hold:

1. It's a **package** or a **service whose category is `stay`**. Dining, transport, spa and other services are never listed: they can't be legs, they come with a package.
2. It's `active`, and its hotel is `active`.
3. It doesn't belong to the platform's system tenant.
4. Its hotel consents to bundling (`allow_visit_bundling`), unless `consentOnly=false`.
5. It matches `type`, `hotelId` and `q` when sent.

Results are sorted by hotel name, then component name.

### How the party is matched

When `adults` / `children` are sent, the API works out the **units** (packages or rooms) the party needs. `unitsRequired` is the smallest `u` for which all of these hold (a limit that isn't set is skipped):

```
adults              ≤ u × maxAdults
children            ≤ u × maxChildren + (u × maxAdults − adults)
adults + children   ≤ u × maxOccupancy
```

A child may take a free adult place; an adult never takes a child's place.

A component is then **left out** when:

| Reason | Condition |
|---|---|
| The party can't fit at all | no `u` works, e.g. adults in a unit with `maxAdults: 0` |
| Over the per-booking cap | `unitsRequired > maxQuantityPerBooking` |
| Not enough rooms at the hotel | `unitsRequired > unitCount` |
| Below the minimum | stays: `ceil(people / unitsRequired) < minPersonsPerBooking`. Packages: `people < minPersonsPerBooking` |

Every listed component can take the party in one purchase. `fitsNatively: true` means one unit; otherwise the party is spread over `unitsRequired` units and the price scales with them.

### Worked examples

| Party | Unit limits | `unitsRequired` | Result |
|---|---|---|---|
| 2 adults + 1 child | 4 adults, 1 child, 4 per room | 1 | listed, `fitsNatively: true` |
| 4 adults + 1 child | 4 adults, 1 child, 4 per room | 2 (5 people > 4) | listed, price × 2 |
| 4 adults + 1 child | 2 adults, 1 child, 2 per room | 3 (5 people / 2) | listed, price × 3 |
| 2 adults + 3 children | 3 adults, 2 children, 5 per room | 1 (a child takes the free adult place) | listed, `fitsNatively: true` |
| 4 adults + 1 child | 2 adults, 0 children, max 1 per booking | 3 | left out (over the per-booking cap) |
| 13 adults | 4 per room, hotel has 3 rooms | 4 | left out (not enough rooms) |
| 5 adults | 4 per room, minimum 4 per room | 2 (2.5 per room) | left out (below the minimum) |

### Dates are not checked here

The picker has no dates: a visit is built before anyone picks a start date. `unitCount` is how many rooms the hotel **has**, not how many are free. Free rooms, sale windows, weekday rules and advance-booking limits are checked when a partner prices and books the visit for a date.

### Paging

- **Without a party:** filtering and paging run in the database. Every page is full until the last, and `total` counts all matches.
- **With a party:** every candidate is checked, the ones that don't fit are dropped, and the rest are paged. `total` counts only the components that fit, so pages stay full and consistent.

---

## Using the results in the visit builder

### 1. Ask for the party first

Let the curator enter the party the visit is designed for (adults and children), then call the picker with it. Without a party you get every component but no fit information.

When the party changes, call the picker again. Results and `unitsRequired` depend on it.

### 2. Build the chain of legs

The visit is an ordered list of legs. For each leg the curator picks one item:

| Item | Leg to send | Length |
|---|---|---|
| `baseTable: "packages"` | `{ baseTable: "packages", recordId, quantity, extraNights, displayOrder }` | `durationNights + extraNights` |
| `baseTable: "services"` (stay) | `{ baseTable: "services", recordId, quantity, nights, displayOrder }` | `nights` |

- **`quantity`:** pre-fill with `party.unitsRequired`. It's the least units each purchase books; a larger party at purchase time books more automatically.
- **`nights` (stays):** at least 1. Respect the room's `min_stay_nights` / `max_stay_nights` from `configs` when present; the server rejects others with `invalid_nights`.
- **`extraNights` (packages):** only when `extraNightsAllowed`, and at most `maxExtraNights`. Otherwise leave it 0.
- **`displayOrder`:** 1, 2, 3, … in trip order.
- **Don't send `dayOffset`.** The server derives it: leg 1 starts on day 0, each next leg on the day the previous one ends. If you send it and it doesn't match, the save fails with `leg_gap` or `leg_overlap`.

### 3. Preview the timeline on the client

The same rule gives the trip preview without a server call:

```
day[1] = 0
day[n] = day[n-1] + nights[n-1]
trip length = sum of all legs' nights
```

Example for a 4 adult + 1 child party:

| Leg | Component | Nights | Starts on day | Units | Estimated price |
|---|---|---|---|---|---|
| 1 | Package A (2 nights) | 2 | 0 | 1 | 1 × package price |
| 2 | Family Suite | 3 | 2 | 2 | 2 rooms × 3 nights × price per night |
| 3 | Package B (2 nights) | 2 | 5 | 1 | 1 × package price |

The trip lasts 7 nights. When a partner later sells it from a start date, leg 1 checks in that day, and each leg checks out the day the next one checks in.

### 4. Estimate the cost

- **Package leg:** `party.adjustedPrice`, i.e. price × units. Extra nights are priced at booking by the package's own rules.
- **Stay leg:** `price.current × units × ceil(nights / priceBlockNights)`. `party.adjustedPrice` covers one price block, so multiply it by the number of blocks.

The sum is the components' cost before hotel pricing rules for the travel date. Use it to set the visit's sell price (`visitPricing`); the real per-leg price is computed when a partner prices the visit for a date.

### 5. Show the fit clearly

| Item state | Suggested UI |
|---|---|
| `party.fitsNatively: true` | normal card |
| `party.fitsNatively: false` | badge "needs `unitsRequired` units", show `adjustedPrice` beside the single-unit price |
| `hotelConsents: false` (only with `consentOnly=false`) | disabled; a visit can't be published with it |
| `price: null` | warn; the component can't be priced until the hotel sets a price |

### 6. Save

`catalogId` is the id of the `visit` catalog (`3` on the dev database; read it from the catalog list rather than hard-coding it). Send the legs as `visitItems` on `POST /api/crud/visits` (create) or `PUT /api/crud/visits?id=` (update). See [Visits Admin APIs](./visits-admin-apis.md) for the full payload and the `invalid_items` details.

```json
{
  "visitName": { "en": "Makkah 7 nights", "ar": "مكة ٧ ليال" },
  "catalogId": 3,
  "visitItems": [
    { "baseTable": "packages", "recordId": 367, "quantity": 1, "extraNights": 0, "displayOrder": 1 },
    { "baseTable": "services", "recordId": 381, "quantity": 2, "nights": 3, "displayOrder": 2 },
    { "baseTable": "packages", "recordId": 422, "quantity": 1, "displayOrder": 3 }
  ],
  "visitPricing": [ { "price": 9000, "currencyId": 4 } ]
}
```

---

## Errors

| HTTP | SCC | When |
|---|---|---|
| 401 | `unauthenticated` | missing or expired session |
| 403 | `E31` | the URDD lacks `list_visits` |
| 422 | `invalid_party` | `adults` below 1 or not a whole number, `children` below 0 or not a whole number, or `children` without `adults` |

Validation of the legs themselves (`service_not_stay`, `leg_gap`, `leg_overlap`, `invalid_nights`, `extra_nights_not_allowed`, `package_quantity_over_max`, …) happens when the visit is saved, not here.
