---
sidebar_position: 1
title: Tenant Seed Data Requirements
---

# Tenant Seed Data Requirements

Complete audit of every guest API's data needs, traced to source tables. This document defines what the tenant seed script (`Services/SysScripts/seedTenant.js`) must create for every guest API to return fully populated, non-null responses.

## Seed Script Usage

```bash
node Services/SysScripts/seedTenant.js "Hotel Name" "admin@email.com"
```

The script provisions a fully operational hotel tenant in 8 phases:

| Phase | What it Creates |
|-------|----------------|
| 1 | Tenant + RBAC scaffold (roles, persona groups, guest RDD) |
| 2 | 9 service categories + ~168 config keys (cloned from global) |
| 3 | 12 services with full `hms_config` value rows + delivery units + `unit_availability` |
| 4 | 3 packages with full `hms_config` + `package_services` links |
| 5 | Category amenity tags (hierarchical keyword chips) |
| 6 | Pricing policies (full prepay + 50% deposit) |
| 7 | Promo codes (WELCOME10, FLAT50) |
| 8 | 10 FAQs, 4 CMS pages, payment provider, admin permissions |

---

## Master Table: What Must Be Seeded Per Tenant

### Tier 1: Core Entity Tables

Required by nearly all guest APIs.

| Table | Key Columns to Populate | Used By |
|-------|------------------------|---------|
| `tenants` | tenant_name, tenant_code, tenant_slug, tenant_type='hotel', address, city, country, latitude, longitude, tenant_logo, tenant_currency_id, is_active=1, status='active' | GuestHotels, all tenant-scoped APIs |
| `services` | service_name, service_code, description, short_description, category_id, tenant_id, status='active' | GuestServices, GuestHotelServices, GuestLanding, GuestAvailability, GuestScheduler, GuestBookings, GuestFavorites |
| `service_categories` | category_name, category_code, slug, label, icon, sort_order, is_global, tenant_id, status='active' | GuestServiceCategories, GuestServices, GuestScheduler, GuestFilterOptions |
| `packages` | package_name, package_code, package_type='predefined', description, tenant_id, status='active' | GuestPackages, GuestLanding, GuestAvailability, GuestBookingsPackage, GuestFavorites, GuestLoyalty |
| `package_services` | package_id, service_id, quantity, is_consumable, is_mandatory, consumption_limit, price_override, display_order | GuestPackages (nested services), GuestAvailability, GuestBookingsPackage |
| `currencies` | currency_code, currency_name, exchange_rate, status='active' | All pricing APIs |

### Tier 2: Location and Delivery Infrastructure

| Table | Key Columns to Populate | Used By |
|-------|------------------------|---------|
| `location_type` | type, description, status='active' | Locations parent ref |
| `locations` | location_type_id, name, code, parent_id, status='active', created_by | GuestScheduler (location nodes in tree) |
| `service_locations` | service_id, location_id, status='active', created_by | GuestScheduler, GuestServicesAvailability, GuestAvailability |
| `delivery_units` | category_id, location_id, identifier, label, unit_type, capacity, current_status='available', status='active' | GuestAvailability (room availability), GuestScheduler (slot computation), GuestBookingsRoom |
| `unit_availability` | unit_id, location_id, day_of_week, time_start, time_end, slot_duration_min, max_concurrent, is_available=1 | GuestScheduler (time slots), GuestServicesAvailability |

### Tier 3: hms_config System

Almost every guest-facing response field comes from `hms_config` + `hms_config_keys`. Config keys are cloned at the key-definition level during tenant provisioning, but **per-service and per-package value rows must be explicitly created** by the seed script.

#### Config Keys Needed Per Service (`base_table='services'`)

| config_key | Purpose | Response Field |
|------------|---------|---------------|
| `base_price` | Service price | `base_price`, `current_price` |
| `base_currency` | Currency code or ID | `currency` |
| `media` | Attachment IDs (JSON array) | `images` |
| `duration` | Service duration number | `duration` |
| `duration_unit` | Unit type (night/session/meal/ride/visit) | `duration_units` |
| `is_featured` | Featured flag | `is_featured` |
| `visibility` | Published state (default: visible if absent) | Controls visibility in listings |
| `keyword_tags` | Tags (MULTI-VALUE: one row per tag) | `additional_attributes.tags` |
| `physical_dimension` | L/W/H dimensions | `additional_attributes.physical_dimension` |
| `cancellation_margin` | Cancellation policy (bilingual JSON) | `cancellation_info.margin` |
| `cancellation_exceptions` | Policy exceptions (bilingual JSON) | `cancellation_info.exceptions` |
| `terms_and_conditions` | T&C text (bilingual JSON) | `termsAndConditions` |
| `max_adults` | Maximum adult guests | `maxAdults` |
| `max_children` | Maximum child guests | `maxChildren` |
| `advance_booking_min_days` | Minimum days ahead for booking | GuestServicesAvailability guard |
| `advance_booking_max_days` | Maximum days ahead for booking | GuestServicesAvailability guard |
| `blackout_dates` | Blocked date ranges (JSON array) | GuestServicesAvailability guard |
| `lead_time_hours` | Lead time before slot (hours) | GuestServicesAvailability |
| `cutoff_time` | Daily cutoff (HH:MM) | GuestServicesAvailability |
| `gender_restricted_windows` | Gender constraints (JSON array) | GuestScheduler slot tags |

