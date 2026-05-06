import { NextResponse } from "next/server";
import { verifyAdminApiKey } from "@/lib/admin-auth";
import { getAccountWithSubscription } from "@/lib/account-helpers";
import { logEvent } from "@/lib/event-logger";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!verifyAdminApiKey(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;

  try {
    const body = await request.json();
    const email = body.email;

    if (!email) {
      return NextResponse.json({ error: "email is required" }, { status: 400 });
    }

    const result = await getAccountWithSubscription(id);
    if (!result) {
      return NextResponse.json({ error: "Account not found" }, { status: 404 });
    }

    const customerAppUrl = process.env.CUSTOMER_APP_URL;
    if (!customerAppUrl) {
      return NextResponse.json({ error: "CUSTOMER_APP_URL not configured" }, { status: 500 });
    }

    const response = await fetch(`${customerAppUrl}/api/auth/request-password-reset`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, redirectTo: "/reset-password/confirm" }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("[password-reset] Customer app returned error:", errorText);
      return NextResponse.json({ error: "Failed to trigger password reset" }, { status: 502 });
    }

    await logEvent({
      accountId: id,
      eventType: "password_reset_triggered",
      metadata: {
        email,
        initiatedBy: "admin",
        supportCaseId: body.supportCaseId,
      },
      source: "api",
    });

    return NextResponse.json({
      success: true,
      email,
      message: "Password reset email sent",
    });
  } catch (err) {
    console.error(`[API] POST /api/account/${id}/password-reset:`, err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
