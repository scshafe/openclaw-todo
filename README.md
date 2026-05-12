# openclaw-todo

Local-first hierarchical project and task tools for OpenClaw.

This is an early scaffold for a private, agent-friendly todo system. The source
repo intentionally contains no user data, machine-specific paths, secrets, or
runtime databases.

## Current shape

- Native OpenClaw plugin with tools:
  - `todo_create`
  - `todo_list`
  - `todo_update`
  - `todo_complete`
  - `todo_project_summary`
- SQLite storage using Node's built-in `node:sqlite` module.
- Agent-native project fields:
  - explicit `type`: `task`, `project`, `phase`, or `work_item`
  - status: `open`, `in_progress`, `blocked`, `done`, or `archived`
  - `owner` for humans or agents
  - `blockedReason` plus dependency task IDs
  - artifact/reference JSON for repos, commits, PRs, docs, notes, sessions, files, and URLs
- Runtime data defaults to OpenClaw state, not the repository:
  - `$OPENCLAW_TODO_DB`, if set
  - plugin config `dbPath`, if set
  - otherwise `$OPENCLAW_STATE_DIR/openclaw-todo/todos.sqlite`
  - otherwise `~/.openclaw/openclaw-todo/todos.sqlite`
- Small `openclaw-todo` CLI for local inspection.

## Install modes

Do not commit generated SQLite databases or local `.env` files.

### Local development checkout only

Use a linked install while actively editing this repo. Install dependencies in
the checkout first because local path/link installs do not repair plugin deps.

```bash
npm install
openclaw plugins install --link ./path/to/openclaw-todo
openclaw gateway restart
openclaw plugins inspect openclaw-todo --runtime --json
```

Plain local path install is also a development-only option:

```bash
npm install
openclaw plugins install ./path/to/openclaw-todo
openclaw gateway restart
openclaw plugins inspect openclaw-todo --runtime --json
```

### Git/tag install

For a stable source install, prefer a tagged revision:

```bash
openclaw plugins install git:https://github.com/scshafe/openclaw-todo.git#v0.1.0
openclaw gateway restart
openclaw plugins inspect openclaw-todo --runtime --json
```

### Package acceptance with npm-pack

Before publishing or asking someone to install a release candidate, pack it and
install the tarball with OpenClaw's `npm-pack:` source. This tests the package
shape without relying on this checkout.

```bash
npm run package:check
npm pack
openclaw plugins install npm-pack:./openclaw-todo-0.1.0.tgz
openclaw gateway restart
openclaw plugins inspect openclaw-todo --runtime --json
```

`npm-pack:` still installs into the configured OpenClaw environment. Do not run
that command against a live gateway unless you intend to install the plugin.

### Future npm/ClawHub install

Once published, expected install forms are:

```bash
openclaw plugins install npm:openclaw-todo
openclaw plugins install clawhub:openclaw-todo
openclaw gateway restart
openclaw plugins inspect openclaw-todo --runtime --json
```

## CLI examples

```bash
openclaw-todo create "Evolve openclaw-todo" --type project --owner Cole
openclaw-todo create "Add PM schema" --type work_item --owner local-todo --status in_progress --parent <project-id>
openclaw-todo update <task-id> --status blocked --blocked-reason "Waiting on API review" --depends-on <other-task-id> --artifact docs/roadmap.md
openclaw-todo list --type work_item --owner local-todo
openclaw-todo summary
openclaw-todo done <task-id>
```

## Development

```bash
npm install
npm test
npm run smoke
npm run package:check
```

See [`docs/packaging.md`](docs/packaging.md) and [`docs/roadmap.md`](docs/roadmap.md).
