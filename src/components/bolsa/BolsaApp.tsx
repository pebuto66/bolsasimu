import { useEffect, useMemo, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Star, Search, Trash2, Pencil, Plus, RefreshCw, AlertTriangle, Settings, Check, X } from "lucide-react";
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  addToWatchlist, createWatchlist, deleteWatchlist, fetchQuotes, getState, recordSnapshot,
  removeFromWatchlist, renameWatchlist, resetSimulation, saveApiKey, searchAssets,
} from "@/lib/bolsa.functions";
import { ALL_ASSETS, CATEGORIES, START_CASH, TICKER_SYMBOLS, TYPE_LABEL } from "@/lib/assets";
import { TradeDialog, type TradeTarget } from "./TradeDialog";
import { fmtMoney, fmtNum, fmtPct, signClass } from "./format";

type Q = { symbol: string; price: number | null; changePct: number | null; currency: string; ok: boolean; error?: string };
type AssetLite = { symbol: string; name: string; type: string };
type PriceInfo = { price: number | null; changePct: number | null; currency: string; stale: boolean; error?: string | undefined };

const DEVICE_KEY = "bolsasim-device-id";
const LAST_KEY = "bolsasim-last-quotes";

function Card({ title, children, right, id }: { title: string; children: React.ReactNode; right?: React.ReactNode; id?: string }) {
  return (
    <section id={id} className="scroll-mt-28 rounded-xl border border-border bg-card p-4 md:p-5">
      <div className="mb-4 flex items-center justify-between gap-2">
        <h2 className="text-base font-semibold tracking-tight">{title}</h2>
        {right}
      </div>
      {children}
    </section>
  );
}

function StaleBadge({ info }: { info: PriceInfo }) {
  if (!info.stale) return null;
  return (
    <span title={info.error ?? "Cotización desactualizada"} className="inline-flex items-center gap-1 rounded bg-warn/15 px-1.5 py-0.5 text-[10px] font-medium text-warn">
      <AlertTriangle className="h-3 w-3" /> desactualizado
    </span>
  );
}

export function BolsaApp() {
  const [deviceId, setDeviceId] = useState<string | null>(null);
  useEffect(() => {
    let id = localStorage.getItem(DEVICE_KEY);
    if (!id) {
      id = crypto.randomUUID();
      localStorage.setItem(DEVICE_KEY, id);
    }
    setDeviceId(id);
  }, []);

  if (!deviceId) {
    return <div className="flex min-h-screen items-center justify-center text-muted-foreground">Cargando BolsaSim…</div>;
  }
  return <Main deviceId={deviceId} setDeviceId={(id) => { localStorage.setItem(DEVICE_KEY, id); setDeviceId(id); }} />;
}

