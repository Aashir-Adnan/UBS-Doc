# Guest Unavailable Dates

**GET** `/api/guest/unavailable/dates`

Returns all **fully booked dates** for a specific room or package from today to 1 year ahead. Used by the frontend date picker to disable dates that cannot be booked.

The maximum booking window is **1 year** from today.

---

## Authentication

Uses **PUBLIC_ENCRYPTED_PLATFORM** — encrypted request/response using the platform key only. No guest JWT required.

---

## Request Payload

| Field | Type | Required | Description |
|---|---|---|---|
| `serviceId` | `number` | Conditional | Stay service (room) ID. Mutually exclusive with `packageId`. |
| `packageId` | `number` | Conditional | Package ID. Resolves to the package's stay service. Mutually exclusive with `serviceId`. |

One of `serviceId` or `packageId` must be provided.

### Example — By Room

```json
{
  "serviceId": 71
}
```

### Example — By Package

```json
{
  "packageId": 10
}
```

---

## Response

### Success (200)

```json
{
  "serviceId": 71,
  "packageId": null,
  "rangeStart": "2026-06-24",
  "rangeEnd": "2027-06-24",
  "unavailableDates": [
    "2026-07-01",
    "2026-07-02",
    "2026-07-03",
    "2026-08-15",
    "2026-08-16",
    "2026-12-31"
  ]
}
```

### Package Resolved to Stay Service (200)

When `packageId` is provided, the API resolves it to the underlying stay service:

```json
{
  "serviceId": 71,
  "packageId": 10,
  "rangeStart": "2026-06-24",
  "rangeEnd": "2027-06-24",
  "unavailableDates": [
    "2026-07-01",
    "2026-07-02"
  ]
}
```

### Fully Available (200)

If no dates are booked, `unavailableDates` is an empty array:

```json
{
  "serviceId": 71,
  "packageId": null,
  "rangeStart": "2026-06-24",
  "rangeEnd": "2027-06-24",
  "unavailableDates": []
}
```

---

## Response Fields

| Field | Type | Description |
|---|---|---|
| `serviceId` | `number` | The stay service ID used for availability checking. |
| `packageId` | `number\|null` | The package ID if requested via package, otherwise `null`. |
| `rangeStart` | `string` | Start of the scanned range (today, YYYY-MM-DD). |
| `rangeEnd` | `string` | End of the scanned range (today + 365 days, YYYY-MM-DD). |
| `unavailableDates` | `string[]` | Array of YYYY-MM-DD date strings where all delivery units are booked. |

---

## How It Works

1. Resolves the target stay service (directly from `serviceId`, or via `packageId` → `package_services` → stay category service).
2. Counts the total available delivery units for that service.
3. For each date in the range (today → today + 365 days), counts how many units have active booking_items that overlap that night.
4. A date is **unavailable** when the count of booked units equals the total unit count (i.e., no unit is free).

---

## Error Responses

| Status | Condition |
|---|---|
| 422 | Neither `serviceId` nor `packageId` provided, or both provided simultaneously. |
| 404 | Package has no stay service, or stay service not found. |

```json
{
  "message": "serviceId or packageId is required",
  "details": [
    { "field": "serviceId", "code": "required" }
  ]
}
```

---

## Source Files

| File | Purpose |
|---|---|
| `Src/Apis/ProjectSpecificApis/GuestSpecificApis/GuestUnavailableDates/GuestUnavailableDates.js` | API object definition |
| `Src/Apis/ProjectSpecificApis/GuestSpecificApis/GuestUnavailableDates/CRUD_parameters.js` | Request parameter schema |
| `Src/HelperFunctions/PreProcessingFunctions/Guest/fetchUnavailableDates.js` | Unavailable dates computation logic |
