---
sidebar_position: 1
title: "Booking Rules — Requirements Spec"
description: "Plain-English specification for room and package booking flows, serial/parallel packages, add-ons, and edge cases."
---

# Booking Rules — Plain-English Spec (Two Flows) + Edge Cases

## Context

We're formalizing the rules for booking a **room** or **package** so backend and mobile
behave the same way. There are **two entry flows**: (A) the guest picks a room/package
first and then chooses dates, or (B) the guest enters dates + party size first and then
searches. After an item is chosen, both flows share the same **Add-ons → schedule → pay**
tail. This document is the **target-state** spec written in plain English; an appendix at
the end flags what exists in the app today vs. what is not built yet, so we know the gap.

**Decisions locked with the product owner:**
- **No package extension** — a package's duration (nights) is fixed and cannot be
  extended. Instead, guests book **multiple packages** in serial or parallel to cover
  longer stays or larger parties (see Booking Model below).
- **Factor-based package filtering** — only packages whose duration evenly divides
  the total stay length are shown (e.g. for a 10-night stay: packages of 1, 2, 5, or 10
  nights).
- **Multi-room package capacity** must satisfy a real **per-room distribution**, not just a
  total-capacity sum.
- **Max booking cap** — the total of items x nights in a single booking cannot exceed the
  admin-configured max booking limit. `[BACKEND]` `[FRONTEND]`

---

## Glossary / Shared Concepts

- **Item** = a room or a package.
- **Availability API** (`GET /guest/availability`) — probes a *specific* item for a date
  range; returns `available` + an optional `nextAvailable` window (`availableFrom/To`).
- **Search/Filter API** (`GET /guest/search/filter`) — returns the rooms + packages
  bookable for a date range (and, target-state, a party size).
- **Capacity fields** — room: `minAdults / maxAdults / maxChildren / maxOccupancy`,
  `minNights / maxNights`; package: `maxAdults / maxChildren`, fixed `nights` (duration),
  and (target) its list of included rooms each with their own capacity.
- **Serial booking** — the same package booked back-to-back across consecutive date
  windows to cover a longer stay (e.g. a 2-night package booked 5 times in serial = 10
  nights).
- **Parallel booking** — multiple copies of the same package booked for the same date
  window to cover more people (e.g. a 2-person package booked 3 times in parallel = 6
  people for the same dates).
- **Items needed** — the minimum number of a room or package required to host the full
  party = `ceil(party_size / item_capacity)`. *Example: party of 10, package for 3 people
  → ceil(10/3) = 4 items needed.* `[FRONTEND]`
- **Service nature** — *consumable* (quantity-based) vs *non-consumable* (one-off);
  separately, every service is *schedulable* (assigned to a slot/date).
- **Hotel scoping** — once an item is chosen, add-ons come only from that item's hotel.

---

## Booking Model — Serial & Parallel Packages

### How It Works

Since packages have a **fixed duration** and cannot be extended, longer stays or larger
parties are handled by booking **multiple packages**:

- **Serial**: the same package is booked consecutively. Each instance has its own check-in
  and check-out date, and the check-out of one equals the check-in of the next. Covers
  longer stays.
- **Parallel**: multiple copies of the same package are booked for the **same date window**.
  Covers larger parties that exceed a single package's capacity.
- **Combined**: both serial and parallel in one booking. *Example: a 2-night package for 2
  people, party of 4 staying 6 nights → 2 parallel x 3 serial = 6 package instances.*

### What the Frontend Sends `[BACKEND]` `[FRONTEND]`

