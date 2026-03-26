# UBS Framework — Features & Advantages

## 1. Props-Driven Architecture (Core Philosophy)

Every component accepts three standardized configuration objects — `data`, `config`, and `appearance`.

```
data       → Content & structure (fields, steps, server endpoints)
config     → Behavior & feature toggles (enable/disable features)
appearance → Styling & theming (colors, fonts, dimensions)
```

### Advantages

- **Zero hardcoded UI logic** — the same component renders entirely different UIs based on props
- **Real-time reconfiguration** — change props and the UI updates instantly, no code rewrite needed
- **Rapid development** — building a new CRUD module is writing a config object, not building components from scratch
- **Consistency** — all modules follow the same structure, reducing cognitive load across teams

---

## 2. ParentComp (The Orchestrator)

Single component that manages the full lifecycle of **List + Form + Actions** together.

### Features

- Automatically wires up **Create / Edit / View / Delete** flows between form and list
- Manages **form modal visibility**, current action state, and data refresh after mutations
- Handles **server communication** for all CRUD operations through a unified `serverCommunication` config
- Supports **multiple view modes**: Table, Grid, Card, and List layouts
- **Permission-aware** — checks user permissions before showing any action button or feature

### Advantages

- **One component replaces an entire page** — sidebar + listing + form + pagination + search + filters all orchestrated automatically
- **No boilerplate wiring** — developers don't manually connect form submissions to list refreshes
- **Dual operational modes** — set `operationalMode: "server"` for API-driven apps or `"local"` for in-memory/offline-first apps, per feature independently

### Props

```javascript
ParentComp({
  data,                          // Data structure
  config,                        // Features & behavior config
  appearance,                    // Styling
  formValues,                    // Form state
  setFormValues,                 // Form state setter
  setUpdatedDataFromList,        // Callback for list updates
  showSearchIcon,                // Search visibility
  sectionValue,                  // Filtered section
  currentStep,                   // Multi-step form current step
  isTableOfField                 // Flag for nested tables
})
```

---

## 3. Form Component (Dynamic Multi-Step Wizard)

### Features

- **33+ field types**: Text, Email, Select, MultiSelect, SelectDependant, Date, Time, File, SignaturePad, Color, Phone, InputMask, Rating, TextArea, Table, ListOfFields, ListOfSections, TableOfFields, and more
- **Multi-step wizard** — forms can have multiple steps, each with its own fields and sections
- **Nested sections** — fields can be grouped in collapsible/expandable sections, sections within sections
- **Field dependencies** — fields show/hide based on other field values via `dependancyCheck` config
- **Dynamic field loading** — `stepsManager` loads additional fields from server on demand and merges them seamlessly
- **Specific attributes** — extra fields automatically extracted into a separate object on submit, merged back on edit/view
- **Three modes**: CREATE (empty), EDIT (pre-populated), VIEW (read-only)

### Advantages

- **No form code needed** — define fields in a config array, the framework handles rendering, layout, validation, and submission
- **Field mapper pattern** — adding a new field type is just adding one entry to `fieldsMapper.js`, all existing forms can use it immediately
- **Server-driven forms** — forms can evolve without frontend deploys by loading field definitions from the server
- **Conditional logic without code** — complex show/hide rules are declarative config, not imperative if-statements

### Field Types

| Category | Types |
|---|---|
| **Basic Input** | Text, Email, Password, Number, Range |
| **Selection** | Select, MultiSelect, SelectDependant, SelectOnFields |
| **Toggle** | Checkbox, Radio |
| **Date/Time** | Date, Time, DateTime |
| **Media** | File, SignaturePad, Color, URL |
| **Specialized** | Phone, InputMask, Unit, Rating |
| **Rich Content** | TextArea, URL, Table, Report |
| **Dynamic** | ListOfFields, ListOfSections, TableOfFields |

### Field Dependency Example

```javascript
{
  name: "subField",
  dependancyCheck: true,
  dependancy: {
    dependant: "mainField",
    dependValue: [{ value: "specificValue" }]
  }
  // Field only shows when mainField has "specificValue"
}
```

---

## 4. Listing / Table Component

### Features

- **Multiple display modes**: DataGrid table, card grid, single card, list view — switchable at runtime
- **Pagination**: Server-side or client-side, configurable page sizes
- **Search**: Global or per-column, server or local
- **Sorting**: Single/multi-column, server or local
- **Filtering**: Field-based with operators, server or local
- **Column visibility**: Users can show/hide and reorder columns dynamically
- **Expandable rows**: Show related/detail data inline below a row
- **Inline editing**: Edit cells directly in the table with validation
- **Drag and drop**: Reorder rows via `@hello-pangea/dnd`
- **Bulk actions**: Multi-select rows and perform batch operations (delete, status change)
- **Row actions**: Per-row Edit / Delete / Custom actions with permission checks
- **Status management**: Editable status dropdowns with color coding, batch status updates
- **Import/Export**: CSV, Excel (ExcelJS), PDF (jsPDF) export; CSV/Excel file upload import

