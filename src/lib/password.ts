import "server-only";
import { compare, hash } from "bcryptjs";
export function verifyPassword(password: string, digest: string) { return compare(password, digest); }
export function hashPassword(password: string) { return hash(password, 12); }
