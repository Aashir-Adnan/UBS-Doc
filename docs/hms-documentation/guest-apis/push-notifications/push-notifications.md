# Push Notifications (FCM)

Push notifications use **Firebase Cloud Messaging (FCM)** to deliver real-time alerts to guest mobile devices (iOS + Android). The system stores FCM tokens on the `user_devices` table and sends notifications server-side via the `firebase-admin` SDK.

## Overview

| Concept | Detail |
|---|---|
| Provider | Firebase Cloud Messaging (FCM HTTP v1 API) |
| Platforms | iOS (via APNs bridge) + Android |
| Token storage | `user_devices.fcm_token` column |
| Device key | `X-Client-Device-UUID` header (stable per install) |
| Auth | `accesstoken` header identifies the user |
| Service account | `fcm-service-account.json` (server secret, gitignored) |

## Token lifecycle

```
┌─────────────┐     ┌──────────────────┐     ┌────────────────────┐
│  App launch  │────▶│  OTP verify/     │────▶│  POST /devices/    │
│  getToken()  │     │  login (optional  │     │  register (explicit│
│              │     │  fcmToken in body)│     │  token upsert)     │
└─────────────┘     └──────────────────┘     └────────────────────┘
                                                        │
                    ┌──────────────────┐                 │
                    │  Token refresh   │─────────────────┘
                    │  (onTokenRefresh) │     (same register endpoint)
                    └──────────────────┘

                    ┌──────────────────┐
                    │  Logout          │────▶  POST /devices/unregister
                    └──────────────────┘      (nulls fcm_token)
```

## Endpoints

### POST /api/guest/devices/register

Upserts the FCM token on the user's device row. Called after login, on token refresh, and when the token first resolves.

**Platform:** AUTH (encrypted with accessToken + platform key)

#### Request

```json
{
  "fcmToken": "dK3nF8x...longFcmToken"
}
```

| Field | Type | Required | Description |
|---|---|---|---|
| `fcmToken` | string | Yes | The FCM registration token from `getToken()` |

**Headers used (already sent by the app):**

| Header | Purpose |
|---|---|
| `X-Client-Device-UUID` | Stable per-install UUID — used as device primary key |
| `X-Client-Platform` | `ios` / `android` — stored as `device_type` |
| `X-Client-Device` | Device model name — stored as `device_name` |
| `X-Client-OS-Version` | OS version — stored as `os_version` |
| `X-App-Version` | App version — stored as `app_version` |
| `accesstoken` | Identifies the authenticated user |

#### Response — 200 OK

```json
{
  "success": true,
  "data": {
    "return": { "registered": true }
  }
}
```

#### Behaviour

- If a `user_devices` row exists for this user + UUID → updates `fcm_token` + metadata.
- If no row exists → inserts a new `user_devices` row.
- The FCM token rotates — the app must call this endpoint on every `onTokenRefresh`.

---

### POST /api/guest/devices/unregister

Detaches the FCM token on logout. Nulls `fcm_token` on the device row — does NOT delete it, so the next login can re-bind.

**Platform:** AUTH (encrypted with accessToken + platform key)

#### Request

```json
{}
```

No body fields required. Device is identified by `X-Client-Device-UUID` header.

#### Response — 200 OK

```json
{
  "success": true,
  "data": {
    "return": { "unregistered": true }
  }
}
```

---

### FCM token during OTP login

The `fcmToken` field is **optionally accepted** during the OTP flow so the app can register in one shot at login:

- **POST /api/guest/auth/send-otp** — accepts optional `fcmToken` in body, stores it on the device row.
- **POST /api/guest/auth/verify-otp** — accepts optional `fcmToken` in body, stores it after successful verification.

