# Guest Booking Constraints

**GET** `/api/guest/booking/constraints`

Returns the configurable booking rules for a hotel's stay services. The frontend uses these values to constrain date pickers (min/max selectable range), guest count inputs, and show blackout periods.

**This API applies to all services and packages.** The scalar constraints (stay nights, advance booking window, persons per room) are per-service, while blackout dates are hotel-wide and block bookings across every service and package at the hotel. The frontend must silently fetch these constraints in the background and ensure they are loaded before entering any booking flow — room bookings, service bookings, and package bookings alike.

If `serviceId` is provided, returns constraints for that single service. If omitted, returns constraints for all stay services at the hotel.

---

## Authentication

Uses **PUBLIC_ENCRYPTED_PLATFORM** — encrypted request/response using the platform key only. No guest JWT required.

---

## Frontend Integration

This endpoint should be called as early as possible — ideally when the user lands on a hotel's page or selects a hotel. The response should be cached client-side for the duration of the session and made available to all booking-related screens (room booking, service booking, package booking, and booking edit).

**Do not wait for the user to open a date picker or enter the booking flow.** Fetch constraints silently in the background so that date pickers, guest count inputs, and blackout indicators are ready immediately when the user begins a booking.

---

## Query Parameters

| Parameter | Type | Required | Description |
|---|---|---|---|
| `hotelId` | `number` | Yes | The tenant ID of the hotel to fetch constraints for. |
| `serviceId` | `number` | No | A specific stay service ID. If omitted, returns constraints for all stay services. |

---

## Request Examples

All stay services:

```
GET /api/guest/booking/constraints?hotelId=56
```

Single service:

```
GET /api/guest/booking/constraints?hotelId=56&serviceId=188
```

---

## Response Example

```json
{
  "hotelId": 56,
  "services": [
    {
      "serviceId": 188,
      "serviceName": "Deluxe Room",
      "minStayNights": 1,
      "maxStayNights": 30,
      "advanceBookingMinDays": 0,
      "advanceBookingMaxDays": 90,
      "maxPersonsPerRoom": 4,
      "blackoutDates": [
        { "startDate": "2026-12-25", "endDate": "2026-12-31" }
      ]
    },
    {
      "serviceId": 192,
      "serviceName": "Standard Room",
      "minStayNights": 1,
      "maxStayNights": 14,
      "advanceBookingMinDays": 0,
      "advanceBookingMaxDays": 60,
      "maxPersonsPerRoom": 2,
      "blackoutDates": [
        { "startDate": "2026-12-25", "endDate": "2026-12-31" }
      ]
    }
  ],
  "tenantBlackouts": [
    { "startDate": "2026-12-25", "endDate": "2026-12-31" }
  ]
}
```

---

## Response Fields

| Field | Type | Description |
|---|---|---|
| `hotelId` | `number` | The tenant/hotel ID that was queried. |
| `services` | `array` | Array of constraint objects, one per stay service. |
| `tenantBlackouts` | `array` | Hotel-wide blackout dates that apply to all services and packages. Only present in the all-services response (when `serviceId` is omitted). |

### Service Constraint Object

| Field | Type | Description |
|---|---|---|
| `serviceId` | `number` | The stay service ID. |
| `serviceName` | `string\|null` | The service name (e.g. "Deluxe Room"). |
| `minStayNights` | `number` | Minimum number of nights between check-in and check-out. Defaults to `1` if not configured. |
| `maxStayNights` | `number\|null` | Maximum number of nights between check-in and check-out. `null` if no limit is configured. |
| `advanceBookingMinDays` | `number` | Earliest allowed check-in is `today + N` days. Defaults to `0` (same-day booking allowed). |
| `advanceBookingMaxDays` | `number\|null` | Latest allowed check-in is `today + N` days. `null` if no limit is configured. |
| `maxPersonsPerRoom` | `number\|null` | Maximum guests per room. When total guests exceed this, the system auto-assigns multiple rooms. `null` if no limit. |
| `blackoutDates` | `array\|null` | Hotel-wide blackout date windows where check-in is blocked. These are tenant-level dates that apply to every service and package at this hotel. Each entry has `startDate` and `endDate` (ISO date strings). `null` if none configured. |

### Blackout Date Entry

| Field | Type | Description |
|---|---|---|
| `startDate` | `string\|null` | Start of the blackout window (ISO date, e.g. `"2026-12-25"`). |
| `endDate` | `string\|null` | End of the blackout window (ISO date, e.g. `"2026-12-31"`). |

