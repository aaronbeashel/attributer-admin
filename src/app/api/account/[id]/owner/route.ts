import { NextResponse } from "next/server";
import { verifyAdminApiKey } from "@/lib/admin-auth";
import { getAccountWithSubscription } from "@/lib/account-helpers";
import { updateStripeCustomer } from "@/lib/stripe";
import { logEvent } from "@/lib/event-logger";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!verifyAdminApiKey(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;

  try {
    const body = await request.json();

    if (!body.email) {
      return NextResponse.json({ error: "email is required" }, { status: 400 });
    }

    const result = await getAccountWithSubscription(id);
    if (!result) {
      return NextResponse.json({ error: "Account not found" }, { status: 404 });
    }

    const { account } = result;
    const oldEmail = account.email;
    const supabase = createSupabaseAdminClient();

    // Build new name if provided
    const newName =
      body.firstName && body.lastName
        ? `${body.firstName} ${body.lastName}`
        : undefined;

    // Update accounts table
    const accountUpdates: Record<string, unknown> = {
      email: body.email,
      updated_at: new Date().toISOString(),
    };
    if (body.company !== undefined) accountUpdates.company = body.company;
    if (newName) accountUpdates.name = newName;

    await supabase.from("accounts").update(accountUpdates).eq("id", id);

    // Update BetterAuth user table (email must match for login to work)
    const userUpdates: Record<string, unknown> = {
      email: body.email,
      updated_at: new Date().toISOString(),
    };
    if (newName) userUpdates.name = newName;

    await supabase
      .from("user")
      .update(userUpdates)
      .eq("id", account.betterauth_user_id);

    // Update users profile table (first_name / last_name)
    if (body.firstName || body.lastName) {
      const profileUpdates: Record<string, unknown> = {
        updated_at: new Date().toISOString(),
      };
      if (body.firstName) profileUpdates.first_name = body.firstName;
      if (body.lastName) profileUpdates.last_name = body.lastName;

      await supabase
        .from("users")
        .update(profileUpdates)
        .eq("account_id", id)
        .eq("role", "owner");
    }

    // Sync email to Stripe
    if (result.subscription?.stripe_customer_id) {
      await updateStripeCustomer({
        customerId: result.subscription.stripe_customer_id,
        email: body.email,
        name: newName,
      });
    }

    await logEvent({
      accountId: id,
      eventType: "ownership_transferred",
      metadata: {
        oldEmail,
        newEmail: body.email,
        newFirstName: body.firstName,
        newLastName: body.lastName,
        newCompany: body.company,
        supportCaseId: body.supportCaseId,
        initiatedBy: "admin",
      },
      source: "api",
    });

    return NextResponse.json({
      success: true,
      account: {
        email: body.email,
        name: newName || account.name,
        company: body.company || account.company,
      },
      previousEmail: oldEmail,
    });
  } catch (err) {
    console.error(`[API] PUT /api/account/${id}/owner:`, err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
