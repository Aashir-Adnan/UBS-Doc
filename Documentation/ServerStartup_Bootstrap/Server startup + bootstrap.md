# Server Startup & Bootstrap

## 1. Purpose

This document explains how the CSAAS backend framework starts, initializes its required services, and prepares the server to handle incoming requests.

This document describes the startup sequence, the responsibilities of the bootstrap process, and the important code locations involved during application initialization.

---

# 2. Scope

This document covers:

- Server startup sequence
- Bootstrap initialization process
- Express application initialization
- Route registration
- Startup services executed before the server begins accepting requests

---

# 3. Learning Objectives

After reading this document, a developer should be able to:

- Understand how the backend server starts.
- Identify the entry point of the application.
- Understand the purpose of the bootstrap process.
- Follow the startup sequence from initialization to a running server.
- Locate the files responsible for server initialization.

---

# 4. Important Code Locations

| Code Location                                                       | Purpose                                                           |
| ------------------------------------------------------------------- | ----------------------------------------------------------------- |
| `Src/server.js`                                                     | Main application entry point responsible for starting the server. |
| `Src/app.js`                                                        | Creates and configures the Express application.                   |
| `Src/Bootstrap/`                                                    | Initializes framework services before the server starts.          |
| `Config/Security/securityConfig.js`                                 | Registers global middleware and security configuration.           |
| `Src/Routes/`                                                       | Registers application routes.                                     |
| `Services/SysFunctions/LogFunctions/logger.js`                      | Initializes the runtime logging system.                           |
| `Services/SysScripts/DatabaseScripts/runMigrationsOnStart.js`       | Executes pending database migrations during startup.              |
| `Services/SysScripts/DatabaseScripts/importDocumentationOnStart.js` | Imports project documentation into the database.                  |
| `Services/SysScripts/DatabaseScripts/exportSchemaOnStart.js`        | Exports the current database schema.                              |

---

# 5. Startup Overview

The server startup process consists of multiple initialization stages that execute before the application begins accepting client requests.

Each stage prepares a different part of the framework, ensuring that required services are available before the HTTP server starts.

At a high level, the startup sequence performs the following tasks:

1. Load environment variables.
2. Initialize the logging system.
3. Initialize API Modules.
4. Execute pending database migrations.
5. Import project documentation.
6. Export the latest database schema.
7. Pull Repositories (optional).
8. Initialize scheduled background jobs.
9. Configure the Express application.
10. Register middleware and routes.
11. Start the HTTP server.

Only after all initialization steps complete successfully does the framework begin accepting incoming requests.

---

# 6. Server Startup Flow

The Server Startup Flow diagram is maintained separately

**Diagram Location:**

`Documentation/ServerStartup_Bootstrap/ServerStartup_Bootstrap Diagrams/Server Startup Flow`

The diagram illustrates the complete server startup sequence from application startup to a fully initialized server.

# 7. High-Level Startup Sequence

The server startup begins from the application's entry point (`Src/server.js`).

When the application starts, the framework first loads all required environment variables and imports the modules required during initialization.

Instead of immediately starting the Express server, the framework executes a series of bootstrap operations. These operations prepare the application by initializing essential services such as logging, filesystem setup, database migrations, documentation import, schema export, repository synchronization, and scheduled background jobs.

Once the bootstrap process completes successfully, the framework imports and initializes the configured Express application using `Src/app.js`. During this stage, global middleware is registered, application routes are loaded, and endpoint configurations are prepared.

Finally, the HTTP server begins listening on the configured port, allowing the framework to accept incoming client requests.

If any critical initialization step fails during startup, the startup process is terminated before the server begins listening. This prevents the framework from running in an incomplete or inconsistent state.

---

# 8. Server Startup Process (`Src/server.js`)

The server startup process begins in `Src/server.js`, which serves as the application's main entry point.

Instead of immediately starting the Express server, the framework performs a sequence of initialization tasks to prepare the environment, required services, and supporting resources. These tasks are executed inside an asynchronous startup function to ensure that each step completes successfully before the next one begins.

The startup sequence is executed in the following order:

```text
Load Environment Variables
        │
        ▼
Initialize Logger
        │
        ▼
Initialize API Modules
        │
        ▼
Run Database Migrations
        │
        ▼
Import Documentation
        │
        ▼
Export Database Schema
        │
        ▼
Pull Repositories (Optional)
        │
        ▼
Initialize Cron Jobs
        │
        ▼
Start Express Server
```

