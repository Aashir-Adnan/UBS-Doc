# Support FAQs CRUD

Staff-side management of the FAQ entries that [Guest Support FAQs](../guest-apis/guest-support-faqs/guest-support-faqs.md) serves publicly.

**Base path:** `/api/support-faqs-crud`

Path segments are PascalCased and concatenated to resolve the API object, so `/api/support/faqs/crud` reaches the same endpoint.

---

## Endpoints Overview

| Method | Path | Operation | Permission |
|---|---|---|---|
| `GET` | `/api/support-faqs-crud` | List | `list_guest_support_faqs` |
| `GET` | `/api/support-faqs-crud?id=<id>` | View | `view_guest_support_faqs` |
| `POST` | `/api/support-faqs-crud` | Add | `add_guest_support_faqs` |
| `PUT` | `/api/support-faqs-crud` | Update | `update_guest_support_faqs` |
| `DELETE` | `/api/support-faqs-crud` | Delete | `delete_guest_support_faqs` |

---

## Authentication

Two-layer AES with the **access token plus the platform key**. Every call requires a valid staff JWT, and `verification.accessToken` is on, so the token is validated rather than merely used as key material. The endpoint inherits its platform block from the shared staff `Crud_Template`, so it behaves exactly like every other admin CRUD — same encryption, same IP/domain allowlists, same pagination.

This is the deliberate difference from the guest endpoint: guests read FAQs over `PUBLIC_ENCRYPTED_PLATFORM` with no token, while all management happens here behind a JWT.

---

## Tenant scoping

**Every operation is hard-scoped to the acting user's tenant.** The tenant is re-derived from `actionPerformerURDD` on each request and written over anything the payload supplied, so a `tenant_id` sent in the body is ignored rather than trusted.

- List and View only ever return rows where `tenant_id` matches the actor's tenant.
- Add stamps that tenant on the new row.
- Update and Delete carry `AND tenant_id = {{tenant_id}}`, and the row is checked before the statement runs — a row in another tenant returns `404`, not `403`, so existence is not leaked across tenants.
- An actor whose URDD resolves no tenant is refused with `400` before any SQL runs.

`guest_support_faqs` carries `tenant_id` directly rather than a `created_by` URDD, so the usual `makeTenantOwnershipPreProcess` ownership hop does not apply here.

---

## Field naming

This CRUD follows the **generated staff-API convention** used by Bookings, Packages, Plan Groups and the rest of the admin surface: every column is keyed `guestSupportFaqs_<columnInCamelCase>`, both in the request body and in the response.

| Column | Key |
|---|---|
| `id` | `guestSupportFaqs_id` (plus a bare `id` on reads) |
| `tenant_id` | `guestSupportFaqs_tenantId` |
| `category` | `guestSupportFaqs_category` |
| `question` | `guestSupportFaqs_question` |
| `answer` | `guestSupportFaqs_answer` |
| `sort_order` | `guestSupportFaqs_sortOrder` |
| `created_by` / `updated_by` | `guestSupportFaqs_createdBy` / `guestSupportFaqs_updatedBy` |
| `created_at` / `updated_at` | `guestSupportFaqs_createdAt` / `guestSupportFaqs_updatedAt` |

Three keys are not column-prefixed, matching every other staff CRUD: `actionPerformerURDD`, `language_code`, and the `id` query parameter that switches a `GET` from List to View.

**`return` is always an array of row objects** — never an `{ items: [...] }` wrapper. List pagination is read from `table_count` on each row, as on every other staff list.

**`guestSupportFaqs_question` and `guestSupportFaqs_answer` are always plain strings**, in every direction and on every operation. There is no locale-object shape — `language_code` alone decides which language a request reads or writes. Sending `{ "en": "...", "ar": "..." }` is rejected with `422`.

---

## List

**GET** `/api/support-faqs-crud`

Paginated, 10 per page by default. Ordered by `category`, then `sort_order`, then `id`.

| Parameter | Type | Required | Description |
|---|---|---|---|
| `page_no` | `number` | No | Page number, 1-based |
| `page_size` | `number` | No | Rows per page. Omit for all rows. |
| `sort_by` / `sort_order` | `string` | No | Standard staff-list sorting. Takes a `guestSupportFaqs_*` key. Omit it and the list is ordered by category, then `sortOrder`, then id. |
| `filter_columns_or` / `filter_values_or` | `string` | No | Standard staff-list search. `["all"]` searches every column. |
| `filter_columns_and` / `filter_values_and` | `string` | No | Standard staff-list filtering, by `guestSupportFaqs_*` key. |
| `language_code` | `string` | No | Locale for `question` / `answer`. Defaults to `en`. |

