import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { config } from "dotenv";

const currentDir = dirname(fileURLToPath(import.meta.url));

const candidates = [
  resolve(currentDir, "../../../.env"),
  resolve(process.cwd(), ".env"),
  resolve(process.cwd(), "../.env"),
];

for (const path of candidates) {
  if (!existsSync(path)) continue;
  config({ path });
  break;
}
