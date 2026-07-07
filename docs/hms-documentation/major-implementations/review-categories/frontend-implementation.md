---
sidebar_position: 2
title: "Frontend -- Review Categories Flow"
description: "Frontend integration guide for category-based hotel review ratings: API URLs, parameters, and UI flow."
---

# Frontend -- Review Categories Flow

## Overview

The review categories feature lets guests rate a hotel across 7 specific dimensions on a 1--10 scale after completing a booking. The UI displays horizontal progress bars per category (similar to Booking.com), with an average score displayed next to each.

This document covers:

1. Which APIs to call and with what parameters
2. The expected request/response shapes
3. The recommended UI flow

---

## API Endpoints Summary

| Action | Method | URL | Auth |
|---|---|---|---|
| Fetch all categories | `GET` | `/api/guest/review/categories` | Public encrypted |
| Fetch hotel averages | `GET` | `/api/guest/review/category/ratings?hotelId={id}` | Public encrypted |
| Fetch booking ratings | `GET` | `/api/guest/review/category/ratings?id={bookingId}` | Public encrypted |
| Submit a rating | `POST` | `/api/guest/review/category/ratings` | Public encrypted |
| Delete a rating | `DELETE` | `/api/guest/review/category/ratings` | Public encrypted |

All endpoints use `PUBLIC_ENCRYPTED_PLATFORM` -- encrypt with the platform key only (no access token in the encryption key).

---

## Flow 1: Display Hotel Category Ratings (Hotel Detail Screen)

When the user views a hotel's detail page, show the category breakdown alongside the overall star rating.

### Step 1: Fetch category averages for the hotel

```
GET /api/guest/review/category/ratings?hotelId=3
```

### Response

```json
[
  { "id": 1, "name": "Staff", "slug": "staff", "sortOrder": 1, "averageRating": 6.7, "totalRatings": 42 },
  { "id": 2, "name": "Entertainment", "slug": "entertainment", "sortOrder": 2, "averageRating": 6.0, "totalRatings": 38 },
  { "id": 3, "name": "Cleanliness", "slug": "cleanliness", "sortOrder": 3, "averageRating": 5.9, "totalRatings": 40 },
  { "id": 4, "name": "Comfort", "slug": "comfort", "sortOrder": 4, "averageRating": 6.0, "totalRatings": 39 },
  { "id": 5, "name": "Money Value", "slug": "money-value", "sortOrder": 5, "averageRating": 6.2, "totalRatings": 35 },
  { "id": 6, "name": "Location", "slug": "location", "sortOrder": 6, "averageRating": 7.6, "totalRatings": 41 },
  { "id": 7, "name": "Kid Enjoyment", "slug": "kid-enjoyment", "sortOrder": 7, "averageRating": 8.1, "totalRatings": 30 }
]
```

### UI Rendering

For each item, render:

- **Category name** on the left
- **Progress bar** filled to `averageRating / 10` (e.g., 6.7 = 67% width)
- **Score** on the right (e.g., "6.7")

Sort items by `sortOrder` (already sorted in the response).

The overall score shown at the top can be computed client-side as the average of all `averageRating` values.

---

## Flow 2: Submit Category Ratings (Post-Booking Review Screen)

After a completed booking, prompt the guest to rate each category.

### Step 1: Fetch the category list

```
GET /api/guest/review/categories
```

### Response

```json
[
  { "id": 1, "name": "Staff", "slug": "staff", "sortOrder": 1 },
  { "id": 2, "name": "Entertainment", "slug": "entertainment", "sortOrder": 2 },
  { "id": 3, "name": "Cleanliness", "slug": "cleanliness", "sortOrder": 3 },
  { "id": 4, "name": "Comfort", "slug": "comfort", "sortOrder": 4 },
  { "id": 5, "name": "Money Value", "slug": "money-value", "sortOrder": 5 },
  { "id": 6, "name": "Location", "slug": "location", "sortOrder": 6 },
  { "id": 7, "name": "Kid Enjoyment", "slug": "kid-enjoyment", "sortOrder": 7 }
]
```

