import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { homedir } from "node:os";
import { randomUUID } from "node:crypto";

export const VALID_STATUSES = new Set(["open", "in_progress", "blocked", "done", "archived"]);
export const VALID_TYPES = new Set(["task", "project", "phase", "work_item"]);

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
    const type = input.type ?? "task";
    assertStatus(status);
    assertType(type);
    const owner = normalizeOptionalString(input.owner, "owner");
    const blockedReason = normalizeOptionalString(input.blockedReason, "blockedReason");
    const dependencyIds = normalizeStringArray(input.dependencyIds, "dependencyIds");
    const artifacts = normalizeArtifacts(input.artifacts);
    const parentId = normalizeOptionalString(input.parentId, "parentId");
    if (parentId) this.requireTask(parentId);
    for (const dependencyId of dependencyIds) this.requireTask(dependencyId);

    this.db.prepare(`
      INSERT INTO tasks (
        id, title, notes, status, type, owner, blocked_reason, dependency_ids_json, artifacts_json,
        parent_id, created_at, updated_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(id, title, notes, status, type, owner, blockedReason, stringifyJson(dependencyIds), stringifyJson(artifacts), parentId, now, now);

    return this.getTask(id);
  }

  getTask(id) {
    const row = this.db.prepare(`${TASK_SELECT} WHERE id = ?`).get(id);
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

    if (filters.type) {
      assertType(filters.type);
      clauses.push("type = ?");
      params.push(filters.type);
    }

    if (filters.owner) {
      clauses.push("owner = ?");
      params.push(requiredString(filters.owner, "owner"));
    }

    if (Object.hasOwn(filters, "parentId")) {
      const parentId = normalizeOptionalString(filters.parentId, "parentId");
      if (parentId) {
        clauses.push("parent_id = ?");
        params.push(parentId);
      } else {
        clauses.push("parent_id IS NULL");
      }
    }

    if (filters.search) {
      clauses.push("(title LIKE ? OR notes LIKE ? OR owner LIKE ? OR blocked_reason LIKE ? OR artifacts_json LIKE ?)");
      const q = `%${filters.search}%`;
      params.push(q, q, q, q, q);
    }

    const limit = clampLimit(filters.limit);
    params.push(limit);
    const where = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";
    const rows = this.db.prepare(`
      ${TASK_SELECT}
      ${where}
      ORDER BY
        CASE status WHEN 'blocked' THEN 0 WHEN 'in_progress' THEN 1 WHEN 'open' THEN 2 WHEN 'done' THEN 3 ELSE 4 END,
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

    if (Object.hasOwn(input, "type")) {
      assertType(input.type);
      updates.push("type = ?");
      params.push(input.type);
    }

    if (Object.hasOwn(input, "owner")) {
      updates.push("owner = ?");
      params.push(normalizeOptionalString(input.owner, "owner"));
    }

    if (Object.hasOwn(input, "blockedReason")) {
      updates.push("blocked_reason = ?");
      params.push(normalizeOptionalString(input.blockedReason, "blockedReason"));
    }

    if (Object.hasOwn(input, "dependencyIds")) {
      const dependencyIds = normalizeStringArray(input.dependencyIds, "dependencyIds");
      if (dependencyIds.includes(id)) throw new Error("A task cannot depend on itself");
      for (const dependencyId of dependencyIds) this.requireTask(dependencyId);
      updates.push("dependency_ids_json = ?");
      params.push(stringifyJson(dependencyIds));
    }

    if (Object.hasOwn(input, "artifacts")) {
      updates.push("artifacts_json = ?");
      params.push(stringifyJson(normalizeArtifacts(input.artifacts)));
    }

    if (Object.hasOwn(input, "parentId")) {
      const parentId = normalizeOptionalString(input.parentId, "parentId");
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

  summarizeProjects() {
    const rows = this.db.prepare(`
      WITH RECURSIVE tree AS (
        SELECT
          id, title, owner, status, type, parent_id,
          id AS projectId,
          title AS projectTitle,
          owner AS projectOwner
        FROM tasks
        WHERE parent_id IS NULL
        UNION ALL
        SELECT
          child.id, child.title, child.owner, child.status, child.type, child.parent_id,
          CASE WHEN child.type = 'project' THEN child.id ELSE tree.projectId END AS projectId,
          CASE WHEN child.type = 'project' THEN child.title ELSE tree.projectTitle END AS projectTitle,
          CASE WHEN child.type = 'project' THEN child.owner ELSE tree.projectOwner END AS projectOwner
        FROM tasks child
        JOIN tree ON child.parent_id = tree.id
      )
      SELECT
        projectId,
        projectTitle,
        COALESCE(projectOwner, 'unassigned') AS projectOwner,
        COALESCE(owner, 'unassigned') AS owner,
        status,
        COUNT(*) AS count
      FROM tree
      GROUP BY projectId, projectTitle, projectOwner, owner, status
      ORDER BY projectTitle, owner, status
    `).all();

    const projects = new Map();
    for (const row of rows) {
      const projectId = row.projectId;
      if (!projects.has(projectId)) {
        projects.set(projectId, {
          projectId,
          projectTitle: row.projectTitle,
          projectOwner: row.projectOwner === "unassigned" ? null : row.projectOwner,
          total: 0,
          byStatus: {},
          byOwner: {},
        });
      }
      const project = projects.get(projectId);
      const owner = row.owner || "unassigned";
      const count = Number(row.count);
      project.total += count;
      project.byStatus[row.status] = (project.byStatus[row.status] ?? 0) + count;
      project.byOwner[owner] ??= {};
      project.byOwner[owner][row.status] = (project.byOwner[owner][row.status] ?? 0) + count;
    }
    return [...projects.values()];
  }
}

const TASK_SELECT = `
  SELECT id, title, notes, status, type, owner, blocked_reason AS blockedReason,
         dependency_ids_json AS dependencyIdsJson, artifacts_json AS artifactsJson,
         parent_id AS parentId, created_at AS createdAt, updated_at AS updatedAt, completed_at AS completedAt
  FROM tasks
`;

function initialize(db) {
  db.exec(`
    PRAGMA foreign_keys = ON;
    PRAGMA journal_mode = WAL;
  `);

  const existing = db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'tasks'").get();
  if (!existing) {
    createTasksTable(db, "tasks");
  } else if (needsTaskTableRebuild(db)) {
    rebuildTasksTable(db);
  }

  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status);
    CREATE INDEX IF NOT EXISTS idx_tasks_type ON tasks(type);
    CREATE INDEX IF NOT EXISTS idx_tasks_owner ON tasks(owner);
    CREATE INDEX IF NOT EXISTS idx_tasks_parent_id ON tasks(parent_id);
    CREATE INDEX IF NOT EXISTS idx_tasks_created_at ON tasks(created_at);
  `);
}

function createTasksTable(db, tableName) {
  db.exec(`
    CREATE TABLE ${tableName} (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      notes TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'in_progress', 'blocked', 'done', 'archived')),
      type TEXT NOT NULL DEFAULT 'task' CHECK (type IN ('task', 'project', 'phase', 'work_item')),
      owner TEXT,
      blocked_reason TEXT,
      dependency_ids_json TEXT NOT NULL DEFAULT '[]',
      artifacts_json TEXT NOT NULL DEFAULT '[]',
      parent_id TEXT REFERENCES tasks(id) ON DELETE SET NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      completed_at TEXT
    );
  `);
}

function needsTaskTableRebuild(db) {
  const columns = new Set(db.prepare("PRAGMA table_info(tasks)").all().map((column) => column.name));
  const sql = db.prepare("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'tasks'").get()?.sql ?? "";
  return !columns.has("type") || !columns.has("owner") || !columns.has("blocked_reason") ||
    !columns.has("dependency_ids_json") || !columns.has("artifacts_json") ||
    !sql.includes("in_progress") || !sql.includes("blocked");
}

function rebuildTasksTable(db) {
  db.exec("BEGIN");
  try {
    createTasksTable(db, "tasks_new");
    const columns = new Set(db.prepare("PRAGMA table_info(tasks)").all().map((column) => column.name));
    const select = (name, fallback) => columns.has(name) ? name : fallback;
    db.exec(`
      INSERT INTO tasks_new (
        id, title, notes, status, type, owner, blocked_reason, dependency_ids_json, artifacts_json,
        parent_id, created_at, updated_at, completed_at
      )
      SELECT
        id,
        title,
        ${select("notes", "''")},
        CASE WHEN status IN ('open', 'in_progress', 'blocked', 'done', 'archived') THEN status ELSE 'open' END,
        CASE WHEN ${select("type", "'task'")} IN ('task', 'project', 'phase', 'work_item') THEN ${select("type", "'task'")} ELSE 'task' END,
        ${select("owner", "NULL")},
        ${select("blocked_reason", "NULL")},
        COALESCE(${select("dependency_ids_json", "'[]'")}, '[]'),
        COALESCE(${select("artifacts_json", "'[]'")}, '[]'),
        ${select("parent_id", "NULL")},
        created_at,
        updated_at,
        ${select("completed_at", "NULL")}
      FROM tasks;
      DROP TABLE tasks;
      ALTER TABLE tasks_new RENAME TO tasks;
    `);
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}

function normalizeRow(row) {
  return {
    id: row.id,
    title: row.title,
    notes: row.notes,
    status: row.status,
    type: row.type,
    owner: row.owner ?? null,
    blockedReason: row.blockedReason ?? null,
    dependencyIds: parseJsonArray(row.dependencyIdsJson),
    artifacts: parseJsonArray(row.artifactsJson),
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

function normalizeOptionalString(value, name) {
  if (value === undefined || value === null || value === "") return null;
  return requiredString(value, name).trim() || null;
}

function normalizeStringArray(value, name) {
  if (value === undefined || value === null || value === "") return [];
  const array = Array.isArray(value) ? value : String(value).split(",");
  return [...new Set(array.map((item) => requiredString(String(item).trim(), name)).filter(Boolean))];
}

function normalizeArtifacts(value) {
  if (value === undefined || value === null || value === "") return [];
  const array = Array.isArray(value) ? value : [value];
  return array.map((artifact) => {
    if (typeof artifact === "string") return { type: "reference", value: artifact };
    if (!artifact || typeof artifact !== "object") throw new Error("artifacts must be strings or objects");
    const type = artifact.type ? requiredString(artifact.type, "artifact.type") : "reference";
    const value = artifact.value ?? artifact.url ?? artifact.path ?? artifact.id;
    return { ...artifact, type, value: requiredString(String(value), "artifact.value") };
  });
}

function stringifyJson(value) {
  return JSON.stringify(value ?? []);
}

function parseJsonArray(value) {
  try {
    const parsed = JSON.parse(value || "[]");
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function assertStatus(status) {
  if (!VALID_STATUSES.has(status)) {
    throw new Error(`Invalid status: ${status}. Expected one of: ${[...VALID_STATUSES].join(", ")}`);
  }
}

function assertType(type) {
  if (!VALID_TYPES.has(type)) {
    throw new Error(`Invalid type: ${type}. Expected one of: ${[...VALID_TYPES].join(", ")}`);
  }
}

function clampLimit(value) {
  const n = Number(value ?? 50);
  if (!Number.isFinite(n) || n <= 0) return 50;
  return Math.min(Math.floor(n), 500);
}
