export type Quote = {
  symbol: string;
  price: number | null;
  changePct: number | null;
  currency: string;
  ok: boolean;
  error?: string;
};

const UA = "Mozilla/5.0 (compatible; BolsaSim/1.0)";
const cache = new Map<string, { q: Quote; at: number }>();
const TTL = 45_000;

async function fetchYahoo(symbol: string): Promise<Quote> {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?range=1d&interval=1d`;
  const res = await fetch(url, { headers: { "User-Agent": UA } });
  if (res.status === 429) throw new Error("Límite de peticiones alcanzado");
  if (!res.ok) throw new Error(`Activo no disponible (${res.status})`);
  const json = (await res.json()) as {
    chart?: { result?: { meta: Record<string, unknown> }[]; error?: { description?: string } };
  };
  const meta = json.chart?.result?.[0]?.meta;
  if (!meta) throw new Error(json.chart?.error?.description ?? "Sin datos");
  let price = Number(meta["regularMarketPrice"]);
  let prev = Number(meta["chartPreviousClose"] ?? meta["previousClose"]);
  let currency = String(meta["currency"] ?? "USD");
  if (currency === "GBp" || currency === "GBX") {
    price /= 100;
    prev /= 100;
    currency = "GBP";
  }
  if (!isFinite(price)) throw new Error("Precio no disponible");
  const cp = Number(meta["regularMarketChangePercent"]);
  const changePct = isFinite(cp) ? cp : isFinite(prev) && prev ? ((price - prev) / prev) * 100 : null;
  return { symbol, price, changePct, currency, ok: true };
}

async function fetchFinnhub(symbol: string, key: string): Promise<Quote> {
  const res = await fetch(
    `https://finnhub.io/api/v1/quote?symbol=${encodeURIComponent(symbol)}&token=${encodeURIComponent(key)}`,
  );
  if (res.status === 429) throw new Error("Límite de peticiones de tu clave alcanzado");
  if (res.status === 401 || res.status === 403) throw new Error("Activo no incluido en tu plan gratuito");
  if (!res.ok) throw new Error(`Error del proveedor (${res.status})`);
  const j = (await res.json()) as { c?: number; dp?: number };
  if (!j.c) throw new Error("Activo no disponible");
  return { symbol, price: j.c, changePct: j.dp ?? null, currency: "USD", ok: true };
}

export async function getQuote(symbol: string, finnhubKey?: string | null): Promise<Quote> {
  const hit = cache.get(symbol);
  if (hit && Date.now() - hit.at < TTL) return hit.q;
  let error = "Error de red";
  try {
    const q = await fetchYahoo(symbol);
    cache.set(symbol, { q, at: Date.now() });
    return q;
  } catch (e) {
    error = e instanceof Error ? e.message : error;
  }
  if (finnhubKey && /^[A-Z.]+$/.test(symbol) && !symbol.includes(".")) {
    try {
      const q = await fetchFinnhub(symbol, finnhubKey);
      cache.set(symbol, { q, at: Date.now() });
      return q;
    } catch (e) {
      error = e instanceof Error ? e.message : error;
    }
  }
  if (hit) return { ...hit.q, ok: false, error };
  return { symbol, price: null, changePct: null, currency: "USD", ok: false, error };
}

export async function getQuotes(symbols: string[], key?: string | null) {
  const out: Record<string, Quote> = {};
  const list = [...new Set(symbols)].slice(0, 120);
  for (let i = 0; i < list.length; i += 15) {
    const chunk = list.slice(i, i + 15);
    const qs = await Promise.all(chunk.map((s) => getQuote(s, key)));
    qs.forEach((q) => (out[q.symbol] = q));
  }
  return out;
}

/** Returns units of each currency per 1 EUR. */
export async function getFx(currencies: string[]): Promise<Record<string, number>> {
  const fx: Record<string, number> = { EUR: 1 };
  const need = [...new Set(["USD", ...currencies])].filter((c) => c !== "EUR");
  await Promise.all(
    need.map(async (c) => {
      const q = await getQuote(`EUR${c}=X`);
      if (q.price) fx[c] = q.price;
    }),
  );
  const missing = need.filter((c) => !fx[c]);
  if (missing.length) {
    try {
      const r = await fetch(`https://api.frankfurter.app/latest?from=EUR&to=${missing.join(",")}`);
      const j = (await r.json()) as { rates?: Record<string, number> };
      Object.assign(fx, j.rates ?? {});
    } catch {
      /* ignore */
    }
  }
  if (!fx["USD"]) fx["USD"] = 1.08;
  return fx;
}

export type SearchResult = {
  symbol: string;
  name: string;
  type: string;
  market: string;
};

export async function searchYahoo(q: string): Promise<SearchResult[]> {
  const res = await fetch(
    `https://query1.finance.yahoo.com/v1/finance/search?q=${encodeURIComponent(q)}&quotesCount=12&newsCount=0`,
    { headers: { "User-Agent": UA } },
  );
  if (res.status === 429) throw new Error("Límite de peticiones alcanzado. Espera unos segundos.");
  if (!res.ok) throw new Error("El buscador no está disponible ahora mismo.");
  const j = (await res.json()) as {
    quotes?: { symbol?: string; shortname?: string; longname?: string; quoteType?: string; exchDisp?: string }[];
  };
  const map: Record<string, string> = {
    EQUITY: "stock",
    ETF: "etf",
    CRYPTOCURRENCY: "crypto",
    FUTURE: "commodity",
    INDEX: "index",
    MUTUALFUND: "etf",
  };
  return (j.quotes ?? [])
    .filter((x) => x.symbol && x.quoteType && map[x.quoteType])
    .map((x) => ({
      symbol: x.symbol!,
      name: x.longname ?? x.shortname ?? x.symbol!,
      type: map[x.quoteType!]!,
      market: x.exchDisp ?? "",
    }));
}
