# AUTHORIZATION

## 1. Introduction

This document explains how authorization is implemented within the CSAAS server framework.

Authorization determines whether an authenticated user is allowed to execute a requested API. Rather than embedding permission checks inside controllers or business logic, the framework performs authorization centrally through the middleware pipeline: every protected API declares its required permission inside its API Object, and the Authorization Middleware reads that configuration, validates the requesting user's permissions, and either allows the request to continue or blocks it before any business logic or database operation runs. Authorization is therefore completely configuration-driven — developers declare _what_ permission an API needs, and the framework handles the entire validation process automatically.

This document covers both the architecture and the implementation of the authorization system, including:

- API permission configuration
- Authorization middleware
- Permission validation workflow
- Delegated permissions
- Database permission lookup
- Role-based authorization (URDD)
- Permission result generation
- Included and excluded filters

---

## 2. Learning Objectives

After studying this document, developers should be able to:

- Understand the authorization architecture.
- Configure permissions inside API Objects.
- Understand how the Authorization Middleware works.
- Explain the internal workflow of `permissionChecker`.
- Understand delegated permissions stored inside JWT tokens.
- Explain database-based permission validation.
- Understand the purpose of `actionPerformerURDD`.
- Understand how `permission_results` are generated.
- Explain how included and excluded filters affect authorization.
- Debug common authorization-related issues.

---

## 3. Important Code Locations

The following files implement the authorization system. Their implementation is explained throughout the sections that follow.

| Code Location                                               | Responsibility                                                                                                                             |
| ----------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| `Services/Middlewares/PermissionCheck/permissionChecker.js` | Performs the complete authorization process, including delegated permission checks, database validation, and permission result generation. |
| `Services/Middlewares/config.js`                            | Registers the Authorization Middleware within the Processing stage of the middleware pipeline.                                             |
| `Services/Middlewares/TokenValidation/validateToken.js`     | Authenticates the user before authorization begins.                                                                                        |
| `Services/SysFunctions/checkExpiration.js`                  | Validates JWT expiration and extracts delegated permissions from the decoded token.                                                        |
| `Services/SysFunctions/auth.js`                             | Verifies JWT access tokens before decoding them.                                                                                           |
| `Services/SysFunctions/generatePayload.js`                  | Generates JWT payloads, including delegated permissions when configured.                                                                   |
| `Src/Apis/`                                                 | Contains API Objects that define required permissions for each endpoint.                                                                   |
| `Services/Integrations/Database/queryExecution.js`          | Executes SQL queries used during permission validation.                                                                                    |

---

## 4. Authorization Architecture

Authorization executes **after authentication** and **before business logic**. Authentication verifies _who_ the user is; authorization determines _what_ that authenticated user is allowed to do.

| Authentication                           | Authorization                                                                              |
| ---------------------------------------- | ------------------------------------------------------------------------------------------ |
| Verifies the user's identity.            | Verifies whether the authenticated user has permission to perform the requested operation. |
| Validates the JWT access token.          | Validates the permission defined by the API Object.                                        |
| Executes before authorization.           | Executes after authentication.                                                             |
| Produces authenticated user information. | Produces `permission_results` used by later middleware.                                    |

In short, authentication answers **"Who is making this request?"**, while authorization answers **"Is this authenticated user allowed to perform the requested action?"**

The Authorization Architecture diagram is available at:

`Documentation/Authorization/Authorization Diagrams/Authorization Architecture`

The Authorization Middleware acts as a security gate: if permission validation succeeds, request processing continues normally; if it fails, the framework immediately returns a **403 Forbidden** response and skips the remaining middleware stages. This centralized design keeps permission checks consistent across every API, keeps business logic independent of authorization, and lets each API's permission requirements be updated through configuration alone.

---

## 5. Authorization Request Lifecycle

Before authorization begins, the framework has already:

- Received the client request.
- Loaded the API Object.
- Decrypted the request payload (if encryption is enabled).
- Authenticated the user by validating the JWT access token.

Only after these steps does the Authorization Middleware begin validating permissions.