### Advantages

- **Feature toggling** — every feature (search, filter, sort, pagination, export) is independently `enable: true/false`
- **Operational mode per feature** — pagination can be server-side while search is local, or vice versa
- **No custom table code** — the same ParentComp handles a 5-column user list or a 30-column report with identical API
- **Built-in data operations** — export to PDF/Excel, bulk delete, inline edit — all out of the box

### Operational Modes

```javascript
config.features: {
  list:       { operationalMode: "server" | "local" },
  pagination: { operationalMode: "server" | "local" },
  search:     { operationalMode: "server" | "local" },
  filter:     { operationalMode: "server" | "local" },
  sort:       { operationalMode: "server" | "local" }
}
```

---

## 5. Sidebar Component

### Features

- **Hierarchical navigation** — main items with nested sub-menus
- **Permission-based rendering** — menu items appear/disappear based on user role permissions
- **Responsive** — collapses on mobile, fixed on desktop
- **Theme-aware** — supports light/dark with customizable colors, shadows, logo dimensions
- **Active route detection** — auto-highlights current page

### Advantages

- **Config-driven navigation** — adding a new page is adding an object to `sidebarItems[]`, not editing component code
- **Permission integration** — unauthorized pages are automatically hidden, no manual checks needed

### Configuration Example

```javascript
{
  data: {
    features: {
      sidebarItems: [
        {
          title: "Dashboard",
          path: "/dashboard",
          icon: <DashboardIcon />,
          permission: "dashboard_view",
          subNav: [
            { title: "Analytics", path: "/dashboard/analytics", permission: "analytics_view" }
          ]
        }
      ]
    }
  },
  config: {
    viewMode: { presentation: ["sidebar", "collapsible"], isOpen: true },
    features: { tokenAuthentication: true, permission: true }
  },
  appearance: {
    features: {
      styling: {
        background: "#f5f5f5",
        width: "280px",
        boxShadow: "...",
        logoWidth: "120px",
        logoHeight: "80px"
      }
    }
  }
}
```

---

## 6. Permission System (Built-In RBAC)

`currentUserPermissions` array in Redux state is checked against `permission` strings on every feature, action, and menu item.

### Advantages

- **Granular control** — permissions on sidebar items, row actions, bulk actions, form fields, feature toggles
- **Recursive checking** — nested menu items inherit permission logic
- **Zero UI leakage** — unauthorized features are never rendered, not just disabled

---

## 7. Theme & Appearance System

### Features

- **Light/Dark mode** — full support with `ThemeContext` and localStorage persistence
- **Custom MUI tokens** — extended theme with `customTokens` for form fields, table headers, cards
- **Per-component styling** — `appearance` prop lets each instance have unique colors without affecting others

### Advantages

- **Theme switching without re-render logic** — Context + MUI ThemeProvider handles it
- **Consistent branding** — define colors once in appearance, applied to form fields, table headers, sidebar, buttons

### Custom Tokens Structure

```javascript
theme.customTokens = {
  light: {
    form: {
      field: {
        color: "#000",
        backgroundColor: "#fff",
        labelColor: "#333",
        focusColor: "#4C49ED"
      }
    },
    table: {
      header: {
        headerTextColor: "#000",
        backgroundColor: "#f5f5f5"
      }
    }
  },
  dark: { /* Mirror structure with dark values */ }
}
```

---

## 8. Server Communication Layer

### Features

- Unified `serverCommunicationHelper` for all API calls
- Supports `GET`, `POST`, `PUT`, `DELETE`
- **Two-layer AES-256 encryption** for request and response payloads (enabled by default)
- FormData support for file uploads
- Metadata injection
- `onSuccess` / `onFailure` callbacks
- Redux Saga-powered async flow

### Advantages

- **One pattern for all API calls** — no scattered fetch/axios calls across components
- **Built-in loading state** — `setIsLoading` callback managed automatically
- **Toast notifications** — success/error toasts on every operation without manual setup
- **Encryption by default** — every API call is encrypted unless explicitly opted out

### Usage

```javascript
serverCommunicationHelper({
  apiActionType,      // "Create", "Read", "Update", "Delete"
  requestType,        // "GET", "POST", "PUT", "DELETE"
  apiUrl,             // Target endpoint
  body,               // Request payload
  onSuccess,          // Success callback
  onFailure,          // Error callback
  isEncrypted,        // Encrypt payload (default: true)
  metaData,           // Include metadata
  useBaseURL,         // Use app base URL
  formData            // Send as FormData
})
```

