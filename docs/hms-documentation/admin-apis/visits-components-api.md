# Visit Components API

**GET** `/api/crud/visits/components`

The component picker the visit builder uses to choose a visit's **legs**. It lists the packages and stay services (room types) of every participating hotel. Given a party (adults and children), it also tells you which components can take that party, how many units each needs, and what that costs.

A visit is a chain of stays with no gaps (see [Visits Admin APIs](../visits/visits-admin-apis.md#legs)): each leg is a package or a stay service, and each starts the day the previous one ends. This page covers everything the frontend needs to fill that chain from the picker.

---

## Request

| | |
|---|---|
| Method | `GET /api/crud/visits/components` |
| Auth | admin session (`accesstoken`), standard platform encryption |
| Permission | `list_visits` (SaaS Admin, Visits Curator, general Tenant Manager) |
| `actionPerformerURDD` | the curator's URDD, in the encrypted payload as on every admin call |

Query parameters (all optional):

| Parameter | Type | Default | Meaning |
|---|---|---|---|
| `type` | `package` \| `stay` | both | `service` is accepted as `stay` |
| `hotelId` | number | all hotels | one hotel only |
| `q` | string | — | matches the component name or the hotel name (contains) |
| `consentOnly` | `true` \| `false` | `true` | `true`: only hotels that consent to bundling. `false`: all hotels, with `hotelConsents` telling them apart |
| `adults` | integer ≥ 1 | — | the party. Send it with `children` to filter and annotate by party |
| `children` | integer ≥ 0 | `0` | children in the party. Sending only `children` without `adults` is `422 invalid_party` |
| `page_no` | integer | no paging | page to return. Sending it turns paging on (`page_size` then defaults to `50`) |
| `page_size` | integer | no paging | at most `200`. Sending it turns paging on (`page_no` then defaults to `1`) |

**No paging unless you ask for it.** When neither `page_no` nor `page_size` is sent (or both are empty), every matching component is returned in one response, and `pageNo` and `pageSize` are `null`.

```
GET /api/crud/visits/components?hotelId=86&adults=4&children=1&page_no=1&page_size=50
GET /api/crud/visits/components?type=stay&q=suite
GET /api/crud/visits/components?hotelId=88&adults=2&children=1
```

The second and third calls send no paging parameters, so they return every match.

### Full request

The filters go in the **query string**. Like every admin `GET`, the actor travels in the encrypted `encryptedrequest` header, not in the query. A real call captured from the dev server (curator URDD `2`, hotel `88`, a party of 2 adults and 1 child, two items per page):

```http
GET /api/crud/visits/components?hotelId=88&adults=2&children=1&page_no=1&page_size=2
Content-Type: application/json
accesstoken: <admin access token>
encryptedrequest: <envelope below, AES-encrypted with SECRET_KEY>
x-client-platform: web
x-client-os: Linux
x-client-os-version: 1.0
x-client-device: <device name>
x-client-device-uuid: <device uuid>
x-app-version: 1.0.0
```

The `encryptedrequest` envelope before encryption:

```json
{
  "reqData": "<the payload below, AES-encrypted with accessToken + the Web_App platform key>",
  "encryptionDetails": {
    "PlatformName": "Web_App",
    "PlatformVersion": "1.0.0",
    "accessToken": "<admin access token>"
  }
}
```

`reqData` before encryption is only the actor:

```json
{ "actionPerformerURDD": 2 }
```

No body is sent. `adults`, `children`, `hotelId`, `type`, `q`, `consentOnly`, `page_no` and `page_size` are read from the query string only.

---

## Response

The wire response is the standard envelope. `data` is encrypted with the same key as `reqData`:

```json
{
  "success": true,
  "data": "<encrypted body>",
  "meta": { "message": "Your request has been completed successfully.", "priority": 1, "status": 200 }
}
```

### Full response: with a party

The decrypted `data` of the request above, unshortened. `return` holds the result. `accessToken` and `updatedToken` appear only when the middleware renewed the session on this call; adopt the new token when they do.

```json
{
  "accessToken": "<renewed access token>",
  "updatedToken": "<renewed access token>",
  "return": {
    "items": [
      {
        "baseTable": "services",
        "recordId": 461,
        "name": "Diplomatic Room (Blind & Deaf + Handicapped)",
        "hotelId": 88,
        "hotelName": "Le Meridien Towers",
        "category": {"slug": "stay", "name": "Stay"},
        "price": {"base": 125, "current": 125, "currency": "SAR"},
        "durationNights": null,
        "extraNightsAllowed": null,
        "maxExtraNights": null,
        "maxQuantityPerBooking": null,
        "priceBasis": "per_unit_block",
        "priceBlockNights": 6,
        "perUnit": {"maxAdults": 4, "maxChildren": 4, "maxOccupancy": 4},
        "minPersonsPerBooking": 1,
        "unitCount": 1,
        "party": {"adults": 2, "children": 1, "fitsNatively": true, "unitsRequired": 1, "adjustedPrice": 125},
        "hotelConsents": true,
        "configs": [
          {"config_key_id": 7294, "config_key": "terms_and_conditions", "operator": "=", "config_value": [{"en": "terms and conditions", "ar": "الشروط والأحكام"}], "is_input": 1},
          {"config_key_id": 7295, "config_key": "visibility", "operator": "=", "config_value": [23852], "is_input": 0},
          {"config_key_id": 7296, "config_key": "advance_booking_min_days", "operator": "=", "config_value": [{"en": "0", "ar": ""}], "is_input": 1},
          {"config_key_id": 7297, "config_key": "advance_booking_max_days", "operator": "=", "config_value": [{"en": "30", "ar": ""}], "is_input": 1},
          {"config_key_id": 7299, "config_key": "publish_start_datetime", "operator": "=", "config_value": [{"en": "2026-08-01 00:00:00", "ar": ""}], "is_input": 1},
          {"config_key_id": 7300, "config_key": "publish_end_datetime", "operator": "=", "config_value": [{"en": "2026-11-30 00:00:00", "ar": ""}], "is_input": 1},
          {"config_key_id": 7302, "config_key": "min_persons_per_booking", "operator": "=", "config_value": [{"en": "1", "ar": ""}], "is_input": 1},
          {"config_key_id": 7303, "config_key": "max_persons_per_booking", "operator": "=", "config_value": [{"en": "10", "ar": ""}], "is_input": 1},
          {"config_key_id": 7304, "config_key": "min_stay_nights", "operator": "=", "config_value": [{"en": "1", "ar": ""}], "is_input": 1},
          {"config_key_id": 7305, "config_key": "max_stay_nights", "operator": "=", "config_value": [{"en": "30", "ar": ""}], "is_input": 1},
          {"config_key_id": 7309, "config_key": "allowed_regions", "operator": "=", "config_value": [{"en": "{\"1\":[1,2,3,4,5,6,7,8,9,10,11,12,13,14],\"2\":[15,16,17,18,19,20,21,22],\"3\":[23,24,25,26,27,28,29,30,31,32,33],\"4\":[34,35,36,37,38,39,40,41],\"5\":[42,43,44,45,46],\"6\":[47,48,49,50,51,52,53],\"7\":[54,55,56,57,58,59,60,61,62,63,64,65,66,67,68],\"8\":[69,70,71,72,73,74,75,76,77],\"9\":[78,79,80,81,82,83,84,85,86,87,88,89,90,91,92,93,94,95],\"10\":[96,97,98,99,100],\"11\":[101,102,103,104,105,106,107,108,109,110,111,112,113,114,115,116,117,118,119,120,121,122,123,124,125,126,127,128,129,130,131,132,133,134,135,136,137,138,139,140,141,142,143,144,145,146,147],\"12\":[148,149,150],\"13\":[151,152,153,154,155,156,157],\"14\":[158,159,160,161,162,163,164,165,166,167,168,169,170,171],\"15\":[172,173,174,175,176,177,178,179,180,181,182,183],\"16\":[184,185,186,187,188,189,190,191,192,193,194,195,196,197]}", "ar": ""}], "is_input": 1},
          {"config_key_id": 7312, "config_key": "base_price", "operator": "=", "config_value": [{"en": "125", "ar": ""}], "is_input": 1},
          {"config_key_id": 7319, "config_key": "extension_allowed", "operator": "=", "config_value": [{"en": "0", "ar": ""}], "is_input": 1},
          {"config_key_id": 7321, "config_key": "max_extension_length", "operator": "=", "config_value": [{"en": "7", "ar": ""}], "is_input": 1},
          {"config_key_id": 7327, "config_key": "is_featured", "operator": "=", "config_value": [{"en": "0", "ar": ""}], "is_input": 1},
          {"config_key_id": 7329, "config_key": "base_currency", "operator": "=", "config_value": [{"currency_id": 4, "key": "SAR", "en": "SAR", "ar": "SAR", "currency_name": "Saudi Riyal", "currency_symbol": "SR"}], "is_input": 1},
          {"config_key_id": 7332, "config_key": "is_amenity", "operator": "=", "config_value": [{"en": "0", "ar": ""}], "is_input": 1},
          {"config_key_id": 7337, "config_key": "duration_unit", "operator": "=", "config_value": [25568], "is_input": 0},
          {"config_key_id": 7349, "config_key": "duration", "operator": "=", "config_value": [{"en": "6", "ar": ""}], "is_input": 1},
          {"config_key_id": 7364, "config_key": "max_adults", "operator": "=", "config_value": [{"en": "4", "ar": ""}], "is_input": 1},
          {"config_key_id": 7365, "config_key": "max_children", "operator": "=", "config_value": [{"en": "4", "ar": ""}], "is_input": 1},
          {"config_key_id": 7367, "config_key": "is_consumable", "operator": "=", "config_value": [{"en": "0", "ar": ""}], "is_input": 1},
          {"config_key_id": 7372, "config_key": "min_guests_age", "operator": "=", "config_value": [{"en": "0", "ar": ""}], "is_input": 1},
          {"config_key_id": 7373, "config_key": "max_guests_age", "operator": "=", "config_value": [{"en": "0", "ar": ""}], "is_input": 1}
        ]
      },
      {
        "baseTable": "services",
        "recordId": 460,
        "name": "Diplomatic Room (Blind & Deaf Accessible)",
        "hotelId": 88,
        "hotelName": "Le Meridien Towers",
        "category": {"slug": "stay", "name": "Stay"},
        "price": {"base": 115, "current": 115, "currency": "SAR"},
        "durationNights": null,
        "extraNightsAllowed": null,
        "maxExtraNights": null,
        "maxQuantityPerBooking": null,
        "priceBasis": "per_unit_block",
        "priceBlockNights": 7,
        "perUnit": {"maxAdults": 4, "maxChildren": 4, "maxOccupancy": 4},
        "minPersonsPerBooking": 1,
        "unitCount": 1,
        "party": {"adults": 2, "children": 1, "fitsNatively": true, "unitsRequired": 1, "adjustedPrice": 115},
        "hotelConsents": true,
        "configs": [
          {"config_key_id": 7294, "config_key": "terms_and_conditions", "operator": "=", "config_value": [{"en": "terms and conditions", "ar": "الشروط والأحكام"}], "is_input": 1},
          {"config_key_id": 7295, "config_key": "visibility", "operator": "=", "config_value": [23852], "is_input": 0},
          {"config_key_id": 7296, "config_key": "advance_booking_min_days", "operator": "=", "config_value": [{"en": "0", "ar": ""}], "is_input": 1},
          {"config_key_id": 7297, "config_key": "advance_booking_max_days", "operator": "=", "config_value": [{"en": "30", "ar": ""}], "is_input": 1},
          {"config_key_id": 7299, "config_key": "publish_start_datetime", "operator": "=", "config_value": [{"en": "2026-08-01 00:00:00", "ar": ""}], "is_input": 1},
          {"config_key_id": 7300, "config_key": "publish_end_datetime", "operator": "=", "config_value": [{"en": "2026-11-30 00:00:00", "ar": ""}], "is_input": 1},
          {"config_key_id": 7302, "config_key": "min_persons_per_booking", "operator": "=", "config_value": [{"en": "1", "ar": ""}], "is_input": 1},
          {"config_key_id": 7303, "config_key": "max_persons_per_booking", "operator": "=", "config_value": [{"en": "10", "ar": ""}], "is_input": 1},
          {"config_key_id": 7304, "config_key": "min_stay_nights", "operator": "=", "config_value": [{"en": "1", "ar": ""}], "is_input": 1},
          {"config_key_id": 7305, "config_key": "max_stay_nights", "operator": "=", "config_value": [{"en": "30", "ar": ""}], "is_input": 1},
          {"config_key_id": 7309, "config_key": "allowed_regions", "operator": "=", "config_value": [{"en": "{\"1\":[1,2,3,4,5,6,7,8,9,10,11,12,13,14],\"2\":[15,16,17,18,19,20,21,22],\"3\":[23,24,25,26,27,28,29,30,31,32,33],\"4\":[34,35,36,37,38,39,40,41],\"5\":[42,43,44,45,46],\"6\":[47,48,49,50,51,52,53],\"7\":[54,55,56,57,58,59,60,61,62,63,64,65,66,67,68],\"8\":[69,70,71,72,73,74,75,76,77],\"9\":[78,79,80,81,82,83,84,85,86,87,88,89,90,91,92,93,94,95],\"10\":[96,97,98,99,100],\"11\":[101,102,103,104,105,106,107,108,109,110,111,112,113,114,115,116,117,118,119,120,121,122,123,124,125,126,127,128,129,130,131,132,133,134,135,136,137,138,139,140,141,142,143,144,145,146,147],\"12\":[148,149,150],\"13\":[151,152,153,154,155,156,157],\"14\":[158,159,160,161,162,163,164,165,166,167,168,169,170,171],\"15\":[172,173,174,175,176,177,178,179,180,181,182,183],\"16\":[184,185,186,187,188,189,190,191,192,193,194,195,196,197]}", "ar": ""}], "is_input": 1},
          {"config_key_id": 7312, "config_key": "base_price", "operator": "=", "config_value": [{"en": "115", "ar": ""}], "is_input": 1},
          {"config_key_id": 7319, "config_key": "extension_allowed", "operator": "=", "config_value": [{"en": "0", "ar": ""}], "is_input": 1},
          {"config_key_id": 7321, "config_key": "max_extension_length", "operator": "=", "config_value": [{"en": "7", "ar": ""}], "is_input": 1},
          {"config_key_id": 7327, "config_key": "is_featured", "operator": "=", "config_value": [{"en": "0", "ar": ""}], "is_input": 1},
          {"config_key_id": 7329, "config_key": "base_currency", "operator": "=", "config_value": [{"currency_id": 4, "key": "SAR", "en": "SAR", "ar": "SAR", "currency_name": "Saudi Riyal", "currency_symbol": "SR"}], "is_input": 1},
          {"config_key_id": 7332, "config_key": "is_amenity", "operator": "=", "config_value": [{"en": "0", "ar": ""}], "is_input": 1},
          {"config_key_id": 7337, "config_key": "duration_unit", "operator": "=", "config_value": [25568], "is_input": 0},
          {"config_key_id": 7349, "config_key": "duration", "operator": "=", "config_value": [{"en": "7", "ar": ""}], "is_input": 1},
          {"config_key_id": 7364, "config_key": "max_adults", "operator": "=", "config_value": [{"en": "4", "ar": ""}], "is_input": 1},
          {"config_key_id": 7365, "config_key": "max_children", "operator": "=", "config_value": [{"en": "4", "ar": ""}], "is_input": 1},
          {"config_key_id": 7367, "config_key": "is_consumable", "operator": "=", "config_value": [{"en": "0", "ar": ""}], "is_input": 1},
          {"config_key_id": 7372, "config_key": "min_guests_age", "operator": "=", "config_value": [{"en": "0", "ar": ""}], "is_input": 1},
          {"config_key_id": 7373, "config_key": "max_guests_age", "operator": "=", "config_value": [{"en": "0", "ar": ""}], "is_input": 1}
        ]
      }
    ],
    "total": 13,
    "pageNo": 1,
    "pageSize": 2
  }
}
```

### Full response: without a party

`GET /api/crud/visits/components?hotelId=88&type=package&page_no=1&page_size=1`. With no `adults`, every component is listed and `party` is `null`. A package has `durationNights`, `extraNightsAllowed` and `maxExtraNights`, and `priceBlockNights` is `null`:

```json
{
  "return": {
    "items": [
      {
        "baseTable": "packages",
        "recordId": 385,
        "name": "Test Pkg",
        "hotelId": 88,
        "hotelName": "Le Meridien Towers",
        "category": null,
        "price": {"base": 100, "current": 100, "currency": "SAR"},
        "durationNights": 2,
        "extraNightsAllowed": true,
        "maxExtraNights": 2,
        "extraNightPrice": 45,
        "maxQuantityPerBooking": null,
        "priceBasis": "per_package",
        "priceBlockNights": null,
        "perUnit": {"maxAdults": 1, "maxChildren": null, "maxOccupancy": null},
        "minPersonsPerBooking": 1,
        "unitCount": 3,
        "party": null,
        "hotelConsents": true,
        "configs": [
          {"config_key_id": 7293, "config_key": "media", "operator": "=", "config_value": [{"en": "1481", "ar": ""}], "is_input": 1},
          {"config_key_id": 7295, "config_key": "visibility", "operator": "=", "config_value": [23852], "is_input": 0},
          {"config_key_id": 7296, "config_key": "advance_booking_min_days", "operator": "=", "config_value": [{"en": "0", "ar": ""}], "is_input": 1},
          {"config_key_id": 7297, "config_key": "advance_booking_max_days", "operator": "=", "config_value": [{"en": "30", "ar": ""}], "is_input": 1},
          {"config_key_id": 7299, "config_key": "publish_start_datetime", "operator": "=", "config_value": [{"en": "2026-09-02 16:39:00", "ar": ""}], "is_input": 1},
          {"config_key_id": 7302, "config_key": "min_persons_per_booking", "operator": "=", "config_value": [{"en": "1", "ar": ""}], "is_input": 1},
          {"config_key_id": 7303, "config_key": "max_persons_per_booking", "operator": "=", "config_value": [{"en": "10", "ar": ""}], "is_input": 1},
          {"config_key_id": 7309, "config_key": "allowed_regions", "operator": "=", "config_value": [{"en": "{\"1\":[1,2,3,4,5,6,7,8,9,10,11,12,13,14],\"2\":[15,16,17,18,19,20,21,22],\"3\":[23,24,25,26,27,28,29,30,31,32,33],\"4\":[34,35,36,37,38,39,40,41],\"5\":[42,43,44,45,46],\"6\":[47,48,49,50,51,52,53],\"7\":[54,55,56,57,58,59,60,61,62,63,64,65,66,67,68],\"8\":[69,70,71,72,73,74,75,76,77],\"9\":[78,79,80,81,82,83,84,85,86,87,88,89,90,91,92,93,94,95],\"10\":[96,97,98,99,100],\"11\":[101,102,103,104,105,106,107,108,109,110,111,112,113,114,115,116,117,118,119,120,121,122,123,124,125,126,127,128,129,130,131,132,133,134,135,136,137,138,139,140,141,142,143,144,145,146,147],\"12\":[148,149,150],\"13\":[151,152,153,154,155,156,157],\"14\":[158,159,160,161,162,163,164,165,166,167,168,169,170,171],\"15\":[172,173,174,175,176,177,178,179,180,181,182,183],\"16\":[184,185,186,187,188,189,190,191,192,193,194,195,196,197]}", "ar": ""}], "is_input": 1},
          {"config_key_id": 7312, "config_key": "base_price", "operator": "=", "config_value": [{"en": "100", "ar": ""}], "is_input": 1},
          {"config_key_id": 7324, "config_key": "consumption_type", "operator": "=", "config_value": [23897], "is_input": 0},
          {"config_key_id": 7327, "config_key": "is_featured", "operator": "=", "config_value": [{"en": "1", "ar": ""}], "is_input": 1},
          {"config_key_id": 7329, "config_key": "base_currency", "operator": "=", "config_value": [{"currency_id": 4, "key": "SAR", "en": "SAR", "ar": "SAR", "currency_name": "Saudi Riyal", "currency_symbol": "SR"}], "is_input": 1},
          {"config_key_id": 7336, "config_key": "amenities_tags", "operator": "=", "config_value": [23970, 23966], "is_input": 0},
          {"config_key_id": 7337, "config_key": "duration_unit", "operator": "=", "config_value": [24102], "is_input": 0},
          {"config_key_id": 7349, "config_key": "duration", "operator": "=", "config_value": [{"en": "2", "ar": ""}], "is_input": 1},
          {"config_key_id": 7363, "config_key": "keyword_tags", "operator": "=", "config_value": [24155, 24157], "is_input": 0},
          {"config_key_id": 7364, "config_key": "max_adults", "operator": "=", "config_value": [{"en": "1", "ar": ""}], "is_input": 1},
          {"config_key_id": 7372, "config_key": "min_guests_age", "operator": "=", "config_value": [{"en": "0", "ar": ""}], "is_input": 1},
          {"config_key_id": 7373, "config_key": "max_guests_age", "operator": "=", "config_value": [{"en": "0", "ar": ""}], "is_input": 1},
          {"config_key_id": 8089, "config_key": "additional_package_nights_allowed", "operator": "=", "config_value": [{"en": "1", "ar": ""}], "is_input": 1},
          {"config_key_id": 8091, "config_key": "max_additional_package_nights", "operator": "=", "config_value": [{"en": "2", "ar": ""}], "is_input": 1},
          {"config_key_id": 8093, "config_key": "additional_package_nights_price_discount_value", "operator": "=", "config_value": [{"en": "10", "ar": ""}], "is_input": 1},
          {"config_key_id": 8095, "config_key": "additional_package_nights_price_discount_type", "operator": "=", "config_value": [28130], "is_input": 0},
          {"config_key_id": 8109, "config_key": "add_ons", "operator": "=", "config_value": [{"en": "{\"add_on_service\":466,\"discount_pct\":10}", "ar": ""}], "is_input": 1}
        ]
      }
    ],
    "total": 1,
    "pageNo": 1,
    "pageSize": 1
  }
}
```

### Full response: invalid party

`GET /api/crud/visits/components?children=2` (children without adults):

```json
{
  "success": false,
  "data": null,
  "meta": {
    "message": "Please enter a valid number of adults and children.",
    "status": 422,
    "detail": "adults must be at least 1",
    "priority": 2,
    "source": "Visits",
    "scc": "invalid_party"
  },
  "error": {
    "message": "adults must be at least 1",
    "detail": "Please enter a valid number of adults and children.",
    "code": "invalid_party",
    "source": "Visits",
    "details": {
      "code": "invalid_party"
    }
  }
}
```

### Field reference

| Field | Type | Nullable | Meaning |
|---|---|---|---|
| `total` | number | no | matching components (with a party: only those that fit) |
| `pageNo`, `pageSize` | number | yes | the page returned. Both `null` when no paging parameter was sent and every match is in `items` |
| `items[].baseTable` | string | no | `packages` or `services`. A `services` item is always a stay (room type) |
| `items[].recordId` | number | no | package id or service id; send it as the leg's `recordId` |
| `items[].name` | string | no | component name |
| `items[].hotelId`, `items[].hotelName` | number, string | no | the hotel the component belongs to |
| `items[].category` | object | yes | `{ slug: "stay", name }` for stays, `null` for packages |
| `items[].price` | object | yes | `base` (list), `current` (after active discount) and `currency`. `null` when the component has no active price |
| `items[].priceBasis` | string | no | `per_package` for packages; `per_unit_block` for stays (price per room per block of nights) |
| `items[].priceBlockNights` | number | yes | stays: nights one price covers (the room's `duration` config, else `1`). `null` for packages |
| `items[].durationNights` | number | yes | packages: the nights one package covers. `null` for stays |
| `items[].extraNightsAllowed` | boolean | yes | packages: whether extra nights may be added. `null` for stays |
| `items[].maxExtraNights` | number | yes | packages: most extra nights (`null`: no cap). `null` for stays |
| `items[].extraNightPrice` | number | yes | packages: what one extra night adds per unit: `price.current ÷ durationNights`, less the package's extra-night discount. It is what the backend charges, before the hotel's date rules. `null` for stays, for packages without extra nights, or without a price. Leg estimate: `price × quantity + extraNightPrice × extraNights × quantity` |
| `items[].maxQuantityPerBooking` | number | yes | most units (packages or rooms) one purchase may take; `null`: no cap |
| `items[].perUnit.maxAdults` | number | yes | adults one unit takes; `null`: no adult cap |
| `items[].perUnit.maxChildren` | number | yes | children one unit takes on top of free adult places; `null`: no child cap |
| `items[].perUnit.maxOccupancy` | number | yes | stays: people per room (room capacity, capped by `max_persons_per_booking`). `null` for packages |
| `items[].minPersonsPerBooking` | number | yes | minimum party: per room for stays, per booking for packages |
| `items[].unitCount` | number | yes | rooms the hotel has: the room type's active rooms, or for a package its stay service's rooms. `null` when a package has no stay service |
| `items[].party` | object | yes | `null` when no party was sent |
| `items[].party.adults`, `.children` | number | no | the party you sent |
| `items[].party.unitsRequired` | number | no | units this party needs (rule below) |
| `items[].party.fitsNatively` | boolean | no | `true` when one unit is enough |
| `items[].party.adjustedPrice` | number | yes | `price.current × unitsRequired` for **one** package period or **one** room price block. It does not include extra nights or more than one block: for a stay multiply by `ceil(nights ÷ priceBlockNights)`, for a package add `extraNightPrice × extraNights × unitsRequired`. `null` without a price |
| `items[].hotelConsents` | boolean | no | the hotel's `allow_visit_bundling` consent. Always `true` with `consentOnly=true` |
| `items[].configs[]` | array | no | the component's own configs: `config_key_id`, `config_key`, `operator`, `is_input`, `config_value` (typed values as `en`/`ar` pairs, option keys as option ids, `base_currency` as currency objects) |

---

## Rules the API applies

### Which components are listed

A component is listed only when all of these hold:

1. It's a **package** or a **service whose category is `stay`**. Dining, transport, spa and other services are never listed: they can't be legs, they come with a package.
2. It's `active`, and its hotel is `active`.
3. It doesn't belong to the platform's system tenant.
4. Its hotel consents to bundling (`allow_visit_bundling`), unless `consentOnly=false`.
5. It matches `type`, `hotelId` and `q` when sent.

Results are sorted by hotel name, then component name.

### How the party is matched

When `adults` / `children` are sent, the API works out the **units** (packages or rooms) the party needs. `unitsRequired` is the smallest `u` for which all of these hold (a limit that isn't set is skipped):

```
adults              ≤ u × maxAdults
children            ≤ u × maxChildren + (u × maxAdults − adults)
adults + children   ≤ u × maxOccupancy
```

A child may take a free adult place; an adult never takes a child's place.

A component is then **left out** when:

| Reason | Condition |
|---|---|
| The party can't fit at all | no `u` works, e.g. adults in a unit with `maxAdults: 0` |
| Over the per-booking cap | `unitsRequired > maxQuantityPerBooking` |
| Not enough rooms at the hotel | `unitsRequired > unitCount` |
| Below the minimum | stays: `ceil(people / unitsRequired) < minPersonsPerBooking`. Packages: `people < minPersonsPerBooking` |

Every listed component can take the party in one purchase. `fitsNatively: true` means one unit; otherwise the party is spread over `unitsRequired` units and the price scales with them.

### Worked examples

| Party | Unit limits | `unitsRequired` | Result |
|---|---|---|---|
| 2 adults + 1 child | 4 adults, 1 child, 4 per room | 1 | listed, `fitsNatively: true` |
| 4 adults + 1 child | 4 adults, 1 child, 4 per room | 2 (5 people > 4) | listed, price × 2 |
| 4 adults + 1 child | 2 adults, 1 child, 2 per room | 3 (5 people / 2) | listed, price × 3 |
| 2 adults + 3 children | 3 adults, 2 children, 5 per room | 1 (a child takes the free adult place) | listed, `fitsNatively: true` |
| 4 adults + 1 child | 2 adults, 0 children, max 1 per booking | 3 | left out (over the per-booking cap) |
| 13 adults | 4 per room, hotel has 3 rooms | 4 | left out (not enough rooms) |
| 5 adults | 4 per room, minimum 4 per room | 2 (2.5 per room) | left out (below the minimum) |

### Dates are not checked here

The picker has no dates: a visit is built before anyone picks a start date. `unitCount` is how many rooms the hotel **has**, not how many are free. Free rooms, sale windows, weekday rules and advance-booking limits are checked when a partner prices and books the visit for a date.

### Paging

- **No `page_no` / `page_size`:** no paging. `items` holds every match, `total` equals `items.length`, and `pageNo` / `pageSize` are `null`.
- **Either one sent:** paging is on. A missing `page_no` is `1`, a missing `page_size` is `50`, and `page_size` is capped at `200`. The two rules below apply.
- **Paged, without a party:** filtering and paging run in the database. Every page is full until the last, and `total` counts all matches.
- **Paged, with a party:** every candidate is checked, the ones that don't fit are dropped, and the rest are paged. `total` counts only the components that fit, so pages stay full and consistent.

---

## Using the results in the visit builder

### 1. Ask for the party first

Let the curator enter the party the visit is designed for (adults and children), then call the picker with it. Without a party you get every component but no fit information.

When the party changes, call the picker again. Results and `unitsRequired` depend on it.

### 2. Build the chain of legs

The visit is an ordered list of legs. For each leg the curator picks one item:

| Item | Leg to send | Length |
|---|---|---|
| `baseTable: "packages"` | `{ baseTable: "packages", recordId, quantity, extraNights, displayOrder }` | `durationNights + extraNights` |
| `baseTable: "services"` (stay) | `{ baseTable: "services", recordId, quantity, nights, displayOrder }` | `nights` |

- **`quantity`:** start at `1`. It's the least units **every** purchase books and the base the visit price is set for; a larger party at purchase time books more units and pays a scaled price automatically. Pre-filling it with `party.unitsRequired` makes a couple book (and pay for) the whole group's rooms. Raise it only for group-only visits. Clamp it to `maxQuantityPerBooking`, and for stays also to `unitCount`. See [Visit price calculation](../visits/visit-price-calculation.md#2-units-per-leg).
- **`nights` (stays):** at least 1. Respect the room's `min_stay_nights` / `max_stay_nights` from `configs` when present; the server rejects others with `invalid_nights`.
- **`extraNights` (packages):** only when `extraNightsAllowed`, and at most `maxExtraNights`. Otherwise leave it 0.
- **`displayOrder`:** 1, 2, 3, … in trip order.
- **Don't send `dayOffset`.** The server derives it: leg 1 starts on day 0, each next leg on the day the previous one ends. If you send it and it doesn't match, the save fails with `leg_gap` or `leg_overlap`.

### 3. Preview the timeline on the client

The same rule gives the trip preview without a server call:

```
day[1] = 0
day[n] = day[n-1] + nights[n-1]
trip length = sum of all legs' nights
```

Example:

| Leg | Component | Nights | Starts on day | Units (`quantity`) | Estimated price |
|---|---|---|---|---|---|
| 1 | Package A (2 nights) | 2 | 0 | 1 | 1 × package price |
| 2 | Family Suite (priced per night) | 3 | 2 | 1 | 1 room × 3 nights × price per night |
| 3 | Package B (2 nights + 1 extra night) | 3 | 5 | 1 | package price + 1 × `extraNightPrice` |

The trip lasts 8 nights. When a partner later sells it from a start date, leg 1 checks in that day, and each leg checks out the day the next one checks in.

### 4. Estimate the cost

Price every leg with one shared formula, at the leg's `quantity` units (full rules and worked examples in [Visit price calculation](../visits/visit-price-calculation.md)):

- **Package leg:** `price.current × units + extraNightPrice × extraNights × units`. Example: package 369 costs 615 USD for 2 nights with a 10 % extra-night discount, so `extraNightPrice` is 276.75; 2 units with 2 extra nights cost 615 × 2 + 276.75 × 2 × 2 = 2,337.
- **Stay leg:** `price.current × units × ceil(nights / priceBlockNights)`. Don't sum `party.adjustedPrice`: it covers one package period or one price block only.

  Example from the [full response](#full-response-with-a-party): room `461` costs 125 SAR with `priceBlockNights: 6`, and the party needs 1 room. One price covers up to 6 nights, rounded up per block:

  | Nights | Blocks | Cost |
  |---|---|---|
  | 1 to 6 | 1 | 125 |
  | 7 to 12 | 2 | 250 |
  | 13 | 3 | 375 |

The sum is the components' cost before hotel pricing rules for the travel date. Use it to set the visit's sell price (`visitPricing`). After saving, the visits View returns `visitPricingEstimate` (the backend's price for tomorrow, hotel rules included); the real per-leg price is computed when a partner prices the visit for a date.

### 5. Show the fit clearly

| Item state | Suggested UI |
|---|---|
| `party.fitsNatively: true` | normal card |
| `party.fitsNatively: false` | badge "this party needs `unitsRequired` units" as information; the leg's `quantity` stays as the curator set it |
| `hotelConsents: false` (only with `consentOnly=false`) | disabled; a visit can't be published with it |
| `price: null` | warn; the save is refused with `component_unpriced` until the hotel sets a price |
| `price.currency` differs from the visit's (or the first leg's) | disabled; the save is refused with `currency_mismatch` |

### 6. Save

`catalogId` is the id of the `visit` catalog (`3` on the dev database; read it from the catalog list rather than hard-coding it). Send the legs as `visitItems` on `POST /api/crud/visits` (create) or `PUT /api/crud/visits?id=` (update). See [Visits Admin APIs](../visits/visits-admin-apis.md) for the full payload and the `invalid_items` details.

```json
{
  "visitName": { "en": "Makkah 7 nights", "ar": "مكة ٧ ليال" },
  "catalogId": 3,
  "visitItems": [
    { "baseTable": "packages", "recordId": 367, "quantity": 1, "extraNights": 0, "displayOrder": 1 },
    { "baseTable": "services", "recordId": 381, "quantity": 2, "nights": 3, "displayOrder": 2 },
    { "baseTable": "packages", "recordId": 422, "quantity": 1, "displayOrder": 3 }
  ],
  "visitPricing": [ { "price": 9000, "currencyId": 4 } ]
}
```

---

## Errors

| HTTP | SCC | When |
|---|---|---|
| 401 | `unauthenticated` | missing or expired session |
| 403 | `E31` | the URDD lacks `list_visits` |
| 422 | `invalid_party` | `adults` below 1 or not a whole number, `children` below 0 or not a whole number, or `children` without `adults` |

Validation of the legs themselves (`service_not_stay`, `leg_gap`, `leg_overlap`, `invalid_nights`, `extra_nights_not_allowed`, `package_quantity_over_max`, …) happens when the visit is saved, not here.
