# The Process of Creating an API

## 1. Introduction

All APIs in the CSAAS Backend framework **must** follow the **Object-Based Pattern**. In this pattern, every API endpoint is defined as a self-contained JavaScript object that is registered on the `global` scope. The framework's middleware pipeline automatically discovers and executes the correct object based on the incoming request URL.

> **Mandatory Rule:** If an old API implementation does not follow the current object-based pattern, it must be remade as an object-based API and the old implementation must be removed.
> — `AGENTS.md`

### What is the Object-Based Pattern?

Instead of writing business logic directly inside Express route handlers, every API is defined as a **structured configuration object**. This object declares:

- **What** security checks to apply (encryption, token validation, OTP).
- **What** HTTP methods are allowed (GET, POST, PUT, DELETE).
- **What** parameters are expected.
- **What** database queries to execute (for CRUD APIs).
- **What** custom business logic functions to run (pre-process and post-process).
- **What** success/error messages to return.

The framework reads this object and automatically handles the entire request lifecycle — developers never write `req`, `res`, or `next` handling code manually.

---

# 2. Two Types of API Objects

The framework supports two distinct types of API objects. The type chosen depends on the complexity of the feature being implemented.

| Type                    | Location                          | When to Use                                                                                                                                         |
| ----------------------- | --------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Default CRUD API**    | `Src/Apis/GeneratedApis/Default/` | Standard Create, Read, Update, Delete operations on a database table. The framework auto-generates the CRUD behavior from the provided SQL queries. |
| **ProjectSpecific API** | `Src/Apis/ProjectSpecificApis/`   | Custom business logic that goes beyond simple CRUD. Custom functions are written, and the framework calls them.                                     |

### Folder Structure

```text
Src/Apis/
├── Templates/                          # Reusable base templates
│   ├── CrudTemplates.js                # Base config for all CRUD APIs
│   └── TestTemplates.js                # Base config for test APIs
│
├── GeneratedApis/
│   ├── Default/                        # Standard CRUD APIs (one folder per table)
│   │   ├── Users/
│   │   │   └── Crud_Objects/
│   │   │       ├── Users.js            # The API Object
│   │   │       └── CRUD_parameters.js  # Parameter definitions
│   │   ├── Plans/
│   │   ├── Roles/
│   │   └── ...
│   │
│   └── Custom/                         # Customized CRUD APIs
│       ├── Login/
│       ├── Dashboard/
│       └── ...
│
├── ProjectSpecificApis/                # Fully custom APIs
│   ├── PortalUsers/
│   │   └── portalUsers.js
│   ├── LandingStats/
│   │   └── landingStats.js
│   ├── MeetingWorkflow/
│   └── ...
│
└── TestApis/                           # APIs used for testing
```

---

# 3. How the Framework Discovers APIs (URL-to-Object Resolution)

This is the most important concept to understand. **Routes are not manually registered for each API.** The framework uses a single dynamic route that catches all `/api/*` requests and automatically resolves the correct API Object from the URL.

### The Resolution Flow

The API Object Handling diagram is available at:

`Documentation/apiCreationProcess/apiCreationProcess Diagrams/api_object_handling`

### The Naming Convention (Critical!)

The framework converts the URL path into a global object name using this formula:

| URL Path                   | Extracted Path        | Generated Object Name      |
| -------------------------- | --------------------- | -------------------------- |
| `/api/crud/users`          | `crud/users`          | `CrudUsers_object`         |
| `/api/landing/stats`       | `landing/stats`       | `LandingStats_object`      |
| `/api/portal/users/signin` | `portal/users/signin` | `PortalUsersSignin_object` |
| `/api/portal/users/me`     | `portal/users/me`     | `PortalUsersMe_object`     |

**The rule is:**

1. Take each segment of the URL path after `/api/`.
2. Capitalize the first letter of each segment.
3. Concatenate them together.
4. Append `_object` at the end.

> ⚠️ **If the global object name does not match this convention, the framework will not find the API and will return a 404 error.**

### Where This Logic Lives

The resolution happens inside `Services/Middlewares/config.js` in the `getApiObject()` function. It reads `req.path`, strips the `/api/` prefix, converts the remaining path segments to PascalCase, and looks up `global[objectName]`.

