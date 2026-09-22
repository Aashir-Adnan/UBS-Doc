---
title: "Edge Access Control — CORS, Platform IPs, Domains & Platform Names"
sidebar_position: 1
---

# Edge Access Control — CORS, Platform IPs, Domains & Platform Names

Four independent restrictions at the outer edge of the request pipeline. Three were previously implemented but left wide open (`origin: '*'`, `platformIP: ['*']`, `supported: ['*']`); the fourth, the platform domain allowlist (`domains`), was added alongside them. All are driven by environment variables and default to permissive behaviour, so enabling any of them is an explicit, per-environment decision.

| Control | Layer | Env variable | Failure |
|---|---|---|---|
| CORS origin allowlist | L0 — `securityConfig.js` | `CORS_ALLOWED_ORIGINS` | Browser-side CORS error |
| Platform IP allowlist — admin / staff APIs | L1 — `platformHandler.js` | `PLATFORM_ALLOWED_IPS` | `E51` / 400 |
| Platform IP allowlist — guest APIs | L1 — `platformHandler.js` | `GUEST_PLATFORM_ALLOWED_IPS` | `E51` / 400 |
| Platform name allowlist — admin / staff APIs | L1 — `platformHandler.js` | `PLATFORM_SUPPORTED` | `E51` / 400 |
| Platform name allowlist — guest APIs | L1 — `platformHandler.js` | `GUEST_PLATFORM_SUPPORTED` | `E51` / 400 |
| Platform domain allowlist — admin / staff APIs | L1 — `platformHandler.js` | `PLATFORM_ALLOWED_DOMAINS` | `E51` / 400 |
| Platform domain allowlist — guest APIs | L1 — `platformHandler.js` | `GUEST_PLATFORM_ALLOWED_DOMAINS` | `E51` / 400 |

**Every variable defaults to `*`.** An environment that sets none behaves exactly as before.

---

## What these controls are not

Neither control is an authentication or authorization mechanism, and neither should be counted on as one.

**CORS is enforced by the browser, not the server.** A rejected origin still reaches the application — the browser simply refuses to hand the response to the calling page. `curl`, Postman, a mobile app, and any server-side attacker are entirely unaffected. CORS stops a *third-party web page* from reading your API with a user's credentials; it stops nothing else.

**The IP allowlist is a network-level filter that trusts a header.** `req.ip` is derived from `X-Forwarded-For` whenever the app trusts a proxy, and that header is client-supplied. It is meaningful only when a correctly configured proxy is the sole ingress path.

The controls that actually decide who may do what are the token equality check in `validateToken.js` and the permission check in `permissionChecker.js`. These two are perimeter hardening layered on top.

---

## CORS origin allowlist

### The bug this replaced

The previous value was the bare string `192.168.1.160:3000`. The `cors` package compares its string `origin` option **exactly** against the browser's `Origin` request header, and that header always carries a scheme — `http://192.168.1.160:3000`. A value without one can never match, so no response received an `Access-Control-Allow-Origin` header at all.

That failure was also masked. `applyMiddleware` registered `cors()` **twice**: the restrictive block first, and a second block further down that reflected any origin back. The second overwrote the first on ordinary responses, while preflights were answered early by `app.options('*')` using the restrictive config. The net behaviour was split — preflights restricted, simple requests wide open — which is close to the hardest possible thing to debug.

There is now **one** `cors()` registration. The extra headers the second block allowed (`sec-ch-ua`, `sec-ch-ua-mobile`, `sec-ch-ua-platform`) were merged into the surviving options.

### Configuration

`CORS_ALLOWED_ORIGINS` is a comma-separated list of **full origins**. The scheme is mandatory; a port is required whenever the browser sends one.

```bash
# Allow the local dev frontend and a LAN host
CORS_ALLOWED_ORIGINS=http://localhost:3000,http://192.168.1.160:3000

# Production — an entry also matches its subdomains (see below)
CORS_ALLOWED_ORIGINS=https://my-destination.com

# '*' — allow all
CORS_ALLOWED_ORIGINS=*
```

**Unset defaults to `https://my-destination.com`, not `*`.** An environment that forgets the variable is closed to everything but the production domain and its subdomains — a deliberate fail-closed choice, and the reason a fresh dev box with no `.env` entry shows CORS errors from `localhost`.

