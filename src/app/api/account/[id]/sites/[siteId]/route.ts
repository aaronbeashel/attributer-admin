import { NextRequest, NextResponse } from "next/server";
import { getAdminSessionEmail } from "@/lib/admin-session";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { editSiteAddress } from "@/lib/sites/edit-site-address";

/**
 * Correct a site's website address (an admin typo fix). See editSiteAddress for
 * the rules. This can unblock a domain on the production licensing server, so
 * it needs a signed-in admin session. The admin API key is deliberately not
 * accepted here: the browser copy of it ships in the page JavaScript.
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; siteId: string }> }
) {
  const actor = await getAdminSessionEmail();
  if (!actor) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id: accountId, siteId } = await params;

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) ?? {};
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }
  const { websiteUrl, expectedDomain, confirmedDomain } = body;
  if (
    typeof websiteUrl !== "string" ||
    (expectedDomain !== null && typeof expectedDomain !== "string") ||
    (confirmedDomain !== undefined && confirmedDomain !== null && typeof confirmedDomain !== "string")
  ) {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  try {
    const result = await editSiteAddress(createSupabaseAdminClient(), {
      accountId,
      siteId,
      websiteUrl,
      expectedDomain,
      confirmedDomain: confirmedDomain ?? null,
      actor,
    });

    switch (result.kind) {
      case "saved":
        return NextResponse.json({
          success: true,
          site: result.site,
          unblock: result.unblock,
          eventLogged: result.eventLogged,
          unblockRecorded: result.unblockRecorded,
        });
      case "needs_confirmation":
        return NextResponse.json(
          { needsConfirmation: true, message: result.message, conflicts: result.conflicts },
          { status: 409 }
        );
      default:
        return NextResponse.json({ error: result.message }, { status: result.status });
    }
  } catch (error) {
    console.error("[edit-site] Unexpected error:", error);
    return NextResponse.json(
      { error: "Something went wrong. Refresh the page to see whether it saved." },
      { status: 500 }
    );
  }
}