---

# 4. The API Object Structure (Anatomy)

Every API Object, whether Default CRUD or ProjectSpecific, follows the same nested structure. Understanding this structure is essential.

The API Object Structure diagram is available at:

`Documentation/apiCreationProcess/apiCreationProcess Diagrams/api_object_structure`

Every incoming API request is processed using this API Object structure. During request execution, the framework reads the configuration, data, and response sections to determine how the API should be processed.

### The Three Core Sections of a Step

#### 4.1 `config` — Controls the Pipeline Behavior

This section dictates to the middleware pipeline which security and processing features to enable for the specific API.

```javascript
config: {
    features: {
        multistep: false,       // // Whether the request is processed in multiple steps
        parameters: true,       // Whether to validate incoming parameters
        pagination: true,       // Whether to paginate query results
    },
    communication: {
        encryption: {
            platformEncryption: true,   // Whether the request body is AES-encrypted
            accessToken: false,         // Whether encryption uses the access token
        },
    },
    verification: {
        otp: false,             // Whether OTP verification is required
        accessToken: false,     // Whether a valid access token (JWT) is required
    },
}
```

| Flag          | What It Controls                                                                                    |
| ------------- | --------------------------------------------------------------------------------------------------- |
| `parameters`  | If `true`, the `parameterValidator` middleware checks that all required fields are present.         |
| `pagination`  | If `true`, the Query Resolver applies pagination (page size, offsets) to database results.          |
| `encryption`  | If `true`, the `encryptionHandler` middleware decrypts the incoming request body before processing. |
| `accessToken` | If `true`, the `accessTokenValidator` middleware validates the JWT token in the request headers.    |
| `otp`         | If `true`, the `otpVerificationHandler` middleware verifies a One-Time Password.                    |

#### 4.2 `data` — Defines What the API Does

This is the central logic of the API Object. It contains three sub-sections:

**`data.parameters`** — Defines what input fields the API expects (name, type, required, source, validations).

**`data.apiInfo`** — Defines the core logic:

- `query.queryPayload` — The SQL queries for each CRUD operation (Add, List, View, Update, Delete).
- `preProcessFunctions` — Array of functions to run **before** the query executes.
- `postProcessFunction` — A function to run **after** the query executes (or as the sole business logic for ProjectSpecific APIs).

**`data.requestMetaData`** — Defines:

- `requestMethod` — Which HTTP methods are allowed (e.g., `"POST"`, `"GET"`, or an object mapping operations to methods).
- `permission` — Which permission string is required (e.g., `"CREATE_USER"`). Set to `null` for public endpoints.
- `pagination` — Page size configuration.

#### 4.3 `response` — Defines the Messages

```javascript
response: {
    successMessage: "Users CRUD Hit successfully!",
    errorMessage: "Failed to retrieve Users.",
}
```

---

# 5. Creating a Default CRUD API (Step-by-Step)

A Default CRUD API is for standard database table operations. The framework automatically generates the Create, Read (List and View), Update, and Delete operations from the SQL queries defined in the API Object.

### Step 1: Create the Folder Structure

```text
Src/Apis/GeneratedApis/Default/TableEntity/
└── Crud_Objects/
    ├── TableEntity.js           # The API Object
    └── CRUD_parameters.js       # The parameter definitions
```

### Step 2: Define the Parameters (`CRUD_parameters.js`)

This file defines all the input fields that the API accepts. Each parameter tells the framework:

- what the field is called,
- what type of value it accepts,
- whether it is required,
- where the value should be read from (such as `req.body` or `req.query`), and
- which SQL placeholder (`dynamicKey`) should be replaced with the actual value during query execution.

```javascript
const parameters = {
  steps: [
    {
      title: "TableEntity Crud",
      parameters: {
        fields: [
          {
            name: "tableEntity",
            type: "section",
            title: "Table Entity",
            childFields: [
              {
                name: "email",
                label: "Email",
                type: "textField",
                required: true,
                source: "req.body",
                dynamicKey: "tableEntity_email",
              },
              {
                name: "name",
                label: "Name",
                type: "textField",
                required: true,
                source: "req.body",
                dynamicKey: "tableEntity_name",
              },
            ],
          },
        ],
      },
    },
  ],
};

module.exports = parameters;
```

