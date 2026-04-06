import { NextResponse } from "next/server";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const domain = url.searchParams.get("domain");

  if (!domain) {
    return NextResponse.json({ error: "domain parameter required" }, { status: 400 });
  }

  const serverUrl = process.env.LICENSING_SERVER_URL || "https://licenses.attributer.io";
  const username = process.env.LICENSING_SERVER_USERNAME || "attributer";
  const password = process.env.LICENSING_SERVER_PASSWORD || "";

  try {
    const res = await fetch(`${serverUrl}/blocked?site=${encodeURIComponent(domain)}`, {
      headers: {
        Authorization: "Basic " + Buffer.from(`${username}:${password}`).toString("base64"),
      },
      signal: AbortSignal.timeout(10000),
    });

    if (!res.ok) {
      return NextResponse.json({ error: `Licensing server returned HTTP ${res.status}` }, { status: 502 });
    }

    const data = await res.json();

    // "Not found" means domain has never been in the block list
    if (data.error === "Not found") {
      return NextResponse.json({
        domain,
        isBlocked: false,
        inSystem: false,
        history: [],
      });
    }

    return NextResponse.json({
      domain,
      isBlocked: data.isBlocked === 1,
      inSystem: true,
      lastBlocked: data.lastBlocked ?? null,
      lastUnblocked: data.lastUnblocked ?? null,
      history: data.history ?? [],
    });
  } catch (err) {
    console.error("[licensing/lookup] Error:", err);
    return NextResponse.json({ error: "Failed to query licensing server" }, { status: 502 });
  }
}
