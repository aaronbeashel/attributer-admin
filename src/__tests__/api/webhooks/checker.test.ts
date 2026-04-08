import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/supabase/admin", () => ({
  createSupabaseAdminClient: vi.fn(),
}));

import { POST } from "@/app/api/webhooks/checker/route";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

const mockUpdate = vi.fn();

describe("POST /api/webhooks/checker", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.CHECKER_WEBHOOK_SECRET = "test-checker-secret";

    mockUpdate.mockResolvedValue({ error: null });

    vi.mocked(createSupabaseAdminClient).mockReturnValue({
      from: vi.fn().mockReturnValue({
        update: vi.fn().mockReturnValue({
          eq: mockUpdate,
        }),
      }),
    } as never);
  });

  function makeRequest(body: Record<string, unknown>, secret = "test-checker-secret") {
    return new Request("http://localhost/api/webhooks/checker", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${secret}`,
      },
      body: JSON.stringify(body),
    });
  }

  it("returns 401 with wrong secret", async () => {
    const res = await POST(makeRequest({ domain: "test.com" }, "wrong-secret"));
    expect(res.status).toBe(401);
  });

  it("returns 400 when domain is missing", async () => {
    const res = await POST(makeRequest({}));
    expect(res.status).toBe(400);
  });

  it("sets confirmed_unlicensed when removed is false", async () => {
    const res = await POST(makeRequest({
      domain: "test.com",
      removed: false,
      method: "network",
      checkedAt: "2026-04-08T12:00:00Z",
    }));

    expect(res.status).toBe(200);
    expect(mockUpdate).toHaveBeenCalled();
  });

  it("sets not_installed when removed is true", async () => {
    const res = await POST(makeRequest({
      domain: "test.com",
      removed: true,
      method: "not_found",
      checkedAt: "2026-04-08T12:00:00Z",
    }));

    expect(res.status).toBe(200);
  });

  it("sets check_failed with error when removed is null", async () => {
    const res = await POST(makeRequest({
      domain: "test.com",
      removed: null,
      method: null,
      error: "Site returned HTTP 403",
      checkedAt: "2026-04-08T12:00:00Z",
    }));

    expect(res.status).toBe(200);
  });

  it("returns 200 even if domain not found in DB", async () => {
    mockUpdate.mockResolvedValue({ error: { code: "PGRST116" } });

    const res = await POST(makeRequest({
      domain: "nonexistent.com",
      removed: false,
      checkedAt: "2026-04-08T12:00:00Z",
    }));

    expect(res.status).toBe(200);
  });
});
