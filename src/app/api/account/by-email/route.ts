import { NextResponse } from "next/server";
import { verifyAdminApiKey } from "@/lib/admin-auth";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export async function GET(request: Request) {
  if (!verifyAdminApiKey(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(request.url);
  const email = url.searchParams.get("email");
  if (!email) {
    return NextResponse.json({ error: "Email required" }, { status: 400 });
  }

  const supabase = createSupabaseAdminClient();

  const { data: account, error } = await supabase
    .from("accounts")
    .select("id, email, name, company")
    .eq("email", email.toLowerCase().trim())
    .limit(1)
    .single();

  if (error || !account) {
    return NextResponse.json({ error: "No account found for this email" }, { status: 404 });
  }

  return NextResponse.json({
    accountId: account.id,
    email: account.email,
    name: account.name,
    company: account.company,
  });
}