#### Parameter Properties

| Property     | Description                                                                                                                               |
| ------------ | ----------------------------------------------------------------------------------------------------------------------------------------- |
| `name`       | Internal name of the parameter.                                                                                                           |
| `label`      | Display name shown in forms or documentation.                                                                                             |
| `type`       | Defines the type of input field (for example, `textField` or `section`).                                                                  |
| `required`   | Indicates whether the parameter must be provided.                                                                                         |
| `source`     | Specifies where the framework reads the value from, such as the request body (`req.body`) or URL query parameters (`req.query`).          |
| `dynamicKey` | Placeholder used in SQL queries. During execution, the framework replaces this placeholder with the actual value received in the request. |

#### Example

If the client sends the following request:

```json
{
  "email": "ayesha@example.com",
  "name": "Ayesha"
}
```

The framework reads these values from `req.body` and replaces the SQL placeholders:

```sql
{{tableEntity_email}} → ayesha@example.com
{{tableEntity_name}}  → Ayesha
```

before executing the final SQL query.

### Step 3: Define the API Object (`TableEntity.js`)

The API Object is the main configuration file for the API. It tells the framework **how the API should behave**, **which parameters it uses**, **what SQL queries should be executed**, and **what response should be returned**.

```javascript
const parameters = require("./CRUD_parameters");

// Register on the global scope with the correct naming convention
global.CrudTableentity_object = {
  // Use the default CRUD template
  templateName: "Crud_Template",

  versions: {
    versionData: [
      {
        "*": {
          steps: [
            {
              data: {
                parameters: parameters,
                apiInfo: {
                  preProcessFunctions: [],
                  query: {
                    queryPayload: {
                      Add: async (req, decryptedPayload) => {
                        return "INSERT INTO table_entity (email, name) VALUES ({{tableEntity_email}}, {{tableEntity_name}})";
                      },
                      Update: async (req, decryptedPayload) => {
                        return "UPDATE table_entity SET email = {{tableEntity_email}}, name = {{tableEntity_name}} WHERE id = {{id}}";
                      },
                      List: async (req, decryptedPayload) => {
                        return "SELECT * FROM table_entity WHERE status != 'inactive'";
                      },
                      View: async (req, decryptedPayload) => {
                        return "SELECT * FROM table_entity WHERE id = {{id}}";
                      },
                      Delete: async (req, decryptedPayload) => {
                        return "UPDATE table_entity SET status = 'inactive' WHERE id = {{id}}";
                      },
                      database: "mainDb",
                    },
                  },
                  postProcessFunction: null,
                },
              },
              response: {
                successMessage: "TableEntity CRUD Hit successfully!",
                errorMessage: "Failed to process TableEntity request.",
              },
            },
          ],
        },
      },
    ],
  },
};

module.exports = { CrudTableentity_object };
```

#### API Object Components

| Component             | Purpose                                                                              |
| --------------------- | ------------------------------------------------------------------------------------ |
| `templateName`        | Inherits the default CRUD framework configuration.                                   |
| `parameters`          | References the parameter definitions from `CRUD_parameters.js`.                      |
| `queryPayload`        | Defines the SQL query for each CRUD operation (Add, Update, List, View, and Delete). |
| `database`            | Specifies which database connection should execute the query.                        |
| `preProcessFunctions` | Functions executed before the SQL query runs.                                        |
| `postProcessFunction` | Function executed after the SQL query completes.                                     |
| `response`            | Defines the success and error messages returned to the client.                       |

### How `templateName` Works

When `templateName: "Crud_Template"` is specified, the framework loads the default CRUD template (`global.Crud_Template`) and merges the current API Object with it using `deepMerge()`.

This allows every CRUD API to inherit the framework's default configuration while overriding only the settings that are specific to the current API.

The CRUD template provides default settings such as:

- Feature flags
- Communication and encryption settings
- Verification rules
- Request metadata
- Pagination configuration
- Default response messages

