# Frequently Asked Questions

This page answers the most common questions when working with **UBS Framework**, including API structure, running the server, encryption, preprocess functions, and more.

---

## How do I call an API?

An API is called by hitting a UBS-generated URL:

```text
http://[base-url]:[port]/api/[constructed-api-url]
````

**Example:**

```text
http://localhost:3000/api/example/api/structure
```

### How the URL is constructed

If your API object is declared like this:

```js
global.ExampleApiStructure_object = {}
```

UBS automatically creates its route by:

1. Taking the object name before the `_`
2. Splitting it into words: `Example Api Structure`
3. Converting it into a lowercase path with slashes:

```text
example/api/structure
```

This means:

```text
global.YourCustomApi_object → /api/your/custom/api
```

---

## How do I access documentation?

All UBS documentation is stored in two places:

* **Google Drive (official reference):**
  [https://drive.google.com/drive/folders/1efkNvEoj3ooRa_ieXooe7hUQXLRVieje?usp=sharing](https://drive.google.com/drive/folders/1efkNvEoj3ooRa_ieXooe7hUQXLRVieje?usp=sharing)

* **This website (Docusaurus documentation)**
  All UBS guides, FAQs, and technical references.

---

## How do I run the server?

Run the following:

```bash
npm i     # install dependencies
npm run start
```

This starts the UBS server with all defined APIs and global objects loaded.

---

## How do I add a new API?

To add an API:

1. Create a **global object** in the naming format described in
   [`UBS Intro`](/docs/backend/UBS-intro)

Example:

```js
global.UserLogin_object = {
  query: "...",
  config: { ... }
};
```

2. UBS automatically exposes it at:

```text
/api/user/login
```

3. Add preprocess, postprocess, query functions, and flags as needed.

---

## How is a URL constructed in UBS Framework?

UBS converts API object names into REST-style routes:

```text
global.SampleThing_object → /api/sample/thing
```

Rule:
**ObjectNameBeforeUnderscore → split by capital letters → join with slashes → lowercase**

---

## How do preprocess functions work?

Preprocess functions run **before the main query**, after core config functions.

Example:

```js
PreProcessFunctions: [func1, func2]
```

### Behavior

Each function runs sequentially and must be **async**.

Their results are stored inside:

```js
decryptedPayload[functionName]
```

Example:

```js
async function add(num1, num2) {
  return num1 + num2;
}
```

Result available as:

```js
decryptedPayload.add
```

### Recommended uses

* validating data
* enriching payload
* generating tokens
* calling other APIs
* adding system metadata

---

## How does the post-process function work?

The post-process function runs:

**after query execution but before sending the response.**

```js
PostProcessFunction: async function format(result) {
  return { cleaned: result };
}
```

UBS sends:

```js
response.return = <value of postprocess>
```

Useful for:

* formatting SQL results
* removing internal fields
* structuring API responses

---

## How does the QueryPayload function work?

Use this when your SQL query depends on dynamic payload values.

Example:

```js
QueryPayload: async (req, decryptedPayload) => {
  return `
    SELECT * FROM users
    WHERE id = {{userId}}
  `;
}
```

### How placeholders work

* `{{attribute}}` → replaced with value from `decryptedPayload.attribute`
* If the attribute is an **array**, UBS runs the query once for each value
  *(only one array attribute allowed per query)*

This allows dynamic:

* filtering
* batch operations
* conditional SQL building

---

## What are the prerequisites for running the server?

You need:

* Node.js installed
* `npm i` completed
* The **core CRUD objects** available
* Proper folder structure in place (`/api`, `/objects`, `/config`, etc.)

---

## How do I enable or disable encryption?

Set the following inside your API object:

### Encrypted + Requires Login

```js
config: {
  communication: {
    encryption: {
      platformEncryption: true,
      accessToken: true
    }
  }
}
```

### Encrypted but Public API

```js
config: {
  communication: {
    encryption: {
      platformEncryption: true
    }
  }
}
```

### No encryption (plaintext)

```js
config: {
  communication: {
    encryption: false
  }
}
```

Use this only for testing.

---

## What is the API blueprint? How should request/response payloads be structured?

### Request Format

All requests must send `Content-Type: application/json`.

For **encrypted endpoints**, the encrypted payload is sent either:
- In the request **header** as `encryptedRequest`, or
- In the request **body** as `{ "encryptedRequest": "..." }`

The encrypted request decrypts into an `encryptionDetails` object plus the actual `reqData`. The `encryptionDetails` must include:

```json
{
  "PlatformName": "your-platform",
  "PlatformVersion": "1.0",
  "accessToken": "<jwt-token>"
}
```

`accessToken` can also be passed directly via the `accesstoken` header.

The encryption key is built by concatenating:
1. The `accessToken` (if `accessToken: true` in config)
2. A `plainKey` (if configured)
3. The platform's `encryption_key` from the database (looked up by `PlatformName` + `PlatformVersion`)

### Response Format

Every response follows this envelope:

**Success:**
```json
{
  "success": true,
  "message": "Human-readable status message",
  "data": { }
}
```

**Failure:**
```json
{
  "success": false,
  "message": "Human-readable error description",
  "error": "Internal error detail"
}
```

---

## What are the HTTP status codes?

| Code | Meaning | When it occurs |
|---|---|---|
| `200` | OK | Request succeeded |
| `400` | Bad Request | Missing/invalid input, encryption errors, missing payload |
| `401` | Unauthorized | Missing or invalid `accessToken`, authentication failure |
| `404` | Not Found | Requested resource does not exist |
| `500` | Internal Server Error | Unhandled server-side exception |

**Session expiry** returns `401` with:
```json
{
  "success": false,
  "message": "Session expired. Please log in again.",
  "error": "TokenExpiredError"
}
```

---

## What are the framework error codes (SSC)?

These are internal error codes returned in error messages from the framework middleware:

| Code | Message |
|---|---|
| `E10` | Please check your input and try again |
| `E22` | A system error occurred. Please try again later |
| `E24` | Security verification failed. Please try again |
| `E31` | You do not have permission to perform this action |
| `E40` | Authentication failed. Please log in again |
| `E42` | Verification code is incorrect. Please try again |
| `E50` | The requested resource was not found |
| `E51` | This platform or client is not supported |
| `E52` | This operation is not allowed |
| `E99` | An unexpected error occurred. Please try again or contact support if the problem persists |

`E10` specifically covers: missing encrypted payload, missing encryption details, or invalid `PlatformName`/`PlatformVersion`.

---