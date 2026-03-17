import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(SCRIPT_DIR, "..");
const STORAGE_DIR = resolve(ROOT, "storage", "migration");
const SNAPSHOT_PATH = resolve(STORAGE_DIR, "legacy_sync_snapshot.json");
const STATE_PATH = resolve(STORAGE_DIR, "legacy_sync_state.json");
const TSX_CLI = resolve(ROOT, "node_modules", "tsx", "dist", "cli.mjs");
const IMPORT_SCRIPT = resolve(ROOT, "server", "src", "scripts", "import-legacy-snapshot.ts");

const args = new Set(process.argv.slice(2));
const full = args.has("--full");
const pythonCmd = process.platform === "win32" ? "python" : "python3";

mkdirSync(STORAGE_DIR, { recursive: true });

function readJson(path) {
  return JSON.parse(readFileSync(path, "utf-8"));
}

function run(command, commandArgs) {
  const result = spawnSync(command, commandArgs, {
    cwd: ROOT,
    stdio: "inherit",
    shell: false,
  });
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

const previousState = existsSync(STATE_PATH) ? readJson(STATE_PATH) : null;
const since = full ? null : previousState?.lastSyncedUntil ?? null;
const mode = full || !since ? "full" : "incremental";

const exportArgs = ["scripts/export_legacy_snapshot.py", "--mode", mode, "--output", SNAPSHOT_PATH];
if (since) {
  exportArgs.push("--since", since);
}

run(pythonCmd, exportArgs);
run(process.execPath, [TSX_CLI, IMPORT_SCRIPT, SNAPSHOT_PATH]);

const snapshot = readJson(SNAPSHOT_PATH);
const nextState = {
  version: 1,
  lastMode: mode,
  lastSyncedSince: snapshot.meta?.sync?.since ?? null,
  lastSyncedUntil: snapshot.meta?.sync?.until ?? snapshot.meta?.generated_at ?? null,
  lastSnapshotPath: relative(ROOT, SNAPSHOT_PATH),
  sourceDatabase: snapshot.meta?.source_database ?? null,
  generatedAt: snapshot.meta?.generated_at ?? null,
  summary: snapshot.summary ?? {},
  syncSummary: snapshot.meta?.sync?.summary ?? {},
};

writeFileSync(STATE_PATH, `${JSON.stringify(nextState, null, 2)}\n`, "utf-8");

console.log("Sincronizacao legado -> Beta 2.0 concluida.");
console.log(JSON.stringify(nextState, null, 2));
