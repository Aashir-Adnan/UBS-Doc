---
title: "Email Validation Pipeline"
sidebar_position: 1
---

# Email Validation Pipeline

This document describes the layered email-validation system that gates every path where an email address enters or changes in the `users` table, plus the OTP send paths. Its goal is to keep dummy, disposable, and undeliverable email addresses out of the system at the point of entry.

---

## Context

Emails are the login identity in HMS (OTP, password, forgot-password all resolve a user by email), so an invalid address produces a dead, unusable account and a silently undeliverable OTP. Previously, only a format regex guarded some entry points. The validation pipeline adds two stronger layers — a disposable-domain blacklist and a live DNS deliverability check — applied consistently through a shared helper.

---

## The Validation Ladder

Each request passes through the gates in order; the first failing gate rejects with a `400` and a stable message. Each layer answers a different question:

| # | Gate | Question it answers | Cost |
|---|------|--------------------|------|
| 1 | Normalization (`trim` + lowercase) | canonical identity | 0 ms |
| 2 | Format regex | is it shaped like an email? | 0 ms |
| 3 | Disposable blacklist (`mailchecker`) | is the domain a known throwaway service? | ~0 ms (in-memory, 56k+ domains, subdomains included) |
| 4 | Strict-MX domain check (`emailDomainAcceptsMail`) | does the domain publish a mail service right now? | 0–90 ms (allowlist/cache hits are 0 ms) |
| 5 | Duplicate / registered lookup (DB) | identity integrity | 1 indexed query |
| 6 | OTP round-trip | does the specific mailbox actually exist? | free (email already sent) |

Layer 6 is the only authoritative mailbox-existence proof — no offline check can determine whether `someone@gmail.com` is a real mailbox. SMTP probing was evaluated and rejected: outbound port 25 is blocked on typical hosting networks, and mail servers widely reject or greylist verification probes.

---

## Components

### `mailchecker` (npm)

- Zero-dependency package, MIT, no known vulnerabilities.
- `MailChecker.isValid(email)` — synchronous; rejects malformed addresses **and** 56,000+ disposable domains (mailinator, yopmail, 10minutemail, ...), including their subdomains.
- Blacklist refreshes via normal `npm update mailchecker`.

### `emailDomainAcceptsMail` (custom helper)

`backend/Services/SysFunctions/emailDomainAcceptsMail.js` — plain Node `dns`, no external package.

- **Strict-MX policy**: a domain passes only if it publishes a usable MX record. `ENOTFOUND` / `ENODATA` (domain missing, or registered but without mail service — e.g. parked domains) rejects. An RFC 7505 null MX (`MX 0 .`) also rejects. The RFC 5321 A-record fallback is deliberately **not** used: "website but no MX" is a strong dummy-email signal in practice.
- **Fail-open on resolver trouble**: timeouts (1.5 s cap), `SERVFAIL`, and other DNS errors return *accept* — a DNS outage must never block real signups.
- **Known-good allowlist**: major mailbox providers (`gmail.com`, `outlook.com`, `yahoo.com`, `icloud.com`, ...) and `granjur.com` skip DNS entirely. Extendable without a deploy via the env var `EMAIL_KNOWN_GOOD_DOMAINS` (comma-separated) — the instant escape hatch if a partner domain is ever wrongly blocked.
- **10-minute in-process cache** per domain (positive and negative verdicts), so repeated signups from common domains cost 0 ms.

### `validateUserEmailField` (shared gate)

`backend/Src/HelperFunctions/PreProcessingFunctions/validateUserEmailField.js` — the single reusable form of the chain:

- `assertUsableEmail(email)` — direct call; throws `400` on mailchecker or strict-MX failure.
- `validateUserEmailField(req, decryptedPayload)` — drop-in preProcess; reads `users_email` (or `email`) and **no-ops when the payload does not carry an email**, so partial updates are unaffected.

Any future tuning (allowlist, messages, policy) propagates from this one place.

---

## Coverage Map

Every write path to `users.email`, plus the OTP send paths, runs the chain:

