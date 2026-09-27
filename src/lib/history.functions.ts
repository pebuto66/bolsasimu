import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const RANGES = {
  "1D": { range: "1d", interval: "5m" },
  "1S": { range: "5d", interval: "30m" },
  "1M": { range: "1mo", interval: "1d" },
  "6M": { range: "6mo", interval: "1d" },
  "1A": { range: "1y", interval: "1wk" },
} as const;

// Read-only price history for the asset detail view (independent of trading logic).
export const fetchHistory = createServerFn({ method: "GET" })
  .inputValidator((d) => z.object({ symbol: z.string().min(1).max(30), range: z.enum(["1D", "1S", "1M", "6M", "1A"]) }).parse(d))
  .handler(async ({ data }) => {
    const r = RANGES[data.range];
    try {
      const res = await fetch(
        `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(data.symbol)}?range=${r.range}&interval=${r.interval}`,
        { headers: { "User-Agent": "Mozilla/5.0" } },
      );
      if (!res.ok) return { points: [] as { t: number; v: number }[], error: `Historial no disponible (${res.status})` };
      const j = (await res.json()) as {
        chart?: { result?: { timestamp?: number[]; indicators?: { quote?: { close?: (number | null)[] }[] } }[] };
      };
      const it = j.chart?.result?.[0];
      const ts = it?.timestamp ?? [];
      const cl = it?.indicators?.quote?.[0]?.close ?? [];
      const points = ts.map((t, i) => ({ t: t * 1000, v: cl[i] })).filter((p): p is { t: number; v: number } => p.v != null);
      return { points, error: points.length ? undefined : "Sin datos históricos" };
    } catch {
      return { points: [] as { t: number; v: number }[], error: "No se pudo cargar el historial" };
    }
  });
