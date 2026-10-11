import { createInterface } from "node:readline/promises";
import { Writable } from "node:stream";
import { Prisma, PrismaClient } from "@prisma/client";
import { hash } from "bcryptjs";
import { ZodError } from "zod";
import { userSchema } from "../src/validations/user.schema";

class PromptOutput extends Writable {
  muted = false;
  _write(chunk: Buffer, _encoding: BufferEncoding, callback: (error?: Error | null) => void) {
    if (!this.muted) process.stdout.write(chunk);
    callback();
  }
}

async function main() {
  if (!process.stdin.isTTY || !process.stdout.isTTY) {
    console.error("Run this command in an interactive terminal. Credentials cannot be supplied through command arguments or pipes.");
    process.exitCode = 1;
    return;
  }

  const output = new PromptOutput();
  const reader = createInterface({ input: process.stdin, output, terminal: true });
  const cancellation = new AbortController();
  reader.on("SIGINT", () => cancellation.abort());
  const prisma = new PrismaClient();

  async function secretPrompt(label: string) {
    process.stdout.write(label + " (hidden): ");
    output.muted = true;
    try { return await reader.question("", { signal: cancellation.signal }); }
    finally { output.muted = false; process.stdout.write("\n"); }
  }

  try {
    console.log("Create a real administrator account in your configured database.");
    console.log("Existing accounts and business records will be preserved. Press Ctrl+C to cancel.\n");
    const name = await reader.question("Name: ", { signal: cancellation.signal });
    const email = await reader.question("Email: ", { signal: cancellation.signal });
    const password = await secretPrompt("Password — at least 12 characters");
    const confirmation = await secretPrompt("Confirm password");
    if (password !== confirmation) throw new Error("Passwords do not match. Run the command again.");
    const input = userSchema.parse({ name, email, password, role: "ADMIN" });
    const passwordHash = await hash(input.password, 12);

    await prisma.$transaction(async tx => {
      const existing = await tx.users.findFirst({ where: { email: { equals: input.email, mode: "insensitive" } }, select: { id: true } });
      if (existing) throw new Error("An account with this email already exists. Use a different email; existing credentials were not changed.");
      await tx.users.create({ data: { name: input.name, email: input.email.toLowerCase(), role: "ADMIN", password_hash: passwordHash }, select: { id: true } });
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });

    console.log("\nAdministrator account created. Sign in at /login using the email and password you entered.");
  } catch (error) {
    if (cancellation.signal.aborted) console.error("Account creation cancelled.");
    else if (error instanceof ZodError) console.error(error.issues[0]?.message ?? "Check your account details.");
    else if (error instanceof Prisma.PrismaClientKnownRequestError) {
      console.error(error.code === "P2002" ? "This email already exists. No account was changed." : "Database operation failed. Check the connection and try again.");
    } else if (error instanceof Error && ["Passwords do not match.", "An account with this email"].some(prefix => error.message.startsWith(prefix))) console.error(error.message);
    else console.error("Unable to create the administrator. Check your database connection and try again.");
    process.exitCode = 1;
  } finally {
    reader.close();
    await prisma.$disconnect();
  }
}

void main();
