---
sidebar_position: 0
---

# Standard Issue Resolution Workflow

This document describes the standard process for investigating, testing, and documenting issues in the HMS backend.

---

## 1. Reproduce — Understand the issue

1. Read the GitHub issue. Identify the **endpoint**, **observed behavior**, and **expected behavior**.
2. Find the **code path**: route definition → middleware pipeline → pre-process / handler → post-process → response.
3. Trace the exact failure point. Search for the error message in the codebase to find where it originates.

---

## 2. Test — Write or update a sim test

All sim tests live in `Services/SysScripts/TestScripts/sim/`.

### Prerequisites

- Server running on `localhost:3000`.
- `credentials.json` populated (run `guestOtpFlow.js` first for guest endpoints).

### Test structure

```
sim/
├── simHelper.js          # Shared: apiCall, loadCredentials, encryption
├── credentials.json      # Access token, userId, urdd (auto-populated)
├── asssets/              # Placeholder images for upload tests
│   └── placeholder.png
├── guestOtpFlow.js       # Run first — populates credentials.json
└── guest<Feature>.js     # Per-feature test scripts
```

### Writing a test script

1. **Import helpers**: `apiCall`, `loadCredentials` from `simHelper.js`, and `executeQuery` for direct DB verification.
2. **Use the real API flow** — avoid direct DB seeding. Call the actual endpoints the client would call. This ensures tests catch integration bugs (like status mismatches between services).
3. **Verify both API response and DB state** — assert on the response payload, then query the DB to confirm persistence.
4. **Clean up at the end** — delete all test data in a `finally` block so the test is idempotent.

### Test pattern

```javascript
const { apiCall, loadCredentials } = require('./simHelper');
const { executeQuery } = require('../../../Integrations/Database/queryExecution');
require('../../../../Src/Bootstrap/env');

let passed = 0;
let failed = 0;

function assert(label, condition) {
    if (condition) { console.log(`  PASS: ${label}`); passed++; }
    else           { console.log(`  FAIL: ${label}`); failed++; }
}

async function expectError(label, requestFn, expectedStatus, expectedMessage) {
    try {
        await requestFn();
        console.log(`  FAIL: ${label} (no error thrown)`); failed++;
    } catch (err) {
        const status = err.response?.status;
        const msg = err.response?.data?.error?.details
            ?? err.response?.data?.error?.message
            ?? err.response?.data?.meta?.message ?? '';
        const ok = (!expectedStatus || status === expectedStatus)
                && (!expectedMessage || msg.includes(expectedMessage));
        if (ok) { console.log(`  PASS: ${label} (${status}: ${msg})`); passed++; }
        else    { console.log(`  FAIL: ${label} (got ${status}: ${msg})`); failed++; }
    }
}

async function runTests() {
    const { accessToken, actionPerformerURDD, userId } = loadCredentials();

    try {
        // ... test cases ...
        console.log(`\n=== Results: ${passed} passed, ${failed} failed ===\n`);
    } finally {
        // ... cleanup ...
    }

    process.exit(failed > 0 ? 1 : 0);
}

runTests().catch((err) => { console.error('Test suite error:', err); process.exit(1); });
```

---

## 3. Diagnose — Identify root cause

1. Walk the code path from the entry point to the failure.
2. Check for **state mismatches** between services (e.g., one writes `status = 'pending'`, another reads `WHERE status = 'active'`).
3. Check for **scope/ownership** issues (tenant_id, urdd_id, user_id filters that exclude valid data).
4. Check for **missing steps** (a finalize/commit call the client isn't making).

---

## 4. Fix — Apply the minimal change

1. Fix at the source. Prefer fixing the service that creates the inconsistency over loosening the validator.
2. Verify the fix passes the sim test.

---

## 5. Document — Update UBS_DOC

All documentation lives in `C:\Users\adnan\VS_Code\Clones\UBS_DOC\docs\`.

1. **Update the feature doc** (e.g., `hms-documentation/guest-apis/guest-onboarding-kyc/`) with:
   - Known issue section (with `::: caution` admonition) if the bug is significant.
   - Any new API flow documentation discovered during investigation.
   - Reference to the sim test script.
2. **Register in sidebar** if adding a new doc page (`sidebars.js`).

### How to Add a New Documentation Page

#### Step 1: Create the Markdown file

Create a `.md` file inside the appropriate directory under `docs/`. The directory structure maps to the sidebar hierarchy:

```
docs/
├── hms-documentation/
│   ├── guest-apis/           # Guest-facing API docs
│   │   └── <feature-name>/
│   │       └── <feature-name>.md
│   ├── admin-apis/           # Admin-initiated API docs
│   │   └── <feature-name>.md
│   ├── payment-gateways/     # Payment integration docs
│   └── tenant-governance/    # RBAC & tenant model docs
├── api/                      # Standalone API reference pages
├── backend/                  # Framework backend docs
└── frontend/                 # Framework frontend docs
```

Each `.md` file needs a title as a top-level heading (`# Title`). Optionally, add frontmatter for sidebar positioning:

```markdown
---
sidebar_position: 5
---

# My New API

Content here...
```

#### Step 2: Register in `sidebars.js`

Open `sidebars.js` at the project root and add the doc path (relative to `docs/`, without the `.md` extension) to the correct category.

**Example — adding a new admin API doc:**

```js
{
  type: 'category',
  label: 'Admin APIs',
  items: [
    'api/admin-code',
    'hms-documentation/admin-apis/admin-create-guest-user',   // ← new
    'hms-documentation/admin-apis/admin-create-guest-booking', // ← new
  ],
},
```

**Example — adding a new guest API doc with its own subcategory:**

```js
{
  type: 'category',
  label: 'My New Feature',
  items: [
    'hms-documentation/guest-apis/my-new-feature/my-new-feature',
  ],
},
```

The item string is the file path relative to `docs/` without `.md`. For a file at `docs/hms-documentation/admin-apis/my-page.md`, the sidebar entry is `'hms-documentation/admin-apis/my-page'`.

#### Step 3: (Optional) Add a `_category_.json` for auto-generated index

If creating a new directory that should appear as a sidebar category with an auto-generated index page, add a `_category_.json`:

```json
{
  "label": "Admin APIs",
  "position": 3,
  "link": {
    "type": "generated-index",
    "title": "Admin APIs",
    "description": "Short description of this section."
  }
}
```

Note: `_category_.json` only works with Docusaurus auto-generated sidebars. Since this project uses an explicit `sidebars.js`, you must **always** add entries there — `_category_.json` alone will not make a page appear in the sidebar.

#### Step 4: Verify

```bash
cd C:\Users\adnan\VS_Code\Clones\UBS_Doc
npm start
```

Check the sidebar renders correctly and the page loads without errors.

---

## 6. Report — Post findings on GitHub

Comment on the GitHub issue with:

1. **Root cause** — which file/line, what the mismatch is.
2. **Fix** — the specific code change.
3. **Test coverage** — what the sim test now verifies.
4. **Answers to open questions** from the issue.
