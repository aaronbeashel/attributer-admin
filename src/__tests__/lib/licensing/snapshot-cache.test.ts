import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("@/lib/licensing/entitlement", () => ({ loadSnapshot: vi.fn() }));

import { loadSnapshot, type LicensingSnapshot } from "@/lib/licensing/entitlement";

const snapshot = {} as LicensingSnapshot;

// The cache lives in module scope, so each test gets a fresh copy of the module.
async function freshCache() {
  vi.resetModules();
  return (await import("@/lib/licensing/snapshot-cache")).getHintSnapshot;
}

describe("getHintSnapshot", () => {
  beforeEach(() => {
    vi.mocked(loadSnapshot).mockReset();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("shares one in-flight load between parallel requests", async () => {
    const getHintSnapshot = await freshCache();
    vi.mocked(loadSnapshot).mockResolvedValue(snapshot);

    const [a, b] = await Promise.all([getHintSnapshot({} as never), getHintSnapshot({} as never)]);

    expect(a).toBe(snapshot);
    expect(b).toBe(snapshot);
    expect(loadSnapshot).toHaveBeenCalledTimes(1);
  });

  it("reloads after five minutes", async () => {
    vi.useFakeTimers();
    const getHintSnapshot = await freshCache();
    vi.mocked(loadSnapshot).mockResolvedValue(snapshot);

    await getHintSnapshot({} as never);
    vi.advanceTimersByTime(4 * 60 * 1000);
    await getHintSnapshot({} as never);
    expect(loadSnapshot).toHaveBeenCalledTimes(1);

    vi.advanceTimersByTime(2 * 60 * 1000);
    await getHintSnapshot({} as never);
    expect(loadSnapshot).toHaveBeenCalledTimes(2);
  });

  it("doesn't keep a failed load", async () => {
    const getHintSnapshot = await freshCache();
    vi.mocked(loadSnapshot).mockRejectedValueOnce(new Error("db down")).mockResolvedValueOnce(snapshot);

    await expect(getHintSnapshot({} as never)).rejects.toThrow("db down");
    expect(await getHintSnapshot({} as never)).toBe(snapshot);
    expect(loadSnapshot).toHaveBeenCalledTimes(2);
  });
});
