import "../bootstrap/load-env.js";

import { sql } from "drizzle-orm";

import { requireDb } from "../db/client.js";

async function main() {
  const db = requireDb();
  const secretariasResult = await db.execute(sql`select count(*)::int as total from secretarias;`);
  const usersResult = await db.execute(sql`select count(*)::int as total from users;`);
  const totalSecretarias = Number(secretariasResult.rows[0]?.total ?? 0);
  const totalUsers = Number(usersResult.rows[0]?.total ?? 0);

  if (totalSecretarias > 0 && totalUsers > 0) {
    console.log(`Banco já semeado: ${totalSecretarias} secretarias e ${totalUsers} usuários.`);
    process.exit(0);
  }

  console.log("Banco ainda não possui seed básico suficiente.");
  process.exit(1);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