#### Config Keys Needed Per Package (`base_table='packages'`)

| config_key | Purpose | Response Field |
|------------|---------|---------------|
| `base_price` | Package price | `base_price` |
| `base_currency` | Currency | `currency` |
| `media` | Images (attachment IDs) | `images` |
| `duration` | Trip length | `nights` |
| `duration_unit` | Unit (nights) | `duration_units` |
| `keyword_tags` | Tags (MULTI-VALUE) | `additional_attributes.tags` |
| `is_featured` | Featured flag | `is_featured` |
| `cancellation_margin` | Policy (bilingual JSON) | `cancellation_info.margin` |
| `cancellation_exceptions` | Exceptions (bilingual JSON) | `cancellation_info.exceptions` |
| `terms_and_conditions` | T&C (bilingual JSON) | `termsAndConditions` |
| `max_adults` | Capacity | `maxAdults` |
| `max_children` | Capacity | `maxChildren` |
| `weekday_arrival_restriction` | Allowed check-in days | `allowedCheckInDays` |

#### Config Keys Needed Per Category (`base_table='service_categories'`)

| config_key | Purpose | Response Field |
|------------|---------|---------------|
| `duration_unit` | Default unit for category | `GuestServiceCategories.unit` |
| `keyword_tags` | Amenity chips (hierarchical: `is_category=1` headers + `is_category=0` chips) | `GuestServiceCategories.amenities`, `GuestServiceTags` |

### Tier 4: Translations

| Table | Key Columns | Used By |
|-------|-------------|---------|
| `translated_entries` | table_name, column_name, record_id, language_code_id, translated_text | Arabic translations for service_name, description, package_name |
| `language_codes` | language_code ('ar', 'en'), language_code_id | Translation lookups |

### Tier 5: Pricing

| Table | Key Columns | Used By |
|-------|-------------|---------|
| `pricing_rules` | tenant_id, delta (+/-), value, type (percentage/flat), condition (JSON with from/to dates), rule_type | GuestLanding, GuestServices, GuestPackages, GuestSearchFilter |
| `guest_pricing_policies` | tenant_id, policy_key, kind (deposit/full), deposit_percent, balance_due_rule, applies_to (JSON), label_json, description_json, is_default, sort_order | GuestPricingPolicies |

### Tier 6: Filter/Discovery Support

| Table | Key Columns | Used By |
|-------|-------------|---------|
| `location_attributes` | possible_values (JSON with view types) | GuestFilterOptions.viewTypes |
| `service_location_attributes` | service_id, attribute linkage | GuestFilterOptions.viewTypes counts |

### Tier 7: Content and Support

| Table | Key Columns | Used By |
|-------|-------------|---------|
| `guest_support_faqs` | tenant_id, category, question_json, answer_json, sort_order | GuestSupportFaqs |
| `guest_cms_pages` | tenant_id, hotel_id, slug, locale, sections_json, updated_at | GuestPages |
| `guest_promo_codes` | tenant_id, code, discount_type, discount_value, valid_from, valid_to | GuestQuote (promo validation) |
| `payment_providers` | provider_name='moyasar' | GuestPaymentsInitiate |

### Tier 8: Form Schema

| Table | Key Columns | Used By |
|-------|-------------|---------|
| `hms_config_keys` | config_key, config_name, value_type, is_required, applies_to, possible_values, category_id=12 | GuestServices.formSchema |
| `hms_config_possible_values` | config_id, config_value_num, config_possible_value | GuestServices.formSchema dropdown options |

---

## Tables That Are Runtime-Only (Do NOT Seed)

These tables are populated by user actions at runtime:

| Table | Created By |
|-------|-----------|
| `bookings` | GuestBookingsRoom/Package/Service |
| `booking_items` | Booking creation |
| `booking_services` | Booking creation + addon APIs |
| `booking_service_slots` | Booking slot scheduling |
| `booking_checkin_details` | GuestBookingCheckin |
| `guest_booking_folio_items` | Admin/system |
| `guest_favorites` | GuestFavorites APIs |
| `guest_profiles` | Auto-created on first booking |
| `guest_booking_history` | System on booking completion |
| `guest_support_tickets` | GuestSupportContact |
| `guest_notifications` | System notifications engine |
| `guest_notification_settings` | Auto-created on first access |
| `guest_assistant_threads` | GuestAssistantMessages |
| `guest_assistant_messages` | GuestAssistantMessages |
| `guest_quotes` | GuestQuote |
| `guest_qr_tokens` | GuestQrIssue |
| `transactions` | GuestPaymentsInitiate |
| `feedback` | Guest reviews (rating/reviews in responses) |
| `viewing` | View count tracking |
| `device_otp` | OTP system |
| `user_devices` | Auth flow |
| `guest_passport_documents` | GuestKyc |
| `dynamic_attachments` | GuestKyc |
| `attachments` | File uploads |

