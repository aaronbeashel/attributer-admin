export interface CsvRow {
  domain: string;
  callCount: number;
  [key: string]: string | number;
}

export function parseCSV(csvText: string): CsvRow[] {
  const lines = csvText.trim().split("\n");
  if (lines.length === 0) return [];

  const headers = lines[0].split(",").map((h) => h.trim().toLowerCase());
  const domainIndex = headers.findIndex((h) => h.includes("domain") || h.includes("url") || h.includes("site"));
  const countIndex = headers.findIndex((h) => h.includes("count") || h.includes("calls") || h.includes("hits") || h.includes("requests"));

  // If headers found, parse with header row
  if (domainIndex !== -1) {
    if (lines.length < 2) return [];
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

  // No recognized headers — treat as headerless CSV (domain,count)
  // Check if first line looks like data (second column is a number)
  const firstCols = lines[0].split(",").map((c) => c.trim());
  if (firstCols.length >= 2 && !isNaN(parseInt(firstCols[1], 10))) {
    const rows: CsvRow[] = [];
    for (const line of lines) {
      const cols = line.split(",").map((c) => c.trim());
      const domain = cols[0];
      if (!domain) continue;
      const callCount = parseInt(cols[1], 10) || 0;
      rows.push({ domain, callCount });
    }
    return rows;
  }

  return [];
}
