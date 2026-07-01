# Plan Groups CRUD

| Operation | Method | Path | Permission |
|---|---|---|---|
| List | **GET** | `/api/custom/plan/groups/crud` | — |
| View | **GET** | `/api/custom/plan/groups/crud?id=<id>` | — |
| Add | **POST** | `/api/custom/plan/groups/crud` | — |
| Update | **PUT** | `/api/custom/plan/groups/crud?id=<id>` | — |
| Delete | **DELETE** | `/api/custom/plan/groups/crud?id=<id>` | — |

A **grouped (multi-step) CRUD** that manages a `plans` row (**step 1**) and its linked `plan_groups` row (**step 2**) in one request. A plan is a purchasable subscription/service bundle (name, duration, AI credits, price, region, flags); a plan group binds that plan to a `permission_group_id`. Maintained by a **Tenant Admin** / **SaaS Admin**.

> **Base path** is inferred from the object name `global.CustomPlanGroupsCrud_object`. The resource is the `plans` + `plan_groups` pair; the CRUD verbs below apply regardless of the exact mount path.

---

## Authentication & Authorization

No explicit RBAC permission is declared on either step — `requestMetaData.permission` is `null` for both steps. Access is governed by the platform/transport layer. However, **cross-tenant writes are blocked** at the row level (see Behavior → tenant ownership guard).

| Operation | Method | Permission |
|---|---|---|
| Add | POST | none (`null`) |
| View | GET (`?id=`) | none (`null`) |
| Update | PUT | none (`null`) — plus tenant-ownership guard |
| Delete | DELETE | none (`null`) — plus tenant-ownership guard |
| List | GET | none (`null`) |

---

## Request Payload

The payload carries both a `plans` section and a `planGroups` section. Each section has an `addNew*` toggle: when `true` a new row is inserted from its fields; when `false` the referenced existing id is reused (and for plan groups, re-linked to the step-1 plan).

### Step 1 — Plan fields

| Field | Type | Required | Description |
|---|---|---|---|
| `id` (`plans_id`) | number | No | Plan id via `?id=` (query) for View / Update / Delete. |
| `plans_addNewPlan` | checkbox | No | `true` → insert a new plan; `false` → use `plans_selectPlanId`. |
| `plans_selectPlanId` | select | Conditional | Existing plan id to reuse when `plans_addNewPlan` is `false`. |
| `plans_tenantId` | number | No | Owning tenant of the plan. |
| `plans_name` | string | No | Plan name (translated to `language_code` when supplied). |
| `plans_durationType` | select | Conditional | Duration type. Required when creating a new plan. |
| `plans_aiCreditsAmount` | number | No | AI credits granted by the plan. |
| `plans_currencyId` | number | No | Currency reference. |
| `plans_services` | string | No | Services payload for the plan. |
| `plans_price` | string | No | Plan price. |
| `plans_region` | string | No | Region scope. |
| `plans_isActive` | checkbox | No | Active flag. |
| `plans_isPublic` | checkbox | No | Public visibility flag. |
| `plans_isAutoRenewable` | checkbox | No | Auto-renew flag. |
| `plans_planConfig` | string | No | Free-form plan configuration. |
| `actionPerformerURDD` | number | No | Acting user's URDD (`created_by`/`updated_by`). |
| `language_code` | string | No | Language code (query) for plan-name translation. |

### Step 2 — Plan Group fields

| Field | Type | Required | Description |
|---|---|---|---|
| `id` (`planGroups_id`) | number | No | Plan group id via `?id=` (query) for View / Update / Delete. |
| `planGroups_addNewPlanGroup` | checkbox | No | `true` → insert a new plan group; `false` → reuse & re-link `planGroups_selectPlanGroupId`. |
| `planGroups_selectPlanGroupId` | select | Conditional | Existing plan group id when `addNewPlanGroup` is `false`. |
| `planGroups_planId` | number | Conditional | Plan to link (defaults to step-1 plan id when omitted). |
| `planGroups_permissionGroupId` | number | Conditional | Permission group to bind. Required when creating a new plan group. |
| `actionPerformerURDD` | number | No | Acting user's URDD. |

### Example — Add (POST) — new plan + new plan group

