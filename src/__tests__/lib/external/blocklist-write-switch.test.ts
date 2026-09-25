import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { blockDomain, unblockDomain } from "@/lib/external/blocklist";

// fetch is always stubbed here, so even a broken switch can't reach the licensing server.
const fetchMock = vi.fn();

describe("LICENSING_SERVER_WRITES switch", () => {
  beforeEach(() => {
    fetchMock.mockReset();
    fetchMock.mockResolvedValue(new Response("{}", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    vi.spyOn(console, "warn").mockImplementation(() => {});
  });

  afterEach(() => {
    delete process.env.LICENSING_SERVER_WRITES;
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("blockDomain sends nothing and reports disabled when writes are disabled", async () => {
    process.env.LICENSING_SERVER_WRITES = "disabled";
    expect(await blockDomain("acme.com", "test")).toEqual({ success: false, reason: "disabled" });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(console.warn).toHaveBeenCalledTimes(1);
  });

  it("unblockDomain sends nothing and reports disabled when writes are disabled", async () => {
    process.env.LICENSING_SERVER_WRITES = "disabled";
    expect(await unblockDomain("acme.com")).toEqual({ success: false, reason: "disabled" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("sends as normal when the switch isn't set", async () => {
    expect(await blockDomain("acme.com", "test")).toEqual({ success: true });
    expect(await unblockDomain("acme.com")).toEqual({ success: true });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[0][0]).toContain("/block");
    expect(fetchMock.mock.calls[1][0]).toContain("/unblock");
  });
});
