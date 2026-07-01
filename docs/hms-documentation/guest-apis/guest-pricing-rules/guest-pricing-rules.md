# Guest Pricing Rules

**GET** `/api/guest/pricing-rules?hotelId=<tenant_id>`

Returns all active pricing rules that currently apply for a given tenant. This lets the guest app display surcharges, discounts, and seasonal adjustments before checkout — using the exact same filtering logic applied at booking time.

---

## Authentication

Uses **PUBLIC_ENCRYPTED_PLATFORM** — AES-ECB encryption with platform key only. No JWT required.

---

## Request

### Query Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `hotelId` | `number` | Yes | The tenant ID to fetch pricing rules for |

### Example

```
GET /api/guest/pricing-rules?hotelId=5
```

---

## Response

### Success (200)

```json
{
  "tenantId": 5,
  "evaluatedAt": "2026-07-01T12:00:00.000Z",
  "rules": [
    {
      "pricingRuleId": 1,
      "ruleName": "Summer Surcharge",
      "ruleType": "seasonal",
      "delta": "+",
      "value": 15,
      "type": "percentage",
      "validFrom": "2026-06-01T00:00:00.000Z",
      "validTo": "2026-08-31T00:00:00.000Z"
    },
    {
      "pricingRuleId": 3,
      "ruleName": "Early Bird Discount",
      "ruleType": "segment",
      "delta": "-",
      "value": 50,
      "type": "flat",
      "validFrom": null,
      "validTo": null
    }
  ]
}
```

### Response Fields

| Field | Type | Description |
|-------|------|-------------|
| `tenantId` | `number` | The tenant these rules belong to |
| `evaluatedAt` | `string` | ISO 8601 timestamp of when the rules were evaluated |
| `rules` | `array` | Active, currently-applicable pricing rules |
| `rules[].pricingRuleId` | `number` | Primary key of the rule |
| `rules[].ruleName` | `string` | Human-readable rule name |
| `rules[].ruleType` | `string` | One of: `seasonal`, `regional`, `segment`, `occupancy`, `dynamic` |
| `rules[].delta` | `string` | `"+"` (surcharge) or `"-"` (discount) |
| `rules[].value` | `number` | Numeric adjustment amount |
| `rules[].type` | `string` | `"flat"` (fixed amount) or `"percentage"` (of base price) |
| `rules[].validFrom` | `string\|null` | ISO 8601 start of validity window, or `null` if always valid |
| `rules[].validTo` | `string\|null` | ISO 8601 end of validity window, or `null` if always valid |

### Error — Missing hotelId (400)

```json
{
  "error": "hotelId query parameter is required"
}
```

---

## How Pricing Rules Are Applied

This endpoint returns the same rules that `applyPricingRules()` in `catalogPricing.js` uses at booking time. The application order is fixed:

1. **+ percentage** — markup as % of base price
2. **+ flat** — markup as fixed amount
3. **- percentage** — discount as % of base price
4. **- flat** — discount as fixed amount

> **Percentage adjustments are always calculated against the original base price**, not the running total. For example, if the base price is 100 SAR and there is a +10% surcharge and a -5% discount, the result is `100 + 10 - 5 = 105 SAR`, not `100 * 1.10 * 0.95`.

### Filtering Logic

Rules are excluded if:

- `status` is not `active`
- `rule_type` is `base` or `tax` (these are internal-only)
- The `condition` JSON has a `from` date in the future
- The `condition` JSON has a `to` date in the past

Rules with no `condition`, or a `condition` with no `from`/`to`, always apply.

---

## Related

- [Guest Booking Flow](../guest-booking-flow/guest-booking-flow.md) — uses `resolvePrice()` which applies these rules
- [Guest Services](../guest-services/guest-services.md) — `base_price` / `current_price` fields reflect these rules
- [Guest Packages](../guest-packages/guest-packages.md) — package pricing also goes through `resolvePrice()`

---

## Source Files

| File | Purpose |
|------|---------|
| `Src/Apis/ProjectSpecificApis/GuestSpecificApis/GuestPricingRules/GuestPricingRules.js` | API object definition |
| `Src/Apis/ProjectSpecificApis/GuestSpecificApis/GuestPricingRules/CRUD_parameters.js` | Parameter schema |
| `Src/HelperFunctions/Guest/v2/catalogPricing.js` | Centralized pricing module (same filtering logic) |

---

## Change Log

| Date | Change |
|------|--------|
| 2026-07-01 | Initial implementation — read-only endpoint for guest-facing pricing rule visibility |