```json
{
  "plans_addNewPlan": true,
  "plans_tenantId": 3,
  "plans_name": "Gold Membership",
  "plans_durationType": "monthly",
  "plans_aiCreditsAmount": 100,
  "plans_currencyId": 1,
  "plans_price": "49.99",
  "plans_isActive": true,
  "plans_isPublic": true,
  "planGroups_addNewPlanGroup": true,
  "planGroups_permissionGroupId": 9,
  "actionPerformerURDD": 42
}
```

---

## Response

Add/Update return a summary of the ids produced by both steps. View/List return the requested rows for the step being queried (`plans` for step 1, `plan_groups` for step 2), with `table_count` on List (page size 10).

```json
{
  "success": true,
  "plans_planId": 18,
  "planGroups_planGroupId": 25
}
```

Representative List (plans) row:

```json
{
  "id": 18,
  "plans_planId": 18,
  "plans_tenantId": 3,
  "plans_name": "Gold Membership",
  "plans_durationType": "monthly",
  "plans_aiCreditsAmount": 100,
  "plans_currencyId": 1,
  "plans_price": "49.99",
  "plans_region": null,
  "plans_isActive": 1,
  "plans_isPublic": 1,
  "plans_isAutoRenewable": 0,
  "plans_status": "active"
}
```

---

## Behavior

- **Two-step orchestration.** Step 1 resolves a `plan_id` (insert or reuse); step 2 resolves a `plan_group_id` bound to that plan and a `permission_group_id`. For Add/Update the SQL `queryPayload` returns `null` — all write logic lives in the step pre-process helpers, and the post-processor returns `{ success, plans_planId, planGroups_planGroupId }`.
- **`addNew` toggles.**
  - Step 1: `plans_addNewPlan = false` requires `plans_selectPlanId` and reuses it untouched; `= true` requires `plans_durationType` and inserts a new plan (optional columns are included only when present).
  - Step 2: `planGroups_addNewPlanGroup = false` requires `planGroups_selectPlanGroupId` and **re-links** that existing group to the step-1 plan (updating `plan_id` and, if given, `permission_group_id`); `= true` requires `planGroups_permissionGroupId` and inserts a new group.
- **Tenant ownership guard.** On **Update** and **Delete**, `makeTenantOwnershipPreProcess` runs first for each step (`plans` / `plan_groups`) and aborts with `TENANT_MISMATCH` if the target row's `created_by` URDD belongs to a different tenant than the requester (`decryptedPayload.tenant_id`) — preventing cross-tenant edits/deletes.
- **Plan-name translation.** When `language_code` is supplied on Add, the plan name is also written to `translated_entries` (the `language_codes` row is created if missing).
- **Soft delete.** Delete sets `status = 'inactive'` on the plan (step 1) and the plan group (step 2); List filters out inactive rows.

---

## Source Files

| File | Purpose |
|---|---|
| `Src/Apis/ProjectSpecificApis/CustomPlanGroupsCrud/CustomPlanGroupsCrud.js` | API object (`global.CustomPlanGroupsCrud_object`) — 2-step CRUD, View/List SQL, post-processors, tenant guards |
| `Src/Apis/ProjectSpecificApis/CustomPlanGroupsCrud/CRUD_parameters.js` | Request parameter schema (plans + planGroups sections) |
| `Src/HelperFunctions/PreProcessingFunctions/CustomPlansGroupedCrud/step1_add_plan.js` | Step 1 Add — insert/reuse plan, plan-name translation |
| `Src/HelperFunctions/PreProcessingFunctions/CustomPlansGroupedCrud/step1_update_plan.js` | Step 1 Update — update the plan row |
| `Src/HelperFunctions/PreProcessingFunctions/CustomPlansGroupedCrud/step2_add_plan_group.js` | Step 2 Add — insert/reuse & re-link plan group |
| `Src/HelperFunctions/PreProcessingFunctions/CustomPlansGroupedCrud/step2_update_plan_group.js` | Step 2 Update — update the plan group row |
| `Src/HelperFunctions/PreProcessingFunctions/tenantOwnership.js` | `makeTenantOwnershipPreProcess` — blocks cross-tenant Update/Delete (`TENANT_MISMATCH`) |
