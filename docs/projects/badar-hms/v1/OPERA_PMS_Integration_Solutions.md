# Secure Hybrid SaaS Integration for OPERA PMS
## Solution Architecture Options

**Document Version:** 1.0  
**Status:** Draft  
**Reference PRD Version:** 1.0

---

## Table of Contents
1. [Overview & Constraints Summary](#1-overview--constraints-summary-)
2. [Read-Only Solutions (5 Options)](#2-read-only-solutions-)
3. [Read & Write Solutions (3 Options)](#3-read--write-solutions-)
4. [Comparison Matrix](#4-comparison-matrix-)

---

## 1. Overview & Constraints Summary <a id="overview"></a>

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

## 2. Read-Only Solutions <a id="read-only-solutions"></a>

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

---

## 3. Read & Write Solutions <a id="read-write-solutions"></a>

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

---

## 4. Comparison Matrix <a id="comparison-matrix"></a>

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
