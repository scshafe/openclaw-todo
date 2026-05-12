import { Type } from "@sinclair/typebox";
import { definePluginEntry } from "openclaw/plugin-sdk/plugin-entry";

const Status = Type.Union([
  Type.Literal("open"),
  Type.Literal("done"),
  Type.Literal("archived"),
]);

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
  description: "Local-first hierarchical todo/task tools for OpenClaw.",
  register(api) {
    api.registerTool({
      name: "todo_create",
      description: "Create a local todo/task. Use parentId to attach it under another task/project.",
      parameters: Type.Object({
        title: Type.String({ minLength: 1 }),
        notes: Type.Optional(Type.String()),
        parentId: Type.Optional(Type.String()),
      }),
      async execute(_id, params) {
        return textResult(await withStore(api, (store) => store.createTask(params)));
      },
    });

    api.registerTool({
      name: "todo_list",
      description: "List/search local todos/tasks.",
      parameters: Type.Object({
        status: Type.Optional(Status),
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
      description: "Update a local todo/task title, notes, status, or parent.",
      parameters: Type.Object({
        id: Type.String(),
        title: Type.Optional(Type.String({ minLength: 1 })),
        notes: Type.Optional(Type.String()),
        status: Type.Optional(Status),
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
  },
});
