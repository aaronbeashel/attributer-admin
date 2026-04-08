import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/supabase/admin", () => ({
  createSupabaseAdminClient: vi.fn(),
}));
vi.mock("@/lib/event-logger", () => ({ logEvent: vi.fn().mockResolvedValue(undefined) }));

import { POST } from "@/app/api/webhooks/enrichment/route";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { logEvent } from "@/lib/event-logger";

const makeRequest = (body: Record<string, unknown>) =>
  new Request("http://localhost/api/webhooks/enrichment", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${process.env.ENRICHMENT_API_KEY}`,
    },
    body: JSON.stringify(body),
  });

const mockSingle = vi.fn();
const mockUpsert = vi.fn();

describe("POST /api/webhooks/enrichment", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.ENRICHMENT_API_KEY = "test-enrichment-key";

    mockSingle.mockResolvedValue({ data: { id: "acc_123" }, error: null });
    mockUpsert.mockResolvedValue({ error: null });

    vi.mocked(createSupabaseAdminClient).mockReturnValue({
      from: vi.fn((table: string) => {
        if (table === "accounts") {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({ single: mockSingle }),
            }),
          };
        }
        if (table === "account_enrichment") {
          return { upsert: mockUpsert };
        }
        return {};
      }),
    } as never);
  });

  it("returns 401 with wrong API key", async () => {
    const req = new Request("http://localhost/api/webhooks/enrichment", {
      method: "POST",
      headers: { "content-type": "application/json", authorization: "Bearer wrong-key" },
      body: JSON.stringify({ external_id: "acc_123" }),
    });
    const res = await POST(req);
    expect(res.status).toBe(401);
  });

  it("returns 400 when external_id is missing", async () => {
    const res = await POST(makeRequest({}));
    expect(res.status).toBe(400);
  });

  it("returns 404 when account not found", async () => {
    mockSingle.mockResolvedValue({ data: null, error: { code: "PGRST116" } });
    const res = await POST(makeRequest({ external_id: "nonexistent" }));
    expect(res.status).toBe(404);
  });

  it("upserts enrichment data into account_enrichment table", async () => {
    const res = await POST(makeRequest({
      external_id: "acc_123",
      status: "completed",
      job_id: "job_1",
      industry: "Construction",
      sub_industry: "Residential",
      company_size: "11-50",
      signup_path: "agency",
      job_title_raw: "Marketing Manager",
      person_description: "Manages digital campaigns",
      confidence_industry: 85,
      confidence_size: 60,
      confidence_path: 95,
    }));

    expect(res.status).toBe(200);
    expect(mockUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        account_id: "acc_123",
        industry: "Construction",
        sub_industry: "Residential",
        company_size: "11-50",
        signup_path: "agency",
        job_title_raw: "Marketing Manager",
      }),
      { onConflict: "account_id" }
    );
  });

  it("logs account_classified event", async () => {
    await POST(makeRequest({
      external_id: "acc_123",
      status: "completed",
      industry: "SaaS",
      company_size: "1-10",
      signup_path: "direct",
      confidence_industry: 90,
      confidence_size: 70,
      confidence_path: 80,
    }));

    expect(logEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        accountId: "acc_123",
        eventType: "account_classified",
        eventSubtype: "enrichment_completed",
        source: "system",
      })
    );
  });

  it("handles failed enrichment status", async () => {
    await POST(makeRequest({
      external_id: "acc_123",
      status: "failed",
      industry: "Unknown",
      company_size: "Unknown",
      signup_path: "Unknown",
      confidence_industry: 0,
      confidence_size: 0,
      confidence_path: 0,
    }));

    expect(logEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        eventSubtype: "enrichment_failed",
      })
    );
  });
});