Each stage has a specific responsibility during framework initialization.

---

# 8.1 Load Environment Variables

```javascript
require("./Bootstrap/env");
```

## Purpose

The first step loads the application's environment variables.

These variables contain configuration values that are required throughout the framework, such as:

- Database configuration
- API keys
- Runtime configuration (Server port, Feature flags)

Loading the environment variables at the beginning ensures that every module initialized afterward has access to the required configuration.

---

# 8.2 Initialize the Logging System

```javascript
initializeLogger();
```

## Purpose

The logging system is initialized before any other startup task.

This allows all subsequent initialization steps to record messages, warnings, and errors consistently.

Depending on the configured logging mode, runtime logs may be written to the terminal or stored in a structured log file.

Initializing the logger first ensures that failures occurring during startup can be captured and reviewed.

---

# 8.3 Initialize API Modules

```javascript
initFolders();
```

## Purpose

The framework scans the `Src/Apis` directory, recursively loads all API module files, and prepares them for use during application startup. Blacklisted folders are skipped, and the `Src/Apis` directory is created automatically if it does not already exist.

---

# 8.4 Execute Database Migrations

```javascript
await runMigrationsOnStart();
```

## Purpose

The framework checks whether any pending database migrations need to be executed.

Running migrations during startup ensures that the database schema matches the version expected by the application before any requests are processed.

If the database structure is outdated, the required migrations are applied automatically before the server continues initialization.

---

# 8.5 Import Documentation

```javascript
await importDocumentationOnStart();
```

## Purpose

The framework scans the configured documentation directories for Markdown and HTML files.

New or modified documentation is automatically imported into the documentation database.

To improve performance, unchanged files are skipped using file metadata and checksum comparison.

This allows the documentation database to remain synchronized with the project's documentation files.

---

# 8.6 Export Database Schema

```javascript
await exportSchemaOnStart();
```

## Purpose

After the database is ready, the framework exports the current database schema.

The exported schema provides an up-to-date representation of the database structure and can be used for documentation, database comparison, or development purposes.

This operation does not modify the database; it only generates a schema file.

---

# 8.7 Repository Synchronization (Optional)

```javascript
await pullAllRepos();
```

## Purpose

Repository synchronization is an optional startup step. This step is controlled by the `REPOS_PULL_ON_STARTUP` environment configuration.

If enabled through the environment configuration, the framework automatically pulls the latest changes from configured repositories before completing startup.

This behavior can be disabled using the startup configuration.

---

# 8.8 Initialize Scheduled Jobs

```javascript
initCron();
```

## Purpose

After the framework has completed all initialization tasks, scheduled background jobs are registered.

These jobs execute automatically according to their configured schedules without requiring user interaction.

Examples may include maintenance tasks, automated synchronization, or periodic background processing.

---

# 8.9 Import the Express Application

```javascript
const app = require("./app");
```

## Purpose

After the bootstrap process completes successfully, the configured Express application is imported from `Src/app.js`.

The application object is responsible for:

- Registering middleware
- Registering routes
- Configuring request handling
- Preparing the Express application for server startup.

The detailed Express configuration is covered later in this document.

---

# 8.10 Start the HTTP Server

```javascript
app.listen(PORT);
```

## Purpose

This is the final stage of the startup process.

Once every initialization task has completed successfully, the HTTP server begins listening on the configured port using the configured Express application.

At this point, the framework is fully initialized and ready to receive incoming client requests.

---

# 8.11 Startup Failure Handling

The startup process is wrapped inside a `try...catch` block.

If any critical initialization step throws an exception:

- The error is logged.
- The startup process is terminated.
- The server does not begin accepting requests.

This approach prevents the framework from running with incomplete initialization, missing dependencies, or inconsistent system state.

# 9. Bootstrap Components

The Src/Bootstrap/ module contains the core bootstrap components responsible for preparing the framework before the Express application is initialized.

The Bootstrap Components diagram can be found in the following file:

