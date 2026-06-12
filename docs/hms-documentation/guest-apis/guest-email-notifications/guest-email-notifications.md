# Guest Email Notifications

Automated email notifications sent to guests during key lifecycle events: account creation and booking confirmation.

---

## Overview

| Trigger | Email Subject | Template | Branding |
|---------|--------------|----------|----------|
| `POST /api/guest/auth/signup` | Welcome — Your Account is Ready | Account Created | Serenity (platform-level) |
| `POST /api/guest/bookings/room` | Your Booking Confirmation | Booking Created | Tenant-resolved (via `resolveEmailBranding`) |

Both emails are sent **fire-and-forget** from the postProcess function — they do not block the API response. Failures are caught and logged via `logMessage`.

All emails are logged to the `email_log` table in the security database.

---

## Email 1: Account Created (Welcome)

### Trigger

Sent from the `postProcess` of `POST /api/guest/auth/signup` when the newly created user has a valid email address.

### Template Content

- Personalized greeting with the guest's first name
- Welcome message explaining what they can do (explore hotels, make bookings, manage stays)
- **Visit Website** CTA button → [hms.gobizzi.com](https://hms.gobizzi.com)
- **Download the App** section with two buttons:
  - **Google Play** → Play Store home page (placeholder until app is published)
  - **App Store** → App Store home page (placeholder until app is published)

### Branding

Always uses **Serenity** branding (platform-level), matching the OTP email style — since at signup the guest has no tenant context yet.

### Implementation

| File | Purpose |
|------|---------|
| `Src/HelperFunctions/PostProcessingFunctions/Guest/sendAccountCreatedEmail.js` | Builds HTML template and sends email |
| `Src/Apis/ProjectSpecificApis/GuestSpecificApis/GuestSignup/GuestSignup.js` | Calls `sendAccountCreatedEmail` in postProcess |

### Email Conditions

- Email is only sent if `signupGuest` returns a non-empty `email` field
- The signup preProcess already validates email format (`/^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/`)

---

## Email 2: Booking Confirmation

### Trigger

Sent from the `postProcess` of `POST /api/guest/bookings/room` after a booking is successfully created (i.e., `booking_id` exists).

### Template Content

- Personalized greeting with the guest's full name
- Booking details card with:
  - **Booking number** (e.g., `BK026892806908`)
  - **Hotel** name (tenant name)
  - **Check-in** and **Check-out** dates (formatted as `Wed, Jul 15, 2026`)
  - **Guests** count
  - **Total** amount with currency symbol
  - **Status** (e.g., confirmed, pending)
- Instructions to view/manage the booking from the app or website
- Contact prompt for questions

### Branding

Uses **tenant-resolved branding** via `resolveEmailBranding(userId)`:
- SaaS Admin / Tenant Manager → Serenity brand
- Everyone else → tenant name from the booking's hotel

### Implementation

| File | Purpose |
|------|---------|
| `Src/HelperFunctions/PostProcessingFunctions/Guest/sendBookingCreatedEmail.js` | Fetches booking details from DB, builds HTML, sends email |
| `Src/Apis/ProjectSpecificApis/GuestSpecificApis/GuestBookingsRoom/GuestBookingsRoom.js` | Calls `sendBookingCreatedEmail` in postProcess |

### Data Fetched

The booking email fetches all necessary data in a single query:

```sql
SELECT
  b.booking_number, b.check_in_date, b.check_out_date,
  b.total_guests, b.total_amount, b.status,
  c.currency_symbol,
  u.first_name, u.last_name, u.email, u.user_id,
  t.tenant_name
FROM bookings b
LEFT JOIN currencies c ON b.currency_id = c.currency_id
INNER JOIN user_roles_designations_department urd
  ON b.user_role_designation_department_id = urd.user_role_designation_department_id
INNER JOIN users u ON urd.user_id = u.user_id
LEFT JOIN tenants t ON b.tenant_id = t.tenant_id
WHERE b.booking_id = ?
```

### Email Conditions

- Only sent if the booking query returns a row **and** the guest has a non-empty email
- If the query fails or the user has no email, the function silently returns

---

## Email Template Theme

Both templates use the same branded HTML theme as the OTP email:

- Responsive layout (adapts to mobile at 600px)
- Dark mode support via `@media (prefers-color-scheme: dark)`
- Teal accent colors (`#54B2B0` / `#3D8A88`)
- Gradient CTA buttons with box shadows
- Header with brand name, tagline, and "Notification" badge
- Footer with recipient email, copyright, and do-not-reply notice

The templates pass custom HTML via the `bodyHtml` option to `handleSendEmail`, which injects it into the shared `buildEmailHtml` wrapper.

---

## `handleSendEmail` — bodyHtml Option

The `bodyHtml` option was added to `Services/SysFunctions/sendEmail.js` to support custom email templates:

```javascript
await handleSendEmail(email, subject, "", {
  projectName: "Serenity",
  tagline: "Stay with Comfort",
  bodyHtml: "<div>Custom HTML body content here</div>",
});
```

When `bodyHtml` is provided, it overrides the default OTP/plain-text rendering and is injected directly into the email body section of the shared HTML wrapper.

---

## Sim Test

The email notifications are verified by the sim test:

```
backend/Services/SysScripts/TestScripts/sim/guestEmailCheck.js
```

Run with:

```bash
node Services/SysScripts/TestScripts/sim/guestEmailCheck.js
```

### What it tests

1. **Signup → welcome email**: Creates a test user with `aashir@granjur.com`, waits 3 seconds, then verifies the welcome email was logged in `email_log`
2. **Booking → confirmation email**: Creates a room booking using the credentialed session, waits 3 seconds, then verifies the booking confirmation email was logged in `email_log`
3. **Cleanup**: Removes the test user, booking, and email_log entries

### Prerequisites

- Server running on `localhost:3000`
- `credentials.json` populated (run `guestOtpFlow.js` first)

### Visual Verification

After running the test, check the inbox for `aashir@granjur.com` to visually verify both email templates render correctly in light mode, dark mode, and on mobile.

---

## Change Log

| Date | Change |
|------|--------|
| 2026-06-11 | Initial implementation of welcome and booking confirmation email templates. |
