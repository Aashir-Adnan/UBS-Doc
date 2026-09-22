---
title: "API Object Collision Warnings"
sidebar_position: 1
---

# API Object Collision Warnings

At startup, the HMS backend now warns when **two files define the same API object name**, and when **an API object has duplicate or dead version keys** (for example `2` and `2.0`). The resolution rule is now explicit: **the first definition wins, and later ones are ignored and reported.**

:::note
Backend branch: `backend/feature/api-object-collision-warning` (forked from `staging`). Code: `Src/Bootstrap/apiObjectRegistry.js`, called from `Src/Bootstrap/filesystem.js`. Tests: `Services/SysScripts/TestScripts/apiObjectRegistry.test.js`. The in-repo design record is `backend/docs/api-object-collision-warnings.md`.
:::

---

## Why it exists

At startup, `initFolders()` walks `Src/Apis` and `require()`s every `.js` file. Each file assigns one `global.<Name>_object`, and the router turns an incoming URL into that name:

```
GET /api/permission_groups/dropdown  →  global.Permission_groupsDropdown_object
```

(`getApiObject` in `Services/Middlewares/config.js` turns each path segment into PascalCase and appends `_object`.)

So when two files assign the same name, the second **silently overwrites** the first. Node says nothing, and **whichever file the directory walk reaches last wins**. That order depends on `readdirSync` and on folder names, so an endpoint's behaviour was decided by alphabetical accident.

Version keys had the same problem. `versions.versionData` is a list of single-key objects, and the version checker uses the **first** key whose range matches. Two keys that resolve to the same range, or any key after a `"*"` catch-all, are dead configuration that looks live.

---

## How it works

`apiObjectRegistry.js` records every `*_object` global together with the file that defined it. `initFolders()` takes a baseline of the globals before the walk, then after each file:

```js
require(fullPath);
captureGlobalsFrom(fullPath);
```

For each `*_object` key on `global`:

| Situation | Action |
|---|---|
| New name | Registered, and its `versionData` is checked |
| Known name, same object reference | Nothing (the file re-exports an existing object) |
| Known name, **different value** | Recorded as a collision, and `global[name]` is **reset to the first definition** |

After the walk, one report is printed:

```
────────────────────────────────────────────────────────────────────────
  API OBJECT NAME COLLISIONS — 1 duplicate definition(s)
────────────────────────────────────────────────────────────────────────
    global.Room_typesDropdown_object
        active  : Src/Apis/GeneratedApis/Default/Room/Dropdown_Objects/Room_types_dropdown.js
        ignored : Src/Apis/GeneratedApis/Default/Room_types/Dropdown_Objects/Room_types_dropdown.js
  The first definition loaded wins; later ones are discarded.
  Rename one of the endpoints or delete the duplicate file.
```

It is a **warning**, so the server still boots.

### Version key warnings

Version keys are normalised with **the same parsing the version checker uses** (`parseFloat`), then compared:

| Warning | Meaning |
|---|---|
| `DUPLICATE_VERSION` | Two keys resolve to the same range, e.g. `"=2"` and `"=2.0"`, or `"2"` and `"2.0"`. The first one matches, so the second is dead. |
| `SHADOWED_VERSION` | A key comes after a `"*"` catch-all, which matches every version first. |
| `UNREACHABLE_VERSION` | A key with no `>`, `<`, `=` or `*` operator (a bare `"2"`). The checker has no case for it, so it never matches. |

:::info Version keys are numbers, not semver
Because the checker uses `parseFloat`, `2.10` counts as **less than** `2.9`.

The normalisation deliberately copies a checker bug as well. In `">=1&<2"` the upper bound is never applied, so `">=1&<2"` and `">=1&<3"` are reported as duplicates, because that's how the router actually treats them. If the warnings "understood" the intended range, they would disagree with live behaviour.
:::

---

## Options considered

### Which definition wins

| Option | Verdict |
|---|---|
| Keep last-wins, only warn | Rejected by the requester. The report would describe an accident rather than a rule. |
| **First wins, later ignored, warn** | **Chosen.** The result doesn't depend on folder names, and a new duplicate can never silently take over an existing endpoint. |
| Fail startup on any collision | Deferred. Six collisions existed when this was built. It can be revisited now that there are none. |

### How collisions are detected

| Option | Verdict |
|---|---|
| Scan the source for `global.X_object =` before loading | Rejected. It misses objects built dynamically and can report names the runtime never sees. |
| A `Proxy` or setter trap on `global` | Rejected. It is invasive and would fire for every unrelated global. |
| **Compare the `*_object` keys on `global` after each `require`** | **Chosen.** It sees exactly what the router sees, needs no changes to API files, and costs one cheap key scan per file. |

The check lives in its own module: `filesystem.js` gains three lines, and the registry can be unit-tested without touching the filesystem.

---

## What the check found

The first run against the real `Src/Apis` tree loaded 727 files and found **six collisions**. It found no version-key warnings, because every object uses a single `"*"` entry.

