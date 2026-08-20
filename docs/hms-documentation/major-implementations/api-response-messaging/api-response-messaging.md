---
title: "API Response Messaging"
sidebar_position: 1
---

# API Response Messaging — where the user-facing sentence comes from

> **Scope:** How the sentence a user actually reads is produced. The DB message catalog
> (`apis`, `api_messages`, `api_message_map`, `error_codes`), the resolution query and its
> precedence ladder, where SCCs come from, the priority scale, the fallback chain, and how to
> register a new endpoint.
>
> **Code:** `Services/SysFunctions/messageCatalog.js` (the resolver),
> `Services/Middlewares/config.js` (success), `Services/Integrations/Database/Errorlog.js`
> (error), `Services/SysFunctions/MessageTemplates.js` (SCC classification).
> **Backend docs:** `docs/system_context/18_api_response_messaging.md` (same document),
> `docs/system_context/11_localization_en_ar.md` (translations generally),
> `docs/response-localization/` (deep dives).

## The one rule

**No user-facing message is written in code.** Every sentence the user reads comes from a
`api_messages` row resolved at response time in the request's language. Code-side strings —
`apiObject.response.successMessage`, a thrown `Error`'s message — are **developer detail**.
They ride along in the envelope for debugging but are never the primary text.

The practical consequence: *adding a language, or rewording a message, is an INSERT — never a
deploy.*

## Two texts in every response

Both success and error envelopes carry the same two slots, and they are deliberately crossed
over so neither audience loses its text:

```jsonc
// error envelope (HTTP 400, from a real request)
{
  "success": false,
  "data": null,
  "meta": {
    "message": "The verification code is incorrect. Please try again.",   // ← CATALOG (user)
    "status": 400,
    "detail": "WARN_DATA_TRUNCATED: Data truncated for column 'platform_version_id'…", // ← code
    "priority": 2,
    "source": "OTP Verification",
    "scc": "E42"
  },
  "error": {
    "message": "WARN_DATA_TRUNCATED: Data truncated for column…",  // ← code (developer)
    "detail": "The verification code is incorrect. Please try again.",  // ← catalog
    "code": "E42",
    "source": "OTP Verification"
  }
}
```

| Slot | Source | Audience |
|---|---|---|
| `meta.message` | the catalog row | the user — render this |
| `meta.detail` / `error.message` | the thrown `Error`'s message | developers, logs |
| `meta.scc` / `error.code` | the System Condition Code | the frontend, for branching |
| `meta.priority` | the catalog row's `message_priority` | how loudly to render it |

> A frontend that renders `error.message` shows the user a raw driver string. Render
> `meta.message`; branch on `meta.scc`.

## The four tables

```
apis ──< api_message_map >── api_messages
             │
             └── error_codes        translated_entries (per language)
```

### `apis` — one row per endpoint
| Column | Notes |
|---|---|
| `object_name` | **The join key.** e.g. `ConsolidateAllPossibleValues_object` |
| `api_url` | documentation only — nothing resolves through it |
| `api_name` | human label |
| `status` | `inactive` ⇒ the endpoint falls back to the generic rows |

`object_name` is **derived from the request URL**, not declared. `messageCatalog.deriveObjectName`
mirrors `config.js › getApiObject`: strip `/api/`, drop numeric segments (path params),
`toPascal` each remaining segment (splitting on `-` only), join, append `_object`.

```
/api/consolidate-all-possible-values  → ConsolidateAllPossibleValues_object
/api/custom/users/grouped/crud        → CustomUsersGroupedCrud_object
/api/services/12/catalog              → ServicesCatalog_object   (12 dropped)
```

**Renaming a route renames the object and silently orphans its catalog rows.** The endpoint
keeps working; it just answers with the generic sentence again.

### `api_messages` — the sentences
| Column | Notes |
|---|---|
| `message_text` | the English base (other languages live in `translated_entries`) |
| `message_type` | `success` \| `error` |
| `message_priority` | 0–4, see below — a property of the **sentence**, not the link |
| `operation` | `All` \| `Add` \| `List` \| `View` \| `Update` \| `Delete` \| `Query` |
| `status` | `inactive` ⇒ skipped |