| Endpoint / path | Kind | Where the gate lives |
|-----------------|------|----------------------|
| `GuestSignup` | creation | `signupGuest.js` (inline, before any DB work) |
| `AdminCreateGuestUser` | creation | `adminCreateGuestUser.js` (inline) |
| `CustomUsersGroupedCrud` step 1 Add | creation | `step1_add_user.js` (inline) |
| `TenantsGroupedCrud` step 2 (new tenant admin) | creation | `step2_assign_admin.js` → `assertEmailUnique` |
| Generic Users CRUD Add | creation | `CrudUsers` preProcess → `validateUserEmailField` |
| `CustomUsersGroupedCrud` step 1 Update | update | `step1_update_user.js` → `assertUsableEmail` |
| `GuestProfile` Update (guest self-service) | update | preProcess → `validateUserEmailField` |
| Generic Users CRUD Update | update | preProcess → `validateUserEmailField` |
| `Profile` Update (staff self-service) | update | `assertProfileEmailUnique` → `assertUsableEmail` |
| `GuestSendOtp` | OTP backstop | `sendGuestOtp.js` (mailchecker only) |
| `OTPGeneration` (staff OTP) | OTP backstop | `OTPGeneration.js` (mailchecker only) |

**OTP paths intentionally skip the MX check** — those emails already exist in `users` (they passed the gate at creation), and the registered-user DB lookup provides equivalent protection at zero DNS cost. The mailchecker backstop remains there as defense-in-depth for rows that predate the gates or entered via out-of-band writes (migrations, seeds).

The select-existing-user paths (e.g. `tenantAdmin_selectUserId`) bypass validation by design — that user's email already passed the gate when the account was created.

---

## Error Messages

| Condition | Status | Message |
|-----------|--------|---------|
| Malformed (regex, signup paths) | 400 | `Invalid email format` |
| Malformed or disposable (mailchecker) | 400 | `Invalid or disposable email address` / `Disposable email addresses are not allowed` (signup paths) |
| Domain publishes no mail service | 400 | `We couldn't verify this email domain. Please double-check the address.` |
| Duplicate email | 409 | existing per-endpoint duplicate messages (`scc: DUPLICATE` where applicable) |

The domain-failure message is deliberately soft ("double-check") because a strict-MX false positive — e.g. a real domain mid-DNS-migration — should prompt the user to re-check, not conclude the system is broken. The negative-cache holds a wrong verdict for at most 10 minutes; the env allowlist unblocks a domain instantly.

---

## Design Decisions & Trade-offs

- **Strict-MX over RFC 5321 A-fallback.** A registered-but-parked domain (website, no MX) passed the original lenient check while being undeliverable in practice. Strict-MX rejects it. Residual risk — implicit-MX self-hosted domains and DNS-migration windows — is mitigated by the soft message, fail-open on errors, and the env allowlist.
- **No SMTP mailbox probing.** Requires an open outbound port 25, a mail-reputable static IP with PTR, and retry machinery; even then results are unreliable (catch-alls, probe-blocking) and probing risks blocklisting the sending identity. Mailbox existence is proven by the OTP round-trip instead.
- **Validation before DB work.** Every inline gate runs before queries/inserts so rejected requests cost no DB round-trips.

### Known gap

A well-formed address on a real domain with a **non-existent mailbox** (e.g. `zzqx9v@gmail.com`) passes all offline gates and creates an `active` user row; the OTP loop makes it unusable but not uncreatable. Closing it fully requires verify-first signup (OTP before the `users` INSERT) and/or bounce processing on the sender inbox — evaluated and documented as future options, not yet implemented.

---

## Test Tooling

- **Interactive checker** — run any address through the full ladder with per-gate verdicts, timings, and raw DNS detail:

  ```bash
  node Services/SysScripts/TestScripts/emailValidationCheck.js            # interactive
  node Services/SysScripts/TestScripts/emailValidationCheck.js a@b.com    # one-shot
  ```

- **Gate regression harness** — exercises all wired checkpoints (creation, update, OTP) with malformed / disposable / parked-domain / legitimate inputs, verifies the preProcess wiring by extracting functions from the live API objects, and cleans up every row it creates:

  ```bash
  node Services/SysScripts/TestScripts/Debug/emailGateHarness.js
  ```
