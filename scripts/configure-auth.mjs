import { existsSync, readFileSync, appendFileSync } from "node:fs";
import { randomBytes } from "node:crypto";
if (!existsSync(".env")) {
  console.error("Create .env with DATABASE_URL before configuring authentication.");
  process.exitCode = 1;
} else if (!/^SESSION_SECRET=/m.test(readFileSync(".env", "utf8"))) {
  appendFileSync(".env", "\nSESSION_SECRET=\"" + randomBytes(48).toString("hex") + "\"\n");
  console.log("Configured a local session secret. No existing environment values were changed.");
} else {
  console.log("SESSION_SECRET already exists; left unchanged.");
}