As a result, developers only need to define the custom behavior for the current API instead of rewriting the entire configuration.

### How Query Placeholders Work

The SQL queries in the API Object use placeholders such as `{{tableEntity_email}}` instead of hard-coded values.

During request processing, the Query Resolver replaces each placeholder with the corresponding value from the validated request parameters. The placeholder name must match the `dynamicKey` defined in `CRUD_parameters.js`.

**Example**

```sql
INSERT INTO users (email, name)
VALUES (
    {{tableEntity_email}},
    {{tableEntity_name}}
)
```

If the client sends:

```json
{
  "email": "ayesha@example.com",
  "name": "Ayesha"
}
```

The framework generates the final SQL query:

```sql
INSERT INTO users (email, name)
VALUES (
    'ayesha@example.com',
    'Ayesha'
)
```

---

# 6. Creating a ProjectSpecific API (Step-by-Step)

A ProjectSpecific API is used when the required functionality cannot be implemented using the standard CRUD query generator.

Instead of defining SQL queries for CRUD operations, the developer writes custom JavaScript functions that implement the required business logic. These functions can execute database queries, call external services, or perform any other application-specific processing.

---

### Step 1: Create the Folder and File

```text
Src/Apis/ProjectSpecificApis/CustomFeature/
└── customFeature.js
```

---

### Step 2: Implement the Business Logic

Unlike Default CRUD APIs, a ProjectSpecific API does not rely on the framework's CRUD query generator.

Instead, developers implement the required business logic inside a custom JavaScript function. The framework automatically executes this function when the API is called.

Within this function, developers can execute database queries, call external services, perform calculations, or implement any other application-specific logic before returning the final result.

```javascript
const {
  executeQuery,
} = require("../../../../Services/Integrations/Database/queryExecution");

async function getFeatureData(req, decryptedPayload) {
  const results = await executeQuery(
    `SELECT * FROM table_entity WHERE status = ?`,
    ["active"],
  );

  return {
    items: results,
    count: results.length,
  };
}
```

In this example:

- `executeQuery()` executes a custom SQL query.
- The query retrieves all active records from the database.
- The function returns both the retrieved records (`items`) and the total number of records (`count`).
- The framework automatically sends this returned object to the client as the API response.

---

### Step 3: Define the API Object

The framework reads this API Object during request processing to determine how the request should be handled.

After implementing the business logic, register it with the framework by creating a ProjectSpecific API Object.

Unlike a Default CRUD API, a ProjectSpecific API does not define CRUD SQL queries. Instead, the custom business logic function is assigned to `postProcessFunction`, and the framework automatically executes it when the API is called.

```javascript
global.CustomFeature_object = {
  versions: {
    versionData: [
      {
        "*": {
          steps: [
            {
              config: {
                features: {
                  multistep: false,
                  parameters: false,
                  pagination: false,
                },
                communication: {
                  encryption: false,
                },
                verification: {
                  otp: false,
                  accessToken: false,
                },
              },
              data: {
                parameters: {
                  fields: [],
                },
                apiInfo: {
                  preProcessFunctions: [],
                  query: {
                    queryPayload: null,
                    database: () => "main",
                  },
                  postProcessFunction: getFeatureData,
                },
                requestMetaData: {
                  requestMethod: "GET",
                  permission: null,
                },
              },
              response: {
                successMessage: "Feature data retrieved",
                errorMessage: "Failed to retrieve feature data",
              },
            },
          ],
        },
      },
    ],
  },
};

module.exports = { CustomFeature_object };
```

### API Object Components

| Component             | Purpose                                                                                                                                               |
| --------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| `config`              | Configures framework features such as authentication, encryption, parameter validation, and pagination.                                               |
| `parameters`          | Defines the request parameters required by the API. In this example, no input parameters are required, so the `fields` array is empty.                |
| `query.queryPayload`  | Set to `null` because this API does not use the CRUD query generator.                                                                                 |
| `postProcessFunction` | Specifies the custom JavaScript function that contains the business logic. The framework automatically executes this function when the API is called. |
| `response`            | Defines the success and error messages returned to the client.                                                                                        |

---

### Key Differences from Default CRUD

