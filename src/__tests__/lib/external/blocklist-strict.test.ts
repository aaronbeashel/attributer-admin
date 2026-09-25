import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { checkBlockedDomains, checkBlockedDomainsStrict } from "@/lib/external/blocklist";

const fetchMock = vi.fn();

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

describe("checkBlockedDomainsStrict", () => {
  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
    vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("reads the numeric isBlocked (1 and 0)", async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ isBlocked: 1, lastBlocked: "2026-09-11T00:00:00Z" }))
      .mockResolvedValueOnce(jsonResponse({ isBlocked: 0 }));
    const results = await checkBlockedDomainsStrict(["a.com", "b.com"], 1);
    expect(results).toEqual([
      { domain: "a.com", isBlocked: true, blockedAt: "2026-09-11T00:00:00Z" },
      { domain: "b.com", isBlocked: false, blockedAt: undefined },
    ]);
    expect(fetchMock.mock.calls[0][0]).toContain("/blocked?site=a.com");
  });

  it('treats {"error":"Not found"} as not blocked', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ error: "Not found" }));
    expect(await checkBlockedDomainsStrict(["a.com"])).toEqual([{ domain: "a.com", isBlocked: false }]);
  });

  it("gives null on HTTP 500", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ error: "boom" }, 500));
    expect(await checkBlockedDomainsStrict(["a.com"])).toEqual([{ domain: "a.com", isBlocked: null }]);
  });

  it("gives null on a timeout", async () => {
    fetchMock.mockRejectedValueOnce(new DOMException("The operation was aborted due to timeout", "TimeoutError"));
    expect(await checkBlockedDomainsStrict(["a.com"])).toEqual([{ domain: "a.com", isBlocked: null }]);
  });

  it("gives null on an unparseable or unexpected body", async () => {
    fetchMock
      .mockResolvedValueOnce(new Response("<html>oops</html>", { status: 200 }))
      .mockResolvedValueOnce(jsonResponse({ error: "Internal error" }));
    expect(await checkBlockedDomainsStrict(["a.com", "b.com"], 1)).toEqual([
      { domain: "a.com", isBlocked: null },
      { domain: "b.com", isBlocked: null },
    ]);
  });

  it("never has more than `concurrency` requests in flight", async () => {
    let inFlight = 0;
    let maxInFlight = 0;
    fetchMock.mockImplementation(async () => {
      inFlight++;
      maxInFlight = Math.max(maxInFlight, inFlight);
      await new Promise((resolve) => setTimeout(resolve, 1));
      inFlight--;
      return jsonResponse({ isBlocked: 0 });
    });

    const domains = Array.from({ length: 40 }, (_, i) => `d${i}.com`);
    const results = await checkBlockedDomainsStrict(domains, 5);
    expect(results.map((r) => r.domain)).toEqual(domains);
    expect(fetchMock).toHaveBeenCalledTimes(40);
    expect(maxInFlight).toBe(5);
  });
});

describe("checkBlockedDomains", () => {
  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
    vi.spyOn(console, "warn").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("keeps its fail-open behaviour for display callers", async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ isBlocked: 1, lastBlocked: "2026-09-11T00:00:00Z" }))
      .mockResolvedValueOnce(jsonResponse({}, 503));
    const results = await checkBlockedDomains(["a.com", "b.com"]);
    expect(results).toEqual([
      { domain: "a.com", isBlocked: true, blockedAt: "2026-09-11T00:00:00Z" },
      { domain: "b.com", isBlocked: false, blockedAt: undefined },
    ]);
  });
});
