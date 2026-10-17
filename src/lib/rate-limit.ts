import "server-only";
import { createHash } from "node:crypto";
import { isIP } from "node:net";
import { prisma } from "@/lib/prisma";
import { BusinessError } from "@/lib/errors";

export class RateLimitError extends BusinessError {
  constructor(public readonly retryAfter: number) { super("Too many requests. Please try again later.", 429); }
}

export async function consumeLimit(identity: string, limit: number, seconds: number) {
  const key = createHash("sha256").update(identity).digest("hex");
  // A single upsert increments atomically across processes and server instances.
  const rows = await prisma.$queryRaw<Array<{ count: number; retry_after: number }>>`
    INSERT INTO api_rate_limits (key, count, expires_at)
    VALUES (${key}, 1, clock_timestamp() + ${seconds} * interval '1 second')
    ON CONFLICT (key) DO UPDATE SET
      count = CASE WHEN api_rate_limits.expires_at <= clock_timestamp() THEN 1 ELSE LEAST(api_rate_limits.count + 1, 1000000) END,
      expires_at = CASE WHEN api_rate_limits.expires_at <= clock_timestamp() THEN clock_timestamp() + ${seconds} * interval '1 second' ELSE api_rate_limits.expires_at END
    RETURNING count, GREATEST(1, CEIL(EXTRACT(EPOCH FROM (expires_at - clock_timestamp()))))::integer AS retry_after`;
  if (rows[0].count > limit) throw new RateLimitError(rows[0].retry_after);
}

export async function limitRequest(request: Request) {
  // Only trust a header explicitly configured and overwritten by the deployment proxy.
  const header = process.env.TRUSTED_CLIENT_IP_HEADER;
  const supplied = header ? request.headers.get(header)?.trim() : undefined;
  const ip = supplied && isIP(supplied) ? supplied : "shared";
  const auth = new URL(request.url).pathname.startsWith("/api/auth/");
  await consumeLimit(`request:${auth ? "auth" : "api"}:${ip}`, auth ? 30 : 120, 60);
}
