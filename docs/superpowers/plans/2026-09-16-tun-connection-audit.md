# TUN Connection Audit Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a TUN-only, in-memory connection audit that attributes sing-box connections to processes, routes, and final proxy nodes, with configurable retention and searchable UI.

**Architecture:** A focused Rust audit module parses supported sing-box connection lines, maintains a bounded time-windowed deduplicated event store, and exposes JSON snapshots through authenticated service endpoints. The service manager feeds captured stdout/stderr/file lines into the audit store and keeps Clash API access server-side; the Vue view renders a structured audit table with filters and controls.

**Tech Stack:** Rust/Tokio/Axum/rusqlite/serde_json; Vue 3 Composition API; Vitest.

**Spec:** `docs/plans/2026-09-16-tun-connection-audit-design.md`

## Global Constraints

- TUN only; do not implement system-proxy PID correlation.
- Preserve original domain vs IP target; include destination port and TCP/UDP in the key.
- Record DIRECT and PROXY, default UI filter is PROXY.
- Keep audit events in memory only; persist only retention minutes in SQLite settings.
- Retention options are exactly 10, 20, 30, 60 minutes; default and maximum are 30 and 60.
- Proxy details must include the complete outbound-group chain and final node when Clash API can resolve it.
- Clash API access must be loopback-only and never exposed to the browser.

---

### Task 1: Audit domain model, parser, deduplication, and retention

**Files:**
- Create: `src/audit.rs`
- Modify: `src/lib.rs`
- Test: `src/audit.rs` unit tests

**Interfaces:**
- `pub const DEFAULT_RETENTION_MINUTES: u64 = 30` and `pub const MAX_RETENTION_MINUTES: u64 = 60`.
- `pub struct ConnectionAuditStore` with `new()`, `set_retention_minutes(u64)`, `ingest_line(&str, Option<&ResolvedOutbound>)`, `snapshot()`, and `clear()` methods.
- `pub fn parse_connection_line(line: &str) -> Option<ParsedConnection>`.
- `pub struct ResolvedOutbound { pub kind: RouteKind, pub chain: Vec<String>, pub final_node: Option<String> }`.

- [ ] **Step 1: Write failing tests** for parsing TCP/UDP DIRECT and PROXY lines, preserving domain/IP, parsing process/PID, port, protocol, and ignoring malformed/unrelated lines.
- [ ] **Step 2: Run `cargo test audit` and verify the new tests fail because `src/audit.rs` does not exist.**
- [ ] **Step 3: Implement minimal parser and serde-serializable event types.** Parse the stable sing-box connection shape (`[id duration] connection: ...`), outbound `direct[...]`/proxy tags, and process metadata when present; return `None` for lines without enough target/routing data.
- [ ] **Step 4: Add failing tests for deduplication, route/node changes, 30-minute expiry, allowed retention values, 20,000 event bound, and clear.**
- [ ] **Step 5: Implement the store with a `HashMap<AuditKey, AuditRecord>` current state plus `VecDeque<AuditEvent>` history, monotonic timestamps, per-key fingerprints, periodic-on-access expiry, and oldest-first cap eviction.
- [ ] **Step 6: Run `cargo test audit`; refactor only after all tests pass.**

### Task 2: SQLite retention setting and service-manager integration

**Files:**
- Modify: `src/service.rs`
- Modify: `src/db/mod.rs`
- Modify: `src/web/service_api.rs`
- Modify: `src/web/mod.rs`
- Test: Rust tests in `src/service.rs` and `src/web/service_api.rs` where existing patterns permit

**Interfaces:**
- `SingBoxServiceManager::get_audit_snapshot() -> Vec<AuditEvent>`
- `SingBoxServiceManager::clear_audit() -> ()`
- `SingBoxServiceManager::audit_retention_minutes() -> u64`
- Authenticated routes `GET /api/service/audit`, `POST /api/service/audit/clear`, `GET/PUT /api/service/audit/settings`.