`Documentation/ServerStartup_Bootstrap/`Documentation/ServerStartup_Bootstrap Diagrams/Bootstrap Components`

Instead of placing all initialization logic inside `server.js`, the framework separates startup responsibilities into individual bootstrap components. Each component performs a specific task during application initialization, making the startup process modular, maintainable, and easier to understand.

## 9.1 Environment Configuration (`Bootstrap/env.js`)

### Responsibility

Loads the application's environment variables from the `.env` file before any other framework component is initialized.

This ensures that configuration values such as database credentials, server settings, API keys, feature flags, and runtime options are available throughout the startup process.

---

## 9.2 Filesystem Initialization (`Bootstrap/filesystem.js`)

### Responsibility

Scans the `Src/Apis` directory during startup and recursively loads all API module files required by the framework.

If the `Src/Apis` directory does not exist, it is created automatically. Blacklisted folders are skipped, and all valid JavaScript API modules are imported to prepare them for use by the framework.

---

## 9.3 Repository Startup (`Bootstrap/startup.js`)

### Responsibility

Handles repository synchronization during startup.

If enabled through the environment configuration, the framework pulls the latest changes from the configured repositories before completing the startup process.

---

## 9.4 Cron Initialization (`Bootstrap/cron.js`)

### Responsibility

Registers scheduled background jobs after the framework has completed its initialization.

These jobs execute automatically according to their configured schedules and support recurring framework operations such as maintenance and synchronization.

---

## 9.5 Bootstrap Responsibilities

Collectively, the bootstrap components are responsible for:

- Loading application configuration.
- Loading API modules from the `Src/Apis` directory.
- Synchronizing repositories.
- Registering scheduled background jobs.
- Preparing the runtime environment before the Express application is initialized.

By completing these tasks during startup, the framework ensures that all required resources and services are available before processing any client requests.

Once the bootstrap phase completes successfully, control returns to `server.js`, where the Express application is started.

# 10. Express Application Initialization (`Src/app.js`)

After the bootstrap process completes, the framework initializes the Express application.

The purpose of `Src/app.js` is to configure the application before it begins accepting incoming requests.

This file is responsible for registering middleware, loading routes, and configuring application-level behavior.

---

# 10.1 Express Application Creation

```javascript
const express = require("express");

const app = express();
```

## Purpose

The Express application serves as the central object responsible for handling all incoming HTTP requests.

Every request received by the server passes through this application before reaching the appropriate API endpoint.

At this stage, the application has been created but is not yet configured.

---

# 10.2 Apply Global Middleware

```javascript
applyMiddleware(app);
```

## Purpose

The framework registers all global middleware before any routes are loaded.

Middleware executes before the request reaches an API endpoint and performs common processing tasks required by the framework.

Typical responsibilities include:

    - Request Parsing (Reads and prepares incoming client requests for processing).
    - Security Configuration (Applies security settings to protect the application).
    - CORS Configuration (Controls which external applications or websites can access the API).
    - Request Validation (Checks whether incoming requests contain valid and required data).
    - Global Request Preprocessing (Performs common processing on every request before it reaches the API).

By registering middleware first, every incoming request is processed consistently before reaching the application's business logic.

> The complete middleware execution process is documented separately in **Middleware Pipeline and API Processing**.

---

# 10.3 Register Application Routes

After the middleware has been configured, the framework registers the application's routes.

```javascript
app.use("", apiRoutes());
```

## Purpose

This step loads the framework's primary API routes.

Once registered, incoming requests are matched to their corresponding API definitions and processed by the framework.

This serves as the main entry point for application APIs.

---

# 10.4 Register Deployment Routes

```javascript
app.use("/api/deployments/stream", ...);