| Aspect                | Default CRUD API                                            | ProjectSpecific API                                                             |
| --------------------- | ----------------------------------------------------------- | ------------------------------------------------------------------------------- |
| SQL Generation        | SQL queries are generated from `query.queryPayload`.        | SQL queries (if required) are written manually inside the custom function.      |
| `query.queryPayload`  | Contains SQL queries for CRUD operations.                   | Set to `null`.                                                                  |
| `postProcessFunction` | Usually `null`.                                             | Contains the custom business logic function executed by the framework.          |
| `templateName`        | Uses `Crud_Template` to inherit default CRUD configuration. | Usually not required because the configuration is defined directly.             |
| Parameters            | Typically defined in `CRUD_parameters.js`.                  | Defined only if the custom function requires input.                             |
| Typical Use Case      | Standard Create, Read, Update, and Delete operations.       | Custom business logic, workflows, external integrations, or complex processing. |

---

### Example

The following ProjectSpecific API directly executes a custom function instead of using the CRUD query generator.

```javascript
global.PortalUsersList_object = {
  versions: {
    versionData: [
      {
        "*": {
          steps: [step(listUsers, [], "GET")],
        },
      },
    ],
  },
};
```

The ProjectSpecific API execution flow is available at:

`Documentation/apiCreationProcess/apiCreationProcess Diagrams/client_request_flow.drawio`

When a request reaches this API, the framework automatically executes the `listUsers()` function, which performs the required business logic and returns the response to the client.

---

# 7. CRUD Workflow

The CRUD API request sequence diagram is available at:

`Documentation/apiCreationProcess/apiCreationProcess Diagrams/api_crud_users_flow_sequence`

### Workflow Explanation

The CRUD request is processed in three main stages: **PreProcessing**, **Processing**, and **PostProcessing**.

#### Stage 1 — PreProcessing

1. **Client Request**  
   The client sends an HTTP request (for example, `POST /api/crud/users`).

2. **Dynamic Router**  
   The framework's dynamic router receives the request and forwards it to the middleware pipeline.

3. **API Object Resolution**  
   The framework extracts the URL path, converts it into the corresponding API Object name (for example, `CrudUsers_object`), and loads the object from the global scope.

4. **Template Merging**  
   If the API Object specifies a `templateName`, the framework merges it with the corresponding template (such as `Crud_Template`) to create the final API configuration.

5. **Determine CRUD Operation**  
   Based on the HTTP method (GET, POST, PUT, or DELETE), the framework determines which CRUD operation (List, View, Add, Update, or Delete) should be executed.

6. **Initial Request Validation**  
   Before continuing, the framework decrypts the request (if encryption is enabled) and verifies that the requested HTTP method is allowed.

---

#### Stage 2 — Processing

1. **Authentication**  
   If access-token validation is enabled, the framework validates the client's access token.

2. **Permission Verification**  
   If the API requires specific permissions, the framework verifies that the authenticated user has the required permission.

3. **Parameter Validation**  
   The framework validates all required request parameters according to the definitions in `CRUD_parameters.js`.

4. **Pre-Processing Functions**  
   Any functions defined in `preProcessFunctions` are executed before the SQL query is prepared.

5. **Resolve SQL Placeholders**  
   The Query Resolver replaces placeholders (such as `{{tableEntity_email}}`) with the actual values received in the request.

6. **Execute SQL Query**  
   The completed SQL query is executed against the configured database, and the query results are returned.

---

#### Stage 3 — PostProcessing

1. **Post-Processing Function**  
   If a `postProcessFunction` is defined, it is executed after the database query completes.

2. **Response Encryption**  
   If response encryption is enabled, the framework encrypts the response before sending it.

3. **Return Response**  
   Finally, the framework returns the completed HTTP response to the client.

---

# 8. Anti-Pattern: What NOT to Do

The following example demonstrates an **incorrect** approach to implementing an API in this framework. Business logic should **never** be written directly inside Express route handlers. Instead, all request processing should be defined through API Objects and executed by the framework's middleware pipeline.