The booking request includes an **array of package entries**, each specifying:
- `package_id`
- `check_in_date`
- `check_out_date` (must match the package's fixed duration)
- `quantity` (number of parallel copies for that date window)

*Example for a 2-night package, party of 4, staying 6 nights:*

```json
[
  { "package_id": "pkg_123", "check_in_date": "2026-07-01", "check_out_date": "2026-07-03", "quantity": 2 },
  { "package_id": "pkg_123", "check_in_date": "2026-07-03", "check_out_date": "2026-07-05", "quantity": 2 },
  { "package_id": "pkg_123", "check_in_date": "2026-07-05", "check_out_date": "2026-07-07", "quantity": 2 }
]
```

### Max Booking Cap `[BACKEND]` `[FRONTEND]`

The admin configures a **max booking limit** per service/item (e.g. `max_booking = 10`).
The constraint is: **total items x nights** must not exceed **max_booking**. Both frontend and backend must
enforce this.

*Examples with max_booking = 10:*
- 2 rooms/day x 5 nights = 10 — allowed
- 5 rooms/day x 2 nights = 10 — allowed
- 3 rooms/day x 4 nights = 12 — blocked

### Price Display `[FRONTEND]`

The backend sends the **current price for a single item** only. The frontend applies
multipliers to display the total:
- **Total displayed price** = `items_needed x nights x current_price`

---

## VERSION A — Guest Picks the Room/Package FIRST, Then Dates

> Entry: tapping a room/package card (home feed, detail "Book now"). The wizard opens with
> that item **pinned** and the hotel known.

1. **Land on the wizard with the item pinned.** The app immediately calls the Availability
   API for the pinned item so the date picker can **show/disable the item's unavailable
   dates** before the guest picks. `[FRONTEND]`
2. **Guest selects the stay dates** on the calendar. `[FRONTEND]`
   - For a **room**, the range must respect the room's `minNights`/`maxNights`.
   - For a **package**, the calendar enforces that the selected range is an **exact
     multiple** of the package's fixed duration.
   - Past dates and past times are never selectable.
3. **On "Continue", re-verify the pinned item** for the chosen dates (a fresh Availability
   call — inventory is volatile): `[FRONTEND]`
   - **Available →** advance to the item/selection step with the item still pinned.
   - **Not available, but a `nextAvailable` window exists →** show a notice offering those
     suggested dates, plus an "explore something else" path.
   - **Not available, no window →** unlock the hotel/dates/guests and fall back to an open
     search (this becomes Version B).
4. **Package factor filtering** (only for packages, when chosen nights > package duration):
   `[FRONTEND]`
   - Since there is no extension, the package's duration must be a **factor** of the total
     stay length. If the guest selected 10 nights and the pinned package is 3 nights
     (10 is not divisible by 3), show a clear message: *"This package's {N}-night duration
     doesn't fit your {X}-night stay."* Then **run the Search/Filter API** for the dates
     and **list all other rooms/packages** that do fit.
   - If the package duration **is** a factor of the stay, still **run Search/Filter for the
     dates**, pass the **selected package's id to be excluded** from those results, and
     **manually append the selected package at the top**.
5. **Guest confirms the selection**, then proceeds to **Guest details → Add-ons → Payment →
   Confirmation** (shared tail). `[FRONTEND]`

---

## VERSION B — Guest Sets DATES + PARTY First, Then Searches

> Entry: the guest opens the wizard without a pinned item and enters check-in/out + number
> of persons (adults + children).

1. **Guest enters dates and party size** (adults, children). Past dates/times not allowed;
   stay must be >= 1 night. `[FRONTEND]`
2. **Run Search/Filter** for those dates + party. Results include: `[BACKEND]` `[FRONTEND]`
   - **Rooms** available for the dates. A room may serve a party **larger than its own
     capacity by booking multiple units of the same room**: units needed =
     ceil(party / room capacity). The room qualifies only if **that many units are actually
     available** for the dates. `[BACKEND]` checks inventory; `[FRONTEND]` calculates and
     displays `items_needed x nights x current_price`.
   - **Packages** whose fixed duration is a **factor** of the stay length. `[BACKEND]`
     filters packages by factor match; `[FRONTEND]` displays the multiplied price.
   - **Multi-room packages**: a package may bundle several *different* rooms. It qualifies
     only if the party can be **distributed across its rooms within each room's own
     capacity**. `[BACKEND]`
3. **Guest picks an item** from the results, then proceeds to **Guest details → Add-ons →
   Payment → Confirmation** (shared tail). `[FRONTEND]`

---

## Booking Validation Rules `[BACKEND]`

When the backend receives a booking request (the array of package/room entries):

1. **Duration match**: each entry's `check_out_date - check_in_date` must exactly equal the
   package's fixed duration in nights.
2. **Serial continuity**: for serial entries of the same package, check-out of entry N must
   equal check-in of entry N+1 (no gaps, no overlaps).
3. **Factor match**: the total stay length (first check-in to last check-out) must be
   evenly divisible by the package's duration.
4. **Max booking cap**: `sum(quantity) x package_duration <= max_booking` config value.
   Alternatively for rooms: `quantity x nights <= max_booking`.
5. **Availability**: each entry's quantity of units must be available for the specified
   dates (inventory check).
6. **Capacity**: the total party must fit within `quantity x item_capacity` for each date
   window.

---

## Add-ons Rules (Shared Tail, After Item Is Selected)

1. After selecting the room/package, the guest reaches the **Add-ons** step. `[FRONTEND]`
2. The add-on list is the set of add-on-eligible services **for the selected item's hotel**
   only (not "All Hotels"). `[BACKEND]`
3. **Exclude services already bundled in the selected package** from the purchasable list,
   so the guest can't pay twice for something included. `[BACKEND]`
4. A package's **bundled services are shown as included / complimentary** (display-only — no
   add/remove, no quantity). `[FRONTEND]`