Rows are **shared across endpoints** — 1578 of them are linked from more than one API. That is
the point: "The item has been created." serves hundreds of CRUDs.

### `api_message_map` — the bridge, and where the situation lives
| Column | Notes |
|---|---|
| `api_id` → `apis.id` | which endpoint |
| `message_id` → `api_messages.id` | which sentence |
| `step` | grouped-CRUD step (0-based). **NULL = any step** |
| `error_code_id` → `error_codes.id` | **NULL = any SCC** |

`step` and `error_code_id` sit on the **link**, not on the message, because each describes
*what api X says in situation Y* — a property of the relationship. That is how one shared
generic row serves every step and every SCC of every endpoint.

**This is the mechanism to reach for:** add a link with an `error_code_id`, and the message that
link points at is what the user sees for that SCC on that endpoint — overriding the endpoint's
own catch-all.

### `error_codes` — the SCC catalog
| Column | Notes |
|---|---|
| `code` | the SCC as it appears on the wire (`E10`, `DUPLICATE`, `rate_limited`) |
| `error_class`, `http_status`, `description` | documentation |
| `status` | `inactive` ⇒ the link stops matching |

SCCs are **not all `E##`** — named codes (`DUPLICATE`, `service_not_found`, `rate_limited`,
`unauthenticated`, `DURATION_NOT_DIVISIBLE`) are first-class and resolve identically.

## Resolution

`messageCatalog.resolveApiMessage({ objectName, operation, type, lang, step, scc })` runs **one
indexed query** and returns `{ text, priority }` or `null`.

Precedence, most specific first:

| # | Tie-break | Why |
|---|---|---|
| 1 | **exact SCC** (`ec.code = ?`) | a link naming this error beats everything — "The room could not be removed." is the wrong answer to a permission failure |
| 2 | **link count ASC** | a row belonging to this endpoint alone beats a shared one |
| 3 | **exact step** | an explicit step beats the any-step wildcard |
| 4 | **exact operation** | beats the `All` catch-all |
| 5 | `message_priority DESC`, `id DESC` | deterministic |

Matching rules worth internalising:

- `(b.step = ? OR b.step IS NULL)` — NULL links serve every step.
- `(b.error_code_id IS NULL OR ec.code = ?)` — a NULL link serves **every** SCC, so an endpoint
  needs only one error row to answer codes it never raises itself (`E22`, `E99`, `rate_limited`…).
- `(m.operation = ? OR m.operation = 'All')` — `All` also covers endpoints where the operation
  isn't resolved (non-CRUD custom endpoints pass `operation = null`).
- On success `scc` is null, so `ec.code = ?` is never true and only NULL-SCC links match.

### Language
The query `LEFT JOIN`s `translated_entries` on
`(table_name='api_messages', column_name='message_text', record_id=<message id>, language_code_id=<lang>)`
and `COALESCE`s onto `message_text`. Missing translation ⇒ English base **plus** a
`[messageCatalog] missing <lang> translation` warning. Language comes from `?language_code=`,
default `en`.

## Where the SCC comes from

1. **The thrower sets it** — `Object.assign(new Error(msg), { statusCode: 400, scc: 'E10' })`.
   This is the norm in preProcess helpers.
2. **`classifyError`** (`SysFunctions/MessageTemplates.js`) fills gaps: a known MySQL driver
   code maps to its SCC; a `"x is required"` message becomes `E10`/400; anything else stays a
   system fault. It **skips anything already classified**, except it will reclassify the default
   `E99`.
3. **Default** — `E99` when nothing else applies; `unauthenticated` for a 401 in the OTP handler.

## The priority scale

`message_priority` is the container the frontend renders. It lives on the **message**, so a
sentence carries its own volume.

| Value | Meaning | Rows (dev) |
|---|---|---|
| 0 | silent | 338 |
| 1 | toast, auto-dismiss | 392 |
| 2 | toast, persists | 1583 |
| 3 | modal, auto-dismiss | 5 |
| 4 | modal, persists | 341 |

