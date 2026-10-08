# Partner Bookings in Hotel Tools

A **visit leg** is a booking a partner platform (a travel company using the Visits API) made as part of a visit: `bookings.visit_id` is set and `bookings.channel_platform_id` is the partner. The partner sells it, pays for it and is the only one who can cancel it, as a whole visit. Hotel staff run the stay but can only **move its status**.

This page is the front-end contract for the admin side: the `booked_via` flag every booking screen now receives, what to show or hide, and what the backend refuses.

Updated 2026-10-07.

---

## 1. Rules at a glance

| Staff action | Standard booking | Visit leg (`is_partner: true`) |
|---|---|---|
| Create a booking for a guest | Allowed, always on the guest's **standard** guest URDD | Not applicable. Partner bookings are made by the partner only |
| Edit dates, party, rooms, services (admin wizard Edit, `/guest/booking/stage`, `/guest/booking/edit`) | Allowed | Refused: `409 visit_leg_locked` |
| Edit rows in the bookings, booking items, booking services and booking rooms CRUDs (plain and grouped) | Allowed | Status moves only (section 5); every other write is refused with `409 visit_leg_locked` |
| Move the status (approve, reject, check in, no-show, check out) | Allowed | Allowed, within the moves in section 5 |
| Check in, check out and swap rooms at the desk | Allowed | Allowed |
| Take cash or card at the desk (`cash_amount` at check-in or check-out, or `POST /api/admin/booking/payment`) | Allowed | Refused: `409 partner_settles_payment`. The partner pays |
| 20% down payment to confirm | Applies to guest app payments | Not applicable: the partner pays the full leg price when it books, so the leg is fully paid from the start |
| Cancel | Allowed | Not at the hotel: only the partner cancels the whole visit. Rejecting a `pending` leg is the hotel's refusal |

---

## 2. The `booked_via` flag

Every booking screen tells you which platform a booking came through. The same facts arrive in two spellings: snake_case in the check-in desk API, flat `bookings_*` columns in the bookings CRUD.

**Check-in desk** (`GET /api/checkin-grouped-crud`, arrival cards and agenda rows): `booking.booked_via`

```json
"booked_via": {
  "platform_id": 32,
  "platform_name": "TravelCo",
  "is_partner": true,
  "visit_id": 80,
  "visit_code": "VIS-MAKKAH-5N",
  "visit_name": "Makkah and Madinah",
  "external_ref": "ORD-2026-55120",
  "leg_no": 1,
  "payment_handled_by": "partner",
  "locked": { "dates": true, "party": true, "price": true, "services": true, "cancel": true, "payment": true }
}
```

For a booking made in our own apps, `is_partner` is `false`, the visit and partner fields are `null`, `payment_handled_by` is `"hotel"`, and every `locked` value is `false`. `platform_name` then names the app the booking came through (for example `Ios_App`, `Web_App`), or is `null` for older bookings that recorded no platform.

**Bookings CRUD** (`GET /api/crud/bookings`, List and View): flat columns on every row

| Column | Type | Meaning |
|---|---|---|
| `bookings_isPartnerBooking` | boolean | `true` for a visit leg |
| `bookings_bookedViaPlatformId`, `bookings_bookedViaPlatformName` | number, string | the platform the booking came through; `null` when none was recorded |
| `bookings_bookedViaVisitId`, `bookings_bookedViaVisitCode` | number, string | the visit, for a leg |
| `bookings_bookedViaExternalRef` | string | the partner's order reference. Quote it when you contact the partner |
| `bookings_paymentHandledBy` | string | `partner` or `hotel` |
| `bookings_lockedFields` | string[] | what staff cannot change: `dates`, `party`, `price`, `services`, `cancel`, `payment`; `[]` for a standard booking |

**Child CRUDs** (List and View): every row also carries two flat columns, so Edit and Delete can be hidden row by row

| Endpoint | Columns |
|---|---|
| `GET /api/crud/booking_items` | `bookingItems_isPartnerBooking`, `bookingItems_lockedFields` |
| `GET /api/crud/booking_rooms` | `bookingRooms_isPartnerBooking`, `bookingRooms_lockedFields` |
| `GET /api/crud/booking_services` | `bookingServices_isPartnerBooking`, `bookingServices_lockedFields` |

`…_isPartnerBooking` is `true` when the row belongs to a visit leg. `…_lockedFields` uses the same names as `bookings_lockedFields` (`dates`, `party`, `price`, `services`, `cancel`, `payment`), or `[]` for a standard booking. When `…_isPartnerBooking` is `true`, hide Edit and Delete on the row: any write returns `409 visit_leg_locked`.

The six `locked` / `lockedFields` names are stable identifiers. New names may be added, but these are never renamed.

**In the UI:**
- Show a "Booked via TravelCo" badge with the order reference on every partner booking.
- Hide or disable Edit Booking, add or remove services, date and party pickers, cancel, and the payment input wherever `is_partner` / `bookings_isPartnerBooking` is `true`.
- Keep the status actions: approve, reject, check in, no-show and check out.

---

## 3. Booking for a guest: standard guest URDDs only

The admin wizard books on behalf of a guest with the guest's own token and hotel URDD, minted by `POST /api/checkin-grouped-crud` with `action: "resolve_guest"`.

