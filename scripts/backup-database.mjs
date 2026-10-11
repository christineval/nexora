import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, statSync } from "node:fs";
import { resolve, join } from "node:path";
import nextEnv from "@next/env";

nextEnv.loadEnvConfig(process.cwd());

function findPgDump() {
  if (process.env.PG_DUMP_PATH) return process.env.PG_DUMP_PATH;
  if (process.platform !== "win32") return "pg_dump";
  const base = join(process.env.ProgramFiles || "C:/Program Files", "PostgreSQL");
  if (existsSync(base)) {
    for (const version of readdirSync(base).sort((a, b) => b.localeCompare(a, undefined, { numeric: true }))) {
      const candidate = join(base, version, "bin", "pg_dump.exe");
      if (existsSync(candidate)) return candidate;
    }
  }
  return "pg_dump";
}

try {
  if (!process.env.DATABASE_URL) throw new Error("Set DATABASE_URL before creating a backup.");
  const connection = new URL(process.env.DATABASE_URL);
  if (!["postgres:", "postgresql:"].includes(connection.protocol)) throw new Error("DATABASE_URL must be a PostgreSQL connection URL.");
  const directory = resolve("backups");
  mkdirSync(directory, { recursive: true });
  const file = join(directory, `nexora-${new Date().toISOString().replaceAll(":", "-")}.dump`);
  const result = spawnSync(findPgDump(), ["--format=custom", "--no-owner", "--no-privileges", "--no-password", "--file=" + file], {
    env: {
      ...process.env, PGHOST: connection.hostname, PGPORT: connection.port || "5432",
      PGUSER: decodeURIComponent(connection.username), PGPASSWORD: decodeURIComponent(connection.password),
      PGDATABASE: decodeURIComponent(connection.pathname.slice(1)), PGCONNECT_TIMEOUT: "15",
      ...(connection.searchParams.has("sslmode") ? { PGSSLMODE: connection.searchParams.get("sslmode") } : {}),
    },
    encoding: "utf8", windowsHide: true,
  });
  if (result.error || result.status !== 0) throw new Error("Backup failed. Check database connectivity, pg_dump installation/version, and available disk space. Set PG_DUMP_PATH if needed.");
  if (!existsSync(file) || statSync(file).size === 0) throw new Error("Backup output is empty.");
  if (result.stderr.trim()) console.warn("pg_dump reported a warning. Verify this backup by restoring it to a separate test database before relying on it.");
  console.log("Backup created: " + file);
  console.log("Keep this file private: it contains business records and password hashes. It is excluded from Git.");
} catch (error) {
  console.error(error instanceof Error ? error.message.replace(/postgres(?:ql)?:\/\/\S+/gi, "[database URL hidden]") : "Backup failed.");
  process.exitCode = 1;
}
