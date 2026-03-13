# Framework Advantages: A Comprehensive Overview

This document outlines the key advantages of using this Node.js server framework for building robust, secure, and maintainable APIs. Whether you're a seasoned developer or new to backend development, the framework is designed to accelerate development while maintaining high standards.

---

## Table of Contents

1. [Security](#security)
2. [Scalability](#scalability)
3. [Customisability](#customisability)
4. [Detailed Error Handling](#detailed-error-handling)
5. [Controlled Environments](#controlled-environments)
6. [Easy Access & Developer Experience](#easy-access--developer-experience)
7. [Low Technical Knowledge Skill Floor](#low-technical-knowledge-skill-floor)
8. [Easy Integrations](#easy-integrations)

---

## Security

The framework is built with security as a first-class concern, providing multiple layers of protection out of the box.

### Multi-Layer Authentication & Authorization

- **JWT Token Validation** – All protected endpoints validate access tokens with configurable expiration checks. Invalid or expired tokens are rejected and logged.
- **Role-Based Access Control (RBAC)** – Fine-grained permissions per endpoint via `permission` and `providedPermissions` in API config. Permissions are checked against `user_roles_designations_department` and `permissions` tables.
- **OTP Verification** – Optional OTP verification for sensitive operations (e.g., password reset, 2FA flows).

### Request-Level Security

- **Helmet** – Security headers including:
  - Content Security Policy (CSP)
  - X-Content-Type-Options (prevents MIME sniffing)
  - X-Frame-Options (prevents clickjacking)
  - HSTS (enforces HTTPS)
- **Rate Limiting** – 100 requests per minute per session/IP via `express-rate-limit`, protecting against brute-force and DoS attacks.
- **CORS** – Configurable CORS with explicit allowed methods (GET, POST, PUT, DELETE, OPTIONS) and headers (Authorization, encryptedrequest, accessToken, reqdata).

### Data Protection

- **Two-Layer Encryption** – Supports platform-level and request-specific encryption:
  - `platformEncryption` – Per-platform keys from `platforms` and `platform_versions` tables
  - `accessToken` / `plainKey` – Request-level encryption options
- **AES Encryption** – AES (CryptoJS, ECB, PKCS7) for encrypt/decrypt of sensitive payloads.
- **Password Hashing** – Argon2 for secure password verification.

### Security Auditing & Logging

- **Request Logging** – All requests logged to `requests.log` (method, URL, headers, body, query).
- **Security Log** – Failed logins (401) and rate-limit violations (429) logged to `security_log` with IP, user agent, method, URL, headers, body, and status.
- **Error Log** – Errors persisted to `error_log` with source, description, and SCC codes for traceability.

### Separate Security Database

- **Dedicated Security DB** – Authentication, permissions, error logs, and security events use a separate database, isolating sensitive data from application data.

---

## Scalability

The framework supports growth from prototype to production through connection pooling, database abstraction, and transaction support.

### Connection Pooling

- **Main & Security Pools** – Separate connection pools for application and security databases.
- **Configurable Limits** – MySQL/MySQL2 pools with `connectionLimit: 10`, `acquireTimeout: 60000`, `timeout: 60000`.
- **Connection Lifecycle** – Automatic acquire/release; `withConnection()` and `executeQuery()` handle pooling transparently.

### Database Abstraction

- **Multi-Database Support** – Switch between MySQL, MySQL2, PostgreSQL via `DB_TYPE` env variable.
- **DatabaseFactory** – Factory pattern for creating database instances; add new drivers without changing application code.
- **Query Parameter Conversion** – Automatic conversion of query parameters for different DB engines.

### Transaction Support

- **TransactionManager** – `withTransaction()` for BEGIN/COMMIT/ROLLBACK.
- **Consistent API** – Same interface across database types for transactional operations.

### Pagination

- **Built-in Pagination** – `pagination: { pageSize: 10 }` in API config; `executeQueryWithPagination` handles offset/limit.
- **Reduces Memory** – Large result sets can be paginated to avoid loading everything into memory.

### Horizontal Scaling Ready

- **Stateless Design** – JWT-based auth; no server-side session storage required.
- **Environment-Based Config** – Different `.env` per environment (dev/staging/prod) for scaling deployments.

---

## Customisability

The framework is highly configurable without requiring deep changes to core code.

### Per-API Configuration

Each API object supports granular feature toggles:

| Option | Purpose |
|-------|---------|
| `multistep` | Multi-step workflows for complex flows |
| `parameters` | Enable/disable parameter validation |
| `pagination` | Enable pagination for list endpoints |
| `encryption` | Platform, accessToken, or plainKey encryption |
| `otp` | OTP verification requirement |
| `accessToken` | Token validation requirement |
| `permission` | Required permission name |
| `providedPermissions` | Custom permission set for token generation |
| `requestMethod` | Allowed HTTP method(s) |

### Pre- and Post-Processors

- **preProcessFunctions** – Array of async functions run before query execution (e.g., `selectFilter`, custom validation).
- **postProcessFunction** – Single async function for response transformation (e.g., token generation, data enrichment).
- **payloadFunction** – Utility functions for payload manipulation.

### CRUD Templates

- **Crud_Template** – Reusable CRUD object; define `queryPayload` for Add/Update/View/Delete/List.
- **crudApiGenerator** – Automatically maps HTTP methods (POST→Add, GET→List/View, PUT→Update, DELETE→Delete).
- **Query Placeholders** – `{{id}}`, `{{username}}`, etc., with SQL escaping for safe substitution.

### Custom Validation

- **Global Validators** – Register `global[validationName]` for parameter validation.
- **Built-in Helpers** – `isValidPassword`, `isValidEmail`, etc., in `validateParameters.js`.

### Versioning

- **versionData** – Support for version ranges (e.g. `">1&<2"`, `"*"`).
- **Step Selection** – `req.query.step` for multi-step API flows.

### Extensible Middleware Pipeline

- **Staged Execution** – Add custom middleware stages in `config.js`.
- **Modular Handlers** – Token validation, permission check, parameter validation, query resolution, file handling are pluggable.

---

## Detailed Error Handling

Errors are handled consistently and provide actionable feedback to both developers and end users.

### Standardized Error Response Format

All responses follow a uniform structure:

```json
{
  "status": 400,
  "message": "Please check your input and ensure all required fields are filled correctly.",
  "payload": null,
  "source": "Parameter Validation",
  "scc": "E10"
}
```

- **status** – HTTP status code
- **message** – User-friendly, contextual message
- **payload** – Optional error details (e.g., validation errors)
- **source** – Middleware or component that raised the error
- **scc** – Standardised error code for client-side handling

### SCC (Standardised Error Codes)

| Code | Category | Example Message |
|------|----------|-----------------|
| E10 | Input validation | "Please check your input and try again" |
| E22 | System error | "A system error occurred. Please try again later" |
| E24 | Security verification | "Security verification failed. Please try again" |
| E31 | Permission denied | "You do not have permission to perform this action" |
| E40 | Auth failed | "Authentication failed. Please log in again" |
| E42 | OTP incorrect | "Verification code is incorrect. Please try again" |
| E50 | Resource not found | "The requested resource was not found" |
| E51 | Unsupported platform | "This platform or client is not supported" |
| E52 | Method not allowed | "This operation is not allowed" |
| E99 | Unexpected error | "An unexpected error occurred. Please try again or contact support" |

### Contextual Error Messages

`getContextualErrorMessage()` maps error source and SCC to user-friendly messages:

- **API Object Resolver** → "The requested service is currently unavailable"
- **Access Token Validator** → "Your session has expired. Please log in again"
- **OTP Verification** → "The verification code you entered is incorrect"
- **Permission Validator** → "You do not have the required permissions"
- **Parameter Validation** → "Please check your input and ensure all required fields are filled correctly"
- **Encryption** → "Security verification failed. Please refresh the page and try again"
- **Platform Validator** → "This platform or client is not supported"

### Error Logging & Persistence

- **Errorlog.js** – Logs to `error_log` with `error_description`, `error_source`, `scc`, timestamps.
- **Development Mode** – Stack traces in `NODE_ENV=development` for debugging.
- **Memory Cleanup** – `cleanupMemory()` in middleware `finally` block to avoid leaks; optional `global.gc()` in dev.

### Middleware Error Enrichment

`createMiddlewareError()` attaches `statusCode`, `errorSource`, `errorDescription`, `scc` to errors for consistent handling across the pipeline.

---

## Controlled Environments

Configuration and behaviour are controlled via environment variables and feature flags.

### Environment Variables

Centralised in `sample_env` and loaded via `dotenv`:

| Category | Variables |
|----------|-----------|
| **Server** | `SERVER_PORT`, `NODE_ENV`, `LOG_MESSAGES` |
| **Security** | `SECRET_KEY` |
| **Database** | `DB_TYPE`, `DB_HOST`, `DB_USER`, `DB_PW`, `DB_DATABASE`, `DB_PORT`, `DB_TIMEZONE` |
| **Security DB** | `SECURITY_DB_*` |
| **AWS S3** | `S3_ACCESS_KEY`, `S3_SECRET_ACCESS_KEY`, `S3_REGION` |
| **Email** | `EMAIL_USER`, `EMAIL_PASS` |
| **Payments** | `STRIPE_*`, `KUICKPAY_*`, `AUTHORIZE_NET_*` |
| **App** | `APP_URL`, `FRONTEND_URL` |

### Feature Toggles

- **LOG_MESSAGES** – `"true"` enables `logMessage()` for debugging.
- **NODE_ENV** – `"development"` enables stack traces and optional garbage collection.

### Database Selection

- **Connection Config** – `getConnectionConfig()` resolves `"main"`, `"securitydb"`, or custom DB names.
- **Per-Query Database** – Each API can specify `database: "mainDb"` or another configured database.

### Platform & Version Control

- **Platform Validation** – `platforms` and `platform_versions` tables control which clients can access APIs.
- **Version Ranges** – APIs can be restricted to specific app versions.

---

## Easy Access & Developer Experience

The framework is designed for quick setup and intuitive usage.

### 5-Minute Setup

1. Clone the repository
2. `npm install`
3. Copy `sample_env` to `.env` and configure DB credentials
4. `npm start`
5. APIs are live at `http://localhost:SERVER_PORT/api/*`

### Automatic API Discovery

- **Filesystem Bootstrap** – All `.js` files under `Src/Apis` are auto-loaded (except blacklisted folders).
- **Convention-Based Routing** – `/api/createaccesstoken` → `CreateAccessToken_object`; `/api/resource/subresource` → `ResourceSubresource_object`.
- **No Manual Route Registration** – Add a file, export a `global.*_object`, and it’s available.

### Declarative API Definition

Define behaviour via config instead of writing route handlers:

```javascript
global.MyApi_object = {
  versions: {
    versionData: [{ "*": { steps: [{ config: {...}, data: {...}, response: {...} }] } }]
  }
};
```

### Standard Response Format

- **sendResponse(res, status, message, payload, SCC, source)** – Consistent JSON responses.
- **File Responses** – Automatic file sending when `payload.return.filePath` is present.

### Directory Conventions

- **ProjectSpecificApis** – Place custom APIs here.
- **GeneratedApis/Custom** – Generated or scaffolded APIs.
- **Templates** – Reusable CRUD and test templates.

---

## Low Technical Knowledge Skill Floor

Developers with varying experience can be productive quickly.

### Configuration Over Code

- **CRUD Without SQL** – Use templates and `queryPayload`; minimal SQL knowledge required for simple CRUD.
- **Feature Flags** – Enable encryption, OTP, pagination via config, not code.
- **Permission Names** – String-based permissions; no complex RBAC implementation needed.

### Reusable Patterns

- **Crud_Template** – Copy, rename table, adjust queries.
- **RegularApi_object** – For simple data retrieval; define `query` and `parameters`.

### Built-in Validation

- **Parameter Validation** – Declare `parameters` with `name`, `source`, `required`, `validations`.
- **Validation Middleware** – Uses `global[validationName]`; plug in validators without understanding middleware internals.

### Clear Conventions

- **Naming** – `CamelCase_object` for API objects.
- **Structure** – `config`, `data`, `response` in each step.
- **README** – Documents API object structure, middleware, security, and best practices.

### Minimal Boilerplate

- **No Express Route Setup** – Dynamic routing handles `/api/*`.
- **No Manual Auth Wiring** – Set `accessToken: true` in config.
- **No Manual Permission Checks** – Set `permission: "view_resource"` in config.

---

## Easy Integrations

The framework includes integrations for common external services.

### Payment Gateways

- **PaymentGatewayFactory** – Create gateway instances by name.
- **PaymentGatewayManager** – Unified API: `initiatePayment`, `confirmPayment`, `processWebhook`, `updateStatus`, `createPaymentMethod`, `createCustomer`, etc.
- **Supported Gateways** – Stripe, Chase Bank (Authorize.net), KuickPay, Apple Pay.
- **Webhooks** – `PaymentWebhookRouter` for `/webhook/:gateway`, `/success/:gateway`, `/failure/:gateway`, `/status/:transaction_id`.
- **Apple App Store** – `/webhooks/apple/webhook` for App Store Server notifications.

### File Storage

- **Local & S3** – `Services/Integrations/FileHandling/` supports local storage and AWS S3.
- **Presigned URLs** – S3 presigned URLs for secure uploads/downloads.
- **Multer** – Configurable file upload handling.

### Email

- **Nodemailer** – Gmail and other SMTP providers via `EMAIL_USER`, `EMAIL_PASS`.
- **OTP & Notifications** – Built-in support for OTP sending and verification.

### AI Services

- **OpenAI** – Integration in `Services/Integrations/AI/`.
- **LMStudio** – Local LLM integration.

### Cron Jobs

- **node-cron** – Scheduled tasks (e.g., subscription auto-renewal) in `Services/Integrations/CronJobs/`.

### Database Flexibility

- **MySQL / MySQL2 / PostgreSQL** – Switch via `DB_TYPE`.
- **Multiple Databases** – Main app DB and security DB; extendable to more.

### Adding New Integrations

- **Factory Pattern** – Follow `PaymentGatewayFactory` for new payment gateways.
- **Config Templates** – `getGatewayConfigTemplate()` for consistent setup.
- **Webhook Router** – Mount new webhook routes in `app.js`.

---

## Summary

| Advantage | Key Benefit |
|-----------|-------------|
| **Security** | Multi-layer auth, encryption, rate limiting, security logging |
| **Scalability** | Connection pooling, multi-DB support, transactions, pagination |
| **Customisability** | Per-API config, pre/post processors, CRUD templates, versioning |
| **Detailed Errors** | SCC codes, contextual messages, structured responses, error logging |
| **Controlled Environments** | Env-based config, feature toggles, platform/version control |
| **Easy Access** | 5-minute setup, auto-discovery, declarative APIs, conventions |
| **Low Skill Floor** | Config over code, templates, built-in validation, clear docs |
| **Easy Integrations** | Payments, S3, email, AI, cron, multi-DB, extensible factories |

---

*This framework enables teams to build secure, scalable APIs with minimal boilerplate while maintaining flexibility for complex requirements.*
