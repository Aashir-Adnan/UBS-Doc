# Visit Price Calculation

How the backend prices a visit, leg by leg, and the rules the visit builder must follow so its own estimate matches. Every formula below is what the server computes. The numbers in the examples are checked against the backend.

| Where the price is used | Endpoint | What is priced |
|---|---|---|
| Visit builder, before saving | `GET /api/crud/visits/components` | a single component: `price`, `priceBlockNights`, `extraNightPrice`, `party.unitsRequired` |
| Visit edit screen | `GET /api/crud/visits?id=` → `visitPricingEstimate` | every saved leg, for tomorrow, at its `quantity` units |
| Partner, for a date and a party | `GET /api/partner/visits/detail` → `pricing` | every leg for that date and party, the scaled sell price, and the per-leg split |
| Partner booking | `POST /api/partner/visits/book` | the same as detail, checked again against `pricingFingerprint` |

Related pages: [Visit Components API](../admin-apis/visits-components-api.md), [Visits admin APIs](./visits-admin-apis.md), [Partner integration guide](./partner-integration-guide.md) §6.2.

---

## 1. Inputs

| Input | Source | Meaning |
|---|---|---|
| `price` | the component's active `catalog_pricing` row (`price.current` in the picker) | price of one unit: one package period, or one room for one price block |
| `durationNights` | package `duration` config | nights one package period covers |
| `extraNights` | the leg (`visit_items.extra_nights`) | packages: nights added after the period. Allowed only when `extraNightsAllowed`, at most `maxExtraNights` |
| `extraNightPrice` | picker, computed by the backend | what one extra night adds per unit (rule 3.2) |
| `nights` | the leg (`visit_items.extra_nights` holds a stay's total nights) | stays: nights in the room, within `min_stay_nights` / `max_stay_nights` |
| `priceBlockNights` | room `duration` config, else `1` | nights one room price covers |
| `quantity` | the leg (`visit_items.quantity`) | the **minimum** units every booking takes, and the base the visit price is set for (rule 2) |
| `unitsRequired` | picker, for the party you send | units a party needs (rule 2.1) |
| hotel pricing rules | the hotel's active `pricing_rules` on the leg's check-in date | surcharges or discounts (rule 3.4) |
| `sellPrice` | the visit's own `catalog_pricing` row (`base_table = 'visits'`) | the price the visit is sold for, for a party that fits every leg's `quantity` |

---

## 2. Units per leg

### 2.1 Units a party needs

`unitsRequired` is the smallest `u` for which all of these hold (a limit that is not set is skipped):

```
adults              ≤ u × maxAdults
children            ≤ u × maxChildren + (u × maxAdults − adults)
adults + children   ≤ u × maxOccupancy
```

A child may take a free adult place. An adult never takes a child's place.

| Party | Unit limits | `unitsRequired` |
|---|---|---|
| 2 adults + 1 child | 4 adults, 1 child, 4 per room | 1 |
| 4 adults + 1 child | 4 adults, 1 child, 4 per room | 2 (5 people > 4) |
| 10 adults + 1 child | 2 per room | 6 (11 people ÷ 2, rounded up) |
| 2 adults + 3 children | 3 adults, 2 children, 5 per room | 1 (a child takes the free adult place) |

### 2.2 Units a booking takes

```
legUnits = max(quantity, unitsRequired for the booking party)
```

`quantity` is a floor, not the party's room count:

| Leg `quantity` | Booking party | `unitsRequired` | Units booked |
|---|---|---|---|
| 1 | 2 adults | 1 | 1 |
| 1 | 10 adults + 1 child (2 per room) | 6 | 6 |
| 6 | 2 adults | 1 | **6** — the couple books 6 rooms and pays the full visit price |

**Rule for the builder:** start every leg at `quantity: 1`. Use the party in the builder only to filter out components that cannot take it, and show `unitsRequired` as information. A bigger party at booking time takes more units and pays more automatically (rule 5). Raise `quantity` above 1 only for a visit that is sold to groups only, and warn the curator that every booking takes at least that many units.

### 2.3 Limits checked on save

| Limit | Issue code on save (`422 invalid_items`) |
|---|---|
| `quantity` below 1 or not a whole number | `invalid_quantity` |
| package `quantity` > `maxQuantityPerBooking` | `package_quantity_over_max` |
| stay `quantity` > room `maxQuantityPerBooking` | `stay_quantity_over_max` |
| stay `quantity` > rooms the hotel has of that type (`unitCount`) | `not_enough_units` |

Clamp the quantity input to `min(maxQuantityPerBooking, unitCount)` for stays and `maxQuantityPerBooking` for packages, so these never reach the server.

---

## 3. Cost of one leg

### 3.1 Package leg

```
leg length   = durationNights + extraNights
legSubtotal  = price × units + extraNightPrice × extraNights × units
```

A visit leg always holds one package period per unit. Longer stays are made with extra nights, not with more periods.

### 3.2 Extra-night price

```
perNight        = price ÷ durationNights
percentage type : extraNightPrice = max(0, perNight × (1 − discountValue ÷ 100))
flat type       : extraNightPrice = max(0, perNight − discountValue)
```

`discountValue` and its type come from the package configs `additional_package_nights_price_discount_value` and `additional_package_nights_price_discount_type` (default `percentage`, value `0`). The picker returns the result as `items[].extraNightPrice`, rounded to 2 decimals. It is `null` when the package has no price, no duration, or extra nights are not allowed.

**Example — package 369.** Price 615 USD, `durationNights` 2, 10 % extra-night discount:

| Step | Value |
|---|---|
| `perNight` | 615 ÷ 2 = 307.50 |
| `extraNightPrice` | 307.50 × 0.90 = **276.75** |
| 1 unit, 0 extra nights | 615 × 1 = 615.00 |
| 1 unit, 1 extra night | 615 + 276.75 × 1 × 1 = 891.75 |
| 2 units, 2 extra nights | 615 × 2 + 276.75 × 2 × 2 = 1,230 + 1,107 = **2,337.00** |

### 3.3 Stay leg

```
blocks       = ceil(nights ÷ priceBlockNights)
legSubtotal  = price × units × blocks
```

A started block is charged in full. With no room `duration` config, `priceBlockNights` is `1` and the price is per night.

**Example — room priced 500 SAR per 2-night block, 1 room:**

| Nights | Blocks | Cost |
|---|---|---|
| 1 | 1 | 500 |
| 2 | 1 | 500 |
| 3 | 2 | 1,000 |
| 4 | 2 | 1,000 |
| 5 | 3 | 1,500 |

**Example — room 461, 125 SAR per 6-night block:** 1–6 nights cost 125, 7–12 nights 250, 13 nights 375.

### 3.4 Hotel pricing rules

```
componentPrice = applyRules(legSubtotal, hotel rules active on the leg's check-in date)
```

Rules are percentage or flat, surcharge (`+`) or discount (`−`), and apply to the whole leg. The builder cannot know them because it has no dates: its estimate is `legSubtotal`. The edit screen's `visitPricingEstimate` and partner pricing include them.

**Example:** package 369, 2 units, 2 extra nights, check-in on a date covered by the hotel's "Peak Season Surcharge" (+15 %): 2,337.00 + 350.55 = **2,687.55**.

### 3.5 Free and unpriced legs

| Component state | Meaning | Result |
|---|---|---|
| active price of `0` | a free leg | costs 0, the visit saves and sells normally |
| no active price (`price: null`) | not priced | refused on save: `component_unpriced` |
| priced in another currency | cannot be added without conversion | refused on save: `currency_mismatch`. A visit that already holds one is refused at partner pricing with `409 currency_mismatch` |

Every leg must be priced in the visit's currency (or, before the visit has a price, in the first leg's currency). Block such picks in the builder.

