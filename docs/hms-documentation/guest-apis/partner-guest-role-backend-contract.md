# Partner Guest Role — Backend Contract for the Guest App

A traveller whose trip was booked by a partner platform (a travel company using the Visits API) can sign in to our guest app with the same email. Their visit legs belong to a separate **partner guest role**. This page explains what the backend sends for that role, what it means, and what the backend allows:

1. How to tell a partner URDD from a standard guest URDD.
2. Which URDD the backend expects for each kind of call.
3. Which endpoints and operations the partner role can use, and what the backend refuses.
4. What changes when a different role's URDD is sent, and which error codes the backend returns.

> **The backend enforces all of this.** It checks the URDD sent as `actionPerformerURDD` on every request. A refused call fails safely with `403 partner_guest_read_only` and changes nothing.

---

## 1. Telling the two roles apart

### What the backend uses

A URDD is a partner guest URDD when its designation code is **`PARTNER`**. A standard guest URDD has `STANDARD` (or `DEFAULT` on the global row). Both have `role_name: "Guest"`, so the role name can't tell them apart.

| | Standard guest | Partner guest |
|---|---|---|
| `role_name` | `Guest` | `Guest` |
| `designation_code` | `STANDARD` / `DEFAULT` | `PARTNER` |
| `designation_name` | `Standard` / `Default` | `Partner` |
| Bookings it sees | the user's own bookings, **never** visit legs | **only** visit legs booked through a partner |

### What the login response sends

`POST /api/guest/verify/otp`, `POST /api/guest/auth/signup` and the other login responses return two maps. They are built from the same rows, and the URDD ids never overlap:

```json
{
  "tenantUrddMap":        { "86": 2101, "94": 2102, "95": 2103, "global": 2100 },
  "partnerTenantUrddMap": { "86": 2275, "94": 2273, "95": 2274, "global": 2272 },
  "user_roles_designations_departments": [
    { "user_role_designation_department_id": 2272, "tenant_id": null, "role_name": "Guest", "designation_name": "Partner" },
    { "user_role_designation_department_id": 2100, "tenant_id": null, "role_name": "Guest", "designation_name": "Standard" }
  ]
}
```

| Field | Meaning |
|---|---|
| `tenantUrddMap` | the standard guest URDDs: one per hotel (key = hotel id as a string) plus `global` (no hotel) |
| `partnerTenantUrddMap` | the partner guest URDDs, keyed the same way. `{}` when no partner has ever booked for this user |
| `user_roles_designations_departments` | every URDD row of the user. A partner row has `designation_name: "Partner"`. These rows carry **no** `designation_code` |