| Object | First loaded (would win) | Loaded later (was live under last-wins) | Would behaviour change? |
|---|---|---|---|
| `EnumTranslations_object` | `Custom/EnumTranslations/Custom_Objects/getEnumTranslations.js` | `Custom/EnumTranslations/getEnumTranslations.js` | No — they differ only in `require` depth |
| `Room_typesDropdown_object` | `Default/Room/…` | `Default/Room copy/…` | No — same code |
| `Room_typesDropdown_object` | `Default/Room/…` | `Default/Room_types/…` | **Yes** — labels cut to 10 characters |
| `Booking_servicesDropdown_object` | `Default/Booking/…` | `Default/Booking_services/…` | **Yes** — a broken generated query |
| `Permission_groupsDropdown_object` | `Default/Permission/…` | `Default/Permission_groups/…` | **Yes** — loses `groupScope`, translations and the description |
| `Env_object` | `ProjectSpecificApis/GuestSpecificApis/Test/env.js` | `ProjectSpecificApis/Test/env.js` | **Yes** |

Switching to first-wins alone would have replaced four live, maintained endpoints with stale versions. That made it a **merge blocker**, which the cleanup below resolves.

---

## Duplicates removed

Each endpoint's callers were found by searching the frontend and backend:
- If an endpoint is used, the variant that meets that use was kept.
- If it isn't used, the variant that doesn't fit the current system was removed.

| Endpoint | Used by | Kept | Removed | Why |
|---|---|---|---|---|
| `GET /enum/translations` | Frontend, at login (`getEnumTranslationsAction.js`) | `Custom/EnumTranslations/Custom_Objects/getEnumTranslations.js` | `Custom/EnumTranslations/getEnumTranslations.js` | Same logic. The kept path follows the `Custom/<Feature>/Custom_Objects/` layout that every other custom API uses. |
| `GET /room_types/dropdown` | Frontend, Booking rooms form | `Default/Room_types/Dropdown_Objects/Room_types_dropdown.js` | `Default/Room/Dropdown_Objects/Room_types_dropdown.js` | The removed file cut labels to `LEFT(type_name, 10)`. The kept file returns the full name, was the live version, and its folder name matches the table like every other dropdown. |
| `GET /room_types/dropdown` | same | same | `Default/Room copy/Dropdown_Objects/Room_types_dropdown.js` | An accidental copy of the removed file, alone in a folder named `Room copy`. |
| `GET /booking_services/dropdown` | Backend test `sim/adminTokenLifecycleE2E.js` | `Default/Booking_services/Dropdown_Objects/Booking_services_dropdown.js` | `Default/Booking/Dropdown_Objects/Booking_services_dropdown.js` | The removed generated query joins `tenants` six times (and other tables twice) **without aliases**. MySQL rejects that with *Not unique table/alias*, so it can't run. The kept hand-written query works and was the live one. |
| `GET /permission_groups/dropdown` | Permission Manager (`groupScope=tenant`), 5 CRUD forms, and the backend `sim/permissionManagerFlow.js` | `Default/Permission_groups/Dropdown_Objects/Permission_groups_dropdown.js` | `Default/Permission/Dropdown_Objects/Permission_groups_dropdown.js` | Only the kept file supports the `groupScope` filter, translated labels and the `description` field. The removed file would have shown every tenant's cloned groups, with untranslated, cut-off labels. |
| `GET /env` | **No callers** | — | `ProjectSpecificApis/GuestSpecificApis/Test/env.js`, `ProjectSpecificApis/Test/env.js` | Leftover test code with no authentication that **emailed the server's `.env` to an external address**. Both variants were removed. |

Other files in the `Booking/` and `Permission/` dropdown folders were not touched. Folders left empty by the removals are gone.

After the cleanup, first-wins and last-wins pick the same definition for every name, so switching the rule changes no live endpoint.

:::danger Security note — `/api/env`
Before this change, an unauthenticated `GET /api/env` could email a server's `.env` (database passwords, `SECRET_KEY`, mail and cloud credentials) to an address outside the organisation. Check each environment's API logs for past calls to `/api/env`. If there are any, **rotate that environment's secrets**.
:::

---

## Decisions

| # | Decision | Status |
|---|---|---|
| 1 | Delete the superseded duplicate files | **Resolved** — see above |
| 2 | Which `EnumTranslations` file to keep | **Resolved** — `Custom_Objects/` |
| 3 | The stray `Room copy/` folder | **Resolved** — removed |
| 4 | Whether a collision should eventually stop the server from starting | **Open** — can be revisited now that there are no collisions |
| 5 | `Env_object` leaking `.env` | **Resolved** — removed |

---

## Tests and verification

```bash
node --test Services/SysScripts/TestScripts/apiObjectRegistry.test.js
```

The 18 cases cover:
- first-wins retention and repeated collisions on one name;
- re-exports of the same object;
- the report's contents;
- normalisation of `=2`/`=2.0` and `2`/`2.0`, and distinct operators;
- the duplicate, shadowed and unreachable version warnings.

The tests use fixtures, not the real API tree.

Before merging:
- start the server and confirm there is **no** `API OBJECT NAME COLLISIONS` block in the startup log;
- check that `/enum/translations`, `/room_types/dropdown`, `/booking_services/dropdown` and `/permission_groups/dropdown?groupScope=tenant` still respond.