The Authorization Request Lifecycle diagram is available at:

`Documentation/Authorization/Authorization Diagrams/Authorization Request Lifecycle`

The sequence diagram shows the same lifecycle from the perspective of the participating components, including the branch between a granted and a denied request:

The Authorization Flow Sequence diagram is available at:

`Documentation/Authorization/Authorization Diagrams/authorization flow sequence`

Both outcomes follow the same gate behavior described in the previous section: authorization sits between authentication and business logic, and a failed check never reaches the Query Resolver or the database.

---

## 6. API Permission Configuration

Every protected API declares its required permission inside its API Object, under the `requestMetaData.permission` property. The middleware never hardcodes permission names — it always reads the required permission directly from this configuration.

```javascript
requestMetaData: {

    requestMethod: {
        Add: "POST",
        Update: "PUT",
        Delete: "DELETE",
        View: "GET",
        List: "GET"
    },

    permission: {
        Add: "add_permissions",
        Update: "update_permissions",
        Delete: "delete_permissions",
        View: "view_permissions",
        List: "list_permissions"
    }

}
```

### CRUD Permission Mapping

Different CRUD operations can require different permissions. During request processing, the framework first determines which CRUD operation is being executed, then retrieves only the permission associated with that operation:

| CRUD Operation | Required Permission  |
| -------------- | -------------------- |
| Add            | `add_permissions`    |
| Update         | `update_permissions` |
| Delete         | `delete_permissions` |
| View           | `view_permissions`   |
| List           | `list_permissions`   |

- POST → `add_permissions`
- PUT → `update_permissions`
- DELETE → `delete_permissions`
- GET (Single Record) → `view_permissions`
- GET (Collection) → `list_permissions`

### Public APIs

Some APIs — Login, Forgot Password, OTP Verification — do not require authorization. These disable permission validation by setting:

```javascript
requestMetaData: {
  permission: null;
}
```

When the Authorization Middleware encounters a `null` permission, it skips authorization and immediately continues to the next middleware.

### How the Framework Reads Permissions

The Framework Reads Permissions diagram is available at:

`Documentation/Authorization/Authorization Diagrams/Framework Reads Permissions`

The API Object is the single source of truth for authorization. Keeping permissions there — rather than inside controllers — means every API defines its own authorization requirements independently, permission rules stay separate from business logic, and permission changes require only a configuration update rather than a middleware change.

---

## 7. Authorization Execution & the Permission Checker

Once the required permission has been read from the API Object, two components carry out the actual authorization process:

- **Authorization Middleware (`permissionHandler`)** — the entry point into the authorization system. It reads the required permission, calls `permissionChecker`, stores the returned `permission_results` inside the decrypted payload, and either continues the pipeline or returns a **403 Forbidden** response.
- **Permission Checker (`permissionChecker`)** — the component that performs the complete validation logic. It reads the required permission and the authenticated user's `actionPerformerURDD`, checks delegated permissions from the JWT, falls back to the database when necessary, and builds the `permission_results` object.

The Authorization Execution & the Permission Checker diagram is available at:

`Documentation/Authorization/Authorization Diagrams/Authorization Execution & the Permission Checker`

| Middleware Responsibility | Description                                               |
| ------------------------- | --------------------------------------------------------- |
| Read API configuration    | Retrieves the permission defined inside the API Object.   |
| Invoke Permission Checker | Starts the authorization process.                         |
| Store Results             | Saves `permission_results` for later middleware.          |
| Continue Pipeline         | Calls the next middleware after successful authorization. |

The internal execution order inside `permissionChecker` is as follows:

The Internal Execution of permissionChecker diagram is available at:

`Documentation/Authorization/Authorization Diagrams/Internal Execution Of permissionChecker`

### Step 1 – Reading the Required Permission

The permission is always read from the API Object:

```javascript
const permission = apiData.requestMetaData.permission;
```

for example `permission: "view_users"` or `permission: ["view_users", "update_users"]`. Every API independently defines its own authorization requirements.

### Step 2 – Reading User Information

