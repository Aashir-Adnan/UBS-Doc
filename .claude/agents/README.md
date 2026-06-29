# UBS Framework Sub-Agents

Self-contained Claude Code sub-agents specialized for the **UBS framework** — a configuration-driven, multi-tenant Node.js REST API framework. Each agent embeds the UBS conventions it needs **inline** (the `*_object` API config shape, the URDD/RDD/URDP RBAC chain, the `created_by` tenant-isolation rule, the user→URDD FK rewrite, the two-layer AES wire format, and the Docusaurus portal/docs patterns), so they work in **any** project — including ones that don't contain the UBS docs — without external references.

These are global agents (installed in `~/.claude/agents/`), so they're available across every project on this machine.

## The agents

**Core (backend, governance, quality, frontend, docs):**

| Agent | Model | Use it when… |
|---|---|---|
| `ubs-api-builder` | sonnet | Authoring/refactoring `global.<Name>_object` API configs (CRUD queries, pre/post-process, permissions, encryption flags) |
| `ubs-tenancy-governance` | opus | Working on RBAC, permissions, tenant isolation (`created_by`), or resource assign/revoke/propagate |
| `ubs-database-architect` | opus | Designing/migrating schemas — snake_case, `created_by` URDD columns, user→URDD FK rewrite, project→base merge, migration triggers |
| `ubs-security-crypto` | opus | Encryption (AES-ECB wire format), runtime keys, JWT/OTP auth, or browser-exposed-secret concerns |
| `ubs-code-reviewer` | opus | Reviewing UBS code against framework conventions (permissions, `created_by`, SQL safety, encryption flags) |
| `ubs-debugger` | opus | Diagnosing failures — E41/403, missing rows from tenancy filter, decryption mismatches, pipeline-stage isolation |
| `ubs-qa-expert` | opus | Planning tests — permission matrices, isolation tests, encryption round-trips, assignment idempotency |
| `ubs-portal-frontend` | sonnet | Building Dev Tools Portal pages — three-state auth guard, payload unwrap, sectioned `custom.css` |
| `ubs-docs-writer` | sonnet | Writing/maintaining Docusaurus MDX docs + sidebar wiring, terminology, and the `[Agent Call]` spec |

**Subsystems (integrations, payments, real-time, codegen, automation, migration):**

| Agent | Model | Use it when… |
|---|---|---|
| `ubs-integrations-engineer` | sonnet | Wiring the Services/Integrations layer — Mailer, AWS S3 file handling, AI (OpenAI/LMStudio), third-party APIs |
| `ubs-payments-billing` | opus | Payment gateways (Stripe, Chase/Authorize.net, KuickPay, Apple Pay) + the Subscriptions module |
| `ubs-realtime-engineer` | sonnet | Socket.io real-time features made tenancy-aware (rooms scoped by tenant/URDD, permission-gated events) |
| `ubs-resource-generator` | sonnet | Bulk-scaffolding CRUD `*_object` configs from a SQL schema (codegen sibling to ubs-api-builder) |
| `ubs-cron-automation` | sonnet | Scheduled cron jobs / background tasks — idempotent, overlap-protected, tenancy-correct |
| `ubs-migration-engineer` | opus | Moving a legacy DB into the UBS base schema + live sync via `migration_sql`; user→URDD historical rewrite |

## Conventions every agent embeds

- **APIs are config, not handlers:** `global.<Name>_object = { versions… }`; URL derived by splitting CamelCase → `/api/<path>`.
- **No super-admin bypass:** every action checks a `<action>_<resource_plural>` permission via the URDD→URDP chain.
- **Isolation rule:** a row is visible to tenant X iff `created_by` ∈ X's URDDs (`created_by` is a URDD id, never a user id); primary filter strict, join filters NULL-tolerant.
- **DB:** snake_case; user/`user_id` FKs rewritten to `user_roles_designations_department`.
- **Crypto:** two-layer AES-ECB/PKCS7, 32-byte key; request uses the secret key, response uses the platform key.
- **Portal/docs:** three-state account-allowlist auth guard; styles by section in `custom.css`; docs wired into `sidebars.js`.

## Usage

Claude Code picks these up automatically from `~/.claude/agents/`. Invoke one explicitly (e.g. "use ubs-api-builder to scaffold a Bookings API object") or let Claude route to the best match. Run `/agents` to list them.

> File named `README.ubs-agents.md` (not `README.md`) so it doesn't collide with other agents' index files in the shared global folder.
