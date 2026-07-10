---
title: "Email Branding & Templates"
sidebar_position: 1
---

# Email Branding & Templates

This document describes the unified email branding system, including how the sender identity and tagline are resolved per user role, the template structure, and the design system used across all transactional emails.

---

## Context

All transactional emails (OTP, welcome, booking confirmation, etc.) now use consistent branding with the tagline **"Stay with Comfort"**. Previously, some templates used "Hotel Management System" as the tagline. The branding resolution logic dynamically determines the project name based on the recipient's role.

---

## Brand Constants

```js
const DESTINATION_BRAND = {
  projectName: "Destination",
  tagline: "Stay with Comfort"
};
```

This constant is the single source of truth for platform-level branding across all email templates.

---

## Branding Resolution Logic

The `resolveEmailBranding.js` module determines the branding tuple `{ projectName, tagline }` based on the recipient's role:

| Recipient Role | `projectName` | `tagline` |
|----------------|---------------|-----------|
| SaaS Admin | `"Destination"` | `"Stay with Comfort"` |
| Tenant Manager | `"Destination"` | `"Stay with Comfort"` |
| All other roles (guests, service managers, staff) | `tenant_name` (from DB) | `"Stay with Comfort"` |

### How It Works

1. The email sender calls `resolveEmailBranding(userId)` (or passes the user's role context).
2. The function checks if the user is a SaaS Admin or Tenant Manager (based on their URDD designation code).
3. If yes, it returns the `DESTINATION_BRAND` constant.
4. Otherwise, it fetches the user's tenant name from the database and returns `{ projectName: tenant_name, tagline: "Stay with Comfort" }`.

---

## Template Structure

All emails rendered by `sendEmail.js` follow a three-section layout:

### Header

- Displays the resolved `projectName` as the logo/brand name.
- Shows the `tagline` ("Stay with Comfort") beneath the brand name.

### Body

- Contains the email-specific content:
  - **OTP emails**: 6-digit code block with expiry notice.
  - **Welcome emails**: Greeting with account details.
  - **Booking emails**: Reservation summary.
  - **Custom HTML**: Arbitrary content passed by the caller.

### Footer

- "Powered by Destination" attribution line.
- Unsubscribe/contact links where applicable.

---

## Design Features

### Dark Mode Support

All email templates include `@media (prefers-color-scheme: dark)` overrides:

- Background shifts from light to dark palette.
- Text colors invert for readability.
- OTP code blocks maintain high contrast in both modes.

### Responsive Design

- Templates use a fluid-width layout that caps at 600px.
- Font sizes and padding scale appropriately for mobile email clients.
- OTP code blocks use large, monospaced fonts for easy reading on small screens.

---

## Files Modified

| File | Changes |
|------|---------|
| `resolveEmailBranding.js` | New module -- resolves `{ projectName, tagline }` per user role |
| `sendEmail.js` | Updated template to use resolved branding; added dark mode and responsive styles |
| `sendServiceManagerWelcome.js` | Updated to call `resolveEmailBranding` instead of hardcoding project name |
| `tenantLifecycleCron.js` | Updated lifecycle notification emails to use resolved branding |

---

## Example Usage

```js
const { resolveEmailBranding } = require('./resolveEmailBranding');

const branding = await resolveEmailBranding(userId);
// branding = { projectName: "Grand Hotel Riyadh", tagline: "Stay with Comfort" }

await sendEmail({
  to: guestEmail,
  subject: `Your Booking Confirmation - ${branding.projectName}`,
  branding,
  bodyHtml: bookingConfirmationHtml
});
```