---

## 9. API Encryption & Decryption (Two-Layer AES-256)

The framework includes a **built-in, two-layer encryption system** that secures all API requests and responses by default using **AES-256 (ECB mode with PKCS7 padding)** via CryptoJS.

### Encryption Keys

| Key | Source | Purpose |
|---|---|---|
| **Platform Key** | `VITE_PLATFORM_KEY` | Primary encryption key for payload data |
| **Secret Key** | `VITE_SECRET_KEY` | Secondary key for encrypting the outer wrapper |
| **Access Token** | Redux store (per session) | Combined with Platform Key for authenticated requests, adding per-session uniqueness |

Keys are stored in environment variables (`.env`), never hardcoded in source code.

### Two-Layer Request Encryption

**Layer 1 — Payload Encryption:**
The actual request body is encrypted with either the Platform Key alone (for login/unauthenticated calls) or `accessToken + PlatformKey` (for authenticated calls).

```javascript
// Key selection based on endpoint
const encryptionKey = isLoginEndpoint
  ? VITE_PLATFORM_KEY
  : accessToken + VITE_PLATFORM_KEY;

// Layer 1: Encrypt the actual payload
const firstEncryption = encryptObject(requestPayload, encryptionKey);
```

**Layer 2 — Wrapper Encryption:**
The encrypted payload is wrapped with platform metadata and encrypted again with the Secret Key.

```javascript
// Layer 2: Wrap with metadata and encrypt again
const wrapper = {
  reqData: firstEncryption,
  encryptionDetails: {
    PlatformName: VITE_PLATFORM_NAME,
    PlatformVersion: VITE_PLATFORM_VERSION,
  },
};

const finalEncrypted = encryptObject(wrapper, VITE_SECRET_KEY);
```

### Response Decryption

Server responses are automatically decrypted using the same key that encrypted the request.

```javascript
if (responseData?.payload && isEncrypted) {
  responseData = decryptObject(responseData.payload, encryptionKey);
}
```

### Encryption by HTTP Method

| Method | Encrypted Data Location |
|---|---|
| **POST / PUT** | Request body → `{ encryptedRequest: <encrypted> }` |
| **GET** | Request headers → `encryptedRequest: <encrypted>` |
| **DELETE** | Request headers → `encryptedrequest: <encrypted>` |

### Per-Action Control

Encryption is **enabled by default** (`isEncrypted = true`). Individual actions can opt out:

```javascript
// Encrypted (default) — no flag needed
serverCommunicationHelper({ apiUrl: "/api/users", ... })

// Not encrypted — file uploads, public endpoints
serverCommunicationHelper({ apiUrl: "/api/upload", isEncrypted: false, formData: true, ... })
```

- **Encrypted by default:** All CRUD operations, authentication (OTP, verify), user management, role management, dashboard data
- **Not encrypted:** File uploads (sent as FormData)

### Architecture Flow

```
┌──────────────────────────────────────────────────────────────┐
│                      User Action (CRUD)                      │
└──────────────────────────┬───────────────────────────────────┘
                           │
┌──────────────────────────▼───────────────────────────────────┐
│         Redux Action Dispatched (isEncrypted = true)         │
└──────────────────────────┬───────────────────────────────────┘
                           │
┌──────────────────────────▼───────────────────────────────────┐
│                  Redux Saga: fetchData                        │
└──────────────────────────┬───────────────────────────────────┘
                           │
                  isEncrypted?
                 ┌─────┴─────┐
               YES           NO
                 │            │
    ┌────────────▼────┐  ┌────▼───────────────────┐
    │ Layer 1:        │  │ Send plain JSON        │
    │ Encrypt body    │  │ or FormData            │
    │ with PlatformKey│  └────────────────────────┘
    │ (+accessToken)  │
    │                 │
    │ Layer 2:        │
    │ Wrap with       │
    │ metadata &      │
    │ encrypt with    │
    │ SecretKey       │
    └───────┬─────────┘
            │
┌───────────▼──────────────────────────────────────────────────┐
│           API Request (encrypted payload/headers)            │
└───────────┬──────────────────────────────────────────────────┘
            │
┌───────────▼──────────────────────────────────────────────────┐
│           Server Response (encrypted payload)                │
└───────────┬──────────────────────────────────────────────────┘
            │
┌───────────▼──────────────────────────────────────────────────┐
│           Decrypt response with same encryptionKey           │
└───────────┬──────────────────────────────────────────────────┘
            │
┌───────────▼──────────────────────────────────────────────────┐
│      onSuccess / onFailure callback with decrypted data      │
└──────────────────────────────────────────────────────────────┘
```

