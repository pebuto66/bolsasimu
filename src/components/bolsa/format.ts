export const fmtMoney = (v: number, cur = "EUR", digits?: number) => {
  const d = digits ?? (v !== 0 && Math.abs(v) < 1 ? 4 : 2);
  try {
    return new Intl.NumberFormat("es-ES", { style: "currency", currency: cur, minimumFractionDigits: d, maximumFractionDigits: d }).format(v);
  } catch {
    return `${v.toFixed(d)} ${cur}`;
  }
};
export const fmtNum = (v: number, d = 4) => new Intl.NumberFormat("es-ES", { maximumFractionDigits: d }).format(v);
export const fmtPct = (v: number) => `${v >= 0 ? "+" : ""}${v.toFixed(2)}%`;
export const signClass = (v: number | null | undefined) =>
  v == null ? "text-muted-foreground" : v >= 0 ? "text-gain" : "text-loss";
