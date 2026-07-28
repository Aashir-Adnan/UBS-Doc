# Email Validation

A standalone, pre-submit email check. It runs the **exact same email gate** the OTP / signup flows enforce (`OTPGeneration.js`, `signupGuest.js`, `validateUserEmailField.js`), exposed as its own endpoint so the frontend can validate an address **before** it triggers a login / signup request — instead of every screen re-implementing the rules.

| Operation | Method | Path | Permission |
|---|---|---|---|
| Add | **POST** | `/api/validation/email` | *(none — public)* |

> **Route note.** The URL resolves to `global.ValidationEmail_object` via PascalCase conversion (`validation` + `email` → `ValidationEmail`).

---

## Authentication & Authorization

Public. Runs on the **`PUBLIC_ENCRYPTED_PLATFORM`** — the request/response bodies are AES-encrypted with the platform key only (same as OTP / refresh), but there is **no access token and no permission check** (`requestMetaData.permission` is `null`). It is meant to be callable from the pre-auth login / signup screens.

---

## Request Payload

Encrypted body:

| Field | Type | Source | Required | Description |
|---|---|---|---|---|
| `email` | `string` | body | Yes | The address to validate. Trimmed before checking. |

```json
{
  "email": "guest@example.com"
}
```

Missing/empty `email` is the **only** hard error → `400` (`scc: "E10"`). Every other outcome is returned as a structured verdict (see below), never thrown — so the FE can render inline field feedback.

---

## Response

The verdict object (inside the standard encrypted `{ success, data, meta, error }` envelope):

| Field | Type | Description |
|---|---|---|
| `email` | `string` | The trimmed input, echoed back. |
| `valid` | `boolean` | `true` only when **both** layers pass (`format_valid && domain_accepts_mail`). |
| `format_valid` | `boolean` | RFC format + not a disposable/temporary provider (MailChecker). |
| `disposable` | `boolean` | `true` when the address failed the format/disposable layer — surfaced explicitly so the FE can word it ("temporary emails aren't allowed"). |
| `domain_accepts_mail` | `boolean` | Strict-MX DNS result — the domain publishes a usable MX record. |
| `reason` | `string` \| `null` | `null` when valid; otherwise a human-readable reason. |

### Example — valid

```json
{
  "email": "guest@example.com",
  "valid": true,
  "format_valid": true,
  "disposable": false,
  "domain_accepts_mail": true,
  "reason": null
}
```

### Example — disposable / bad format

```json
{
  "email": "throwaway@mailinator.com",
  "valid": false,
  "format_valid": false,
  "disposable": true,
  "domain_accepts_mail": false,
  "reason": "Invalid email format or a disposable/temporary email provider."
}
```

### Example — domain doesn't accept mail

```json
{
  "email": "someone@no-mx-domain.example",
  "valid": false,
  "format_valid": true,
  "disposable": false,
  "domain_accepts_mail": false,
  "reason": "This email domain doesn't appear to accept mail. Please double-check the address."
}
```

---

## Behavior

Two layers, mirroring the creation endpoints exactly:

1. **Format + disposable** — `MailChecker.isValid`: RFC format plus a disposable/temporary-provider blacklist (mailinator, yopmail, …).
2. **Strict-MX DNS** — `emailDomainAcceptsMail`: the domain must publish a usable MX record. It **fails open** on DNS trouble and short-circuits for known-good domains, so a real address is never falsely rejected on a DNS hiccup.

The MX check only runs when the **format is already valid** — no point resolving DNS for a string that isn't an address, and it keeps the response fast for typos.

Response messages are **bare `en` strings** (not multilingual) — this is a pre-auth utility endpoint.

---

## Source Files

| File | Purpose |
|---|---|
| `Src/Apis/ProjectSpecificApis/ValidationEmail/ValidationEmail.js` | API object (public encrypted platform, POST, `permission: null`) |
| `Src/Apis/ProjectSpecificApis/ValidationEmail/CRUD_parameters.js` | Request field schema (`email`) |
| `Src/HelperFunctions/PreProcessingFunctions/Validation/validateEmailPreProcess.js` | The two-layer check; writes `decryptedPayload._emailValidation` |
| `Services/SysFunctions/emailDomainAcceptsMail.js` | Strict-MX DNS helper (fail-open, known-good short-circuit) |
