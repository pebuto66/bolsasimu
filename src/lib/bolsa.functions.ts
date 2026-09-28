import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { getFx, getQuote, getQuotes, searchYahoo } from "./market.server";

const START = 100000;
const assetSchema = { symbol: z.string().min(1).max(30), name: z.string().min(1).max(200), type: z.string().max(20) };

async function db() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

async function ensure(deviceId: string) {
  const s = await db();
  const { data } = await s.from("portfolios").select("*").eq("device_id", deviceId).maybeSingle();
  if (data) return data;
  const { data: created, error } = await s
    .from("portfolios")
    .upsert({ device_id: deviceId, cash_eur: START }, { onConflict: "device_id" })
    .select()
    .single();
  if (error) throw new Error("No se pudo crear la simulación");
  await s.from("watchlists").insert({ device_id: deviceId, name: "Favoritos" });
  await s.from("equity_snapshots").insert({ device_id: deviceId, value_eur: START });
  return created;
}

async function snapshot(deviceId: string) {
  const s = await db();
  const [{ data: p }, { data: pos }] = await Promise.all([
    s.from("portfolios").select("cash_eur").eq("device_id", deviceId).single(),
    s.from("positions").select("*").eq("device_id", deviceId),
  ]);
  const fx = await getFx((pos ?? []).map((x) => x.currency));
  let v = Number(p?.cash_eur ?? 0);
  for (const x of pos ?? []) {
    const price = Number(x.last_price ?? x.avg_price);
    v += (Number(x.quantity) * price) / (fx[x.currency] ?? 1);
  }
  await s.from("equity_snapshots").insert({ device_id: deviceId, value_eur: v });
}

export const getState = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ deviceId: z.string().optional() }).parse(d))
  .handler(async ({ data, context }) => {
    const p = await ensure(context.userId);
    const s = await db();
    const [pos, trades, snaps, lists] = await Promise.all([
      s.from("positions").select("*").eq("device_id", context.userId).order("symbol"),
      s.from("trades").select("*").eq("device_id", context.userId).order("created_at", { ascending: false }).limit(50),
      s.from("equity_snapshots").select("value_eur, created_at").eq("device_id", context.userId).order("created_at").limit(1000),
      s.from("watchlists").select("id, name, created_at, watchlist_items(id, symbol, name, type)").eq("device_id", context.userId).order("created_at"),
    ]);
    return {
      cash: Number(p.cash_eur),
      hasKey: !!p.finnhub_key,
      positions: (pos.data ?? []).map((x) => ({
        symbol: x.symbol,
        name: x.name,
        type: x.type,
        currency: x.currency,
        quantity: Number(x.quantity),
        avgPrice: Number(x.avg_price),
        costEur: Number(x.cost_eur),
        lastPrice: x.last_price == null ? null : Number(x.last_price),
      })),
      trades: (trades.data ?? []).map((t) => ({ ...t, quantity: Number(t.quantity), price: Number(t.price), total_eur: Number(t.total_eur) })),
      snapshots: (snaps.data ?? []).map((x) => ({ t: x.created_at, v: Number(x.value_eur) })),
      watchlists: (lists.data ?? []).map((l) => ({ id: l.id, name: l.name, items: l.watchlist_items ?? [] })),
    };
  });

export const fetchQuotes = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ deviceId: z.string().optional(), symbols: z.array(z.string().max(30)).max(150) }).parse(d))
  .handler(async ({ data, context }) => {
    let key: string | null = null;
    {
      const s = await db();
      const { data: p } = await s.from("portfolios").select("finnhub_key").eq("device_id", context.userId).maybeSingle();
      key = p?.finnhub_key ?? null;
    }
    try {
      const quotes = await getQuotes(data.symbols, key);
      const fx = await getFx(Object.values(quotes).map((q) => q.currency));
      return { quotes, fx, error: null as string | null };
    } catch (e) {
      return { quotes: {}, fx: { EUR: 1, USD: 1.08 } as Record<string, number>, error: e instanceof Error ? e.message : "Error de red" };
    }
  });

export const searchAssets = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ q: z.string().min(1).max(60) }).parse(d))
  .handler(async ({ data, context }) => {
    try {
      const results = await searchYahoo(data.q);
      const quotes = await getQuotes(results.map((r) => r.symbol));
      return { results: results.map((r) => ({ ...r, quote: quotes[r.symbol] ?? null })), error: null as string | null };
    } catch (e) {
      return { results: [], error: e instanceof Error ? e.message : "Error de red" };
    }
  });

