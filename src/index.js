import { Type } from "@sinclair/typebox";
import { definePluginEntry } from "openclaw/plugin-sdk/plugin-entry";

const Status = Type.Union([
  Type.Literal("open"),
  Type.Literal("in_progress"),
  Type.Literal("blocked"),
  Type.Literal("done"),
  Type.Literal("archived"),
]);

const TaskType = Type.Union([
  Type.Literal("task"),
  Type.Literal("project"),
  Type.Literal("phase"),
  Type.Literal("work_item"),
]);

const Artifact = Type.Object({
  type: Type.Optional(Type.String({ description: "Reference kind, e.g. repo, commit, pr, doc, note, session, file, url." })),
  value: Type.String({ description: "Reference value: URL, path, id, repo name, commit SHA, PR number, etc." }),
  label: Type.Optional(Type.String()),
});

async function withStore(api, fn) {
  const { createTodoStore } = await import("./store.js");
  const dbPath = api?.config?.dbPath;
  const store = createTodoStore({ dbPath });
  try {
    return fn(store);
  } finally {
    store.close();
  }
}

function textResult(value) {
  return {
    content: [
      {
        type: "text",
        text: typeof value === "string" ? value : JSON.stringify(value, null, 2),
      },
    ],
  };
}

export default definePluginEntry({
  id: "openclaw-todo",
  name: "OpenClaw Todo",
  description: "Local-first hierarchical project and task tools for OpenClaw.",
  register(api) {
    api.registerTool({
      name: "todo_create",
      description: "Create a local todo/task/project. Use parentId to attach it under another task/project.",
      parameters: Type.Object({
        title: Type.String({ minLength: 1 }),
        notes: Type.Optional(Type.String()),
        parentId: Type.Optional(Type.String()),
        type: Type.Optional(TaskType),
        status: Type.Optional(Status),
        owner: Type.Optional(Type.String({ description: "Human or agent owner/assignee." })),
        blockedReason: Type.Optional(Type.String()),
        dependencyIds: Type.Optional(Type.Array(Type.String({ description: "Task id this task depends on." }))),
        artifacts: Type.Optional(Type.Array(Artifact)),
      }),
      async execute(_id, params) {
        return textResult(await withStore(api, (store) => store.createTask(params)));
      },
    });

    api.registerTool({
      name: "todo_list",
      description: "List/search local projects and tasks.",
      parameters: Type.Object({
        status: Type.Optional(Status),
        type: Type.Optional(TaskType),
        owner: Type.Optional(Type.String()),
        parentId: Type.Optional(Type.String({ description: "Set to a task id to list children." })),
        rootOnly: Type.Optional(Type.Boolean({ description: "When true, only list tasks without a parent." })),
        search: Type.Optional(Type.String()),
        limit: Type.Optional(Type.Number({ minimum: 1, maximum: 500 })),
      }),
      async execute(_id, params) {
        const filters = { ...params };
        if (filters.rootOnly) filters.parentId = null;
        delete filters.rootOnly;
        return textResult(await withStore(api, (store) => store.listTasks(filters)));
      },
    });

    api.registerTool({
      name: "todo_update",
      description: "Update a local project/task title, notes, status, type, owner, blockers, dependencies, artifacts, or parent.",
      parameters: Type.Object({
        id: Type.String(),
        title: Type.Optional(Type.String({ minLength: 1 })),
        notes: Type.Optional(Type.String()),
        status: Type.Optional(Status),
        type: Type.Optional(TaskType),
        owner: Type.Optional(Type.String({ description: "Human or agent owner/assignee. Use empty string to clear." })),
        blockedReason: Type.Optional(Type.String({ description: "Why this task is blocked. Use empty string to clear." })),
        dependencyIds: Type.Optional(Type.Array(Type.String({ description: "Full replacement list of task ids this task depends on." }))),
        artifacts: Type.Optional(Type.Array(Artifact)),
        parentId: Type.Optional(Type.String({ description: "New parent task id. Use empty string to move to root." })),
      }),
      async execute(_id, params) {
        return textResult(await withStore(api, (store) => store.updateTask(params)));
      },
    });

    api.registerTool({
      name: "todo_complete",
      description: "Mark a local todo/task as done.",
      parameters: Type.Object({
        id: Type.String(),
      }),
      async execute(_id, params) {
        return textResult(await withStore(api, (store) => store.completeTask(params.id)));
      },
    });

    api.registerTool({
      name: "todo_project_summary",
      description: "Summarize projects grouped by project, owner, and status.",
      parameters: Type.Object({}),
      async execute() {
        return textResult(await withStore(api, (store) => store.summarizeProjects()));
      },
    });
  },
});