If the app sends `fcmToken` during OTP login, there is no need to immediately call `/devices/register` afterwards (though it's harmless to do so).

---

## Notification payload contract

Every push notification sent by the backend follows this structure:

```jsonc
{
  "message": {
    "token": "<fcm_token>",
    "notification": {
      "title": "Booking Confirmed",          // visible alert title
      "body": "Room 204 — check-in at 3 PM"  // visible alert body
    },
    "data": {
      "type": "booking_update",     // notification type (see table below)
      "bookingId": "9025",          // entity ID (always string)
      "route": "/bookings/9025"     // deep link path for tap routing
    },
    "android": {
      "priority": "high",
      "notification": { "sound": "default", "channelId": "hms_default" }
    },
    "apns": {
      "payload": {
        "aps": { "sound": "default", "badge": 1, "content-available": 1 }
      }
    }
  }
}
```

### `data` fields

| Field | Type | Description |
|---|---|---|
| `type` | string | Notification type — determines how the app handles the tap |
| `route` | string | Deep link path the app navigates to on tap |
| Other fields | string | Entity-specific IDs (e.g. `bookingId`, `serviceId`) — always stringified |

### Notification types

| `type` | When sent | `data` keys |
|---|---|---|
| `booking_update` | Booking status change (confirmed, cancelled, etc.) | `bookingId`, `route` |
| `booking_reminder` | Upcoming booking reminder | `bookingId`, `route` |
| `checkin_ready` | Room ready for check-in | `bookingId`, `route` |
| `checkout_reminder` | Check-out approaching | `bookingId`, `route` |
| `payment_confirmed` | Payment received | `bookingId`, `transactionId`, `route` |
| `service_update` | Booked service status change | `bookingId`, `serviceId`, `route` |
| `loyalty_points` | Points earned or tier change | `points`, `route` |
| `promo` | Promotional notification | `promoId`, `route` |
| `general` | General announcement | `route` |

---

## Backend usage

### Sending to a user (all devices)

```js
const { sendPushToUser } = require("./Services/SysFunctions/pushNotification");

await sendPushToUser(userId, {
  title: "Booking Confirmed",
  body: "Room 204 — check-in at 3 PM",
  data: {
    type: "booking_update",
    bookingId: "9025",
    route: "/bookings/9025",
  },
});
// Returns: { sent: 2, failed: 0, pruned: 0 }
```

### Sending to a specific token

```js
const { sendPushToToken } = require("./Services/SysFunctions/pushNotification");

await sendPushToToken(fcmToken, {
  title: "Check-in Ready",
  body: "Your room is ready",
  data: { type: "checkin_ready", bookingId: "9025", route: "/bookings/9025" },
});
// Returns: { sent: true, messageId: "projects/xxx/messages/yyy" }
```

### Token hygiene

The send helper automatically prunes dead tokens. When FCM returns `UNREGISTERED`, `INVALID_ARGUMENT`, or `INVALID_REGISTRATION_TOKEN`, the `fcm_token` is set to `NULL` on the `user_devices` row.

---

## Setup

1. **Firebase service account:**
   - Firebase Console → Project Settings → Service Accounts → Generate new private key
   - Save as `fcm-service-account.json` in the backend root (gitignored)

2. **Environment variable:**
   ```
   FCM_SERVICE_ACCOUNT_PATH=./fcm-service-account.json
   ```

3. **Migration:**
   ```sql
   ALTER TABLE user_devices ADD COLUMN fcm_token varchar(255) DEFAULT NULL AFTER device_token;
   ```

4. **Android notification channel:**
   The app must create a notification channel with ID `hms_default` (the `channelId` in the payload).

---

## Database

### `user_devices` table (relevant columns)

| Column | Type | Description |
|---|---|---|
| `user_device_id` | int PK | Auto-increment |
| `user_id` | int | FK to users — nullable (null after unregister) |
| `device_token` | varchar(255) | `X-Client-Device-UUID` — stable per install |
| `fcm_token` | varchar(255) | FCM registration token — nullable |
| `device_name` | varchar(255) | Device model from headers |
| `device_type` | enum | `ios` / `android` / `web` / `kiosk` |
| `os_version` | varchar(50) | OS version from headers |
| `app_version` | varchar(50) | App version from headers |
| `last_login_at` | datetime | Last OTP verify time |
| `status` | enum | `active` / `inactive` |

A user may have multiple active device rows (phone + tablet). `sendPushToUser` sends to all devices with a non-null `fcm_token`.
