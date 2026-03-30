import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("@/lib/admin-auth", () => ({ verifyAdminApiKey: vi.fn() }));
vi.mock("@/lib/supabase/admin", () => ({
  createSupabaseAdminClient: vi.fn(),
}));

import { POST } from "@/app/api/account/[id]/enrich/route";
import { verifyAdminApiKey } from "@/lib/admin-auth";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

const originalFetch = globalThis.fetch;
const mockParams = Promise.resolve({ id: "acc_123" });

const makeRequest = () =>
  new Request("http://localhost/api/account/acc_123/enrich", {
    method: "POST",
    headers: { authorization: "Bearer test-admin-key-12345" },
  });

describe("POST /api/account/[id]/enrich", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(verifyAdminApiKey).mockReturnValue(true);
    process.env.ENRICHMENT_SERVICE_URL = "https://enrichment.test";
    process.env.ENRICHMENT_API_KEY = "test-key";
    process.env.ADMIN_APP_URL = "https://admin.test";

    vi.mocked(createSupabaseAdminClient).mockReturnValue({
      from: vi.fn((table: string) => {
        if (table === "accounts") {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                single: vi.fn().mockResolvedValue({
                  data: { id: "acc_123", email: "test@test.com", company: "Test Corp" },
                  error: null,
                }),
              }),
            }),
          };
        }
        if (table === "sites") {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                  order: vi.fn().mockReturnValue({
                    limit: vi.fn().mockResolvedValue({
                      data: [{ website_url: "https://test.com" }],
                      error: null,
                    }),
                  }),
                }),
              }),
            }),
          };
        }
        return {};
      }),
    } as never);

    globalThis.fetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ job_id: "job_1", status: "queued" }), { status: 200 })
    );
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("returns 401 when API key is invalid", async () => {
    vi.mocked(verifyAdminApiKey).mockReturnValue(false);
    const res = await POST(makeRequest(), { params: mockParams });
    expect(res.status).toBe(401);
  });

  it("returns 404 when account not found", async () => {
    vi.mocked(createSupabaseAdminClient).mockReturnValue({
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({ data: null, error: { code: "PGRST116" } }),
          }),
        }),
      }),
    } as never);
    const res = await POST(makeRequest(), { params: mockParams });
    expect(res.status).toBe(404);
  });

  it("calls enrichment service and returns success", async () => {
    const res = await POST(makeRequest(), { params: mockParams });
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.jobId).toBe("job_1");

    expect(globalThis.fetch).toHaveBeenCalledWith(
      "https://enrichment.test/api/enrich",
      expect.objectContaining({
        method: "POST",
        body: expect.stringContaining("acc_123"),
      })
    );
  });

  it("returns 502 when enrichment service fails", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(new Response("Error", { status: 500 }));
    const res = await POST(makeRequest(), { params: mockParams });
    expect(res.status).toBe(502);
  });
});
