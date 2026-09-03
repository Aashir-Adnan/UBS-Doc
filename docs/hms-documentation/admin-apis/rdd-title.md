# RDD Title (`rdd_title`)

An RDD (Role · Designation · Department) tuple carries a free-text **display title** —
"Admin of hotel", "Manager of Stay service" — stored in
`roles_designations_department.rdd_title` (`VARCHAR(255)`, nullable).

| Surface | Operation | Field |
|---|---|---|
| `/api/crud/roles-designations-department` | List, View | returns `rolesDesignationsDepartment_rddTitle` |
| `/api/crud/roles-designations-department` | Add, Update | accepts `rolesDesignationsDepartment_rddTitle` |
| `/api/custom-rdd-grouped-crud?step=1` | View | returns `rolesDesignationsDepartment_rddTitle` (edit-form prefill) |
| `/api/custom-rdd-grouped-crud?step=3` | Add, Update | accepts `rolesDesignationsDepartment_rddTitle` |

---

## Reading it

Both List and View project it alongside the other RDD columns:

```json
{
  "id": 54,
  "rolesDesignationsDepartment_roleDesignationDepartmentId": 54,
  "rolesDesignationsDepartment_rddTitle": "Admin of hotel",
  "designations_designationName": "Tenant",
  "roles_roleName": "Admin",
  "is_default": true
}
```

`null` where no title has been set. See [The `is_default` Flag](./is-default-flag) for the
companion flag on the same rows.

---

## Writing it — the grouped CRUD (step 3)

The RDD wizard writes the title in **step 3**, the same request that resolves the department:

```
PUT /api/custom-rdd-grouped-crud?step=3&id=54
{
  "departments_isNewEntry": false,
  "departments_existingDepartmentId": 7,
  "rolesDesignationsDepartment_rddTitle": "Front Desk Supervisor",
  "actionPerformerURDD": 2
}
```

`rdd_title` and `rddTitle` are accepted as aliases. The value is trimmed before storage.

| What you send | What happens |
|---|---|
| the key is **absent** | `rdd_title` is **left untouched** |
| `"  Front Desk  "` | stored as `Front Desk` |
| `""`, `"   "`, or `null` | **explicit clear** — `rdd_title` becomes `NULL` |
| more than 255 characters, or a non-string | **400**, and the RDD row is not written at all |

:::warning Absent is not the same as empty
Step 3 is one request in a multi-step wizard, and the frontend re-drives it on every edit. If
you want to keep the existing title, **omit the field** — do not send `""`, which clears it.
:::

The step response echoes what was written:

```json
{
  "success": true,
  "role_designation_department_id": 54,
  "departments_departmentId": 7,
  "rolesDesignationsDepartment_rddTitle": "Front Desk Supervisor"
}
```

The key is present only when a title was actually part of the request.

---

## Writing it — the default CRUD

`POST` / `PUT /api/crud/roles-designations-department` accept the same
`rolesDesignationsDepartment_rddTitle` field. The Update template guards it:

```sql
rdd_title = COALESCE({{rolesDesignationsDepartment_rddTitle}}, rdd_title)
```

An omitted `{{placeholder}}` resolves to a literal `NULL`, so without the `COALESCE` a partial
update would silently wipe the stored title. With it, **omitting the field keeps the current
title, and the default CRUD cannot clear one** — send an empty title through the grouped CRUD's
step 3 to do that.

:::note Apostrophes
The default CRUD's `{{placeholder}}` substitution wraps string values in quotes without
escaping them, so a title containing `'` breaks the statement. This affects every free-text
field on every generated CRUD, not just this one. The grouped CRUD's step 3 binds its
parameters properly and is unaffected — prefer it for user-entered titles.
:::
