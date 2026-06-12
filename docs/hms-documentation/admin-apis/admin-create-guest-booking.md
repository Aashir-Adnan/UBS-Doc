# Admin Create Guest Booking

**POST** `/api/admin/create/guest/booking`

Creates a booking on behalf of a guest — combining room booking, package booking, standalone service booking, and addon scheduling into a single API call. Designed for the desk-clerk workflow where a guest walks in and the clerk handles everything from account creation to booking.

---

## Authentication & Authorization

Uses **PUBLIC_ENCRYPTED_PLATFORM** — encrypted request/response using the platform key only. No guest JWT is required.

### Authorization (tenant staff + RBAC permission)

Same validator as [Admin Create Guest User](./admin-create-guest-user.md), but gated on the **`add_bookings`** permission (the user endpoint uses `add_users`). The `actionPerformerURDD` must be tenant staff of the hotel that holds `add_bookings`:

| Check | Required Value |
|---|---|
| Designation | `TENANT` |
| Department | `TENANT_<hotel_code>` |
| `tenant_id` | must equal the `hotelId` |
| Permission | `add_bookings` (active, in the actor's URDP) |

The **role is not hardcoded** — both **Tenant Admin** and **Tenant Manager** qualify (both are `designation = TENANT` and hold `add_bookings`).

---

## Booking Type Detection

The API determines which booking type to create based on which fields are present:

| Priority | Field Present | Booking Type | Delegates To |
|---|---|---|---|
| 1 | `packageId` | Package booking | `createPackageBooking` |
| 2 | `roomId` or `tag` | Room (stay) booking | `createRoomBooking` |
| 3 | `serviceId` | Standalone service booking | `createServiceBooking` |

If none of the three are provided, the API returns **400**.

Each delegate runs the **exact same business logic** as the guest-facing endpoints — including all validations (min/max stay, party size, advance booking window, blackout dates), pricing, unit availability checks, and addon scheduling.

---

## Request Payload

### Core Fields

| Field | Type | Required | Description |
|---|---|---|---|
| `actionPerformerURDD` | `number` | Yes | Admin's URDD ID for this hotel |
| `hotelId` | `number` | Yes | Hotel tenant ID |
| `guestUrddId` | `number` | Yes | Guest's URDD for this hotel (from `AdminCreateGuestUser` response's `hotelUrddId`) |

### Booking Type Selectors

| Field | Type | Required | Description |
|---|---|---|---|
| `packageId` | `number` | Conditional | Package to book (triggers package booking) |
| `roomId` | `number` | Conditional | Stay service ID (triggers room booking) |
| `serviceId` | `number` | Conditional | Standalone service ID (triggers service booking) |
| `tag` | `string` | No | Room tag filter (e.g. `"deluxe"`). Triggers room booking if no `roomId`. |

### Scheduling

| Field | Type | Required | Description |
|---|---|---|---|
| `checkIn` | `string` | Conditional | Check-in date (`YYYY-MM-DD`). Required for room and package bookings. |
| `checkOut` | `string` | Conditional | Check-out date (`YYYY-MM-DD`). Required for room bookings. |
| `adults` | `number` | No | Number of adult guests (default: 1) |
| `children` | `number` | No | Number of child guests (default: 0) |
| `specialRequests` | `string` | No | Free-text special requests |

### Service Scheduling (for standalone service bookings)

| Field | Type | Description |
|---|---|---|
| `sessions` | `array` | For session-based services (spa, barber, gym). Each: `{ date, slot }` |
| `meals` | `array` | For dining/room-service. Each: `{ date, mealType }` |
| `transport` | `object` | For transport: `{ tripType, pickupDateTime, pickupLocation, dropoffLocation, passengers }` |

### Package Service Scheduling

| Field | Type | Description |
|---|---|---|
| `services` | `array` | Per-service scheduling within a package. Each: `{ serviceId, sessions?, meals?, transport? }` |

### Addons

| Field | Type | Description |
|---|---|---|
| `addons` | `array` | Extra services beyond the primary booking. Each: `{ serviceId, sessions?, meals?, transport? }` |

