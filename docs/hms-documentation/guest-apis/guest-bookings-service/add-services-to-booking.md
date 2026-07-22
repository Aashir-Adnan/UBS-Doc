# Add Standalone Services to Existing Booking

Add one or more standalone services (addons) to an existing **upcoming or future** booking. The guest is prompted to pay a **20% down payment** on the added services before they are confirmed.

---

## Endpoints

| Method | Path | Purpose |
|--------|------|---------|
| **POST** | `/api/guest/bookings/services` | Add service addons |
| **DELETE** | `/api/guest/bookings/services` | Remove a service addon |
| **PUT** | `/api/guest/bookings/services` | Reschedule addon slots |

All IDs (`booking_id`, `serviceId`) are passed in the **request body**, not the URL path.

All endpoints use **AUTH_PLATFORM** (require a valid guest JWT).

---

## Authentication

Requires a valid guest JWT (`accessToken`). The guest's identity is resolved via `ensureGuestUrdd`.

---

## Add Services — POST

### Request Payload

| Field | Type | Required | Description |
|---|---|---|---|
| `booking_id` | `number` | Yes | The existing booking to add services to. |
| `addons` | `array` | Yes | Non-empty array of service addons to add. |
| `addons[].serviceId` | `number` | Yes | The service to add. Must not be a stay-category service. |
| `addons[].quantity` | `number` | No | Number of slots (default: 1). Capped by `max_quantity_per_booking` config. |
| `addons[].sessions` | `array` | No | For session-based services. Each: `{ date, slot }`. |
| `addons[].meals` | `array` | No | For dining/room-service. Each: `{ date, mealType }`. |
| `addons[].transport` | `object` | No | For transport: `{ tripType, pickupDateTime, pickupLocation, dropoffLocation, passengers }`. |

### Example: Add a spa session to a room booking

```json
{
  "actionPerformerURDD": 16,
  "booking_id": 9060,
  "addons": [
    {
      "serviceId": 55,
      "sessions": [
        { "date": "2026-07-15", "slot": "15:00-16:00" }
      ]
    }
  ]
}
```

### Example: Add dining + transport to a room booking

```json
{
  "actionPerformerURDD": 16,
  "booking_id": 9060,
  "addons": [
    {
      "serviceId": 76,
      "meals": [
        { "date": "2026-07-15", "mealType": "dinner" }
      ]
    },
    {
      "serviceId": 102,
      "transport": {
        "tripType": "airport_pickup",
        "pickupDateTime": "2026-07-14 14:00:00",
        "pickupLocation": "King Abdulaziz International Airport",
        "dropoffLocation": "Hotel Main Entrance",
        "passengers": 2
      }
    }
  ]
}
```

### Example: Add unscheduled service (book now, schedule later)

```json
{
  "actionPerformerURDD": 16,
  "booking_id": 9060,
  "addons": [
    { "serviceId": 90 }
  ]
}
```

The addon is created with `schedulingStatus: "unscheduled"`. The guest can schedule later via `PUT /guest/bookings/services` with `booking_id` and `serviceId` in the body.

---

## Response

Returns the full v2 booking bundle with the updated services list, plus a `downPayment` object:

```json
{
  "id": "BK1780651737235a3f",
  "bookingId": 9060,
  "hotelId": 3,
  "bookingType": "individual_service",
  "status": "confirmed",
  "amount": 375,
  "paidAmount": 60,
  "services": [
    {
      "serviceId": 55,
      "label": { "en": "Deep Tissue Massage" },
      "unitPrice": 150,
      "quantity": 1,
      "schedulingStatus": "complete"
    }
  ],
  "pricing": {
    "primaryTotal": 225,
    "addonsTotal": 150,
    "grandTotal": 375,
    "amountPaid": 60,
    "balanceDue": 315,
    "currency": "SAR"
  },
  "downPayment": {
    "required": true,
    "amount": 30,
    "addedServicesTotal": 150,
    "currency": "SAR"
  }
}
```

### `downPayment` Object

| Field | Type | Description |
|---|---|---|
| `required` | `boolean` | `true` if the guest must pay before services are activated. |
| `amount` | `number` | 20% of the newly added services total. |
| `addedServicesTotal` | `number` | Sum of the prices of the services just added. |
| `currency` | `string` | Currency code (e.g. `"SAR"`). |

---

## Down Payment Flow

Every service addition (standalone or addon) requires a **20% down payment**. This applies to:

- **New standalone bookings** (`POST /guest/bookings/service`) — 20% of the booking total.
- **Addons to existing bookings** (`POST /guest/bookings/services`) — 20% of the added services total.

### Sequence Diagram

```
Guest App                        Backend                          Moyasar
   |                                |                                |
   |-- POST /bookings/services ------>                              |
   |   { booking_id, addons }       |  (insert booking_services,     |
   |                                |   recompute total,             |
   |                                |   return downPayment info)     |
   |<-- 200  booking + downPayment --                                |
   |                                |                                |
   |  [Show payment screen with     |                                |
   |   downPayment.amount]          |                                |
   |                                |                                |
   |-- POST /guest/payments/initiate -->                             |
   |   { bookingId, amount: 30,     |                                |
   |     currency: "SAR" }          |                                |
   |                                |-- Create transaction           |
   |<-- 200 { moyasarForm }  -------->                               |
   |                                |                                |
   |  [Render Moyasar payment form] |                                |
   |  [Guest enters card details]   |                                |
   |                                |                                |
   |-- 3DS redirect --------------->|                                |
   |                                |<-- Webhook: payment success ---|
   |                                |   (increment paid_amount,      |
   |                                |    send confirmation email)    |
   |                                |                                |
   |-- POST /guest/payments/confirm -->                              |
   |   { transactionId,            |-- Verify with Moyasar -------->|
   |     moyasarPaymentId }        |<-- Payment verified ------------|
   |                                |                                |
   |<-- 200 { paymentStatus:       |                                |
   |         "completed",           |                                |
   |         balanceDueRemaining }  |                                |
```

