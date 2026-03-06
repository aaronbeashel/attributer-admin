export interface CsvRow {
  domain: string;
  callCount: number;
  [key: string]: string | number;
}

export function parseCSV(csvText: string): CsvRow[] {
  const lines = csvText.trim().split("\n");
  if (lines.length < 2) return [];

  const headers = lines[0].split(",").map((h) => h.trim().toLowerCase());
  const domainIndex = headers.findIndex((h) => h.includes("domain") || h.includes("url") || h.includes("site"));
  const countIndex = headers.findIndex((h) => h.includes("count") || h.includes("calls") || h.includes("hits") || h.includes("requests"));

  if (domainIndex === -1) return [];

  const rows: CsvRow[] = [];
  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].split(",").map((c) => c.trim());
    const domain = cols[domainIndex];
    if (!domain) continue;

    const callCount = countIndex >= 0 ? parseInt(cols[countIndex], 10) || 0 : 0;
    rows.push({ domain, callCount });
  }

  return rows;
}