### Form Data

| Field | Type | Description |
|---|---|---|
| `formData` | `object` | Category-specific guest form fields (auto-derived from guest profile if omitted) |

---

## Examples

### Room Booking with Addons

A guest walks in, wants a room for 3 nights with a spa session and dinner.

```json
{
  "actionPerformerURDD": 42,
  "hotelId": 3,
  "guestUrddId": 81,
  "roomId": 10,
  "checkIn": "2026-06-15",
  "checkOut": "2026-06-18",
  "adults": 2,
  "specialRequests": "High floor please",
  "addons": [
    {
      "serviceId": 55,
      "sessions": [{ "date": "2026-06-16", "slot": "10:00-11:00" }]
    },
    {
      "serviceId": 60,
      "meals": [{ "date": "2026-06-16", "mealType": "dinner" }]
    }
  ]
}
```

### Package Booking

Guest wants a pre-defined package with scheduling for included services.

```json
{
  "actionPerformerURDD": 42,
  "hotelId": 3,
  "guestUrddId": 81,
  "packageId": 15,
  "checkIn": "2026-06-15",
  "checkOut": "2026-06-18",
  "adults": 2,
  "children": 1,
  "services": [
    {
      "serviceId": 55,
      "sessions": [{ "date": "2026-06-16", "slot": "14:00-15:00" }]
    },
    {
      "serviceId": 60,
      "meals": [
        { "date": "2026-06-15", "mealType": "dinner" },
        { "date": "2026-06-16", "mealType": "breakfast" }
      ]
    }
  ]
}
```

### Standalone Service Booking

Guest just wants a spa appointment, no room.

```json
{
  "actionPerformerURDD": 42,
  "hotelId": 3,
  "guestUrddId": 81,
  "serviceId": 55,
  "sessions": [
    { "date": "2026-06-15", "slot": "15:00-16:00" }
  ],
  "adults": 1
}
```

### Transport Booking

Guest needs an airport pickup.

```json
{
  "actionPerformerURDD": 42,
  "hotelId": 3,
  "guestUrddId": 81,
  "serviceId": 102,
  "transport": {
    "tripType": "airport_pickup",
    "pickupDateTime": "2026-06-15 14:00:00",
    "pickupLocation": "King Abdulaziz International Airport",
    "dropoffLocation": "Hotel Main Entrance",
    "passengers": 2
  }
}
```

### Book Now, Schedule Later

Create the booking now; guest will schedule specific times from the app later.

```json
{
  "actionPerformerURDD": 42,
  "hotelId": 3,
  "guestUrddId": 81,
  "roomId": 10,
  "checkIn": "2026-06-15",
  "checkOut": "2026-06-18",
  "adults": 2,
  "addons": [
    { "serviceId": 55 },
    { "serviceId": 60 }
  ]
}
```

Unscheduled addons get `slot_status = 'unscheduled'` and appear in the guest's app for self-scheduling via the [reschedule endpoint](../guest-apis/guest-booking-reschedule/guest-booking-reschedule.md).

---

## Response

Returns the full v2 booking bundle — the same response shape as the guest-facing booking endpoints.

```json
{
  "booking_id": 9250,
  "booking_number": "BK98765432xxxx",
  "categoryId": 1,
  "tag": "stay",
  "images": [],
  "amenities": [],
  "unit": { "unitId": 12, "label": "Room 101", "identifier": "101" },
  "unitPrice": 500,
  "schedule": {
    "checkIn": "2026-06-15",
    "checkOut": "2026-06-18",
    "nights": 3
  },
  "status": "confirmed",
  "paymentStatus": "pending",
  "specialRequests": "High floor please",
  "cancellation": { "cancellable": true, "fee": 0 },
  "package": null,
  "services": [
    {
      "bookingServiceId": 160,
      "serviceId": 55,
      "serviceName": "Spa Session",
      "category": "spa",
      "quantity": 1,
      "unitPrice": 150,
      "totalPrice": 150,
      "slots": [
        { "slotId": 200, "start": "2026-06-16 10:00", "end": "2026-06-16 11:00", "status": "scheduled" }
      ]
    },
    {
      "bookingServiceId": 161,
      "serviceId": 60,
      "serviceName": "Dinner",
      "category": "dining",
      "quantity": 1,
      "unitPrice": 80,
      "totalPrice": 80,
      "slots": [
        { "slotId": 201, "start": "2026-06-16", "status": "scheduled", "formValues": { "meal_type": "dinner" } }
      ]
    }
  ]
}
```

