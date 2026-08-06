# The Middleware Pipeline and API Processing

## 1. Introduction

In the CSAAS Backend framework, all API requests are processed through a single middleware pipeline.

Unlike a traditional Express.js application, where individual middlewares are attached to different routes, this framework uses one centralized pipeline (`middlewareHandler`) to process every request received on `/api/*`.

When a request arrives, the middleware pipeline automatically:

- identifies the correct API Object,
- validates the request,
- performs authentication and security checks,
- executes the required business logic or database query, and
- prepares the final response.

The behavior of the pipeline is controlled by the API Object associated with the requested endpoint. Based on the API Object configuration, the framework decides which middleware should run and in what order.

The middleware execution order is defined in `Services/Middlewares/config.js`, ensuring that every request follows the same processing flow throughout the application.

---

## 2. Objects Shared Throughout the Pipeline

When a request enters the `middlewareHandler`, the framework creates three objects that are shared across all middleware stages.

As the request moves through the pipeline, different middlewares read from and update these objects. This allows information collected in one stage to be reused in later stages.

| Object             | Purpose                                                                                                                                       |
| ------------------ | --------------------------------------------------------------------------------------------------------------------------------------------- |
| `apiObject`        | Contains the complete configuration for the requested API, including security settings, validation rules, SQL queries, and response messages. |
| `decryptedPayload` | Stores the request data after decryption. As the request is processed, validated values and query results are added to this object.           |
| `payload`          | Stores the final response that will be returned to the client, including the response data and any updated access token.                      |

### How These Objects Move Through the Pipeline

The same three objects are passed from one middleware to the next.

For example:

1. The encryption middleware decrypts the request and stores it in `decryptedPayload`.
2. The parameter validator reads values from `decryptedPayload`.
3. The Query Resolver adds the database results to `decryptedPayload`.
4. The response middleware prepares the final `payload` and sends it back to the client.

This approach allows every middleware to share information without repeatedly reading the original request.

---

## 3. The Three Stages of the Pipeline

The middleware pipeline processes every API request in three sequential stages:

1. **PreProcessing** – Identifies the request and prepares it for execution.
2. **Processing** – Validates the request and executes the required business logic or database query.
3. **PostProcessing** – Prepares and sends the final response to the client.

If any middleware encounters an error, the pipeline immediately stops executing the remaining steps and transfers control to the error handler.

---

### Stage 1: PreProcessing

The purpose of the PreProcessing stage is to identify the requested API, prepare the request, and build the API configuration before any business logic is executed.

| Middleware                         | Purpose                                                                                                                                                                                           |
| ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **`getApiObjectHandler`**          | Converts the request URL into the corresponding API Object name, loads it from the global scope, and merges it with its base template (if one is defined).                                        |
| **`handleVersionCheckingHandler`** | Detects the client's platform and application version, then loads any version-specific API configuration if available.                                                                            |
| **`apiGeneratorHandler`**          | Generates the required CRUD configuration for APIs that use the CRUD API Generator.                                                                                                               |
| **`platformConfigHandler`**        | Loads platform-specific configuration (such as Web or Mobile). If the platform is unsupported, the request is rejected.                                                                           |
| **`encryptionHandler`**            | If request encryption is enabled, decrypts the incoming request body and stores the decrypted data in `decryptedPayload`. Otherwise, it copies the request body directly into `decryptedPayload`. |
| **`requestMethodValidator`**       | Verifies that the requested HTTP method (GET, POST, PUT, DELETE, etc.) is allowed for the current API.                                                                                            |

**Result of PreProcessing**

At the end of this stage, the framework has:

- Identified the correct API Object.
- Built the final API configuration.
- Prepared the request data.
- Verified that the request method is valid.

---

### Stage 2: Processing

The Processing stage validates the request, enforces security rules, and executes the API's business logic or database queries.

| Middleware                   | Purpose                                                                                                                         |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| **`execReqProcessFuncs`**    | Executes global request-processing functions (such as filters) before validation begins.                                        |
| **`accessTokenValidator`**   | Validates the client's access token. If the token is close to expiring, a new token is generated automatically.                 |
| **`otpVerificationHandler`** | Validates the One-Time Password (OTP) if OTP verification is enabled.                                                           |
| **`permissionHandler`**      | Verifies that the authenticated user has the required permission to access the API.                                             |
| **`fileHandlerExecutor`**    | Processes uploaded files when the API supports file uploads.                                                                    |
| **`parameterValidator`**     | Validates all request parameters using the definitions in the API Object.                                                       |
| **`preProcessHandler`**      | Executes any custom pre-processing functions before the database query runs.                                                    |
| **`queryResolverHandler`**   | Resolves SQL placeholders, executes the database query, and stores the query results in `decryptedPayload.queryResolverOutput`. |

