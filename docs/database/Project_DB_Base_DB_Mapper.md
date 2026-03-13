# Project DB → Base DB Mapper

This document describes the **Project DB → Base DB Mapper**: a tool that maps a **project database** schema (uploaded or pasted as SQL) onto a **base database** schema and produces a single merged SQL file. One database can then serve both the shared base schema (e.g. UBS base DB) and the project-specific schema.

**All functionality runs in this web app.** No separate GUI or commands are required. Use **Dev Tools → Database Tools → Project DB Mapper** to upload or paste SQL, review mappings, and download the merged file.

---

## Data Flow

| Source | Location | Role |
|--------|----------|------|
| **Base DB** | `static/sql/base_db.sql` (in repo) | Loaded automatically by the app; reference schema for merging. |
| **Project DB** | Pasted or uploaded in the app | User provides project SQL only; it is parsed and mapped against the base. |
| **Mapped DB** | Generated in the app | Output SQL (e.g. `mapped_db.sql`) merges base + project with FK rewrites; user downloads it. |

---

## Entity-Relationship Overview

The mapper operates over **parsed schemas** (from pasted/uploaded SQL), **mapping config** (table mappings and FK rewrites), and **output SQL**. Below, tables and columns are shown in ERD style with references.

---

### 1. Base schema

The base database schema is loaded from **`static/sql/base_db.sql`** in the project. The app fetches it on load and uses it as the merge target.

| Table | Column | Type | Key | Reference / Notes |
|-------|--------|------|-----|-------------------|
| **user_roles_designations_department** | user_role_designation_department_id | INT | PK | Target for user-related FK rewrites. |
| | ... | ... | | (other base columns) |
| **&lt;base_table&gt;** | ... | ... | PK, FK | Any other base tables; structure is preserved when merging. |

**Relationship:** Project FKs that point at `user_id` or `users` are rewritten to reference **`user_roles_designations_department.user_role_designation_department_id`** (URDD).

---

### 2. Project schema (uploaded / pasted SQL)

The project SQL is pasted or uploaded in the web app. The parser produces a list of tables; each table has columns, primary keys, and foreign keys.

| Table | Column | Type | Key | Reference / Notes |
|-------|--------|------|-----|-------------------|
| **&lt;project_table&gt;** | &lt;column&gt; | e.g. INT, VARCHAR | PK? | From `CREATE TABLE` in project SQL. |
| | user_id | INT | FK → users.id | **Rewrite target:** FK changed to URDD in merged output. |
| | ... | ... | FK → other_table | Other FKs preserved or rewritten per config. |

**Mapping outcome (per project table):**

- **Mapped to base table** → project table is merged into that base table: base columns kept, non-PK project columns added via `ALTER TABLE`; FKs on added columns get URDD rewrites where applicable.
- **New table** → project table is emitted as `CREATE TABLE` in the merged SQL, with FK rewrites applied.

---

### 3. Mapping config (built and edited in the web app)

The config holds table mappings and FK rewrite rules. It is built from suggestions and can be edited in the app before applying.

| Logical entity | Field | Type | Reference / Notes |
|----------------|--------|------|-------------------|
| **table_mapping** | project_table_name | string | Name of table in project schema. |
| | base_table_name | string \| null | Base table to merge into; `null` = "New table". |
| **fk_rewrite_rule** | source_table | string | Table containing the FK. |
| | source_column | string | Column that references user/users. |
| | target_table | string | `user_roles_designations_department`. |
| | target_column | string | `user_role_designation_department_id`. |

**Where tables are mapped:**

| Project table | Maps to base table | Result in merged SQL |
|---------------|--------------------|----------------------|
| Same name as base | That base table | `ALTER TABLE base_table ADD COLUMN ...` for extra columns; then `ADD CONSTRAINT` for FKs (with rewrites). |
| Similar name (suggested) | User choice (or suggested base table) | Same as above if user selects base; else "New table". |
| No match / "New table" | — | `CREATE TABLE project_table ...` with FK rewrites. |

---

### 4. Parsed schema structures (in-app)

These structures represent the parsed base and project SQL (tables, columns, PKs, FKs). They are not persisted as DB tables but are the in-memory shape used by the mapper.

| Entity | Attributes | Reference / Notes |
|--------|------------|-------------------|
| **parsed_table** | name, columns[], primaryKey[], foreignKeys[] | One per `CREATE TABLE` in the dump. |
| **column** | name, type, nullable, default | One per column in the table. |
| **foreign_key** | column, refTable, refColumn | Used to detect user/users references and apply rewrites. |

---

## How to use (in the web app)

1. Open **Dev Tools → Database Tools**, then **Project DB Mapper**.
2. **Base schema** is loaded automatically from **`static/sql/base_db.sql`** (no input required).
3. **Project SQL:** Paste or upload your project schema SQL. Click **Parse project** to load project tables.
4. **Interactive ERD (full page):** The diagram fills the viewport. Right-click a **project** table for:
   - **Add column** — add a column (name, type) to that table.
   - **Map table** — choose a base table to merge into or "— New table —".
   - **Delete table** — remove the table from the project schema.
   Drag the canvas to pan, scroll to zoom, drag a table header to move it.
5. **Table mappings** are only auto-suggested for **same names** or **incredibly similar** names; all others default to "— New table —". You can change any mapping in the table or via right-click → Map table.
6. Review **FK rewrites** (user → URDD) if any.
7. Click **Apply mapping → Generate merged SQL + migrations**, then download **mapped_db.sql** and **migration_sql.sql**.

No separate server or CLI is required; the base schema is read from the repo file, and parsing, mapping, and SQL generation run in the browser.

---

## Migration SQL (old DB → new DB)

After applying the mapping, the app generates **migration_sql.sql**, which:

- Defines a **`migration_sql`** table to store pending SQL (operation_type, old_table, new_table, sql_text, status).
- For each mapped table, provides **triggers** to run on the **original (old) project DB**: on INSERT/UPDATE/DELETE, the trigger writes the corresponding translated SQL (for the new/mapped DB) into `migration_sql`. A separate process can then execute those rows on the new DB to keep it in sync.
- Supports DDL: add/drop column and create/drop table can be recorded in `migration_sql` so the new DB can replay schema changes.

---

## API outline (optional backend)

If a backend is added later, the following APIs would support the same workflow (e.g. base schema stored on server, project SQL sent from client):

| Method | Path | Request body | Description |
|--------|------|--------------|-------------|
| **GET** or **POST** | `/api/mapper/base-schema` | — | Return parsed base schema (when base lives on server). |
| **POST** | `/api/mapper/load-project` | `{ "sql": "..." }` or multipart file | Parse project SQL and return parsed schema. |
| **POST** | `/api/mapper/apply` | `{ "baseSchema", "projectSchema", "config" }` | Return merged SQL. |

The current web app implements parsing and apply **client-side**, so it works without any backend.

---

## Summary

- **Base DB** schema is loaded from **`static/sql/base_db.sql`** in the repo (no user input).
- **Project DB SQL** is the **only input**: uploaded or pasted in the app.
- Tables and columns are shown in **ERD style** in the app; mapping config links project tables to base tables (or marks them as new).
- User-related FKs are rewritten to **`user_roles_designations_department.user_role_designation_department_id`**.
- **No GUI or commands:** everything is done in the Database Tools → Project DB Mapper view.