`return` is the row array itself:

```json
[
  {
    "table_count": 13,
    "guestSupportFaqs_id": 81,
    "id": 81,
    "guestSupportFaqs_tenantId": 1,
    "guestSupportFaqs_category": "booking",
    "guestSupportFaqs_question": "How do I modify or cancel my booking?",
    "guestSupportFaqs_answer": "You can modify or cancel your booking up to 24 hours before check-in...",
    "guestSupportFaqs_sortOrder": 1,
    "guestSupportFaqs_createdBy": 1,
    "guestSupportFaqs_updatedBy": 1,
    "guestSupportFaqs_createdAt": "2026-09-29T10:31:33.000Z",
    "guestSupportFaqs_updatedAt": "2026-09-29T10:31:33.000Z",
    "tenants_tenantName": "My-Destination"
  }
]
```

`table_count` comes from `COUNT(*) OVER ()` and is the total for the tenant, not the page. On List, `question` and `answer` are **plain strings** in the requested language.

---

## View

**GET** `/api/support-faqs-crud?id=<id>`

| Parameter | Type | Required | Description |
|---|---|---|---|
| `id` | `number` | Yes | FAQ id, must belong to the acting tenant |

`language_code` selects the language, exactly as on List.

Returns a **one-element array** in the List row shape, minus `table_count` — same keys, same plain strings:

```json
[
  {
    "guestSupportFaqs_id": 81,
    "id": 81,
    "guestSupportFaqs_tenantId": 1,
    "guestSupportFaqs_category": "booking",
    "guestSupportFaqs_question": "How do I modify or cancel my booking?",
    "guestSupportFaqs_answer": "You can modify or cancel...",
    "guestSupportFaqs_sortOrder": 1,
    "guestSupportFaqs_createdBy": 1,
    "guestSupportFaqs_updatedBy": 1,
    "guestSupportFaqs_createdAt": "2026-09-29T10:31:33.000Z",
    "guestSupportFaqs_updatedAt": "2026-09-29T10:31:33.000Z",
    "tenants_tenantName": "My-Destination"
  }
]
```

An `id` that does not exist, or belongs to another tenant, returns `[]`.

---

## Add

**POST** `/api/support-faqs-crud`

| Parameter | Type | Required | Description |
|---|---|---|---|
| `guestSupportFaqs_category` | `string` | Yes | One of `booking`, `payment`, `kyc`, `service`, `other` |
| `guestSupportFaqs_question` | `string` | Yes | Plain text, in `language_code` |
| `guestSupportFaqs_answer` | `string` | Yes | Plain text, in `language_code` |
| `guestSupportFaqs_sortOrder` | `number` | No | Integer, defaults to `0` |
| `language_code` | `string` | No | Language the text is written in. Defaults to `en`. |

`guestSupportFaqs_tenantId` is never read from the body.

```json
{
  "actionPerformerURDD": 587,
  "guestSupportFaqs_category": "booking",
  "guestSupportFaqs_question": "Can I change my check-in date?",
  "guestSupportFaqs_answer": "Yes, subject to availability.",
  "guestSupportFaqs_sortOrder": 10
}
```

`return` carries the driver metadata plus the new id, as an array:

```json
[{ "insertId": 94, "affectedRows": 1, "id": 94, "guestSupportFaqs_id": 94 }]
```

**Create always fills the base column**, whatever `language_code` says, because `question` / `answer` are `NOT NULL` and the column is the fallback every other language reads through. When `language_code` is not `en`, the same text is *also* upserted into `translated_entries` under that language.

So an Arabic-first create is readable in both `ar` (from the translation) and `en` (the Arabic text, standing in as the fallback). Send an English Update afterwards to give it a real English value.

---

## Update

**PUT** `/api/support-faqs-crud`

| Parameter | Type | Required | Description |
|---|---|---|---|
| `id` | `number` | Yes | FAQ id, must belong to the acting tenant |
| `guestSupportFaqs_category` | `string` | No | As above |
| `guestSupportFaqs_question` | `string` | No | Plain text, in `language_code` |
| `guestSupportFaqs_answer` | `string` | No | Plain text, in `language_code` |
| `guestSupportFaqs_sortOrder` | `number` | No | As above |
| `language_code` | `string` | No | Language being edited. Defaults to `en`. |

**`language_code` decides where the text lands.** `en` (or omitted) writes the base column; any other language writes only `translated_entries` for that language and leaves the base column exactly as it was. Editing the Arabic copy can therefore never damage the English one, and vice versa.

**Update is a true partial update.** Each column is written as `COALESCE(<field>, column)`, so a field absent from the payload keeps its stored value instead of being blanked. The same applies to translations — omitting the answer leaves its existing Arabic row untouched. Re-saving updates the existing `translated_entries` row rather than adding a duplicate.

