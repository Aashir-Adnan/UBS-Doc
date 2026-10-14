# OPERA PMS Integration — Technical Questionnaire

This questionnaire collects what we need to know about the hotel's OPERA PMS, network and IT setup before we pick and cost an integration architecture (see the OPERA PMS Integration Solutions documents, V1–V4).

Every question comes with:

- **Why it matters**: the decision the answer feeds.
- **If yes / available**: what becomes possible, cheaper or simpler.
- **If no / unknown**: what gets ruled out, costs more, or adds risk.

Solutions are referred to as:

| Code | Solution |
|---|---|
| **S1** | OHIP REST API + webhooks (no on-premises software) |
| **S2** | Direct Oracle DB access over VPN + CDC |
| **S3** | On-premises Node.js agent + outbound secure WebSocket |
| **S3R** | S3 revised: agent reads OPERA Business Events and writes through OWS on the LAN (no direct table writes, no DB triggers) |
| **S4** | CDC + Kafka + OHIP/OWS writes |

If you don't know an answer, write **"Unknown"** and tell us who might know (hotel IT, MSP, Oracle partner, Oracle account manager). "Unknown" is a useful answer too, because it tells us what still needs checking.

---

## Section A — OPERA Environment

### A1. Which OPERA product and exact version/build is in use?
e.g. OPERA 5.0.06.xx, OPERA 5.6.x, or OPERA Cloud. The exact build is on the OPERA login screen or under Help → About.

- **Why it matters:** This is the most important question. OPERA Cloud and OPERA 5 on-premises use completely different integration channels, and the supported interfaces vary between OPERA 5 builds.
- **If OPERA Cloud:** S1 (OHIP) becomes the primary choice. We need no software on-premises, no firewall changes and no DBA work. S2, S3 and S4 no longer apply.
- **If OPERA 5.6 or later:** Ask Oracle whether OHIP connectivity is available for the property. If it is, S1 may work without migrating to OPERA Cloud.
- **If OPERA 5.5 or earlier:** OHIP is not an option. On-premises channels (OXI, OWS) are the only supported routes, so S3R becomes the main candidate.
- **If unknown:** We can't narrow the options, and every cost estimate stays a range.

### A2. Is OPERA hosted on the hotel premises, in a private data centre, or by Oracle / a partner (ASP hosting)?