---

## 4. Components total and bundle discount

```
componentsTotal   = Σ componentPrice of every leg
bundleDiscount    = componentsTotal − sellPrice
bundleDiscountPct = bundleDiscount ÷ componentsTotal × 100
```

A negative `bundleDiscount` means the visit sells above the sum of its parts.

**Worked visit** (SAR, no hotel rules on the dates, every leg at `quantity: 1`):

| Leg | Component | Rule | Leg cost |
|---|---|---|---|
| 1 | Package A: 1,000 per 2-night period, 10 % extra-night discount, 1 extra night | 1,000 × 1 + 450 × 1 × 1 (450 = 1,000 ÷ 2 × 0.9) | 1,450 |
| 2 | Room B: 300 per night, 3 nights | 300 × 1 × 3 | 900 |
| 3 | Room C: 500 per 2-night block, 3 nights | 500 × 1 × ceil(3 ÷ 2) = 500 × 2 | 1,000 |
| | | **componentsTotal** | **3,350** |

With a sell price of 3,000: `bundleDiscount` = 350, `bundleDiscountPct` = 10.45 %.

A saved sell price does **not** follow component price changes. If a hotel raises Room B to 400 per night, `componentsTotal` becomes 3,650 and the discount grows to 650 (17.81 %) while the sell price stays 3,000. The edit screen shows this through `visitPricingEstimate` (rule 7).

---

## 5. Sell price for a bigger party

The sell price is set for a party that fits every leg's `quantity`. When a booking party needs more units on some legs, the sell price is scaled by how much more those extra units cost, so the bundle discount stays the same percentage:

