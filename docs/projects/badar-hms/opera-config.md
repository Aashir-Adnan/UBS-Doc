
> This section documents what Oracle OPERA 5.x (on-premises) permits and prohibits at the network, connectivity, and integration level. All statements reflect standard OPERA 5 deployments on Windows Server with Oracle Database 12c/19c. Individual property configurations may vary based on hotel IT policy and Oracle support agreements.

---

### 3.1 Port Forwarding

**What OPERA 5 permits:** Port forwarding is a hotel firewall and router decision — OPERA software imposes no restrictions. Port 1521 (Oracle TNS Listener) and OWS ports (8080 or 443) can be forwarded if the firewall permits it.

**What is strongly inadvisable:** Exposing port 1521 directly to the internet is a critical security risk. Oracle advises against internet-facing TNS listeners. Any port forwarding must terminate at a VPN endpoint, reverse proxy, or application layer — never the Oracle DB listener directly.

**Practical constraint:** Many hotels run ISP-provided routers with NAT that do not support port forwarding without a business-grade broadband contract. This must be assessed per property before any solution requiring inbound access is chosen.

---

### 3.2 Hosting an Application Server

**What OPERA 5 permits:** OPERA runs on Windows Server and does not prevent additional processes (e.g., a Node.js agent) running on the same host, provided sufficient CPU and RAM are available.

**What Oracle recommends:** Oracle discourages co-hosting non-OPERA workloads on the PMS application server due to resource contention risk. A dedicated Windows Server VM is the recommended approach for any integration agent.

**Practical constraint:** A lightweight Node.js agent consumes under 100MB RAM at normal load and is generally acceptable even on constrained servers. A Debezium or GoldenGate CDC agent is considerably heavier and requires a dedicated VM.

---

### 3.3 WebSocket and Encrypted Tunnel Support

**What OPERA 5 permits:** OPERA 5 has no native WebSocket capability. A separately installed Node.js agent on the hotel network can open outbound WSS connections to cloud endpoints without any OPERA involvement.

**Encrypted tunnels:** IPSec site-to-site VPN is managed entirely at the hotel router or firewall level — OPERA is unaware. Oracle TLS encryption for the TNS connection (`SQLNET.ENCRYPTION_SERVER = required` in `sqlnet.ora`) is supported from Oracle 12c onwards and is enabled by the DBA with no OPERA application change required.

**Practical constraint:** IPSec VPN requires a business-grade router (Cisco, Fortinet, pfSense). Consumer-grade ISP-provided routers typically cannot terminate site-to-site VPNs.

---

### 3.4 Firewall Configuration

**What OPERA 5 permits:** OPERA does not manage the hotel's firewall. All rules are controlled by hotel IT or the MSP.

**Standard OPERA 5 ports (internal network only):**

- **1521** — Oracle TNS Listener. Internal only; never internet-facing.
- **8080 / 443** — OWS HTTP/HTTPS. If internet-facing, must be IP-whitelisted to specific cloud service ranges.
- **7001 / 7002** — Oracle WebLogic, if OWS is deployed on WebLogic.

**Best practice rule:** No inbound rule from `0.0.0.0/0` on any database or application port. All integration-purpose inbound rules must be source-IP-whitelisted.

**For outbound-only solutions (Solution 3):** No inbound firewall rules are needed at all. The hotel firewall only needs outbound TCP 443 permitted, which is universally open by default.

---

### 3.5 Rate Limits

**OWS rate limits:** OWS has no documented hard per-minute request cap, but high-frequency OWS calls degrade PMS performance. Oracle's guidance is to keep OWS call frequency low — consistent with TR-2's prohibition on polling.

**Oracle DB session limits:** The Oracle DB has a configurable maximum session count (`SESSIONS` and `PROCESSES` in `init.ora`). Standard OPERA deployments configure 150–400 sessions. Any integration solution opening a connection pool to Oracle must not consume sessions needed by OPERA itself. Recommended cap: 5–10 dedicated integration sessions.

**CDC and session load:** CDC via LogMiner or GoldenGate reads the redo log asynchronously and does not execute SQL queries against OPERA tables. It consumes no OPERA session slots — a significant advantage over any query-based approach.

---

### 3.6 Static IP

**What OPERA 5 permits:** OPERA has no static IP dependency. This is an ISP and router concern.

**Why it matters for integration:** Solutions that whitelist inbound connections (VPN endpoint, OWS port, GoldenGate replication target) will break if the hotel's IP rotates. A static IP requires a business broadband contract and typically incurs a monthly ISP surcharge.

**Where it is not required:** Solution 3 (WebSocket Agent) and Solution 4 (CDC + Kafka) both use outbound-only connections from the hotel network. Neither requires a static IP, as the cloud endpoint accepts connections from any source IP.

---

### 3.7 Summary Table

| Capability | OPERA 5 Support | Practical Status | Notes |
|---|---|---|---|
| Port forwarding (TNS 1521) | Not restricted by OPERA | ⚠️ Strongly inadvisable | Never expose to internet; use VPN |
| Port forwarding (OWS 8080/443) | Not restricted by OPERA | ✅ Acceptable with IP whitelist | Restrict source IP strictly |
| Co-hosted application server | ✅ Permitted (Windows Server) | ⚠️ Discouraged on PMS host | Use dedicated VM |
| Native WebSocket server | ❌ Not available | N/A | Agent provides this separately |
| Outbound WebSocket from agent | ✅ OS-level; OPERA unaware | ✅ Supported | No OPERA change required |
| IPSec / WireGuard VPN | ✅ Network-level; OPERA unaware | ✅ Supported | Requires business-grade router |
| Oracle TLS (sqlnet.ora) | ✅ Oracle 12c+ | ✅ Supported | DBA enables; no OPERA change |
| Inbound firewall rules | Controlled by hotel IT | ⚠️ Risk-dependent | Always whitelist source IPs |
| OWS rate limiting | No hard cap | ⚠️ Performance risk | High frequency degrades PMS |
| Oracle session limits | Configurable (init.ora) | ⚠️ Must be managed | Reserve ≤10 sessions for integration |
| Static IP | ISP-dependent | ⚠️ Business broadband required | Not needed for outbound-only solutions |
| CDC via LogMiner (Debezium) | ✅ Oracle 12c+ with supplemental logging | ✅ Supported | DBA must enable supplemental logging |
| CDC via GoldenGate | ✅ Licensed Oracle product | ✅ Supported | Requires separate GoldenGate license |