`return` mirrors Add:

```json
[{ "affectedRows": 1, "changedRows": 1, "id": 94, "guestSupportFaqs_id": 94 }]
```

---

## Delete

**DELETE** `/api/support-faqs-crud`

| Parameter | Type | Required | Description |
|---|---|---|---|
| `id` | `number` | Yes | FAQ id, must belong to the acting tenant |

This is a **hard delete** — `guest_support_faqs` has no `status` column, so there is no soft-delete or probation state and the row cannot be restored from the application. The row's `translated_entries` are removed in the same pass.

```json
[{ "affectedRows": 1, "id": 94, "guestSupportFaqs_id": 94 }]
```

---

## Translations

English lives in the `guest_support_faqs.question` / `.answer` columns; every other language lives in `translated_entries` keyed by `(record_id, table_name='guest_support_faqs', column_name, language_code_id)`. This is the same model `pricing_rules`, `services` and `delivery_unit_details` use.

| Operation | `guestSupportFaqs_question` / `_answer` |
|---|---|
| List / View | Plain string in `language_code` (default `en`), falling back to the base column when that language has no translation |
| Update | Plain string. `en` writes the base column; any other language writes only `translated_entries` |
| Add | Plain string. Always seeds the base column; a non-`en` language additionally writes `translated_entries` |

To populate a FAQ in several languages, send one Update per language.

The guest endpoint [Guest Support FAQs](../guest-apis/guest-support-faqs/guest-support-faqs.md) keeps its own unprefixed, `{ items, table_count, languageCode }` shape — it is a public guest surface, not part of the admin list contract — but localizes through the same helper.

---

## Category labels (frontend-owned)

`guestSupportFaqs_category` is **always the machine value** — `booking`, `payment`, `kyc`,
`service`, `other` — on every operation and in every language, including `language_code=ar`. Only
`guestSupportFaqs_question` and `guestSupportFaqs_answer` are localized.

**So the admin screen must hold its own label map.** Suggested wording, matching the Arabic seeded in
the database:

| Value | English label | Arabic label |
|---|---|---|
| `booking` | Booking | الحجز |
| `payment` | Payment | الدفع |
| `kyc` | Identity verification | التحقق من الهوية |
| `service` | Services | الخدمات |
| `other` | Other | أخرى |

Three rules that follow from this:

- **Render the label, send the value.** Add and Update validate the category against the enum, so a
  payload carrying `الحجز` is rejected with `422 invalid category`. Keep the machine value in form
  state and map to a label only at render time.
- **Same for sorting and filtering.** `filter_columns_and: ["guestSupportFaqs_category"]` matches on
  the stored column, so its value must be the machine value too.
- **The enum is singular `service`, not `services`.** A plural is a `422`.

Arabic labels for these five values *are* stored in `translated_entries`
(migration `20260929_2` STEP 5, and `20260929_3` for environments where that had already run), but
this API does not read them: `faqTranslations.js` localizes `question` and `answer` only. If a future
release starts serving them it will arrive as an **additional** field alongside the unchanged
`guestSupportFaqs_category`, so a client that owns its own labels today will not break.

