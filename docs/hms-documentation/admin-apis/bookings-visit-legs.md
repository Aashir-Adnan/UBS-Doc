# Visit Legs in Hotel Booking Tools

A **visit leg** is a booking a partner platform made as part of a visit (`bookings.visit_id` is set, `bookings.channel_platform_id` is the partner). Once booked, a visit cannot be changed, and only the partner can cancel it, as a whole visit. The hotel-side booking writers therefore accept **status changes only** on a visit leg.

| Endpoint | Method | Guarded operations |
|---|---|---|
| `/api/crud/bookings?id=<booking_id>` | **PUT**, **DELETE** | Update, Delete |
| `/api/grouped-cruds/bookings?id=<booking_id>` | **PUT** | Update (bookings step) |
| `/api/custom-booking-rooms-grouped-crud` | **PUT** | Step 1, edit booking (`bookings_existingBookingId`) |

Bookings without a `visit_id` are not affected.

---

## Allowed status moves

| From | To | Meaning |
|---|---|---|
| `pending` | `confirmed` | The hotel approves the leg (`leg.approved` to the partner) |
| `pending` | `cancelled` | The hotel rejects the leg (`leg.rejected`). HMS then cancels the purchase's other legs and credits the partner |
| `confirmed` | `checked_in` | Check in |
| `confirmed` | `no_show` | No-show |
| `checked_in` | `checked_out` | Check out |

Sending the current status again is allowed. Any other move, including cancelling a confirmed leg, returns `409 visit_leg_status`.

`special_requests`, `actual_check_in`, `actual_check_out`, `cancellation_reason` and `cancelled_at` can still be written.

## Locked fields

`tenant_id`, `booking_number`, `urdd_id`, `package_id`, `booking_type`, `check_in_date`, `check_out_date`, `total_guests`, `adults`, `children`, `total_amount`, `paid_amount`, `currency_id`.

- A locked field sent with a different value returns `409 visit_leg_locked` and lists the fields in `error.details.fields`. Dates are compared as `YYYY-MM-DD` and amounts to two decimals, so re-sending the stored values is fine.
- A locked field left out of a full-row update is filled with the stored value, so the update cannot blank it.

## Delete

`DELETE` on a visit leg returns `409 visit_leg_locked`. Use the status moves above instead.

## Errors

| HTTP | `meta.scc` | When | `error.details` |
|---|---|---|---|
| 409 | `visit_leg_locked` | A locked field changes, or a delete | `bookingId`, `fields` |
| 409 | `visit_leg_status` | A status move outside the table above | `bookingId`, `from`, `to`, `allowed` |

## Not guarded

The staff check-in and check-out flows and the admin booking payment endpoint are separate APIs and are not blocked by this rule.

## Source files

| File | Purpose |
|---|---|
| `Src/HelperFunctions/Visits/visitLegGuard.js` | `enforceVisitLegStatusOnly` (CRUD preprocess) and `assertVisitLegStatusOnly` |
| `Src/Apis/GeneratedApis/Default/Bookings/Crud_Objects/Bookings.js` | Bookings CRUD, guard first in `preProcessFunctions` |
| `Src/Apis/GeneratedApis/Default/Bookings/Grouped_Objects/Grouped_Bookings.js` | Grouped bookings step |
| `Src/HelperFunctions/PreProcessingFunctions/CustomBookingRoomsGroupedCrud/step1_edit_booking.js` | Booking-rooms step 1 |

See also the [visits overview](../visits/visits-overview.md#after-booking).
