# Client Runtime Config

Serves the frontend's runtime configuration values from the backend environment, so they are fetched at boot instead of being baked into the Vite build.

| Operation | Method | Path | Permission |
|---|---|---|---|
| List | **GET** | `/api/config/client` | *(none — public)* |

`Add` / `Update` / `Delete` / `View` are not declared. The endpoint takes no request input of any kind.

> **Route note.** The URL resolves to `global.ConfigClient_object` via PascalCase conversion of the path segments (`config` + `client`).

---

## This is not a secrecy boundary

Every value this endpoint returns reaches the browser and is readable in DevTools. Moving a key from the frontend `.env` to the backend `.env` does **not** hide it from anyone.

Both values currently served are public by nature:

- A **Google OAuth client ID** is public by design — it appears in the OAuth redirect URL on every sign-in.
- A **Maps API key** must reach the browser for the Maps JS SDK to work at all.

Their real protection is configured in Google Cloud Console, not in this repo: HTTP referrer restrictions on the Maps key, and authorized JavaScript origins on the OAuth client. Confirm both are set — without them, the keys are usable by anyone regardless of where they are stored.

**What this endpoint does buy:** keys rotate without a frontend rebuild and redeploy, and each environment serves its own values from its own `.env`.

**Never add a value here that would cause harm if a user read it.** Anything that must stay secret — API secrets, signing keys, DB credentials — belongs behind a server-side call that consumes it, never in this response.

---

## Authentication & Authorization

| Layer | Setting | Why |
|---|---|---|
| Platform | inline block, equivalent to `PUBLIC_ENCRYPTED_PLATFORM` | Transport consistency with every other public endpoint — AES-ECB with the platform key. The client decrypts it, so this is not secrecy. Inline rather than the shared profile only so it can carry its own `platformIP`. |
| `verification.accessToken` | `false` | The frontend needs the Google client ID to render the sign-in button, i.e. before any user exists. |
| `requestMetaData.permission` | `null` | No RBAC gate; there is nothing tenant-scoped in the response. |
| `platformIP` | union of both allowlists | `resolveSharedPlatformIPs()` — the union of `PLATFORM_ALLOWED_IPS` and `GUEST_PLATFORM_ALLOWED_IPS`. See [Behavioural notes](#behavioural-notes). |

---

## Request

No parameters. `CRUD_parameters.js` declares an empty `fields` array, and the pre-processor reads nothing from the request.

This is deliberate: because no request value influences the response, the endpoint cannot be steered into reading an arbitrary environment variable. The set of exposed keys is fixed in code.

```http
GET /api/config/client HTTP/1.1
encryptedrequest: <ciphertext>
```

---

## Exposed values

The allowlist is an explicit response-key to environment-variable map in `clientRuntimeConfig.js`. Only keys named there can ever be returned.

| Response key | Environment variable |
|---|---|
| `googleClientId` | `VITE_GOOGLE_CLIENT_ID` |
| `mapsKey` | `VITE_MAPS_KEY` |

To expose another value, add an entry to that map. Adding one is a deliberate decision to publish that value to every visitor.

> The `VITE_` prefix on the backend variables is historical — it is where these values used to live, in the frontend `.env`. Vite only injects `VITE_`-prefixed variables into the client bundle; on the backend the prefix carries no meaning and the name was kept only to ease the migration.

---

## Response

```json
{
  "googleClientId": "1234567890-abcdef.apps.googleusercontent.com",
  "mapsKey": "AIzaSy..."
}
```

| Field | Type | Description |
|---|---|---|
| `googleClientId` | `string` | Google OAuth 2.0 client ID for the sign-in flow. Absent when `VITE_GOOGLE_CLIENT_ID` is unset. |
| `mapsKey` | `string` | Google Maps JavaScript API key. Absent when `VITE_MAPS_KEY` is unset. |

---

## Behavioural notes

**Unset variables are omitted, not returned as `null` or an empty string.** A variable with no value never appears in the response, and its name is written to the server log at request time. With neither set, the body is an empty object and the status is still `200` — a partially configured environment degrades one feature rather than breaking the frontend's boot.

The frontend must therefore treat a missing key as *"this feature is not configured in this environment"*, not as an error, and must not assume every key is present. Reading a key without a guard will surface as an obscure Google SDK failure rather than a clear config error.

**Values are trimmed.** Surrounding whitespace in the `.env` value is stripped, and a variable that is whitespace-only counts as unset.

**Values are read per request, not cached at boot.** `process.env` is consulted inside the pre-processor, so a value changed in the environment takes effect on the next process restart without any code change. There is no in-process cache to invalidate.

**IP allowlisting is the union of both lists.** This endpoint is one of the few that must serve *both* audiences: the admin dashboard and the guest apps each need these keys before anyone signs in. Its `platformIP` therefore comes from `resolveSharedPlatformIPs()` — the union of `PLATFORM_ALLOWED_IPS` and `GUEST_PLATFORM_ALLOWED_IPS`, with a `*` in either list yielding `*`. Restricting it to one list alone would break the other audience's bootstrap, and a third dedicated variable would have to be kept in sync with both by hand.

A host in neither list fails platform resolution with `E51` before reaching the handler. This is easy to miss when the frontend is served from a different host than the one used during development.

**Authentication must stay off.** `verification.accessToken` and `communication.encryption.accessToken` are both `false`, and must remain so. Setting either to `true` creates a bootstrap deadlock: the frontend needs `googleClientId` to render the sign-in button, so it holds no access token when it calls this endpoint — and with `encryption.accessToken: true` it could not even encrypt the request.

---

## Error responses

| Condition | Code | Notes |
|---|---|---|
| Request IP in neither `PLATFORM_ALLOWED_IPS` nor `GUEST_PLATFORM_ALLOWED_IPS` | `E51` | Platform resolution failure — returned before the handler runs. |
| Method other than `GET` | `E52` | Only `List` is declared. |

There is no error path for missing configuration; unset variables are omitted from a `200` response.

---

## Related

- [Config Keys — Enabled-For & Possible Values](./config-keys-enabled-for.md) — database-backed configuration. Unrelated mechanism: that system stores tenant-scoped values in `hms_config`, this one reads process environment variables and is not tenant-aware.

---

## Source Files

| File | Purpose |
|---|---|
| `Src/Apis/ProjectSpecificApis/ConfigClient/ConfigClient.js` | API object; platform config, pre/post-process wiring |
| `Src/Apis/ProjectSpecificApis/ConfigClient/CRUD_parameters.js` | Request field schema (empty) |
| `Src/Apis/ProjectSpecificApis/ConfigClient/README.md` | Backend reference — allowlist policy and what must never be added |
| `Src/HelperFunctions/PreProcessingFunctions/Config/clientRuntimeConfig.js` | `EXPOSED_CLIENT_CONFIG` allowlist and `buildClientRuntimeConfig` |
| `Src/HelperFunctions/Platform/allowedPlatformIPs.js` | `resolveSharedPlatformIPs` — the union of both allowlists |
