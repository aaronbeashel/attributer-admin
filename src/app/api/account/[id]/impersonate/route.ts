import { NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { verifyAdminApiKey } from "@/lib/admin-auth";
import { getAccountWithSubscription } from "@/lib/account-helpers";
import { logEvent } from "@/lib/event-logger";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!verifyAdminApiKey(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;

  try {
    const result = await getAccountWithSubscription(id);
    if (!result) {
      return NextResponse.json({ error: "Account not found" }, { status: 404 });
    }

    const userId = result.account.betterauth_user_id;
    const supabase = createSupabaseAdminClient();

    // Generate a session token
    const sessionToken = randomUUID();
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

    // Insert session into BetterAuth session table
    const { error } = await supabase.from("session").insert({
      id: randomUUID(),
      token: sessionToken,
      user_id: userId,
      expires_at: expiresAt.toISOString(),
      ip_address: request.headers.get("x-forwarded-for") || "admin",
      user_agent: "admin-impersonation",
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });

    if (error) {
      console.error("[impersonate] Failed to create session:", error);
      return NextResponse.json({ error: "Failed to create impersonation session" }, { status: 500 });
    }

    await logEvent({
      accountId: id,
      eventType: "impersonation_started",
      metadata: {
        userId,
        email: result.account.email,
        expiresAt: expiresAt.toISOString(),
        initiatedBy: "admin",
      },
      source: "api",
    });

    const customerAppUrl = process.env.CUSTOMER_APP_URL;
    if (!customerAppUrl) {
      return NextResponse.json({ error: "CUSTOMER_APP_URL not configured" }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      url: `${customerAppUrl}/api/auth/impersonate?token=${sessionToken}`,
      expiresAt: expiresAt.toISOString(),
    });
  } catch (err) {
    console.error(`[API] POST /api/account/${id}/impersonate:`, err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
