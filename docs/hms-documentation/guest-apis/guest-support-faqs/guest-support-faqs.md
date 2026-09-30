# Guest Support FAQs

**GET** `/api/guest/support/faqs`

Returns the published FAQ entries for a tenant, optionally narrowed to one support category. Each question and answer is bilingual, so the guest app can render the list in the user's active locale without a second call.

---

## Authentication

Uses **PUBLIC_ENCRYPTED_PLATFORM** — AES-ECB with the platform key only. No guest JWT is required, and the endpoint declares no permission. This endpoint is read-only: staff manage FAQ content through [Support FAQs CRUD](../../admin-apis/support-faqs-crud.md).

Although no login is needed, the endpoint **is tenant-scoped** and will not return anything until it can resolve a tenant. See [Tenant resolution](#tenant-resolution) below.

---

Returns the published FAQ entries for a tenant, optionally narrowed to one support category. Each question and answer is bilingual, so the guest app can render the list in the user's active locale without a second call.

## Request

### Query Parameters

| Parameter | Type | Required | Description |
|---|---|---|---|
| `actionPerformerURDD` | `number` | No | Guest URDD. When present, middleware resolves `tenant_id` from it and that wins over `hotelId`. |
| `hotelId` | `number` | No | Tenant id hint, used only when no URDD-derived tenant is available. **Omit it to get the platform-wide FAQ set.** |
| `category` | `string` | No | Restricts the list to one category. Must be one of `booking`, `payment`, `kyc`, `service`, `other`. |
| `language_code` | `string` | No | Language for `question` / `answer`, default `en`. Falls back to English when no translation exists. |

**Every parameter is optional.** A bare `GET /api/guest/support/faqs` returns the platform-wide FAQ
set, so the guest app can show FAQs before it knows which hotel the guest is looking at. Supplying a
tenant — via `actionPerformerURDD` or `hotelId` — switches to that hotel's own FAQs instead.

| You send | You get |
|---|---|
| neither `actionPerformerURDD` nor `hotelId` | the **platform-wide** FAQs (every FAQ filed under the system tenant) |
| `actionPerformerURDD` (signed-in guest) | that guest's tenant's FAQs |
| `hotelId` | that hotel's FAQs |

The two scopes do not mix: a hotel's own FAQs are returned only when that hotel is identified, and a
hotel's FAQs are never included in the platform-wide set. See [Scope](#scope) for why.

:::note Changed 2026-09-29
The platform-wide set used to be scoped on `created_by = <SaaS Admin URDD>` rather than on the
system tenant's `tenant_id`. That silently hid every FAQ authored by any other staff member —
a Tenant Manager adding an FAQ through
[Support FAQs CRUD](../../admin-apis/support-faqs-crud.md) could see it in the admin list while
guests never received it. The scope is now `tenant_id` on both branches, so the guest list and the
staff list agree.
:::

### Examples

```
GET /api/guest/support/faqs
GET /api/guest/support/faqs?language_code=ar
GET /api/guest/support/faqs?category=booking
GET /api/guest/support/faqs?hotelId=5
GET /api/guest/support/faqs?hotelId=5&category=booking
GET /api/guest/support/faqs?actionPerformerURDD=644
```

---

## Response

### Success (200)

```json
{
  "items": [
    {
      "id": 12,
      "category": "booking",
      "question": "How do I modify or cancel my booking?",
      "answer": "You can modify or cancel your booking up to 24 hours before check-in from the Reservations tab.",
      "sortOrder": 1
    },
    {
      "id": 18,
      "category": "payment",
      "question": "Which payment methods are accepted?",
      "answer": "We accept Mada, Visa, Mastercard, Apple Pay, and STC Pay.",
      "sortOrder": 1
    }
  ],
  "languageCode": "en"
}
```

The same request with `?language_code=ar` returns the Arabic strings in the same fields:

```json
{
  "items": [
    {
      "id": 12,
      "category": "booking",
      "question": "كيف أعدّل أو ألغي حجزي؟",
      "answer": "يمكنك تعديل أو إلغاء حجزك حتى 24 ساعة قبل تسجيل الدخول من تبويب حجوزاتي.",
      "sortOrder": 1
    }
  ],
  "languageCode": "ar"
}
```

### Response Fields

| Field | Type | Description |
|---|---|---|
| `items` | `array` | FAQ entries for the resolved tenant. Empty array when the tenant has none. |
| `items[].id` | `number` | Primary key of the FAQ row. |
| `items[].category` | `string` | One of `booking`, `payment`, `kyc`, `service`, `other`. **Always this machine value, never a translated label** — see [Category labels](#category-labels-frontend-owned). |
| `items[].question` | `string` | Question in the requested language. |
| `items[].answer` | `string` | Answer in the requested language. |
| `items[].sortOrder` | `number` | Display order within the category. |
| `languageCode` | `string` | The language actually applied. |

### Translations

English is stored in the `guest_support_faqs.question` / `.answer` columns; other languages live in `translated_entries`. A missing translation falls back to the English value rather than returning an empty field, so the list never has holes.

**This endpoint returns plain strings, not multilingual objects** — it mirrors the List shape of the staff endpoint [Support FAQs CRUD](../../admin-apis/support-faqs-crud.md), which is also where FAQ content is managed and where multilingual objects are accepted on Add/Update.

### Errors (422)

The two causes are distinguishable by `scc`. **They used to share one body**, which made a missing
`hotelId` look like a bad `category`; split on 2026-09-29.

**`E10` — no scope at all.** Now rare: it needs *both* no resolvable tenant **and** an
unresolvable system tenant, which means the platform's governance seat is missing. Sending no
`hotelId` is fine on its own and returns the platform-wide set.

```json
{
  "statusCode": 422,
  "message": "validation_failed",
  "errorSource": "Guest Support FAQs",
  "errorDescription": "No tenant context and no global FAQ tenant could be resolved.",
  "scc": "E10"
}
```

**`E11` — unsupported category.** A `category` outside `booking`, `payment`, `kyc`, `service`,
`other`. Note the enum is **singular `service`**, not `services`.

```json
{
  "statusCode": 422,
  "message": "invalid_category",
  "errorSource": "Guest Support FAQs",
  "errorDescription": "Unsupported category: services",
  "scc": "E11"
}
```

---

## Category labels (frontend-owned)

`items[].category` is **always the machine value** — `booking`, `payment`, `kyc`, `service`,
`other` — in every language, including `language_code=ar`. Only `question` and `answer` are
localized by this endpoint.

**So the app must hold its own label map to display a category.** Suggested wording, matching the
Arabic seeded in the database:

| Value | English label | Arabic label |
|---|---|---|
| `booking` | Booking | الحجز |
| `payment` | Payment | الدفع |
| `kyc` | Identity verification | التحقق من الهوية |
| `service` | Services | الخدمات |
| `other` | Other | أخرى |

Two rules that follow from this:

- **Render the label, send the value.** `?category=` accepts only the machine value. Sending
  `?category=الحجز` is rejected with `422` / `scc: E11`. Keep the value as the key in your filter
  state and map to a label only at render time.
- **The enum is singular `service`, not `services`.** A plural is a `422`.

Arabic labels for these five values *are* stored in `translated_entries`
(migration `20260929_2` STEP 5, and `20260929_3` for environments where that had already run), but
this endpoint does not read them: `faqTranslations.js` localizes `question` and `answer` only. If a
future release starts serving them it will arrive as an **additional** field alongside the unchanged
`category`, so a client that owns its own labels today will not break.

The staff side behaves identically — see
[Support FAQs CRUD → Category labels](../../admin-apis/support-faqs-crud.md#category-labels-frontend-owned).

---

---

## Behaviour

### Scope

Handled by `resolveGuestPublicTenantId`, in this order:

1. **URDD-derived tenant.** If middleware has already set `tenant_id` on the decrypted payload (from `actionPerformerURDD`), that value is used and `hotelId` is ignored entirely.
2. **`hotelId` hint.** Otherwise the tenant chain is walked with `COALESCE(parent_tenant_id, tenant_id)` against an **active** tenant row, so passing a child property id returns the parent's FAQs. If `hotelId` matches no active tenant, the raw `hotelId` is used as the scope anyway — which normally yields an empty `items` array rather than an error.
3. **Neither — the platform-wide set.** The scope falls back to the **system tenant's** `tenant_id`, resolved by natural key through `getSystemTenantId` (the tenant carrying the active `SYSTEM` + `Admin` URDD). The clause is `tenant_id = ?` on this branch exactly as on the other two — only the value differs.

**Why the tenant and not the owner.** `guest_support_faqs.tenant_id` is `NOT NULL`, so no row is
tenant-agnostic — every FAQ is filed under some tenant, and the platform-wide ones are filed under the
system tenant. Selecting *every* row would hand one hotel's FAQs to another hotel's guests, since a
Tenant Manager can author FAQs for their own property through
[Support FAQs CRUD](../../admin-apis/support-faqs-crud.md); scoping on `tenant_id` keeps those apart,
because a hotel's rows carry that hotel's tenant id.

Scoping on `created_by` would keep them apart too, but it also splits the *system tenant's own* rows
by author — so an FAQ written on the platform tenant by anyone other than the SaaS Admin seat vanished
from the guest list while still appearing in the staff list. Authorship is not scope: who typed an FAQ
says nothing about which guests should see it.

The table's presence in `TENANCY_FILTER_EXEMPT_TABLES` does **not** make it a shared table. That list
only suppresses the automatic `created_by IN (URDDs of acting tenant)` predicate; `guest_support_faqs`
needs the exemption precisely because its platform-wide rows live on the system tenant, so that
predicate would return nothing for any tenant actor. Tenancy on this table is the explicit `tenant_id`
column.

### Sort order depends on whether you filter

The ordering changes with the `category` parameter:

| Request | `ORDER BY` |
|---|---|
| No `category` | `category ASC, sort_order ASC, id ASC` |
| With `category` | `sort_order ASC, id ASC` |

So an unfiltered list arrives grouped by category alphabetically, and within each group in the tenant's configured `sort_order`. A filtered list is a single run of `sort_order`.

### No pagination

`pagination` is `false` on this endpoint. The full FAQ set for the tenant is returned in one response.

---

## Related

- [Support FAQs CRUD](../../admin-apis/support-faqs-crud.md) — the staff-side endpoint that manages these entries
- [Guest Support Contact](../guest-support-contact/guest-support-contact.md) — submit a support ticket, sharing the same category enum
- [Guest Tenant Scoped APIs](../guest-tenant-scoped-apis.md) — how `actionPerformerURDD` and `hotelId` scope public guest endpoints

---

## Source Files

| File | Purpose |
|---|---|
| `Src/Apis/ProjectSpecificApis/GuestSpecificApis/GuestSupportFaqs/GuestSupportFaqs.js` | API object definition |
| `Src/Apis/ProjectSpecificApis/GuestSpecificApis/GuestSupportFaqs/CRUD_parameters.js` | Parameter schema |
| `Src/HelperFunctions/PreProcessingFunctions/Guest/guestSupportFaqsLoad.js` | Query, parsing and sort logic |
| `Src/HelperFunctions/PreProcessingFunctions/Guest/resolveGuestPublicTenantId.js` | Tenant resolution for public guest endpoints |
| `Services/Middlewares/QueryResolver/queryResolver.js` | `getSystemTenantId` — the platform-wide fallback scope |
| `Src/HelperFunctions/PreProcessingFunctions/Guest/guestSupportCategories.js` | Shared category enum |
| `Src/HelperFunctions/Guest/v2/responseShapes.js` | `FAQ_ITEM` response shape |

---

## Change Log

| Date | Change |
|---|---|
| 2026-09-29 | Initial documentation of the existing endpoint |
| 2026-09-29 | Stays read-only for guests — FAQ management moved to the staff-side [Support FAQs CRUD](../../admin-apis/support-faqs-crud.md) |
| 2026-09-29 | Documented that `category` is never translated — the Arabic labels are seeded in the database but not served, so the app owns the value-to-label map. |
