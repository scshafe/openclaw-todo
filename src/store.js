import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { homedir } from "node:os";
import { randomUUID } from "node:crypto";

const VALID_STATUSES = new Set(["open", "done", "archived"]);

export function defaultDbPath() {
  if (process.env.OPENCLAW_TODO_DB) return resolve(process.env.OPENCLAW_TODO_DB);
  const stateDir = process.env.OPENCLAW_STATE_DIR || join(homedir(), ".openclaw");
  return join(stateDir, "openclaw-todo", "todos.sqlite");
}

export function createTodoStore(options = {}) {
  const dbPath = resolve(options.dbPath || defaultDbPath());
  mkdirSync(dirname(dbPath), { recursive: true });
  const db = new DatabaseSync(dbPath);
  initialize(db);
  return new TodoStore(db, dbPath);
}

export class TodoStore {
  constructor(db, dbPath = null) {
    this.db = db;
    this.dbPath = dbPath;
  }

  close() {
    this.db.close();
  }

  createTask(input) {
    const now = new Date().toISOString();
    const id = input.id || randomUUID();
    const title = normalizeTitle(input.title);
    const notes = input.notes ?? "";
    const status = input.status ?? "open";
    assertStatus(status);
    const parentId = normalizeOptional(input.parentId);
    if (parentId) this.requireTask(parentId);

    this.db.prepare(`
      INSERT INTO tasks (id, title, notes, status, parent_id, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(id, title, notes, status, parentId, now, now);

    return this.getTask(id);
  }

  getTask(id) {
    const row = this.db.prepare(`
      SELECT id, title, notes, status, parent_id AS parentId,
             created_at AS createdAt, updated_at AS updatedAt, completed_at AS completedAt
      FROM tasks
      WHERE id = ?
    `).get(id);
    return row ? normalizeRow(row) : null;
  }

  requireTask(id) {
    const task = this.getTask(id);
    if (!task) throw new Error(`Task not found: ${id}`);
    return task;
  }

  listTasks(filters = {}) {
    const clauses = [];
    const params = [];

    if (filters.status) {
      assertStatus(filters.status);
      clauses.push("status = ?");
      params.push(filters.status);
    }

    if (Object.hasOwn(filters, "parentId")) {
      const parentId = normalizeOptional(filters.parentId);
      if (parentId) {
        clauses.push("parent_id = ?");
        params.push(parentId);
      } else {
        clauses.push("parent_id IS NULL");
      }
    }

    if (filters.search) {
      clauses.push("(title LIKE ? OR notes LIKE ?)");
      const q = `%${filters.search}%`;
      params.push(q, q);
    }

    const limit = clampLimit(filters.limit);
    params.push(limit);
    const where = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";
    const rows = this.db.prepare(`
      SELECT id, title, notes, status, parent_id AS parentId,
             created_at AS createdAt, updated_at AS updatedAt, completed_at AS completedAt
      FROM tasks
      ${where}
      ORDER BY
        CASE status WHEN 'open' THEN 0 WHEN 'done' THEN 1 ELSE 2 END,
        created_at DESC
      LIMIT ?
    `).all(...params);

    return rows.map(normalizeRow);
  }

  updateTask(input) {
    const id = requiredString(input.id, "id");
    this.requireTask(id);
    const updates = [];
    const params = [];

    if (Object.hasOwn(input, "title")) {
      updates.push("title = ?");
      params.push(normalizeTitle(input.title));
    }

    if (Object.hasOwn(input, "notes")) {
      updates.push("notes = ?");
      params.push(input.notes ?? "");
    }

    if (Object.hasOwn(input, "status")) {
      assertStatus(input.status);
      updates.push("status = ?");
      params.push(input.status);
      updates.push("completed_at = ?");
      params.push(input.status === "done" ? new Date().toISOString() : null);
    }

    if (Object.hasOwn(input, "parentId")) {
      const parentId = normalizeOptional(input.parentId);
      if (parentId === id) throw new Error("A task cannot be its own parent");
      if (parentId) this.requireTask(parentId);
      updates.push("parent_id = ?");
      params.push(parentId);
    }

    if (!updates.length) return this.getTask(id);

    updates.push("updated_at = ?");
    params.push(new Date().toISOString());
    params.push(id);

    this.db.prepare(`UPDATE tasks SET ${updates.join(", ")} WHERE id = ?`).run(...params);
    return this.getTask(id);
  }

  completeTask(id) {
    return this.updateTask({ id, status: "done" });
  }
}

function initialize(db) {
  db.exec(`
    PRAGMA foreign_keys = ON;
    PRAGMA journal_mode = WAL;
    CREATE TABLE IF NOT EXISTS tasks (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      notes TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'done', 'archived')),
      parent_id TEXT REFERENCES tasks(id) ON DELETE SET NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      completed_at TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status);
    CREATE INDEX IF NOT EXISTS idx_tasks_parent_id ON tasks(parent_id);
    CREATE INDEX IF NOT EXISTS idx_tasks_created_at ON tasks(created_at);
  `);
}

function normalizeRow(row) {
  return {
    id: row.id,
    title: row.title,
    notes: row.notes,
    status: row.status,
    parentId: row.parentId ?? null,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    completedAt: row.completedAt ?? null,
  };
}

function normalizeTitle(value) {
  const title = requiredString(value, "title").trim();
  if (!title) throw new Error("title cannot be empty");
  return title;
}

function requiredString(value, name) {
  if (typeof value !== "string") throw new Error(`${name} must be a string`);
  return value;
}

function normalizeOptional(value) {
  if (value === undefined || value === null || value === "") return null;
  return requiredString(value, "parentId");
}

function assertStatus(status) {
  if (!VALID_STATUSES.has(status)) {
    throw new Error(`Invalid status: ${status}. Expected one of: ${[...VALID_STATUSES].join(", ")}`);
  }
}

function clampLimit(value) {
  const n = Number(value ?? 50);
  if (!Number.isFinite(n) || n <= 0) return 50;
  return Math.min(Math.floor(n), 500);
}