**Result of Processing**

At the end of this stage, the framework has:

- Authenticated and authorized the request.
- Validated all required input.
- Executed any custom pre-processing functions.
- Executed the required database query.
- Stored the query results for the next stage.

---

### Stage 3: PostProcessing

The PostProcessing stage prepares the final response and sends it back to the client.

| Middleware               | Purpose                                                                                                                                |
| ------------------------ | -------------------------------------------------------------------------------------------------------------------------------------- |
| **`postProcessHandler`** | Executes the custom `postProcessFunction` (if one is defined). Otherwise, it uses the database results returned by the Query Resolver. |
| **`responseSender`**     | Builds the final HTTP response, encrypts it if required, attaches any renewed access token, and sends the response to the client.      |

**Result of PostProcessing**

At the end of this stage, the framework has:

- Prepared the final response.
- Applied response encryption if enabled.
- Attached any renewed access token.
- Returned the completed response to the client.

The Client Request Processing diagram is available at the following location:

`Documentation/middlewarePipelineProcessing/middlewarePipelineProcessing Diagrams/client_request_processing`

---

## 4. Error Handling and Standardized Error Codes

If an error occurs while processing a request, the framework does not crash or expose internal error details to the client.

Instead, every middleware reports the error to a centralized error handling system, which generates a consistent error response.

### `createMiddlewareError`

When a middleware encounters an error, it creates a standardized error object using `createMiddlewareError`.

This object contains:

- **`statusCode`** – The HTTP status code returned to the client (for example, `400` or `401`).
- **`errorSource`** – The name of the middleware where the error occurred.
- **`scc`** – A Standardized Client Code (SCC) used to identify the error consistently across the application.

### Standardized Client Codes (SCC)

The framework maps HTTP status codes to predefined SCC values. This ensures that every API returns errors in a consistent format.

| HTTP Status | SCC Code | Meaning                                                               |
| ----------- | -------- | --------------------------------------------------------------------- |
| `400`       | `E10`    | Bad Request – Invalid or missing request data.                        |
| `401`       | `E40`    | Authentication Failed – Invalid or expired access token.              |
| `403`       | `E31`    | Forbidden – The user does not have permission to perform this action. |
| `404`       | `E50`    | Not Found – The requested API Object does not exist.                  |
| `409`       | `E52`    | Conflict – The requested operation cannot be completed.               |
| `500`       | `E99`    | Internal Server Error – An unexpected error occurred.                 |

### Error Flow

If an error occurs during request processing, the framework:

1. Stops executing the remaining middleware.
2. Creates a standardized error object.
3. Logs the error for debugging purposes.
4. Formats the response using the appropriate SCC code.
5. Returns a consistent error response to the client.

### Debugging Workflow for the Pipeline

If a request is failing as it travels through the `middlewareHandler`, use the terminal logs and the three shared state objects to trace the execution.

1. **Locate the Failure Point (The `errorSource`):**
   When the pipeline crashes, the terminal console prints a color-coded trace containing the `errorSource`. Because the pipeline runs sequentially, if `parameterValidator` throws an error, you immediately know that PreProcessing (Stage 1) succeeded, but the request never reached `queryResolverHandler`.
