# Guest Support Tickets

| Step | Method | Who | What |
|---|---|---|---|
| `1` (default) | `GET` | staff | **Every** ticket, unscoped — needs `list_guest_support_tickets` |
| `1` (default) | `POST` | guest | Raise a ticket |
| `2` (`?step=2`) | `POST` | staff | Reply to a ticket by email, which closes it — needs `update_guest_support_tickets` |

Creating a ticket stores it, files any non-English text in `translated_entries`, links it to a booking when a booking number is supplied, and emails the request to the property's support address. A staff reply emails the guest and closes the ticket.

**Steps are selected with `?step=N`, 1-based.** Omitting it means step 1, so the guest calls need no change.

---

## Authentication

Uses **AUTH_PLATFORM** — AES-ECB with the guest access token plus the platform key, so a valid JWT is required on every call.

| Step / method | Permission |
|---|---|
| Step 1 `POST` — raise a ticket | **none.** A guest holds no tenant permission, so gating this would make the feature unusable. |
| Step 1 `GET` — list tickets | `list_guest_support_tickets` |
| Step 2 `POST` — staff reply | `update_guest_support_tickets` |

A partner guest URDD (`partnerTenantUrddMap`) is no longer refused on any step here: it may list and raise tickets the same as a normal guest URDD, and step 2 applies its usual permission check.

The ten standard verbs for the entity (`list`, `view`, `export`, `filter`, `search`, `sort`, `add`, `update`, `delete`, `import` + `_guest_support_tickets`) are seeded by `20260930_2_guest_support_tickets_permissions.sql` and granted to **`PG-TENANT-MGMT`** only. `PG-TENANT-MGMT` is never cloned per tenant, so a newly cloned or newly assigned Tenant-Manager RDD inherits them automatically — `syncUserRddSet` reads the group's active grants live at assignment time.

---

## Create a ticket

**POST** `/api/guest/support/tickets`

### Headers

| Header | Required | Description |
|---|---|---|
| `Idempotency-Key` | No | Client-generated key that de-duplicates retries. Trimmed to 64 characters. Send one and a retried submission returns the original ticket instead of opening a second. |

### Query Parameters

