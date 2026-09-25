import type { SupabaseClient } from "@supabase/supabase-js";

const PAGE_SIZE = 1000;

/**
 * Read every row of a table. Supabase REST silently caps a request at 1,000
 * rows, so page by id until a short page, and compare against the exact count
 * from the first page. Any query error or a short read throws, so callers never
 * decide anything from partial data.
 */
export async function loadAllRows<T>(
  supabase: SupabaseClient,
  table: string,
  columns: string
): Promise<T[]> {
  const rows: T[] = [];
  let expected: number | null = null;

  for (let offset = 0; ; offset += PAGE_SIZE) {
    const { data, error, count } = await supabase
      .from(table)
      .select(columns, offset === 0 ? { count: "exact" } : undefined)
      .order("id")
      .range(offset, offset + PAGE_SIZE - 1);

    if (error) {
      throw new Error(`Failed to load ${table}: ${error.message ?? String(error)}`);
    }
    if (offset === 0) expected = count ?? null;

    const page = (data ?? []) as T[];
    rows.push(...page);
    if (page.length < PAGE_SIZE) break;
  }

  if (expected === null || rows.length !== expected) {
    throw new Error(`Incomplete read of ${table}: loaded ${rows.length} rows, expected ${expected ?? "unknown"}`);
  }

  return rows;
}
