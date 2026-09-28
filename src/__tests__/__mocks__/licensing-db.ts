// In-memory stand-in for the Supabase client that applies the filters the
// licensing owner lookup uses (eq, neq, is, in, or with ilike, limit, range,
// exact count), so tests check which rows the real query shape selects. The
// shared mock ignores filters. update() changes the stored rows that match its
// filters (returning them when .select() is chained) and insert() adds rows,
// so later reads see the writes. Every write attempt is recorded in `writes`.

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

export interface FakeWrite {
  table: string;
  op: "update" | "insert";
  values: Row | Row[];
  /** For updates: the rows the filters matched when it ran (after the write). */
  matched?: Row[];
}

export interface FakeLicensingDb {
  from: (table: string) => unknown;
  queries: Array<{ table: string; or?: string }>;
  writes: FakeWrite[];
  /** The live rows of a table, including anything written. */
  rows: (table: string) => Row[];
}

export function createFakeLicensingDb(
  tables: Record<string, ReadonlyArray<object>>,
  opts: { failTables?: string[]; failWrites?: string[] } = {}
): FakeLicensingDb {
  const queries: FakeLicensingDb["queries"] = [];
  const writes: FakeWrite[] = [];
  const store = new Map<string, Row[]>();
  for (const [name, list] of Object.entries(tables)) {
    store.set(name, list.map((row) => ({ ...(row as Row) })));
  }
  const tableRows = (name: string) => {
    if (!store.has(name)) store.set(name, []);
    return store.get(name)!;
  };

  function from(table: string) {
    let rows = [...tableRows(table)];
    let limit: number | null = null;
    let range: [number, number] | null = null;
    let withCount = false;
    let pendingUpdate: Row | null = null;
    let pendingInsert: Row[] | null = null;
    let returnRows = false;
    const entry: { table: string; or?: string } = { table };
    queries.push(entry);

    const failure = () => Promise.resolve({ data: null, error: { message: `fake failure on ${table}` }, count: null });

    const execute = (single: boolean) => {
      if (pendingInsert) {
        writes.push({ table, op: "insert", values: pendingInsert.length === 1 ? pendingInsert[0] : pendingInsert });
        if (opts.failTables?.includes(table) || opts.failWrites?.includes(table)) return failure();
        const added = pendingInsert.map((row) => ({ ...row }));
        tableRows(table).push(...added);
        const data = returnRows ? (single ? added[0] ?? null : added) : null;
        return Promise.resolve({ data, error: null, count: null });
      }
      if (pendingUpdate) {
        const write: FakeWrite = { table, op: "update", values: pendingUpdate };
        writes.push(write);
        if (opts.failTables?.includes(table) || opts.failWrites?.includes(table)) return failure();
        for (const row of rows) Object.assign(row, pendingUpdate);
        write.matched = rows.map((row) => ({ ...row }));
        const data = returnRows ? (single ? write.matched[0] ?? null : write.matched) : null;
        return Promise.resolve({ data, error: null, count: null });
      }
      if (opts.failTables?.includes(table)) return failure();
      let out = limit === null ? rows : rows.slice(0, limit);
      if (range) out = out.slice(range[0], range[1] + 1);
      out = out.map((row) => ({ ...row }));
      return Promise.resolve({ data: single ? out[0] ?? null : out, error: null, count: withCount ? rows.length : null });
    };

    const builder = {
      select: (_columns?: string, options?: { count?: string }) => {
        if (pendingUpdate || pendingInsert) returnRows = true;
        withCount = options?.count === "exact";
        return builder;
      },
      update: (values: Row) => {
        pendingUpdate = values;
        return builder;
      },
      insert: (values: Row | Row[]) => {
        pendingInsert = Array.isArray(values) ? values : [values];
        return builder;
      },
      order: (column: string) => {
        rows = [...rows].sort((a, b) => String(a[column]).localeCompare(String(b[column])));
        return builder;
      },
      range: (from: number, to: number) => {
        range = [from, to];
        return builder;
      },
      eq: (column: string, value: unknown) => {
        rows = rows.filter((r) => r[column] === value);
        return builder;
      },
      neq: (column: string, value: unknown) => {
        rows = rows.filter((r) => r[column] !== value);
        return builder;
      },
      is: (column: string, value: null | boolean) => {
        rows = rows.filter((r) => (r[column] ?? null) === value);
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

  return { from, queries, writes, rows: tableRows };
}
