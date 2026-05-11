# openclaw-todo

Local-first hierarchical todo/task tools for OpenClaw.

This is an early scaffold for a private, agent-friendly todo system. The source
repo intentionally contains no user data, machine-specific paths, secrets, or
runtime databases.

## Current shape

- Native OpenClaw plugin with tools:
  - `todo_create`
  - `todo_list`
  - `todo_update`
  - `todo_complete`
- SQLite storage using Node's built-in `node:sqlite` module.
- Runtime data defaults to OpenClaw state, not the repository:
  - `$OPENCLAW_TODO_DB`, if set
  - plugin config `dbPath`, if set
  - otherwise `$OPENCLAW_STATE_DIR/openclaw-todo/todos.sqlite`
  - otherwise `~/.openclaw/openclaw-todo/todos.sqlite`
- Small `openclaw-todo` CLI for local inspection.

## Install locally in OpenClaw

From a checkout:

```bash
npm install
openclaw plugins install ./path/to/openclaw-todo
openclaw gateway restart
openclaw plugins inspect openclaw-todo --runtime --json
```

Do not commit the generated SQLite database or local `.env` files.

## CLI examples

```bash
openclaw-todo create "Draft the OpenClaw todo plugin" --notes "Start with SQLite + tools"
openclaw-todo list
openclaw-todo done <task-id>
```

## Development

```bash
npm install
npm test
npm run smoke
```

See [`docs/roadmap.md`](docs/roadmap.md).