### Frontend Implementation Steps

1. **Call the add-services API** — `POST /guest/bookings/services` with `booking_id` and addons in the body.
2. **Check `downPayment.required`** in the response.
3. **If required**, show a payment prompt to the guest:
   - Display: "A down payment of **[downPayment.amount] [downPayment.currency]** (20%) is required for the added services."
   - Pre-fill the payment amount with `downPayment.amount`.
4. **Initiate payment** — `POST /guest/payments/initiate`:
   ```json
   {
     "actionPerformerURDD": 16,
     "bookingId": 9060,
     "amount": 30,
     "currency": "SAR",
     "methods": ["creditcard"],
     "successUrl": "myapp://payment-success",
     "failureUrl": "myapp://payment-failure"
   }
   ```
   Include an `Idempotency-Key` header (UUID v4).
5. **Render Moyasar form** using the returned `moyasarForm` config (publishable key, amount, callback URL, etc.).
6. **After 3DS redirect**, call `POST /guest/payments/confirm` with the `transactionId` and `moyasarPaymentId`.
7. **On success**, the backend:
   - Increments `bookings.paid_amount`.
   - Sends the booking confirmation email (on first payment only).
   - Returns `balanceDueRemaining` so the app can update the UI.

:::tip Saved Card Payment
If the guest has a saved card, pass `savedCardId` instead of rendering the Moyasar form. The payment may complete immediately or require 3DS — check the `savedCardPayment.status` in the response.
:::

---

## Booking Confirmation Email

The booking confirmation email is sent **after the first successful down payment**, not at booking creation time. This ensures the guest only receives a confirmation once payment is secured.

| Event | Email Sent? |
|---|---|
| Booking created (no payment yet) | No |
| First down payment succeeds (webhook or confirm) | Yes |
| Subsequent payments on same booking | No |

---

## Validation Rules

| Rule | Error |
|---|---|
| Booking must exist, be active, and belong to the guest | `404 Booking not found` |
| Service must be active | `404 Service N not found` |
| Service must belong to the same hotel as the booking | `422 Addon belongs to a different hotel` |
| Stay-category services cannot be added as addons | `422 Stay services cannot be added as addons` |
| Quantity must not exceed `max_quantity_per_booking` | `400 Maximum N booking(s) allowed for service "..."` |
| `addons` must be a non-empty array | `400 addons must be a non-empty array` |
| `booking_id` is required | `400 booking id is required` |
| `tenant_id` is required | `400 tenant_id is required` |

---

## Remove Service — DELETE

Removes a previously added service addon from a booking. Supports three modes:

### Mode 1: Remove all instances of a service

Removes every slot and the entire `booking_services` row for the given `serviceId`.

```json
{
  "actionPerformerURDD": 16,
  "booking_id": 9060,
  "serviceId": 228
}
```

### Mode 2: Remove a specific scheduled slot

Pass `slot_id` to remove one specific time slot. The `booking_services` quantity and total are decremented by one. If it was the last active slot, the entire service is removed.

```json
{
  "actionPerformerURDD": 16,
  "booking_id": 9060,
  "serviceId": 228,
  "slot_id": 1012
}
```

The `slot_id` is returned in the booking response under `services[].sessions[].id` (or `meals[].id` / `transport.id`).

**Example:** A guest booked 3 barber sessions (9:00, 10:00, 11:00). To remove only the 10:00 session, send the `slot_id` of that session. The other two remain active and the quantity drops from 3 to 2.

### Response

```json
{
  "booking_id": 9060,
  "removed": 1,
  "removedSlotId": 1012,
  "remainingSlots": 2
}
```

When `slot_id` is omitted, `removedSlotId` and `remainingSlots` are not included and `removed` reflects the number of `booking_services` rows deactivated.

The booking total is recomputed after removal.

---

## Reschedule Service — PUT

Reschedules the time slots of a previously added service.

### Request

```json
{
  "actionPerformerURDD": 16,
  "booking_id": 9060,
  "booking_service_id": 145,
  "sessions": [
    { "date": "2026-07-16", "slot": "11:00-12:00" }
  ]
}
```

---

## Eligible Services

Any active service belonging to the same hotel as the booking **except**:
- **Stay** services (`category_slug = "stay"`) — these are the anchor service of a room booking.
- **Amenity** services — not standalone bookable.

In practice, eligible categories include: spa, dining, room-service, barber, gym, transport, kids-center, laundry, and any custom service categories.

---

## Change Log

| Date | Change |
|---|---|
| 2026-07-20 | Added `slot_id` parameter to DELETE endpoint for targeted slot removal. A guest can now remove a specific scheduled session (e.g., the 10:00 barber slot) without affecting other slots of the same service. |
| 2026-07-13 | Added 20% down payment requirement for added services. Response now includes `downPayment` object. Booking confirmation email moved to after first successful payment. |
| 2026-06-14 | Initial documentation for add/remove/reschedule service addons on existing bookings. |
