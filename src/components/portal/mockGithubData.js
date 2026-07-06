/**
 * Mock data layer for the GitHub Workflow Sandbox.
 * Simulates all GitHub API + backend responses with realistic structured data.
 * Supports in-memory mutation (create issues, post comments, etc.) so
 * the full creation/reply flow works within a single browser session.
 */

/* ─── Seed timestamps ──────────────────────────────────────────── */
const now = Date.now();
const h = (hours) => now - hours * 3600_000;
const d = (days) => now - days * 86_400_000;

/* ─── Tracked repos ────────────────────────────────────────────── */
const REPOS = [
  { slug: 'ubs-server', name: 'UBS Server', owner: 'granjur', repo: 'ubs-server', branch: 'main', id: 1 },
  { slug: 'badar-hms', name: 'Badar HMS', owner: 'granjur', repo: 'badar-hms', branch: 'main', id: 2 },
  { slug: 'quranflow-api', name: 'QuranFlow API', owner: 'granjur', repo: 'quranflow-api', branch: 'main', id: 3 },
  { slug: 'ubs-doc', name: 'UBS Doc', owner: 'Aashir-Adnan', repo: 'UBS-Doc', branch: 'main', id: 4 },
];

/* ─── File trees (per owner/repo key) ──────────────────────────── */
const FILE_TREES = {
  'granjur/ubs-server': [
    { path: 'src', type: 'tree' },
    { path: 'src/routes', type: 'tree' },
    { path: 'src/routes/auth.js', type: 'blob' },
    { path: 'src/routes/users.js', type: 'blob' },
    { path: 'src/routes/guests.js', type: 'blob' },
    { path: 'src/routes/reservations.js', type: 'blob' },
    { path: 'src/middleware', type: 'tree' },
    { path: 'src/middleware/auth.js', type: 'blob' },
    { path: 'src/middleware/validate.js', type: 'blob' },
    { path: 'src/models', type: 'tree' },
    { path: 'src/models/User.js', type: 'blob' },
    { path: 'src/models/Guest.js', type: 'blob' },
    { path: 'src/models/Reservation.js', type: 'blob' },
    { path: 'src/utils', type: 'tree' },
    { path: 'src/utils/logger.js', type: 'blob' },
    { path: 'src/utils/db.js', type: 'blob' },
    { path: 'src/index.js', type: 'blob' },
    { path: 'tests', type: 'tree' },
    { path: 'tests/auth.test.js', type: 'blob' },
    { path: 'tests/users.test.js', type: 'blob' },
    { path: 'package.json', type: 'blob' },
    { path: '.env.example', type: 'blob' },
    { path: 'README.md', type: 'blob' },
  ],
  'granjur/badar-hms': [
    { path: 'src', type: 'tree' },
    { path: 'src/opera', type: 'tree' },
    { path: 'src/opera/client.js', type: 'blob' },
    { path: 'src/opera/sync.js', type: 'blob' },
    { path: 'src/opera/mapping.js', type: 'blob' },
    { path: 'src/services', type: 'tree' },
    { path: 'src/services/booking.js', type: 'blob' },
    { path: 'src/services/checkin.js', type: 'blob' },
    { path: 'src/services/checkout.js', type: 'blob' },
    { path: 'src/services/housekeeping.js', type: 'blob' },
    { path: 'src/routes', type: 'tree' },
    { path: 'src/routes/rooms.js', type: 'blob' },
    { path: 'src/routes/guests.js', type: 'blob' },
    { path: 'src/routes/reports.js', type: 'blob' },
    { path: 'src/index.js', type: 'blob' },
    { path: 'config', type: 'tree' },
    { path: 'config/opera.json', type: 'blob' },
    { path: 'config/default.json', type: 'blob' },
    { path: 'package.json', type: 'blob' },
    { path: 'README.md', type: 'blob' },
  ],
  'granjur/quranflow-api': [
    { path: 'src', type: 'tree' },
    { path: 'src/controllers', type: 'tree' },
    { path: 'src/controllers/surahController.js', type: 'blob' },
    { path: 'src/controllers/ayahController.js', type: 'blob' },
    { path: 'src/controllers/searchController.js', type: 'blob' },
    { path: 'src/models', type: 'tree' },
    { path: 'src/models/Surah.js', type: 'blob' },
    { path: 'src/models/Ayah.js', type: 'blob' },
    { path: 'src/models/Tafsir.js', type: 'blob' },
    { path: 'src/routes', type: 'tree' },
    { path: 'src/routes/api.js', type: 'blob' },
    { path: 'src/index.js', type: 'blob' },
    { path: 'migrations', type: 'tree' },
    { path: 'migrations/001_initial.sql', type: 'blob' },
    { path: 'migrations/002_add_tafsir.sql', type: 'blob' },
    { path: 'package.json', type: 'blob' },
    { path: 'README.md', type: 'blob' },
  ],
  'Aashir-Adnan/UBS-Doc': [
    { path: 'docs', type: 'tree' },
    { path: 'docs/intro', type: 'tree' },
    { path: 'docs/intro/getting-started.md', type: 'blob' },
    { path: 'docs/agents', type: 'tree' },
    { path: 'docs/agents/agent-issue-format.md', type: 'blob' },
    { path: 'src', type: 'tree' },
    { path: 'src/pages', type: 'tree' },
    { path: 'src/pages/tools', type: 'tree' },
    { path: 'src/pages/tools/github.jsx', type: 'blob' },
    { path: 'src/pages/tools/index.jsx', type: 'blob' },
    { path: 'src/components', type: 'tree' },
    { path: 'src/components/portal', type: 'tree' },
    { path: 'src/components/portal/GithubWorkflow.jsx', type: 'blob' },
    { path: 'src/components/portal/authStore.jsx', type: 'blob' },
    { path: 'src/css', type: 'tree' },
    { path: 'src/css/custom.css', type: 'blob' },
    { path: 'docusaurus.config.js', type: 'blob' },
    { path: 'sidebars.js', type: 'blob' },
    { path: 'package.json', type: 'blob' },
    { path: 'CLAUDE.md', type: 'blob' },
  ],
};