The consequence is deliberate: a sentence two endpoints want to speak at **different volumes**
must exist as two rows, each linked from the endpoint that wants it. Duplicating a handful of
rows is the accepted cost of keeping priority readable on the row itself.

## Fallback chain

```
endpoint's own row (resolveApiMessage)
      ↓ null
shared generic row  (resolveGenericMessage → api_messages id 11 success / 12 error)
      ↓ null
hardcoded last resort ("Request processed successfully." / "Request failed")
```

Ids **11** and **12** are load-bearing constants in `messageCatalog.GENERIC_ID`. They exist so
that even a request whose object can't be resolved (unknown URL → 404) still answers from the
DB, and stays translatable.

## Call sites

| Path | File | Notes |
|---|---|---|
| success | `Middlewares/config.js › responseSender` | resolves, then falls back to id 11 |
| error | `Middlewares/middlewares.js` → `Database/Errorlog.js` | middlewares resolves into `ctx.apiMessage`; Errorlog falls back to id 12 |
| file downloads | `Integrations/FileHandling/fileHandler.js` | same pair |

`operation` is attached to the object by `ApiObjectsGenerator` so the resolver can read it.

## Registering a new endpoint

Four inserts, all by natural key — **never a literal PK**, since ids differ between dev and
live. Worked example:
`data/migrations/pending/20260819_1_register_consolidate_all_possible_values_api.sql`.

1. **`apis`** — `object_name` (derive it from the URL, exactly), `api_url`, `api_name`.
2. **`api_messages`** — at minimum one `success` and one `error` row for the endpoint's
   operation, plus one row per SCC that deserves its own sentence.
3. **`error_codes`** — only if the endpoint introduces a **new** SCC. Reusing `E10`/`E50` needs
   nothing here.
4. **`api_message_map`** — one link per message: `error_code_id NULL` for the success row and
   the catch-all error row, and a link per SCC-specific message.
5. **`translated_entries`** — the Arabic mirror of each new sentence (see below).

Idempotency pattern — guard every insert with `NOT EXISTS` on the natural key, reading the
target table through a derived table (MySQL rejects a direct self-reference in
`INSERT ... SELECT`, `ER_UPDATE_TABLE_USED`):

```sql
INSERT INTO api_messages (message_text, message_type, message_priority, operation, status)
SELECT * FROM (
  SELECT 'The available durations have loaded.' AS message_text, 'success' AS message_type,
         0 AS message_priority, 'Add' AS operation, 'active' AS status
) AS t
WHERE NOT EXISTS (
  SELECT 1 FROM (SELECT message_text, message_type, operation FROM api_messages) AS x
   WHERE x.message_text = t.message_text AND x.message_type = t.message_type
     AND x.operation = t.operation
);
```

Verify by running the resolver's own query in a transaction and rolling back — asserting the
right sentence comes back for each SCC is the only real proof the links are correct.

### Translations
Arabic only, in practice: every one of the 2659 `api_messages` rows has an `ar` translation and
**none** has `ur`. Follow the catalog's established templates rather than translating fresh —
`"… have loaded."` → `"تم تحميل … بنجاح."`, `"… could not be found."` → `"تعذّر العثور على …."` —
and end each string with **U+200F (RLM)**, as every existing row does, so the trailing period
renders on the correct side.

Seeding a translation also **pins the wording**: `translateAllOnStart` leaves an existing active
`translated_entries` row alone, so it will not machine-translate over it.

## Gotchas

- **The URL is the key.** Rename a route → new `object_name` → orphaned rows, silently.
- **An endpoint with no `apis` row is not broken**, it is merely generic. That makes a missing
  registration easy to miss — the tell is "Your request could not be completed." in production.
- **`meta.detail` is developer text and it *is* on the wire.** Keep thrown-error messages
  presentable; assume someone will surface them.
- **A shared sentence cannot have two volumes.** Wanting a different `message_priority` means a
  new row, not a new link.
- **SCC-specific links are per endpoint.** Adding `E31` text for one API does nothing for another.
- **`status = 'inactive'`** on the api, the message, or the error code all silently drop the
  match back to the next candidate.
