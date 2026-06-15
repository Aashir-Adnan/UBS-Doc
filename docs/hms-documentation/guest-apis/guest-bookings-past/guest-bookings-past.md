# Guest Past Bookings

**GET** `/api/guest/bookings`

Returns a paginated list of the guest's past bookings — bookings that are checked out, cancelled, or whose check-in date has passed without being checked in.

---

## Authentication

Uses **AUTH_PLATFORM** — requires a valid guest JWT (`accessToken`). The guest's identity is resolved via `ensureGuestUrdd`.

The frontend must send a **tenant-specific URDD** (`tenantUrddMap[tenantId]`) for this endpoint.

---

## Request Payload

This endpoint takes no request body parameters. Send an empty encrypted body.

### Query Parameters

| Parameter | Type | Default | Description |
|---|---|---|---|
| `page` | `number` | `1` | Page number (1-based). |
| `pageSize` | `number` | `10` | Number of items per page. |

### Example

```
GET /api/guest/bookings?page=1&pageSize=10
```

---

## Behavior

1. Resolves the guest's `urdd_id` from the JWT via `ensureGuestUrdd`.
2. Queries `bookings` where:
   - `urdd_id` matches the authenticated guest.
   - `status` is `active` (not soft-deleted).
   - One of the following:
     - `booking_status` is `checked_out` or `cancelled` (regardless of dates).
     - `booking_status` is NOT `checked_in`, `checked_out`, or `cancelled` AND `DATE(check_in_date) < CURDATE()` (check-in date has passed without being checked in).
3. Results are ordered by `check_in_date DESC` (most recent first).
4. Results are paginated using `page` and `pageSize` query params.
5. For each booking in the current page, the full v2 booking bundle is built via `buildBookingsBundle`.

---

## Response

### Success (200)

```json
{
  "success": true,
  "data": {
    "return": {
      "items": [
        {
          "id": "BK220830644232",
          "bookingId": 9111,
          "hotelId": 3,
          "bookingType": "individual_service",
          "status": "completed",
          "paymentStatus": "paid",
          "amount": 1460,
          "paidAmount": 1460,
          "currency": "SAR",
          "checkIn": "2026-06-01T00:00:00.000Z",
          "checkOut": "2026-06-04T00:00:00.000Z",
          "actualCheckIn": "2026-06-01T14:00:00.000Z",
          "actualCheckOut": "2026-06-04T11:00:00.000Z",
          "createdAt": "2026-05-28T12:34:43.000Z",
          "nights": 3,
          "checkInFlag": "checked_in"
        }
      ],
      "pagination": {
        "page": 1,
        "pageSize": 10,
        "totalItems": 1,
        "totalPages": 1
      }
    }
  }
}
```

The booking object shape is the same v2 bundle used by all other booking endpoints. See [Guest Upcoming Bookings](../guest-bookings-upcoming/guest-bookings-upcoming.md) for the full field reference.

---

## What qualifies as "past"

| Condition | Example |
|---|---|
| Checked out | Guest completed their stay (`booking_status = 'checked_out'`). |
| Cancelled | Booking was cancelled (`booking_status = 'cancelled'`). |
| Missed check-in | Check-in date has passed but guest never checked in (`confirmed`/`pending` with `check_in_date < today`). |

---

## Query Filter Summary

| Filter | Value | Description |
|---|---|---|
| `urdd_id` | From JWT | Only the authenticated guest's bookings. |
| `status` | `active` | Excludes soft-deleted bookings. |
| `booking_status` | `checked_out`, `cancelled` | Completed or cancelled bookings (any date). |
| Date filter | `DATE(check_in_date) < CURDATE()` | Check-in date has passed — applies only to bookings not already matched by status (i.e. `confirmed`/`pending` that were never checked in). |
| Order | `check_in_date DESC` | Most recent past booking first. |

---

## Error Responses

| Status | Message | Condition |
|---|---|---|
| 401 | Unauthenticated | Missing or invalid access token. |
| 500 | `Failed to fetch bookings` | Internal query or processing error. |

---

## Source Files

| File | Purpose |
|---|---|
| `Src/Apis/ProjectSpecificApis/GuestSpecificApis/GuestBookings/GuestBookings.js` | API object definition + query |
| `Src/HelperFunctions/Guest/v2/bookingsBundle.js` | v2 booking bundle builder |