### Step 2: Render rating sliders

For each category, render a slider or number picker (1--10). The guest selects a value for each category.

### Step 3: Submit each rating

For each category the guest has rated, fire a POST:

```
POST /api/guest/review/category/ratings
```

**Request body:**

```json
{
  "urddId": 207,
  "hotelId": 3,
  "reviewCategoryId": 1,
  "bookingId": 45,
  "rating": 8
}
```

**Parameters:**

| Field | Type | Description |
|---|---|---|
| `urddId` | `number` | The guest's URDD ID (from their session/profile) |
| `hotelId` | `number` | The hotel's tenant ID (from the booking data) |
| `reviewCategoryId` | `number` | The `id` from the categories list |
| `bookingId` | `number` | The booking being reviewed |
| `rating` | `number` | Integer 1--10 |

**Validation:** The backend rejects any `rating` outside 1--10. The frontend should enforce this in the UI (slider min=1, max=10, step=1).

**Upsert behavior:** If the guest re-submits a rating for the same category + booking, the existing rating is updated (not duplicated). This means the frontend can safely re-submit without checking for existing ratings first.

### Step 4: Batch submission pattern

To submit all 7 ratings at once, fire 7 concurrent POST requests (one per category). All use the same `urddId`, `hotelId`, and `bookingId` -- only `reviewCategoryId` and `rating` differ.

```js
const ratings = [
  { reviewCategoryId: 1, rating: 8 },
  { reviewCategoryId: 2, rating: 6 },
  { reviewCategoryId: 3, rating: 7 },
  // ...
];

await Promise.all(
  ratings.map((r) =>
    postEncrypted("/api/guest/review/category/ratings", {
      urddId,
      hotelId,
      reviewCategoryId: r.reviewCategoryId,
      bookingId,
      rating: r.rating,
    })
  )
);
```

---

## Flow 3: View/Edit Existing Ratings (Review History)

### Fetch ratings for a specific booking

```
GET /api/guest/review/category/ratings?id=45
```

The `id` query parameter here is the **booking ID**.

### Response

```json
[
  { "id": 15, "categoryId": 1, "categoryName": "Staff", "categorySlug": "staff", "rating": 8, "urddId": 207, "hotelId": 3, "bookingId": 45 },
  { "id": 16, "categoryId": 2, "categoryName": "Entertainment", "categorySlug": "entertainment", "rating": 6, "urddId": 207, "hotelId": 3, "bookingId": 45 }
]
```

Use this to pre-fill the rating sliders if the guest wants to edit their review. Re-submitting via POST will update existing ratings (upsert).

### Delete a rating

```
DELETE /api/guest/review/category/ratings
```

**Request body:**

```json
{
  "id": 15
}
```

Where `id` is the `review_category_rating_id` from the View response.

---

## Error Handling

| Status | Scenario | Message |
|---|---|---|
| 422 | Missing required fields | `"urddId, hotelId, reviewCategoryId, and bookingId are required"` |
| 422 | Invalid rating value | `"rating must be an integer between 1 and 10"` |
| 404 | Invalid category ID | `"Review category not found"` |

---

## UI Reference

The design follows the Booking.com pattern (see reference screenshot):

- Overall score badge (top-left, computed as average of all category averages)
- Score label ("Passable", "Good", "Very Good", "Excellent" based on thresholds)
- Total review count
- Category rows: name, progress bar, score

### Suggested score labels

| Average | Label |
|---|---|
| 1.0 -- 3.9 | Poor |
| 4.0 -- 5.9 | Passable |
| 6.0 -- 6.9 | Pleasant |
| 7.0 -- 7.9 | Good |
| 8.0 -- 8.9 | Very Good |
| 9.0 -- 10.0 | Excellent |

---

## Change Log

| Date | Change |
|---|---|
| 2026-07-07 | Initial creation -- frontend integration guide for review categories |
