import { NextRequest, NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { blockDomain } from "@/lib/external/blocklist";

export async function POST(request: NextRequest) {
  try {
    const { domain, action, reason, notes } = await request.json();

    if (!domain || !action || !["blocked", "dismissed"].includes(action)) {
      return NextResponse.json({ error: "Invalid request" }, { status: 400 });
    }

    // If blocking, call the blocklist API
    if (action === "blocked") {
      await blockDomain(domain, reason || "Unlicensed usage");
    }

    // Record the review in the database
    const supabase = createSupabaseAdminClient();
    const { error } = await supabase.from("licensing_reviews").insert({
      domain,
      action,
      reason,
      notes,
      actioned_by: "admin",
    });

    if (error) {
      // Table might not exist yet — log but don't fail
      console.error("Failed to record licensing review:", error);
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Licensing action error:", error);
    return NextResponse.json(
      { error: "Failed to process action" },
      { status: 500 }
    );
  }
}
