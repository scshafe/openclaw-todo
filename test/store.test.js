import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
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
    assert.equal(task.parentId, null);

    const tasks = store.listTasks({ rootOnly: true });
    assert.equal(tasks.length, 1);
    assert.equal(tasks[0].title, "Build local todo plugin");
  });
});

test("supports hierarchical child tasks", () => {
  withStore((store) => {
    const parent = store.createTask({ title: "Project" });
    const child = store.createTask({ title: "Child task", parentId: parent.id });

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

test("searches title and notes", () => {
  withStore((store) => {
    store.createTask({ title: "Alpha", notes: "ordinary" });
    store.createTask({ title: "Beta", notes: "contains needle" });
    const matches = store.listTasks({ search: "needle" });
    assert.equal(matches.length, 1);
    assert.equal(matches[0].title, "Beta");
  });
});