The Permission Checker next collects the authenticated email and `actionPerformerURDD`, which together uniquely identify the user's active role assignment:

```javascript
const { email } = decryptedPayload;

const urdd_id =
  req.query["actionPerformerURDD"] || decryptedPayload["actionPerformerURDD"];
```

If neither value is available, authorization cannot continue.

### Step 3 – Validating Required Parameters

```javascript
if (!email && !urdd_id) {
  throw new Error("Missing Required Permission Validation Parameters.");
}
```

This prevents the framework from attempting authorization without knowing which user or role to validate.

### Step 4 – Reading Delegated Permissions

If the API supports delegated permissions, the Permission Checker extracts them from the authenticated JWT before touching the database:

```javascript
let providedPermissions = [];

if (apiData.requestMetaData.providedPermissions) {
  let decodedToken = await checkExpiration(req.headers["accesstoken"]);
  ({ providedPermissions } = decodedToken);
}
```

The decoded JWT may contain authenticated user information, expiration details, and delegated permissions. Checking these first avoids an unnecessary database lookup.

### Step 5 – Checking Multiple Permissions

The framework supports both single and multiple permissions. A single permission is normalized into an array so the rest of the validation logic can process permissions uniformly, validating each one independently:

```javascript
const permissions = Array.isArray(permission) ? permission : [permission];
```

### Complete JWT Validation Flow

The diagram below expands Step 4 above, showing exactly how the framework verifies the JWT signature and extracts delegated permissions before falling back to database-based validation:

The JWT Validation Flow diagram is available at:

`Documentation/Authorization/Authorization Diagrams/JWT Validation Flow`

| Step                           | Description                                                                                                                             |
| ------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------- |
| Client Sends Request           | The client sends an authenticated request containing a valid JWT access token.                                                          |
| Authorization Middleware       | Invokes the `permissionChecker` to begin authorization.                                                                                 |
| permissionChecker              | Starts the authorization process by reading the required permission from the API Object.                                                |
| checkExpiration()              | Validates the access token, checks its expiration status, and prepares the decoded payload.                                             |
| verifyToken()                  | Verifies the JWT signature using the framework's secret key to ensure the token has not been tampered with.                             |
| Decode JWT Payload             | Extracts authenticated user information and delegated permissions from the validated JWT.                                               |
| Check Token Expiration         | Ensures that the JWT has not expired before authorization continues.                                                                    |
| nearExpiry() _(if applicable)_ | Performs additional expiration-related processing, such as handling tokens that are close to expiring.                                  |
| Extract `providedPermissions`  | Retrieves delegated permissions stored inside the decoded JWT payload.                                                                  |
| Permission Check               | Determines whether the required permission exists in `providedPermissions`.                                                             |
| Database Validation            | If the required permission is not found in the JWT, validates the permission using the database.                                        |
| Generate `permission_results`  | Creates the `permission_results` object containing authorization metadata, included/excluded filters, and other permission information. |
| Continue Middleware Pipeline   | Returns the authorization result and allows the request to proceed to the next middleware if authorization succeeds.                    |

---

## 8. Permission Management

Authorization validates permissions during request processing, but the framework also exposes APIs that let administrators assign roles and manage permissions for users. Unlike normal CRUD APIs, these management APIs perform permission checks manually inside their post-processing functions rather than relying on the middleware authorization mechanism.

### Role Assignment

When an administrator assigns a role to a user, the framework invokes `assignRoleToUser()`, which:

1. Checks whether the user already has the selected role.
2. Creates a new User Role Designation Department (URDD) record if required.
3. Assigns the selected role to the user.
4. Copies the default permissions associated with that role into the user's permission records.

```text
Admin selects a role

↓

assignRoleToUser()

↓

Create or reuse URDD

↓

Copy default role permissions

↓

User is ready to access protected APIs
```

### Manual Permission Overrides

After a role has been assigned, an administrator can modify individual permissions without changing the role itself.