- `resolve_guest` always returns the guest's **standard** guest URDD for the hotel (`tenantUrddMap`). It never returns a partner guest URDD, so a walk-in booking is always a normal hotel booking, even for a traveller who also has partner bookings.
- The guest booking endpoints refuse a partner guest URDD (`403 partner_guest_read_only`).
- `POST /api/admin/create/guest/booking` (no front-end caller today) now refuses a `guestUrddId` that is not a standard guest URDD: `422`, `meta.scc = guest_urdd_not_standard`.

## 4. Check-in and check-out desk

- Arrival cards (`GET …?<identifier>`) and agenda rows (`GET …?agenda=1`) carry `booking.booked_via` (section 2).
- Check-in, room swap and check-out work on a visit leg as on any booking.
- **No payment at the desk.** `cash_amount > 0` on check-in or check-out of a partner leg returns `409`, `meta.scc = partner_settles_payment`. Nothing is recorded and the check-in or check-out does not run. Send no `cash_amount` and hide the payment input when `booked_via.payment_handled_by` is `"partner"`.
- Check-out still needs a cleared balance. A partner leg is paid in full when it is booked, so its balance is normally `0`. If a balance shows, the partner settles it through its own API; don't take it at the desk.

## 5. Allowed status moves on a visit leg

| From | To | Meaning |
|---|---|---|
| `pending` | `confirmed` | The hotel approves the leg (`leg.approved` to the partner) |
| `pending` | `cancelled` | The hotel rejects the leg (`leg.rejected`). HMS then cancels the purchase's other legs and credits the partner |
| `confirmed` | `checked_in` | Check in |
| `confirmed` | `no_show` | No-show |
| `checked_in` | `checked_out` | Check out |

Sending the current status again is allowed. Any other move, including cancelling a confirmed leg, returns `409 visit_leg_status`.

`special_requests`, `actual_check_in`, `actual_check_out`, `cancellation_reason` and `cancelled_at` can still be written on the bookings CRUD.

**Locked booking columns:** `tenant_id`, `booking_number`, `urdd_id`, `package_id`, `booking_type`, `check_in_date`, `check_out_date`, `total_guests`, `adults`, `children`, `total_amount`, `paid_amount`, `currency_id`.
- A locked column sent with a different value returns `409 visit_leg_locked` with the columns in `error.details.fields`. Dates are compared as `YYYY-MM-DD` and amounts to two decimals, so re-sending the stored values is fine.
- A locked column left out of a full-row update keeps its stored value.

**Guarded endpoints:**

| Endpoint | Guard |
|---|---|
| `/api/crud/bookings` | status moves only; `DELETE` refused |
| `/api/crud/booking_items`, `/api/crud/booking_rooms`, `/api/crud/booking_services` | any `POST`, `PUT` or `DELETE` touching a leg's rows refused |
| `/api/grouped-cruds/*` with a bookings, booking items or booking services step (bookings, booking items, booking rooms, booking payments, and the generated currencies, delivery units, inventory items, packages, QR codes, services, tenants and transactions groups) | the same rules per step |
| `/api/custom-booking-rooms-grouped-crud` | step 1, edit booking |
| `/api/guest/booking/stage`, `/api/guest/booking/edit` | refused for a leg; the message does not name the partner |
| `POST /api/admin/booking/payment` | refused for a leg: `409 partner_settles_payment`, nothing recorded |

## 6. Catalogue cards: bookings per platform

`GET /api/custom/services/summary` and `GET /api/custom/packages/summary` add two fields to every item:

```json
"bookedVia": [
  { "platformId": 32, "platformName": "TravelCo", "isPartner": true, "bookingCount": 3 },
  { "platformId": 6, "platformName": "Ios_App", "isPartner": false, "bookingCount": 12 },
  { "platformId": null, "platformName": null, "isPartner": false, "bookingCount": 40 }
],
"partnerBookingCount": 3
```

- Counts are active, non-cancelled bookings, highest first: by `bookings.package_id` for a package, and by the booking's services for a service.
- `platformId: null` groups older bookings that recorded no platform.
- `[]` when the item has no bookings.
- Show `partnerBookingCount` as a "sold through partners" hint, and `bookedVia` as a breakdown.

## 7. Errors

| HTTP | `meta.scc` | When | `error.details` |
|---|---|---|---|
| 409 | `visit_leg_locked` | A locked field changes, a delete, any write to a leg's items or services, or an admin edit or stage of a leg | `bookingId`, plus `fields` or `table` |
| 409 | `visit_leg_status` | A status move outside section 5 | `bookingId`, `from`, `to`, `allowed` |
| 409 | `partner_settles_payment` | `cash_amount` on a partner leg at the desk, or `POST /api/admin/booking/payment` on a partner leg | `bookingId`, `platformName`, `externalRef` |
| 422 | `guest_urdd_not_standard` | `admin/create/guest/booking` with a partner guest URDD | |

## 8. Source files

| File | Purpose |
|---|---|
| `Src/HelperFunctions/Visits/bookedVia.js` | `booked_via` builder, CRUD columns, catalogue counts, the desk payment and edit refusals |
| `Src/HelperFunctions/Visits/visitLegGuard.js` | bookings status-only guard and `visitLegWriteGuard(table)` for child rows |
| `Src/HelperFunctions/PreProcessingFunctions/CheckinGroupedCrud/performArrivalLookup.js`, `performBrowseAgenda.js`, `recordDeskPayment.js` | desk flag and payment refusal |
| `Src/HelperFunctions/PostProcessingFunctions/CatalogSummary/catalogSummaryRows.js` | catalogue `bookedVia` |

See also the [visits overview](../visits/visits-overview.md#after-booking) and the [partner integration guide](../visits/partner-integration-guide.md).