- **The reliable test is the map.** A URDD is a partner URDD when its id is one of the values in `partnerTenantUrddMap`. In the role rows, `designation_name === "Partner"` means the same thing.
- **A non-empty `partnerTenantUrddMap` does not mean the user has legs.** When a partner first signs a traveller in, the backend creates the global partner URDD plus one for each hotel on the visit, or for every hotel that accepts partner bookings. Whether there are legs to show comes from the partner booking lists ([Section 2](#how-the-booking-lists-are-scoped)).

### Where the maps are sent

The backend sends both maps in these responses. Each one is the user's complete, current set:

| Endpoint | Returns |
|---|---|
| Login: `POST /api/guest/verify/otp`, `POST /api/guest/auth/signup`, social sign-up | `tenantUrddMap`, `partnerTenantUrddMap` |
| `POST /api/guest/auth/ensure-urdd` | `tenantUrddMap`, `partnerTenantUrddMap` |
| `POST /api/auth/refresh` | `tenantUrddMap`, `partnerTenantUrddMap` (when they are returned) |

A partner can book new legs while the user is signed in, so a later response can contain hotels an earlier one did not.

### There is no "current role" on the backend

The backend keeps no role state for the session. It acts on whichever URDD each request sends. Which role the app starts on, and how the user switches, is up to the app.

---

## 2. Which URDD the backend expects

Every guest call sends one URDD as `actionPerformerURDD`: in the encrypted body for POST/PUT/DELETE, and in the encrypted header payload for GET. The role of that URDD decides what the backend shows and allows.

| Call | Standard guest | Partner guest | Why |
|---|---|---|---|
| Booking lists: current, upcoming, history | `tenantUrddMap.global` | `partnerTenantUrddMap.global` | see below |
| One booking or leg: folio, review, support ticket about it | `tenantUrddMap[hotelId]` | `partnerTenantUrddMap[hotelId]` | the folio matches the booking's **own** URDD exactly |
| Favorites, profile, notifications, devices | any URDD of the role | any URDD of the role | these act on the user, not the role |

### How the booking lists are scoped

`GET /api/guest/bookings/current`, `GET /api/guest/bookings/upcoming` and `GET /api/guest/bookings` return bookings from **every hotel** where the user holds a URDD **of the same role as the URDD sent**:

- Any standard URDD (global or per-hotel) → all the user's standard bookings, at every hotel. No visit legs.
- Any partner URDD (global or per-hotel) → all the user's visit legs, at every hotel. No standard bookings.

So the **role** of the URDD decides the result, not its hotel. The global URDD of a role is the recommended one because it always exists while the role exists.

| Endpoint | Returns |
|---|---|
| `GET /api/guest/bookings/current` | stays in progress |
| `GET /api/guest/bookings/upcoming` | stays not yet started |
| `GET /api/guest/bookings` | past and cancelled stays |

### Per-hotel calls and the global fallback

For a call about one hotel, send `partnerTenantUrddMap[hotelId]`. If the hotel key is missing and `partnerTenantUrddMap.global` is sent with a `hotelId` in the payload, the backend switches to that hotel's **partner** URDD, and creates it if needed. It never switches to a standard URDD. Two exceptions:

- **Folio** (`GET /api/guest/bookings/folio`) matches the booking's own URDD and has no fallback. Send `partnerTenantUrddMap[hotelId]`.
- A URDD of the wrong role returns `404` or an empty list, never another role's data. For example, a standard URDD used on a visit leg gets `404`.

---

## 3. What the partner guest role can and cannot do

The partner role is **view only, plus favorites, reviews, support and profile**. Booking, changing, paying for and scheduling a visit leg are done by the partner platform, never through the guest APIs.

### Refused: `403 partner_guest_read_only`

The backend checks this before permissions and before any business logic, so nothing is changed. GET requests on these endpoints are allowed, except check-in eligibility. Every other method is refused.

| Operation | Endpoint | Refused methods |
|---|---|---|
| New booking | `/api/guest/bookings/room`, `/bookings/package`, `/bookings/service` | POST |
| Pre-booking stage | `/api/guest/booking/stage` | POST |
| Add a service to a leg | `/api/guest/bookings/services` | POST |
| Remove a service from a leg | `/api/guest/bookings/services` | DELETE |
| **Schedule a service in a leg** | `/api/guest/bookings/services` | PUT |
| **Reschedule a service in a leg** | `/api/guest/booking/reschedule` | PUT |
| Edit | `/api/guest/booking/edit` | PUT |
| Extend | `/api/guest/booking/extend` | POST |
| Cancel | `/api/guest/booking/cancel` | POST |
| Check in | `/api/guest/booking/checkin` | POST |
| Check out | `/api/guest/booking/checkout` | POST |
| Check-in eligibility | `/api/guest/booking/checkin/eligibility` | **all, GET included** |
| Pay | `/api/guest/payments/initiate`, `/payments/confirm` | POST |
| QR | `/api/guest/qr/issue` | POST |
| Redeem loyalty | `/api/guest/loyalty/redeem` | POST |

The refusal:

```json
{
  "success": false,
  "data": null,
  "meta": { "status": 403, "scc": "partner_guest_read_only", "message": "The partner guest role is view only" },
  "error": { "code": "partner_guest_read_only", "source": "Partner Guest Role" }
}
```

### Scheduling and rescheduling are done by the partner platform

The partner role **cannot schedule or reschedule** any service inside a leg (spa, gym, dining, transfers). The partner platform does both, either when it books the visit or later through its own API.

| Endpoint | Method | Partner role | What it means |
|---|---|---|---|
| `/api/guest/bookings/services` | PUT | **Refused** `403 partner_guest_read_only` | schedule. Nothing is changed |
| `/api/guest/booking/reschedule` | PUT | **Refused** `403 partner_guest_read_only` | reschedule. Nothing is changed |
| `/api/guest/scheduler` | GET, POST | Allowed | a read of bookable times only. It works, but nothing under the partner role can use the times, so there is no reason to call it for a leg |
| booking reads (`current`, `upcoming`, history, folio) | GET | Allowed | the leg's times, **read only** |

Where the leg's times are in the booking reads:

| Field | Meaning |
|---|---|
| `services[].sessions[]` | session-type services (spa, gym, etc.): each booked session's time |
| `services[].meals[]` | dining: each booked meal's date, meal type and slot |
| `services[].transport` | transfer: pickup time and locations |
| `schedulingStatus` | whether every service in the leg has its times. A service without times has not been scheduled by the partner yet |

- Times the partner sets or changes appear on the **next read** of the booking. Nothing is pushed to the guest app.
- To change a time, the traveller contacts the partner. A support ticket to the hotel ([Allowed](#allowed)) is fine for questions, but the hotel does not move times on a partner leg either.

### Allowed

| Operation | Endpoint | Methods | Partner rules |
|---|---|---|---|
| View legs | `/api/guest/bookings/current`, `/bookings/upcoming`, `/bookings` (history) | GET | visit legs only, at every hotel. See [How the booking lists are scoped](#how-the-booking-lists-are-scoped) |
| View a leg's bill | `/api/guest/bookings/folio` | GET | send the leg's hotel partner URDD |
| View a leg's times | the booking reads above | GET | read only. See [Scheduling and rescheduling](#scheduling-and-rescheduling-are-done-by-the-partner-platform) |
| Bookable times | `/api/guest/scheduler` | GET, POST | a read only. Nothing under the partner role can use the times, so don't call it for legs |
| Reviews | `/api/guest/review` | GET, POST, PUT, DELETE | POST needs a **completed** stay that included the item, otherwise `403 review_requires_stay`. A user edits and deletes their own review as usual |
| Favorites | `/api/guest/favorites`, `/favorites/rooms`, `/favorites/packages` | GET, POST, DELETE | favorites belong to the user: one added with a partner URDD is also returned with a standard URDD |
| Support tickets | `/api/guest/support/tickets` | POST | `bookingNumber` (the leg's `BK…` id) is linked only when the booking is the user's own. Otherwise the ticket is created without a link |
| FAQs, contact form | `/api/guest/support/faqs` (GET), `/support/contact` (POST) | GET, POST | same as a standard guest |
| Profile | `/api/guest/profile` | GET, PUT | the same person under both roles. **Email is read only for everyone**: a different `users_email` is `422 email_not_editable`. Leave it out of the PUT |

### Not role-specific

These endpoints are not restricted by role. They act on the user, so they behave the same for a partner URDD and a standard URDD:

| Area | Endpoints |
|---|---|
| Hotel browsing | hotels, hotel details, packages, services, availability, filters, landmarks, regions, cities, pages, `POST /api/guest/quote` (prices only, books nothing) |
| Notifications | `/api/guest/notifications` (GET), `/notifications/read` and `/notifications/read-all` (POST), `/notifications/settings` (GET, PUT) |
| Devices | `/api/guest/devices/register`, `/devices/unregister` |
| Assistant | `/api/guest/assistant/threads` (GET, DELETE), `/assistant/messages` (POST) |
| Account | `/api/guest/profile/image` (POST), `/api/guest/onboarding/kyc`, guest documents, saved payment methods `/api/guest/payments/methods` (GET, DELETE), loyalty balance `/api/guest/loyalty` (GET) |

Saved payment methods and the loyalty balance are readable with a partner URDD, but a leg can't be paid or redeemed against: payments and redeem are refused.

---

## 4. Changing role, and error codes

### What changes when the other role's URDD is sent

The backend keeps no role state, so changing role only means the next requests send the other map's URDD. The results that depend on the role are the three booking lists:

| Endpoint | With a standard URDD | With a partner URDD |
|---|---|---|
| `GET /api/guest/bookings/current` | standard stays in progress | visit legs in progress |
| `GET /api/guest/bookings/upcoming` | upcoming standard stays | upcoming visit legs |
| `GET /api/guest/bookings` | past and cancelled standard stays | past and cancelled visit legs |

Favorites, profile and notifications return the same data for either role. Per-leg calls (folio, review, ticket) return data only for the URDD that owns the booking.

### Error codes

The code is in `meta.scc` and `error.code`. Branch on it, never on the message.

| HTTP | `meta.scc` | Meaning |
|---|---|---|
| 403 | `partner_guest_read_only` | a refused operation from [the table above](#refused-403-partner_guest_read_only), called with a partner URDD. Nothing was changed |
| 403 | `review_requires_stay` | review POST with a partner URDD, without a completed stay that included the item |
| 422 | `email_not_editable` | profile PUT with a different email. Nothing was updated |
| 404 | — | a URDD of the wrong role used on one booking or leg |
| 403 | — (`Invalid or expired URDD`) | the URDD no longer exists. `POST /api/guest/auth/ensure-urdd` returns the current maps |

The scheduling and transport codes (`leg_not_schedulable`, `transport_direction_required`, `invalid_transport_location`, `transport_hotel_stop_required`, `transport_same_stop`, `outside_leg_dates`) belong to the **partner platform's** own API. The guest APIs never return them, because scheduling with a partner URDD is refused first with `partner_guest_read_only`.

---

## Summary

1. Both maps (`tenantUrddMap`, `partnerTenantUrddMap`) come with login, ensure-urdd and refresh. Each response is the complete current set.
2. A URDD is a partner URDD when its id is in `partnerTenantUrddMap` (`designation_code` `PARTNER`, `designation_name` "Partner").
3. Booking lists return every hotel for the role of the URDD sent. The global URDD of the role is recommended.
4. Calls about one leg take the leg's hotel partner URDD. The folio requires it.
5. With a partner URDD the backend allows viewing, reviews (after a completed stay), favorites, support and profile.
6. It refuses booking, adding or removing services, **scheduling, rescheduling**, edit, extend, cancel, check-in/out, check-in eligibility, payment, QR and redeem with `403 partner_guest_read_only`.
7. The partner platform schedules every leg. The guest APIs return the leg's times read only.

Related pages: [Partner Guest Role — Front-end Guide](./partner-guest-role.md) (payload examples for reviews, tickets, profile and favorites), [URDD & Tenant Scoping](./guest-tenant-scoped-apis.md), [Guest Booking Reschedule](./guest-booking-reschedule/guest-booking-reschedule.md), [Partner integration guide](../visits/partner-integration-guide.md).