**`setManualPermission()`** adds or removes a specific permission for a user's URDD. For example, if a role grants `view_users` and the administrator manually grants `delete_users`, the user ends up with both `view_users` (from the role) and `delete_users` (manual override).

**`resetPermissionToDefault()`** removes a manual override and restores the permission to the role's default configuration. For example, given a default role of `view_users ✓ / delete_users ✗`, a manual grant of `delete_users ✓`, and then a **Reset to Default** action, the framework removes the override and the permission set returns to `view_users ✓ / delete_users ✗`.

### Viewing Effective Permissions

`getEffectivePermissions()` combines permissions inherited from the assigned role with any manual overrides, returning the final permission list that is actually used during authorization.

| Source          | Description                                                   |
| --------------- | ------------------------------------------------------------- |
| Role            | Permission inherited from the assigned role.                  |
| Manual Override | Permission explicitly granted or revoked by an administrator. |

### Role Permission Lookup

| Function                     | Responsibility                                                    |
| ---------------------------- | ----------------------------------------------------------------- |
| `assignRoleToUser()`         | Assigns a role and provisions default permissions.                |
| `getEffectivePermissions()`  | Returns the final permission set after applying manual overrides. |
| `setManualPermission()`      | Grants or revokes a specific permission.                          |
| `resetPermissionToDefault()` | Restores the role's default permission configuration.             |
| `listGroupPermissions()`     | Retrieves all permissions associated with a role.                 |
| `getUrddRole()`              | Returns the role currently associated with a URDD.                |

Permission management creates and updates permission records; authorization itself never modifies permissions — it only validates the permissions already assigned to the user's URDD.

---

## 9. Permission Resolution & Database Validation

Rather than immediately querying the database, the Permission Checker first checks whether the required permission is already available inside the authenticated JWT, and only falls back to a database lookup if it isn't. This two-step approach reduces unnecessary database queries while keeping authorization accurate.

The Permission Resolution & Database Validation diagram is available at:

`Documentation/Authorization/Authorization Diagrams/Permission Resolution & Database Validation`

Conceptually, the JWT check resembles:

```javascript
if (providedPermissions.includes(permission)) {
  // Permission granted
}
```

If found, authorization succeeds immediately and no database query is required. Checking the JWT first is what allows the framework to authorize requests without repeatedly hitting the database — it means faster authorization, fewer queries, lower request latency, and better scalability under heavy traffic. If the required permission is unavailable inside the JWT, the framework automatically falls back to database validation.

### Database Permission Validation

The CSAAS framework associates permissions with the user's **User Role Designation Department (URDD)** rather than the user account directly. When a database lookup is needed, the Permission Checker retrieves the authenticated user's active URDD and validates permissions against that role assignment.

The Permission Checker never executes hardcoded SQL. Instead it calls `buildQuery()` to generate the appropriate statement:

```javascript
const query = buildQuery(
  requestedPath,

  email,

  urdd_id,

  permission,
);
```

`buildQuery()`'s behavior depends on the type of request:

The buildQuery() Behavior diagram is available at:

`Documentation/Authorization/Authorization Diagrams/buildQuery() Behavior`

- **Login requests** — the authenticated user's URDD is not yet available, so permissions are retrieved by email: `Users → Email → Role Assignment → Permissions`.
- **Normal API requests** — every request after authentication carries the user's active URDD, so permissions are validated using the URDD instead: `URDD → Assigned Permissions → Permission Exists?`. This ensures authorization always reflects the user's currently active role assignment.

Once generated, the query is executed:

```javascript
permissionResults = await executeQuery(
  query,

  "",

  connection,
);
```

The database returns every permission assigned to the authenticated URDD that matches the required permission. If the query returns one or more matching records, authorization succeeds; otherwise the framework returns a **403 Forbidden** response, and every permission in the (possibly multi-permission) list must succeed for the request to proceed, exactly as described for `permissions` array handling in the previous section.

---

## 10. Understanding `actionPerformerURDD`

One of the most important values used throughout the authorization process is `actionPerformerURDD`. Rather than validating permissions directly against a user account, the framework validates them against the user's **User Role Designation Department (URDD)** — a value that links together four entities:

