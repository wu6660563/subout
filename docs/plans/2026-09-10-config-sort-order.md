# 配置排序值 Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 为 `/#configs` 增加可手动编辑并持久化的配置排序值，避免新备份因 ID 较大排到常用配置前面。

**Architecture:** 在 SQLite `config_history` 增加 `sort_order` 整数字段，并通过启动迁移为旧数据按当前 `id DESC` 顺序补默认值。配置列表 API 返回并按 `sort_order ASC, id DESC` 排序；新增排序更新 API，前端在列表中提供数字输入并失焦保存。

**Tech Stack:** Rust, Axum, SQLite/rusqlite, Vue 3, Vitest.

---

### Task 1: Add backend data model and migration

**Files:**
- Modify: `src/db/models.rs`
- Modify: `src/db/mod.rs`

Add `sort_order: i64` to `ConfigHistory`, create/migrate the SQLite column, and assign deterministic defaults to existing rows without changing their current display order.

### Task 2: Add API support for ordering

**Files:**
- Modify: `src/web/config.rs`
- Modify: `src/web/mod.rs`

Return sorted history items, add an authenticated `PATCH /api/config/history/:id/order` endpoint with integer validation, and update only the selected record's order.

### Task 3: Add frontend editing and regression tests

**Files:**
- Modify: `web/src/components/ConfigEditorView.vue`
- Modify: `web/src/components/ConfigEditorView.component.test.js`

Render a numeric order field, save it on blur/change, refresh the list, and preserve pagination behavior. Add tests for rendering and API submission.

### Task 4: Verify

Run Rust tests and the focused frontend test suite, then inspect the diff for unrelated changes.