function Main({ deviceId, setDeviceId }: { deviceId: string; setDeviceId: (id: string) => void }) {
  const qc = useQueryClient();
  const getStateFn = useServerFn(getState);
  const quotesFn = useServerFn(fetchQuotes);
  const snapFn = useServerFn(recordSnapshot);

  const state = useQuery({ queryKey: ["state", deviceId], queryFn: () => getStateFn({ data: { deviceId } }) });
  const s = state.data;

  const extraAssets = useMemo<AssetLite[]>(() => {
    const m = new Map<string, AssetLite>();
    s?.positions.forEach((p) => m.set(p.symbol, p));
    s?.watchlists.forEach((l) => l.items.forEach((i) => m.set(i.symbol, i)));
    return [...m.values()];
  }, [s]);
  const symbols = useMemo(
    () => [...new Set([...ALL_ASSETS.map((a) => a.symbol), ...extraAssets.map((a) => a.symbol)])].sort(),
    [extraAssets],
  );

  const quotes = useQuery({
    queryKey: ["quotes", deviceId, symbols.join(",")],
    queryFn: () => quotesFn({ data: { deviceId, symbols } }),
    refetchInterval: 60_000,
    enabled: !!s,
  });

  // last known prices (persist locally so stale values survive reloads)
  const lastKnown = useRef<Record<string, Q>>({});
  const [, force] = useState(0);
  useEffect(() => {
    try { lastKnown.current = JSON.parse(localStorage.getItem(LAST_KEY) ?? "{}"); force((x) => x + 1); } catch { /* ignore */ }
  }, []);
  useEffect(() => {
    if (!quotes.data) return;
    for (const q of Object.values(quotes.data.quotes)) if (q.ok && q.price) lastKnown.current[q.symbol] = q;
    try { localStorage.setItem(LAST_KEY, JSON.stringify(lastKnown.current)); } catch { /* ignore */ }
    if (quotes.data.error) toast.error(`Datos de mercado: ${quotes.data.error}`);
  }, [quotes.data]);

  const fx = quotes.data?.fx ?? { EUR: 1, USD: 1.08 };
  const usdPerEur = fx["USD"] ?? 1.08;

  const info = (symbol: string): PriceInfo => {
    const q = quotes.data?.quotes[symbol];
    if (q?.ok && q.price) return { price: q.price, changePct: q.changePct, currency: q.currency, stale: false };
    const lk = lastKnown.current[symbol] ?? (q?.price ? q : undefined);
    if (lk?.price) return { price: lk.price, changePct: lk.changePct, currency: lk.currency, stale: true, error: q?.error };
    return { price: null, changePct: null, currency: q?.currency ?? "USD", stale: !!quotes.data, error: q?.error };
  };
  const toEur = (v: number, cur: string) => v / (fx[cur] ?? 1);

  const positions = (s?.positions ?? []).map((p) => {
    const i = info(p.symbol);
    const cur = i.price ? i.currency : p.currency;
    let price = i.price ?? p.lastPrice ?? p.avgPrice;
    let stale = i.stale || !i.price;
    let usingCost = false;
    if (!i.price && p.lastPrice == null) usingCost = true;
    const valueEur = usingCost ? p.costEur : toEur(p.quantity * price, cur);
    if (usingCost) price = p.avgPrice;
    const plEur = valueEur - p.costEur;
    return { ...p, price, stale, valueEur, plEur, plUsd: plEur * usdPerEur, plPct: p.costEur ? (plEur / p.costEur) * 100 : 0, cur };
  });
  const invested = positions.reduce((a, p) => a + p.valueEur, 0);
  const cash = s?.cash ?? START_CASH;
  const total = cash + invested;
  const pl = total - START_CASH;

  // snapshot on price refresh
  const lastSnapAt = useRef(0);
  useEffect(() => {
    if (!quotes.data || !s || Date.now() - lastSnapAt.current < 60_000) return;
    lastSnapAt.current = Date.now();
    const prices: Record<string, number> = {};
    s.positions.forEach((p) => {
      const q = quotes.data.quotes[p.symbol];
      if (q?.ok && q.price) prices[p.symbol] = q.price;
    });
    snapFn({ data: { deviceId, prices } }).then((r) => { if (r.recorded) void qc.invalidateQueries({ queryKey: ["state", deviceId] }); }).catch(() => {});
  }, [quotes.data]); // eslint-disable-line react-hooks/exhaustive-deps

  const [target, setTarget] = useState<TradeTarget | null>(null);
  const openBuy = (a: AssetLite) => {
    const i = info(a.symbol);
    setTarget({ ...a, side: "buy", price: i.price, currency: i.currency, stale: i.stale });
  };
  const openSell = (p: (typeof positions)[number]) =>
    setTarget({ symbol: p.symbol, name: p.name, type: p.type, side: "sell", price: p.price, currency: p.cur, stale: p.stale, held: p.quantity });

  const favorites = s?.watchlists.find((w) => w.name === "Favoritos") ?? s?.watchlists[0];
  const favSet = new Set(favorites?.items.map((i) => i.symbol));

  if (state.isError) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-3 p-6 text-center">
        <p>No se pudo cargar tu simulación. Revisa tu conexión.</p>
        <Button onClick={() => state.refetch()}>Reintentar</Button>
      </div>
    );
  }

  return (
    <div className="min-h-screen pb-28">
      <Header cash={cash} usdPerEur={usdPerEur} loading={quotes.isFetching} onRefresh={() => quotes.refetch()}
        ticker={TICKER_SYMBOLS.map((sym) => ({ a: ALL_ASSETS.find((x) => x.symbol === sym)!, i: info(sym) }))} onPick={openBuy} />

      <main className="mx-auto grid max-w-7xl gap-5 px-4 py-5">
        <Summary total={total} usdPerEur={usdPerEur} pl={pl} cash={cash} invested={invested} />

        <Market info={info} onBuy={openBuy} favSet={favSet} favoritesId={favorites?.id} deviceId={deviceId} />

        <div className="grid gap-5 lg:grid-cols-2">
          <AssetSearch deviceId={deviceId} watchlists={s?.watchlists ?? []} onBuy={openBuy} />
          <Watchlists deviceId={deviceId} lists={s?.watchlists ?? []} info={info} onBuy={openBuy} />
        </div>

        <Card title="Mi cartera" id="cartera">
          {positions.length === 0 ? (
            <p className="text-sm text-muted-foreground">Aún no tienes posiciones. Compra tu primer activo desde el mercado.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-left text-xs text-muted-foreground">
                  <tr><th className="py-2 pr-3">Activo</th><th className="pr-3 text-right">Cantidad</th><th className="pr-3 text-right">P. compra</th>
                    <th className="pr-3 text-right">P. actual</th><th className="pr-3 text-right">G/P ($)</th><th className="pr-3 text-right">Valor (€)</th><th /></tr>
                </thead>
                <tbody>
                  {positions.map((p) => (
                    <tr key={p.symbol} className="border-t border-border">
                      <td className="py-2 pr-3"><div className="font-mono font-semibold">{p.symbol}</div><div className="text-xs text-muted-foreground">{p.name}</div></td>
                      <td className="pr-3 text-right font-mono">{fmtNum(p.quantity)}</td>
                      <td className="pr-3 text-right font-mono">{fmtMoney(p.avgPrice, p.currency)}</td>
                      <td className="pr-3 text-right font-mono">{fmtMoney(p.price, p.cur)}{p.stale && <div><StaleBadge info={{ ...info(p.symbol), stale: true }} /></div>}</td>
                      <td className={`pr-3 text-right font-mono ${signClass(p.plUsd)}`}>{fmtMoney(p.plUsd, "USD")}<div className="text-xs">{fmtPct(p.plPct)}</div></td>
                      <td className="pr-3 text-right font-mono">{fmtMoney(p.valueEur)}</td>
                      <td className="text-right"><Button size="sm" variant="destructive" onClick={() => openSell(p)}>Vender</Button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {!!s?.trades.length && (
            <details className="mt-4">
              <summary className="cursor-pointer text-sm text-muted-foreground">Historial de operaciones ({s.trades.length})</summary>
              <ul className="mt-2 space-y-1 text-xs">
                {s.trades.map((t) => (
                  <li key={t.id} className="flex flex-wrap justify-between gap-2 border-t border-border py-1.5">
                    <span><span className={t.side === "buy" ? "text-gain" : "text-loss"}>{t.side === "buy" ? "Compra" : "Venta"}</span> {fmtNum(t.quantity)} {t.symbol} a {fmtMoney(t.price, t.currency)}</span>
                    <span className="text-muted-foreground">{fmtMoney(t.total_eur)} · {new Date(t.created_at).toLocaleString("es-ES")}</span>
                  </li>
                ))}
              </ul>
            </details>
          )}
        </Card>

        <EquityChart points={[...(s?.snapshots ?? []), { t: new Date().toISOString(), v: total }]} />

        <SettingsPanel deviceId={deviceId} hasKey={!!s?.hasKey} setDeviceId={setDeviceId} />
      </main>

      <footer className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-background/95 px-4 py-2 text-center text-[11px] text-muted-foreground backdrop-blur md:text-xs">
        <p>⚠️ Simulador educativo con dinero virtual. No constituye asesoramiento financiero. Las cotizaciones pueden tener retraso respecto al mercado real.</p>
        <p className="mt-1 flex flex-wrap justify-center gap-x-3">
          <a className="text-primary hover:underline" href="https://pepbusquets.com">← pepbusquets.com</a>
          <a className="hover:underline" href="https://pepbusquets.com/politica-de-privacidad">Política de privacidad</a>
          <a className="hover:underline" href="https://pepbusquets.com/aviso-legal">Aviso legal</a>
          <a className="hover:underline" href="https://pepbusquets.com/politica-de-cookies">Política de cookies</a>
        </p>
      </footer>

      <TradeDialog target={target} onClose={() => setTarget(null)} deviceId={deviceId} cash={cash}
        fxRate={target ? fx[target.currency] ?? 1 : 1} />
    </div>
  );
}

function Header({ cash, usdPerEur, ticker, onPick, loading, onRefresh }: {
  cash: number; usdPerEur: number; loading: boolean; onRefresh: () => void;
  ticker: { a: AssetLite; i: PriceInfo }[]; onPick: (a: AssetLite) => void;
}) {
  const items = [...ticker, ...ticker];
  return (
    <header className="sticky top-0 z-30 border-b border-border bg-background/95 backdrop-blur">
      <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3 px-4 py-3">
        <h1 className="text-xl font-bold tracking-tight">📈 BolsaSim</h1>
        <div className="flex items-center gap-4 text-sm">
          <div><span className="text-muted-foreground">Efectivo </span><span className="font-mono font-semibold">{fmtMoney(cash)}</span></div>
          <div className="hidden sm:block"><span className="text-muted-foreground">USD→EUR </span><span className="font-mono">{(1 / usdPerEur).toFixed(4)}</span></div>
          <button onClick={onRefresh} aria-label="Actualizar cotizaciones" className="text-muted-foreground hover:text-foreground">
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
          </button>
        </div>
      </div>
      <div className="ticker-wrap overflow-hidden border-t border-border bg-card">
        <div className="ticker-track flex w-max gap-6 py-1.5">
          {items.map(({ a, i }, idx) => (
            <button key={idx} onClick={() => onPick(a)} className="flex items-center gap-2 whitespace-nowrap text-xs hover:text-primary">
              <span className="font-semibold">{a.name}</span>
              <span className="font-mono">{i.price ? fmtMoney(i.price, i.currency, 2) : "—"}</span>
              <span className={`font-mono ${signClass(i.changePct)}`}>{i.changePct != null ? fmtPct(i.changePct) : ""}</span>
              {i.stale && <AlertTriangle className="h-3 w-3 text-warn" />}
            </button>
          ))}
        </div>
      </div>
    </header>
  );
}

function Summary({ total, usdPerEur, pl, cash, invested }: { total: number; usdPerEur: number; pl: number; cash: number; invested: number }) {
  const pct = (pl / START_CASH) * 100;
  const cards = [
    { label: "Valor total (€)", value: fmtMoney(total), sub: `Efectivo ${fmtMoney(cash)}` },
    { label: "Valor total ($)", value: fmtMoney(total * usdPerEur, "USD"), sub: `Invertido ${fmtMoney(invested)}` },
    { label: "Ganancia / pérdida", value: fmtMoney(pl), cls: signClass(pl), sub: `sobre ${fmtMoney(START_CASH, "EUR", 0)} iniciales` },
    { label: "Rentabilidad", value: fmtPct(pct), cls: signClass(pl), sub: "desde el inicio" },
  ];
  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      {cards.map((c) => (
        <div key={c.label} className="rounded-xl border border-border bg-card p-4">
          <div className="text-xs text-muted-foreground">{c.label}</div>
          <div className={`mt-1 font-mono text-lg font-bold md:text-2xl ${c.cls ?? ""}`}>{c.value}</div>
          <div className="mt-1 text-xs text-muted-foreground">{c.sub}</div>
        </div>
      ))}
    </div>
  );
}

function useAddToList(deviceId: string) {
  const qc = useQueryClient();
  const fn = useServerFn(addToWatchlist);
  const rm = useServerFn(removeFromWatchlist);
  const add = useMutation({
    mutationFn: fn,
    onSuccess: () => { toast.success("Añadido a la lista"); qc.invalidateQueries({ queryKey: ["state", deviceId] }); },
    onError: (e: Error) => toast.error(e.message),
  });
  const remove = useMutation({
    mutationFn: rm,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["state", deviceId] }),
    onError: (e: Error) => toast.error(e.message),
  });
  return { add, remove };
}

function Market({ info, onBuy, favSet, favoritesId, deviceId }: {
  info: (s: string) => PriceInfo; onBuy: (a: AssetLite) => void; favSet: Set<string>; favoritesId?: string | undefined; deviceId: string;
}) {
  const [tab, setTab] = useState(CATEGORIES[0]!.id);
  const { add, remove } = useAddToList(deviceId);
  const cat = CATEGORIES.find((c) => c.id === tab)!;
  return (
    <Card title="Mercado" id="mercado">
      <div className="mb-4 flex gap-2 overflow-x-auto pb-1">
        {CATEGORIES.map((c) => (
          <button key={c.id} onClick={() => setTab(c.id)}
            className={`whitespace-nowrap rounded-full px-4 py-1.5 text-sm transition-colors ${tab === c.id ? "bg-primary text-primary-foreground" : "bg-secondary text-muted-foreground hover:text-foreground"}`}>
            {c.label}
          </button>
        ))}
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        {cat.assets.map((a) => {
          const i = info(a.symbol);
          const fav = favSet.has(a.symbol);
          return (
            <div key={a.symbol} role="button" tabIndex={0} onClick={() => onBuy(a)} onKeyDown={(e) => e.key === "Enter" && onBuy(a)}
              className="group relative cursor-pointer rounded-lg border border-border bg-background p-3 transition-colors hover:border-primary">
              <button aria-label={fav ? "Quitar de favoritos" : "Añadir a favoritos"}
                onClick={(e) => {
                  e.stopPropagation();
                  if (!favoritesId) return;
                  if (fav) remove.mutate({ data: { deviceId, id: favoritesId, symbol: a.symbol } });
                  else add.mutate({ data: { deviceId, id: favoritesId, ...a } });
                }}
                className="absolute right-2 top-2">
                <Star className={`h-4 w-4 ${fav ? "fill-warn text-warn" : "text-muted-foreground hover:text-warn"}`} />
              </button>
              <div className="font-mono text-xs text-muted-foreground">{a.symbol}</div>
              <div className="truncate pr-5 text-sm font-medium">{a.name}</div>
              <div className="mt-2 font-mono text-base font-semibold">{i.price ? fmtMoney(i.price, i.currency, 2) : "—"}</div>
              <div className="flex items-center justify-between gap-1">
                <span className={`font-mono text-xs ${signClass(i.changePct)}`}>{i.changePct != null ? fmtPct(i.changePct) : "sin datos"}</span>
                <StaleBadge info={i} />
              </div>
            </div>
          );
        })}
      </div>
    </Card>
  );
}

function AssetSearch({ deviceId, watchlists, onBuy }: { deviceId: string; watchlists: { id: string; name: string }[]; onBuy: (a: AssetLite) => void }) {
  const [q, setQ] = useState("");
  const [debounced, setDebounced] = useState("");
  useEffect(() => { const t = setTimeout(() => setDebounced(q.trim()), 400); return () => clearTimeout(t); }, [q]);
  const fn = useServerFn(searchAssets);
  const res = useQuery({ queryKey: ["search", debounced], queryFn: () => fn({ data: { q: debounced } }), enabled: debounced.length >= 2, staleTime: 60_000 });
  const { add } = useAddToList(deviceId);
  return (
    <Card title="Buscador de activos" id="buscar">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input className="pl-9" placeholder="Ej. Tesla, Repsol, oro, Bitcoin, VWCE…" value={q} onChange={(e) => setQ(e.target.value)} />
      </div>
      <div className="mt-3 max-h-96 space-y-2 overflow-y-auto">
        {res.isFetching && <p className="text-sm text-muted-foreground">Buscando…</p>}
        {res.data?.error && <p className="text-sm text-loss">{res.data.error}</p>}
        {res.data && !res.data.error && res.data.results.length === 0 && !res.isFetching && <p className="text-sm text-muted-foreground">Sin resultados.</p>}
        {res.data?.results.map((r) => (
          <div key={r.symbol} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border bg-background p-2.5">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2"><span className="font-mono text-sm font-semibold">{r.symbol}</span>
                <span className="rounded bg-secondary px-1.5 text-[10px] text-muted-foreground">{TYPE_LABEL[r.type] ?? r.type}</span>
                {r.market && <span className="text-[10px] text-muted-foreground">{r.market}</span>}</div>
              <div className="truncate text-xs text-muted-foreground">{r.name}</div>
            </div>
            <div className="text-right font-mono text-sm">
              {r.quote?.price ? fmtMoney(r.quote.price, r.quote.currency, 2) : <span className="text-xs text-warn">no disponible</span>}
              {r.quote?.changePct != null && <div className={`text-xs ${signClass(r.quote.changePct)}`}>{fmtPct(r.quote.changePct)}</div>}
            </div>
            <div className="flex gap-1.5">
              <Button size="sm" onClick={() => onBuy(r)}>Comprar</Button>
              <DropdownMenu>
                <DropdownMenuTrigger asChild><Button size="sm" variant="secondary">⭐ Añadir a lista</Button></DropdownMenuTrigger>
                <DropdownMenuContent>
                  <DropdownMenuLabel>Elige una lista</DropdownMenuLabel>
                  {watchlists.map((w) => (
                    <DropdownMenuItem key={w.id} onClick={() => add.mutate({ data: { deviceId, id: w.id, symbol: r.symbol, name: r.name, type: r.type } })}>{w.name}</DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
}

function Watchlists({ deviceId, lists, info, onBuy }: {
  deviceId: string; lists: { id: string; name: string; items: AssetLite[] }[]; info: (s: string) => PriceInfo; onBuy: (a: AssetLite) => void;
}) {
  const qc = useQueryClient();
  const [active, setActive] = useState<string | null>(null);
  const [newName, setNewName] = useState("");
  const [editing, setEditing] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const inval = () => qc.invalidateQueries({ queryKey: ["state", deviceId] });
  const onErr = (e: Error) => toast.error(e.message);
  const create = useMutation({ mutationFn: useServerFn(createWatchlist), onSuccess: (l: { id: string }) => { setNewName(""); setActive(l.id); inval(); }, onError: onErr });
  const rename = useMutation({ mutationFn: useServerFn(renameWatchlist), onSuccess: () => { setEditing(null); inval(); }, onError: onErr });
  const del = useMutation({ mutationFn: useServerFn(deleteWatchlist), onSuccess: () => { setActive(null); inval(); }, onError: onErr });
  const { remove } = useAddToList(deviceId);
  const list = lists.find((l) => l.id === active) ?? lists[0];

  return (
    <Card title="Listas de seguimiento" id="listas">
      <div className="mb-3 flex flex-wrap gap-2">
        {lists.map((l) => (
          <button key={l.id} onClick={() => setActive(l.id)}
            className={`rounded-full px-3 py-1 text-sm ${list?.id === l.id ? "bg-primary text-primary-foreground" : "bg-secondary text-muted-foreground"}`}>
            {l.name} <span className="opacity-70">({l.items.length})</span>
          </button>
        ))}
      </div>
      <form className="mb-3 flex gap-2" onSubmit={(e) => { e.preventDefault(); if (newName.trim()) create.mutate({ data: { deviceId, name: newName.trim() } }); }}>
        <Input placeholder="Nueva lista…" value={newName} onChange={(e) => setNewName(e.target.value)} />
        <Button type="submit" size="icon" aria-label="Crear lista"><Plus className="h-4 w-4" /></Button>
      </form>
      {list && (
        <>
          <div className="mb-2 flex items-center gap-2">
            {editing === list.id ? (
              <form className="flex flex-1 gap-2" onSubmit={(e) => { e.preventDefault(); rename.mutate({ data: { deviceId, id: list.id, name: editName } }); }}>
                <Input value={editName} onChange={(e) => setEditName(e.target.value)} autoFocus />
                <Button size="icon" type="submit" aria-label="Guardar"><Check className="h-4 w-4" /></Button>
                <Button size="icon" type="button" variant="ghost" onClick={() => setEditing(null)} aria-label="Cancelar"><X className="h-4 w-4" /></Button>
              </form>
            ) : (
              <>
                <span className="flex-1 font-medium">{list.name}</span>
                <Button size="icon" variant="ghost" aria-label="Renombrar" onClick={() => { setEditing(list.id); setEditName(list.name); }}><Pencil className="h-4 w-4" /></Button>
                <AlertDialog>
                  <AlertDialogTrigger asChild><Button size="icon" variant="ghost" aria-label="Eliminar lista"><Trash2 className="h-4 w-4 text-loss" /></Button></AlertDialogTrigger>
                  <AlertDialogContent className="bg-card">
                    <AlertDialogHeader><AlertDialogTitle>¿Eliminar “{list.name}”?</AlertDialogTitle>
                      <AlertDialogDescription>Se borrará la lista y sus activos. Tu cartera no se verá afectada.</AlertDialogDescription></AlertDialogHeader>
                    <AlertDialogFooter><AlertDialogCancel>Cancelar</AlertDialogCancel>
                      <AlertDialogAction onClick={() => del.mutate({ data: { deviceId, id: list.id } })}>Eliminar</AlertDialogAction></AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </>
            )}
          </div>
          {list.items.length === 0 ? (
            <p className="text-sm text-muted-foreground">Lista vacía. Añade activos con la estrella o desde el buscador.</p>
          ) : (
            <table className="w-full text-sm">
              <tbody>
                {list.items.map((it) => {
                  const i = info(it.symbol);
                  return (
                    <tr key={it.symbol} className="border-t border-border">
                      <td className="py-2"><div className="font-mono font-semibold">{it.symbol}</div><div className="max-w-[160px] truncate text-xs text-muted-foreground">{it.name}</div></td>
                      <td className="text-right font-mono">{i.price ? fmtMoney(i.price, i.currency, 2) : "—"} <StaleBadge info={i} /></td>
                      <td className={`px-2 text-right font-mono text-xs ${signClass(i.changePct)}`}>{i.changePct != null ? fmtPct(i.changePct) : ""}</td>
                      <td className="whitespace-nowrap text-right">
                        <Button size="sm" onClick={() => onBuy(it)}>Comprar</Button>
                        <Button size="icon" variant="ghost" aria-label="Quitar" onClick={() => remove.mutate({ data: { deviceId, id: list.id, symbol: it.symbol } })}><X className="h-4 w-4" /></Button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </>
      )}
    </Card>
  );
}

function EquityChart({ points }: { points: { t: string; v: number }[] }) {
  const data = points.map((p) => ({ t: new Date(p.t).getTime(), v: Math.round(p.v * 100) / 100 }));
  return (
    <Card title="Evolución del patrimonio" id="evolucion">
      <div className="h-64">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data}>
            <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" />
            <XAxis dataKey="t" type="number" domain={["dataMin", "dataMax"]} scale="time" stroke="var(--muted-foreground)" fontSize={11}
              tickFormatter={(t) => new Date(t).toLocaleDateString("es-ES", { day: "2-digit", month: "short" })} />
            <YAxis stroke="var(--muted-foreground)" fontSize={11} domain={["auto", "auto"]} width={70}
              tickFormatter={(v) => new Intl.NumberFormat("es-ES", { notation: "compact" }).format(v)} />
            <Tooltip contentStyle={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 8 }}
              labelFormatter={(t) => new Date(t as number).toLocaleString("es-ES")} formatter={(v: number) => [fmtMoney(v), "Patrimonio"]} />
            <Line type="monotone" dataKey="v" stroke="var(--primary)" strokeWidth={2} dot={false} />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </Card>
  );
}

function SettingsPanel({ deviceId, hasKey, setDeviceId }: { deviceId: string; hasKey: boolean; setDeviceId: (id: string) => void }) {
  const qc = useQueryClient();
  const [key, setKey] = useState("");
  const [code, setCode] = useState("");
  const save = useMutation({
    mutationFn: useServerFn(saveApiKey),
    onSuccess: () => { setKey(""); toast.success("Clave guardada"); qc.invalidateQueries(); },
    onError: (e: Error) => toast.error(e.message),
  });
  const reset = useMutation({
    mutationFn: useServerFn(resetSimulation),
    onSuccess: () => { toast.success("Simulación reiniciada: 100.000 €"); qc.invalidateQueries(); },
    onError: (e: Error) => toast.error(e.message),
  });
  return (
    <Card title="Ajustes" id="ajustes" right={<Settings className="h-4 w-4 text-muted-foreground" />}>
      <div className="grid gap-6 md:grid-cols-3">
        <div className="space-y-2">
          <h3 className="text-sm font-medium">Clave de API de mercado (opcional)</h3>
          <p className="text-xs text-muted-foreground">
            Los precios se obtienen de fuentes públicas sin clave. Si quieres una fuente de respaldo para acciones de EE. UU., añade tu clave gratuita de{" "}
            <a className="text-primary hover:underline" href="https://finnhub.io/register" target="_blank" rel="noreferrer">Finnhub</a>. Se guarda cifrada en el servidor y nunca se muestra.
          </p>
          <p className="text-xs">Estado: {hasKey ? <span className="text-gain">clave configurada</span> : <span className="text-muted-foreground">sin clave</span>}</p>
          <div className="flex gap-2">
            <Input type="password" placeholder="Tu clave de Finnhub" value={key} onChange={(e) => setKey(e.target.value)} />
            <Button disabled={!key.trim() || save.isPending} onClick={() => save.mutate({ data: { deviceId, key: key.trim() } })}>Guardar</Button>
          </div>
          {hasKey && <Button variant="ghost" size="sm" onClick={() => save.mutate({ data: { deviceId, key: null } })}>Eliminar clave</Button>}
        </div>
        <div className="space-y-2">
          <h3 className="text-sm font-medium">Usar en otro navegador</h3>
          <p className="text-xs text-muted-foreground">Copia este código y pégalo en otro navegador o dispositivo para continuar con la misma cartera.</p>
          <div className="flex gap-2">
            <Input readOnly value={deviceId} className="font-mono text-xs" />
            <Button variant="secondary" onClick={() => { navigator.clipboard.writeText(deviceId); toast.success("Código copiado"); }}>Copiar</Button>
          </div>
          <div className="flex gap-2">
            <Input placeholder="Pegar código" value={code} onChange={(e) => setCode(e.target.value)} className="font-mono text-xs" />
            <Button variant="secondary" onClick={() => {
              const c = code.trim();
              if (!/^[0-9a-f-]{36}$/i.test(c)) { toast.error("Código no válido"); return; }
              setDeviceId(c); setCode(""); toast.success("Cartera cargada");
            }}>Cargar</Button>
          </div>
        </div>
        <div className="space-y-2">
          <h3 className="text-sm font-medium">Reiniciar simulación</h3>
          <p className="text-xs text-muted-foreground">Vuelve a 100.000 € y borra posiciones e historial. Tus listas se conservan.</p>
          <AlertDialog>
            <AlertDialogTrigger asChild><Button variant="destructive">Reiniciar</Button></AlertDialogTrigger>
            <AlertDialogContent className="bg-card">
              <AlertDialogHeader><AlertDialogTitle>¿Reiniciar la simulación?</AlertDialogTitle>
                <AlertDialogDescription>Se borrarán todas tus posiciones y el historial. Esta acción no se puede deshacer.</AlertDialogDescription></AlertDialogHeader>
              <AlertDialogFooter><AlertDialogCancel>Cancelar</AlertDialogCancel>
                <AlertDialogAction onClick={() => reset.mutate({ data: { deviceId } })}>Reiniciar</AlertDialogAction></AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      </div>
    </Card>
  );
}
