#!/usr/bin/env node
import { createTodoStore } from "./store.js";

const [command, ...args] = process.argv.slice(2);

function usage(exitCode = 0) {
  const out = exitCode === 0 ? console.log : console.error;
  out(`Usage:
  openclaw-todo create <title> [--notes <text>] [--parent <id>] [--type task|project|phase|work_item] [--owner <name>] [--status open|in_progress|blocked|done|archived] [--blocked-reason <text>] [--depends-on <id[,id]>] [--artifact <ref>]
  openclaw-todo list [--status open|in_progress|blocked|done|archived] [--type task|project|phase|work_item] [--owner <name>] [--search <text>] [--parent <id>] [--root]
  openclaw-todo summary
  openclaw-todo done <id>
  openclaw-todo update <id> [--title <title>] [--notes <text>] [--status open|in_progress|blocked|done|archived] [--type task|project|phase|work_item] [--owner <name>|--clear-owner] [--blocked-reason <text>|--clear-blocked-reason] [--depends-on <id[,id]>] [--artifact <ref>] [--clear-artifacts] [--parent <id>|--root]
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

function readRepeatedFlag(name) {
  const values = [];
  for (;;) {
    const value = readFlag(name);
    if (value === undefined) return values;
    values.push(value);
  }
}

function hasFlag(name) {
  const i = args.indexOf(name);
  if (i === -1) return false;
  args.splice(i, 1);
  return true;
}

function splitCsv(value) {
  if (value === undefined) return undefined;
  return value.split(",").map((item) => item.trim()).filter(Boolean);
}

try {
  if (!command || command === "help" || command === "--help") usage(0);
  const store = createTodoStore();
  try {
    if (command === "create") {
      const notes = readFlag("--notes");
      const parentId = readFlag("--parent");
      const type = readFlag("--type");
      const owner = readFlag("--owner");
      const status = readFlag("--status");
      const blockedReason = readFlag("--blocked-reason");
      const dependencyIds = splitCsv(readFlag("--depends-on"));
      const artifacts = readRepeatedFlag("--artifact");
      const title = args.join(" ").trim();
      console.log(JSON.stringify(store.createTask({ title, notes, parentId, type, owner, status, blockedReason, dependencyIds, artifacts }), null, 2));
    } else if (command === "list") {
      const status = readFlag("--status");
      const type = readFlag("--type");
      const owner = readFlag("--owner");
      const search = readFlag("--search");
      let parentId = readFlag("--parent");
      if (hasFlag("--root")) parentId = null;
      console.log(JSON.stringify(store.listTasks({ status, type, owner, search, parentId }), null, 2));
    } else if (command === "summary") {
      console.log(JSON.stringify(store.summarizeProjects(), null, 2));
    } else if (command === "done") {
      console.log(JSON.stringify(store.completeTask(args[0]), null, 2));
    } else if (command === "update") {
      const id = args.shift();
      const title = readFlag("--title");
      const notes = readFlag("--notes");
      const status = readFlag("--status");
      const type = readFlag("--type");
      let owner = readFlag("--owner");
      if (hasFlag("--clear-owner")) owner = "";
      let blockedReason = readFlag("--blocked-reason");
      if (hasFlag("--clear-blocked-reason")) blockedReason = "";
      const dependencyIds = splitCsv(readFlag("--depends-on"));
      let artifacts = readRepeatedFlag("--artifact");
      if (hasFlag("--clear-artifacts")) artifacts = [];
      let parentId = readFlag("--parent");
      if (hasFlag("--root")) parentId = "";
      console.log(JSON.stringify(store.updateTask({ id, title, notes, status, type, owner, blockedReason, dependencyIds, artifacts, parentId }), null, 2));
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
