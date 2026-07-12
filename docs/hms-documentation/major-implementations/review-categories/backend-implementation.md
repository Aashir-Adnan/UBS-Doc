---
sidebar_position: 1
title: "Backend -- Review Categories Implementation"
description: "Database schema, seed data, and API endpoints for category-based hotel review ratings (1-10 scale)."
---

# Backend -- Review Categories Implementation

## Overview

Category-based review ratings allow guests to rate a hotel across specific dimensions (Staff, Entertainment, Cleanliness, etc.) on a **1--10 scale**, tied to a specific booking. This complements the existing text-based `feedback` table (1--5 star reviews) with structured per-category scoring.

The feature consists of:

- **`review_categories`** -- lookup table of rating categories (seeded)
- **`review_category_ratings`** -- per-guest, per-hotel, per-category, per-booking ratings
- **Two new API endpoints** -- one to list categories, one to submit/view ratings

---

## Database Schema

### Table: `review_categories`

Lookup table for the rating dimensions. Seeded with 7 default categories.

| Column | Type | Nullable | Description |
|---|---|---|---|
| `review_category_id` | `int` (PK, auto) | No | Primary key |
| `category_name` | `varchar(100)` | No | Display name (e.g., "Staff") |
| `category_slug` | `varchar(100)` | No | URL-safe slug (unique) |
| `sort_order` | `int` | No | Display order |
| `status` | `varchar(100)` | No | `'active'` or `'inactive'` |
| `created_at` | `datetime` | Yes | Auto-set |
| `updated_at` | `datetime` | Yes | Auto-updated |

**Seeded categories:**

| sort_order | category_name | category_slug |
|---|---|---|
| 1 | Staff | `staff` |
| 2 | Entertainment | `entertainment` |
| 3 | Cleanliness | `cleanliness` |
| 4 | Comfort | `comfort` |
| 5 | Money Value | `money-value` |
| 6 | Location | `location` |
| 7 | Kid Enjoyment | `kid-enjoyment` |

### Table: `review_category_ratings`

Stores one rating per guest per category per booking per hotel.

| Column | Type | Nullable | Description |
|---|---|---|---|
| `review_category_rating_id` | `int` (PK, auto) | No | Primary key |
| `urdd_id` | `int` | No | FK to `user_roles_designations_department` |
| `tenant_id` | `int` | No | FK to `tenants` (the hotel being rated) |
| `review_category_id` | `int` | No | FK to `review_categories` |
| `booking_id` | `int` | No | FK to `bookings` |
| `rating` | `tinyint unsigned` | No | Rating value (1--10) |
| `status` | `varchar(100)` | No | `'active'` or `'inactive'` |
| `created_at` | `datetime` | Yes | Auto-set |
| `updated_at` | `datetime` | Yes | Auto-updated |
| `created_by` | `int` | Yes | URDD ID of creator |
| `updated_by` | `int` | Yes | URDD ID of last updater |

**Unique constraint:** `(urdd_id, tenant_id, review_category_id, booking_id)` -- one rating per category per booking.

---

## Migration

File: `data/migrations_completed/20260707_1_review_categories_and_ratings.sql`

Creates both tables (idempotent with `CREATE TABLE IF NOT EXISTS`) and seeds the 7 categories (guarded by `NOT EXISTS`).

---

## API Endpoints

### 1. List Review Categories

**GET** `/api/guest/review/categories`

Returns all active review categories. No parameters required.

**Platform:** `PUBLIC_ENCRYPTED_PLATFORM` (no auth)

**Response (200):**

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

---

### 2. Review Category Ratings CRUD

Base path: `/api/guest/review/category/ratings`

**Platform:** `PUBLIC_ENCRYPTED_PLATFORM` (no auth)

#### GET -- List (averages per hotel)

**GET** `/api/guest/review/category/ratings?hotelId=<tenantId>`

Returns average rating per category for a given hotel.

| Parameter | Type | Required | Description |
|---|---|---|---|
| `hotelId` | `number` | Yes | The tenant/hotel ID |

**Response (200):**

```json
[
  {
    "id": 1,
    "name": "Staff",
    "slug": "staff",
    "sortOrder": 1,
    "averageRating": 7.3,
    "totalRatings": 42
  }
]
```

#### GET -- View (ratings for a booking)

**GET** `/api/guest/review/category/ratings?id=<bookingId>`

Returns the category ratings submitted for a specific booking.

| Parameter | Type | Required | Description |
|---|---|---|---|
| `id` | `number` | Yes | The booking ID |

**Response (200):**

```json
[
  {
    "id": 15,
    "categoryId": 1,
    "categoryName": "Staff",
    "categorySlug": "staff",
    "rating": 8,
    "urddId": 207,
    "hotelId": 3,
    "bookingId": 45
  }
]
```

#### POST -- Add rating

**POST** `/api/guest/review/category/ratings`

Submit a rating for a specific category. Uses upsert -- if the guest already rated this category for this booking, the rating is updated.

**Request body:**

| Field | Type | Required | Description |
|---|---|---|---|
| `urddId` | `number` | Yes | The guest's URDD ID |
| `hotelId` | `number` | Yes | The hotel (tenant) ID |
| `reviewCategoryId` | `number` | Yes | The review category ID |
| `bookingId` | `number` | Yes | The booking ID |
| `rating` | `number` | Yes | Rating value, integer 1--10 |

**Validation:** The `rating` field uses the `isValidRating` validation function which rejects values outside the 1--10 integer range.

**Request example:**

```json
{
  "urddId": 207,
  "hotelId": 3,
  "reviewCategoryId": 1,
  "bookingId": 45,
  "rating": 8
}
```

**Response (200):**

```json
{
  "message": "Rating submitted successfully"
}
```

#### DELETE -- Remove rating

**DELETE** `/api/guest/review/category/ratings`

Soft-delete a rating (sets `status = 'inactive'`).

| Field | Type | Required | Description |
|---|---|---|---|
| `id` | `number` | Yes | The `review_category_rating_id` to delete |

**Response (200):**

```json
{
  "message": "Rating deleted successfully"
}
```

---

## Validation

A new `isValidRating` function was added to `Services/SysFunctions/validateParameters.js`:

```js
async function isValidRating(req, res, value) {
  value = await decryptData(value);
  const num = parseInt(value);
  if (isNaN(num) || num < 1 || num > 10) {
    return { error: "Rating must be between 1 and 10" };
  }
  return true;
}
```

This is referenced in the CRUD parameter schema via `validations: ["isValidRating"]` on the `rating` field.

---

## Source Files

| File | Purpose |
|---|---|
| `data/migrations_completed/20260707_1_review_categories_and_ratings.sql` | Migration + seed |
| `Src/Apis/ProjectSpecificApis/GuestSpecificApis/GuestReviewCategories/GuestReviewCategories.js` | Categories list API object |
| `Src/Apis/ProjectSpecificApis/GuestSpecificApis/GuestReviewCategories/CRUD_parameters.js` | Categories parameter schema |
| `Src/Apis/ProjectSpecificApis/GuestSpecificApis/GuestReviewCategoryRatings/GuestReviewCategoryRatings.js` | Ratings CRUD API object |
| `Src/Apis/ProjectSpecificApis/GuestSpecificApis/GuestReviewCategoryRatings/CRUD_parameters.js` | Ratings parameter schema |
| `Services/SysFunctions/validateParameters.js` | `isValidRating` validation function |

---

## Change Log

| Date | Change |
|---|---|
| 2026-07-07 | Initial creation -- review categories tables, seed, and two APIs |
