# [English] Secure Hybrid SaaS Integration for OPERA PMS
## Solution Architecture Options

**Document Version:** 1.0  
**Status:** Draft  
**Reference PRD Version:** 1.0

---

## Table of Contents
1. [Overview & Constraints Summary](#overview)
2. [Read-Only Solutions (5 Options)](#read-only-solutions)
3. [Read & Write Solutions (3 Options)](#read-write-solutions)
4. [Comparison Matrix](#comparison-matrix)

---

## 1. Overview & Constraints Summary <a name="overview"></a>

All solutions must satisfy the following non-negotiable constraints derived from the PRD:

| Constraint | Requirement |
|---|---|
| **TR-1** | Pull-based sync only; no cloud-initiated push to local network |
| **TR-2** | Sync interval ≥ 1 hour, or async via OXI/OHIP Business Events |
| **TR-3** | No Static IP or Port Forwarding at hotel site |
| **SC-1** | TLS 1.3 for all data in transit |
| **SC-2** | PII masked/hashed before leaving on-premises |
| **SC-3** | Integration DB user restricted to `SELECT` only |
| **SA-1** | MFA required for all external users |
| **SA-2** | Stakeholder reads target Cloud Read-Replica only |

---

## 2. Read-Only Solutions <a name="read-only-solutions"></a>

---

### Solution 1: On-Premises Agent + Cloudflare Tunnel + Managed Cloud Replica

**Architecture Summary:**  
A lightweight Windows/Linux service installed on-premises polls the OPERA Oracle DB on a scheduled interval, masks PII locally, and streams the payload outbound through a **Cloudflare Tunnel** (formerly Argo Tunnel). The tunnel establishes a persistent outbound-only HTTPS connection to Cloudflare's edge — eliminating any need for static IPs or inbound firewall rules. Data lands in a managed cloud database (e.g., AWS RDS PostgreSQL or Supabase) serving as the read-replica.

```
[OPERA Oracle DB] ──SELECT──► [On-Prem Agent]
                                    │  PII Masking
                                    │  TLS 1.3
                                    ▼
                           [Cloudflare Tunnel]
                                    │ Outbound only
                                    ▼
                        [Cloudflare Edge / Zero Trust]
                                    │
                                    ▼
                         [Cloud Read-Replica DB]
                                    │
                                    ▼
                    [SaaS Application + MFA Auth Layer]
```

**Compliance Mapping:**
- ✅ TR-1: Agent pulls from Oracle; cloud never pushes inbound
- ✅ TR-2: Scheduled via Windows Task Scheduler / cron (1hr+) or event-triggered
- ✅ TR-3: Cloudflare Tunnel requires no port forwarding or static IP
- ✅ SC-1: Cloudflare Tunnel enforces TLS 1.3
- ✅ SC-2: PII masked within agent before any data leaves the LAN
- ✅ SC-3: Oracle user created with `GRANT SELECT` only
- ✅ SA-1/SA-2: MFA enforced at SaaS layer; replica is read-only

**Tech Stack Candidates:** Cloudflare Tunnel, AWS RDS / Supabase, Python or Node.js agent, Oracle JDBC/cx_Oracle  
**Complexity:** ⭐⭐ Low-Medium  
**Cost Profile:** Low (Cloudflare Tunnel free tier available)

**Pros:**
- Lowest barrier to entry — Cloudflare Tunnel has a generous free tier and a well-documented `cloudflared` daemon for Windows and Linux
- No networking changes required at the hotel site; IT staff do not need to open firewall ports or request a static IP from the ISP
- Cloudflare's Zero Trust dashboard provides access policies, identity-aware routing, and connection logs out of the box
- The polling agent is a simple, stateless process that is easy to maintain, redeploy, or version-control
- Broad cloud database compatibility — the replica can be hosted on any provider (AWS, GCP, Azure, Supabase)

**Cons:**
- Polling introduces inherent data latency; the replica will lag behind OPERA by up to the configured interval (minimum 1 hour per TR-2), making it unsuitable for near-real-time use cases
- The sync agent is a custom-built component requiring ongoing maintenance, error handling, and schema-change management as OPERA is upgraded
- A single-process agent represents a potential single point of failure unless a watchdog or redundancy mechanism is implemented
- Cloudflare's free tier imposes connection and bandwidth limits that may be insufficient for large multi-property deployments; paid tiers add recurring cost
- PII masking logic lives in the agent code, requiring careful testing and auditing to ensure no leakage edge cases

---

### Solution 2: OXI/OHIP Business Event Listener + AWS EventBridge + Serverless Pipeline

**Architecture Summary:**  
Rather than scheduled polling, this solution leverages **OPERA's native OXI/OHIP Business Event** system. When a booking, check-in, or rate change occurs, OPERA fires an event. An on-premises listener service captures these events, applies PII masking, and forwards them outbound via **AWS PrivateLink** or a secure webhook relay to **AWS EventBridge**. EventBridge routes events to Lambda functions that hydrate the cloud read-replica in near real-time.

```
[OPERA PMS] ──Business Event──► [On-Prem OXI Listener]
                                         │ PII Mask + TLS 1.3
                                         ▼
                               [Outbound Webhook Relay]
                                         │
                                         ▼
                              [AWS EventBridge / SNS]
                                         │
                                    ┌────┴─────┐
                                    ▼          ▼
                              [Lambda]    [Lambda]
                             (Upsert)    (Audit Log)
                                    │
                                    ▼
                         [Cloud Read-Replica (RDS)]
```

**Compliance Mapping:**
- ✅ TR-1: Listener is on-prem and event-driven; no inbound cloud connections
- ✅ TR-2: Async Business Event triggers satisfy the OXI/OHIP requirement explicitly
- ✅ TR-3: Outbound HTTPS webhook; no firewall inbound rules required
- ✅ SC-1: AWS SDK enforces TLS 1.3
- ✅ SC-2: PII scrubbed in OXI Listener before EventBridge payload
- ✅ SC-3: Oracle integration user is SELECT-only; OXI reads published events only

**Tech Stack Candidates:** Oracle OXI/OHIP, AWS EventBridge, AWS Lambda, RDS Aurora  
**Complexity:** ⭐⭐⭐ Medium  
**Cost Profile:** Medium (AWS serverless pricing, scales with event volume)

**Pros:**
- Natively satisfies the TR-2 async Business Event requirement — data reaches the cloud replica within seconds of an OPERA state change, not hours
- Event-driven architecture is inherently decoupled; the cloud pipeline can be scaled, modified, or replaced independently of the on-prem listener
- AWS Lambda's serverless model means infrastructure scales automatically with event volume and incurs no cost when idle
- Built-in dead-letter queue support in EventBridge / SQS provides resilience against transient failures without data loss
- Separating upsert and audit Lambda functions enforces a clean separation of concerns and makes compliance reporting straightforward

**Cons:**
- OXI/OHIP configuration requires Oracle-certified expertise; incorrect Business Event mappings can cause missed or duplicate events and may require Oracle support engagement
- Not all OPERA versions or deployment configurations expose the full set of Business Events needed — compatibility must be verified per property
- AWS vendor lock-in: the EventBridge + Lambda + RDS stack is not portable; migrating to another cloud provider would require significant rework
- Serverless cold-start latency can delay the first event processing after periods of inactivity, though this is typically sub-second
- Running cost scales directly with event volume; a high-churn property (large conference hotel) could generate unexpectedly high Lambda invocation and EventBridge costs

---

### Solution 3: ngrok / Pinggy Relay Agent with Encrypted Sync Queue

**Architecture Summary:**  
An on-premises sync agent establishes a persistent reverse-proxy tunnel via **ngrok** (or self-hosted alternative like **frp** or **Pinggy**) to expose a local gRPC/HTTPS endpoint exclusively to the SaaS backend. The SaaS cloud service sends a pull-request signal through the tunnel, prompting the agent to query Oracle, mask PII, and return the data payload — all within a single outbound-initiated session. A message queue (e.g., Redis Streams or SQS) buffers payloads for reliable delivery.

```
[SaaS Cloud Backend] ──pull signal──► [ngrok Cloud Edge]
                                               │ (outbound tunnel, no port forward)
                                               ▼
                                    [On-Prem ngrok Agent]
                                               │ SELECT query
                                               ▼
                                       [OPERA Oracle DB]
                                               │
                                    [PII Mask → Payload]
                                               │ TLS 1.3 response
                                               ▼
                                    [ngrok Cloud Edge]
                                               │
                                               ▼
                                  [Cloud Queue → Read-Replica]
```

> **Note:** The pull signal travels from cloud → tunnel edge, but the **data connection is initiated and maintained by the on-prem agent** (outbound), preserving TR-1 compliance. The cloud cannot initiate a new TCP session into the LAN.

**Compliance Mapping:**
- ✅ TR-1: TCP session is always established outbound by on-prem agent
- ✅ TR-2: Pull cadence configurable; compatible with event triggers
- ✅ TR-3: ngrok tunnel eliminates static IP / port forwarding requirement
- ✅ SC-1: ngrok enforces TLS 1.3 on all tunnel traffic
- ✅ SC-2: PII masked before payload leaves the agent
- ✅ SC-3: Read-only Oracle credentials

**Tech Stack Candidates:** ngrok / frp / Pinggy, Redis Streams or AWS SQS, PostgreSQL replica  
**Complexity:** ⭐⭐ Low-Medium  
**Cost Profile:** Low-Medium (ngrok paid tier for production use)

**Pros:**
- Extremely fast to prototype and deploy — the ngrok agent is a single binary with no complex configuration, making it ideal for proofs of concept or phased rollouts
- Self-hosted alternatives (frp, Pinggy) eliminate third-party dependency and can be operated entirely within the organization's own infrastructure
- The message queue buffer adds resilience: if the cloud replica is temporarily unavailable, payloads are retained and replayed without data loss
- Flexible trigger model — the pull signal can be sent on a schedule, on demand, or in response to application events, satisfying both TR-2 paths
- Straightforward to audit: each pull request and response can be logged at the queue layer with full payload metadata

**Cons:**
- ngrok's production-grade plans (custom domains, reserved tunnels, SSO) carry meaningful per-seat/per-tunnel monthly costs that can grow with scale
- The TR-1 compliance argument is nuanced — while the TCP session is outbound, the pull signal originates from the cloud, which may require additional justification during security review
- Self-hosted tunnel alternatives (frp) require the team to operate and secure their own relay infrastructure, adding operational overhead
- The relay introduces an additional network hop and potential latency compared to a direct outbound tunnel (Solution 1)
- ngrok free-tier tunnels use randomised public URLs that change on restart, making them unsuitable for production without a paid reserved-domain plan

---

### Solution 4: Azure Arc-Enabled Data Services + Azure Relay

**Architecture Summary:**  
For organizations already invested in Microsoft/Oracle ecosystems, **Azure Arc** can project on-premises data services into Azure's management plane without requiring inbound connectivity. An **Azure Relay Hybrid Connection** allows the on-prem OPERA sync agent to register as a listener. The cloud SaaS sends relay messages, the agent processes them locally (SELECT + PII mask), and publishes results to an **Azure SQL Read-Replica** or **Azure Cosmos DB** instance. Governance is managed centrally via Azure Policy and Defender for Cloud.

```
[OPERA Oracle DB]
        │ SELECT (read-only)
        ▼
[On-Prem Arc Agent + Relay Listener]
        │ Outbound registration to Azure Relay
        ▼
[Azure Relay Hybrid Connection Namespace]
        │
        ▼
[Azure Service Bus → Azure SQL / Cosmos DB]
        │
        ▼
[SaaS App Layer + Azure AD MFA (Entra ID)]
```

**Compliance Mapping:**
- ✅ TR-1: Relay Listener is outbound-registered; no inbound connections to LAN
- ✅ TR-2: Scheduled or event-triggered via Service Bus messages
- ✅ TR-3: Azure Relay requires no static IP or inbound port rules
- ✅ SC-1: Azure Relay enforces TLS 1.3 natively
- ✅ SC-2: PII masked within Arc agent prior to relay
- ✅ SC-3: Oracle user restricted to SELECT
- ✅ SA-1: Azure Entra ID enforces MFA; Conditional Access policies available

**Tech Stack Candidates:** Azure Arc, Azure Relay, Azure Service Bus, Azure SQL, Entra ID  
**Complexity:** ⭐⭐⭐⭐ Medium-High  
**Cost Profile:** Medium-High (Azure Arc + Relay licensing)

**Pros:**
- Best-in-class enterprise governance: Azure Policy, Defender for Cloud, and Entra ID Conditional Access provide centralised security controls across all connected hotel properties
- Entra ID MFA (SA-1) is deeply integrated, enabling passwordless authentication, Conditional Access policies, and Privileged Identity Management for admin accounts
- Azure Arc allows the on-premises agent to be monitored, patched, and managed from the Azure portal, reducing operational burden on hotel IT staff
- Azure Service Bus provides enterprise-grade message durability, ordering guarantees, and built-in dead-lettering — significantly more robust than a simple queue
- Strong fit for hotel groups already standardised on Microsoft 365 / Azure, avoiding new vendor relationships

**Cons:**
- Highest setup complexity among the five read-only solutions; Azure Arc configuration and Relay namespace provisioning require Azure-certified personnel
- Strong Azure vendor lock-in — the architecture cannot be replicated on AWS or GCP without a full rebuild
- Azure Arc licensing and Relay Hybrid Connection costs add a fixed monthly overhead regardless of data volume, making this less cost-efficient for single-property deployments
- Oracle-to-Azure SQL schema mapping may require non-trivial data type translation work, particularly for OPERA-specific data structures
- Azure Relay has less community documentation and tooling compared to Cloudflare Tunnel or ngrok, making troubleshooting slower for teams without Azure expertise

---

### Solution 5: Self-Hosted Temporal.io Workflow Engine + WireGuard Mesh VPN

**Architecture Summary:**  
A **Temporal.io** workflow engine deployed in the cloud orchestrates durable, retryable data sync workflows. A Temporal **Worker** process runs on-premises, polling the Temporal cloud server (outbound only) for workflow tasks. When assigned a task, the worker queries the OPERA Oracle DB, applies PII masking, and returns the result to the Temporal server, which persists it to the cloud read-replica. Network transport is hardened with **WireGuard** — a modern, cryptographically superior VPN — creating a zero-trust mesh without exposing hotel LAN ports.

```
[Temporal Cloud Server] ◄──── long-poll ────[On-Prem Temporal Worker]
                                                       │ (outbound only)
                                                       │ SELECT
                                                       ▼
                                              [OPERA Oracle DB]
                                                       │
                                            [PII Mask → Task Result]
                                                       │ WireGuard + TLS 1.3
                                                       ▼
                                           [Temporal Cloud Server]
                                                       │
                                                       ▼
                                         [Cloud Read-Replica + SaaS App]
```

**Compliance Mapping:**
- ✅ TR-1: Worker long-polls Temporal server (outbound); no cloud-initiated inbound connections
- ✅ TR-2: Workflow schedules configurable; supports event-driven triggers via Temporal Signals
- ✅ TR-3: WireGuard + Temporal worker polling eliminates all inbound firewall requirements
- ✅ SC-1: WireGuard (ChaCha20) + TLS 1.3 on Temporal gRPC transport
- ✅ SC-2: PII masked within the worker activity before task result is returned
- ✅ SC-3: Oracle read-only credentials enforced at DB level

**Tech Stack Candidates:** Temporal Cloud, WireGuard, Python/Go Temporal SDK, Oracle cx_Oracle  
**Complexity:** ⭐⭐⭐⭐ Medium-High  
**Cost Profile:** Medium (Temporal Cloud pricing per action)

**Pros:**
- Temporal's durable execution model guarantees that every sync workflow completes eventually — failed steps are automatically retried with configurable backoff, eliminating data gaps from transient network issues
- WireGuard provides modern, cryptographically superior transport (ChaCha20-Poly1305) with a minimal attack surface, significantly hardening the network layer beyond TLS 1.3 alone
- Temporal Signals enable true event-driven triggers from OPERA Business Events without requiring OXI configuration, satisfying TR-2's async path via a different mechanism
- Full workflow history and replay capability in Temporal provides a built-in audit trail of every sync operation, which is valuable for compliance reporting
- Workflow code can be version-controlled and tested like application code, making it more maintainable than cron-based or queue-based approaches over time

**Cons:**
- Temporal is a relatively niche technology in the hospitality sector; hiring or contracting developers with Temporal expertise is more difficult than for mainstream tools
- WireGuard mesh configuration adds operational complexity — key management, peer rotation, and network topology changes must be managed carefully across multiple hotel sites
- Temporal Cloud pricing is consumption-based (per workflow action), which can be difficult to forecast for high-volume OPERA environments and may require spend caps
- The combination of Temporal + WireGuard + Oracle SDK represents the largest number of distinct technologies to integrate and support in this solution set
- Self-hosted Temporal (as an alternative to Temporal Cloud) requires running and maintaining a Cassandra or PostgreSQL backend cluster, substantially increasing infrastructure overhead

---

## 3. Read & Write Solutions <a name="read-write-solutions"></a>

> ⚠️ **Critical Compliance Note:** The PRD (SC-3) mandates that the OPERA Oracle integration user be restricted to `SELECT` permissions. **Write-back to the OPERA production Oracle DB is explicitly out of scope.** The following solutions address write access to the **SaaS-managed cloud data layer** (e.g., replica, enrichment tables, workflow state), not to the OPERA database itself. Where OPERA write-back is a genuine business requirement, a separate privileged service account with audited, scoped `INSERT/UPDATE` permissions and change-approval workflows must be provisioned — this is a **PRD amendment** that requires sign-off.

---

### Read/Write Solution A: Bi-Directional Cloudflare Tunnel + Command Queue Pattern
*(Extends Solution 1)*

**Architecture Summary:**  
This solution extends the Cloudflare Tunnel architecture with an **async command queue** pattern. External stakeholders or the SaaS application write commands (e.g., rate overrides, notes, flags) to a cloud-side **command queue** (AWS SQS or Azure Service Bus). The on-premises agent — which already maintains the outbound tunnel — periodically polls this queue for pending commands, validates them against an allowlist schema, and applies writes to **approved, non-production OPERA tables** (e.g., a staging schema or a SaaS-managed sidecar database co-located on-prem).

```
[SaaS User / Stakeholder]
        │ Write intent (MFA-authenticated)
        ▼
[Cloud Command Queue (SQS)]
        │
        ▼                         ◄── Outbound poll (same Cloudflare Tunnel)
[On-Prem Agent]
        │ Schema validation + allowlist check
        │
        ├─► [OPERA Oracle DB — SELECT only, no change]
        │
        └─► [SaaS Sidecar DB / Approved Staging Schema — INSERT/UPDATE permitted]
```

**Write Scope:** SaaS-managed sidecar tables only. OPERA core schema remains read-only.  
**Additional Controls Required:**
- Command schema validation (reject malformed/unexpected payloads)
- Audit log of all write operations with user attribution
- Rate limiting on the command queue to prevent abuse
- Separate privileged service account for any write path (distinct from read account)

**Compliance Mapping:**
- ✅ TR-1: Agent polls queue outbound; no inbound cloud connection to LAN
- ✅ SC-3: OPERA Oracle user remains SELECT-only; writes go to sidecar schema
- ✅ SA-1: Write intent authenticated with MFA at SaaS layer

**Pros:**
- Reuses the existing Cloudflare Tunnel infrastructure from Solution 1, minimising additional components and operational surface area
- The async command queue decouples write intent from execution — stakeholders can submit commands even if the on-prem agent is temporarily offline, with guaranteed delivery on reconnection
- Schema validation and allowlist enforcement at the agent layer provides a strong defence-in-depth layer before any data reaches on-premises systems
- Separate service accounts for read and write paths (as required) limit the blast radius of a compromised credential
- Well-understood pattern (queue-based command processing) with extensive tooling support across AWS SQS, Azure Service Bus, and open-source alternatives

**Cons:**
- Write scope is intentionally limited to a sidecar schema — if stakeholders require writes back to native OPERA tables, this solution is insufficient without a PRD amendment and additional Oracle credentials
- Introduces a second on-prem process (command processor) that must be monitored, maintained, and kept in sync with the read agent
- Allowlist schema management becomes an ongoing responsibility; as the SaaS application evolves, the allowlist must be updated and re-deployed to the on-prem agent
- Asynchronous write execution means stakeholders will not receive immediate confirmation that their command was applied — UI design must account for eventual-consistency feedback patterns
- Rate limiting and abuse prevention on the command queue must be carefully tuned; too restrictive and legitimate writes are delayed, too permissive and the queue becomes a potential denial-of-service vector

---

### Read/Write Solution B: OHIP REST API Gateway with Scoped Write-Back
*(Extends Solution 2)*

**Architecture Summary:**  
Oracle's **OHIP (Oracle Hospitality Integration Platform)** provides a certified REST API layer on top of OPERA Cloud. Where the hotel has migrated to or partially integrated with OPERA Cloud, OHIP can serve as the **official, sanctioned write channel** back into OPERA — replacing direct Oracle DB writes with API-level mutations that OPERA itself validates. An **API Gateway** (Kong or AWS API Gateway) fronts OHIP, enforcing OAuth 2.0 scopes, rate limits, and audit logging. The SaaS application holds scoped tokens permitting only approved OHIP endpoints (e.g., `PUT /reservations/{id}/notes`).

```
[SaaS App — MFA Authenticated User]
        │ Scoped OAuth 2.0 token
        ▼
[Cloud API Gateway (Kong / AWS APIGW)]
        │ Scope enforcement + rate limit + audit
        ▼
[OHIP REST API (Oracle-managed)]
        │ Validated write to OPERA
        ▼
[OPERA PMS / Oracle DB]
```

**Write Scope:** OHIP-permitted operations only (OPERA validates all mutations).  
**Additional Controls Required:**
- OAuth scope taxonomy mapped to OHIP endpoint permissions
- Full audit trail at API Gateway layer
- OHIP subscription/licensing from Oracle required
- Confirm hotel's OPERA version supports OHIP integration

**Compliance Mapping:**
- ✅ TR-1: Reads remain pull-based; OHIP writes are a separate, approved channel
- ✅ SC-3: No direct Oracle SQL writes; all mutations go through OHIP validation layer
- ✅ SA-1: OAuth 2.0 + MFA at SaaS layer; OHIP provides additional auth

**Pros:**
- The only solution that writes to native OPERA data structures through an officially sanctioned, Oracle-certified channel — eliminating the risk of corrupting the production database with malformed SQL
- OHIP's own validation layer acts as a second line of defence, rejecting writes that violate OPERA's business rules (e.g., invalid reservation states, duplicate rate codes)
- OAuth 2.0 scopes provide fine-grained, auditable access control — each stakeholder role can be restricted to exactly the OHIP endpoints their function requires
- API Gateway-level rate limiting and audit logging centralise security controls without requiring on-prem changes
- Best long-term alignment with Oracle's product roadmap, as OHIP is Oracle's stated integration standard for OPERA Cloud going forward

**Cons:**
- Requires an active OHIP subscription and Oracle licensing, which adds significant and ongoing vendor cost — and Oracle's enterprise licensing negotiations can be lengthy
- Strictly dependent on the hotel having deployed OPERA Cloud or a hybrid OHIP-compatible configuration; on-premises-only OPERA installations may not support OHIP without an upgrade
- OHIP's available write endpoints are limited to what Oracle has published — custom or bespoke OPERA data operations may not be achievable through this channel
- API Gateway management (Kong or AWS APIGW) is an additional infrastructure component requiring its own deployment, scaling, and maintenance discipline
- OHIP API versioning changes can break integrations if the SaaS application does not track Oracle's release cadence, creating a dependency on Oracle's update schedule

---

### Read/Write Solution C: Event-Sourced CQRS Architecture with Dual-Path Agent
*(Extends Solutions 1 & 5)*

**Architecture Summary:**  
This is the most architecturally mature option. A **CQRS (Command Query Responsibility Segregation)** pattern separates read and write concerns entirely. The **Query path** is identical to Solution 1 or 5 — the on-prem agent pulls OPERA data and populates the cloud read-replica. The **Command path** maintains a cloud-side **event store** (e.g., EventStoreDB or Kafka) where write intents are recorded as immutable events. A separate **Command Processor** on-premises subscribes to this event stream (outbound connection), applies business rule validation, and executes approved writes against a **SaaS-controlled schema** within the hotel's environment or via OHIP.

```
              ┌─────── QUERY PATH (Read) ──────────────────────────┐
              │                                                     │
[OPERA Oracle DB] ──SELECT──► [On-Prem Read Agent] ──► [Cloud Replica]
                                                                    │
                                                         [SaaS Read UI]

              ┌─────── COMMAND PATH (Write) ────────────────────────┐
              │                                                     │
[SaaS Write UI] ──► [Cloud Event Store / Kafka] ◄── poll (outbound)
                                                         │
                                              [On-Prem Command Processor]
                                                         │ Validates + routes
                                                         ├─► [Sidecar Schema / OHIP]
                                                         └─► [Audit Log]
```

**Write Scope:** SaaS sidecar schema and/or OHIP API endpoints. Event store provides full auditability and replay capability.  
**Additional Controls Required:**
- Immutable event log (append-only) for complete audit trail
- Dead-letter queue for failed/rejected commands
- Separate on-prem process identity for command processor vs read agent
- Schema versioning strategy for event payloads

**Compliance Mapping:**
- ✅ TR-1: Both read and command processors use outbound polling; no inbound LAN connections
- ✅ TR-3: Both agents connect outbound through tunnel/relay — no static IP required
- ✅ SC-1: Kafka/EventStore + TLS 1.3 on all transit paths
- ✅ SC-3: OPERA Oracle DB user remains SELECT-only; no direct SQL writes from cloud
- ✅ SA-1/SA-2: Read replica and event store are separate; write events authenticated with MFA + scoped tokens

**Pros:**
- The most auditable architecture in this document: every write intent is recorded as an immutable event before execution, enabling complete replay, forensic investigation, and regulatory reporting
- CQRS's strict separation of read and write paths eliminates the risk of a write operation inadvertently degrading read performance on the OPERA server or the cloud replica
- The event store enables temporal querying — stakeholders can reconstruct the state of any OPERA entity at any point in time, which is valuable for dispute resolution and shareholder reporting
- Dead-letter queue handling and event replay make the system highly resilient; failed commands can be inspected, corrected, and reprocessed without data loss
- Scales naturally to multi-property deployments — additional hotel sites can be onboarded as new consumer groups on the same Kafka topic without architectural changes

**Cons:**
- Highest engineering complexity in this document; CQRS and event sourcing are advanced patterns that require developers with specific distributed systems experience to implement correctly
- Operational overhead is substantial: Kafka (or EventStoreDB) requires its own deployment, monitoring, retention policy management, and capacity planning
- Schema versioning for event payloads is a long-term maintenance commitment — as the OPERA data model or SaaS application evolves, event schemas must be versioned and old consumers must remain compatible
- Two separate on-prem agent processes (read agent + command processor) double the on-premises deployment and monitoring footprint
- Eventual consistency between the read replica and the command outcomes can be confusing for end users if the UI does not clearly communicate pending vs. applied states — requires careful UX design

---

## 4. Comparison Matrix <a name="comparison-matrix"></a>

| Solution | Type | Connectivity Method | Complexity | Cost | OXI/OHIP Native | Write Capable |
|---|---|---|---|---|---|---|
| **1. Cloudflare Tunnel + Replica** | Read | Cloudflare Tunnel | ⭐⭐ | Low | Optional | ❌ (base) |
| **2. OXI/OHIP Business Events** | Read | Outbound Webhook | ⭐⭐⭐ | Medium | ✅ Native | ❌ |
| **3. ngrok Relay + Queue** | Read | ngrok / Pinggy | ⭐⭐ | Low-Med | Optional | ❌ |
| **4. Azure Arc + Relay** | Read | Azure Relay | ⭐⭐⭐⭐ | Med-High | Optional | ❌ |
| **5. Temporal + WireGuard** | Read | WireGuard + Long-poll | ⭐⭐⭐⭐ | Medium | Optional | ❌ |
| **A. Cloudflare + Command Queue** | R/W | Cloudflare Tunnel | ⭐⭐⭐ | Low-Med | Optional | ✅ Sidecar |
| **B. OHIP REST API Gateway** | R/W | Direct HTTPS (OHIP) | ⭐⭐⭐ | Med-High | ✅ Native | ✅ OHIP-scoped |
| **C. CQRS Event-Sourced Dual-Path** | R/W | Tunnel + Event Stream | ⭐⭐⭐⭐⭐ | High | Optional | ✅ Full |

---

## 5. Recommended Starting Point

For most hotel deployments, **Solution 1 (Cloudflare Tunnel + Replica)** offers the best balance of simplicity, cost, and compliance coverage. If Business Events are already configured in OXI/OHIP, **Solution 2** provides superior data freshness with no polling overhead.

For organizations requiring write-back, **Solution A** (extending Solution 1 with a command queue) provides the lowest-risk path, as it preserves the SELECT-only constraint on the OPERA Oracle DB while enabling controlled writes to a SaaS-managed sidecar.

**Solution C (CQRS)** is recommended only where long-term auditability, multi-property scale, or complex write workflows justify the additional engineering investment.

---

*Document prepared for review. All solutions subject to Oracle OPERA PMS version compatibility assessment and hotel IT infrastructure audit prior to implementation.*