| Parameter | Type | Required | Description |
|---|---|---|---|
| `language_code` | `string` | No | Language the guest typed in. Defaults to `en`. See [Multilingual text](#multilingual-text). |

### Body Parameters

| Parameter | Type | Required | Description |
|---|---|---|---|
| `userId` | `number` | Yes | The guest raising the ticket. |
| `idempotencyKey` | `string` | No | Alternative to the `Idempotency-Key` header, for clients that cannot set headers. The header wins when both are sent. |
| `category` | `string` | Yes | One of `booking`, `payment`, `kyc`, `service`, `other`. **Always the machine value, never a translated label.** |
| `subject` | `string` | Yes | Short summary. Trimmed, then truncated to 255 characters. |
| `message` | `string` | Yes | Ticket body. Trimmed, and must be **at least 10 characters** after trimming. |
| `bookingNumber` | `string` | No | A booking reference such as `BK631171334564`. Resolved to the booking's id; see [Booking linking](#booking-linking). |

### Example

```
POST /api/guest/support/tickets?language_code=ar
Idempotency-Key: 8f3c1b90-7c2e-4d55-9c41-2b0a6d9f1e77
```

```json
{
  "userId": 178,
  "category": "kyc",
  "subject": "مشكلة في التحقق",
  "message": "لم أتمكن من إكمال التحقق من الهوية.",
  "bookingNumber": "BK631171334564"
}
```

### Response — `201`

```json
{
  "ticketId": 42,
  "ticketNumber": "TKT301292809593",
  "bookingId": 1,
  "languageCode": "ar",
  "emailSent": true,
  "confirmationSent": true
}
```

| Field | Type | Description |
|---|---|---|
| `ticketId` | `number` | The new ticket. |
| `bookingId` | `number \| null` | The linked booking, or `null` when none was supplied or the number did not match. |
| `languageCode` | `string` | The language actually applied. |
| `emailSent` | `boolean` | Whether the **property** request email went out. **The ticket is saved either way** — see [Support email](#support-email). |
| `confirmationSent` | `boolean` | Whether the **guest** confirmation email went out. `false` when the guest has no email on file or the send failed; the ticket is saved either way. |
| `duplicate` | `boolean` | Present and `true` only when an `Idempotency-Key` matched an existing ticket. No new row was created and no second email was sent. |

---

## Multilingual text

`subject` and `message` are **plain strings**, never locale-keyed objects, and `language_code` alone decides where the text lands. This is the same model the FAQs use — see [Support FAQs CRUD](../../admin-apis/support-faqs-crud.md).

| `language_code` | Where the text goes |
|---|---|
| `en` or omitted | The `subject` / `message` columns only. Nothing is written to `translated_entries`. |
| anything else | The columns **and** `translated_entries` under that language. |

The columns are `NOT NULL` and are the fallback every other language reads through, so a non-English submission fills them too rather than leaving them empty. An Arabic ticket is therefore readable as Arabic from `translated_entries` and still has text in the base columns for anyone reading the table directly.

**`category` is never translated.** It stays the machine value so it keeps passing validation and stays filterable — the frontend owns the display label, exactly as for [FAQ categories](../guest-support-faqs/guest-support-faqs.md#category-labels-frontend-owned).

---

## Booking linking

Send `bookingNumber` (the human-readable reference the guest can see), not an internal id. It is resolved against `bookings.booking_number`, and only a booking owned by the caller (its URDD belongs to the same user) is linked:

| Case | `booking_id` stored | Request outcome |
|---|---|---|
| Number matches one of the caller's bookings | that booking's id | `201` |
| Number matches another user's booking | `null`, treated like an unknown number | `201` |
| Number matches nothing | `null` | `201` — **not** an error |
| `bookingNumber` omitted or empty | `null` | `201` |

A wrong, stale or foreign booking number never blocks a guest from reaching support. The support email flags it as `not found` so the agent can see the guest believed they had a booking.

`booking_id` is a foreign key to `bookings` with **`ON DELETE SET NULL`**, so if the booking is later deleted the ticket survives with `bookingId: null` rather than the delete being blocked — the same end state as a booking number that never matched.

---

## Support email

Every accepted ticket is emailed to the property's support address, resolved in this order:

1. `contact_us.email` inside the active `frontpage_data` row.
2. If that is empty, missing, or the row's JSON will not parse — the platform fallback **`info@my-destination.com`**.

The message carries the ticket number, category, the guest's name and **email address so the agent can reply directly**, the booking number (flagged when unmatched), the language, the subject, and the message body.

### Guest confirmation

**Two emails go out per accepted ticket.** Alongside the request to the property, the guest receives a confirmation that their report was received, carrying the **ticket number**, category, booking number (when matched), subject and their own message, and telling them a reply is coming by email. It is sent **as the platform, not as the hotel** — branded `Destination / Stay with Comfort` via the shared `DESTINATION_BRAND`, the same constant the guest OTP and account-created emails use. The guest's tenant name never appears as the sender, because a support request is handled by the platform rather than by the property.

Reported separately as `confirmationSent`. It is `false` — without affecting the ticket or the property email — when the guest has no address on file, or when the send fails.

Guest-supplied text is HTML-escaped in **both** emails, so a subject or message containing markup cannot inject into the agent's or the guest's mail client.

**Delivery never fails the request.** If the mail transport errors the ticket is still saved and the response returns `emailSent: false` / `confirmationSent: false`, so a mail outage cannot cost a guest their support request. A `duplicate` response sends neither email, and a rate-limited request sends none either.

:::note Language
Both emails are in English today, matching every other transactional email in the system, even when the ticket itself was submitted in Arabic and stored that way. Localising them is a separate piece of work that would apply to all confirmation emails.
:::

---

## List tickets

**GET** `/api/guest/support/tickets`

Returns **all** tickets, newest-updated first, regardless of who raised them. This is the staff
listing — it is what supplies the `ticketId` a step 2 reply needs.

:::warning Staff-only, and permission-gated
The list applies **no ownership or tenancy filter** — it returns every ticket in the table, with each
guest's name, email address and booking reference. It is therefore gated on
**`list_guest_support_tickets`**, held by `PG-TENANT-MGMT` (the Tenant Manager persona). A guest access
token does **not** carry it and receives `403 E41`.

Do not call this from a guest screen. A guest "my tickets" view would need its own scoped endpoint; the
`userId` filter below narrows the result but is not a substitute for the permission, since any holder of
the permission can simply omit it.
:::

| Parameter | Type | Required | Description |
|---|---|---|---|
| `status` | `string` | No | One of `active`, `inactive`, `closed`, `probation`. The legacy values `open` and `resolved` are still accepted and map to `active` and `closed`. Anything else is a `422`. |
| `userId` | `number` | No | Narrows the list to one guest's tickets. Must be a positive integer, otherwise `422`. Omitting it returns every ticket. |

### Response fields

| Field | Type | Description |
|---|---|---|
| `id` | `number` | Ticket id — this is the `ticketId` step 2 takes. |
| `ticketNumber` | `string \| null` | Human-facing reference, `TKT` + 12 digits (e.g. `TKT301292809593`). **This is what outbound email quotes** — show it to guests and staff rather than `id`. |
| `subject` | `string` | As submitted. |
| `message` | `string` | The ticket body. |
| `category` | `string` | Machine value, never translated. |
| `status` | `string` | `active`, `inactive`, `closed` or `probation`. |
| `createdAt` / `lastUpdate` | `string` | ISO-8601 UTC. |
| `userId` | `number` | The ticket's user. |
| `userFullName` | `string \| null` | From `users.first_name` + `last_name`. |
| `userEmail` | `string \| null` | Where a step 2 reply is delivered. |
| `bookingId` | `number \| null` | Resolved booking, if any. |
| `bookingNumber` | `string \| null` | The human-readable reference. |

The list reads the base columns, so a ticket submitted in Arabic lists with the Arabic text the guest typed.

The acting caller's identity no longer affects which rows come back. `userId` in the **request body** still identifies the guest on a `POST`; `userId` in the **query string** is the list filter described above.

:::note
These fields are declared in `SUPPORT_TICKET_ITEM`. The response-shape validator **strips undeclared keys**, so anything added to the query must be added to that shape too or it silently disappears.
:::

---

## Ticket number

Every ticket carries a **`ticketNumber`** — `TKT` followed by 12 digits, generated by the backend on
insert and stored in `guest_support_tickets.ticket_number` behind a UNIQUE index. It follows the same
shape as `bookings.booking_number`: the last 8 digits of the epoch milliseconds plus 4 random digits,
so nothing about the row id is recoverable from it.

**Both outbound emails quote the number, never the raw `id`** — the support-request email to the
property and the staff reply to the guest, in the subject line and in the body. Use it anywhere a
person sees a ticket. `id` remains the value step 2 takes as `ticketId`.

The column is NULLable so that an insert which omits it cannot fail outright, and the API falls back to
`#<id>` if a number is ever missing. In practice `20260930_3` backfilled every pre-existing row, so a
null should not occur.

:::note Backfilled numbers differ in one respect
`20260930_3` backfilled rows created before it ran as `TKT` + `yymmdd` of `created_at` + the zero-padded
id, because a random backfill could collide with itself and abort the migration against the new UNIQUE
index. Those numbers therefore do embed the row id, unlike every number generated since. It affects only
pre-launch rows.
:::

---

## Ticket status

`status` is an ENUM — `active`, `inactive`, `closed`, `probation` — defaulting to **`active`**.

| Value | Meaning |
|---|---|
| `active` | Open, awaiting a reply. Every new ticket starts here. |
| `closed` | A staff reply was delivered (step 2 sets this). |
| `inactive` | Withdrawn or archived without a reply. Nothing sets this yet. |
| `probation` | Reserved for the deferred-delete model used elsewhere in the platform. Nothing sets this yet. |

Before migration `20260930_1` the column was a `varchar` holding `open` / `resolved`; those were mapped to `active` / `closed`. The `status` query parameter still accepts the old names.

---

## Staff reply — step 2

**POST** `/api/guest/support/tickets?step=2`

Emails the ticket's own user and closes the ticket. Same AUTH_PLATFORM encryption as step 1, gated on `update_guest_support_tickets`.

### Body Parameters

| Parameter | Type | Required | Description |
|---|---|---|---|
| `ticketId` | `number` | Yes | The ticket being answered — the `id` from the list. |
| `replyMessage` | `string` | Yes | The reply. Trimmed, minimum 10 characters. |
| `replySubject` | `string` | No | Overrides the default subject, `Re: <ticket subject> (ticket #<id>)`. Truncated to 255 characters. |

### Example

```
POST /api/guest/support/tickets?step=2
```

```json
{
  "ticketId": 42,
  "replyMessage": "We have reset your key card, please collect it at reception."
}
```

### Response — `200`

```json
{
  "ticketId": 42,
  "status": "closed",
  "emailSent": true,
  "sentTo": "guest@example.com"
}
```

The email goes to `users.email` for the ticket's `user_id`, quotes the original subject, category, booking number and message, and `updated_by` records the acting staff URDD.

### Closing is conditional on delivery

**The ticket is only closed once the mail transport confirms the send.** A failed send returns `502` with `errorDescription: "Reply was not delivered, ticket left open"` and the status stays `active`, so a mail outage can never silently swallow a guest's request. This is the opposite of ticket *creation*, where delivery is best-effort because the guest's ticket must survive a mail failure.

Replying to an already-`closed` ticket is a no-op: it returns `alreadyClosed: true`, sends nothing, and changes nothing.

### Step 2 errors

| Status | `errorDescription` | Cause |
|---|---|---|
| `422` | `ticketId required` | Absent or not a positive number |
| `422` | `replyMessage must be at least 10 characters` | Too short after trimming |
| `404` | `No such ticket` | No ticket with that id |
| `422` | `The ticket's user has no email address on file` | Nowhere to deliver |
| `502` | `Reply was not delivered, ticket left open` | Mail transport failed |

---

## Rate limit

A guest may open **5 tickets per hour**. The sixth is rejected with `429` and no email is sent. The limit is shared with [Guest Support Contact](../guest-support-contact/guest-support-contact.md), which writes to the same table — so the two endpoints cannot be used to double the allowance.

---

## Errors

| Status | `errorDescription` | Cause |
|---|---|---|
| `422` | `userId required` | Absent or not a positive number |
| `422` | `invalid category` | Outside the allowed set |
| `422` | `subject required` | Absent, empty, or whitespace-only |
| `422` | `message must be at least 10 characters` | Too short after trimming |
| `429` | `More than 5 tickets in the last hour` | Rate limit |

---

## Related

- [Guest Support Contact](../guest-support-contact/guest-support-contact.md) — the older create endpoint on the same table, which requires an `Idempotency-Key` and takes a numeric `bookingId`
- [Guest Support FAQs](../guest-support-faqs/guest-support-faqs.md) — self-service answers, same category enum
- [Support FAQs CRUD](../../admin-apis/support-faqs-crud.md) — the staff side, and the source of the multilingual model used here

---

## Source Files

| File | Purpose |
|---|---|
| `Src/Apis/ProjectSpecificApis/GuestSpecificApis/GuestSupportTickets/GuestSupportTickets.js` | API object |
| `Src/Apis/ProjectSpecificApis/GuestSpecificApis/GuestSupportTickets/CRUD_parameters.js` | Parameter schema |
| `Src/HelperFunctions/PreProcessingFunctions/Guest/guestSupportTicketsCreate.js` | Create: validation, translations, booking lookup, email |
| `Src/HelperFunctions/PreProcessingFunctions/Guest/guestSupportTicketsLoad.js` | List, with the user and booking join |
| `Src/HelperFunctions/PreProcessingFunctions/Guest/guestSupportTicketReply.js` | Step 2: staff reply and close |
| `Src/HelperFunctions/Guest/v2/responseShapes.js` | `SUPPORT_TICKET_ITEM` — undeclared keys are stripped |
| `data/migrations_completed/20260930_1_guest_support_tickets_status_enum_metadata.sql` | status ENUM + `created_by` / `updated_by` |
| `Src/HelperFunctions/PreProcessingFunctions/Guest/guestSupportCategories.js` | Shared category enum |
| `Src/HelperFunctions/PreProcessingFunctions/CustomServices/translationUpsert.js` | Translation upsert |
| `Services/SysFunctions/sendEmail.js` | Mail transport |

---

## Change Log

| Date | Change |
|---|---|
| 2026-09-29 | Added `POST` — multilingual subject/message by `language_code`, `bookingNumber` resolution, and the support email with the `frontpage_data` recipient and `info@my-destination.com` fallback |
| 2026-09-30 | `status` became an ENUM (`active`/`inactive`/`closed`/`probation`, default `active`); added `created_by`/`updated_by`; List now returns the user's id, full name and email plus the booking number and message; added **step 2**, a staff reply that emails the guest and closes the ticket only on a confirmed send |
| 2026-09-30 | `booking_id` narrowed to `int` and given a foreign key to `bookings` with `ON DELETE SET NULL` |
| 2026-10-07 | `bookingNumber` now links only a booking owned by the caller; another user's booking number is treated as unknown (`booking_id` null, email shows "(not found)"). Partner guest URDDs are no longer refused on list, create or reply (previously `403 partner_guest_read_only`) |