---

## Seed Script Data Summary

The `seedTenant.js` script creates the following for each tenant:

### Services (12 total)

| Category | Services | Delivery Units | Availability |
|----------|----------|---------------|-------------|
| STAY | Deluxe Room (SAR 500), Executive Suite (SAR 1200) | 5 rooms + 3 suites | 7 days, 14:00-22:00 |
| DINE | Breakfast Buffet (SAR 150), Dinner Set Menu (SAR 250) | 1 station each | 7 days, 09:00-21:00 |
| SPA | Full Body Massage (SAR 350), Facial Treatment (SAR 200) | 1 station each | 7 days, 09:00-21:00 |
| BARB | Haircut and Styling (SAR 120) | 1 station | 7 days, 09:00-21:00 |
| GYM | Gym Day Pass (SAR 80) | 1 station | 7 days, 09:00-21:00 |
| KIDS | Kids Club Session (SAR 100) | 1 station | 7 days, 09:00-21:00 |
| TRANS | Airport Transfer (SAR 200) | 1 station | 7 days, 09:00-21:00 |
| NET | Business Center Access (SAR 50) | 1 station | 7 days, 09:00-21:00 |
| RMSVC | In-Room Dining (SAR 100) | 1 station | 7 days, 09:00-21:00 |

Each service includes: `base_price`, `base_currency`, `media` (attachment IDs), `duration`, `duration_unit`, `is_featured`, `keyword_tags`, `max_adults`, `max_children`, `cancellation_margin`, `cancellation_exceptions`, `terms_and_conditions`, `advance_booking_min_days`, `advance_booking_max_days`, `blackout_dates`, `lead_time_hours`, `cutoff_time`.

### Packages (3 total)

| Package | Price | Duration | Included Services |
|---------|-------|----------|------------------|
| Romantic Getaway | SAR 2500 | 2 nights | Deluxe Room + Full Body Massage + 2x Dinner |
| Family Fun Package | SAR 1800 | 3 nights | Deluxe Room + 2x Kids Club + 3x Breakfast |
| Wellness Retreat | SAR 2000 | 2 nights | Executive Suite + 2x Massage + Facial + 3x Gym |

Each package includes: `base_price`, `base_currency`, `media`, `duration`, `duration_units`, `max_adults`, `max_children`, `is_featured`, `keyword_tags`, `cancellation_margin`, `cancellation_exceptions`, `terms_and_conditions`.

### Content

| Type | Count | Details |
|------|-------|---------|
| Support FAQs | 10 | Categories: booking (3), payment (2), service (2), kyc (1), other (2) |
| CMS Pages | 4 | about + terms, each in en and ar |
| Promo Codes | 2 | WELCOME10 (10% off), FLAT50 (SAR 50 off) |
| Pricing Policies | 2 | Full prepayment (default), 50% deposit |
| Category Amenity Tags | 3 groups | STAY (Room Features + Amenities), SPA (Treatment Type), DINE (Cuisine) |
| Arabic Translations | 30 | All service names, descriptions, package names, descriptions |

---

## Config Value Storage Format

Values in `hms_config` use `is_input=1` with JSON `{"en":"value","ar":"value"}` format:

```sql
INSERT INTO hms_config
  (base_table, record_id, catalog_id, config_key_id, config_value, is_input, status, created_by)
VALUES
  ('services', <service_id>, 1, <key_id>, '{"en":"500","ar":"500"}', 1, 'active', <urdd_b_prime>);
```

Multi-value keys like `keyword_tags` use **one row per value**:

```sql
-- Tag 1
INSERT INTO hms_config ... VALUES ('services', <id>, 1, <key_id>, '{"en":"city-view","ar":"city-view","key":"city-view"}', 1, 'active', <urdd>);
-- Tag 2
INSERT INTO hms_config ... VALUES ('services', <id>, 1, <key_id>, '{"en":"king-bed","ar":"king-bed","key":"king-bed"}', 1, 'active', <urdd>);
```

Category amenity chips use hierarchical `is_category` flags:

```sql
-- Header (is_category=1)
INSERT INTO hms_config ... VALUES ('service_categories', <cat_id>, 1, <key_id>,
  '{"en":"Room Features","ar":"...","key":"room-features","is_category":1}', 1, 'active', <urdd>);
-- Chip (is_category=0, category_id = header's hms_config.id)
INSERT INTO hms_config ... VALUES ('service_categories', <cat_id>, 1, <key_id>,
  '{"en":"City View","ar":"...","key":"city-view","is_category":0,"category_id":<header_id>}', 1, 'active', <urdd>);
```
