import { parseAdminEmails, verifyAdminApiKey } from "@/lib/admin-auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";

/**
 * The signed-in admin's email, lowercased, from the Supabase session cookie.
 * Null when there's no session, the user has no email, the email isn't in
 * ADMIN_EMAILS, or the session can't be read. For routes that must not accept
 * the admin API key.
 */
export async function getAdminSessionEmail(): Promise<string | null> {
  try {
    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    const email = user?.email?.toLowerCase();
    if (!email) return null;
    return parseAdminEmails(process.env.ADMIN_EMAILS).includes(email) ? email : null;
  } catch (err) {
    console.error("[admin-session] Couldn't read the session:", err);
    return null;
  }
}

/**
 * Auth for the account and Stripe API routes. Server-to-server callers (the
 * support app) send the admin API key as a Bearer token; the admin UI's own
 * browser calls carry the signed-in admin's Supabase session cookie instead,
 * so the key never has to reach the browser.
 */
export async function isAdminRequest(request: Request): Promise<boolean> {
  if (verifyAdminApiKey(request)) return true;
  return (await getAdminSessionEmail()) !== null;
}
