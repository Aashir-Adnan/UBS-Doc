# Guest Review

CRUD endpoints for guests to create, view, update, and delete reviews and ratings on services and packages.

All review data is stored in the `feedback` table, which supports polymorphic references via `base_table` (`'services'` or `'packages'`) and `record_id`.

---

## Endpoints Overview

| Method | Path | Operation | Description |
|---|---|---|---|
| `GET` | `/api/guest/review` | List | List reviews for a service or package |
| `GET` | `/api/guest/review?id=<feedbackId>` | View | Get a single review by ID |
| `POST` | `/api/guest/review` | Add | Submit a new review |
| `PUT` | `/api/guest/review` | Update | Edit the authenticated guest's review |
| `DELETE` | `/api/guest/review` | Delete | Remove the authenticated guest's review |

---

## Authentication

- **List / View**: Uses **PUBLIC_ENCRYPTED_PLATFORM** — no guest JWT required.
- **Add / Update / Delete**: Uses **AUTH_PLATFORM** — requires guest JWT. The `actionPerformerURDD` identifies the guest.

---

## List Reviews

**GET** `/api/guest/review`

Returns paginated reviews for a given service or package.

### Query Parameters

| Parameter | Type | Required | Default | Description |
|---|---|---|---|---|
| `baseTable` | `string` | Yes | — | Entity type: `"services"` or `"packages"`. |
| `recordId` | `number` | Yes | — | The service or package ID to fetch reviews for. |
| `page` | `number` | No | `1` | Page number. |
| `pageSize` | `number` | No | `10` | Results per page (max 50). |
| `sort` | `string` | No | `"newest"` | Sort order: `"newest"`, `"oldest"`, `"highest"`, `"lowest"`. |

### Response (200)

```json
{
  "items": [
    {
      "id": 76,
      "baseTable": "packages",
      "recordId": 329,
      "starRating": 5,
      "title": "Unforgettable anniversary trip",
      "description": "My wife and I celebrated our 10th anniversary here...",
      "reviewer": {
        "id": 71,
        "name": "Ali Ahmad"
      },
      "createdAt": "2026-06-01T11:05:36.000Z"
    }
  ],
  "summary": {
    "averageRating": 4.6,
    "totalReviews": 5,
    "distribution": {
      "5": 3,
      "4": 2,
      "3": 0,
      "2": 0,
      "1": 0
    }
  },
  "pagination": {
    "page": 1,
    "pageSize": 10,
    "totalItems": 5,
    "totalPages": 1
  }
}
```

### Response Fields

| Field | Type | Description |
|---|---|---|
| `items[].id` | `number` | Feedback ID. |
| `items[].baseTable` | `string` | `"services"` or `"packages"`. |
| `items[].recordId` | `number` | The reviewed service or package ID. |
| `items[].starRating` | `number` | Rating from 1 to 5. |
| `items[].title` | `string\|null` | Review title. |
| `items[].description` | `string\|null` | Review body text. |
| `items[].reviewer.id` | `number` | Reviewer's user ID. |
| `items[].reviewer.name` | `string` | Reviewer's display name. |
| `items[].createdAt` | `string` | ISO 8601 timestamp. |
| `summary.averageRating` | `number` | Average star rating across all reviews (1 decimal). |
| `summary.totalReviews` | `number` | Total review count for this entity. |
| `summary.distribution` | `object` | Count of reviews per star level (`"1"` through `"5"`). |

---

## View Single Review

**GET** `/api/guest/review?id=<feedbackId>`

Returns a single review by its feedback ID.

### Response (200)

Same shape as a single `items[]` entry from the List response.

---

## Add Review

**POST** `/api/guest/review`

Submit a new review for a service or package. One review per guest per entity.

### Request Body

| Field | Type | Required | Description |
|---|---|---|---|
| `actionPerformerURDD` | `number` | Yes | The guest's URDD ID. |
| `baseTable` | `string` | Yes | `"services"` or `"packages"`. |
| `recordId` | `number` | Yes | The service or package ID being reviewed. |
| `starRating` | `number` | Yes | Rating from 1 to 5 (integer). |
| `title` | `string` | No | Review title (max 255 characters). |
| `description` | `string` | No | Review body text. |

### Request Example

```json
{
  "actionPerformerURDD": 207,
  "baseTable": "services",
  "recordId": 189,
  "starRating": 5,
  "title": "Excellent room",
  "description": "The executive suite was spacious and the view was amazing."
}
```

### Response (200)

