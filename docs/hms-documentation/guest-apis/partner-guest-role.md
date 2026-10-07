# Partner Guest Role — Front-end Guide

A traveller whose visit was booked by a partner platform (a travel company using the Visits API) can sign in to our guest app with the same email. Their visit legs belong to a separate **partner guest role**. This page is the front-end contract for that role: which URDD to send, what the app may show and do, the payloads, and the errors to handle.

Updated 2026-10-07. Before that date the role was view only; the changes are listed in [What changed on 2026-10-07](#what-changed-on-2026-10-07).

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
| Any action on one leg (schedule, ticket about it) | `partnerTenantUrddMap[String(booking.hotelId)]` |
| Favorites, reviews, profile | Either works. Prefer the hotel URDD when the screen is about one hotel |

If you send `partnerTenantUrddMap.global` together with a `hotelId`, the backend switches it to that hotel's **partner** URDD for you. It never switches to a standard guest URDD. Still send the hotel URDD when you have it.

---

## 2. What the partner role can and cannot do

| Area | Endpoint | Method | Partner role | Rules |
|---|---|---|---|---|
| Visit legs (read) | `/api/guest/bookings/upcoming`, `/current`, `/past`, booking detail reads | GET | Allowed | Shows visit legs only |
| Schedule inside a leg | `/api/guest/booking/reschedule` | PUT | **Allowed** | [Section 3](#3-scheduling-the-services-inside-a-leg) |
| Schedule inside a leg | `/api/guest/bookings/services` | PUT | **Allowed** | Same rules as above |
| Bookable times | `/api/guest/scheduler` | GET, POST | **Allowed** | A read, including POST `holdSlots` |
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

**In the UI:** under the partner role, hide or disable Book, Add service, Edit, Extend, Cancel, Check in, Check out, Pay, QR and Redeem. Show Schedule / Reschedule, Favorite, Review (after the stay), Contact support and Profile. A refused call returns:

```json
{
  "success": false,
  "data": null,
  "meta": { "status": 403, "scc": "partner_guest_read_only", "message": "The partner guest role is view only" }
}
```

Branch on `meta.scc`, never on the message.

---

## 3. Scheduling the services inside a leg

A leg is a normal booking object (from the bookings reads) that contains services such as spa, gym, dining or a transfer. The traveller can place or move those services' times **inside the leg's own dates**. The leg's dates, party and price never change.

### When to show the Schedule button

Show it when **all** of these hold:

- the role is the partner role;
- `booking.status` is `pending`, `confirmed` or `checked_in` (not `cancelled`, `completed` or `no_show`);
- the service in `booking.services[]` has slots: `sessions[]` or `meals[]` with an `id`, or a `transport` object.

### Step 1: load the bookable times

```
GET /api/guest/scheduler?from=2026-10-21&to=2026-10-24&serviceId=487
```

Keep `from` and `to` inside `booking.checkIn` … `booking.checkOut`, at most 14 days apart. Offer only slots with `available: true`.

For a transfer, also load the form with `GET /api/guest/services?serviceId=487&language_code=en`. Its `formSchema` holds the `destination_type` choice and the `guest_pickup_location` / `guest_dropoff_location` options. Each option has `value`, `label`, `is_default` and `form`. The option with `is_default: 1` is the **hotel's own stop**.

### Step 2: send the change

`PUT /api/guest/booking/reschedule` (or `PUT /api/guest/bookings/services` with the same body). The request also needs `id`, set to the booking id. Send exactly one of `sessions`, `meals` or `transport`.

| Field | Type | Required | Notes |
|---|---|---|---|
| `actionPerformerURDD` | number | Yes | `partnerTenantUrddMap[String(booking.hotelId)]` |
| `id` | number | Yes | The booking id |
| `booking_id` | number | Yes | `booking.bookingId` |
| `service_id` | number | Yes | `booking.services[].serviceId` |
| `sessions[]` | array | One of | `slotId` = `services[].sessions[].id`, plus `date` (`YYYY-MM-DD`) and `slot` (`HH:MM-HH:MM`) |
| `meals[]` | array | One of | `slotId` = `services[].meals[].id`, plus `date`, optional `slot`, `mealType` |
| `transport` | object | One of | `pickupDateTime`, `tripType`, `pickupLocation`, `dropoffLocation`. `slotId` is optional: the bundle has no transport slot id, so the leg's transport slot is used |

**Session (spa, gym):**

```json
{
  "actionPerformerURDD": 2275,
  "id": 9301,
  "booking_id": 9301,
  "service_id": 468,
  "sessions": [{ "slotId": 5512, "date": "2026-10-22", "slot": "10:00-11:00" }]
}
```

**Meal (dining):**

```json
{
  "actionPerformerURDD": 2275,
  "id": 9301,
  "booking_id": 9301,
  "service_id": 470,
  "meals": [{ "slotId": 5520, "date": "2026-10-22", "slot": "19:00-20:00", "mealType": "dinner" }]
}
```

**Transfer:**

```json
{
  "actionPerformerURDD": 2275,
  "id": 9301,
  "booking_id": 9301,
  "service_id": 487,
  "transport": {
    "tripType": "pickup",
    "pickupDateTime": "2026-10-21 09:00:00",
    "pickupLocation": "59871"
  }
}
```

The response is `{ "booking_id": 9301, "service_id": 487, "updated": 1 }`. Reload the booking to show the new times. `updated: 0` means nothing matched, for example a `slotId` that is not in this leg.

### Transfer rule

| `tripType` (or `destination_type`) | Pickup location | Drop-off location |
|---|---|---|
| `pickup` (airport to hotel) | A stop that is **not** the hotel | The hotel stop (`is_default: 1`). Filled in when left out |
| `dropoff` (hotel to airport) | The hotel stop. Filled in when left out | A stop that is **not** the hotel |

- A location can be sent as the option's `value` (preferred), the whole option object, its `form` object, or its English name when that name is unique.
- **In the UI:** after the traveller picks `pickup` or `dropoff`, pre-fill and lock the hotel side, and remove the hotel stop from the other side's list.

### Errors

| HTTP | `meta.scc` | When | What the app should do |
|---|---|---|---|
| 409 | `leg_not_schedulable` | The leg is cancelled, completed or a no-show | Hide Schedule and reload the booking |
| 422 | `transport_direction_required` | Locations sent without `pickup` or `dropoff` | Ask for the trip type |
| 422 | `invalid_transport_location` | A location is not in the service's list | Reload the form and ask again |
| 422 | `transport_hotel_stop_required` | The hotel side is not the hotel stop | Set the hotel side to the `is_default` option |
| 422 | `transport_same_stop` | The other side is also the hotel stop | Ask for a different stop |
| 400 | — | A slot date is outside the leg dates | Keep the date picker inside `checkIn` … `checkOut` |
| 404 | — | The leg is not reachable with this URDD (for example, the standard guest URDD was sent) | Send the partner URDD for the leg's hotel |
| 409 | — | The time was taken meanwhile | Reload the times and ask again |

The partner platform is told about every change. The leg history records it as done by the guest, and the partner receives a `leg.scheduled` webhook. The app does not need to do anything for this.

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
5. Show Schedule only for `pending`, `confirmed` and `checked_in` legs, with dates limited to the leg.
6. For transfers, lock the hotel side to the `is_default` stop.
7. Show Review only on `completed` legs.
8. Make email read only on the profile screen, for both roles and on the staff dashboard.
9. Handle `partner_guest_read_only`, `leg_not_schedulable`, the four transport codes, `review_requires_stay` and `email_not_editable` by `meta.scc`.

---

## What changed on 2026-10-07

| Before | Now |
|---|---|
| Every write under the partner role returned `403 partner_guest_read_only` | Scheduling inside a leg, scheduler POST, favorites, reviews (after a completed stay) and support tickets are allowed |
| `PUT /guest/profile` and `PUT /profile` could change the email | Email is read only for everyone (`422 email_not_editable`) |
| A global partner URDD with `hotelId` could resolve to a standard guest URDD | It resolves to that hotel's partner URDD |
| A ticket's `bookingNumber` could link any booking | Only the user's own bookings are linked |

Related pages: [URDD & Tenant Scoping](./guest-tenant-scoped-apis.md), [Guest Booking Reschedule](./guest-booking-reschedule/guest-booking-reschedule.md), [Guest Scheduler](./guest-scheduler/guest-scheduler.md), [Guest Profile](./guest-profile/guest-profile.md), [Partner integration guide](../visits/partner-integration-guide.md).
