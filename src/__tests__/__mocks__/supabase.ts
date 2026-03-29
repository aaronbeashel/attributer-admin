import { vi } from "vitest";

interface MockResult {
  data: unknown;
  error: unknown;
  count?: number;
}

export function createMockSupabaseChain(result: MockResult = { data: null, error: null }) {
  const chain: Record<string, ReturnType<typeof vi.fn>> = {
    select: vi.fn().mockReturnThis(),
    insert: vi.fn().mockReturnThis(),
    update: vi.fn().mockReturnThis(),
    delete: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    in: vi.fn().mockReturnThis(),
    or: vi.fn().mockReturnThis(),
    not: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    range: vi.fn().mockReturnThis(),
    single: vi.fn().mockResolvedValue(result),
  };

  // Make the chain itself thenable (for queries without .single())
  const thenableChain = new Proxy(chain, {
    get(target, prop) {
      if (prop === "then") {
        return (resolve: (value: MockResult) => void) => resolve(result);
      }
      return target[prop as string];
    },
  });

  return thenableChain;
}

export function createMockSupabaseClient() {
  const chains: Map<string, ReturnType<typeof createMockSupabaseChain>> = new Map();

  return {
    from: vi.fn((table: string) => {
      if (!chains.has(table)) {
        chains.set(table, createMockSupabaseChain());
      }
      return chains.get(table)!;
    }),
    // Helper to set return value for a specific table
    _setResult(table: string, result: MockResult) {
      chains.set(table, createMockSupabaseChain(result));
    },
  };
}
