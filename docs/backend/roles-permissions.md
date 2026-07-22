# Roles, Designations & Permission Groups

## Overview

The framework implements a layered Role-Based Access Control (RBAC) system. Users are not assigned roles directly — instead, they are assigned to a **composite** of Role + Designation + Department (called **RDD**), and permissions flow through **Permission Groups** linked to that composite.

---

## Database Tables

### Core Entity Tables

#### `roles`

| Column | Type | Notes |
|--------|------|-------|
| `role_id` | INT, PK, AUTO_INCREMENT | |
| `role_name` | VARCHAR(255), UNIQUE | |
| `senior_role_id` | INT, FK → `roles` | Self-referencing hierarchy |
| `status` | ENUM('active','inactive') | |
| `created_by` / `updated_by` | INT, FK → `URDD` | Audit trail |
| `created_at` / `updated_at` | DATETIME | |

#### `designations`

| Column | Type | Notes |
|--------|------|-------|
| `designation_id` | INT, PK, AUTO_INCREMENT | |
| `designation_name` | VARCHAR(255), UNIQUE | |
| `senior_designation_id` | INT, FK → `designations` | Self-referencing hierarchy |
| `status` | ENUM('active','inactive') | |
| `created_by` / `updated_by` | INT, FK → `URDD` | |
| `created_at` / `updated_at` | DATETIME | |

#### `departments`

| Column | Type | Notes |
|--------|------|-------|
| `department_id` | INT, PK, AUTO_INCREMENT | |
| `department_name` | VARCHAR(255), UNIQUE | |
| `status` | ENUM('active','inactive') | |
| `created_by` / `updated_by` | INT, FK → `URDD` | |
| `created_at` / `updated_at` | DATETIME | |

#### `permissions`

| Column | Type | Notes |
|--------|------|-------|
| `permission_id` | INT, PK, AUTO_INCREMENT | |
| `permission_name` | VARCHAR(255), UNIQUE | e.g. `view_students`, `insert_courses` |
| `permission_type` | LONGTEXT | |
| `status` | ENUM('active','inactive') | |

---

### Composite / Junction Tables

#### `roles_designations_department` (RDD)

Links a role, designation, and department into a single assignable unit.

| Column | Type | Notes |
|--------|------|-------|
| `role_designation_department_id` | INT, PK | |
| `role_id` | INT, FK → `roles` | |
| `designation_id` | INT, FK → `designations` | |
| `department_id` | INT, FK → `departments` | |
| `status` | ENUM('active','inactive') | |
| | UNIQUE KEY | `(designation_id, role_id, department_id)` |

#### `permission_groups`

A named bundle of permissions, optionally scoped to a role and/or designation.

| Column | Type | Notes |
|--------|------|-------|
| `permission_group_id` | INT, PK | |
| `group_name` | VARCHAR(255), UNIQUE | |
| `role_id` | INT, FK → `roles` | Optional — scopes group to a role |
| `designation_id` | INT, FK → `designations` | Optional — scopes group to a designation |
| `status` | ENUM('active','inactive') | |

#### `permission_groups_permissions`

Junction between permission groups and individual permissions.

| Column | Type | Notes |
|--------|------|-------|
| `permission_group_permission_id` | INT, PK | |
| `group_id` | INT, FK → `permission_groups` | |
| `permission_id` | INT, FK → `permissions` | |
| `status` | ENUM('active','inactive') | |
| | UNIQUE KEY | `(group_id, permission_id)` |

#### `user_roles_designations_department` (URDD)

Assigns a user to an RDD combo. This is the central record that ties a user into the RBAC system.

| Column | Type | Notes |
|--------|------|-------|
| `user_role_designation_department_id` | INT, PK | Often referred to as `urdd_id` |
| `role_designation_department_id` | INT, FK → `RDD` | |
| `user_id` | INT, FK → `users` | |
| `senior_urdd_id` | INT, FK → `URDD` | Hierarchical reporting |
| `semester_id` | INT, FK → `qf_semester` | Educational context (optional) |
| `semester_start_date` / `semester_end_date` | DATE | |
| `enrollment_status` | ENUM('enrolled','pass','fail','not_enrolled') | |
| `repeat_count` | INT, DEFAULT 0 | |
| `start_date` / `end_date` | DATETIME | |
| `status` | ENUM('active','inactive') | |

#### `user_role_designation_permissions` (URDP)

Grants individual permissions to a specific URDD record, with optional resource-level include/exclude filters.

| Column | Type | Notes |
|--------|------|-------|
| `user_role_designation_permission_id` | INT, PK | |
| `user_role_designation_department_id` | INT, FK → `URDD` | |
| `permission_id` | INT, FK → `permissions` | |
| `excluded_id` | VARCHAR(500) | JSON — resource IDs the user **cannot** access |
| `included_id` | VARCHAR(500) | JSON — resource IDs the user **can** access |
| `status` | ENUM('active','inactive') | |
| | UNIQUE KEY | `(user_role_designation_department_id, permission_id)` |

---

## Entity Relationship Diagram