/* ─── In-memory issue + comment stores (per owner/repo) ────────── */
let _nextIssueNumber = 200;
let _nextCommentId = 5000;

// keyed by "owner/repo"
const _issueStore = {};
const _commentStore = {}; // keyed by issue number within repo key

function repoKey(owner, repo) { return `${owner}/${repo}`; }

function getIssues(owner, repo) {
  const k = repoKey(owner, repo);
  if (!_issueStore[k]) _issueStore[k] = [...(SEED_ISSUES[k] || [])];
  return _issueStore[k];
}

function getComments(owner, repo, issueNumber) {
  const k = `${repoKey(owner, repo)}#${issueNumber}`;
  if (!_commentStore[k]) _commentStore[k] = [...(SEED_COMMENTS[k] || [])];
  return _commentStore[k];
}

/* ─── Seed issues ──────────────────────────────────────────────── */
const SEED_ISSUES = {
  'granjur/ubs-server': [
    {
      number: 42,
      title: '[Agent Call] Add structured error logging to auth routes',
      body: '[Agent Call]\n\nTask:\nAdd structured JSON error logging to all auth route handlers. Each log entry should include timestamp, route, error code, and stack trace.\n\nContext:\nsrc/routes/auth.js, src/utils/logger.js\n\nType:\nCode Writer\n\nPriority:\nHigh\n\nNotifyEmail:\nintern@granjur.com\n',
      state: 'open',
      created_at: new Date(d(2)).toISOString(),
      html_url: '#',
      user: { login: 'aashir-adnan', type: 'User' },
      pull_request: undefined,
    },
    {
      number: 41,
      title: '[Agent Call] Refactor user validation middleware',
      body: '[Agent Call]\n\nTask:\nExtract repeated validation logic from user routes into a shared middleware. Use Joi or Zod for schema validation.\n\nContext:\nsrc/middleware/validate.js, src/routes/users.js\n\nType:\nCode Reviewer\n\nPriority:\nNormal\n\nNotifyEmail:\nintern@granjur.com\n',
      state: 'open',
      created_at: new Date(d(5)).toISOString(),
      html_url: '#',
      user: { login: 'aashir-adnan', type: 'User' },
      pull_request: undefined,
    },
    {
      number: 38,
      title: '[Agent Call] Add rate limiting to guest search endpoint',
      body: '[Agent Call]\n\nTask:\nImplement rate limiting (100 req/min per IP) on GET /api/guests/search to prevent abuse.\n\nType:\nCode Writer\n\nPriority:\nImmediate\n\nNotifyEmail:\ndev@granjur.com\n',
      state: 'closed',
      created_at: new Date(d(12)).toISOString(),
      html_url: '#',
      user: { login: 'aashir-adnan', type: 'User' },
      pull_request: undefined,
    },
  ],
  'granjur/badar-hms': [
    {
      number: 15,
      title: '[Agent Call] Fix Opera PMS sync timezone mismatch',
      body: '[Agent Call]\n\nTask:\nThe Opera PMS sync is sending UTC timestamps but the local system expects Asia/Karachi. Normalize all timestamps in src/opera/sync.js to use the configured timezone before writing to the DB.\n\nContext:\nsrc/opera/sync.js, src/opera/mapping.js\n\nType:\nCode Writer\n\nPriority:\nImmediate\n\nNotifyEmail:\nintern@granjur.com\n',
      state: 'open',
      created_at: new Date(d(1)).toISOString(),
      html_url: '#',
      user: { login: 'aashir-adnan', type: 'User' },
      pull_request: undefined,
    },
    {
      number: 12,
      title: '[Agent Call] Add housekeeping status report endpoint',
      body: '[Agent Call]\n\nTask:\nCreate GET /api/reports/housekeeping that returns room cleaning status grouped by floor.\n\nContext:\nsrc/services/housekeeping.js, src/routes/reports.js\n\nType:\nCode Writer\n\nPriority:\nNormal\n\nNotifyEmail:\nintern@granjur.com\n',
      state: 'closed',
      created_at: new Date(d(8)).toISOString(),
      html_url: '#',
      user: { login: 'aashir-adnan', type: 'User' },
      pull_request: undefined,
    },
  ],
  'granjur/quranflow-api': [
    {
      number: 7,
      title: '[Agent Call] Implement full-text search across Ayah translations',
      body: '[Agent Call]\n\nTask:\nAdd a search endpoint GET /api/search?q=... that searches across all Ayah translations using MySQL FULLTEXT index. Return matching ayahs with surah name and ayah number.\n\nContext:\nsrc/controllers/searchController.js, src/models/Ayah.js\n\nType:\nCode Writer\n\nPriority:\nHigh\n\nNotifyEmail:\nintern@granjur.com\n',
      state: 'open',
      created_at: new Date(d(3)).toISOString(),
      html_url: '#',
      user: { login: 'aashir-adnan', type: 'User' },
      pull_request: undefined,
    },
  ],
  'Aashir-Adnan/UBS-Doc': [
    {
      number: 22,
      title: '[Agent Call] Add dark mode toggle to sandbox pages',
      body: '[Agent Call]\n\nTask:\nAdd a dark/light mode toggle button visible on all /tools/* pages that persists preference to localStorage.\n\nContext:\nsrc/css/custom.css, src/pages/tools/index.jsx\n\nType:\nCode Writer\n\nPriority:\nLow\n\nNotifyEmail:\nintern@granjur.com\n',
      state: 'open',
      created_at: new Date(d(4)).toISOString(),
      html_url: '#',
      user: { login: 'Aashir-Adnan', type: 'User' },
      pull_request: undefined,
    },
  ],
};