export const trade = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        deviceId: z.string().optional(),
        ...assetSchema,
        side: z.enum(["buy", "sell"]),
        quantity: z.number().positive().optional(),
        amountEur: z.number().positive().optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const p = await ensure(context.userId);
    const s = await db();
    const q = await getQuote(data.symbol, p.finnhub_key);
    if (!q.ok || !q.price) throw new Error(`No hay cotización actual para ${data.symbol} (${q.error ?? "sin datos"}). Inténtalo más tarde.`);
    const fx = await getFx([q.currency]);
    const rate = fx[q.currency];
    if (!rate) throw new Error("No se pudo obtener el tipo de cambio.");
    const priceEur = q.price / rate;
    const qty = data.quantity ?? (data.amountEur ? data.amountEur / priceEur : 0);
    if (!qty || qty <= 0) throw new Error("Cantidad no válida");
    const total = qty * priceEur;
    const cash = Number(p.cash_eur);
    const { data: pos } = await s.from("positions").select("*").eq("device_id", context.userId).eq("symbol", data.symbol).maybeSingle();

    if (data.side === "buy") {
      if (total > cash + 0.005) throw new Error(`Saldo insuficiente: necesitas ${total.toFixed(2)} € y tienes ${cash.toFixed(2)} €.`);
      if (pos) {
        const nq = Number(pos.quantity) + qty;
        await s.from("positions").update({
          quantity: nq,
          avg_price: (Number(pos.quantity) * Number(pos.avg_price) + qty * q.price) / nq,
          cost_eur: Number(pos.cost_eur) + total,
          last_price: q.price,
          last_price_at: new Date().toISOString(),
        }).eq("id", pos.id);
      } else {
        await s.from("positions").insert({
          device_id: context.userId, symbol: data.symbol, name: data.name, type: data.type,
          currency: q.currency, quantity: qty, avg_price: q.price, cost_eur: total,
          last_price: q.price, last_price_at: new Date().toISOString(),
        });
      }
      await s.from("portfolios").update({ cash_eur: cash - total }).eq("device_id", context.userId);
    } else {
      if (!pos) throw new Error("No tienes posición en este activo.");
      const pq = Number(pos.quantity);
      if (qty > pq * 1.000001) throw new Error(`Solo tienes ${pq} unidades.`);
      const sellQty = Math.min(qty, pq);
      const proceeds = sellQty * priceEur;
      if (pq - sellQty < 1e-9) await s.from("positions").delete().eq("id", pos.id);
      else
        await s.from("positions").update({
          quantity: pq - sellQty,
          cost_eur: Number(pos.cost_eur) * (1 - sellQty / pq),
          last_price: q.price,
          last_price_at: new Date().toISOString(),
        }).eq("id", pos.id);
      await s.from("portfolios").update({ cash_eur: cash + proceeds }).eq("device_id", context.userId);
    }
    await s.from("trades").insert({
      device_id: context.userId, symbol: data.symbol, name: data.name, side: data.side,
      quantity: qty, price: q.price, currency: q.currency, total_eur: total,
    });
    await snapshot(context.userId);
    return { ok: true, quantity: qty, price: q.price, currency: q.currency, totalEur: total };
  });

export const recordSnapshot = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({ deviceId: z.string().optional(), prices: z.record(z.string(), z.number().positive()) }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const s = await db();
    const { data: last } = await s.from("equity_snapshots").select("created_at").eq("device_id", context.userId).order("created_at", { ascending: false }).limit(1).maybeSingle();
    for (const [symbol, price] of Object.entries(data.prices)) {
      await s.from("positions").update({ last_price: price, last_price_at: new Date().toISOString() }).eq("device_id", context.userId).eq("symbol", symbol);
    }
    if (last && Date.now() - new Date(last.created_at).getTime() < 5 * 60_000) return { recorded: false };
    await snapshot(context.userId);
    return { recorded: true };
  });

async function ownsList(deviceId: string, id: string) {
  const s = await db();
  const { data } = await s.from("watchlists").select("id").eq("id", id).eq("device_id", deviceId).maybeSingle();
  if (!data) throw new Error("Lista no encontrada");
}

export const createWatchlist = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ deviceId: z.string().optional(), name: z.string().trim().min(1).max(60) }).parse(d))
  .handler(async ({ data, context }) => {
    await ensure(context.userId);
    const s = await db();
    const { data: l, error } = await s.from("watchlists").insert({ device_id: context.userId, name: data.name }).select("id").single();
    if (error) throw new Error("No se pudo crear la lista");
    return l;
  });

export const renameWatchlist = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ deviceId: z.string().optional(), id: z.string().uuid(), name: z.string().trim().min(1).max(60) }).parse(d))
  .handler(async ({ data, context }) => {
    await ownsList(context.userId, data.id);
    await (await db()).from("watchlists").update({ name: data.name }).eq("id", data.id);
    return { ok: true };
  });

export const deleteWatchlist = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ deviceId: z.string().optional(), id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await ownsList(context.userId, data.id);
    await (await db()).from("watchlists").delete().eq("id", data.id);
    return { ok: true };
  });

export const addToWatchlist = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ deviceId: z.string().optional(), id: z.string().uuid(), ...assetSchema }).parse(d))
  .handler(async ({ data, context }) => {
    await ownsList(context.userId, data.id);
    await (await db()).from("watchlist_items").upsert(
      { watchlist_id: data.id, symbol: data.symbol, name: data.name, type: data.type },
      { onConflict: "watchlist_id,symbol" },
    );
    return { ok: true };
  });

export const removeFromWatchlist = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ deviceId: z.string().optional(), id: z.string().uuid(), symbol: z.string().max(30) }).parse(d))
  .handler(async ({ data, context }) => {
    await ownsList(context.userId, data.id);
    await (await db()).from("watchlist_items").delete().eq("watchlist_id", data.id).eq("symbol", data.symbol);
    return { ok: true };
  });

export const saveApiKey = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ deviceId: z.string().optional(), key: z.string().trim().max(200).nullable() }).parse(d))
  .handler(async ({ data, context }) => {
    await ensure(context.userId);
    await (await db()).from("portfolios").update({ finnhub_key: data.key || null }).eq("device_id", context.userId);
    return { ok: true };
  });

export const resetSimulation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ deviceId: z.string().optional() }).parse(d))
  .handler(async ({ data, context }) => {
    const s = await db();
    await ensure(context.userId);
    await Promise.all([
      s.from("positions").delete().eq("device_id", context.userId),
      s.from("trades").delete().eq("device_id", context.userId),
      s.from("equity_snapshots").delete().eq("device_id", context.userId),
    ]);
    await s.from("portfolios").update({ cash_eur: START }).eq("device_id", context.userId);
    await s.from("equity_snapshots").insert({ device_id: context.userId, value_eur: START });
    return { ok: true };
  });