- [ ] **Step 1: Add failing Rust tests for default retention, SQLite round-trip of `connection_audit_retention_minutes`, and clamping invalid persisted values to 10..60.**
- [ ] **Step 2: Run the focused tests and verify the expected failures.**
- [ ] **Step 3: Add DB helpers/constants and load the setting when `set_db_path`/service initialization occurs; use 30 when absent.
- [ ] **Step 4: Add the audit store to `SingBoxServiceManager`, feed every captured sing-box line through the parser without removing existing raw log behavior, and clear audit state on service restart/stop as specified.
- [ ] **Step 5: Add authenticated API handlers with JSON error responses, immediate retention update/expiry, and snapshots that include health/degraded metadata.
- [ ] **Step 6: Add a loopback Clash API client/resolver owned by the backend. Keep the controller address and secret in manager state; recursively expand selector/urltest groups from `/proxies`, returning `节点未知` metadata when unavailable. Do not expose secret or controller URL in API responses.
- [ ] **Step 7: Run `cargo test` and `cargo clippy --all-targets --all-features -- -D warnings`; fix regressions.**

### Task 3: Ensure generated TUN runtime config supports audit prerequisites

**Files:**
- Modify: `src/generator.rs`
- Modify: `src/simple_config.rs`
- Modify: `src/service.rs`
- Modify: `web/src/components/ExperimentalConfigEditor.vue` only if labels/help need clarification
- Test: existing generator/simple-config tests plus new Rust tests

- [ ] **Step 1: Add failing tests proving generated TUN route contains `find_process: true` and audit-enabled runtime config has loopback-only `clash_api`.
- [ ] **Step 2: Run focused generator tests to confirm failure.
- [ ] **Step 3: Implement runtime sanitization/injection without changing unrelated user config sections; preserve user-defined group/outbound tags and select an available loopback port.
- [ ] **Step 4: Ensure disabled/manual Clash API produces explicit degraded health state rather than inventing a node.
- [ ] **Step 5: Run generator/service tests and `sing-box check`-backed tests.**

### Task 4: Connection Audit Vue view and controls

**Files:**
- Create: `web/src/components/ConnectionAuditView.vue`
- Create: `web/src/components/connectionAuditUtils.js`
- Create: `web/src/components/connectionAuditUtils.test.js`
- Modify: `web/src/App.vue`
- Modify: `web/src/style.css`
- Test: `web/src/components/ConnectionAuditView.component.test.js`

- [ ] **Step 1: Write failing utility/component tests for PROXY-default filtering, process/domain/IP search, route/protocol/node/time filters, sorting, 30-minute selector options, and clear/refresh controls.
- [ ] **Step 2: Run `pnpm vitest run web/src/components/connectionAuditUtils.test.js` and verify failure.
- [ ] **Step 3: Implement pure filtering/sorting/formatting utilities and the view with authenticated fetches to the audit endpoints.
- [ ] **Step 4: Add expandable details for process path, first/last seen, original target, resolved IP, domain source, complete chain, connection ID, and raw line; hide Clash secret/controller details.
- [ ] **Step 5: Add pause-aware 1–2 second polling, “N new records” behavior when scrolled away, manual refresh, double-confirm clear, retention persistence, and health badges.
- [ ] **Step 6: Mount the view in `App.vue`, add navigation entry, and style the table/responsive empty/error states.
- [ ] **Step 7: Run the focused Web tests, then `pnpm test` and `pnpm build`.**

### Task 5: Full verification and documentation alignment

**Files:**
- Modify: `docs/plans/2026-09-16-tun-connection-audit-design.md` only if implementation constraints require clarifying wording

- [ ] **Step 1: Run `cargo test` and record the complete result.
- [ ] **Step 2: Run `cargo clippy --all-targets --all-features -- -D warnings` and `pnpm test`/`pnpm build`.
- [ ] **Step 3: Review the diff against every design requirement: TUN-only, original target semantics, port/protocol key, group-to-node details, memory-only 10–60-minute retention with SQLite preference, controls, health degradation, and no secret exposure.
- [ ] **Step 4: If UI changes are available, run the app/component tests and inspect the rendered audit page before claiming completion.**