/* ─── Seed comments ────────────────────────────────────────────── */
const SEED_COMMENTS = {
  // Issue 42 — awaiting human (bot posted ⚠️)
  'granjur/ubs-server#42': [
    {
      id: 1001,
      body: '🤖 Analysing the repository structure and auth routes…\n\nFound 4 route handlers in `src/routes/auth.js` that lack structured logging. Will add a winston-based JSON logger.\n\nEstimated changes: 2 files modified.',
      created_at: new Date(h(46)).toISOString(),
      user: { login: 'ubs-agent[bot]', type: 'Bot' },
    },
    {
      id: 1002,
      body: '⚠️ The context paths include `src/utils/logger.js` but the file currently exports a plain console wrapper. Switching to winston would require adding a dependency. Please confirm:\n\n1. Should I add `winston` to package.json?\n2. Or should I keep the existing console-based logger and just add JSON formatting?',
      created_at: new Date(h(45)).toISOString(),
      user: { login: 'ubs-agent[bot]', type: 'Bot' },
    },
  ],
  // Issue 41 — awaiting bot (human replied)
  'granjur/ubs-server#41': [
    {
      id: 1003,
      body: '🤖 Starting analysis of validation patterns in user routes…',
      created_at: new Date(d(4)).toISOString(),
      user: { login: 'ubs-agent[bot]', type: 'Bot' },
    },
    {
      id: 1004,
      body: '⚠️ Found 3 different validation approaches across the route files. Need clarification: should I use Joi or Zod? Both are viable.',
      created_at: new Date(d(4) + 3600_000).toISOString(),
      user: { login: 'ubs-agent[bot]', type: 'Bot' },
    },
    {
      id: 1005,
      body: '!continue\n\nUse Zod — it has better TypeScript inference and we plan to migrate to TS soon.',
      created_at: new Date(d(3)).toISOString(),
      user: { login: 'aashir-adnan', type: 'User' },
    },
  ],
  // Issue 38 — done (PR opened)
  'granjur/ubs-server#38': [
    {
      id: 1006,
      body: '🤖 Implementing express-rate-limit on guest search endpoint…',
      created_at: new Date(d(11)).toISOString(),
      user: { login: 'ubs-agent[bot]', type: 'Bot' },
    },
    {
      id: 1007,
      body: '✅ **Committed and PR opened**\n\nhttps://github.com/granjur/ubs-server/pull/39\n\nAdded `express-rate-limit` middleware with 100 req/min window on `/api/guests/search`. Includes custom JSON error response when limit is exceeded.',
      created_at: new Date(d(10)).toISOString(),
      user: { login: 'ubs-agent[bot]', type: 'Bot' },
    },
  ],
  // Issue 15 — awaiting bot (no comments yet)
  'granjur/badar-hms#15': [],
  // Issue 12 — done
  'granjur/badar-hms#12': [
    {
      id: 2001,
      body: '🤖 Implementing housekeeping report endpoint…',
      created_at: new Date(d(7)).toISOString(),
      user: { login: 'ubs-agent[bot]', type: 'Bot' },
    },
    {
      id: 2002,
      body: '✅ **Committed and PR opened**\n\nhttps://github.com/granjur/badar-hms/pull/13\n\nAdded GET /api/reports/housekeeping with floor grouping and status summary.',
      created_at: new Date(d(6)).toISOString(),
      user: { login: 'ubs-agent[bot]', type: 'Bot' },
    },
  ],
  // Issue 7 — awaiting bot (just created, bot starting)
  'granjur/quranflow-api#7': [
    {
      id: 3001,
      body: '🤖 Analysing the Ayah model and existing search patterns…\n\nWill implement FULLTEXT index on the `translation` column and create the search controller.',
      created_at: new Date(h(6)).toISOString(),
      user: { login: 'ubs-agent[bot]', type: 'Bot' },
    },
  ],
  // Issue 22 — awaiting bot
  'Aashir-Adnan/UBS-Doc#22': [],
};

