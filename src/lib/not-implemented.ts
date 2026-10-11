import "server-only";
export function notImplemented(feature: string): never {
  throw new Error(feature + " is not implemented. Confirm the database schema before adding business operations.");
}
export function pendingApi(feature: string) {
  return Response.json({ error: "NOT_IMPLEMENTED", message: feature + " is not implemented yet." }, { status: 501 });
}
