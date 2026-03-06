export interface DataPoint {
  date: string;
  value: number;
}

export function toCumulative(data: DataPoint[]): DataPoint[] {
  let total = 0;
  return data.map((d) => {
    total += d.value;
    return { date: d.date, value: total };
  });
}

export function computeChange(current: number, previous: number): { value: number; formatted: string; positive: boolean } {
  if (previous === 0) {
    return { value: 0, formatted: "—", positive: true };
  }
  const change = ((current - previous) / previous) * 100;
  return {
    value: change,
    formatted: `${change >= 0 ? "+" : ""}${change.toFixed(1)}%`,
    positive: change >= 0,
  };
}

export function getDaysInMonth(year: number, month: number): number {
  return new Date(year, month + 1, 0).getDate();
}

export function generateDailyDates(year: number, month: number): string[] {
  const days = getDaysInMonth(year, month);
  return Array.from({ length: days }, (_, i) => {
    const d = new Date(year, month, i + 1);
    return d.toISOString().split("T")[0];
  });
}
