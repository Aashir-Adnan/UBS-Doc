---
title: "Device Sessions, New-Device Alerts and Trusted Devices"
sidebar_position: 1
---

# Device Sessions, New-Device Alerts and Trusted Devices

Every login in HMS is bound to one row in `user_devices`. This page explains how the backend decides which row a login belongs to, when it emails the user about a sign-in from a new device, and what `is_trusted` means.

:::note
Backend code: `Services/SysFunctions/deviceSessionScope.js` (matching), `Services/SysFunctions/newDeviceAlert.js` (alert email and trust). Migrations: `20261013_1_user_devices_device_uuid.sql`, `20261013_2_user_devices_backfill_last_login.sql`, `20261013_3_user_devices_is_trusted.sql`.
:::

---

## Why it changed

A device used to be identified only by **user + `device_name` + `os_version`** (staff logins also added the platform version). `device_name` is just the browser and its major version, for example `Chromium/152`, and Chrome reports every Mac as `Mac OS X 10_15_7`. So two different computers running the same browser looked like **one** device:

1. The second computer's login found the first computer's row.
2. It wrote its new access token onto that row.
3. The first computer's token no longer matched the stored one, so `validateToken` logged it out.

Each login kicked out the other machine. Password login was worse: it always used the user's **first** `user_devices` row, whatever machine the user was on.

---

## How a device is identified now

The clients already send a stable per-install id on every request in the `x-client-device-uuid` header. The web apps generate it once with `crypto.randomUUID()` and keep it in `localStorage` as `device_uuid`. The backend now stores it in `user_devices.device_uuid` and matches on it.

| Situation | Row used |
|---|---|
| A row with this user and this `device_uuid` exists | That row (same browser or app install) |
| No such row, but a row from before this change (`device_uuid` NULL) has the same browser and OS | That old row, and the uuid is written onto it (one-time adoption) |
| Neither | A new row, with the uuid stored |

Rules that follow from this:

- **Two identical computers are two devices.** Different uuids, different rows, independent sessions.
- **Adoption happens once per old row.** After its first login with a uuid, only that exact uuid matches it.
- **Logging in retires only rows with the same uuid** (duplicates of the same install). It never touches another device's session.
- **Staff logins also match on the platform version**, so the same browser can keep separate sessions in different HMS apps.
- **Invalid ids are ignored.** A value that is not 8 to 64 characters of letters, digits, `.`, `_`, `:` or `-`, or the shared fallback `1234567890`, is treated as "no uuid", and the old browser + OS matching is used.

The uuid is **not** a secret. The client sends it, so it only decides which row a login uses. Security still comes from the access token, which carries the `deviceId`, and from the token stored on that row.

### Flows that use it

| Flow | Where |
|---|---|
| Guest OTP send, OTP verify | `sendGuestOtp.js`, `verifyGuestOtp.js` |
| Guest social sign-in | `buildGuestLoginPayload.js` (from `signupGuestSocial.js`) |
| Guest push-token register and unregister | `guestDevicesHeaderAndBody.js` |
| Staff OTP send, OTP verify, wrong-code counting | `OTPGeneration.js`, `otpVerif.js` |
| Staff password login | `LoginWithPassword/lwp.js` (now resolves or creates its own row) |

Partner sessions (`partnerSessions.js`) are unchanged: one server session per partner platform version, by design.

### Frontend requirement

The header must carry the **same** uuid from the "send OTP" request through to "verify", and on every later request.

- The three login pages generate the uuid and save it to `localStorage` before the OTP is requested, which satisfies this.
- `Login/Page.jsx` and `GuestLoginPage.jsx` fall back to the constant `1234567890` when `crypto.randomUUID` is unavailable (plain HTTP on a LAN address). The backend ignores that value, so those browsers keep the old matching. Replace the fallback with a generated uuid, as the Moonlit login form already does.
- `getDeviceHeaders()` in `deviceIdentifier.js` generates a temporary uuid without saving it when none is stored. It should save it on first generation.

