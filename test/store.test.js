import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { DatabaseSync } from "node:sqlite";
import { createTodoStore } from "../src/store.js";

function withStore(fn) {
  const dir = mkdtempSync(join(tmpdir(), "openclaw-todo-test-"));
  const store = createTodoStore({ dbPath: join(dir, "todos.sqlite") });
  try {
    return fn(store);
  } finally {
    store.close();
  }
}

test("creates and lists root tasks", () => {
  withStore((store) => {
    const task = store.createTask({ title: "Build local todo plugin", notes: "SQLite first" });
    assert.equal(task.status, "open");
    assert.equal(task.type, "task");
    assert.equal(task.parentId, null);

    const tasks = store.listTasks({ parentId: null });
    assert.equal(tasks.length, 1);
    assert.equal(tasks[0].title, "Build local todo plugin");
  });
});

test("supports hierarchical child tasks", () => {
  withStore((store) => {
    const parent = store.createTask({ title: "Project", type: "project" });
    const child = store.createTask({ title: "Child task", type: "work_item", parentId: parent.id });

    assert.equal(child.parentId, parent.id);
    assert.deepEqual(store.listTasks({ parentId: parent.id }).map((task) => task.id), [child.id]);
  });
});

test("updates and completes tasks", () => {
  withStore((store) => {
    const task = store.createTask({ title: "Draft" });
    const updated = store.updateTask({ id: task.id, title: "Draft plugin", notes: "First pass" });
    assert.equal(updated.title, "Draft plugin");
    assert.equal(updated.notes, "First pass");

    const done = store.completeTask(task.id);
    assert.equal(done.status, "done");
    assert.ok(done.completedAt);
  });
});

test("searches title, notes, owner, blocked reason, and artifacts", () => {
  withStore((store) => {
    store.createTask({ title: "Alpha", notes: "ordinary" });
    store.createTask({ title: "Beta", notes: "contains needle" });
    store.createTask({ title: "Gamma", owner: "local-todo", blockedReason: "waiting on needle", artifacts: [{ type: "url", value: "https://example.com/spec" }] });
    assert.equal(store.listTasks({ search: "needle" }).length, 2);
    assert.equal(store.listTasks({ search: "example.com" }).length, 1);
  });
});

test("supports project management fields", () => {
  withStore((store) => {
    const project = store.createTask({ title: "Agent PM", type: "project", owner: "Cole" });
    const phase = store.createTask({ title: "Schema", type: "phase", parentId: project.id, owner: "local-todo" });
    const dependency = store.createTask({ title: "Review docs", type: "work_item", parentId: phase.id });
    const work = store.createTask({
      title: "Add blockers",
      type: "work_item",
      parentId: phase.id,
      status: "blocked",
      owner: "Chloe",
      blockedReason: "Needs API review",
      dependencyIds: [dependency.id],
      artifacts: [{ type: "doc", value: "docs/roadmap.md" }],
    });

    assert.equal(work.status, "blocked");
    assert.equal(work.owner, "Chloe");
    assert.equal(work.blockedReason, "Needs API review");
    assert.deepEqual(work.dependencyIds, [dependency.id]);
    assert.deepEqual(work.artifacts, [{ type: "doc", value: "docs/roadmap.md" }]);
    assert.deepEqual(store.listTasks({ owner: "Chloe" }).map((task) => task.id), [work.id]);
    assert.deepEqual(store.listTasks({ type: "phase" }).map((task) => task.id), [phase.id]);
  });
});

test("summarizes projects by owner and status", () => {
  withStore((store) => {
    const project = store.createTask({ title: "OpenClaw Todo", type: "project", owner: "Cole" });
    const phase = store.createTask({ title: "PM model", type: "phase", parentId: project.id, status: "in_progress", owner: "local-todo" });
    store.createTask({ title: "Blocked task", type: "work_item", parentId: phase.id, status: "blocked", owner: "Chloe" });
    store.createTask({ title: "Open task", type: "work_item", parentId: phase.id, status: "open", owner: "local-todo" });

    const [summary] = store.summarizeProjects();
    assert.equal(summary.projectId, project.id);
    assert.equal(summary.total, 4);
    assert.deepEqual(summary.byStatus, { blocked: 1, in_progress: 1, open: 2 });
    assert.deepEqual(summary.byOwner.Chloe, { blocked: 1 });
    assert.deepEqual(summary.byOwner["local-todo"], { in_progress: 1, open: 1 });
  });
});

test("migrates old open/done/archived schema without losing rows", () => {
  const dir = mkdtempSync(join(tmpdir(), "openclaw-todo-migration-test-"));
  const dbPath = join(dir, "todos.sqlite");
  const db = new DatabaseSync(dbPath);
  db.exec(`
    CREATE TABLE tasks (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      notes TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'done', 'archived')),
      parent_id TEXT REFERENCES tasks(id) ON DELETE SET NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      completed_at TEXT
    );
    INSERT INTO tasks (id, title, notes, status, created_at, updated_at)
    VALUES ('old-1', 'Old task', 'keep me', 'open', '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z');
  `);
  db.close();

  const store = createTodoStore({ dbPath });
  try {
    const task = store.getTask("old-1");
    assert.equal(task.title, "Old task");
    assert.equal(task.type, "task");
    assert.equal(task.owner, null);
    assert.deepEqual(task.dependencyIds, []);
    assert.equal(store.updateTask({ id: "old-1", status: "in_progress" }).status, "in_progress");
  } finally {
    store.close();
  }
});