**Each entry implicitly matches its subdomains.** `https://my-destination.com` allows `https://dev.my-destination.com` and `https://a.b.my-destination.com` too; scheme and port must still match exactly, and lookalikes (`notmy-destination.com`, `my-destination.com.evil.com`) do not match. One production entry therefore covers `dev.` / `preprod.` / apex — but it also means any subdomain you ever point at a third party gains API access, so keep the apex zone tidy.

**Malformed entries fail at boot, not per request.** An entry without a scheme (`my-destination.com`) stops the server with a message naming it. This replaced a bug where the `*` entry was interpolated into a regex and threw `Invalid regular expression … Nothing to repeat` on **every** request — an outage that presented as a 500 on all endpoints while the env said "allow all".

### Behaviour

- An origin on the list — exactly, or as a subdomain of an entry — is echoed back in `Access-Control-Allow-Origin`.
- An origin not on the list is rejected, and the browser reports a CORS error.
- **A request with no `Origin` header is always allowed.** Mobile apps, `curl`, and server-to-server calls do not send one, and rejecting them would break every non-browser client for no security gain — CORS is not what protects those paths.
- `credentials: true` is set. Note that `'*'` and `credentials: true` are not a valid combination per the CORS specification; browsers reject the pair for credentialed requests. This is one more reason to set a real allowlist in any environment where cookies or credentialed fetches are used.

### Mobile apps do not need an entry — and `*` is the wrong answer

