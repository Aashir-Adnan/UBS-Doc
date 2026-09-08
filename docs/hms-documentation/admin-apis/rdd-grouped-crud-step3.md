# RDD Wizard — Step 3 (Department, Senior RDD, Title)

```
POST /api/custom-rdd-grouped-crud?step=3            # Add  — finish a new RDD
PUT  /api/custom-rdd-grouped-crud?step=3&id=<rddId> # Update — edit an existing RDD
```

Step 3 is the last **data** step of the RDD wizard (step 4 assigns permission groups). It
resolves the tuple's **department**, and in the same request writes the RDD's **senior RDD**
and **title**.

Encrypted with platform encryption + access token, like every other step.

---

## Request fields

| Field | Type | Notes |
|---|---|---|
| `role_designation_department_id` | number | The RDD from step 1. On Update, `?id=` is used first. |
| `roles_roleId` | number | Threaded from step 1 — re-checked against the live row (409 on drift). |
| `designations_designationId` | number | Threaded from step 2 — same check. |
| `departments_isNewEntry` | boolean | `true` creates a department, `false` selects an existing one. |
| `departments_existingDepartmentId` | number \| `{value,label}` | Required when `isNewEntry` is `false`. |
| `departments_departmentName` | string | Required when `isNewEntry` is `true`. |
| `departments_departmentCode` | string | Optional, **new departments only** — stored as `departments.department_code`. Selecting an existing department never rewrites its code. |
| `rolesDesignationsDepartment_seniorRddId` | number | Optional — the RDD this one reports to. Aliases: `senior_rdd_id`, `seniorRddId`. |
| `rolesDesignationsDepartment_rddTitle` | string | Optional — see [RDD Title](./rdd-title). |
| `actionPerformerURDD` | number | Actor, stamped to `updated_by`. |

### The senior RDD

`senior_rdd_id` follows the same **absent ≠ empty** contract as the title:

| What you send | What happens |
|---|---|
| the key is **absent** | `senior_rdd_id` is **left untouched** |
| a positive integer | validated, then stored |
| `""` or `null` | **explicit clear** — the RDD reports to no one |

A chosen senior is rejected with **400** when it is the RDD itself, when the row does not exist
or is inactive, or when it already reports up to this RDD — assigning it would close a
seniority cycle. See [Seniority Scope](../major-implementations/seniority-scope/seniority-scope).

:::warning Omit to keep
The wizard re-drives step 3 on every edit. Sending `""` for a field you did not mean to touch
clears it; leave the key out instead.
:::

---

## Response

The step reads the RDD back after the write, so the response reports the values **as they now
stand** — including ones the request never sent:

```json
{
  "success": true,
  "role_designation_department_id": 54,
  "roles_roleId": 3,
  "designations_designationId": 12,
  "departments_departmentId": 7,
  "departments_departmentCode": "HK-01",
  "rolesDesignationsDepartment_seniorRddId": 11,
  "rolesDesignationsDepartment_rddTitle": "Front Desk Supervisor"
}
```

- `departments_departmentCode` is the resolved department's stored code — present whether the
  department was just created, picked from the dropdown, or derived by the Service-Manager
  prefill. `null` when the department has no code.
- `rolesDesignationsDepartment_seniorRddId` / `rolesDesignationsDepartment_rddTitle` carry what
  this call wrote, or the value already stored when the call did not touch the field.

The step-1 **View** (`GET /api/custom-rdd-grouped-crud?id=<rddId>`) hydrates the edit form with
the same fields — `departments_departmentCode`, `rolesDesignationsDepartment_seniorRddId` and
`rolesDesignationsDepartment_rddTitle` — so a prefilled form and a step-3 response agree.

---

## Errors

| Code | When |
|---|---|
| 400 | missing `role_designation_department_id`; missing name/id for the chosen `isNewEntry` mode; invalid senior RDD; over-long or non-string title |
| 404 | the target RDD does not exist |
| 409 | a threaded `roles_roleId` / `designations_designationId` no longer matches the live row |

Steps 1–3 are **not** wrapped in a shared transaction: a failure here leaves the rows written by
steps 1 and 2 in place, and the frontend recovers by re-driving step 3 with the same RDD id.