```
┌──────────┐    ┌───────────────┐    ┌──────────────┐
│  roles   │    │ designations  │    │ departments  │
│          │    │               │    │              │
│ senior_  │◄───┤ senior_       │    │              │
│ role_id  │    │ designation_id│    │              │
└────┬─────┘    └──────┬────────┘    └──────┬───────┘
     │                 │                    │
     └────────┬────────┘────────────────────┘
              │
              ▼
┌──────────────────────────────────┐
│ roles_designations_department    │
│ (RDD)                            │
│                                  │
│ role_id + designation_id +       │
│ department_id  (UNIQUE)          │
└──────────────┬───────────────────┘
               │
               ▼
┌──────────────────────────────────────────┐
│ user_roles_designations_department       │
│ (URDD)                                   │
│                                          │
│ user_id + rdd_id                         │
│ senior_urdd_id (hierarchy)               │
└──────────────┬───────────────────────────┘
               │
               ▼
┌──────────────────────────────────────────┐       ┌──────────────┐
│ user_role_designation_permissions        │──────►│ permissions  │
│ (URDP)                                   │       │              │
│                                          │       └──────┬───────┘
│ included_id / excluded_id (JSON)         │              │
└──────────────────────────────────────────┘              │
                                                          │
┌────────────────────┐    ┌─────────────────────────┐     │
│ permission_groups  │───►│ permission_groups_       │─────┘
│                    │    │ permissions              │
│ role_id (optional) │    │                         │
│ designation_id     │    │ group_id + permission_id │
│ (optional)         │    │ (UNIQUE)                 │
└────────────────────┘    └─────────────────────────┘
```

---

## How It All Flows

### 1. Setting Up Roles, Designations & Departments (CustomRddCrud)

This is a 3-step process handled by preprocessing functions:

**Step 1** — `step1_add_role_and_permission_group.js`
- Create or select an existing **Role**
- Optionally set a `senior_role_id` for hierarchy
- Link a **Permission Group** to the role

**Step 2** — `step2_add_designation_and_maybe_permission_group.js`
- Create or select an existing **Designation**
- Optionally set a `senior_designation_id` for hierarchy
- Optionally link a **Permission Group** to the designation

**Step 3** — `step3_add_department_and_rdd.js`
- Create or select a **Department**
- Create the **RDD** record (the unique combo of role + designation + department)

### 2. Assigning a User (CustomUsersGroupedCrud)

Handled by `step2_add_urdd_and_urdp.js`:

1. A **URDD** record is created — linking the user to an RDD combo
2. The system resolves which Permission Group to use (from the role or designation)
3. All permissions from that Permission Group are fetched
4. Individual **URDP** records are created for each permission, granting them to the user's URDD
5. Optional `included_id` / `excluded_id` filters can be set per permission

### 3. Runtime Permission Checking

The middleware pipeline in `Services/Middlewares/config.js` runs in this order:

```
PreProcessing → Processing → PostProcessing
```

Within **Processing**, the `permissionHandler` stage calls `permissionChecker.js`:

1. Extract the user's `actionPerformerURDD` (their active URDD ID) from the request
2. Look up the API's required permission from `requestMetaData.permission`
3. Query the chain: **URDD → URDP → Permission** to verify the user holds the required permission
4. If the permission exists, attach `included_id` / `excluded_id` filters to the request for downstream use
5. Resolve subordinates via the designation hierarchy (`senior_designation_id`) and attach `created_by` metadata
6. If the permission check fails → **403 Forbidden** (error code `E31`)

```sql
-- Core permission check query
SELECT p.permission_name
FROM user_roles_designations_department urdd
JOIN user_role_designation_permissions urdp
  ON urdd.user_role_designation_department_id = urdp.user_role_designation_department_id
JOIN permissions p
  ON urdp.permission_id = p.permission_id
WHERE urdd.user_role_designation_department_id = ?
  AND p.permission_name = ?
```

---

## Granular Access Control (Include / Exclude IDs)

Each URDP record can carry JSON-encoded resource filters:

```json
// included_id — user can ONLY access these
{
  "department_id": [1, 2, 3],
  "course_id": [5, 6]
}

// excluded_id — user can access everything EXCEPT these
{
  "student_ids": [10, 11, 12]
}
```

The permission checker parses these and attaches them to the request so that downstream queries can filter results accordingly.

---

## Hierarchy & Subordinate Resolution

Both roles and designations support self-referencing hierarchies:

- `roles.senior_role_id` → parent role
- `designations.senior_designation_id` → parent designation
- `URDD.senior_urdd_id` → reporting superior

The permission checker uses the designation hierarchy to resolve subordinates:

```sql
SELECT DISTINCT urdd.user_role_designation_department_id
FROM user_roles_designations_department urdd
JOIN roles_designations_department rdd
  ON urdd.role_designation_department_id = rdd.role_designation_department_id
JOIN designations d
  ON rdd.designation_id = d.designation_id
WHERE d.senior_designation_id = ?
```

This populates `meta.created_by` — a list of subordinate URDD IDs — enabling scoped data visibility (e.g., a manager only sees records created by their direct reports).

---

## Key Files

| File | Purpose |
|------|---------|
| `Services/Middlewares/PermissionCheck/permissionChecker.js` | Core runtime permission validation |
| `Services/Middlewares/config.js` | Middleware pipeline — where `permissionHandler` runs |
| `Src/HelperFunctions/PreProcessingFunctions/CustomRddCrud/step1_add_role_and_permission_group.js` | Create role + link permission group |
| `Src/HelperFunctions/PreProcessingFunctions/CustomRddCrud/step2_add_designation_and_maybe_permission_group.js` | Create designation + optional permission group |
| `Src/HelperFunctions/PreProcessingFunctions/CustomRddCrud/step3_add_department_and_rdd.js` | Create department + RDD record |
| `Src/HelperFunctions/PreProcessingFunctions/CustomUsersGroupedCrud/step2_add_urdd_and_urdp.js` | Assign user to RDD + grant permissions |

---

## Audit Trail

Every table records:
- `created_by` / `updated_by` — the URDD ID of the actor (not user ID)
- `created_at` / `updated_at` — timestamps

Using URDD IDs for audit means the system tracks **which role-context** the actor was operating under, not just who they are.