The guest endpoint behaves identically — see
[Guest Support FAQs → Category labels](../guest-apis/guest-support-faqs/guest-support-faqs.md#category-labels-frontend-owned).

---


---

## Permissions

The entity carries the standard ten-verb set. Five are checked by this API; the rest exist for the admin UI's list controls.

| Permission | Checked by | PG-FRAMEWORK | PG-TENANT-MGMT | PG-TENANT-ADMIN |
|---|---|:--:|:--:|:--:|
| `list_guest_support_faqs` | List | ✓ | ✓ | · |
| `view_guest_support_faqs` | View | ✓ | ✓ | · |
| `export_guest_support_faqs` | — | ✓ | ✓ | · |
| `filter_guest_support_faqs` | — | ✓ | ✓ | · |
| `search_guest_support_faqs` | — | ✓ | ✓ | · |
| `sort_guest_support_faqs` | — | ✓ | ✓ | · |
| `add_guest_support_faqs` | Add | · | ✓ | · |
| `update_guest_support_faqs` | Update | · | ✓ | · |
| `delete_guest_support_faqs` | Delete | · | ✓ | · |
| `import_guest_support_faqs` | — | · | ✓ | · |

Two rules shape this matrix:

- **SaaS Admin (PG-FRAMEWORK) is read-only by design** — it can audit any tenant's FAQ content but never edit it.
- **Tenant Admin (PG-TENANT-ADMIN) holds none of these.** Only SaaS Admin and Tenant Manager may reach this endpoint. The permissions were granted to Tenant Admin in an earlier revision and are now deactivated at both the group and URDP layers, so existing Tenant Admin seats receive `E41` here.

---

## Errors

| Status | `errorDescription` | Cause |
|---|---|---|
| `400` | `No tenant context for this actor` | `actionPerformerURDD` missing, or its URDD resolves no tenant |
| `404` | `FAQ not found for this tenant` | `id` does not exist, or belongs to another tenant |
| `422` | `id required` / `invalid id` | Missing or non-positive `id` |
| `422` | `category required` / `invalid category` | Category absent on Add, or outside the allowed set |
| `422` | `question required` | Absent, empty, or whitespace-only on Add |
| `422` | `question must be a string` | An object or array was sent — the old locale-map shape |
| `422` | `invalid sortOrder` | Not an integer |

The answer field produces the same messages as the question field. Error messages name the bare column (`question`, `answer`, `category`, `sortOrder`), not the prefixed payload key.

---

## Related

- [Guest Support FAQs](../guest-apis/guest-support-faqs/guest-support-faqs.md) — the public, read-only guest view of the same rows
- [Guest Support Contact](../guest-apis/guest-support-contact/guest-support-contact.md) — shares the same category enum

---

## Source Files

| File | Purpose |
|---|---|
| `Src/Apis/ProjectSpecificApis/SupportFaqsCrud/SupportFaqsCrud.js` | API object definition |
| `Src/Apis/ProjectSpecificApis/SupportFaqsCrud/CRUD_parameters.js` | Parameter schema |
| `Src/HelperFunctions/PreProcessingFunctions/SupportFaqsCrud/validateSupportFaq.js` | Validation and tenant re-derivation |
| `Src/HelperFunctions/PreProcessingFunctions/SupportFaqsCrud/faqTranslations.js` | Localize / hydrate / upsert translations |
| `Src/HelperFunctions/PostProcessingFunctions/SupportFaqsCrud/shapeSupportFaq.js` | List localization, View hydration, translation persistence |
| `Src/HelperFunctions/PreProcessingFunctions/Guest/guestSupportCategories.js` | Shared category enum |
| `data/migrations/pending/20260929_2_guest_support_faqs_metadata_rename_seed.sql` | Column rename, metadata columns, curated seed, Arabic category labels (STEP 5) |
| `data/migrations_completed/20260929_3_guest_support_faqs_category_ar.sql` | Arabic category labels, standalone, for environments where `20260929_2` already ran |
| `data/migrations_completed/20260929_1_guest_support_faqs_permissions.sql` | Seeds the ten permissions, group grants and URDP materialization |

---

## Change Log

| Date | Change |
|---|---|
| 2026-09-29 | Initial implementation — staff CRUD on AUTH_PLATFORM, replacing the short-lived write operations on the guest endpoint |
| 2026-09-29 | Revoked all FAQ permissions from Tenant Admin — only SaaS Admin and Tenant Manager retain access |
| 2026-09-29 | Moved to the standard translation model — `question_json`/`answer_json` renamed to `question`/`answer`, English in the column and other languages in `translated_entries`; added `language_code` to List and multilingual objects on View/Add/Update |
| 2026-09-29 | Adopted the generated staff-API response contract — every column keyed `guestSupportFaqs_<camelColumn>`, and `return` is a bare array of rows instead of an `{ items, table_count, languageCode }` wrapper |
| 2026-09-29 | Dropped the locale-object shape — question and answer are plain strings on every operation, and `language_code` alone selects the language read or written |
| 2026-09-29 | Seeded Arabic labels for the five category values into `translated_entries`; the API still returns the machine value, so category display labels stay on the frontend |
| 2026-09-29 | **Fixed:** `page_no` was ignored and every page returned all rows. The endpoint had overridden its platform config with the guest `AUTH_PLATFORM`, whose `features.pagination` is `false`; it now inherits the staff `Crud_Template` block. Authentication is unchanged — still platform key + validated JWT. |
| 2026-09-29 | **Fixed:** list search (`filter_columns_or=["all"]`) returned `500 ER_PARSE_ERROR`, because the List query's trailing `ORDER BY` sat in front of the filter conditions the pagination layer appends. The query no longer carries an `ORDER BY`; the same three-column order is applied through `sort_by` instead, so results are unchanged. `colMapper` is now populated, so `sort_by` and `filter_columns_and` accept the `guestSupportFaqs_*` keys directly. |
| 2026-09-29 | Documented that `guestSupportFaqs_category` is never translated — the Arabic labels are seeded in the database but not served, so the admin screen owns the value-to-label map. |
