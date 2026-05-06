import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/admin-auth", () => ({ verifyAdminApiKey: vi.fn() }));
vi.mock("@/lib/account-helpers", () => ({ getAccountWithSubscription: vi.fn() }));
vi.mock("@/lib/event-logger", () => ({ logEvent: vi.fn().mockResolvedValue(undefined) }));

import { POST } from "@/app/api/account/[id]/password-reset/route";
import { verifyAdminApiKey } from "@/lib/admin-auth";
import { getAccountWithSubscription } from "@/lib/account-helpers";
import { MOCK_ACCOUNT_WITH_SUB } from "../../__mocks__/fixtures/account";

const originalFetch = globalThis.fetch;

const makeRequest = (body: Record<string, unknown>) =>
  new Request("http://localhost/api/account/acc_123/password-reset", {
    method: "POST",
    headers: { "content-type": "application/json", authorization: "Bearer test-admin-key-12345" },
    body: JSON.stringify(body),
  });

const mockParams = Promise.resolve({ id: "acc_123" });

describe("POST /api/account/[id]/password-reset", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(verifyAdminApiKey).mockReturnValue(true);
    vi.mocked(getAccountWithSubscription).mockResolvedValue(MOCK_ACCOUNT_WITH_SUB);
    globalThis.fetch = vi.fn().mockResolvedValue(new Response("OK", { status: 200 }));
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("returns 401 when API key is invalid", async () => {
    vi.mocked(verifyAdminApiKey).mockReturnValue(false);
    const res = await POST(makeRequest({ email: "test@example.com" }), { params: mockParams });
    expect(res.status).toBe(401);
  });

  it("returns 400 when email is missing", async () => {
    const res = await POST(makeRequest({}), { params: mockParams });
    expect(res.status).toBe(400);
  });

  it("calls customer app request-password-reset endpoint with confirm redirect", async () => {
    const res = await POST(makeRequest({ email: "test@example.com" }), { params: mockParams });
    expect(res.status).toBe(200);

    expect(globalThis.fetch).toHaveBeenCalledWith(
      "http://localhost:3001/api/auth/request-password-reset",
      expect.objectContaining({
        method: "POST",
        body: expect.stringContaining("test@example.com"),
      })
    );

    const fetchCall = vi.mocked(globalThis.fetch).mock.calls[0];
    const sentBody = JSON.parse(fetchCall[1]?.body as string);
    expect(sentBody.redirectTo).toBe("/reset-password/confirm");
  });

  it("returns 502 when customer app returns error", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(new Response("Error", { status: 500 }));
    const res = await POST(makeRequest({ email: "test@example.com" }), { params: mockParams });
    expect(res.status).toBe(502);
  });

  it("returns success with email", async () => {
    const res = await POST(makeRequest({ email: "test@example.com" }), { params: mockParams });
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.email).toBe("test@example.com");
  });
});