---

## New-device sign-in email

When a login **completes** on a device that has never completed a login before, and the user already has another device that has, the user gets an email.

### When it is sent

| Case | Email? |
|---|---|
| Login completes on a new device, and the user has another known device | **Yes** |
| A code is only requested (OTP send) | No: anyone can request a code for any email |
| The account's first device, or signup | No |
| The device has logged in before, including a one-time adoption of an old row | No |
| A session created for someone else: admin-created guest, check-in | No |
| Partner sessions | No |
| More than 3 alerts for the same user within an hour | No (throttled) |

A device counts as **new** when its `last_login_at` is NULL at the moment the login completes. It is checked before the login stamps `last_login_at`.

### What it contains

- Subject: "New sign-in to your account", in the standard branded email template.
- Browser and OS (for example `Chromium/152 on MacOS 10.15.7`), app type, time in UTC.
- Location: the Cloudflare `CF-IPCountry` country plus the client IP. The country is now part of `deviceContext.country`.
- Advice: guests are told to contact support, staff to contact their administrator.

All values are HTML-escaped, since browser and OS come from request headers.

### Delivery

The email is sent in the background after the session has been written. A mail failure is logged and never slows down or fails the login.

| Environment variable | Default | Effect |
|---|---|---|
| `NEW_DEVICE_ALERTS_ENABLED` | `true` | `false` turns alerts off |
| `NEW_DEVICE_ALERTS_PER_HOUR` | `3` | Maximum alerts per user per hour |

The throttle is kept in memory: it resets on restart and is not shared between server instances.

---

## Trusted devices (`is_trusted`)

`is_trusted` means **recognized device**: the user has completed a login on it before.

| Event | `is_trusted` |
|---|---|
| First completed login on the device | `0` |
| Any later completed login on the same device | `1` |
| Session retired (replaced by another login with the same uuid) | `0` |
| Admin-created guest or check-in session | unchanged |

It is set automatically, with no action from the user. **It must never be used to skip an OTP or any other security check**, because anyone holding the device earns it by logging in twice. Use it for display (a "recognized" badge in a device list) or to tune alerts.

---

## Database changes

| Migration | Change |
|---|---|
| `20261013_1_user_devices_device_uuid.sql` | Adds `device_uuid VARCHAR(64) NULL` after `os_version`, and index `idx_user_devices_user_device_uuid (user_id, device_uuid)`. Existing rows keep NULL until their device logs in. |
| `20261013_2_user_devices_backfill_last_login.sql` | Sets `last_login_at` on rows that show a completed login (access token, refresh token, push token, retired session, or a verified login OTP), so existing devices are not treated as new on release day. Staff logins did not stamp `last_login_at` before. |
| `20261013_3_user_devices_is_trusted.sql` | Devices with two or more verified logins become `1`, every other row `0`, then the column becomes `TINYINT(1) NOT NULL DEFAULT 0`. |

All three are idempotent. The staff OTP and password logins now also stamp `last_login_at` and `last_active_at`.

---

## Known limitations

- **The one-time adoption cannot tell machines apart.** The first login after release on an old row is matched by browser and OS. If a different machine with the same browser and OS logs in first, it adopts the row and no alert is sent. This happens at most once per old row.
- **Clearing browser storage or using incognito creates a new device**, and therefore a new-device email. Old rows are not cleaned up yet.
- **No "Sign out this device" link yet.** The email points to support or an administrator. A per-user devices page is the planned next step.

---

## Testing

1. Restart the backend so the migrations run.
2. Log in as a user who already has a known device, from a browser profile that has never logged in to that account. Expected: a new `user_devices` row with the uuid and `is_trusted = 0`, and the email arrives.
3. Log in again from the same browser. Expected: the same row, `is_trusted = 1`, no email.
4. Log in on two different computers with the same browser and OS. Expected: two rows, and both stay logged in.