/* ─── Seed PRs ─────────────────────────────────────────────────── */
const SEED_PRS = {
  'granjur/ubs-server': [
    {
      number: 39,
      title: 'feat: add rate limiting to guest search endpoint',
      body: '## Summary\n- Added `express-rate-limit` middleware on `/api/guests/search`\n- 100 requests per minute per IP\n- Returns JSON 429 error when exceeded\n\n## Test plan\n- [ ] Run `npm test` to verify no regressions\n- [ ] Manually test with rapid requests\n\n🤖 Generated with [Claude Code](https://claude.com/claude-code)',
      state: 'open',
      draft: false,
      mergeable: true,
      created_at: new Date(d(10)).toISOString(),
      html_url: '#',
      user: { login: 'ubs-agent[bot]' },
      head: { ref: 'agent/rate-limit-guest-search' },
      base: { ref: 'main' },
      comments: 1,
    },
    {
      number: 37,
      title: 'fix: correct password hashing rounds from 8 to 12',
      body: '## Summary\n- Increased bcrypt salt rounds from 8 to 12 for better security\n- Updated auth tests to match new timing\n\n🤖 Generated with [Claude Code](https://claude.com/claude-code)',
      state: 'closed',
      draft: false,
      mergeable: null,
      created_at: new Date(d(18)).toISOString(),
      html_url: '#',
      user: { login: 'ubs-agent[bot]' },
      head: { ref: 'agent/fix-bcrypt-rounds' },
      base: { ref: 'main' },
      comments: 0,
    },
    {
      number: 40,
      title: 'WIP: migrate auth routes to TypeScript',
      body: '',
      state: 'open',
      draft: true,
      mergeable: false,
      created_at: new Date(d(1)).toISOString(),
      html_url: '#',
      user: { login: 'aashir-adnan' },
      head: { ref: 'feat/ts-auth' },
      base: { ref: 'main' },
      comments: 0,
    },
  ],
  'granjur/badar-hms': [
    {
      number: 13,
      title: 'feat: add housekeeping status report endpoint',
      body: '## Summary\n- New GET /api/reports/housekeeping endpoint\n- Groups rooms by floor with cleaning status counts\n- Includes optional date range filter\n\n🤖 Generated with [Claude Code](https://claude.com/claude-code)',
      state: 'open',
      draft: false,
      mergeable: true,
      created_at: new Date(d(6)).toISOString(),
      html_url: '#',
      user: { login: 'ubs-agent[bot]' },
      head: { ref: 'agent/housekeeping-report' },
      base: { ref: 'main' },
      comments: 0,
    },
  ],
  'granjur/quranflow-api': [],
  'Aashir-Adnan/UBS-Doc': [
    {
      number: 21,
      title: 'docs: add backend setup guide for QuranFlow',
      body: '## Summary\n- Added step-by-step backend setup guide\n- Documented environment variables\n\n🤖 Generated with [Claude Code](https://claude.com/claude-code)',
      state: 'open',
      draft: false,
      mergeable: true,
      created_at: new Date(d(7)).toISOString(),
      html_url: '#',
      user: { login: 'Aashir-Adnan' },
      head: { ref: 'docs/backend-setup' },
      base: { ref: 'main' },
      comments: 2,
    },
  ],
};