```javascript
// ❌ WRONG — Do NOT implement APIs like this
const express = require("express");
const router = express.Router();

router.post("/api/users/create", async (req, res) => {
  // Authentication logic inside the route
  if (!req.headers.authorization) return res.status(401).send("No token");

  // Business logic inside the route
  const hashedPassword = encrypt(req.body.password);

  // Direct database access
  const result = await db.query("INSERT INTO users ...", [
    req.body.email,
    hashedPassword,
  ]);

  // Direct response handling
  res.json({
    success: true,
    data: result,
  });
});
```

### Why This Approach Is Incorrect

- Business logic is tightly coupled with the HTTP route and cannot be reused.
- Security checks are implemented manually instead of using the standardized middleware pipeline.
- Parameter validation, encryption, permissions, and other framework features are bypassed.
- Response handling becomes inconsistent across different APIs.
- It violates the Object-Based API architecture defined by the framework.

### Recommended Approach

Always define a `global.*_object` inside `Src/Apis/` and allow the framework to handle routing, validation, security, query execution, and response generation automatically.

---

# 9. Error Handling and Debugging Steps

When creating APIs using the Object-Based Pattern, most errors stem from configuration mismatches rather than runtime logic. Debugging should focus on verifying the structure, naming, and data flow of your API Object.

### Common Errors and Solutions

| Symptom / Error                            | Probable Cause                                                                           | How to Fix                                                                                                                                                                                                                                                                    |
| ------------------------------------------ | ---------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **404 API Object Not Found**               | The framework cannot resolve the URL to a global object name.                            | 1. Ensure the `global.Name_object` exactly matches the PascalCase conversion of the route.<br>2. Verify the API file is being imported/required during server startup.<br>3. Check if the file was placed in the correct `Default` or `ProjectSpecificApis` folder structure. |
| **Missing Parameter Errors**               | The client payload doesn't match the definitions in `CRUD_parameters.js`.                | 1. Verify the `source` is correct (e.g., `req.body` vs `req.query`).<br>2. Ensure the parameter `type` matches the incoming data.<br>3. Check if a field is incorrectly marked as `required: true`.                                                                           |
| **SQL Syntax / Placeholder Error**         | The Query Resolver failed to replace `{{placeholder}}` values before database execution. | 1. Ensure the `{{dynamicKey}}` used in your `queryPayload` exactly matches the `dynamicKey` string defined in `CRUD_parameters.js`.<br>2. Verify that `preProcessFunctions` are not malforming the input data.                                                                |
| **ProjectSpecific API Returns Empty/Null** | The custom `postProcessFunction` did not return the expected data format.                | 1. Ensure your custom function explicitly `return`s the final result.<br>2. Verify `query.queryPayload` is set to `null` so the framework knows to rely on your custom function instead of the CRUD generator.                                                                |
| **API Ignored Custom Config**              | The custom configurations were overwritten by the default template.                      | Ensure your custom flags in the `config` or `data` sections are structured correctly so `deepMerge()` applies them over the `templateName` defaults.                                                                                                                          |

### Debugging Workflow for API Creation

When an API you just created isn't working as expected, follow these steps to isolate the issue:

1. **Verify the Registration:**
   The first step is always ensuring the framework actually sees your API. Check the server startup logs to confirm your `global.*_object` was loaded into memory. If it's a ProjectSpecific API, ensure its route structure doesn't conflict with a Default CRUD namespace.

2. **Check the Template Merge:**
   If your API is loading but ignoring your settings (e.g., expecting an access token when you disabled it), the `Crud_Template` might be incorrectly overwriting your object. Log the final resolved `apiObject` in the pipeline to verify that your specific configurations successfully merged over the template defaults.

3. **Validate the Parameter Mapping:**
   If SQL queries fail or insert `NULL` values, the disconnect is usually between the parameter definitions and the query string. Map the journey of the variable to ensure no typos exist:
   _Client Input_ ➔ _`CRUD_parameters.js` (`name` & `source`)_ ➔ _`dynamicKey`_ ➔ _SQL `{{dynamicKey}}` placeholder_.

4. **Isolate Custom Business Logic:**
   If a ProjectSpecific API is failing, isolate your `postProcessFunction`. Log the `decryptedPayload` at the very start of your custom function to ensure the middleware pipeline successfully handed off the cleaned and validated data before you execute your custom database queries.

