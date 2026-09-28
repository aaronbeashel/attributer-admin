import { parseAdminEmails } from "@/lib/admin-auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";

/**
 * The signed-in admin's email, lowercased, from the Supabase session cookie.
 * Null when there's no session, the user has no email, the email isn't in
 * ADMIN_EMAILS, or the session can't be read. For routes that must not accept
 * the browser-exposed admin API key.
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