- User
- Role
- Designation
- Department

The actionPerformerURDD diagram is available at:

`Documentation/Authorization/Authorization Diagrams/actionPerformerURDD`

| User | Role      | Designation       | Department | URDD |
| ---- | --------- | ----------------- | ---------- | ---- |
| Ali  | Manager   | Project Manager   | HR         | 15   |
| Ali  | Developer | Software Engineer | IT         | 27   |

Although both records belong to the same user, each role assignment has its own URDD and therefore its own permissions. This lets a single user work across multiple departments with different permissions per role, makes permission management role-based rather than user-based, and lets permission sets be reused across users. In effect, instead of asking "What permissions does Ali have?", the framework asks "What permissions belong to Ali's current URDD?"

During request processing, the Permission Checker retrieves the active URDD from the request:

```javascript
const urdd_id =
  req.query["actionPerformerURDD"] || decryptedPayload["actionPerformerURDD"];
```

This URDD becomes the identity used throughout permission validation — every database query, permission lookup, and authorization decision is based on this value.

---

## 11. Permission Result Construction

Once permission validation succeeds, the Permission Checker builds a permission result object and stores it at `decryptedPayload.permission_results`. Rather than performing permission lookups repeatedly, later middleware simply reuses this object — for example, the Query Resolver reads it directly instead of querying the database again:

```text
Authorization → permission_results → Query Resolver → Database Query
```

### Structure

```javascript
permission_results = {
  excluded: null,

  included: {},

  meta: {
    created_by: [actionPerformerURDD],
  },
};
```

| Property | Purpose                                         |
| -------- | ----------------------------------------------- |
| included | Stores additional access rules.                 |
| excluded | Stores restricted access rules.                 |
| meta     | Stores metadata used during request processing. |

### Included and Excluded Filters

Some permissions carry additional filtering rules that determine which records the authenticated user may access. These are stored in two database fields, `included_id` and `excluded_id`, both retrieved after permission validation succeeds.

`included_id` defines records that should always be included when processing queries. The Permission Checker parses it from JSON and places it into `permission_results.included`:

```text
Database → included_id → JSON.parse() → permission_results.included
```

Example:

```json
{
  "department": [2, 5],

  "company": [1]
}
```

This tells later middleware that only records matching these values should be returned.

`excluded_id` does the opposite — it specifies records that should never be returned:

```text
Database → excluded_id → permission_results.excluded
```

For example, `excluded_id = 7` may indicate that records belonging to department **7** should always be excluded.

The Included and Excluded Filters diagram is available at:

`Documentation/Authorization/Authorization Diagrams/Included and Excluded Filters`

### Additional Metadata

Beyond included and excluded filters, the Permission Checker stores metadata such as:

```javascript
meta: {
  created_by: [actionPerformerURDD];
}
```

The framework may extend this list with subordinate URDDs using two helper functions:

- **`getDesignationId()`** — retrieves the designation associated with the authenticated user's URDD: `URDD → Role Designation → Designation ID`. The designation is later used to determine reporting relationships.
- **`getSubordinates()`** — after obtaining the designation, retrieves subordinate designations and their URDDs: `Current Designation → Find Junior Designations → Retrieve Their URDDs`. The returned URDDs are appended to `meta.created_by` alongside the current URDD, which allows managers or supervisors to access records created by users reporting to them.

---

## 12. End-to-End Authorization Lifecycle

The sequence diagram ties together every mechanism described above — JWT-based resolution, the database fallback, and `permission_results` construction — into a single end-to-end view of a protected request:

The End-to-End Authorization Lifecycle diagram is available at:

`Documentation/Authorization/Authorization Diagrams/End-to-End Authorization Lifecycle`

---

## 13. Common Authorization Scenarios

The following examples show how the framework behaves in practice.

### Scenario 1 — Permission Granted through JWT

The authenticated JWT contains:

```json
providedPermissions:[
    "view_users",
    "update_users"
]
```