---

# 10. Quick Reference Checklist

Use the following checklist whenever a new API is created.

### Before Creating the API

- [ ] Decide whether the API should be a **Default CRUD API** or a **ProjectSpecific API**.
- [ ] Create the API inside the correct folder.
- [ ] Follow the required `global.*_object` naming convention.

### Configure the API

- [ ] Configure authentication, permissions, encryption, OTP, and pagination if required.
- [ ] Define all request parameters (`CRUD_parameters.js`) for CRUD APIs.
- [ ] Write SQL queries using `{{placeholder}}` syntax (CRUD APIs).
- [ ] Implement custom business logic (`postProcessFunction`) for ProjectSpecific APIs.
- [ ] Configure request metadata and permissions.

### Final Verification

- [ ] Define meaningful success and error messages.
- [ ] Verify that the API Object loads correctly.
- [ ] Test the endpoint using the appropriate `/api/...` URL.

---

# 11. Related Documentation

The following documents provide additional details about the framework.

| Document                       | Description                                                                                                          |
| ------------------------------ | -------------------------------------------------------------------------------------------------------------------- | --- |
| **Middleware Pipeline**        | Explains how requests pass through the framework's three middleware stages.                                          |
| **Server Startup & Bootstrap** | Describes how API Objects are discovered and registered during server startup.                                       |
| **Encryption Flow**            | Explains how request and response encryption are configured and processed.                                           |
| **executeQueryWithPagination** | Describes how paginated SQL queries are generated and executed.                                                      |
| **Query Resolver**             | Explains how SQL placeholders are replaced with validated request values before query execution.                     |
| **API Creation Diagrams**      | Draw.io diagrams for this document are available in `Documentation/apiCreationProcess/apiCreationProcess Diagrams/`. |     |

---

# 12. Code References

The following files contain the primary implementation of the API framework and can be referred to for understanding each stage of the API lifecycle.

| Component                                      | Purpose                                                                      | Location                                                          |
| ---------------------------------------------- | ---------------------------------------------------------------------------- | ----------------------------------------------------------------- |
| **Dynamic Router**                             | Receives all `/api/*` requests and forwards them to the middleware pipeline. | `Src/Routes/dynamicRoutes.js`                                     |
| **Middleware Pipeline**                        | Executes the request through the framework's middleware stages.              | `Services/Middlewares/middlewares.js`                             |
| **Middleware Configuration**                   | Defines the middleware execution flow and resolves the API Object.           | `Services/Middlewares/config.js`                                  |
| **API Object Resolver (`getApiObject`)**       | Converts the request URL into the corresponding `global.*_object`.           | `Services/Middlewares/config.js`                                  |
| **CRUD API Generator**                         | Determines the CRUD operation and prepares the final API configuration.      | `Services/SysFunctions/ApiObjectFunctions/ApiObjectsGenerator.js` |
| **CRUD Base Template**                         | Provides the default configuration inherited by CRUD APIs.                   | `Src/Apis/Templates/CrudTemplates.js`                             |
| **Example Default CRUD API**                   | Demonstrates how a standard CRUD API Object is implemented.                  | `Src/Apis/GeneratedApis/Default/Users/Crud_Objects/Users.js`      |
| **Example ProjectSpecific API (LandingStats)** | Demonstrates a ProjectSpecific API with custom business logic.               | `Src/Apis/ProjectSpecificApis/LandingStats/landingStats.js`       |
| **Example ProjectSpecific API (PortalUsers)**  | Demonstrates another ProjectSpecific API implementation.                     | `Src/Apis/ProjectSpecificApis/PortalUsers/portalUsers.js`         |

---

# Conclusion

The CSAAS Backend framework follows an **Object-Based API Architecture**, where every API is defined as a configuration object instead of traditional Express route handlers.

By separating configuration, request validation, business logic, query execution, and response handling, the framework provides a consistent, secure, and maintainable approach to API development.

Developers should choose between **Default CRUD APIs** and **ProjectSpecific APIs** based on the complexity of the required functionality while following the framework's naming conventions and middleware pipeline.
