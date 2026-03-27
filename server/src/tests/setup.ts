import dotenv from "dotenv";
import { fileURLToPath, URL } from "node:url";

dotenv.config({
  path: fileURLToPath(new URL("../../../.env", import.meta.url)),
});
