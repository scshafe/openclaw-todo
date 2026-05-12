# Packaging checklist

Use this checklist before tagging, publishing, or asking OpenClaw to install a
candidate package.

## Non-mutating local checks

These commands do not install into or restart the live OpenClaw gateway:

```bash
npm test
npm run smoke
npm pack --dry-run --json
npm run package:check
```

`npm run package:check` runs tests, smoke-imports the plugin entry, and performs
an `npm pack --dry-run --json` package preview. Before tagging, inspect the pack
file list for required runtime files and accidental local database/secret
candidates.

## Runtime acceptance check

Only run this in an OpenClaw environment where installing the plugin is intended:

```bash
npm pack
openclaw plugins install npm-pack:./openclaw-todo-<version>.tgz
openclaw gateway restart
openclaw plugins inspect openclaw-todo --runtime --json
```

Expected runtime result: the plugin loads and reports the registered tools
`todo_create`, `todo_list`, `todo_update`, and `todo_complete`.