2. **Inspect the `apiObject` (The Rulebook):**
   If a middleware behaves incorrectly (e.g., trying to validate an OTP when it shouldn't), the API Object configuration is likely wrong. Temporarily log `apiObject.config` in the pipeline right before the failing middleware runs to verify the feature flags.
3. **Inspect the `decryptedPayload` (The Workbench):**
   A common mistake is assuming client data is available in `req.body` or `req.query`. Remember that the pipeline moves cleaned and decrypted data into `decryptedPayload`. If `parameterValidator` or `queryResolverHandler` fails, log `decryptedPayload` to verify the data was correctly carried over from Stage 1.
4. **Verify the `payload` (The Shipping Box):**
   If the API executes successfully but the client receives an empty response, the issue is in Stage 3 (PostProcessing). Verify that the `postProcessHandler` correctly mapped the final database results or custom function returns into `payload.return`.

---

## 5. Memory Management (Cleanup Phase)

During request processing, the middleware pipeline may temporarily store request data, uploaded files, and database query results.

After the request has been completed, this temporary data is no longer required. To prevent unnecessary memory usage, the framework performs a cleanup phase.

### Clearing Temporary Data

The framework first removes large temporary objects that are no longer needed.

```javascript
decryptedPayload.queryResolverOutput = null;
decryptedPayload.request_body = null;
queryResolverOutput.results = null;
```

### Recursive Memory Cleanup

After clearing the temporary data, the framework calls the `cleanupMemory` function.

This function recursively traverses the shared objects (`payload`, `decryptedPayload`, and `apiObject`) and clears any remaining nested objects.

This allows the JavaScript garbage collector to reclaim the memory once the request has finished.

### Why Memory Cleanup Is Important

Memory cleanup provides several benefits:

- Prevents unnecessary memory usage.
- Reduces the risk of memory leaks.
- Improves application stability.
- Helps maintain consistent performance when processing many requests.

The Memory Cleanup Process diagram is available at the following location:

`Documentation/middlewarePipelineProcessing/middlewarePipelineProcessing Diagrams/memory_cleanup_process`

---

## 6. The Complete Pipeline Flow

The following diagram summarizes the complete lifecycle of an API request as it moves through the middleware pipeline.

The request passes through three main stages:

- **PreProcessing** – Identifies the API, prepares the request, and validates the initial configuration.
- **Processing** – Performs authentication, validation, permission checks, and executes the required database queries or business logic.
- **PostProcessing** – Prepares the final response and sends it back to the client.

After the response is sent, the framework performs memory cleanup to release temporary objects. If an error occurs at any stage, the remaining pipeline is skipped, the error is logged, and a standardized error response is returned to the client.

The Request Processing Flow diagram is available at the following location:

`Documentation/middlewarePipelineProcessing/middlewarePipelineProcessing Diagrams/request_processing_flow`

### Flow Summary

1. The client sends a request to the middleware pipeline.
2. The framework prepares the request during **PreProcessing**.
3. The request is validated and processed during **Processing**.
4. The response is prepared and returned during **PostProcessing**.
5. The framework releases temporary memory after the request is completed.
6. If an error occurs at any stage, the pipeline stops, logs the error, returns a standardized error response, and performs memory cleanup.

---

## 8. Quick Reference Checklist

When debugging or expanding the middleware pipeline, keep this checklist in mind:

- [ ] **Are you adding a new middleware?** It must be registered in the `middleware_config` array in `Services/Middlewares/config.js`.
- [ ] **Does it need data?** Middlewares should pull from `decryptedPayload` or `apiObject`, NOT directly from raw `req` streams if possible.
- [ ] **Are you throwing an error?** Always use `createMiddlewareError` and never throw raw strings, to ensure the SCC logs correctly.
- [ ] **Are you creating large objects (such as uploaded files or database query results)?** Clear them by setting them to `null` in the `finally` block so the framework can release the memory after the request is complete.

---

## 9. Related Documentation

The following documents provide additional details about different parts of the request processing framework.

| Document                         | Description                                                                                                                |
| -------------------------------- | -------------------------------------------------------------------------------------------------------------------------- | --- |
| **API Creation Process**         | Explains how to create API Objects and how they are discovered and executed by the middleware pipeline.                    |
| **Encryption Flow**              | Explains how the `encryptionHandler` encrypts and decrypts request and response data.                                      |
| **executeQueryWithPagination**   | Describes how the Query Resolver generates and executes paginated database queries.                                        |
| **Query Resolver**               | Explains how SQL placeholders are resolved and database queries are prepared before execution.                             |
| **Middleware Pipeline Diagrams** | The Draw.io diagrams are available in `Documentation/middlewarePipelineProcessing/middlewarePipelineProcessing Diagrams/`. |     |

---

## 10. Code References

The following files contain the primary implementation of the middleware pipeline.

| Component                                     | Purpose                                                                        | Location                                     |
| --------------------------------------------- | ------------------------------------------------------------------------------ | -------------------------------------------- |
| **Middleware Engine (`middlewareHandler`)**   | Entry point of the middleware pipeline that processes every API request.       | `Services/Middlewares/middlewares.js`        |
| **Pipeline Configuration**                    | Defines the execution order of all middleware stages and middleware functions. | `Services/Middlewares/config.js`             |
| **Error Formatter (`createMiddlewareError`)** | Creates standardized error objects used throughout the middleware pipeline.    | `Services/Middlewares/config.js`             |
| **SCC Logger (`LogError`)**                   | Formats, logs, and returns standardized error responses using SCC codes.       | `Services/Integrations/Database/Errorlog.js` |
| **Memory Cleanup (`cleanupMemory`)**          | Releases temporary objects after request processing to reduce memory usage.    | `Services/Middlewares/middlewares.js`        |

---

## Conclusion

The CSAAS Backend framework processes every API request through a centralized middleware pipeline.

By separating request preparation, validation, business logic execution, response generation, and memory cleanup into dedicated stages, the framework provides a consistent, secure, and maintainable approach to request processing.

Developers only need to configure their API Objects, while the middleware pipeline automatically handles the complete request lifecycle from receiving the request to returning the final response.
