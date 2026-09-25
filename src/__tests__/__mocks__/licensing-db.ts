// In-memory stand-in for the Supabase client that applies the filters the
// licensing owner lookup uses (eq, in, or with ilike, limit), so tests check
// which rows the real query shape selects. The shared mock ignores filters.

type Row = Record<string, unknown>;

function likeToRegExp(pattern: string): RegExp {
  const escaped = pattern.replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*");
  return new RegExp(`^${escaped}$`, "i");
}

function parseOr(expression: string): Array<(row: Row) => boolean> {
  return expression.split(",").map((part) => {
    const [column, operator, ...rest] = part.split(".");
    const value = rest.join(".");
    if (operator !== "ilike") throw new Error(`fake db: unsupported or() operator ${operator}`);
    const re = likeToRegExp(value);
    return (row: Row) => typeof row[column] === "string" && re.test(row[column] as string);
  });
}

export interface FakeLicensingDb {
  from: (table: string) => unknown;
  queries: Array<{ table: string; or?: string }>;
}

export function createFakeLicensingDb(
  tables: Record<string, Row[]>,
  opts: { failTables?: string[] } = {}
): FakeLicensingDb {
  const queries: FakeLicensingDb["queries"] = [];

  function from(table: string) {
    let rows = [...(tables[table] ?? [])];
    let limit: number | null = null;
    const entry: { table: string; or?: string } = { table };
    queries.push(entry);

    const execute = (single: boolean) => {
      if (opts.failTables?.includes(table)) {
        return Promise.resolve({ data: null, error: { message: `fake failure on ${table}` } });
      }
      const out = limit === null ? rows : rows.slice(0, limit);
      return Promise.resolve({ data: single ? out[0] ?? null : out, error: null });
    };

    const builder = {
      select: () => builder,
      order: () => builder,
      eq: (column: string, value: unknown) => {
        rows = rows.filter((r) => r[column] === value);
        return builder;
      },
      in: (column: string, values: unknown[]) => {
        rows = rows.filter((r) => values.includes(r[column]));
        return builder;
      },
      or: (expression: string) => {
        entry.or = expression;
        const tests = parseOr(expression);
        rows = rows.filter((r) => tests.some((t) => t(r)));
        return builder;
      },
      limit: (n: number) => {
        limit = n;
        return builder;
      },
      maybeSingle: () => execute(true),
      then: (resolve: (v: unknown) => unknown, reject: (e: unknown) => unknown) => execute(false).then(resolve, reject),
    };
    return builder;
  }

  return { from, queries };
}
