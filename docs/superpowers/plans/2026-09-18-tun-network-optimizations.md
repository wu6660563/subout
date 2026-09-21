# TUN Network Optimizations Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Improve Windows TUN split-routing safety and make routing outcomes easier to configure and diagnose.

**Architecture:** Extend the existing visual configuration editors and validators instead of creating competing pages. TUN presets remain configuration-only and filter the selected TUN inbound's own interface and DNS addresses; outbound network controls are exposed only where sing-box dial fields apply.

**Tech Stack:** Vue 3, Vitest, Rust/Axum, sing-box.

**Spec:** User-authorized optimization of TUN bypass, validation, routing diagnostics, and outbound interface control.

## Global Constraints

- Never add a TUN interface address or its DNS address to `route_exclude_address` automatically.
- Preserve JSON/source-mode escape hatches and existing configurations.
- Use a failing focused test before each production behavior change.
- Keep Windows, Linux, and macOS field availability explicit.

---

### Task 1: Safe private-network bypass presets

**Files:**
- Modify: `web/src/components/InboundConfigEditor.vue`
- Modify: `web/src/components/ConfigItemEditorModal.vue`
- Create: `web/src/components/tunRouteUtils.js`
- Test: `web/src/components/tunRouteUtils.test.js`

- [x] Write a failing test proving private LAN presets merge without duplicates and exclude current TUN/DNS addresses.
- [x] Implement a pure preset helper and wire an explicit “add private networks” action in both TUN editors.
- [x] Verify focused tests pass.

### Task 2: TUN configuration preflight checks

**Files:**
- Modify: `web/src/components/configValidation.js`
- Test: `web/src/components/configValidation.test.js`

- [x] Write failing tests for self-bypass errors.
- [x] Validate configured `route_exclude_address` values against TUN and TUN DNS addresses before invoking sing-box.
- [x] Verify focused tests pass.

### Task 3: Outbound network-interface binding

**Files:**
- Modify: `web/src/components/BasicOutboundConfigEditor.vue`
- Modify: `web/src/components/ConfigItemEditorModal.vue`
- Test: `web/src/components/BasicOutboundConfigEditor.test.js`

- [x] Write a failing test for direct outbound `bind_interface` editing.
- [x] Add the field with explanatory Windows multi-adapter copy; retain blank as sing-box default.
- [x] Verify focused tests pass.

### Task 4: Route outcome visibility

**Files:**
- Modify: `web/src/components/ConnectionAuditView.vue`
- Test: `web/src/components/ConnectionAuditView.component.test.js`

- [x] Reuse the existing connection-audit coverage.
- [x] Add concise contextual guidance that `Direct` chooses an outbound but cannot restore the original application process after TUN interception.
- [x] Verify focused tests pass, then run web build and applicable full tests.