A booking confirmation email is sent to the guest automatically (fire-and-forget).

---

## Booking Ownership

The booking is **owned by the guest** (via `guestUrddId`), not by the admin. This means:

- The booking appears in the guest's upcoming bookings list.
- The guest can reschedule, cancel, or manage it from their app.
- The `bookings.urdd_id` column points to the guest's URDD.

The admin's URDD is tracked internally as the actor who initiated the booking.

---

## Validations

All existing booking validations apply — the admin does not bypass any business rules:

| Validation | Applies To |
|---|---|
| Min/max stay nights | Room bookings |
| Min/max persons per booking | Room, package, service bookings |
| Advance booking window (min/max days) | All booking types |
| Blackout dates | All booking types |
| Weekday arrival restriction | Package bookings |
| Unit availability (room conflicts) | Room, package-with-stay bookings |
| Cross-hotel addon guard | Addons must belong to the same hotel |
| Stay-as-addon guard | Stay services cannot be added as addons |
| Category-specific form validation | Kids Center guardian rule, Spa age bracket |

---

## Error Responses

| Status | Condition |
|---|---|
| 400 | Missing required fields, validation failures (stay duration, party size, etc.) |
| 403 | `actionPerformerURDD` is not tenant staff (`TENANT` designation + `TENANT_<hotel_code>` department) for this hotel, or lacks the `add_bookings` permission |
| 404 | Hotel, service, package, or guest URDD not found |
| 409 | No available rooms/units for the selected dates |
| 422 | Cross-hotel addon, stay-as-addon, package has no services |

---

## Complete Desk Clerk Workflow

```
┌─────────────────────────────────────────────────────┐
│  1. Guest walks in                                  │
│                                                     │
│  2. POST /api/admin/create/guest/user               │
│     → Creates user + URDDs                          │
│     → Returns hotelUrddId                           │
│                                                     │
│  3. POST /api/admin/create/guest/booking             │
│     → Uses hotelUrddId as guestUrddId              │
│     → Creates booking + schedules addons            │
│     → Guest receives confirmation email             │
│                                                     │
│  4. Guest can now manage their booking from the app │
└─────────────────────────────────────────────────────┘
```

---

## Source Files

| File | Purpose |
|---|---|
| `Src/Apis/ProjectSpecificApis/GuestSpecificApis/AdminCreateGuestBooking/AdminCreateGuestBooking.js` | API object definition |
| `Src/Apis/ProjectSpecificApis/GuestSpecificApis/AdminCreateGuestBooking/CRUD_parameters.js` | Request parameter schema |
| `Src/HelperFunctions/PreProcessingFunctions/Guest/validateAdminForTenant.js` | Authorization validator (shared) — factory `validateAdminForTenant("add_bookings")`: tenant-staff + permission gate |
| `Src/HelperFunctions/PreProcessingFunctions/Guest/adminCreateGuestBooking.js` | Booking type router + guest payload builder |
| `Src/HelperFunctions/PreProcessingFunctions/Guest/createRoomBooking.js` | Room booking logic (reused) |
| `Src/HelperFunctions/PreProcessingFunctions/Guest/createPackageBooking.js` | Package booking logic (reused) |
| `Src/HelperFunctions/PreProcessingFunctions/Guest/createServiceBooking.js` | Service booking logic (reused) |
| `Src/HelperFunctions/PreProcessingFunctions/Guest/addBookingServices.js` | Addon scheduling logic (reused) |
