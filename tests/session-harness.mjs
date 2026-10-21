import { loadTs } from "./load-ts.mjs";

export function sessionHarness(user) {
  const sessions = new Map();
  const audit = [];
  const model = {
    async deleteMany({ where }) {
      let count = 0;
      for (const [key, row] of sessions) {
        if (where.token_hash && (typeof where.token_hash === "string" ? key === where.token_hash : where.token_hash.in.includes(key)) ||
          where.user_id === row.user_id && (!where.OR || where.OR.some(condition => condition.expires_at ? row.expires_at <= condition.expires_at.lte : row.password_fingerprint !== condition.password_fingerprint.not))) { sessions.delete(key); count++; }
      }
      return { count };
    },
    async findMany() { return [...sessions.values()].sort((a, b) => b.created_at - a.created_at || b.token_hash.localeCompare(a.token_hash)); },
    async create({ data }) { sessions.set(data.token_hash, data); },
    async findUnique({ where }) { const row = sessions.get(where.token_hash); return row ? { ...row, users: user } : null; },
  };
  let queue = Promise.resolve();
  const prisma = {
    user_sessions: model,
    $transaction(operation) {
      const run = queue.then(() => operation({ user_sessions: model, users: { async findUnique() { return user; } }, audit_logs: { async create({ data }) { audit.push(data); } }, async $queryRaw() { return [{ password_hash: user.password_hash }]; } }));
      queue = run.catch(() => {});
      return run;
    },
  };
  return { sessions, audit, store: loadTs("src/lib/session-store.ts", { "@/lib/prisma": { prisma } }) };
}
