# Partner Guest Role — Front-end Guide

A traveller whose visit was booked by a partner platform (a travel company using the Visits API) can sign in to our guest app with the same email. Their visit legs belong to a separate **partner guest role**. This page is the front-end contract for that role: which URDD to send, what the app may show and do, the payloads, and the errors to handle.

Updated 2026-10-08: scheduling and rescheduling are no longer allowed under this role; the partner platform does them. Changes are listed in [What changed](#what-changed).

---

## 1. The two roles of one user

One signed-in user can hold two sets of URDDs:

| Map | Role | Shows | Use it for |
|---|---|---|---|
| `tenantUrddMap` | Our standard guest | The user's own bookings. **Never** shows visit legs | Everything a normal guest does |
| `partnerTenantUrddMap` | Partner guest | Only the visit legs booked through a partner | Everything on this page |

Both maps are keyed by hotel id (as a string) plus `global`. The URDD ids never overlap.

```json
{
  "tenantUrddMap":        { "86": 2101, "94": 2102, "95": 2103, "global": 2100 },
  "partnerTenantUrddMap": { "86": 2275, "94": 2273, "95": 2274, "global": 2272 }
}
```

`partnerTenantUrddMap` is `{}` when the user has no partner bookings. Hide the partner role in the UI in that case.

### Where the maps come from

Store **both** maps from every response that returns them, and replace the stored copies each time:

| Endpoint | Returns |
|---|---|
| `POST /api/guest/verify/otp`, `POST /api/guest/auth/signup` and the other login responses | `tenantUrddMap`, `partnerTenantUrddMap` |
| `POST /api/guest/auth/ensure-urdd` | `tenantUrddMap`, `partnerTenantUrddMap` |
| `POST /api/auth/refresh` | `tenantUrddMap`, `partnerTenantUrddMap` (when they are returned) |

A user can get new partner bookings while signed in, so refresh the maps after a token refresh.

### Which partner URDD to send

| Situation | Send as `actionPerformerURDD` |
|---|---|
| Listing every visit leg at every hotel | `partnerTenantUrddMap.global` |
| Any action on one leg (a ticket about it) | `partnerTenantUrddMap[String(booking.hotelId)]` |
| Favorites, reviews, profile | Either works. Prefer the hotel URDD when the screen is about one hotel |

If you send `partnerTenantUrddMap.global` together with a `hotelId`, the backend switches it to that hotel's **partner** URDD for you. It never switches to a standard guest URDD. Still send the hotel URDD when you have it.

---

## 2. What the partner role can and cannot do

| Area | Endpoint | Method | Partner role | Rules |
|---|---|---|---|---|
| Visit legs (read) | `/api/guest/bookings/upcoming`, `/current`, `/past`, booking detail reads | GET | Allowed | Shows visit legs only |
| Schedule or reschedule inside a leg | `/api/guest/booking/reschedule`, `/api/guest/bookings/services` | PUT | **Refused** | `403 partner_guest_read_only`. The partner platform schedules. [Section 3](#3-scheduling-is-done-by-the-partner-platform) |
| Bookable times | `/api/guest/scheduler` | GET, POST | Allowed | A read only. Nothing under this role can use the times, so don't call it for legs |
| Favorites | `/api/guest/favorites`, `/favorites/rooms`, `/favorites/packages` | GET, POST, DELETE | **Allowed** | Same payloads as our guest role |
| Reviews | `/api/guest/review` | GET, POST, PUT, DELETE | **Allowed** | POST needs a completed stay. [Section 4](#4-reviews) |
| Support tickets | `/api/guest/support/tickets` | POST | **Allowed** | [Section 5](#5-support-tickets) |
| FAQs | `/api/guest/support/faqs` | GET | Allowed | — |
| Contact form | `/api/guest/support/contact` | POST | Allowed | — |
| Profile | `/api/guest/profile` | GET, PUT | Allowed | Email is read only. [Section 6](#6-profile) |
| Add or remove services on a leg | `/api/guest/bookings/services` | POST, DELETE | Refused | `403 partner_guest_read_only` |
| New bookings | `/api/guest/bookings/room`, `/bookings/package`, `/bookings/service`, `/api/guest/booking/stage` | POST | Refused | `403 partner_guest_read_only` |
| Edit, extend, cancel | `/api/guest/booking/edit`, `/extend`, `/cancel` | all writes | Refused | The partner platform owns these |
| Check-in, check-out | `/api/guest/booking/checkin`, `/checkout` | all writes | Refused | Hotel staff handle legs |
| Check-in eligibility | `/api/guest/booking/checkin/eligibility` | all | Refused | Blocked entirely |
| Payments | `/api/guest/payments/initiate`, `/confirm` | all writes | Refused | Legs are paid through the partner |
| QR, loyalty redeem | `/api/guest/qr/issue`, `/loyalty/redeem` | all writes | Refused | — |

**In the UI:** under the partner role, hide or disable Book, Add service, Edit, Extend, Cancel, Check in, Check out, Pay, QR and Redeem. Also hide Schedule and Reschedule. Show the leg's booked times read only, plus Favorite, Review (after the stay), Contact support and Profile. A refused call returns:

```json
{
  "success": false,
  "data": null,
  "meta": { "status": 403, "scc": "partner_guest_read_only", "message": "The partner guest role is view only" }
}
```

Branch on `meta.scc`, never on the message.

---

## 3. Scheduling is done by the partner platform

The partner platform schedules and reschedules the services inside a leg (spa, gym, dining, transfers), either when it books or afterwards through its own API. Our guest app does not, under the partner role:

- `PUT /api/guest/booking/reschedule` and `PUT /api/guest/bookings/services` return `403`, `meta.scc = partner_guest_read_only`. Nothing is changed.
- **In the UI:** hide Schedule and Reschedule on every leg. Show the times the leg already has (`booking.services[].sessions[]`, `meals[]`, `transport`, and `booking.schedulingStatus`) read only. An unscheduled service shows as "Not scheduled yet".
- To change a time, the traveller contacts the partner. A support ticket to the hotel ([Section 5](#5-support-tickets)) is fine for questions, but the hotel does not move times on a partner leg either.
- Times the partner sets appear on the next read of the booking. Reload the booking when the screen opens.

---

## 4. Reviews

`POST /api/guest/review` with the usual body ([Guest Review](./guest-review/guest-review.md)):

```json
{ "actionPerformerURDD": 2275, "baseTable": "packages", "recordId": 329, "starRating": 5, "title": "Lovely stay" }
```

Under the partner role, a review needs a **completed stay that included the item**:

- `packages`: the user has a booking of that package with `status: "completed"`.
- `services`: the user has a `completed` booking that contains that service in `services[]`.

**In the UI:** show Write a review only on legs with `status: "completed"`, for the leg's package or its services. Otherwise the call returns:

| HTTP | `meta.scc` | Message |
|---|---|---|
| 403 | `review_requires_stay` | You can review this after a completed stay that included it. |
| 409 | — | Already reviewed this item |

Editing and deleting one's own review work as for our guest role.

---

## 5. Support tickets

`POST /api/guest/support/tickets` with the usual body ([Guest Support Tickets](./guest-support-tickets/guest-support-tickets.md)):

```json
{
  "actionPerformerURDD": 2275,
  "category": "booking",
  "subject": "Question about my spa time",
  "message": "Can the spa session be moved to the afternoon?",
  "bookingNumber": "BK631171334564"
}
```

- `bookingNumber` is linked only when the booking belongs to the signed-in user. This applies to both roles. For a leg, send `booking.id` (the `BK…` number).
- Someone else's booking number is treated like an unknown number: the ticket is still created, without a booking link.
- A ticket number is returned, and an email goes to the hotel's support address.

---

## 6. Profile

`GET` and `PUT /api/guest/profile` work under both roles. They read and edit the same person.

**Email can no longer be edited, for any user.** This also applies to staff on `PUT /api/profile`. Partners find their travellers by email, so a changed email would split the person in two.

| Sent `users_email` | Result |
|---|---|
| Not sent | Other fields are updated |
| The current email (case and spaces ignored) | Ignored; other fields are updated |
| A different email | `422`, `meta.scc = email_not_editable`: "Your email cannot be changed from the profile." Nothing is updated |

**In the UI:** show the email read only. The form parameters mark it `disabled: true`. The safest option is not to send `users_email` at all.

```json
{ "actionPerformerURDD": 2275, "id": 104, "users_firstName": "Sara", "users_phoneNo": "+923001234567" }
```

`id` is required on every PUT and DELETE (any value; the profile is always the signed-in user's).

---

## 7. Favorites

The same endpoints and payloads as our guest role ([Guest Favorites](./guest-favorites/guest-favorites.md)). Favorites belong to the user, not to a role: one added under the partner role also appears under our guest role.

```json
{ "actionPerformerURDD": 2272, "entityType": "package", "packageId": 329 }
```

A DELETE also needs `id`.

---

## 8. Checklist for the app

1. Store `tenantUrddMap` and `partnerTenantUrddMap` from login, ensure-urdd and refresh.
2. Show a role switch only when `partnerTenantUrddMap` is not empty.
3. Under the partner role, use `partnerTenantUrddMap.global` for leg lists and `partnerTenantUrddMap[hotelId]` for actions on one leg.
4. Hide Book, Add service, Edit, Extend, Cancel, Check in/out, Pay, QR and Redeem under the partner role.
5. Hide Schedule and Reschedule under the partner role, and show the leg's times read only.
6. Show Review only on `completed` legs.
7. Make email read only on the profile screen, for both roles and on the staff dashboard.
8. Handle `partner_guest_read_only`, `review_requires_stay` and `email_not_editable` by `meta.scc`.

---

## What changed

| Date | Before | Now |
|---|---|---|
| 2026-10-08 | Scheduling and rescheduling inside a leg were allowed (`PUT /guest/booking/reschedule`, `PUT /guest/bookings/services`) | Refused with `403 partner_guest_read_only`. The partner platform schedules |
| 2026-10-07 | Every write under the partner role returned `403 partner_guest_read_only` | Favorites, reviews (after a completed stay) and support tickets are allowed |
| 2026-10-07 | `PUT /guest/profile` and `PUT /profile` could change the email | Email is read only for everyone (`422 email_not_editable`) |
| 2026-10-07 | A global partner URDD with `hotelId` could resolve to a standard guest URDD | It resolves to that hotel's partner URDD |
| 2026-10-07 | A ticket's `bookingNumber` could link any booking | Only the user's own bookings are linked |

Related pages: [URDD & Tenant Scoping](./guest-tenant-scoped-apis.md), [Guest Booking Reschedule](./guest-booking-reschedule/guest-booking-reschedule.md), [Guest Scheduler](./guest-scheduler/guest-scheduler.md), [Guest Profile](./guest-profile/guest-profile.md), [Partner integration guide](../visits/partner-integration-guide.md).
