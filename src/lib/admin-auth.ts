export function verifyAdminApiKey(request: Request): boolean {
  const authHeader = request.headers.get("authorization");
  if (!authHeader?.startsWith("Bearer ")) return false;
  return authHeader.slice(7) === process.env.ADMIN_API_KEY;
}

/** ADMIN_EMAILS as a lowercased list. The middleware and getAdminSessionEmail both use this. */
export function parseAdminEmails(value: string | undefined): string[] {
  return (value || "")
    .split(",")
    .map((e) => e.trim().toLowerCase());
}