and the requested API requires `view_users`. The Permission Checker reads the required permission from the API Object, validates the JWT, finds `view_users` inside `providedPermissions`, and grants access immediately — skipping the database lookup entirely:

```text
API Permission → JWT → Permission Found → Request Continues
```

This is the fastest authorization path.

### Scenario 2 — Permission Retrieved from Database

The JWT does not contain delegated permissions, and the API requires `delete_users`. The Permission Checker reads the required permission, reads `actionPerformerURDD`, queries the permission tables, finds the required permission, builds `permission_results`, and continues:

```text
API Permission → Database Lookup → Permission Found → permission_results → Continue
```

### Scenario 3 — Permission Denied

Neither the JWT nor the database contains the required permission, so the Permission Checker stops processing immediately and the Query Resolver and business logic are never executed:

```text
API Permission → JWT → Not Found → Database → Not Found → 403 Forbidden
```

---

## 14. Error Handling

The Permission Checker throws authorization errors whenever validation fails:

| Situation                     | Result                                     |
| ----------------------------- | ------------------------------------------ |
| Missing `actionPerformerURDD` | Permission validation cannot begin.        |
| Missing required permission   | Authorization fails.                       |
| Invalid JWT                   | Authentication fails before authorization. |
| Permission not assigned       | 403 Forbidden response.                    |

This prevents unauthorized users from reaching the business logic layer.

---

## 15. Design Benefits

| Benefit                          | Why it matters                                                                                                         |
| -------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| Centralized authorization        | Permission validation is implemented once, in the middleware, and every protected API automatically follows it.        |
| Configuration-driven security    | Permissions are declared in the API Object; no authorization code needs to be written inside business logic.           |
| Role-based permission management | Permissions are assigned to URDDs rather than individual users, so the same permission set is reusable across users.   |
| Better performance               | Delegated permissions let the framework authorize requests without a database round trip in the common case.           |
| Cleaner business logic           | The Query Resolver and API implementation receive an already-authorized request and can focus purely on functionality. |

---

## 16. Related Documentation

| Document                | Description                                                                                                |
| ----------------------- | ---------------------------------------------------------------------------------------------------------- |
| Middleware Pipeline     | Explains where authorization executes within the request lifecycle.                                        |
| API Creation Process    | Explains how permissions are configured in API Objects.                                                    |
| Authentication          | Explains JWT authentication and token validation.                                                          |
| Encryption & Decryption | Explains request decryption before authorization begins.                                                   |
| Authorization Diagrams  | Mermaid diagrams for this document are available in `Documentation/Authorization/Authorization Diagrams/`. |

---

## 17. Code References

| Component                | Location                                                    | Responsibility                                                  |
| ------------------------ | ----------------------------------------------------------- | --------------------------------------------------------------- |
| Authorization Middleware | `Services/Middlewares/config.js`                            | Registers authorization middleware.                             |
| Permission Checker       | `Services/Middlewares/PermissionCheck/permissionChecker.js` | Performs permission validation and builds `permission_results`. |
| Token Validation         | `Services/Middlewares/TokenValidation/validateToken.js`     | Authenticates incoming requests.                                |
| JWT Validation           | `Services/SysFunctions/checkExpiration.js`                  | Validates token expiration and extracts payload.                |
| JWT Verification         | `Services/SysFunctions/auth.js`                             | Verifies JWT authenticity.                                      |
| JWT Payload Generator    | `Services/SysFunctions/generatePayload.js`                  | Generates JWT payload and delegated permissions.                |

---

## Conclusion

The CSAAS framework implements authorization as a centralized, middleware-driven process. Each protected API declares its required permission within its API Object, and the Authorization Middleware and Permission Checker validate the request using either delegated permissions stored in the JWT or permissions retrieved from the database via the user's URDD.

The framework also constructs a `permission_results` object containing permission metadata, included and excluded filters, and role-related information, which the remaining middleware pipeline reuses instead of repeating authorization checks. Together, API-based configuration, URDD-based role management, delegated permissions, and centralized middleware give the framework a secure, maintainable, and scalable authorization architecture.