/* ─── Seed PR files ────────────────────────────────────────────── */
const SEED_PR_FILES = {
  'granjur/ubs-server#39': [
    { filename: 'src/routes/guests.js', status: 'modified', additions: 18, deletions: 2 },
    { filename: 'src/middleware/rateLimit.js', status: 'added', additions: 24, deletions: 0 },
    { filename: 'package.json', status: 'modified', additions: 1, deletions: 0 },
    { filename: 'package-lock.json', status: 'modified', additions: 84, deletions: 0 },
  ],
  'granjur/ubs-server#37': [
    { filename: 'src/routes/auth.js', status: 'modified', additions: 2, deletions: 2 },
    { filename: 'tests/auth.test.js', status: 'modified', additions: 5, deletions: 3 },
  ],
  'granjur/ubs-server#40': [
    { filename: 'src/routes/auth.ts', status: 'added', additions: 142, deletions: 0 },
    { filename: 'src/routes/auth.js', status: 'removed', additions: 0, deletions: 128 },
    { filename: 'tsconfig.json', status: 'added', additions: 22, deletions: 0 },
    { filename: 'package.json', status: 'modified', additions: 4, deletions: 1 },
  ],
  'granjur/badar-hms#13': [
    { filename: 'src/services/housekeeping.js', status: 'modified', additions: 35, deletions: 0 },
    { filename: 'src/routes/reports.js', status: 'modified', additions: 28, deletions: 1 },
  ],
  'Aashir-Adnan/UBS-Doc#21': [
    { filename: 'docs/intro/backend-setup.md', status: 'added', additions: 86, deletions: 0 },
    { filename: 'sidebars.js', status: 'modified', additions: 3, deletions: 1 },
  ],
};

/* ─── Seed PR ping comments ────────────────────────────────────── */
const _prCommentStore = {};

/* ═══════════════════════════════════════════════════════════════════
   Public mock API — drop-in replacements for the real fetchers
   ═══════════════════════════════════════════════════════════════════ */

/** Simulates fetchTrackedRepos() from githubReposConfig.js */
export async function mockFetchTrackedRepos() {
  await delay(300);
  return [...REPOS];
}

