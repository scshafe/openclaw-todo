#!/usr/bin/env node
import { createTodoStore } from "./store.js";

const [command, ...args] = process.argv.slice(2);

function usage(exitCode = 0) {
  const out = exitCode === 0 ? console.log : console.error;
  out(`Usage:
  openclaw-todo create <title> [--notes <text>] [--parent <id>]
  openclaw-todo list [--status open|done|archived] [--search <text>] [--parent <id>] [--root]
  openclaw-todo done <id>
  openclaw-todo update <id> [--title <title>] [--notes <text>] [--status open|done|archived] [--parent <id>|--root]
`);
  process.exit(exitCode);
}

function readFlag(name) {
  const i = args.indexOf(name);
  if (i === -1) return undefined;
  const value = args[i + 1];
  if (!value || value.startsWith("--")) throw new Error(`${name} requires a value`);
  args.splice(i, 2);
  return value;
}

function hasFlag(name) {
  const i = args.indexOf(name);
  if (i === -1) return false;
  args.splice(i, 1);
  return true;
}

try {
  if (!command || command === "help" || command === "--help") usage(0);
  const store = createTodoStore();
  try {
    if (command === "create") {
      const notes = readFlag("--notes");
      const parentId = readFlag("--parent");
      const title = args.join(" ").trim();
      console.log(JSON.stringify(store.createTask({ title, notes, parentId }), null, 2));
    } else if (command === "list") {
      const status = readFlag("--status");
      const search = readFlag("--search");
      let parentId = readFlag("--parent");
      if (hasFlag("--root")) parentId = null;
      console.log(JSON.stringify(store.listTasks({ status, search, parentId }), null, 2));
    } else if (command === "done") {
      console.log(JSON.stringify(store.completeTask(args[0]), null, 2));
    } else if (command === "update") {
      const id = args.shift();
      const title = readFlag("--title");
      const notes = readFlag("--notes");
      const status = readFlag("--status");
      let parentId = readFlag("--parent");
      if (hasFlag("--root")) parentId = "";
      console.log(JSON.stringify(store.updateTask({ id, title, notes, status, parentId }), null, 2));
    } else {
      usage(1);
    }
  } finally {
    store.close();
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}