---

## Blackout Dates — Hotel-Wide (Tenant-Level)

Blackout dates are configured at the **hotel (tenant) level**, not per-service. When a hotel admin sets blackout dates, they apply uniformly to **all services and packages** at that hotel. This means:

- The same blackout windows appear in every service's `blackoutDates` array in this response.
- The `tenantBlackouts` field (in the all-services response) provides the raw hotel-wide list for convenience.
- The booking creation endpoints (`createRoomBooking`, `createServiceBooking`, `createPackageBooking`) and the booking edit endpoint all enforce these blackout dates server-side.

The frontend should use these dates to:
1. Disable or visually mark blackout windows in **all** date pickers (room, service, and package booking flows).
2. Prevent the user from selecting a check-in date that falls within a blackout period.
3. Show a clear message if the user somehow attempts to book during a blackout period.

---

## How the Frontend Should Use These

| Constraint | Frontend Behavior |
|---|---|
| `minStayNights` / `maxStayNights` | Limit the selectable check-out date range relative to the chosen check-in date. |
| `advanceBookingMinDays` | Disable dates before `today + minDays` in the check-in date picker. |
| `advanceBookingMaxDays` | Disable dates after `today + maxDays` in the check-in date picker. |
| `maxPersonsPerRoom` | Show a note or auto-calculate rooms needed when guest count exceeds this. |
| `blackoutDates` | Disable or visually mark blackout windows in the check-in date picker across all booking flows (rooms, services, packages). |

When multiple services are returned, scalar constraints (stay nights, advance booking, persons) may differ per room type. The frontend should apply the constraints matching the selected service. Blackout dates are the same across all services since they are hotel-wide.

---

## Error Responses

### Missing hotelId (422)

```json
{
  "statusCode": 422,
  "message": "hotelId is required"
}
```

### No Stay Services Found (404)

Returned when the hotel has no active stay-category services, or the specified `serviceId` does not match a stay service at the hotel.

```json
{
  "statusCode": 404,
  "message": "No stay services found for this hotel"
}
```

---

## Notes

- Scalar constraint values (stay nights, advance booking, persons) come from `hms_config` rows linked to each stay service. Hotel admins can update these via the admin dashboard.
- **Blackout dates are tenant-level** — they are stored in `hms_config` with `base_table = 'tenants'` and apply to all services and packages at the hotel. There are no per-service blackout dates.
- The `advanceBookingMinDays` and `advanceBookingMaxDays` checks only apply to the **check-in date**. When editing a booking and only changing the check-out date, these are not enforced server-side.
- `blackoutDates` only blocks **check-in** on those dates — a stay that spans a blackout window (check-in before, check-out after) is allowed.
- Different room types at the same hotel can have different scalar constraints (e.g. suites may allow longer stays than standard rooms).
- Blackout entries with `active: false` in the config are filtered out automatically.

---

## Related Endpoints

- [Guest Hotel Details](/hms-documentation/guest-apis/guest-hotel-details/guest-hotel-details) — `GET /api/guest/hotel/details` returns hotel info including currency and rating.
- [Guest Unavailable Dates](/hms-documentation/guest-apis/guest-unavailable-dates/guest-unavailable-dates) — `GET /api/guest/unavailable/dates` returns fully sold-out dates for a service.
- [Guest Booking Edit](/hms-documentation/guest-apis/guest-booking-flow/guest-booking-edit) — `PUT /api/guest/booking/edit` where these constraints are enforced server-side.

---

## Source Files

| File | Purpose |
|---|---|
| `Src/Apis/ProjectSpecificApis/GuestSpecificApis/GuestBookingConstraints/GuestBookingConstraints.js` | API object definition |
| `Src/Apis/ProjectSpecificApis/GuestSpecificApis/GuestBookingConstraints/CRUD_parameters.js` | Request parameter schema |
| `data/migrations_completed/20260731_1_change_blackout_dates_target_table_to_tenants.sql` | Migration that moved blackout_dates to tenant-level |

---

## Change Log

| Date | Change |
|---|---|
| 2026-07-20 | Initial creation |
| 2026-07-20 | Added optional `serviceId` param; response now returns `services` array supporting multiple stay services |
| 2026-08-04 | Documented that constraints apply to all services and packages; added background-fetch guidance; documented hotel-wide (tenant-level) blackout dates; fixed missing `sc.slug = 'stay'` filter in all-services query; removed dead service-level blackout fetch |