/** Simulates ghFetch() — routes on the path to return appropriate mock data. */
export async function mockGhFetch(path, opts = {}) {
  await delay(randomDelay());
  const method = (opts.method || 'GET').toUpperCase();

  // GET /repos/:owner/:repo/git/trees/HEAD?recursive=1
  let m = path.match(/^\/repos\/([^/]+)\/([^/]+)\/git\/trees\//);
  if (m) {
    const tree = FILE_TREES[repoKey(m[1], m[2])] || [];
    return { tree: [...tree] };
  }

  // POST /repos/:owner/:repo/issues  (create issue)
  m = path.match(/^\/repos\/([^/]+)\/([^/]+)\/issues$/);
  if (m && method === 'POST') {
    const body = JSON.parse(opts.body);
    const issue = {
      number: ++_nextIssueNumber,
      title: body.title,
      body: body.body,
      state: 'open',
      created_at: new Date().toISOString(),
      html_url: '#',
      user: { login: 'sandbox-user', type: 'User' },
      pull_request: undefined,
    };
    const issues = getIssues(m[1], m[2]);
    issues.unshift(issue);
    return issue;
  }

  // GET /repos/:owner/:repo/issues?state=...
  m = path.match(/^\/repos\/([^/]+)\/([^/]+)\/issues\?state=(\w+)/);
  if (m) {
    const all = getIssues(m[1], m[2]);
    const state = m[3];
    if (state === 'open') return all.filter((i) => i.state === 'open' && !i.pull_request);
    if (state === 'closed') return all.filter((i) => i.state === 'closed' && !i.pull_request);
    return all.filter((i) => !i.pull_request);
  }

  // POST /repos/:owner/:repo/issues/:number/comments  (post comment)
  m = path.match(/^\/repos\/([^/]+)\/([^/]+)\/issues\/(\d+)\/comments$/);
  if (m && method === 'POST') {
    const body = JSON.parse(opts.body);
    const comment = {
      id: ++_nextCommentId,
      body: body.body,
      created_at: new Date().toISOString(),
      user: { login: 'sandbox-user', type: 'User' },
    };
    const comments = getComments(m[1], m[2], Number(m[3]));
    comments.push(comment);
    // Schedule a simulated bot reply after a short delay
    scheduleBotReply(m[1], m[2], Number(m[3]), body.body);
    return comment;
  }

  // GET /repos/:owner/:repo/issues/:number/comments  (list comments)
  m = path.match(/^\/repos\/([^/]+)\/([^/]+)\/issues\/(\d+)\/comments$/);
  if (m) {
    return [...getComments(m[1], m[2], Number(m[3]))];
  }

  // GET /repos/:owner/:repo/pulls?state=...
  m = path.match(/^\/repos\/([^/]+)\/([^/]+)\/pulls\?state=(\w+)/);
  if (m) {
    const all = SEED_PRS[repoKey(m[1], m[2])] || [];
    const state = m[3];
    if (state === 'all') return [...all];
    return all.filter((pr) => pr.state === state);
  }

  // GET /repos/:owner/:repo/pulls/:number/files
  m = path.match(/^\/repos\/([^/]+)\/([^/]+)\/pulls\/(\d+)\/files/);
  if (m) {
    return SEED_PR_FILES[`${repoKey(m[1], m[2])}#${m[3]}`] || [];
  }

  // DELETE /repos/:owner/:repo/issues/comments/:id
  m = path.match(/^\/repos\/([^/]+)\/([^/]+)\/issues\/comments\/(\d+)$/);
  if (m && method === 'DELETE') {
    return {};
  }

  // Fallback
  return {};
}

/* ─── Helpers ──────────────────────────────────────────────────── */

function delay(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function randomDelay() {
  return 150 + Math.random() * 350;
}

// After a human posts a comment, simulate a bot reply ~3s later
const _botReplyTimers = {};

function scheduleBotReply(owner, repo, issueNumber, humanBody) {
  const k = `${repoKey(owner, repo)}#${issueNumber}`;
  if (_botReplyTimers[k]) clearTimeout(_botReplyTimers[k]);

  _botReplyTimers[k] = setTimeout(() => {
    const isDiscuss = humanBody.includes('!discuss');
    const isContinue = humanBody.includes('!continue');

    let botBody;
    if (isContinue) {
      botBody = '🤖 Continuing with the narrowed context…\n\nRe-analysing the specified files and applying the requested changes. Will commit and open a PR shortly.';
    } else if (isDiscuss) {
      botBody = '🤖 Noted — reviewing your feedback and adjusting the implementation.\n\nI\'ll update the existing PR with the requested changes within a few minutes.';
    } else {
      botBody = '🤖 Acknowledged. Processing your input and updating the work in progress.';
    }

    const comments = getComments(owner, repo, issueNumber);
    comments.push({
      id: ++_nextCommentId,
      body: botBody,
      created_at: new Date().toISOString(),
      user: { login: 'ubs-agent[bot]', type: 'Bot' },
    });
  }, 3000);
}