The counterpart to [Mobile apps cannot be IP-allowlisted](#mobile-apps-cannot-be-ip-allowlisted): the IP allowlist has to be opened for the app, but **CORS does not**. Do not set `CORS_ALLOWED_ORIGINS=*` on the app's behalf.

CORS is a browser mechanism. A React Native app issues requests through native networking (OkHttp / NSURLSession), sends **no `Origin` header**, and no same-origin policy applies to it. The allowlist never sees those requests — `originChecker` returns early for an absent `Origin`, so native traffic is allowed whatever the list says.

Setting `*` would therefore buy the app nothing, while removing the only protection the list provides for the browser clients that *are* subject to it. It is also self-defeating: the CORS specification forbids `*` together with `credentials: true`, and browsers reject that pair on credentialed requests — so `*` is not even a working blanket.

**Add an origin only for a real browser context:**

| Client | Sends `Origin`? | Needs a list entry |
|---|---|---|
| React Native app (iOS / Android) | No | No |
| `curl`, Postman, server-to-server, webhooks | No | No |
| Admin dashboard | Yes | Yes |
| A web build of the app (`react-native-web` / Expo web) | Yes | Yes |
| A `WebView` inside the app that calls the API from page JS | Yes | Yes — see below |

**The WebView exception.** A `WebView` is a browser engine, so JavaScript running inside one *is* subject to CORS even though it lives in a native app. Both app codebases include `react-native-webview`. This only matters if page JS inside the WebView calls the API directly — a WebView that merely displays content, or whose data is fetched by the native side and passed in, is unaffected. If it does call the API, its origin depends on how the content is loaded: an Android `WebView` commonly sends `http://localhost`, and content loaded from `file://` sends the literal string `null`.

> **`Origin: null` is currently rejected.** The checker treats `null` as a value to look up in the list, not as an absent origin, so `file://`-loaded WebView content and sandboxed iframes are blocked. That is the safe default — `null` is not attributable to any site, so allowlisting it grants access to any sandboxed page anywhere. Load WebView content over `http(s)://` and allowlist that origin instead of opening `null`.

### Common mistakes

| Value | Result |
|---|---|
| `192.168.1.160:3000` | Never matches — no scheme. |
| `http://localhost:3000/` | Never matches — trailing slash. An origin has no path. |
| `https://admin.example.com` when the site is served over `http` | Never matches — scheme is part of the origin. |
| Origin correct, but a **custom request header** is missing from `allowedHeaders` | Preflight fails. Encrypted requests rely on `encryptedrequest` / `accesstoken`; new custom headers must be added to the list. |

---

## Platform IP allowlist

### How matching works

During the PreProcessing stage, `getPlatformConfig` walks the API object's `platform` array and selects the first entry where **both** conditions hold:

1. `supported` contains the request's platform name, or `*`
2. `platformIP` contains the request's `req.ip`, or `*`, or `platformIP` is absent

No match returns `null`, which the pipeline reports as **`E51` — unsupported platform (400)**. The request is rejected before decryption, before token validation, and before any permission check.

**`platformIP` matching is exact string comparison.** There is no CIDR support, no subnet mask, no wildcard within an address. `192.168.1.*` is not a pattern — it is a literal string that will never equal any real IP.

### Configuration

Two variables, one per CRUD template:

```bash
# Admin dashboard / staff APIs — a known office, VPN or bastion range
PLATFORM_ALLOWED_IPS=192.168.1.68,192.168.1.160

# Guest mobile / web APIs — public traffic, must stay open
GUEST_PLATFORM_ALLOWED_IPS=*
```

`GUEST_PLATFORM_ALLOWED_IPS` deliberately does **not** fall back to `PLATFORM_ALLOWED_IPS`. Guests connect from arbitrary mobile and residential addresses; an office allowlist cascading onto guest endpoints would reject every real guest with `E51`. The independence is the point: a production deployment can restrict staff APIs to known networks while leaving guest APIs open.

Each entry is expanded automatically to the forms `req.ip` can actually take:

| Configured | Expands to |
|---|---|
| `192.168.1.160` | `192.168.1.160`, `::ffff:192.168.1.160` |
| `127.0.0.1` or `localhost` or `::1` | `127.0.0.1`, `::1`, `::ffff:127.0.0.1` |
| `*` | `*` (allow all — any other entries are discarded) |

This expansion exists because of a trap that is otherwise very hard to diagnose: on a dual-stack Node listener, an IPv4 client commonly arrives as the IPv4-mapped IPv6 address `::ffff:192.168.1.160`. Configuring the bare IPv4 form alone produces a silent, total `E51` for a host that looks correctly allowlisted.

### Coverage

`platformIP` is declared in **one place per template** and reaches every API object through the template merge. The three platform profiles in `guestPlatformConfigs.js` (`PUBLIC_PLATFORM`, `PUBLIC_ENCRYPTED_PLATFORM`, `AUTH_PLATFORM`) deliberately declare **no** `platformIP` and **no** `supported`: `deepMerge(globalTemplate, resolvedObject)` runs template-first, so a key the object omits falls through to the template's value. Those profiles carry encryption and verification settings only.

Which list an endpoint obeys is therefore decided by one field — its `templateName`:

| `templateName` | Env variable | Applies to |
|---|---|---|
| `Crud_Template` | `PLATFORM_ALLOWED_IPS` | All generated CRUDs and admin / staff endpoints |
| `Guest_Crud_Template` | `GUEST_PLATFORM_ALLOWED_IPS` | Every object under `Src/Apis/ProjectSpecificApis/GuestSpecificApis` |

**The platform profile does not decide the audience — the template does.** `PUBLIC_PLATFORM`, `PUBLIC_ENCRYPTED_PLATFORM` and `AUTH_PLATFORM` are *encryption* profiles, and admin endpoints use them too: `AdminBookingPayment`, `AdminBookingCheckout` and `AuthSessionRefresh` sit on `AUTH_PLATFORM`, and `DevSeedTenant` on `PUBLIC_PLATFORM`, while declaring `Crud_Template`, so they follow `PLATFORM_ALLOWED_IPS`, `PLATFORM_ALLOWED_DOMAINS` and `PLATFORM_SUPPORTED`.

The dual-audience endpoints (`ConfigClient`, `ValidationDuplicate`, `ValidationEmail`, `CustomFrontpageData`, `UploadFile`, `UploadServe`) don't use a profile. Each declares its own inline `platform` block, still on `Crud_Template`, and picks each list explicitly. See the next table and [Platform domain allowlist](#platform-domain-allowlist).

**Some endpoints must serve both audiences.** These declare an inline platform block whose `platformIP` comes from `resolveSharedPlatformIPs()` — the union of both lists, with a `*` in either yielding `*`:

| Endpoint | Why it is shared |
|---|---|
| `ConfigClient` | Hands the frontend its Google client ID; both audiences need it *before* sign-in |
| `ValidationDuplicate` | Uniqueness probe used by admin forms and guest sign-up alike |
| `ValidationEmail` | Same — email validation on both sides |
| `CustomFrontpageData` | Public front-page content read by both |

Prefer that helper over inventing a third environment variable, which would have to be kept in sync with the other two by hand.

**Call it with no arguments.** `resolveSharedPlatformIPs()` defaults to the union. Passing a single variable name — `resolveSharedPlatformIPs("GUEST_PLATFORM_ALLOWED_IPS")` — is accepted but returns *only* that list, which on a shared endpoint reintroduces exactly the `E51` the union exists to prevent: the admin dashboard is rejected from an endpoint its forms depend on. The parameter exists for symmetry with `resolveAllowedPlatformIPs`, not as the normal way to call it.

> **When adding a guest endpoint, declare `templateName: "Guest_Crud_Template"`.** Declaring `Crud_Template` puts it behind the admin IP allowlist, which in production means every real guest is rejected with `E51`.

The two templates are otherwise identical except for their `accessToken` defaults — `Crud_Template` defaults `communication.encryption.accessToken` and `verification.accessToken` to `true`, `Guest_Crud_Template` to `false`. Every one of the three shared profiles sets both keys explicitly, so the default is overridden and switching template between them does not change any object's resolved config. This was verified by diffing the merged config of all 88 guest objects before and after the switch: zero config differences, `platformIP` the only field that moved, and all 43 auth-required guest endpoints still resolving `verification.accessToken: true`.

### Mobile apps cannot be IP-allowlisted

`GUEST_PLATFORM_ALLOWED_IPS` must stay `*` in any environment the iOS or Android app talks to. This is not a policy preference — a device's public IP is not a stable, enumerable property:

- **Carrier-grade NAT** puts thousands of unrelated subscribers behind a small pool of rotating public addresses. Allowlisting one would admit every other subscriber on that carrier and still miss your users the moment the pool rotated.
- The address **changes mid-session** on cell-tower handover and whenever the device switches between cellular and Wi-Fi.
- Users connect from home, office, hotel, and airport Wi-Fi, and from other countries while roaming.

There is no list to write. Setting the variable to anything but `*` rejects real guests with `E51`, intermittently and unreproducibly — the worst possible failure shape.

**What actually identifies the app** — all already enforced, no new work:

| Control | Where | What it rejects |
|---|---|---|
| Platform key | `platformEncryption.js` | `PlatformName` + `PlatformVersion` must resolve to a row in `platforms` / `platform_versions`, and the payload must decrypt with that row's `encryption_key`. Unknown or mismatched → `E10`. Registered platforms are `Android_App`, `Ios_App`, `Web_App`. |
| Device headers | `deviceHeadersValidator` | `x-client-platform` must be one of `ios`, `android`, `web`, with the other `x-client-*` headers present, on every `/api/**` hit → 400 `invalid_client_headers`. |
| Token equality | `validateToken.js` | The presented `accesstoken` must byte-match `user_devices.device_token` for an active device row. |
| Rate limiting | `securityConfig.js` | Volume abuse, keyed by session or IP. |

Note the honest limit of the first row: the platform encryption key ships inside the APK/IPA and can be extracted from it. It establishes *which build* is calling, not that the caller is a genuine unmodified app.

**If you need real app authenticity**, the mechanism is remote attestation — the [Play Integrity API](https://developer.android.com/google/play/integrity) on Android and [App Attest](https://developer.apple.com/documentation/devicecheck/establishing-your-app-s-integrity) on iOS. Each returns a token the backend verifies with Google or Apple, proving the request came from an unmodified build of your app on a genuine device. That is the control an IP allowlist is often reached for by mistake.

### Where IP allowlisting does belong

Fixed-location, enumerable callers:

- server-to-server integrations you operate
- cron or internal tooling calling the API from a known host
- an admin dashboard served only from an office network or behind a VPN with a known egress address

Even the last one deserves care: it breaks the moment an admin works from home or the VPN is bypassed, and the failure is an opaque `E51` rather than a login prompt. Confirm your admins' egress is genuinely fixed before setting `PLATFORM_ALLOWED_IPS`.

`Src/Apis/Templates/TestTemplates.js` is intentionally **not** wired and remains `['*']`.

---

## Platform name allowlist

The third gate, and the one that comes closest to "this API is for this product". Where `platformIP` asks *where* the request came from, `supported` asks *which registered platform* the request proves it is.

### What it checks

Every encrypted request carries `PlatformName` + `PlatformVersion` inside the outer AES envelope. The backend resolves that pair to a row in `platforms` / `platform_versions` and decrypts the inner payload with **that row's** `encryption_key`. So a request that claims `Web_App` must also hold `Web_App`'s key, or it fails `E10` one step later. `supported` gates on the claimed name; the key layer makes the claim cost something.

Registered platforms: `Ios_App`, `Android_App`, `Web_App`, all `1.0.0`, each with its own key. Matching is **case-insensitive** — MySQL compares the name that way for the key lookup, and the allowlist matches the same way so a correct name never fails on case alone.

### Platform registry normalization

Migration `20260910_1_normalize_platform_names_and_keys.sql` brings the `platforms` / `platform_versions` tables to that set. It runs automatically on the next server start in every environment.

| Change | Before | After |
|---|---|---|
| iOS platform name | `IOS_App` | `Ios_App` |
| iOS encryption key | `IOS_DEV` | `IOS_APP` |
| Android encryption key | `ANDROID_DEV` | `ANDROID_APP` |
| Every other platform, and its versions | `active` | `inactive` |

Rows are matched by name and old key value, never by id, and each statement only touches rows still in the old state. Re-running it, or running it on an environment that is already partly migrated, changes nothing.

> **Breaking for the apps.** The iOS and Android keys change. Any build still encrypting with `IOS_DEV` / `ANDROID_DEV` gets `E10` from the moment the migration runs. Ship builds with `IOS_APP` / `ANDROID_APP` in the same release. The name change on its own is harmless, because name matching is case-insensitive (`IOS_App` and `Ios_App` both resolve). The key change is what breaks old builds.

### Inactivating a platform does not block it

The key lookup in `platformEncryption.js` resolves `PlatformName` + `PlatformVersion` **without checking `status`**. A platform set to `inactive` by the migration can still decrypt with its old key and reach the API. To stop a platform, leave it out of `PLATFORM_SUPPORTED` / `GUEST_PLATFORM_SUPPORTED`. Right now that allowlist is the only thing that enforces the retirement.

### Declaring the rule on an API object

`supported` and `platformIP` are only evaluated when they sit **inside an entry of the step's `platform` array**. `getPlatformConfig` walks that array and nothing else:

```js
steps: [{
  platform: [
    {
      platformIP: resolveAllowedPlatformIPs(),
      supported: resolveSupportedPlatforms(),
      config: { communication: { encryption: { ... } }, verification: { ... } },
    },
  ],
}]
```

Some older objects put `config`, `platformIP` and `supported` straight on the step, with no `platform` array. The template merge then provides the `platform` block, and those three step-level keys are **never read**. The object picks up the template's defaults and its own `supported` does nothing. That is why `LoginWithOTP` ignored `PLATFORM_SUPPORTED` until both of its steps were moved to the array shape. After that change an unregistered or unlisted name gets `E51`, and a listed name continues to the key and user checks as before.

If you add or edit an object that needs its own platform rule, use the array shape. A step-level `supported` looks right but has no effect.

### Configuration

```bash
# Admin dashboard / staff APIs
PLATFORM_SUPPORTED=Web_App

# Guest mobile / web APIs
GUEST_PLATFORM_SUPPORTED=Ios_App,Android_App,Web_App

# Unset or '*' — allow any registered platform (previous behaviour)
PLATFORM_SUPPORTED=*
```

Same shape as the IP lists: comma-separated, `*` or unset means allow all, and the two variables are independent. `templateName` decides which one an object obeys — `Crud_Template` → `PLATFORM_SUPPORTED`, `Guest_Crud_Template` → `GUEST_PLATFORM_SUPPORTED`. The four dual-audience endpoints (`ConfigClient`, `ValidationDuplicate`, `ValidationEmail`, `CustomFrontpageData`) use `resolveSharedSupportedPlatforms()`, the union of both.

### The ordering fix that made this work

`platformConfigHandler` runs before `encryptionHandler`, but `PlatformName` lives inside the encrypted envelope that `encryptionHandler` decrypts — a circular dependency that had left `supported` dead since the framework shipped. The resolution splits the envelope: the **outer** layer needs only `SECRET_KEY` and no object config, so `platformConfigHandler` now peels just that layer to read `PlatformName` (`peekEncryptionDetails` in `platformEncryption.js`), selects the platform config, and leaves the inner decrypt to `encryptionHandler` as before. A malformed envelope makes the peek return nothing rather than throw, so the real `E10` / `E14` still comes from the handler that owns it.

The peek and the decrypt share one reader, `extractEncryptedRequest`, which looks in the `encryptedrequest` header, then the body, then — **only for a `GET` on an object whose `requestMetaData.envelopeInQuery` is `true`** — `?encryptedRequest=`. `UploadServe` is the one object with that flag, because an `<img src>` can't send a header. Without the flag a query-string envelope is invisible to the peek, so `PlatformName` stays empty and a narrowed `supported` list rejects the request with `E51`.

### Unencrypted endpoints are exempt

An endpoint whose profile sets `encryption: false` receives plain JSON — there is no envelope, so there is no `PlatformName` to check and nothing the caller could prove. For those, `supported` is treated as satisfied whatever the list says. This is deliberate: the alternative is a narrowed environment silently `E51`-ing every legacy unencrypted endpoint (`DevSeedTenant`, the `landing/*` objects) for a check they cannot pass. An unencrypted endpoint cannot be platform-restricted; the way to restrict it is to encrypt it.

### What it does and does not stop

| Caller | Result |
|---|---|
| Your `Web_App` frontend hitting a guest-only API | `E51` — name not in `GUEST_PLATFORM_SUPPORTED` |
| Your `Ios_App` hitting a staff-only API | `E51` |
| A retired (inactive) platform still holding its key | Passes unless its name is left out of the list (see [above](#inactivating-a-platform-does-not-block-it)) |
| A script claiming `Web_App` without `Web_App`'s key | `supported` passes, then **`E10`** — cannot decrypt |
| A script holding `Web_App`'s key (extracted from the bundle) | Passes |

That last row is the honest limit. The platform key ships inside the app and can be extracted, so `supported` identifies the *build* a request came from, not a trustworthy caller. It is materially stronger than an IP or a header — the attacker needs a secret, not a string — but for real app authenticity the answer is still attestation (Play Integrity / App Attest). See [Mobile apps cannot be IP-allowlisted](#mobile-apps-cannot-be-ip-allowlisted).

---

## Platform domain allowlist

The fourth gate. `platformIP` asks *where* the request came from on the network, and `supported` asks *which registered platform* it proves it is. `domains` asks **which website** sent it, by reading the browser's `Origin` header.

### How matching works

`getPlatformConfig` now requires all three per block: `supported`, `platformIP` and `domains`. A block's `domains` passes when:

- `domains` is `*`, or
- the request has **no** `Origin` header (mobile apps, server-to-server calls, same-origin `GET`s), or
- the `Origin` host matches an entry.

| Entry | Matches |
|---|---|
| `my-destination.com` | `my-destination.com` and every subdomain, on any scheme and port |
| `https://my-destination.com` | The same hosts, `https` only |
| `localhost:3000` | `localhost` on port 3000 only |

- Matching ignores case.
- Lookalikes such as `evilmy-destination.com` or `my-destination.com.evil.io` don't match.
- An `Origin` of `null` (sandboxed iframes, `file://`) never matches a restrictive list.
- An entry with a path, query or fragment throws when the object file loads, so a typo stops the boot instead of silently blocking everyone.

### Configuration

```bash
# Admin dashboard / staff APIs
PLATFORM_ALLOWED_DOMAINS=admin.my-destination.com

# Guest web APIs
GUEST_PLATFORM_ALLOWED_DOMAINS=my-destination.com

# Unset or '*' — allow all (default)
PLATFORM_ALLOWED_DOMAINS=*
```

Same shape as the IP and name lists: comma-separated, `*` or unset means allow all, and `templateName` decides which variable an object follows.

Six endpoints serve both audiences and declare `domains: resolveSharedPlatformDomains()`, the union of both lists. Call it with no arguments, for the same reason as `resolveSharedPlatformIPs()`.

| Endpoint | `platformIP` | `domains` | `supported` |
|---|---|---|---|
| `ConfigClient` | `*` | shared | shared |
| `ValidationDuplicate`, `ValidationEmail`, `CustomFrontpageData` | shared | shared | shared |
| `UploadFile`, `UploadServe` | `*` | shared | shared |

### Declaring it on an API object

```js
platform: [
  {
    platformIP: resolveAllowedPlatformIPs(),
    domains: resolveAllowedPlatformDomains(),
    supported: resolveSupportedPlatforms(),
    config: { ... },
  },
],
```

**Leaving `domains` out doesn't mean "allow all".** The template's `platform` block is merged into every block of the object, so an object that omits `domains` inherits its template's list, just as it inherits `platformIP`. That is why `ConfigClient` declares `resolveSharedPlatformDomains()` explicitly: otherwise it would inherit the admin-only list and the guest frontend would get `E51` before sign-in.

:::warning Declare `domains` on every dual-audience block
An inline block that omits `domains` inherits the **admin** list from `Crud_Template`. `ConfigClient`, `UploadFile` and `UploadServe` all declare the shared list for this reason. Without it, the guest site gets `E51` from the endpoints it needs before sign-in and for uploads.
:::

### Attachment URLs are not domain-restricted

A browser sends `Origin` on `fetch()`/XHR calls and on non-`GET` requests, but **not** on a plain `<img src>` (one without a `crossorigin` attribute) or a link navigation. So:

- `POST /api/upload/file` from the frontend carries `Origin` and is checked. The page must be on a domain in `PLATFORM_ALLOWED_DOMAINS` or `GUEST_PLATFORM_ALLOWED_DOMAINS`.
- `GET /api/upload/serve?encryptedRequest=…` rendered in an `<img>` has no `Origin` and passes the domain check wherever the image is embedded. Serve URLs are bearer capabilities (see [Attachment Upload & Serve](../attachment-pipeline/attachment-pipeline.md)); their protection is the encrypted actor plus the per-attachment visibility check, not the domain list.

### Relation to CORS

`CORS_ALLOWED_ORIGINS` reads the same header but works differently:

| | CORS | `domains` |
|---|---|---|
| Who enforces it | The browser, which hides the response | The server, which rejects the request |
| Does the request still run? | Yes, for simple requests: side effects happen, only the response is hidden | No: `E51` before any processing |
| Scope | The whole app | Each platform block, so admin and guest APIs can differ |

Keep the two lists consistent. A domain missing from CORS but present in `domains` can call the API but can't read the response. A domain in CORS but missing from `domains` gets `E51`.

### What it does and does not stop

It stops **other websites** from driving the API through a visitor's browser, and it makes a mis-deployed frontend fail loudly with `E51`. It doesn't stop `curl`, Postman, a script or a mobile app, which can leave `Origin` out or forge it. It is not authentication. Unlike `platformIP`, it works as-is behind Cloudflare, because `Origin` reaches the server unchanged at every hop.

---

## Operational notes

**`Crud_Template` is merged into every generated CRUD.** Narrowing `PLATFORM_ALLOWED_IPS` restricts far more than browsers: cron jobs, webhook callbacks, and any server-to-server integration are filtered by the same list. Enumerate those callers before setting it.

**`req.ip` depends on `TRUST_PROXY_HOPS`.** The app calls `app.set('trust proxy', ...)` with that value, defaulting to `1`. Behind a load balancer with the wrong hop count you will be allowlisting the proxy's address rather than the client's — which either allows everyone or blocks everyone, depending on the direction of the error. Set it to `0` when running with no proxy in front.

**`supported` used to be unusable — that is fixed.** `getPlatformConfig` runs *before* `encryptionHandler`, and until now nothing had populated `PlatformName` at that point, so only a `'*'` entry could ever match. `platformConfigHandler` now peeks the outer envelope first (see [Platform name allowlist](#platform-name-allowlist)), so `supported` can be narrowed like `platformIP`.

**Array-length caveat on per-object overrides.** `deepMerge` replaces an array cleanly only while the template's array has length 1. With a multi-entry `platformIP`, a shorter per-object override would leave leftover template entries behind. No API object currently overrides `platformIP`, so this is latent rather than live — but it matters if one ever does.

---

## Diagnosing a rejection

| Symptom | Likely cause |
|---|---|
| Browser console: *"No 'Access-Control-Allow-Origin' header is present"* | Origin missing from `CORS_ALLOWED_ORIGINS`, or present but written without a scheme / with a trailing slash. |
| Same message, but only on `POST`/`PUT` | Preflight failure — usually a custom request header absent from `allowedHeaders`, not an origin problem. |
| `E51` on every request from one host, others fine | `platformIP` mismatch. Check whether `req.ip` is arriving as `::ffff:<ipv4>`, and check `TRUST_PROXY_HOPS`. |
| `E51` from everywhere after a deploy | A restrictive `PLATFORM_ALLOWED_IPS` reaching an environment it was not written for, or the proxy hop count changed. |
| `E51` only for one client type (e.g. every iOS user, web fine) | `PLATFORM_SUPPORTED` / `GUEST_PLATFORM_SUPPORTED` omits that platform's registered name, or the app sends a name that is not registered at all. |
| `supported` narrowed but one endpoint still accepts every platform | The object sets `supported` on the step rather than inside a `platform` array entry. See [Declaring the rule on an API object](#declaring-the-rule-on-an-api-object). |
| iOS / Android get `E10` right after a deploy | Migration `20260910_1` rotated the keys and the build still uses `IOS_DEV` / `ANDROID_DEV`. |
| `E51` on every encrypted endpoint, unencrypted ones fine | The client is not sending an envelope the peek can read — check `encryptedrequest` is present and encrypted with `SECRET_KEY`. |
| Server-to-server integration breaks, browsers fine | `PLATFORM_ALLOWED_IPS` — CORS would not affect a non-browser client. |
| `E51` from one website only, mobile apps and Postman fine | That site's host is missing from `PLATFORM_ALLOWED_DOMAINS` / `GUEST_PLATFORM_ALLOWED_DOMAINS`. Requests without an `Origin` skip the domain check, which is why non-browser clients still work. |
| `E51` on `/api/upload/serve` only, with `domains` and `platformIP` both `*` in the log | The query envelope wasn't read, so `supported` saw no `PlatformName`. Check the object still has `requestMetaData.envelopeInQuery: true` and the request is a `GET`. |
| Guest site gets `E51` on one shared endpoint only | The endpoint omits `domains` and inherits the admin list from `Crud_Template`. Add `resolveSharedPlatformDomains()`. |

`E51` is raised before the handler runs, so no application-level log will show the request reaching business logic.

---

## Source Files

| File | Purpose |
|---|---|
| `Src/Config/Security/securityConfig.js` | `originChecker`, `corsOptions`, the single `cors()` registration |
| `Src/HelperFunctions/Platform/allowedPlatformIPs.js` | `resolveAllowedPlatformIPs(envVar)` and address-form expansion |
| `Src/HelperFunctions/Platform/allowedPlatformDomains.js` | `resolveAllowedPlatformDomains(envVar)` / `resolveSharedPlatformDomains()` / `isOriginInDomains` |
| `Src/HelperFunctions/Platform/supportedPlatforms.js` | `resolveSupportedPlatforms(envVar)` / `resolveSharedSupportedPlatforms()` |
| `Services/Middlewares/PlatformCheck/platformEncryption.js` | `peekEncryptionDetails` — outer-envelope read that un-deadens `supported`; `extractEncryptedRequest` — header, body, then the `envelopeInQuery` query string |
| `Services/Middlewares/DeviceHeaders/validateDeviceHeaders.js` | Exempts `envelopeInQuery` GETs from the `x-client-*` header requirement |
| `Src/Apis/ProjectSpecificApis/UploadFile/UploadFile.js`, `UploadServe/UploadServe.js` | Inline blocks: `platformIP: ['*']`, shared `domains` and `supported`; `UploadServe` sets `envelopeInQuery` |
| `Src/Apis/Templates/CrudTemplates.js` | Admin CRUD template — `PLATFORM_ALLOWED_IPS` |
| `Src/Apis/Templates/GuestCrudTemplates.js` | Guest CRUD template — `GUEST_PLATFORM_ALLOWED_IPS` |
| `Src/HelperFunctions/Guest/guestPlatformConfigs.js` | The three platform profiles — encryption/verification only, no `platformIP` |
| `Services/SysFunctions/deepObjectCopy.js` | `deepMerge` — why an omitted key inherits the template's value |
| `Services/Middlewares/PlatformCheck/platformHandler.js` | `getPlatformConfig` — case-insensitive name match, IP match, domain match (`isPlatformDomainAllowed`), unencrypted exemption |
| `Src/app.js` | `trust proxy` / `TRUST_PROXY_HOPS`, which determines `req.ip` |
| `Services/Middlewares/config.js` | `platformConfigHandler` — calls the peek before matching, passes `req.get('origin')` |
| `Src/Apis/GeneratedApis/Custom/Login/Custom_Objects/LoginWithOTP/login.js` | Both steps use the `platform` array shape so `supported` applies |
| `data/migrations/20260910_1_normalize_platform_names_and_keys.sql` | Registry normalization — `Ios_App`, key rotation, retires other platforms |

## Related

- [Access Token Security & Session Management](../access-token-security/access-token-security.md) — the authentication layer these perimeter controls sit in front of.
- [Client Runtime Config](../../admin-apis/client-runtime-config.md) — an inline block on `Crud_Template` with `platformIP: ['*']` and the shared `domains` / `supported` lists, so both frontends can reach it before sign-in.
- [Attachment Upload & Serve](../attachment-pipeline/attachment-pipeline.md) — the two upload endpoints and the query-string envelope.