- **Why it matters:** This decides where an integration agent can run and who controls the network and database.
- **If on hotel premises:** An agent VM on the hotel LAN is possible (S3/S3R), and the hotel's own IT controls the firewall.
- **If in a data centre or partner-hosted:** The "hotel LAN" is really the hosting provider's network. Any VM, firewall rule or DB change needs their approval and may cost extra. The provider may offer its own integration gateway, which could replace our agent.
- **If Oracle-hosted:** DB-level access (S2, S4, and S3's trigger design) is almost certainly forbidden. Only Oracle-provided interfaces (OWS, OXI, OHIP) are available.

### A3. How many properties are there, and do they share one OPERA installation (multi-property) or does each run its own?

- **Why it matters:** It changes the deployment model and whether enterprise-scale options are worth their cost.
- **If one shared multi-property OPERA:** One agent (or one OHIP connection) serves every property. We need a mapping from OPERA resort codes to our HMS tenants.
- **If one OPERA per property:** Every property needs its own agent, credentials and monitoring, so remote fleet management becomes a requirement.
- **If 10 or more properties (now or planned):** S4 (CDC + Kafka) becomes worth evaluating. Below that, its running cost and effort are out of proportion.

### A4. Are there plans to migrate to OPERA Cloud, and if so, when?

- **Why it matters:** It avoids building an integration that is thrown away within a year.
- **If a migration is planned within about 12–18 months:** Build our cloud-side ingestion layer so it doesn't depend on the source, make the on-premises piece minimal (S3R), and plan to switch to S1 on migration. Avoid S2 and S4 entirely.
- **If no migration is planned:** On-premises integration is a long-term investment, so a sturdier agent, monitoring and upgrade tooling are justified.

### A5. Which Oracle Database version runs under OPERA (e.g. 12c, 19c)?

- **Why it matters:** Change-notification features, TLS support and CDC tooling all depend on the DB version.
- **If 19c:** Client-initiated Continuous Query Notification is available, so a read-only agent can receive change events without the DB opening connections back to the agent. Current Debezium/LogMiner support is better, and TLS 1.2/1.3 options are broader.
- **If 12c:** Change notifications need the DB server to connect back to the agent host, so the internal firewall between the DB and agent VM must allow it. 12c is past Oracle's premier support, which limits CDC tooling and may block TLS 1.3 on the local hop.
- **If unknown:** We can't commit to a change-detection mechanism for S3/S3R.

### A6. What type of Oracle Database licence came with OPERA: Application Specific Full Use (ASFU), Embedded, or Full Use?
The Oracle contract or the Oracle partner can confirm this.

- **Why it matters:** OPERA is commonly sold with a restricted Oracle DB licence that only permits use by the OPERA application. Adding triggers or schema objects, connecting third-party tools, or running LogMiner/GoldenGate may breach that licence.
- **If Full Use:** DB-level integration (S4's CDC, change notifications, a read-only integration user) is licence-safe. Oracle support terms still apply.
- **If ASFU / Embedded:** Treat S2, S4 and the original S3 design (DB triggers, direct writes) as not allowed until Oracle confirms otherwise in writing. Only OPERA's own interfaces (OXI, OWS, Business Events) are safe, which points to S3R or S1.
- **If unknown:** This must be answered before any DB-level solution is costed. A licence breach found during an Oracle audit costs far more than the whole integration.

### A7. Does the hotel have an active Oracle Hospitality support agreement, and who is the authorised OPERA partner / reseller?

- **Why it matters:** Interface licences, DBA changes and OHIP/OWS enablement all go through Oracle or the partner.
- **If yes:** We can ask for interface quotes (OWS, OXI, Business Events) and technical confirmations directly, which shortens procurement.
- **If no:** Oracle may refuse to enable or support new interfaces. Any unsupported DB change also puts future OPERA support at risk. Expect a longer commercial lead time.

### A8. Is there a non-production OPERA environment (test / training / UAT) we can integrate against first?

- **Why it matters:** Integration testing against live reservations risks creating real bookings or corrupting live data.
- **If yes:** Development and testing happen safely, and interface behaviour can be proven before go-live.
- **If no:** Budget for Oracle/partner to set up a test environment, or accept a much slower go-live with manual verification. Write-path testing (creating bookings in OPERA) becomes high-risk.

---

## Section B — OPERA Interfaces Already Licensed

### B1. Is OWS (OPERA Web Services) licensed and installed? If yes, which modules (Reservation, Availability, Name/Profile, Rate)?

- **Why it matters:** On OPERA 5, OWS is the only Oracle-supported way to create or modify reservations from outside. The alternative is writing directly to OPERA tables, which bypasses inventory, rate and business-event logic and isn't supported by Oracle.
- **If yes:** S3R's write path (agent → OWS on the LAN) can be built without new licensing. We need the OWS URL, version and module list.
- **If no:** An OWS licence is a required purchase for any on-premises write-back, so get an Oracle quote early. Without it, the integration can only be read-only (OPERA → HMS), and bookings made in our HMS can't reach OPERA automatically.

### B2. Is OXI licensed? If yes, which interfaces (OXI generic, OXI-HUB, specific channel/CRS interfaces)?

- **Why it matters:** OXI carries OPERA Business Events, which are OPERA's own push notifications for reservation, profile, rate, inventory and check-in/out changes. It is the supported, zero-polling way to detect changes.
- **If yes:** S3R can read events from OXI with no DB triggers, no supplemental logging and no licence risk. This is the cleanest real-time read channel on OPERA 5.
- **If no:** Either buy an OXI licence or fall back to DB-level change detection (A5/A6 must then allow it). Without both, near-real-time sync isn't achievable in a supported way.

### B3. Are Business Events enabled in OPERA, and for which modules/actions?
Configured in OPERA under Setup → Business Events.

- **Why it matters:** Even with OXI licensed, events only fire for the modules and actions that are switched on.
- **If enabled for Reservation, Profile, Allotment/Block and Rate:** Every change we need arrives as an event, and reconciliation is only a safety net.
- **If partly enabled or disabled:** They must be configured, which usually means partner or hotel IT effort. Changes to modules without events are missed until reconciliation runs.

### B4. What other systems already integrate with OPERA?
e.g. channel manager (SiteMinder, D-EDGE, SynXis), booking engine, CRS, revenue management, POS, key cards, call accounting (IFC8), HTNG interfaces.

- **Why it matters:** Existing integrations show which interfaces are already licensed and working, and they point to conflicts over who owns inventory.
- **If a channel manager / booking engine already pushes bookings into OPERA:** Our HMS may be able to take bookings through that same channel instead of a new OWS link. We also need to agree which system owns availability, to avoid double-selling.
- **If an HTNG or OXI-HUB interface already exists:** It may be extendable to our HMS, which removes a new licence.
- **If there are none:** OPERA's interface stack is untested at this property, so plan extra partner time for first-time enablement.

### B5. Is OHIP access available or already contracted (for OPERA Cloud, or for OPERA 5 where Oracle offers it)?

- **Why it matters:** OHIP means S1: no agent, no firewall changes, and Oracle-validated writes.
- **If yes:** S1 is the recommended primary path. We need the OHIP environment, application registration and a list of subscribed APIs and webhooks.
- **If no:** S1 is ruled out for now, and on-premises integration (S3R) is needed.

---

## Section C — Data Scope and Business Rules

### C1. Which data must flow OPERA → HMS?
Tick all that apply: reservations, guest profiles, room inventory/availability, rates and rate codes, allotments/blocks, room status (housekeeping), check-in/check-out, folios/charges, packages.

- **Why it matters:** Scope drives which interface modules, event types and mapping work are needed, and so the cost.
- **Each item ticked:** More interface modules (B1–B3) and more mapping into HMS tables (bookings, services, catalog pricing).
- **Folios / charges ticked:** This touches financial data and possibly PCI scope (see E2), and raises effort sharply.
- **Only reservations + availability:** This is the smallest useful scope and the fastest path to a first live property.

### C2. Which data must flow HMS → OPERA?
e.g. new bookings, modifications, cancellations, guest profile updates, service/add-on charges posted to the room folio.

- **Why it matters:** The write scope decides whether OWS is mandatory (B1) and which OWS modules are needed.
- **If new bookings / modifications are required:** An OWS Reservation module (or OHIP) is mandatory, and idempotent commands with a durable queue on the agent are required.
- **If folio charge posting is required:** Extra OWS/IFC modules are needed, plus financial reconciliation.
- **If nothing is written back (read-only):** The whole design becomes much simpler and cheaper. We can drop OWS and write commands, and the agent only reads.

### C3. When the same reservation is changed in both OPERA and HMS at nearly the same time, which system wins?

- **Why it matters:** Two-way sync always creates conflicts, and without a rule the data drifts silently.
- **If OPERA always wins (OPERA is the system of record):** HMS edits to OPERA-originated bookings must go through OPERA first (write, then confirm by event). This is the simplest rule and the one we recommend.
- **If HMS wins for some fields:** We need field-level ownership rules and conflict logging, which adds development and testing time.
- **If undecided:** This must be settled before build. It isn't a technical choice.

### C4. What is the typical and peak reservation activity?
Bookings/modifications per day, peak per hour, total rooms.

- **Why it matters:** It sizes the agent, the message queue and the cloud ingestion, and shows whether event load could affect OPERA.
- **If low to moderate (a few thousand events a day):** A single small agent VM and our existing backend are enough, and there is no reason for Kafka (S4).
- **If very high (large resort, conference hotel, many properties):** Load-test the change-detection method, and consider a queue between the agent and backend.

### C5. How quickly must a change in one system appear in the other?
e.g. under 5 seconds, under 1 minute, under 15 minutes.

- **Why it matters:** "Real-time with zero polling" (constraint TR-2) is the main driver of cost and complexity in the current proposals.
- **If seconds are required:** Event-driven reading (OXI Business Events, OHIP webhooks or CDC) is mandatory.
- **If a minute or more is acceptable:** A lightweight scheduled reconciliation can run beside events, or even replace them for low-priority data. Cost and risk drop considerably.
- **Either way:** We recommend a periodic reconciliation job as a safety net for missed events. Please confirm this is acceptable alongside the no-polling requirement.

### C6. When is the OPERA night audit / end-of-day run, and how long does it take?

- **Why it matters:** During night audit OPERA is busy or partly locked, and interface writes may be rejected or delayed.
- **If known:** We schedule reconciliation around it, and the agent queues write commands during the window.
- **If unknown:** Expect intermittent write failures at night that look like bugs, so a durable retry queue becomes essential.

### C7. What should happen in HMS when the hotel's internet connection is down?

- **Why it matters:** The on-premises agent can't reach the cloud during an outage, and bookings made in HMS can't reach OPERA.
- **If HMS keeps taking bookings and syncs later:** The agent and backend need durable queues on both sides, plus conflict handling on reconnect (see C3). This also risks overbooking during long outages.
- **If HMS pauses booking for that property:** It's simpler and safer, but guests can't book during the outage.
- **If the hotel has a backup internet link (see D1):** Outages become rare and short, which lowers the design burden.

---

## Section D — Network and Infrastructure

### D1. What internet connection does the property have?
Type (fibre/DSL/4G), upload/download speed, and whether there is a backup line.

- **Why it matters:** Every on-premises solution depends on a persistent outbound connection.
- **If business fibre with a backup line:** S3/S3R's persistent connection is reliable, and reconnect handling is rarely exercised.
- **If a single consumer line / DSL:** Expect frequent drops, so a durable agent queue and reconciliation are mandatory. Solutions that need a stable tunnel (S2's VPN) become unreliable.

### D2. What router / firewall make and model does the property use, and who manages it (hotel IT, MSP, ISP)?

- **Why it matters:** VPN termination, IP allowlisting and outbound filtering depend on the equipment and on who is allowed to change it.
- **If business-grade (Fortinet, Cisco, Sophos, pfSense, MikroTik) and hotel/MSP-managed:** S2/S4 network requirements are feasible, and rule changes can be scheduled.
- **If an ISP-provided consumer router:** Site-to-site VPN and reliable port forwarding usually aren't possible, which rules out S2 and S4's inbound OWS option. S1 and S3/S3R are unaffected, since they need outbound only.

### D3. Does the property have a static public IP address?

- **Why it matters:** Only solutions that accept inbound connections at the hotel need one.
- **If yes:** S2 (VPN) and S4 with cloud-to-OWS writes become possible.
- **If no:** S2 is ruled out, and S4 must write through an on-premises agent instead of calling OWS from the cloud. S1 and S3/S3R need nothing. (OHIP webhooks go to our cloud endpoint, not to the hotel, so S1 needs no hotel static IP.)

### D4. Is outbound HTTPS (TCP 443) from servers restricted?
e.g. via a proxy, domain allowlist, or TLS/SSL inspection.

- **Why it matters:** S3/S3R's agent keeps a long-lived outbound secure WebSocket.
- **If unrestricted:** No firewall change is needed.
- **If a domain allowlist is used:** Hotel IT must allow our backend hostname, which is a minor task.
- **If an HTTP proxy or TLS inspection is used:** Many inspection proxies cut or break long-lived WebSockets. We'll need a proxy/inspection exemption for the agent host, or an HTTPS long-poll fallback. Please tell us the proxy product.

### D5. Is the OPERA server on its own VLAN / network segment, and what is allowed to reach it?

- **Why it matters:** The agent VM must reach OPERA's interfaces (OWS port, OXI, or DB port 1521) on the internal network.
- **If segmented with strict rules:** Internal firewall rules from the agent VM to OPERA are needed (and, on DB 12c, from the DB back to the agent for change notifications, see A5).
- **If flat network:** Connectivity is easy, but tell us so we can recommend isolating the agent VM.

### D6. Can the hotel provide a dedicated VM or small server for an integration agent? If yes, what hypervisor and OS (Windows Server or Linux)?
Suggested minimum for S3/S3R: 2 vCPU, 4 GB RAM, 40 GB disk. S4 needs about 4 vCPU and 8 GB RAM.

- **Why it matters:** Oracle discourages running extra software on the OPERA application server.
- **If yes:** S3/S3R deploy onto it. OS choice decides packaging (Windows Service vs systemd).
- **If no:** Budget for a small dedicated mini-PC/appliance, or accept running on the OPERA server with resource monitoring (not recommended). S4 is effectively ruled out.

### D7. How may our team access on-premises systems remotely for installation and support?
e.g. VPN client, TeamViewer/AnyDesk, jump host, on-site visits only.

- **Why it matters:** An on-premises agent needs updates, log collection and troubleshooting over its lifetime.
- **If a sanctioned remote access method exists:** Remote install and support are possible, lowering ongoing cost.
- **If on-site only:** Every agent upgrade or incident needs a visit. Automatic, self-updating agents become important, and support cost rises.

---

## Section E — Security and Compliance

### E1. Which data-protection laws and internal policies apply to guest data?
e.g. KSA PDPL, UAE PDPL, GDPR. Is there a data-residency requirement (data must stay in-country)?

- **Why it matters:** It decides which cloud region we can use and what guest data may leave the premises (constraint SC-2).
- **If residency is required:** The cloud database and backups must sit in an approved in-country region, which may limit hosting options and change cost.
- **If PII must be minimised:** The agent masks or strips fields before sending, and HMS works with pseudonymised guest data except for booking essentials.
- **If no constraints:** Standard encryption in transit and at rest is sufficient.

### E2. Does OPERA store payment card data (card numbers, tokens) for reservations?

- **Why it matters:** Syncing card data would bring our cloud platform into PCI DSS scope, a major compliance and cost burden.
- **If yes:** Card fields must be excluded at the agent/interface level and never synced. Payment in HMS stays on its own gateway tokens.
- **If tokenised by a payment provider:** Confirm tokens can't be used outside OPERA, then exclude them anyway.
- **If no:** No PCI impact from the integration.

### E3. Which identity provider should external users (owners, managers, partners) sign in with, and is MFA already in place?
e.g. Microsoft Entra ID / Azure AD, Google Workspace, none.

- **Why it matters:** Constraint SA-1 requires MFA for all external users.
- **If an existing IdP with MFA:** We integrate single sign-on, so users need no new passwords.
- **If none:** HMS provides its own MFA (TOTP/OTP), which adds onboarding and support effort.

### E4. Must every data change and every integration action be audit-logged, and for how long must logs be kept?

- **Why it matters:** It sets logging depth, storage cost and retention configuration on both the agent and the cloud.
- **If yes, with a defined retention period:** Immutable audit logs of each synced event and write command, sized to that period.
- **If no formal requirement:** Standard operational logging with a sensible default retention.

### E5. What change-management approval is needed before installing software or making OPERA/network changes, and how long does it usually take?

- **Why it matters:** Approval lead time often dominates the project timeline more than development does.
- **If a defined, quick process:** Go-live dates can be planned with confidence.
- **If slow or multi-party (hotel IT + MSP + Oracle partner + owner):** Favour solutions with the fewest on-premises changes (S1, then S3R) and start approvals in parallel with development.

---

## Section F — People and Access

### F1. Who is the hotel's IT contact, and is there an MSP? Please give names, roles and availability.

- **Why it matters:** Every on-premises step (VM, firewall, OPERA configuration) needs a named owner.
- **If a responsive in-house IT or MSP:** On-premises setup is estimated in days.
- **If none:** We or the Oracle partner must perform the setup, so on-premises effort and cost rise.

### F2. Is an Oracle DBA available (hotel, partner or Oracle), and are they allowed to create integration users or change DB settings?

- **Why it matters:** Any DB-level work (read-only integration user, change notifications, supplemental logging for CDC) needs a DBA, and possibly Oracle approval (A6).
- **If yes and permitted:** S3R's optional DB-level read fallback and S4's CDC are feasible.
- **If no:** Restrict the design to OPERA's own interfaces (OXI/OWS/OHIP). S2 and S4 are ruled out.

### F3. What maintenance windows are available for OPERA and network changes?

- **Why it matters:** Enabling interfaces, business events or DB settings may need OPERA downtime.
- **If regular windows exist:** We schedule installation and cut-over into them.
- **If changes are frozen (e.g. peak season):** The go-live timeline must work around the freeze.

---

## Section G — Commercial

### G1. Is there budget approval for Oracle interface licences (OWS, OXI/Business Events, OHIP) if they aren't already owned?

- **Why it matters:** Oracle interface licences are usually the largest single external cost, and without them there is no supported integration path on OPERA 5.
- **If yes:** We recommend the supported path (S3R or S1) and request quotes immediately.
- **If no:** The only options left are a read-only integration using already-licensed interfaces, or DB-level approaches, and those are subject to A6 and carry support risk. We will document that risk explicitly.

### G2. What is the target go-live date, and is it tied to a business event (opening, season, contract)?

- **Why it matters:** Oracle procurement and hotel change approval commonly take several weeks.
- **If the timeline is tight:** Phase the delivery. Start with read-only sync (OPERA → HMS), and add write-back once OWS/OHIP is licensed and approved.
- **If flexible:** Deliver two-way sync in one phase.

---

## How the Answers Drive the Recommendation

| Key answers | Likely recommendation |
|---|---|
| A1 = OPERA Cloud, or B5 = OHIP available | **S1 (OHIP)**: no on-premises footprint |
| A1 = OPERA 5 · B1 OWS + B2 OXI licensed (or budget in G1) · D6 VM available | **S3R**: agent reads Business Events and writes through OWS on the LAN |
| A1 = OPERA 5 · no OWS and no budget · C2 = read-only | **S3R, read-only**: agent reads events; no write-back |
| A6 = ASFU/Embedded or unknown | **Rule out S2, S4 and the original S3 trigger design** until Oracle confirms in writing |
| A3 ≥ 10 properties · A6 = Full Use · F2 DBA available · analytics/replay needed | **Evaluate S4 (CDC + Kafka)** as a later phase |
| D2 = consumer router or D3 = no static IP | **Rule out S2**; S4 must write through an on-premises agent |
| A4 = OPERA Cloud migration within 12–18 months | **Minimal S3R now**, switch to S1 on migration |

---

## Please Also Attach (if available)

1. OPERA version screenshot (Help → About).
2. List of licensed OPERA interfaces (from the Oracle contract or partner).
3. Network diagram showing the OPERA server, DB server, firewall and internet link.
4. Existing interface documentation (OWS WSDL/URL, OXI configuration, channel manager setup).
5. Oracle DB licence type confirmation (ASFU / Embedded / Full Use).
6. Contact details for hotel IT, MSP, Oracle partner and DBA.
