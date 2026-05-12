# Roadmap

## Phase 0 — Local core

- [x] SQLite schema for hierarchical tasks.
- [x] Agent tools for create/list/update/complete.
- [x] Tiny CLI for manual inspection.
- [x] Plugin install smoke test against a running OpenClaw gateway.

## Phase 1 — Agent-native project management

Goal: evolve `openclaw-todo` from a simple todo list into OpenClaw's local project/task spine for agents and Cole.

Prioritize:

- [x] Project conventions or explicit task `type` values for project / phase / work item.
- [x] Statuses beyond `open/done/archived`, especially `in_progress` and `blocked`.
- [x] Owner/assignee field for humans or agents, e.g. `Cole`, `Chloe`, `local-todo`, `buddha`.
- [x] Lightweight blockers/dependencies, including blocked reason and/or dependent task IDs.
- [x] Artifact/reference fields for repos, commits, PRs, docs, notes, sessions, files, or URLs.
- [x] Project status summaries grouped by project, owner, and blocked/in-progress/open state.

Explicitly not prioritized for now:

- [ ] Priority field.
- [ ] Due dates.
- [ ] Event/activity history log.

## Phase 2 — OpenClaw UI integration

- [ ] Research current Control UI plugin surfaces.
- [ ] Add a route or panel for browsing project/task trees if supported.
- [ ] Support project/task trees, quick completion, blocked visibility, and owner filters.

## Phase 3 — Sync/export

- [ ] Optional export format.
- [ ] Optional Linear sync/export; local SQLite remains source of truth.
