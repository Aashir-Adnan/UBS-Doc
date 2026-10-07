---
title: Server Logs
---

# Server Logs

The running server's console output, paged, filterable by time, and streamable.

`GET /api/logs`

Available only when `LOG_MODE=file` — in terminal mode nothing is buffered and the
endpoint reports an error. The frontend surface is the Server Logs page.

---

## Authentication & Authorization

| | |
|---|---|
| Platform | Admin dashboard default |
| Encryption | Platform + access token |
| Access token verification | off |
| Permission | none |

Filters are sent in the request **body**. On a GET the body is AES-encrypted into the
`encryptedRequest` header, so it reaches the backend as `decryptedPayload`. Plain query
string parameters are also read, as a fallback, when the body does not carry the key.

---

## Request Payload

| Field | Type | Default | Description |
|---|---|---|---|
| `page` | `number` | `1` | **Page 1 is the newest.** Clamped to the last page. |
| `pageSize` | `number` | `200` | Lines per page. Hard-capped at **2000**. |
| `from` | `string` | — | Lower time bound. ISO datetime, or `YYYY-MM-DD` meaning 00:00:00.000 that day. |
| `to` | `string` | — | Upper time bound. ISO datetime, or `YYYY-MM-DD` meaning 23:59:59.999 that day. |
| `date` | `string` | — | A single calendar day. Shorthand for `from` and `to` on the same date; overrides both. |
| `afterSeq` | `number` | — | Delta mode: return only entries newer than this `seq`. See below. |
| `search` | `string` | — | Case-insensitive substring match on the message. |
| `type` | `string` | — | `error` or `message`. Anything else is ignored. |

Filters compose — `date` + `type` + `search` narrow together.

`from` and `to` accept a zoneless local datetime, which is the format an HTML
`datetime-local` picker emits (`2026-10-01T17:10`). It is parsed as **local server time** and
compared as an absolute instant against the entry's UTC `at`, so picking 17:10 matches
entries written at 17:10 local — not five hours off.

In the console the range is not applied as you type. The inputs hold a draft and the
**Apply** button commits it; a `datetime-local` fires `onChange` on every partial, half-typed
value, so binding it straight to the query would issue a request per keystroke. The preset
buttons fill and apply in one action, since those are unambiguous one-click intents.

### Paging runs newest-first

`page: 1` is the most recent `pageSize` lines, `page: 2` the block before it, and so on.
Entries **within** a page stay in chronological order, so a page reads top-to-bottom like a
terminal. This is what a log viewer wants: the useful end of a log is the end.

---

## Delta mode

Polling for the whole buffer every few seconds re-sends thousands of lines that have not
changed. Instead, pass the `lastSeq` you were given and get back only what has arrived
since:

```json
{ "afterSeq": 48213, "pageSize": 2000 }
```

The response carries `delta: true` and only the newer entries. `seq` is the merge key —
it is assigned once by the logger and never reused.

:::caution Never merge on array position
The buffer is a ring. Every trim shifts every index, so position identifies a different
line before and after a trim. `seq` is the only stable identity, and the UI dedupes on it.
:::

### When lines are missed

If the server wrote more than `LOG_BUFFER_LIMIT` lines between two polls, the ones you
had not fetched are gone. The response reports how many, rather than silently showing a
gap:

```json
{ "delta": true, "missed": 1480, "entries": [ ... ] }
```

`missed` is `oldestSeq - afterSeq - 1`, i.e. the lines that fell off the front of the ring
while your cursor was behind it. Raise `LOG_BUFFER_LIMIT` or poll more often.

A `lastSeq` **lower** than the cursor means the process restarted and the sequence rewound;
the client falls back to a full fetch.

---

## Response

