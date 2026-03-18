import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

const connectionString = process.env.DATABASE_URL ?? "";

export const databaseEnabled = Boolean(connectionString);

const pool = databaseEnabled
  ? new Pool({ connectionString, max: 10, idleTimeoutMillis: 30000 })
  : null;

export const db = pool ? drizzle(pool) : null;

export function requireDb() {
  if (!db) {
    throw new Error("DATABASE_URL nao configurada para a Beta 2.0");
  }
  return db;
}