```
baseComponentSum  = Σ componentPrice of every leg at quantity units
partyComponentSum = Σ componentPrice of every leg at legUnits for the party
partyScale        = partyComponentSum ÷ baseComponentSum
sellAmount        = round2(sellPrice × partyScale)
```

When no leg needs more than its `quantity`, `partyScale` is `1` and `sellAmount` equals the saved sell price. Partner pricing returns `baseSellAmount` (the saved price), `partyScale` (4 decimals) and `sellAmount`.

**Example — the worked visit for 3 adults.** Package A takes 4 adults per unit (1 unit). Rooms B and C take 2 people per room (2 rooms each):

| Leg | At `quantity` | For 3 adults |
|---|---|---|
| 1 | 1,450 | 1,450 (1 unit) |
| 2 | 900 | 300 × 2 × 3 = 1,800 |
| 3 | 1,000 | 500 × 2 × 2 = 2,000 |
| Sum | `baseComponentSum` = 3,350 | `partyComponentSum` = 5,250 |

`partyScale` = 5,250 ÷ 3,350 = 1.5672 (shown rounded) · `sellAmount` = 3,000 × 5,250 ÷ 3,350 = **4,701.49** · `bundleDiscount` = 548.51, still 10.45 %.

---

## 6. Split across legs

Each leg is booked at its share of the sell price. The bundle discount is spread pro-rata to each leg's `componentPrice`, and the last leg takes the rounding so the legs add up to `sellAmount` exactly:

```
legs 1 … n−1 : legNet = round2(componentPrice − bundleDiscount × componentPrice ÷ componentSum)
last leg     : legNet = sellAmount − Σ legNet of the other legs
allocatedDiscount = componentPrice − legNet
```

**Example — the 3-adult party from rule 5:**

| Leg | `componentPrice` | `allocatedDiscount` | `legNet` |
|---|---|---|---|
| 1 | 1,450.00 | 151.49 | 1,298.51 |
| 2 | 1,800.00 | 188.06 | 1,611.94 |
| 3 (rounding leg) | 2,000.00 | 208.96 | 1,791.04 |
| Total | 5,250.00 | 548.51 | **4,701.49** |

---

## 7. The admin estimate (`visitPricingEstimate`)

The visits View (`GET /api/crud/visits?id=`) returns the backend's own price of the saved visit:

| Field | Rule |
|---|---|
| `estimateDate` | tomorrow; leg 1 starts that day and each leg starts the day the previous one ends |
| `legs[].units` | the leg's `quantity` (the base party) |
| `legs[].componentPrice` | rules 3.1–3.4, hotel rules included for that leg's dates |
| `componentsTotal`, `sellAmount`, `bundleDiscount`, `bundleDiscountPct` | rule 4 |
| `unpricedLegs[]` | legs the backend could not price, with the reason |

It does not check free rooms or sale windows, and it can be `null`. The builder's estimate for unsaved changes uses rules 3.1–3.3 only, so it can differ from `visitPricingEstimate` by the hotel rules of the dates.

---

## 8. One estimate formula in the builder

The builder must price a leg with one shared function, used by the leg cost, the components total and the card badge:

```
package : price × units + (extraNightPrice ?? 0) × extraNights × units
stay    : price × units × ceil(nights ÷ priceBlockNights)
units   : the leg's quantity
```

- Show "extra nights not priced" when a package has extra nights and `extraNightPrice` is `null`.
- Do not sum `party.adjustedPrice`. It is `price × unitsRequired` for **one** package period or **one** room price block only.
- Show a leg with `price: null` as unpriced, not as 0. A price of `0` is a real free leg.

### Checks

| Case | Expected builder estimate |
|---|---|
| package 369, quantity 1, 1 extra night | 891.75 |
| package 369, quantity 2, 2 extra nights | 2,337.00 |
| room 500 per 2-night block, quantity 1, 3 nights | 1,000 |
| free leg (price 0) | 0, saves normally |
| leg with no price | shown as unpriced; save fails with `component_unpriced` |
| leg in another currency | blocked; save fails with `currency_mismatch` |
| stay quantity above the room cap | clamped; save fails with `stay_quantity_over_max` |

---

## Rounding

- Every leg price is rounded to 2 decimals.
- `extraNightPrice` is rounded to 2 decimals in the picker. The backend computes the extra-night total from the unrounded per-night price and rounds the total, so a builder estimate can differ by a cent on prices that don't divide evenly.
- `partyScale` is shown to 4 decimals. `sellAmount` is computed from the unrounded scale.
- `bundleDiscountPct` is rounded to 2 decimals.
