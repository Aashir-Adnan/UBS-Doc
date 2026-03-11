# Secure Hybrid SaaS Integration for OPERA PMS
## Solution Architecture Options — Revised

**Document Version:** 3.0  
**Status:** Draft  
**Reference PRD Version:** 1.0 (Amended)  
**Supersedes:** Version 2.0

---

## Changelog v2.0 → v3.0

| Change | Detail |
|---|---|
| **Polling removed** | All solutions that relied on scheduled polling for read-sync have been removed or restructured. Every sync mechanism is now event-driven or push-based end-to-end |
| **Solution 4 removed** | GraphQL + OWS was the only solution whose read-sync path was polling-dependent (30–60s OWS cycle). It has been retired |
| **Cloud SQL DB added** | Each remaining solution now includes a cloud-hosted relational database (MySQL or PostgreSQL) as a second sync target alongside MongoDB Atlas, reflecting the MERN app's full data layer requirements |
| **Acronym legend added** | Section 1 now contains a full glossary of all acronyms used in this document |
| **OPERA 5 capability reference added** | Section 3 documents what OPERA 5 on-premises permits and prohibits with respect to networking, connectivity, and integration — critical context for all solutions |

---

## Table of Contents

1. [Acronym Legend](#acronym-legend)
2. [Updated Constraints Summary](#overview)
3. [OPERA 5 On-Premises Capability Reference](#opera5)
4. [Hybrid Read/Write Solutions (4 Options)](#solutions)
5. [Comparison Matrix](#comparison-matrix)
6. [Recommended Architecture](#recommendation)

---

## 1. Acronym Legend <a name="acronym-legend"></a>

| Acronym | Full Name | Description |
|---|---|---|
| **CDC** | Change Data Capture | A pattern that tracks and streams committed database changes at the engine level, typically via transaction or redo logs — zero polling |
| **CQRS** | Command Query Responsibility Segregation | An architectural pattern separating read and write operations into distinct models and pipelines |
| **Kafka** | Apache Kafka | A distributed event streaming platform used as an event bus; consumers can replay events from any offset in the retained log |
| **LogMiner** | Oracle LogMiner | An Oracle built-in utility for reading the redo and archive log; used by Debezium as the Oracle CDC source |
| **MSK** | Amazon Managed Streaming for Apache Kafka | AWS's fully managed Kafka service; a cloud-hosted alternative to self-managed Kafka clusters |
| **OWS** | OPERA Web Services | Oracle's SOAP/XML-based API for on-premises OPERA 5.x; the on-prem write channel equivalent of OHIP |
| **OHIP** | Oracle Hospitality Integration Platform | Oracle's certified REST API integration layer for OPERA Cloud; Oracle's recommended write channel for cloud OPERA deployments |
| **OXI** | OPERA Exchange Interface | OPERA's internal business event framework that publishes state changes (bookings, check-ins, modifications) to external subscribers |
| **PII** | Personally Identifiable Information | Any data that can identify an individual (name, passport, email, phone, date of birth) — subject to masking requirements under SC-2 |
| **SSE** | Server-Sent Events | A unidirectional HTTP-based push mechanism from server to client; lighter than WebSocket for read-only streams |

---

## 2. Updated Constraints Summary <a name="overview"></a>

| Constraint | Requirement |
|---|---|
| **TR-1** | Bidirectional sync permitted; both push and pull patterns are acceptable at the network level |
| **TR-2** | OPERA must remain in **continuous, real-time sync** with the MERN cloud service — polling of any kind is strictly prohibited; all sync must be event-driven or push-based |
| **TR-3** | Static IP and port forwarding are permitted at the hotel site where operationally justified |
| **SC-1** | TLS 1.3 for all data in transit — non-negotiable across all hops |
| **SC-2** | PII masked/hashed before leaving on-premises unless required for core booking function |
| **SC-3** | Integration DB user must support `SELECT`, `INSERT`, and `UPDATE` on reservation and booking tables at minimum; `DELETE`, `DROP`, `TRUNCATE`, and DDL remain prohibited |
| **SA-1** | MFA required for all external users |
| **SA-2** | General stakeholder reads target the cloud read layer; booking write operations use a dedicated, separately authenticated write path |
| **DB-1** | *(New)* All OPERA data changes must be propagated in real-time to both the MERN app's MongoDB Atlas cluster **and** its cloud-hosted relational database (MySQL or PostgreSQL) |

> **Important note on TR-2 (No Polling):** Any architecture that relies on a scheduled interval query — whether against OPERA directly, OWS, OHIP, or any intermediary — is non-compliant with this requirement. Acceptable real-time mechanisms are: CDC (redo log capture), WebSocket push, OHIP/OWS webhooks, and Kafka event consumption.

> **Important note on SC-2 and bookings:** Guest name, contact details, and identification data are required for reservation operations and are exempt from PII masking on the write path, but must be encrypted in transit (SC-1) and at rest in the cloud databases.

> **Important note on SC-3:** A dedicated Oracle DB user with scoped `INSERT`/`UPDATE` permissions on `RESERVATION`, `RESERVATION_NAME`, `ALLOTMENT`, and related tables must be provisioned separately from the read-only reporting user.

> **Important note on DB-1:** The cloud relational database (MySQL/PostgreSQL) serves as the authoritative transactional store for the MERN application's own business logic — separate from the OPERA system of record. It must remain consistent with OPERA state in real time. Acceptable sync mechanisms are CDC fan-out via Kafka, dual-write from the on-prem agent, or a dedicated transformation consumer subscribing to the same event stream as Atlas.

---

## 3. OPERA 5 On-Premises — Capability Reference <a name="opera5"></a>
# https://ubs-doc.vercel.app/docs/projects/badar-hms/Opera_Config

## 4. Hybrid Read/Write Solutions <a name="solutions"></a>

> **Note on polling removal:** Solution 4 (GraphQL + OWS with 30–60s polling) from v2.0 has been retired as it cannot satisfy TR-2's no-polling requirement. The four remaining solutions all use event-driven or push-based sync exclusively.

> **Note on DB-1 (Cloud SQL Sync):** Every solution below now includes a **Cloud SQL Sync** section describing how the MERN app's cloud-hosted MySQL or PostgreSQL database is kept in real-time sync alongside MongoDB Atlas.

---

### Solution 1: OHIP REST API (Bidirectional) + MERN Backend + Dual Cloud DB Sync

**Architecture Summary:**
The MERN cloud service communicates with OPERA exclusively through **Oracle's OHIP REST API**. The Node.js backend calls OHIP endpoints to read availability and reservation data, and to write new bookings directly into OPERA. **OHIP webhooks** push OPERA state changes to the MERN backend in real-time — replacing polling entirely. The MERN backend then fans out each inbound event to both MongoDB Atlas (via Change Streams) and the cloud SQL database (MySQL/PostgreSQL via a transaction-safe write), satisfying DB-1. A static IP on the hotel network is used to whitelist OHIP webhook delivery.

```
[MERN React Frontend]
        │ REST
        ▼
[Node.js Express Backend] ◄──── OHIP Webhook (push) ────[OHIP REST API]
        │ OHIP OAuth 2.0                                        │
        ├── GET /reservations, /availability ──────────────────►│
        └── POST /reservations ──────────────────────────────►  │
                                                                │
                                                   [OPERA Oracle DB]
        │
        ├──► [MongoDB Atlas] ──► [Atlas Change Streams] ──► [React / Stakeholders]
        │
        └──► [Cloud SQL DB — MySQL / PostgreSQL]
                    │ (transactional fan-out, same event payload)
                    ▼
             [MERN App Business Logic / Reporting]
```

**Cloud SQL Sync Mechanism:** On receipt of each OHIP webhook event, the Node.js backend writes to MongoDB Atlas and the cloud SQL DB within the same logical transaction boundary (using a two-phase commit pattern or an outbox table to guarantee both writes succeed or both roll back). The SQL schema mirrors the reservation and availability data structures required by the MERN application's relational queries and reporting layer.

**Compliance Mapping:**
- ✅ TR-1: Bidirectional via OHIP API; writes and reads both supported
- ✅ TR-2: OHIP webhooks deliver OPERA state changes in real-time; zero polling in any component
- ✅ TR-3: Static IP whitelisted for OHIP webhook delivery; no raw DB port forwarding
- ✅ SC-1: OHIP TLS 1.3; Atlas TLS 1.3; cloud SQL TLS 1.3 — all hops encrypted
- ✅ SC-2: PII transmitted only where required for reservation operations
- ✅ SC-3: No direct Oracle DB credentials — all access mediated by OHIP
- ✅ SA-1/SA-2: MFA at MERN auth layer; stakeholder reads from Atlas/SQL replica
- ✅ DB-1: Dual fan-out to Atlas and cloud SQL DB on every OHIP webhook event

**Tech Stack:** OHIP REST API, Node.js/Express, MongoDB Atlas, MySQL or PostgreSQL (RDS/Cloud SQL), React, Atlas Change Streams  
**Complexity:** ⭐⭐⭐ Medium  
**Cost Profile:** Medium-High (OHIP subscription + Atlas M10+ + SQL DB instance)

**Pros:**
- No direct Oracle DB credentials in the MERN stack — attack surface is minimal and OHIP absorbs all Oracle schema complexity
- OHIP webhooks are a genuine server-push mechanism; no polling of any kind exists in this architecture
- Dual DB fan-out is straightforward: a single webhook handler writes to both Atlas and the SQL DB synchronously
- Oracle validates all writes through its own business logic — double-bookings and invalid reservation states are rejected before reaching either DB
- Best long-term maintainability: Oracle evolving OPERA Cloud is absorbed by OHIP, insulating the MERN backend

**Cons:**
- Hard dependency on OHIP subscription and Oracle Cloud licensing — can take weeks to procure and is the most expensive option
- OHIP is only available for OPERA Cloud deployments; on-premises OPERA 5.x properties cannot use this solution
- The two-phase write to Atlas + SQL DB introduces transactional complexity — an outbox pattern or saga is required to handle partial failures without data inconsistency
- OHIP webhook reliability is Oracle-managed; an OHIP outage breaks real-time sync with no fallback unless a catch-up mechanism is built
- OHIP published endpoints may not cover all reservation edge cases (complex group blocks, linked profiles)

---

### Solution 2: Direct Oracle DB + IPSec VPN + CDC Fan-Out to Dual Cloud DBs

**Architecture Summary:**
The MERN Node.js backend connects **directly to the OPERA Oracle database** via an **IPSec site-to-site VPN** using the hotel's static IP. A dedicated Oracle DB user with scoped `SELECT`, `INSERT`, and `UPDATE` permissions handles all MERN-originated reads and writes. On the outbound path, **Oracle LogMiner or GoldenGate** captures every committed change in the OPERA DB at the redo log level and streams it — without polling — to **Apache Kafka**. Two Kafka consumers run in the cloud: one writes to MongoDB Atlas, one writes to the cloud SQL DB (MySQL/PostgreSQL), satisfying DB-1 with sub-second latency.

```
[MERN React Frontend]
        │
        ▼
[Node.js Express Backend]
        │ node-oracledb — TLS 1.3 over IPSec VPN
        ▼
[Hotel Firewall — Static IP — VPN Endpoint]
        │
        ▼
[OPERA Oracle DB] ──redo log──► [LogMiner / GoldenGate CDC Agent]
  SELECT / INSERT / UPDATE                  │ TLS 1.3 outbound
                                            ▼
                                   [Apache Kafka / AWS MSK]
                                            │
                            ┌───────────────┴──────────────────┐
                            ▼                                  ▼
                   [Atlas Consumer]                  [SQL DB Consumer]
                            │                                  │
                   [MongoDB Atlas]               [MySQL / PostgreSQL — RDS]
                            │                                  │
                   [React / Stakeholders]       [MERN Relational Queries]
```

**Cloud SQL Sync Mechanism:** A dedicated Kafka consumer subscribes to the same OPERA change event topic as the Atlas consumer. It applies a schema transformation (Oracle → relational SQL DDL) and executes `INSERT`/`UPDATE` statements against the cloud MySQL or PostgreSQL instance. The Kafka consumer group guarantees each event is processed exactly-once (with idempotent producers and `enable.idempotence=true`). Kafka's durable log means the SQL DB consumer can replay from any offset if a migration or schema change requires re-processing historical events.

**Compliance Mapping:**
- ✅ TR-1: Bidirectional — MERN writes direct to Oracle via VPN; CDC streams reads
- ✅ TR-2: CDC is event-driven at the redo log level; zero polling anywhere in the pipeline
- ✅ TR-3: Static IP required for VPN endpoint and Oracle listener whitelist
- ✅ SC-1: IPSec VPN + Oracle native TLS; Kafka TLS 1.3; Atlas TLS 1.3; SQL DB TLS 1.3
- ✅ SC-2: PII masking can be applied in CDC transformation layer before Kafka events
- ✅ SC-3: Dedicated Oracle user scoped to `SELECT`/`INSERT`/`UPDATE`; no `DELETE` or DDL
- ✅ SA-1/SA-2: MFA at MERN auth; Atlas and SQL DB serve separate stakeholder read paths
- ✅ DB-1: Kafka fan-out to both Atlas and cloud SQL DB with sub-second latency

**Tech Stack:** node-oracledb, Oracle LogMiner / GoldenGate, Apache Kafka / AWS MSK, MongoDB Atlas, MySQL or PostgreSQL (RDS), IPSec VPN, React  
**Complexity:** ⭐⭐⭐⭐ Medium-High  
**Cost Profile:** Medium–High (VPN infrastructure + GoldenGate license if used + Kafka cluster + dual DB instances)

**Pros:**
- CDC at the redo log level is the most reliable, zero-polling sync mechanism available for Oracle — it captures every committed change including back-office edits and walk-ins
- Kafka fan-out natively supports any number of consumers, meaning adding the SQL DB consumer requires no changes to the Oracle side or the Atlas consumer
- Full control over the Oracle write path — no API layer restricting which tables or operations are accessible
- Kafka's durable log provides built-in replay for the SQL DB consumer, enabling schema migrations or re-hydration without touching OPERA
- IPSec VPN is a well-understood, auditable security control that hotel IT teams can manage with standard router firmware

**Cons:**
- Direct Oracle credentials in the cloud MERN backend represent a high security risk — a compromised backend has a live write path to the OPERA production DB
- Oracle GoldenGate requires a separate enterprise license; Debezium/LogMiner is free but adds Oracle DBA operational overhead
- Two DB consumers in Kafka must be kept in sync — schema drift between the Atlas document model and the SQL relational model requires ongoing transformation logic maintenance
- Static IP is mandatory and requires a business broadband contract; properties on dynamic IPs cannot use this solution as designed
- Highest infrastructure complexity in this document when all components are counted

---

### Solution 3: On-Prem Node.js Agent + WebSocket + Dual Cloud DB Fan-Out ⭐ Recommended

**Architecture Summary:**
A **Node.js sync agent** runs on a dedicated VM within the hotel LAN, connected to the OPERA Oracle DB locally. It maintains a **persistent WSS (WebSocket Secure) connection** outbound to the MERN cloud backend — no inbound firewall rules required. Using **Oracle DB triggers or OXI business event hooks**, the agent detects committed OPERA changes and immediately pushes structured event payloads up the WebSocket to the Node.js backend. The backend fans out each event to both MongoDB Atlas and the cloud SQL DB synchronously. For writes, the backend sends reservation commands down the same WebSocket channel; the agent executes them locally against Oracle and acknowledges the result.

```
[OPERA Oracle DB] ◄──INSERT/UPDATE──► [On-Prem Node.js Agent]
        │                                          │
  DB Trigger / OXI event                    WSS (TLS 1.3)
        │                                    outbound only
        └──── event payload ───────────────► [MERN Node.js Backend]
                                                   │
                              ┌────────────────────┼────────────────────┐
                              ▼                    ▼                    ▼
                     [MongoDB Atlas]    [MySQL / PostgreSQL]    [React / Stakeholders]
                              │                    │
                     [Change Streams]      [Relational Queries]
                              │
                     [Stakeholder Dashboard]

[Write path — bidirectional over same WSS channel]
[React Frontend] ──► [Node.js Backend] ──WSS command──► [Agent] ──► [OPERA Oracle DB]
                                                │
                                      ack + confirmation
```

**Cloud SQL Sync Mechanism:** The Node.js backend receives each OPERA change event from the WebSocket and performs a dual write: first to MongoDB Atlas (document upsert), then to the cloud SQL DB (parameterised `INSERT`/`UPDATE` via `pg` or `mysql2` driver). Both writes are wrapped in a lightweight saga pattern — if the SQL write fails, the Atlas write is compensated and the event is queued for retry. Alternatively, an outbox table in the SQL DB can be used to guarantee eventual consistency between both stores. The SQL schema is designed by the MERN team to suit their application's relational data needs, with foreign keys and indexes independent of the OPERA Oracle schema.

**Compliance Mapping:**
- ✅ TR-1: Bidirectional — agent pushes OPERA changes; MERN sends write commands down same channel
- ✅ TR-2: DB trigger / OXI event fires synchronously on commit; WSS delivers it in real-time with zero polling
- ✅ TR-3: Static IP not required — WSS is outbound from agent; optional for added network control
- ✅ SC-1: WSS (TLS 1.3) on WebSocket; Oracle native TLS on local DB connection; TLS 1.3 on Atlas and cloud SQL DB
- ✅ SC-2: PII filtered in agent before payload is serialised onto WebSocket
- ✅ SC-3: Agent holds scoped Oracle credentials locally — `SELECT` for reads, `INSERT`/`UPDATE` on reservation tables; credentials never leave the LAN
- ✅ SA-1/SA-2: MFA at MERN auth layer; Atlas and SQL DB serve read workloads
- ✅ DB-1: Synchronous dual fan-out to Atlas and cloud SQL DB on every OPERA event

**Tech Stack:** Node.js (on-prem agent), WebSocket/ws, node-oracledb, Oracle DB triggers or OXI, Node.js (MERN backend), MongoDB Atlas, MySQL or PostgreSQL (RDS / Cloud SQL / Supabase), React  
**Complexity:** ⭐⭐⭐ Medium  
**Cost Profile:** Low–Medium (no additional Oracle licensing; agent VM compute; dual cloud DB instances)

**Pros:**
- Oracle credentials never leave the hotel LAN — the cloud backend is fully insulated from direct DB access, significantly reducing blast radius of a cloud compromise
- The entire stack is Node.js; the same team owns the agent and the backend with no context switching or separate language expertise required
- DB triggers are synchronous with the Oracle commit — events are dispatched the instant a transaction is committed, with zero polling latency
- No static IP dependency — the outbound WebSocket reconnects automatically if the hotel's IP changes, making multi-property rollout straightforward
- Dual fan-out to Atlas and SQL DB is a simple in-process fan-out in the Node.js backend — no additional Kafka or message broker infrastructure required
- Lowest cost profile of any solution that satisfies all constraints including DB-1

**Cons:**
- DB triggers add a small overhead to every Oracle write; on very high-transaction OPERA installations this should be load-tested before production deployment
- The persistent WebSocket must be resilient to hotel network instability — requires heartbeat monitoring, exponential backoff reconnection, and an in-agent event buffer to prevent data loss during brief outages
- The on-prem Node.js agent is a custom-deployed component that must be managed at each hotel property; a remote management strategy (e.g., PM2, remote SSH, or a fleet management tool) is required for multi-property deployments
- Dual DB fan-out in the backend requires careful handling of partial failures — if the SQL DB write times out after the Atlas write has succeeded, compensation logic must roll back or retry without duplicating the event
- Write commands flowing MERN → WebSocket → Agent → Oracle introduce a two-hop write latency compared to a direct DB connection (typically 20–80ms additional round-trip depending on geography)

---

### Solution 4: CDC + Kafka Event Bus + Dual Consumer + OHIP/OWS Writes

**Architecture Summary:**
The most enterprise-grade option. **Change Data Capture (CDC)** via Oracle GoldenGate or Debezium continuously streams every committed change in the OPERA Oracle DB at the redo log level — with no polling — to **Apache Kafka** running in the cloud. Two independent Kafka consumers hydrate MongoDB Atlas and the cloud SQL DB (MySQL/PostgreSQL) in milliseconds, satisfying DB-1 with the highest possible fidelity. Write operations from the MERN backend flow through **OHIP REST API** (for OPERA Cloud) or **OWS** (for OPERA 5 on-prem), providing Oracle-validated write channels. The closed-loop architecture means MERN-originated writes are committed to Oracle, re-captured by CDC, and reflected in both cloud DBs automatically — no separate confirmation write is needed.

```
[OPERA Oracle DB]
        │ Supplemental logging enabled
        ▼
[GoldenGate / Debezium CDC Agent] ── TLS 1.3, Static IP outbound ──►
        ▼
[Apache Kafka / AWS MSK — Event Bus]
        │
        ├──► [Atlas Consumer]  ──► [MongoDB Atlas] ──► [React / Stakeholders]
        │
        ├──► [SQL Consumer]    ──► [MySQL / PostgreSQL — RDS] ──► [MERN Relational Layer]
        │
        └──► [Audit Consumer]  ──► [Audit / Analytics Pipeline]

[MERN Write Path — separate from CDC read path]
[React Frontend]
        │
        ▼
[Node.js Backend]
        │ OHIP REST (OPERA Cloud) / OWS SOAP (OPERA 5)
        ▼
[OPERA Oracle DB] ── committed ──► [CDC re-captures] ──► [Kafka] ──► [Both consumers]
```

**Cloud SQL Sync Mechanism:** The dedicated SQL Kafka consumer applies a schema transformation layer — converting OPERA Oracle data types and table structures to the target MySQL or PostgreSQL schema designed by the MERN team. Using Kafka Connect with a JDBC Sink connector (or a custom Node.js consumer with `pg`/`mysql2`) is both viable; the JDBC Sink approach requires no code, while the custom consumer offers more transformation flexibility. Kafka's offset management ensures the SQL DB consumer can catch up after downtime without reprocessing from the start.

**Compliance Mapping:**
- ✅ TR-1: Bidirectional — CDC pushes OPERA changes out; OHIP/OWS handles inbound writes
- ✅ TR-2: CDC is event-driven at redo log level; zero polling in the entire pipeline
- ✅ TR-3: Static IP recommended for CDC replication target; OHIP/OWS inbound whitelisting
- ✅ SC-1: GoldenGate TLS 1.3; Kafka TLS 1.3; OHIP TLS 1.3; Atlas TLS 1.3; SQL DB TLS 1.3 — full chain
- ✅ SC-2: PII masking applied in CDC transformation layer before Kafka events
- ✅ SC-3: CDC log-mining user is read-only at DB level; OHIP/OWS manages writes without DDL access
- ✅ SA-1/SA-2: MFA at MERN layer; Atlas and SQL DB serve independent read workloads
- ✅ DB-1: Two dedicated Kafka consumers ensure both Atlas and SQL DB are updated within milliseconds of every OPERA commit

**Tech Stack:** Oracle GoldenGate or Debezium, Apache Kafka / AWS MSK, OHIP or OWS, Node.js, MongoDB Atlas, MySQL or PostgreSQL (RDS), React  
**Complexity:** ⭐⭐⭐⭐⭐ High  
**Cost Profile:** High (GoldenGate license + Kafka cluster + OHIP subscription + dual DB instances)

**Pros:**
- The only architecture that achieves millisecond-level sync to both cloud databases with zero polling — CDC at the redo log level captures everything, including PMS back-office changes that no API surfaces
- Kafka's durable event log means both cloud DBs can be fully rebuilt from scratch by replaying from offset 0 — invaluable for schema migrations, disaster recovery, and new consumer onboarding
- The write path (OHIP/OWS) and read path (CDC) are entirely decoupled — an OHIP outage does not affect the CDC sync of either cloud DB
- Adding a third consumer (e.g., a data warehouse, a reporting DB, a third-party analytics tool) requires no changes to OPERA, the MERN backend, or either existing consumer
- Best compliance posture: CDC log-mining user is read-only, OHIP/OWS enforces Oracle business rules on writes, and Kafka ACLs control consumer access independently per team

**Cons:**
- Highest cost and operational complexity in this document; GoldenGate is enterprise-priced and Kafka adds a non-trivial managed infrastructure layer
- Debezium/LogMiner requires careful Oracle DBA tuning; LogMiner on a busy OPERA database can consume meaningful CPU and archive log space if not sized correctly
- Two DB consumers must independently maintain schema compatibility with OPERA as it evolves — any OPERA upgrade that changes table structures requires consumer transformation updates
- Initial setup involves Oracle DBA work (supplemental logging, GoldenGate extract/trail configuration) and is not a self-service deployment
- The combination of four systems (Oracle → Kafka → Atlas + SQL DB) creates a larger debugging surface — tracing a missing event requires correlation across all four

---

## 5. Comparison Matrix <a name="comparison-matrix"></a>

| Solution | Write Channel | OPERA Read Sync | Atlas Sync | SQL DB Sync | Polling? | Static IP | Complexity | Cost |
|---|---|---|---|---|---|---|---|---|
| **1. OHIP Bidirectional** | OHIP REST API | OHIP Webhooks | Fan-out from webhook | Fan-out from webhook | ❌ None | Optional | ⭐⭐⭐ | Med-High |
| **2. Direct Oracle + CDC + Kafka** | node-oracledb direct | CDC redo log | Kafka consumer | Kafka consumer | ❌ None | ✅ Required | ⭐⭐⭐⭐ | Med-High |
| **3. WebSocket Agent** ⭐ | Agent → Oracle local | DB trigger / OXI | WS fan-out | WS fan-out | ❌ None | Optional | ⭐⭐⭐ | Low-Med |
| **4. CDC + Kafka + OHIP/OWS** | OHIP or OWS | CDC redo log | Kafka consumer | Kafka consumer | ❌ None | ✅ Recommended | ⭐⭐⭐⭐⭐ | High |

### Write Capability by Table

| Solution | `RESERVATION` | `RESERVATION_NAME` | `ALLOTMENT` | `RATE_HEADER` | Direct DDL |
|---|---|---|---|---|---|
| **1. OHIP** | ✅ OHIP-validated | ✅ OHIP-validated | ⚠️ Limited by OHIP endpoints | ❌ | ❌ |
| **2. Direct Oracle** | ✅ Full control | ✅ Full control | ✅ Full control | ⚠️ Explicit grant required | ❌ |
| **3. WebSocket Agent** | ✅ Agent-mediated | ✅ Agent-mediated | ✅ Agent-mediated | ⚠️ Configurable per agent | ❌ |
| **4. CDC + OHIP/OWS** | ✅ OHIP or OWS | ✅ OHIP or OWS | ⚠️ Depends on write channel | ❌ | ❌ |

### Cloud DB Sync Latency

| Solution | Atlas Latency | SQL DB Latency | Mechanism |
|---|---|---|---|
| **1. OHIP** | < 1s (webhook) | < 1s (webhook fan-out) | OHIP server push |
| **2. Direct + CDC** | < 500ms (Kafka) | < 500ms (Kafka) | Redo log CDC |
| **3. WebSocket Agent** ⭐ | < 200ms (WS push) | < 200ms (WS fan-out) | DB trigger + WebSocket |
| **4. CDC + Kafka** | < 100ms (Kafka) | < 100ms (Kafka) | Redo log CDC |

---

## 6. Recommended Architecture <a name="recommendation"></a>

### Primary Recommendation: Solution 3 (WebSocket Agent)

**Solution 3** remains the recommended starting point for a MERN-based team, now with the addition of dual DB fan-out built into the backend event handler:

- Oracle credentials stay on-prem; the cloud service is fully insulated from direct DB access
- DB triggers provide zero-polling, zero-latency event dispatch on every Oracle commit
- The Node.js fan-out to Atlas and the cloud SQL DB is a single in-process operation — no additional broker infrastructure
- No static IP dependency; straightforward multi-property rollout
- Lowest cost of any fully compliant solution

The cloud SQL DB sync adds approximately 20–30 lines of code to the existing webhook handler — a `pg` or `mysql2` parameterised upsert within the same async function that already writes to Atlas.

### Secondary Recommendation: Solution 1 (OHIP)

For hotels on **OPERA Cloud** with OHIP available, Solution 1 is architecturally cleaner — OHIP absorbs all Oracle complexity and the MERN team never needs an Oracle client library. The dual fan-out pattern is identical to Solution 3 at the Node.js layer.

### For Enterprise Scale: Solution 4 (CDC + Kafka)

At 10+ properties where millisecond sync fidelity, full event replay, and extensibility to multiple downstream consumers are required, Solution 4 justifies its cost and complexity. The Kafka fan-out pattern makes adding the SQL DB consumer trivial — it is just another consumer group on an existing topic.

### What to Avoid

**Solution 2 (Direct Oracle + VPN)** remains a last resort. Direct Oracle write credentials in the cloud environment represent an unacceptable risk to the OPERA production database. If used, it must be protected by a WAF, connection proxy, per-query audit logging, and a credential rotation policy with a maximum 90-day rotation cycle.

---

*Document Version 3.0 — prepared for review. All solutions subject to Oracle OPERA PMS version compatibility assessment, hotel IT infrastructure audit, and Oracle DBA sign-off on SC-3 write permissions prior to implementation. The OPERA 5 capability reference in Section 3 reflects standard deployment configurations and should be validated against the specific property's Oracle support agreement and IT environment.*