### Service Nature

- **Consumable, manual quantity** — guest sets a quantity (up to any per-booking cap), and
  **each unit is scheduled individually**. `[FRONTEND]`
- **Consumable, auto quantity (per-guest)** — quantity is derived from the **number of
  guests** in the booking, not entered manually. `[FRONTEND]`
- **Non-consumable** — a simple add/remove (one-off). `[FRONTEND]`
- **Every service is schedulable** — assigned to a date/slot regardless of consumable type.

### When Scheduling / Adding Can Happen

- **At booking creation** (in the wizard or immediately after). `[FRONTEND]`
- **From an upcoming booking** (post-creation, before the stay): schedule unscheduled
  services **and** add more services. `[FRONTEND]` `[BACKEND]`
- **During the stay** (after check-in): schedule **and** add more services, for the
  remaining stay dates. `[FRONTEND]` `[BACKEND]`

---

## Edge Cases & Open Questions

### Dates & Availability

- **Partial-range unavailability:** the item is free for some nights of the chosen range but
  not all → treat the whole range as unavailable and surface `nextAvailable`. `[BACKEND]`
- **`nextAvailable` window too short:** the suggested window is shorter than the required
  nights → don't auto-apply it; offer it only if it actually fits. `[FRONTEND]`
- **Sell-out mid-session (race):** item available at landing but gone by "Continue" or at
  final confirm → re-verify at confirm and block with a clear message + re-search.
  `[FRONTEND]` `[BACKEND]`
- **Time zone:** all dates are **hotel-local**; the device's locale/timezone must not shift
  the booked nights. `[FRONTEND]`
- **Zero-night / same-day check-in-and-out** is invalid. `[FRONTEND]` `[BACKEND]`

### Package Duration & Factor Filtering

- **Non-factor duration:** guest wants 10 nights but pinned package is 3 nights (not a
  factor of 10) → package is ineligible; show message and offer alternatives. `[FRONTEND]`
- **Prime-number stays:** a 7-night stay only matches packages of 1 or 7 nights — narrow
  results are expected. `[FRONTEND]`
- **Mixed package combinations:** only same-package serial/parallel is supported in a single
  booking line. Different packages cannot be mixed within one booking. `[FRONTEND]`
  `[BACKEND]`

### Capacity / Party

- **Over capacity:** party exceeds a room's `maxOccupancy`, or a multi-room package's
  per-room distribution can't seat everyone → exclude from results / block selection.
  `[BACKEND]`
- **Multi-unit same room:** one room type covers a big party via N copies
  (N = ceil(party / capacity)), all sharing one category and price; the search must confirm
  **N units are in inventory** for the dates. `[BACKEND]`
- **Items needed calculation:** `ceil(party_size / item_capacity)`. `[FRONTEND]` `[BACKEND]`
- **`minAdults` not met / children-only:** enforce room minimums. *(open)* `[BACKEND]`
- **Distribution ambiguity:** when several valid room distributions exist (2+2+1 vs 2+1+2),
  is the guest asked to assign people to rooms, or is it automatic? *(open)* `[FRONTEND]`

### Max Booking Cap

- **Cap enforcement:** total `items x nights` must not exceed `max_booking`, validated on both
  frontend and backend. `[FRONTEND]` `[BACKEND]`
- **Cap feedback:** frontend should show remaining capacity as the guest adjusts.
  `[FRONTEND]`
- **Cap per item vs global:** clarify whether `max_booking` is per item type or global.
  *(open)* `[BACKEND]`

### Add-ons & Scheduling

- **Bundle vs paid variant:** a service can be both bundled and sold as a paid add-on under
  a different tier — exclusion must be precise. *(open)* `[BACKEND]`
- **Per-guest service when party changes:** breakfast quantity is guest-count-derived — if
  the guest count changes, the quantity must recompute. `[FRONTEND]`
- **Slot conflicts:** scheduling N units into fewer available slots → validate against live
  slot availability. `[BACKEND]`
- **Adding during stay:** services added after check-in can only be scheduled for
  **remaining stay dates**. `[FRONTEND]` `[BACKEND]`
- **Removing services:** bundled package services can't be removed; only guest-added ones
  can. `[FRONTEND]` `[BACKEND]`
- **Cancellation interaction:** cancelling a booking and its scheduled add-on slots.
  *(open)* `[BACKEND]`

### Cross-Cutting

- **Currency:** an item and its hotel's add-ons should share a currency. `[BACKEND]`
- **KYC gate:** the booking summary is gated to verified users. `[BACKEND]`
- **Idempotency:** double-submit of the create-booking call must be de-duplicated.
  `[BACKEND]`