```json
{
  "id": 150,
  "message": "Review submitted successfully"
}
```

### Validation Rules

- `starRating` must be an integer between 1 and 5.
- `baseTable` must be `"services"` or `"packages"`.
- `recordId` must reference an active record.
- A guest can only submit one review per `baseTable` + `recordId` combination. Attempting a duplicate returns a 409 error.

---

## Update Review

**PUT** `/api/guest/review`

Edit the authenticated guest's own review.

### Request Body

| Field | Type | Required | Description |
|---|---|---|---|
| `actionPerformerURDD` | `number` | Yes | The guest's URDD ID. |
| `id` | `number` | Yes | The feedback ID to update. |
| `starRating` | `number` | No | Updated rating (1–5). |
| `title` | `string` | No | Updated title. |
| `description` | `string` | No | Updated body text. |

### Response (200)

```json
{
  "message": "Review updated successfully"
}
```

### Validation Rules

- The review must belong to the authenticated guest (`reviewer_id` matches).
- At least one of `starRating`, `title`, or `description` must be provided.

---

## Delete Review

**DELETE** `/api/guest/review`

Soft-delete the authenticated guest's own review (sets `status = 'inactive'`).

### Request Body

| Field | Type | Required | Description |
|---|---|---|---|
| `actionPerformerURDD` | `number` | Yes | The guest's URDD ID. |
| `id` | `number` | Yes | The feedback ID to delete. |

### Response (200)

```json
{
  "message": "Review deleted successfully"
}
```

### Validation Rules

- The review must belong to the authenticated guest.

---

## Error Responses

### Missing required fields (422)

```json
{
  "statusCode": 422,
  "message": "baseTable and recordId are required"
}
```

### Entity not found (404)

```json
{
  "statusCode": 404,
  "message": "Service not found"
}
```

### Duplicate review (409)

```json
{
  "statusCode": 409,
  "message": "You have already reviewed this service"
}
```

### Not your review (403)

```json
{
  "statusCode": 403,
  "message": "You can only modify your own reviews"
}
```

---

## Notes

- Reviews are soft-deleted (`status = 'inactive'`), not physically removed.
- The `reviewer_id` column stores the `user_id` (resolved from the guest's URDD).
- Aggregated ratings (`rating`, `reviewCount`) displayed on hotel, service, and package cards are computed from this same `feedback` table.
- The rating shown on hotel cards/details is the average across **all** services and packages for that tenant.

---

## Database Schema

**Table: `feedback`**

| Column | Type | Nullable | Description |
|---|---|---|---|
| `feedback_id` | `int` (PK, auto) | No | Primary key. |
| `base_table` | `enum('packages','services')` | No | Entity type being reviewed. |
| `record_id` | `int` | No | ID of the service or package. |
| `reviewer_id` | `int` | Yes | `users.user_id` of the reviewer. |
| `star_rating` | `tinyint unsigned` | Yes | Rating 1–5. |
| `review_title` | `varchar(255)` | Yes | Short review title. |
| `review_description` | `text` | Yes | Full review text. |
| `status` | `varchar(100)` | No | `'active'` or `'inactive'`. Default: `'active'`. |
| `created_at` | `datetime` | Yes | Auto-set on insert. |
| `updated_at` | `datetime` | Yes | Auto-updated on change. |
| `created_by` | `int` | Yes | URDD ID of creator. |
| `updated_by` | `int` | Yes | URDD ID of last updater. |

---

## Related Endpoints

- [Guest Hotels](/hms-documentation/guest-apis/guest-hotels/guest-hotels) — `GET /api/guest/hotels` returns aggregated rating and reviewCount per hotel.
- [Guest Hotel Details](/hms-documentation/guest-apis/guest-hotel-details/guest-hotel-details) — `GET /api/guest/hotel/details` returns hotel-level rating.
- [Guest Services](/hms-documentation/guest-apis/guest-services/guest-services) — Service cards include `rating` and `reviewCount`.
- [Guest Packages](/hms-documentation/guest-apis/guest-packages/guest-packages) — Package cards include `rating` and `reviewCount`.

---

## Source Files

| File | Purpose |
|---|---|
| `Src/Apis/ProjectSpecificApis/GuestSpecificApis/GuestReview/GuestReview.js` | API object definition |
| `Src/Apis/ProjectSpecificApis/GuestSpecificApis/GuestReview/CRUD_parameters.js` | Request parameter schema |

---

## Change Log

| Date | Change |
|---|---|
| 2026-07-06 | Initial creation — CRUD spec for guest reviews |
