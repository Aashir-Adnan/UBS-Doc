# Guest Booking Constraints

**GET** `/api/guest/booking/constraints`

Returns the configurable booking rules for a hotel's stay services. The frontend can use these values to constrain date pickers (min/max selectable range), guest count inputs, and show blackout periods — before the user submits a booking or edit request.

If `serviceId` is provided, returns constraints for that single service. If omitted, returns constraints for all stay services at the hotel.

---

## Authentication

Uses **PUBLIC_ENCRYPTED_PLATFORM** — encrypted request/response using the platform key only. No guest JWT required.

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
      "blackoutDates": null
    }
  ]
}
```

---

## Response Fields

| Field | Type | Description |
|---|---|---|
| `hotelId` | `number` | The tenant/hotel ID that was queried. |
| `services` | `array` | Array of constraint objects, one per stay service. |

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
| `blackoutDates` | `array\|null` | List of date windows where check-in is blocked. Each entry has `startDate` and `endDate` (ISO date strings). `null` if none configured. |

---

## How the Frontend Should Use These

| Constraint | Frontend Behavior |
|---|---|
| `minStayNights` / `maxStayNights` | Limit the selectable check-out date range relative to the chosen check-in date. |
| `advanceBookingMinDays` | Disable dates before `today + minDays` in the check-in date picker. |
| `advanceBookingMaxDays` | Disable dates after `today + maxDays` in the check-in date picker. |
| `maxPersonsPerRoom` | Show a note or auto-calculate rooms needed when guest count exceeds this. |
| `blackoutDates` | Disable or visually mark blackout windows in the check-in date picker. |

When multiple services are returned, constraints may differ per room type. The frontend should apply the constraints matching the selected service.

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

- All constraint values come from `hms_config` rows linked to each stay service. Hotel admins can update these via the admin dashboard.
- The `advanceBookingMinDays` and `advanceBookingMaxDays` checks only apply to the **check-in date**. When editing a booking and only changing the check-out date, these are not enforced server-side.
- `blackoutDates` only blocks **check-in** on those dates — a stay that spans a blackout window (check-in before, check-out after) is allowed.
- Different room types at the same hotel can have different constraints (e.g. suites may allow longer stays than standard rooms).

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

---

## Change Log

| Date | Change |
|---|---|
| 2026-07-20 | Initial creation |
| 2026-07-20 | Added optional `serviceId` param; response now returns `services` array supporting multiple stay services |