### Advantages

- **Enabled by default** — developers don't need to think about encryption; every API call is secure out of the box
- **Two-layer protection** — even if one layer is compromised, the second layer still protects the data
- **Per-session key rotation** — authenticated requests combine the user's access token with the platform key, so each session has a unique encryption key
- **Per-action opt-out** — set `isEncrypted: false` for specific calls like file uploads that need FormData
- **Transparent to developers** — encryption/decryption happens inside the Saga layer; components send and receive plain objects
- **Platform metadata embedded** — encrypted wrapper includes platform name and version, enabling server-side verification of request origin
- **Environment-based key management** — keys stored in `.env` files, easily rotated without code changes
- **Automatic response decryption** — responses are decrypted using the same key, no manual handling needed

---

## 10. State Management (Redux + Saga + Persist)

### Features

- Redux store with `currentUser`, `userSelectedRole`, `currentUserPermissions`, `accesstoken`
- Redux-Persist for localStorage persistence across sessions
- Redux-Saga for complex async flows
- Redux DevTools integration

### Advantages

- **Session persistence** — user stays logged in across refreshes
- **Centralized auth state** — token and permissions available everywhere
- **Saga-based side effects** — complex API chains (fetch → transform → dispatch) are testable and maintainable

### State Structure

```javascript
{
  main: {
    currentUser,              // Logged-in user
    userSelectedRole,         // Active role
    currentUserPermissions,   // Array of permissions
    accesstoken,              // Auth token
    isLoading                 // Global loading state
  }
}
```

---

## 11. UBS Context API (Package Distribution)

### Features

- `UBSProvider` wraps the app and injects `common` (toasts, constants, store), `socket` (real-time), and `quiz` utilities
- `useUBSContext` hook for consuming

### Advantages

- **Package independence** — the UBS_List_Package (npm v1.0.23) works in any React project by wrapping with `UBSProvider`
- **Shared utilities** — toasts, constants, and socket are injected once, available everywhere

### Usage

```javascript
<UBSProvider common={{ toasts, constants, store, sagas }} socket={{ useSocket }} quiz={quizUtils}>
  <App />
</UBSProvider>
```

---

## 12. Real-Time Support (Socket.io)

- `useSocket` hook provides real-time communication
- Integrates with the listing to show live data updates

---

## 13. Usage Example

Building a complete User Management CRUD page:

```javascript
const usersConfig = {
  data: {
    features: {
      submission: {
        steps: [{
          title: "User Info",
          parameters: {
            fields: [
              { name: "firstName", label: "First Name", type: "textField" },
              { name: "email", label: "Email", type: "email" },
              { name: "role", label: "Role", type: "select", options: [...] }
            ]
          },
          buttons: [{ type: "submit", label: "Save" }]
        }]
      },
      list: {
        data: [],
        parameters: {
          fields: [
            { name: "firstName", label: "First Name", visible: true },
            { name: "email", label: "Email", visible: true },
            { name: "role", label: "Role", visible: true }
          ]
        },
        serverCommunication: {
          apiUrl: "/api/users",
          requestType: "GET"
        }
      },
      rowActions: {
        actions: [
          { name: "Edit", actionType: "form" },
          { name: "Delete", actionType: "delete" }
        ]
      }
    }
  },
  config: {
    viewMode: { presentation: "modalView", mode: "create" },
    features: {
      list: { enable: true, operationalMode: "server" },
      rowActions: { enable: true },
      search: { enable: true },
      pagination: { enable: true }
    }
  },
  appearance: {
    light: { grid: { /* colors */ } },
    dark: { grid: { /* colors */ } }
  }
};

// Render the entire page
<ParentComp {...usersConfig} />
```

---

## 14. Comparison — Traditional vs UBS Framework

| Aspect | Traditional Approach | UBS Framework |
|---|---|---|
| New CRUD module | Build page, form, table, wire API, add permissions | Write one config object, render `<ParentComp />` |
| Adding a field | Edit form component, add validation, update table column | Add entry to `fields[]` array |
| Changing layout | Rewrite component JSX | Change `viewMode.presentation` prop |
| Permission check | Manual `if` checks scattered everywhere | Declarative `permission` string on any feature |
| Theme change | Update styles across files | Toggle `mode` in ThemeContext |
| Export to Excel | Install library, write export logic | Set `export: { enable: true }` |
| Search & filter | Build search UI, wire state, handle API | Set `search: { enable: true, operationalMode: "server" }` |
| Multi-step form | Build stepper, manage state, handle navigation | Add multiple entries to `steps[]` array |
| API encryption | Install crypto library, write encrypt/decrypt logic, wrap every API call | Built-in two-layer AES-256, enabled by default — zero developer effort |
