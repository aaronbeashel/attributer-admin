import type { SupabaseClient } from "@supabase/supabase-js";

const PAGE_SIZE = 1000;

type SelectQuery = ReturnType<ReturnType<SupabaseClient["from"]>["select"]>;

class IncompleteReadError extends Error {}

async function readAllOnce<T>(
  supabase: SupabaseClient,
  table: string,
  columns: string,
  filter: (query: SelectQuery) => SelectQuery
): Promise<T[]> {
  const rows: T[] = [];
  let expected: number | null = null;

  for (let offset = 0; ; offset += PAGE_SIZE) {
    const query = filter(supabase.from(table).select(columns, offset === 0 ? { count: "exact" } : undefined));
    const { data, error, count } = await query.order("id").range(offset, offset + PAGE_SIZE - 1);

    if (error) {
      throw new Error(`Failed to load ${table}: ${error.message ?? String(error)}`);
    }
    if (offset === 0) expected = count ?? null;

    const page = (data ?? []) as T[];
    rows.push(...page);
    if (page.length < PAGE_SIZE) break;
  }

  if (expected === null || rows.length !== expected) {
    throw new IncompleteReadError(
      `Incomplete read of ${table}: loaded ${rows.length} rows, expected ${expected ?? "unknown"}`
    );
  }

  return rows;
}

/**
 * Read every row of a table (optionally filtered). Supabase REST silently caps
 * a request at 1,000 rows, so page by id until a short page, and compare
 * against the exact count from the first page. A row added or removed during
 * the read makes the count disagree, so the whole read is retried once. Any
 * query error, or a second short read, throws, so callers never decide
 * anything from partial data.
 */
export async function loadAllRows<T>(
  supabase: SupabaseClient,
  table: string,
  columns: string,
  filter: (query: SelectQuery) => SelectQuery = (query) => query
): Promise<T[]> {
  try {
    return await readAllOnce<T>(supabase, table, columns, filter);
  } catch (err) {
    if (!(err instanceof IncompleteReadError)) throw err;
    console.warn(`[load-all] ${err.message}, retrying once`);
    return await readAllOnce<T>(supabase, table, columns, filter);
  }
}
