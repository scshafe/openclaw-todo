#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";

const pkg = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));

if (!pkg.peerDependencies?.openclaw) {
  throw new Error("package.json must declare peerDependencies.openclaw");
}

const result = spawnSync("npm", ["pack", "--dry-run", "--json"], {
  cwd: new URL("..", import.meta.url),
  encoding: "utf8",
  stdio: ["ignore", "pipe", "pipe"],
});

if (result.status !== 0) {
  process.stderr.write(result.stderr);
  process.stdout.write(result.stdout);
  process.exit(result.status ?? 1);
}

let pack;
try {
  [pack] = JSON.parse(result.stdout);
} catch (error) {
  process.stdout.write(result.stdout);
  throw new Error(`Unable to parse npm pack --dry-run --json output: ${error.message}`);
}

const files = new Set(pack.files.map((file) => file.path));
const required = [
  "openclaw.plugin.json",
  "package.json",
  "README.md",
  "LICENSE",
  "src/index.js",
  "src/store.js",
  "src/cli.js",
];

for (const file of required) {
  if (!files.has(file)) throw new Error(`npm package is missing required file: ${file}`);
}

for (const file of files) {
  if (file.endsWith(".sqlite") || file.endsWith(".db") || file === ".env") {
    throw new Error(`npm package includes local state/secrets candidate: ${file}`);
  }
}

console.log(JSON.stringify({ ok: true, name: pack.name, version: pack.version, files: pack.files.length }, null, 2));
