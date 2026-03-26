# The Node.js Server Framework Built for Production

**Trustworthy. Reliable. Stable. Bleeding Edge.**

---

## The Framework That Doesn't Compromise

Most Node.js frameworks force a choice: *either* battle-tested stability *or* modern capabilities. You get enterprise-grade security, or you get AI integrations. You get rigorous error handling, or you get rapid iteration. Not both.

**This framework delivers both.**

Built for teams that refuse to compromise—teams that need APIs that scale, secure by default, and ship fast without cutting corners. It's the foundation that lets you focus on what matters: your product, not your plumbing.

---

## Why Teams Choose This Framework

### Trustworthy

**Security isn't an afterthought—it's the foundation.**

- **Multi-layer authentication** — JWT validation, RBAC, OTP verification. Every endpoint protected by design.
- **Two-layer encryption** — Platform-level and request-level encryption. Sensitive data stays encrypted in transit and at rest.
- **Separate security database** — Auth, permissions, and audit logs live in an isolated database. Breach containment built in.
- **Full audit trail** — Every request logged. Failed logins, rate-limit hits, and errors persisted for forensics and compliance.
- **Industry-standard hardening** — Helmet, rate limiting, CORS, HSTS. The security headers and protections your auditors expect.

*You can trust it with production traffic from day one.*

---

### Reliable

**Built to run. Built to scale.**

- **Connection pooling** — Separate pools for app and security DBs. No connection storms, no leaks.
- **Transaction support** — ACID guarantees where you need them. `withTransaction()` for critical flows.
- **Database abstraction** — MySQL, MySQL2, PostgreSQL. Switch engines without rewriting your code.
- **Stateless design** — JWT-based auth. Scale horizontally without session headaches.
- **Standardised error handling** — SCC codes, contextual messages, structured responses. Clients know exactly what went wrong and how to recover.
- **Memory management** — Automatic cleanup in middleware. No silent leaks in long-running processes.

*It behaves predictably under load. It recovers gracefully when things fail.*

---

### Stable

**Proven patterns. No surprises.**

- **Declarative API definition** — Configuration over code. Fewer moving parts, fewer bugs.
- **Middleware pipeline** — Token validation, permissions, parameter checks, query resolution—all orchestrated, all consistent.
- **Versioned APIs** — Support multiple client versions without breaking changes. `versionData` and step selection built in.
- **Controlled environments** — Env-based config, feature toggles, platform validation. Deploy with confidence.
- **Comprehensive error codes** — E10 through E99. Every failure categorised. Every response actionable.

*Stability isn't luck. It's architecture.*

---

### Bleeding Edge

**Modern capabilities, ready to use.**

- **Payment gateways** — Stripe, Chase Bank (Authorize.net), KuickPay, Apple Pay. Unified `PaymentGatewayManager`. Webhooks included.
- **AI integrations** — OpenAI, LMStudio. Plug in and go.
- **File storage** — Local and AWS S3. Presigned URLs for secure uploads.
- **Multi-database, multi-platform** — Support different clients, different versions, different backends from a single codebase.
- **Pre/post processors** — Custom logic hooks. Async payload functions. Extend without forking.
- **Factory patterns** — Add new payment gateways, new DB drivers, new integrations by implementing interfaces—not rewriting core.

*You get the best of both worlds: a rock-solid base and the integrations your product needs.*

---

## The Developer Promise

### Ship in Minutes, Not Weeks

1. Clone. `npm install`. Configure `.env`. `npm start`.
2. Your API is live.

No boilerplate. No route registration. Add a file, export an API object, and it's discoverable. Convention over configuration. Focus on business logic, not wiring.

### Low Floor, High Ceiling

- **Beginners** — CRUD templates, declarative config, built-in validation. Get productive without deep Node.js expertise.
- **Experts** — Pre/post processors, custom middleware, factory patterns. Extend and customise without fighting the framework.

### Integrations That Just Work

Payments. Email. AI. Cron. S3. Multiple databases. The integrations you need are already there. The patterns to add more are clear.

---

## The Pitch in One Sentence

**This framework is the most trustworthy, reliable, and stable Node.js server foundation available—while still giving you the bleeding-edge integrations and developer experience modern products demand.**

---

## What You Get

| Pillar | What It Means |
|--------|---------------|
| **Trustworthy** | Security-first. Auditable. Encrypted. Isolated. |
| **Reliable** | Connection pooling. Transactions. Stateless. Predictable errors. |
| **Stable** | Declarative. Versioned. Environment-controlled. Fewer surprises. |
| **Bleeding Edge** | Stripe, Apple Pay, AI, S3, multi-DB. Extensible. Future-ready. |

---

## Built for Teams That Ship

For startups that need to move fast without breaking things.  
For enterprises that need audit trails and compliance.  
For developers who want to write features, not framework code.

**This is the foundation. Ship on it.**

---

*See [UBS_Framework_Features.md](./UBS_Framework_Features.md) for technical details, setup, and API structure.*