```json
{
  "entries": [
    {
      "seq": 48212,
      "at": "2026-10-01T06:12:04.881Z",
      "type": "message",
      "color": "cyan",
      "message": "[2026-10-01T06:12:04.881Z] Connection requested for DB: main"
    }
  ],
  "total": 1840,
  "page": 1,
  "pages": 10,
  "pageSize": 200,
  "delta": false,
  "missed": 0,
  "dropped": 0,
  "filtered": true,
  "mode": "file",
  "buffered": 2000,
  "bufferLimit": 2000,
  "lastSeq": 48212,
  "oldestSeq": 46213,
  "oldestAt": "2026-10-01T05:48:19.004Z",
  "newestAt": "2026-10-01T06:12:04.881Z",
  "limits": { "maxPageSize": 2000, "defaultPageSize": 200, "bufferLimit": 2000 }
}
```

| Field | Meaning |
|---|---|
| `total` | Entries matching the filters, across all pages |
| `buffered` / `bufferLimit` | How full the ring is, and its ceiling |
| `oldestAt` / `newestAt` | The time window the buffer actually covers |
| `filtered` | Whether any filter was applied |
| `dropped` | Delta only: newer entries beyond `pageSize` that were not returned |

---

## The endpoint does not log itself

A request to `/api/logs` produces around 60 pipeline log lines of its own — handler
enter/exit pairs, the decrypted payload, pool statistics, and a `[Response]` line carrying
the entire encrypted body, which on this endpoint *is* the log payload. Polling every five
seconds, that feedback loop fills the ring with nothing but its own traffic and pushes out
the lines you were trying to read.

So the route silences itself. Everything logged while handling `/api/logs` is **held**
rather than written, and on a successful response it is discarded.

### A failed call is still recorded

The held lines are flushed to the buffer if the response status is 4xx/5xx, or if anything
logged during the call was an `error`. Silencing the endpoint must not make the endpoint
itself undebuggable.

### Why it is scoped per request, not a global flag

Suppression runs in an `AsyncLocalStorage` context established at the router, before the
first line is written. A module-level boolean would be wrong: Node interleaves requests, so
a flag set for a `/logs` call would also swallow whatever an unrelated request logged in the
same window. The async context follows only this request's continuation.

:::note Discarded lines consume no sequence numbers
`seq` is assigned on write, not on hold, so dropping a request's lines leaves no gap. This
matters because `missed` is computed as `oldestSeq - afterSeq - 1`, which would over-report
if the sequence had holes in it.
:::

Held lines are capped at 500 per request, so a pathological call cannot grow memory without
bound. The response carries `selfSilenced: true`, and the console footer shows
`· self-silenced`, so the absence of `/logs` traffic reads as deliberate rather than broken.

---

## The buffer is a window, not an archive

Everything above operates on an in-memory ring of the last `LOG_BUFFER_LIMIT` lines
(default **2000**, hard-capped at 20000), mirrored to one JSON file. It is not a log
archive.

The practical consequence is that **a date filter can only reach as far back as the ring
does**. Asking for last Tuesday returns nothing once 2000 newer lines have been written —
not because nothing happened, but because it is no longer held. `oldestAt` tells you where
the window actually starts, and the console shows it next to the pager so an empty result
is never mistaken for a quiet day.

Raising `LOG_BUFFER_LIMIT` costs memory and makes each flush rewrite a larger file. For
real retention, ship the log file to a log service rather than growing the ring.

---

## Entries written before this endpoint existed

Older buffered entries have no `seq` and no `at`. They are still served: `seq` is assigned
by position on load, and `at` is recovered from the `[ISO]` prefix that `logMessage` writes
into the message text. Entries from raw `console.log` piping have no such prefix, so their
`at` stays `null` — they appear unfiltered but are excluded by any time bound, since there
is no honest way to place them.

---

## Source Files

| File | Role |
|---|---|
| `Services/SysFunctions/LogFunctions/logger.js` | the ring buffer, `seq`/`at` assignment, `queryLogs` |
| `Src/Apis/GeneratedApis/Custom/ServerLogs/Custom_Objects/logs.js` | the API object and filter reading |
| `Src/Routes/dynamicRoutes.js` | the self-silencing wrapper for `/logs` |
| `Services/SysScripts/TestScripts/sim/serverLogsQuery.js` | 57 assertions over paging, delta, dates, self-silencing and legacy entries |
