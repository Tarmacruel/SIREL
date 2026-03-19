import "dotenv/config";

import { createHash } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";

import pg from "pg";

const { Client } = pg;

const rootDir = process.cwd();
const migrationsDir = path.join(rootDir, "drizzle", "migrations");
const metaDir = path.join(migrationsDir, "meta");
const journalPath = path.join(metaDir, "_journal.json");

async function listMigrationFiles() {
  const entries = await fs.readdir(migrationsDir, { withFileTypes: true });
  return entries
    .filter((entry) => entry.isFile() && entry.name.endsWith(".sql"))
    .map((entry) => entry.name)
    .sort((left, right) => left.localeCompare(right));
}

async function readJournal() {
  const raw = await fs.readFile(journalPath, "utf8");
  return JSON.parse(raw);
}

function buildJournal(existingJournal, migrationFiles) {
  const existingByTag = new Map(existingJournal.entries.map((entry) => [entry.tag, entry]));
  let nextWhen =
    existingJournal.entries.reduce((maxValue, entry) => Math.max(maxValue, Number(entry.when) || 0), 0) ||
    Date.now();

  const entries = migrationFiles.map((fileName, index) => {
    const tag = fileName.replace(/\.sql$/i, "");
    const existing = existingByTag.get(tag);

    if (existing) {
      return {
        idx: index,
        version: existing.version ?? existingJournal.version,
        when: Number(existing.when) || nextWhen,
        tag,
        breakpoints: existing.breakpoints ?? true,
      };
    }

    nextWhen += 1000;

    return {
      idx: index,
      version: existingJournal.version,
      when: nextWhen,
      tag,
      breakpoints: true,
    };
  });

  return {
    version: existingJournal.version,
    dialect: existingJournal.dialect,
    entries,
  };
}

async function writeJournal(journal) {
  await fs.writeFile(journalPath, `${JSON.stringify(journal, null, 2)}\n`, "utf8");
}

async function ensureMigrationTable(client) {
  await client.query(`create schema if not exists drizzle`);
  await client.query(`
    create table if not exists drizzle.__drizzle_migrations (
      id serial primary key,
      hash text not null,
      created_at bigint
    )
  `);
}

async function backfillDatabaseHistory(client, journal) {
  const existingRows = await client.query(`select hash from drizzle.__drizzle_migrations`);
  const knownHashes = new Set(existingRows.rows.map((row) => row.hash));

  for (const entry of journal.entries) {
    const filePath = path.join(migrationsDir, `${entry.tag}.sql`);
    const buffer = await fs.readFile(filePath);
    const hash = createHash("sha256").update(buffer).digest("hex");

    if (knownHashes.has(hash)) {
      continue;
    }

    await client.query(
      `insert into drizzle.__drizzle_migrations (hash, created_at) values ($1, $2)`,
      [hash, Number(entry.when)],
    );
    knownHashes.add(hash);
  }
}

async function main() {
  const migrationFiles = await listMigrationFiles();
  const existingJournal = await readJournal();
  const journal = buildJournal(existingJournal, migrationFiles);

  await writeJournal(journal);

  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL não configurada.");
  }

  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();

  try {
    await ensureMigrationTable(client);
    await backfillDatabaseHistory(client, journal);
  } finally {
    await client.end();
  }

  console.log(`Journal sincronizado com ${journal.entries.length} migrations.`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
