# Pricing Rules CRUD

| Operation | Method | Path | Permission |
|---|---|---|---|
| List | **GET** | `/api/custom/pricing/rules` | `list_pricing_rules` |
| View | **GET** | `/api/custom/pricing/rules?id=<id>` | `view_pricing_rules` |
| Add | **POST** | `/api/custom/pricing/rules` | `add_pricing_rules` |
| Update | **PUT** | `/api/custom/pricing/rules?id=<id>` | `update_pricing_rules` |
| Delete | **DELETE** | `/api/custom/pricing/rules?id=<id>` | `delete_pricing_rules` |

Manages the `pricing_rules` table — tenant-scoped, named pricing rules (rule name/type, a `+`/`-` delta, a value, a type, and a free-form condition). Several text fields are **multilingual** (`{ en, ar }`): English is stored on the row, other languages go into `translated_entries`. Maintained by a **Tenant Admin** (or a role holding the pricing-rules permissions).

> **Base path** is inferred from the object name `global.CustomPricingRules_object`. The resource is `pricing_rules`; the CRUD verbs and permissions below apply regardless of the exact mount path.

---

## Authentication & Authorization

RBAC is enforced per operation — this API defines an explicit permission for every CRUD verb. The `actionPerformerURDD` must hold the required permission.

| Operation | Method | Required Permission |
|---|---|---|
| Add | POST | `add_pricing_rules` |
| View | GET (`?id=`) | `view_pricing_rules` |
| Update | PUT | `update_pricing_rules` |
| Delete | DELETE | `delete_pricing_rules` |
| List | GET | `list_pricing_rules` |

---

## Request Payload

Multilingual fields (`rule_name`, `rule_type`, `value`, `type`, `condition`) accept either a plain string or an object `{ "en": "...", "ar": "..." }`. On write, the `en` value is stored in the table column and non-English entries are upserted into `translated_entries`.

| Field | Type | Required | Description |
|---|---|---|---|
| `pricingRules_id` | number | No | Rule primary key. Supplied as `?id=` (query) for View / Update / Delete. |
| `actionPerformerURDD` | number | No | Acting user's URDD. Stored as `created_by` (Add) and `updated_by` (Add/Update). |
| `language_code` | string | No | Language code (query) — used for translation resolution. |
| `pricingRules_tenantId` | number | No | Tenant that owns the rule (`pricing_rules.tenant_id`). |
| `pricingRules_ruleName` | string \| `{en,ar}` | No | Rule name (multilingual). |
| `pricingRules_ruleType` | string \| `{en,ar}` | No | Rule type (multilingual). |
| `pricingRules_delta` | string | No | `'+'` to add or `'-'` to subtract the adjustment. |
| `pricingRules_value` | string \| `{en,ar}` | No | Adjustment value (multilingual field). |
| `pricingRules_type` | string \| `{en,ar}` | No | Adjustment type, e.g. flat/percentage (multilingual field). |
| `pricingRules_condition` | string \| `{en,ar}` | No | Free-form condition (multilingual field). |

### Example — Add (POST)

```json
{
  "actionPerformerURDD": 42,
  "pricingRules_tenantId": 3,
  "pricingRules_ruleName": { "en": "Weekend Surcharge", "ar": "رسوم نهاية الأسبوع" },
  "pricingRules_ruleType": { "en": "surcharge" },
  "pricingRules_delta": "+",
  "pricingRules_value": { "en": "15" },
  "pricingRules_type": { "en": "percentage" },
  "pricingRules_condition": { "en": "day_of_week in (sat,sun)" }
}
```

---

## Response

List returns an array of rows plus `table_count` (page size 10) and the joined `tenants_tenantName`; View returns the single matching row. On reads, each multilingual field is hydrated back into `{ en, ar }` by looking up `translated_entries`.

```json
{
  "id": 12,
  "pricingRules_pricingRuleId": 12,
  "pricingRules_tenantId": 3,
  "pricingRules_ruleName": { "en": "Weekend Surcharge", "ar": "رسوم نهاية الأسبوع" },
  "pricingRules_ruleType": { "en": "surcharge", "ar": "" },
  "pricingRules_delta": "+",
  "pricingRules_value": { "en": "15", "ar": "" },
  "pricingRules_type": { "en": "percentage", "ar": "" },
  "pricingRules_condition": { "en": "day_of_week in (sat,sun)", "ar": "" },
  "pricingRules_status": "active",
  "pricingRules_createdBy": 42,
  "pricingRules_updatedBy": 42,
  "pricingRules_createdAt": "2026-07-01T10:00:00.000Z",
  "pricingRules_updatedAt": "2026-07-01T10:00:00.000Z",
  "tenants_tenantName": "Hotel One"
}
```

---

## Behavior

- **Multilingual split on write.** A pre-process (`pricingRulesAddPreProcess`, on Add & Update) detects `{ en, ar }` objects on the five multilingual fields, stashes them, and replaces the payload value with the `en` string for the base-table column.
- **Translation upsert after write.** Post-processors (`pricingRulesAddPostProcess` on Add, `pricingRulesUpdatePostProcess` on Update) call `upsertTranslation(...)` for each non-English language, writing into `translated_entries` keyed by the new/updated rule id, table `pricing_rules`, and column.
- **Translation hydrate on read.** Post-processors (`pricingRulesReadPostProcess` on List, `pricingRulesViewPostProcess` on View) re-assemble `{ en, ar }` for each multilingual field via a `translated_entries` join.
- **Tenant join.** List and View LEFT JOIN `tenants` to include `tenant_name`. View matches `pricing_rule_id = {{id}} OR pricing_rule_id IS NULL`.
- **Soft delete.** Delete sets `status = 'inactive'` (does not delete the row); List filters out inactive rows.

---

## Source Files

| File | Purpose |
|---|---|
| `Src/Apis/ProjectSpecificApis/CustomPricing_rules/Crud_Objects/Pricing_rules.js` | API object (`global.CustomPricingRules_object`) — CRUD SQL, multilingual split/hydrate pre/post processors, RBAC permissions |
| `Src/Apis/ProjectSpecificApis/CustomPricing_rules/Crud_Objects/CRUD_parameters.js` | Request parameter schema + `colMapper` |
| `Src/HelperFunctions/PreProcessingFunctions/CustomServices/translationUpsert.js` | `upsertTranslation` helper — writes non-English values to `translated_entries` |