app.use("/api/deploy/callback", ...);
```

## Purpose

Certain deployment-related endpoints require specialized request handling.

These routes are registered before the main dynamic routing system to ensure they are processed independently.

This allows deployment-specific functionality to bypass the standard request resolution process when necessary.

---

# 10.5 Register Webhook Routes

```javascript
app.use("/webhooks", ...);
```

## Purpose

Webhook routes receive requests initiated by external services rather than client applications.

Registering these routes separately provides a dedicated entry point for third-party integrations while keeping them isolated from the primary API routes.

---

# 10.6 Register Upload Routes

```javascript
app.use("/upload", ...);
```

## Purpose

The upload routes handle requests involving file uploads.

Separating upload functionality into its own routing module improves modularity and simplifies maintenance.

---

# 10.7 Root Route

```javascript
app.get("/", ...);
```

## Purpose

The root endpoint provides a simple response when the application's base URL is accessed.

In the current implementation, users accessing the root endpoint are redirected to the project's documentation website.

This provides developers with quick access to the framework documentation.

---

# 10.8 Export the Express Application

```javascript
module.exports = app;
```

## Purpose

After all middleware and routes have been registered, the configured Express application is exported.

The exported application is then imported by `Src/server.js`, where it begins listening for incoming requests using `app.listen()`.

---

# 10.9 Express Initialization Flow

The Express Initialization Flow diagram is available at the following location:

`Documentation/ServerStartup_Bootstrap/ServerStartup_Bootstrap/Express initialization flow`

The diagram illustrates the sequence used to configure the Express application before the HTTP server starts.

# 10.10 Summary

The responsibility of `Src/app.js` is to configure the Express application before it becomes available to clients.

During initialization, the application:

- Creates the Express instance.
- Registers global middleware.
- Registers deployment routes.
- Registers application API routes.
- Registers webhook routes.
- Registers upload routes.
- Configures the root endpoint.
- Exports the configured application for server startup.

Once these steps are complete, control returns to `server.js`, which starts the HTTP server and begins accepting incoming requests.

---

# 11. Common Startup Errors and Debugging

The following table lists common startup issues and recommended debugging steps.

| Error                              | Possible Cause                                    | Recommended Debugging                                                       |
| ---------------------------------- | ------------------------------------------------- | --------------------------------------------------------------------------- |
| Environment variables not loaded   | Missing or invalid `.env` configuration           | Verify the `.env` file and confirm that all required variables are present. |
| Logger initialization failure      | Invalid logging configuration                     | Verify the configured logging mode and log file location.                   |
| API module initialization failure  | Missing or invalid API module                     | Verify the `Src/Apis` directory and review the startup logs.                |
| Database migration failure         | Database unavailable or migration error           | Verify the database connection and review the migration logs.               |
| Documentation import failure       | Missing documentation directory or database error | Verify the documentation path and database connectivity.                    |
| Schema export failure              | Database connection failure                       | Verify the database configuration and connection status.                    |
| Repository synchronization failure | Repository unavailable or Git configuration issue | Verify the repository configuration and Git access.                         |
| Cron initialization failure        | Invalid scheduled task configuration              | Review the cron job configuration and startup logs.                         |
| Server startup failure             | Port unavailable or startup exception             | Verify the configured server port and review the application logs.          |

---

# 12. Developer Notes

The startup sequence follows a fail-fast approach.

If any critical initialization step fails, the startup process is terminated before the HTTP server begins accepting requests.

This behavior prevents the framework from running with incomplete initialization or inconsistent application state.

Initialization tasks are executed sequentially to ensure that dependent components are available before the next stage begins.

For example:

- Database migrations are completed before the application starts.
- Documentation is imported before the server becomes available.
- Scheduled jobs are registered only after initialization is complete.

This startup strategy improves framework reliability and reduces runtime initialization errors.

---

# 13. Related Documentation

The startup process prepares the framework but does not process client requests.

The following documents describe the remaining stages of the framework:

| Document                               | Description                                                                                                                                        |
| -------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| Middleware Pipeline and API Processing | Explains how incoming requests are processed after the server starts.                                                                              |
| API Creation Process                   | Explains how new APIs are created and registered within the framework.                                                                             |
| Query Resolver                         | Describes how framework queries are executed.                                                                                                      |
| Database Layer                         | Explains how the framework connects to the database, executes queries, and manages database interactions.                                          |
| Encryption Flow                        | Explains the framework's encryption and decryption process.                                                                                        |
| executeQueryWithPagination             | Describes pagination, filtering, sorting, and query execution features.                                                                            |
| Server Startup Diagrams                | The diagrams for the startup flow and bootstrap process are available in `Documentation/ServerStartup_Bootstrap/ServerStartup_Bootstrap Diagrams`. |

---

# 14. Conclusion

The server startup process is responsible for preparing every core component required by the framework before it begins handling client requests.

Rather than immediately starting the HTTP server, the framework performs a controlled initialization sequence that configures the runtime environment, initializes essential services, prepares supporting resources, and registers application components.

By separating the startup process from request processing, the framework provides a predictable initialization lifecycle that simplifies maintenance, improves reliability, and ensures that the application is fully prepared before serving client requests.

Once the startup sequence is complete, the framework transitions to the request processing phase, where incoming requests are handled through the middleware pipeline and routed to the appropriate API definitions.
