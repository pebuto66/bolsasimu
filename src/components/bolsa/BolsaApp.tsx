import { useEffect, useMemo, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  Star, Search, Trash2, Pencil, Plus, RefreshCw, AlertTriangle, Settings, Check, X, Moon, Sun,
  Briefcase, LineChart as LineIcon, List, TrendingUp, TrendingDown, Wallet,
} from "lucide-react";
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import {
  addToWatchlist, createWatchlist, deleteWatchlist, fetchQuotes, getState, recordSnapshot,
  removeFromWatchlist, renameWatchlist, resetSimulation, saveApiKey, searchAssets,
} from "@/lib/bolsa.functions";
import { fetchHistory } from "@/lib/history.functions";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable";
import { ALL_ASSETS, CATEGORIES, START_CASH, TICKER_SYMBOLS, TYPE_LABEL } from "@/lib/assets";
import { TradeDialog, type TradeTarget } from "./TradeDialog";
import { fmtMoney, fmtNum, fmtPct, signClass } from "./format";

type Q = { symbol: string; price: number | null; changePct: number | null; currency: string; ok: boolean; error?: string };
type AssetLite = { symbol: string; name: string; type: string };
type PriceInfo = { price: number | null; changePct: number | null; currency: string; stale: boolean; error?: string | undefined };

const DEVICE_KEY = "bolsasim-device-id";
const LAST_KEY = "bolsasim-last-quotes";

function Card({ title, children, right, id, className = "" }: { title?: string; children: React.ReactNode; right?: React.ReactNode; id?: string; className?: string }) {
  return (
    <section id={id} className={`scroll-mt-40 rounded-3xl bg-card p-5 shadow-card md:p-6 ${className}`}>
      {title && (
        <div className="mb-5 flex items-center justify-between gap-2">
          <h2 className="text-lg font-bold tracking-tight">{title}</h2>
          {right}
        </div>
      )}
      {children}
    </section>
  );
}

function StaleBadge({ info }: { info: PriceInfo }) {
  if (!info.stale) return null;
  return (
    <span title={info.error ?? "Cotización desactualizada"} className="inline-flex items-center gap-1 rounded-full bg-warn/15 px-2 py-0.5 text-[10px] font-medium text-warn">
      <AlertTriangle className="h-3 w-3" /> desactualizado
    </span>
  );
}

function ChangePill({ pct, size = "sm" }: { pct: number | null | undefined; size?: "sm" | "lg" }) {
  if (pct == null) return <span className="text-xs text-muted-foreground">sin datos</span>;
  const up = pct >= 0;
  return (
    <span className={`inline-flex items-center gap-1 rounded-full font-semibold ${up ? "bg-gain/12 text-gain" : "bg-loss/12 text-loss"} ${size === "lg" ? "px-3 py-1 text-sm" : "px-2 py-0.5 text-xs"}`}>
      {up ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}{fmtPct(pct)}
    </span>
  );
}

const hue = (s: string) => [...s].reduce((a, c) => (a * 31 + c.charCodeAt(0)) % 360, 7);
const logoUrl = (a: AssetLite) =>
  a.type === "stock" && /^[A-Z.]+$/.test(a.symbol) && !a.symbol.includes(".")
    ? `https://financialmodelingprep.com/image-stock/${a.symbol}.png` : null;

function AssetIcon({ a, size = 40 }: { a: AssetLite; size?: number }) {
  const [err, setErr] = useState(false);
  const url = logoUrl(a);
  const label = a.symbol.replace(/[\^=]/g, "").replace(/-USD$/, "").slice(0, a.type === "crypto" ? 3 : 2);
  const h = hue(a.symbol);
  return (
    <span className="relative inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full text-[11px] font-bold"
      style={{ width: size, height: size, background: `oklch(0.9 0.06 ${h} / 0.35)`, color: `oklch(0.5 0.14 ${h})` }}>
      {url && !err ? <img src={url} alt="" loading="lazy" onError={() => setErr(true)} className="h-full w-full bg-card object-contain p-1.5" /> : label}
    </span>
  );
}

function useTheme() {
  const [dark, setDark] = useState(false);
  useEffect(() => setDark(document.documentElement.classList.contains("dark")), []);
  const toggle = () => {
    const d = !dark;
    document.documentElement.classList.toggle("dark", d);
    localStorage.setItem("bolsasim-theme", d ? "dark" : "light");
    setDark(d);
  };
  return { dark, toggle };
}

export function BolsaApp() {
  const [userId, setUserId] = useState<string | null | undefined>(undefined);
  const qc = useQueryClient();
  useEffect(() => {
    void DEVICE_KEY;
    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      setUserId(session?.user.id ?? null);
      if (event === "SIGNED_OUT") qc.clear();
    });
    supabase.auth.getUser().then(({ data }) => setUserId(data.user?.id ?? null));
    return () => sub.subscription.unsubscribe();
  }, [qc]);

  if (userId === undefined) {
    return <div className="flex min-h-screen items-center justify-center text-muted-foreground">Cargando BolsaSim…</div>;
  }
  if (!userId) return <AuthScreen />;
  return <Main deviceId={userId} setDeviceId={() => { void supabase.auth.signOut(); }} />;
}

function AuthScreen() {
  const [mode, setMode] = useState<"in" | "up">("in");
  const [email, setEmail] = useState("");
  const [pw, setPw] = useState("");
  const [busy, setBusy] = useState(false);
  const google = async () => {
    const r = await lovable.auth.signInWithOAuth("google", { redirect_uri: window.location.origin });
    if (r.error) toast.error("No se pudo iniciar sesión con Google");
  };
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    if (mode === "in") {
      const { error } = await supabase.auth.signInWithPassword({ email, password: pw });
      if (error) toast.error("Correo o contraseña incorrectos");
    } else {
      const { data, error } = await supabase.auth.signUp({ email, password: pw, options: { emailRedirectTo: window.location.origin } });
      if (error) toast.error(error.message);
      else if (!data.session) toast.success("Revisa tu correo para confirmar la cuenta");
    }
    setBusy(false);
  };
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="w-full max-w-sm space-y-5 rounded-2xl border border-border bg-card p-6">
        <div className="text-center">
          <h1 className="text-2xl font-bold">📈 BolsaSim</h1>
          <p className="mt-1 text-sm text-muted-foreground">Simulador educativo con 100.000 € virtuales. Inicia sesión para guardar tu cartera.</p>
        </div>
        <Button variant="secondary" className="w-full" onClick={google}>Continuar con Google</Button>
        <div className="text-center text-xs text-muted-foreground">o con tu correo</div>
        <form className="space-y-3" onSubmit={submit}>
          <Input type="email" required placeholder="tu@correo.com" value={email} onChange={(e) => setEmail(e.target.value)} />
          <Input type="password" required minLength={6} placeholder="Contraseña" value={pw} onChange={(e) => setPw(e.target.value)} />
          <Button type="submit" className="w-full" disabled={busy}>{mode === "in" ? "Iniciar sesión" : "Crear cuenta"}</Button>
        </form>
        <button className="w-full text-center text-sm text-primary" onClick={() => setMode(mode === "in" ? "up" : "in")}>
          {mode === "in" ? "¿No tienes cuenta? Regístrate" : "¿Ya tienes cuenta? Inicia sesión"}
        </button>
      </div>
    </div>
  );
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

  const [detail, setDetail] = useState<AssetLite | null>(null);
  const dayEur = positions.reduce((a, p) => {
    const c = info(p.symbol).changePct;
    return c == null || p.stale ? a : a + (p.valueEur - p.valueEur / (1 + c / 100));
  }, 0);
  const dayPct = total - dayEur ? (dayEur / (total - dayEur)) * 100 : 0;
  const plPct = (pl / START_CASH) * 100;

  return (
    <div className="min-h-screen pb-28">
      <Header total={total} dayEur={dayEur} dayPct={dayPct} loading={quotes.isFetching} onRefresh={() => quotes.refetch()} />

      <main className="mx-auto grid max-w-7xl gap-6 px-4 py-6">
        <section className="grid gap-4 lg:grid-cols-3">
          <div className="grid gap-4">
            <Card>
              <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground"><Wallet className="h-4 w-4" /> Valor total</div>
              <div className="mt-2 text-4xl font-extrabold tracking-tight md:text-5xl">{fmtMoney(total)}</div>
              <div className="mt-1 text-sm text-muted-foreground">{fmtMoney(total * usdPerEur, "USD")} · 1 $ = {(1 / usdPerEur).toFixed(4)} €</div>
              <div className="mt-5 grid grid-cols-2 gap-3 text-sm">
                <div className="rounded-2xl bg-secondary p-3"><div className="text-xs text-muted-foreground">Efectivo</div><div className="mt-0.5 font-semibold">{fmtMoney(cash)}</div></div>
                <div className="rounded-2xl bg-secondary p-3"><div className="text-xs text-muted-foreground">Invertido</div><div className="mt-0.5 font-semibold">{fmtMoney(invested)}</div></div>
              </div>
            </Card>
            <Card>
              <div className="text-sm font-medium text-muted-foreground">Ganancia / pérdida total</div>
              <div className="mt-2 flex flex-wrap items-center gap-3">
                <span className={`text-3xl font-extrabold tracking-tight ${signClass(pl)}`}>{pl >= 0 ? "+" : ""}{fmtMoney(pl)}</span>
                <ChangePill pct={plPct} size="lg" />
              </div>
              <div className="mt-1 text-xs text-muted-foreground">sobre {fmtMoney(START_CASH, "EUR", 0)} iniciales · {fmtMoney(pl * usdPerEur, "USD")}</div>
            </Card>
          </div>
          <EquityChart className="lg:col-span-2" points={[...(s?.snapshots ?? []), { t: new Date().toISOString(), v: total }]} up={pl >= 0} />
        </section>

        <Ticker items={TICKER_SYMBOLS.map((sym) => ({ a: ALL_ASSETS.find((x) => x.symbol === sym)!, i: info(sym) }))} onPick={setDetail} />

        <Market info={info} onOpen={setDetail} favSet={favSet} favoritesId={favorites?.id} deviceId={deviceId} />

        <Card title="Mi cartera" id="cartera" right={<span className="text-sm text-muted-foreground">{positions.length} posiciones</span>}>
          {positions.length === 0 ? (
            <p className="text-sm text-muted-foreground">Aún no tienes posiciones. Compra tu primer activo desde el mercado.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-left text-xs text-muted-foreground">
                  <tr><th className="pb-3 pr-3 font-medium">Activo</th><th className="pr-3 text-right font-medium">Cantidad</th><th className="pr-3 text-right font-medium">P. compra</th>
                    <th className="pr-3 text-right font-medium">P. actual</th><th className="pr-3 text-right font-medium">G/P ($)</th><th className="pr-3 text-right font-medium">Valor (€)</th><th /></tr>
                </thead>
                <tbody>
                  {positions.map((p) => (
                    <tr key={p.symbol} className="cursor-pointer border-t border-border/60 transition-colors hover:bg-secondary/60" onClick={() => setDetail(p)}>
                      <td className="py-3 pr-3"><div className="flex items-center gap-3"><AssetIcon a={p} size={36} />
                        <div className="min-w-0"><div className="font-semibold">{p.symbol}</div><div className="max-w-[180px] truncate text-xs text-muted-foreground">{p.name}</div></div></div></td>
                      <td className="pr-3 text-right tabular-nums">{fmtNum(p.quantity)}</td>
                      <td className="pr-3 text-right tabular-nums">{fmtMoney(p.avgPrice, p.currency)}</td>
                      <td className="pr-3 text-right tabular-nums">{fmtMoney(p.price, p.cur)}{p.stale && <div><StaleBadge info={{ ...info(p.symbol), stale: true }} /></div>}</td>
                      <td className={`pr-3 text-right font-semibold tabular-nums ${signClass(p.plUsd)}`}>{fmtMoney(p.plUsd, "USD")}<div className="text-xs font-normal">{fmtPct(p.plPct)}</div></td>
                      <td className="pr-3 text-right font-semibold tabular-nums">{fmtMoney(p.valueEur)}</td>
                      <td className="text-right"><Button size="sm" variant="secondary" className="rounded-full" onClick={(e) => { e.stopPropagation(); openSell(p); }}>Vender</Button></td>
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
                  <li key={t.id} className="flex flex-wrap justify-between gap-2 border-t border-border/60 py-2">
                    <span><span className={`font-semibold ${t.side === "buy" ? "text-gain" : "text-loss"}`}>{t.side === "buy" ? "Compra" : "Venta"}</span> {fmtNum(t.quantity)} {t.symbol} a {fmtMoney(t.price, t.currency)}</span>
                    <span className="text-muted-foreground">{fmtMoney(t.total_eur)} · {new Date(t.created_at).toLocaleString("es-ES")}</span>
                  </li>
                ))}
              </ul>
            </details>
          )}
        </Card>

        <div className="grid gap-6 lg:grid-cols-2">
          <Watchlists deviceId={deviceId} lists={s?.watchlists ?? []} info={info} onBuy={openBuy} onOpen={setDetail} />
          <AssetSearch deviceId={deviceId} watchlists={s?.watchlists ?? []} onBuy={openBuy} />
        </div>

        <SettingsPanel deviceId={deviceId} hasKey={!!s?.hasKey} setDeviceId={setDeviceId} />
      </main>

      <footer className="fixed inset-x-0 bottom-0 z-40 border-t border-border/60 bg-background/90 px-4 py-2 text-center text-[11px] text-muted-foreground backdrop-blur-xl md:text-xs">
        <p>⚠️ Simulador educativo con dinero virtual. No constituye asesoramiento financiero. Las cotizaciones pueden tener retraso respecto al mercado real.</p>
        <p className="mt-1 flex flex-wrap justify-center gap-x-3">
          <a className="font-medium text-primary hover:underline" href="https://pepbusquets.com">← pepbusquets.com</a>
          <a className="hover:underline" href="https://pepbusquets.com/politica-de-privacidad">Política de privacidad</a>
          <a className="hover:underline" href="https://pepbusquets.com/aviso-legal">Aviso legal</a>
          <a className="hover:underline" href="https://pepbusquets.com/politica-de-cookies">Política de cookies</a>
        </p>
      </footer>

      <AssetDetail asset={detail} info={detail ? info(detail.symbol) : null} onClose={() => setDetail(null)}
        position={detail ? positions.find((p) => p.symbol === detail.symbol) : undefined}
        fav={detail ? favSet.has(detail.symbol) : false} favoritesId={favorites?.id} deviceId={deviceId}
        onBuy={(a) => { setDetail(null); openBuy(a); }}
        onSell={(p) => { setDetail(null); openSell(p as (typeof positions)[number]); }} />

      <TradeDialog target={target} onClose={() => setTarget(null)} deviceId={deviceId} cash={cash}
        fxRate={target ? fx[target.currency] ?? 1 : 1} />
    </div>
  );
}

function Header({ total, dayEur, dayPct, loading, onRefresh }: { total: number; dayEur: number; dayPct: number; loading: boolean; onRefresh: () => void }) {
  const { dark, toggle } = useTheme();
  const links = [
    { href: "#cartera", label: "Cartera", icon: Briefcase },
    { href: "#mercado", label: "Mercado", icon: LineIcon },
    { href: "#listas", label: "Watchlists", icon: List },
  ];
  return (
    <header className="sticky top-0 z-30 border-b border-border/60 bg-background/85 backdrop-blur-xl">
      <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-x-6 gap-y-3 px-4 py-3">
        <div className="flex items-center gap-2">
          <span className="flex h-9 w-9 items-center justify-center rounded-full bg-primary text-primary-foreground"><TrendingUp className="h-5 w-5" /></span>
          <span className="text-lg font-extrabold tracking-tight">BolsaSim</span>
        </div>
        <div className="flex items-baseline gap-3">
          <span className="text-2xl font-extrabold tracking-tight md:text-3xl">{fmtMoney(total)}</span>
          <span className={`text-sm font-semibold ${signClass(dayEur)}`}>{dayEur >= 0 ? "+" : ""}{fmtMoney(dayEur)} ({fmtPct(dayPct)}) hoy</span>
        </div>
        <nav className="ml-auto flex items-center gap-1">
          {links.map((l) => (
            <a key={l.href} href={l.href} className="flex items-center gap-1.5 rounded-full px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground">
              <l.icon className="h-4 w-4" /><span className="hidden sm:inline">{l.label}</span>
            </a>
          ))}
          <a href="#ajustes" aria-label="Ajustes" className="rounded-full p-2 text-muted-foreground hover:bg-secondary hover:text-foreground"><Settings className="h-4 w-4" /></a>
          <button onClick={onRefresh} aria-label="Actualizar cotizaciones" className="rounded-full p-2 text-muted-foreground hover:bg-secondary hover:text-foreground">
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
          </button>
          <button onClick={toggle} aria-label="Cambiar tema" className="rounded-full p-2 text-muted-foreground hover:bg-secondary hover:text-foreground">
            {dark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
          </button>
        </nav>
      </div>
    </header>
  );
}

function Ticker({ items, onPick }: { items: { a: AssetLite; i: PriceInfo }[]; onPick: (a: AssetLite) => void }) {
  const all = [...items, ...items];
  return (
    <div className="ticker-wrap overflow-hidden rounded-full bg-card shadow-card">
      <div className="ticker-track flex w-max gap-3 px-2 py-2">
        {all.map(({ a, i }, idx) => (
          <button key={idx} onClick={() => onPick(a)} className="flex items-center gap-2 whitespace-nowrap rounded-full px-3 py-1 text-xs transition-colors hover:bg-secondary">
            <AssetIcon a={a} size={22} />
            <span className="font-semibold">{a.name}</span>
            <span className="tabular-nums text-muted-foreground">{i.price ? fmtMoney(i.price, i.currency, 2) : "—"}</span>
            <span className={`font-semibold tabular-nums ${signClass(i.changePct)}`}>{i.changePct != null ? fmtPct(i.changePct) : ""}</span>
            {i.stale && <AlertTriangle className="h-3 w-3 text-warn" />}
          </button>
        ))}
      </div>
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

function Market({ info, onOpen, favSet, favoritesId, deviceId }: {
  info: (s: string) => PriceInfo; onOpen: (a: AssetLite) => void; favSet: Set<string>; favoritesId?: string | undefined; deviceId: string;
}) {
  const [tab, setTab] = useState(CATEGORIES[0]!.id);
  const { add, remove } = useAddToList(deviceId);
  const cat = CATEGORIES.find((c) => c.id === tab)!;
  return (
    <Card title="Mercado" id="mercado">
      <div className="mb-5 flex gap-2 overflow-x-auto pb-1">
        {CATEGORIES.map((c) => (
          <button key={c.id} onClick={() => setTab(c.id)}
            className={`whitespace-nowrap rounded-full px-4 py-2 text-sm font-semibold transition-colors ${tab === c.id ? "bg-foreground text-background" : "bg-secondary text-muted-foreground hover:text-foreground"}`}>
            {c.label}
          </button>
        ))}
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {cat.assets.map((a) => {
          const i = info(a.symbol);
          const fav = favSet.has(a.symbol);
          return (
            <div key={a.symbol} role="button" tabIndex={0} onClick={() => onOpen(a)} onKeyDown={(e) => e.key === "Enter" && onOpen(a)}
              className="group relative cursor-pointer rounded-2xl bg-secondary/60 p-4 transition-all hover:-translate-y-0.5 hover:bg-card hover:shadow-card">
              <button aria-label={fav ? "Quitar de favoritos" : "Añadir a favoritos"}
                onClick={(e) => {
                  e.stopPropagation();
                  if (!favoritesId) return;
                  if (fav) remove.mutate({ data: { deviceId, id: favoritesId, symbol: a.symbol } });
                  else add.mutate({ data: { deviceId, id: favoritesId, ...a } });
                }}
                className="absolute right-3 top-3">
                <Star className={`h-4 w-4 ${fav ? "fill-warn text-warn" : "text-muted-foreground hover:text-warn"}`} />
              </button>
              <div className="flex items-center gap-3 pr-6">
                <AssetIcon a={a} />
                <div className="min-w-0"><div className="truncate text-sm font-bold">{a.name}</div><div className="text-xs text-muted-foreground">{a.symbol}</div></div>
              </div>
              <div className="mt-4 flex items-end justify-between gap-2">
                <div className="text-lg font-bold tabular-nums">{i.price ? fmtMoney(i.price, i.currency, 2) : "—"}</div>
                <ChangePill pct={i.changePct} />
              </div>
              {i.stale && <div className="mt-2"><StaleBadge info={i} /></div>}
            </div>
          );
        })}
      </div>
    </Card>
  );
}

const RANGES = ["1D", "1S", "1M", "6M", "1A"] as const;

function AssetDetail({ asset, info, onClose, position, fav, favoritesId, deviceId, onBuy, onSell }: {
  asset: AssetLite | null; info: PriceInfo | null; onClose: () => void; position?: { quantity: number; valueEur: number; plEur: number; plPct: number } | undefined;
  fav: boolean; favoritesId?: string | undefined; deviceId: string; onBuy: (a: AssetLite) => void; onSell: (p: unknown) => void;
}) {
  const [range, setRange] = useState<(typeof RANGES)[number]>("1M");
  const fn = useServerFn(fetchHistory);
  const hist = useQuery({
    queryKey: ["history", asset?.symbol, range],
    queryFn: () => fn({ data: { symbol: asset!.symbol, range } }),
    enabled: !!asset, staleTime: 5 * 60_000,
  });
  const { add, remove } = useAddToList(deviceId);
  if (!asset || !info) return null;
  const pts = hist.data?.points ?? [];
  const up = pts.length > 1 ? pts[pts.length - 1]!.v >= pts[0]!.v : (info.changePct ?? 0) >= 0;
  const rangePct = pts.length > 1 ? ((pts[pts.length - 1]!.v - pts[0]!.v) / pts[0]!.v) * 100 : null;
  const color = up ? "var(--gain)" : "var(--loss)";
  const market = asset.symbol.includes(".") ? asset.symbol.split(".").pop() : asset.type === "crypto" ? "Cripto 24/7" : asset.symbol.startsWith("^") ? "Índice" : asset.symbol.endsWith("=F") ? "Futuros" : "EE. UU.";

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[92vh] max-w-3xl gap-0 overflow-hidden rounded-3xl border-0 bg-card p-0 shadow-card">
        <div className="max-h-[calc(92vh-80px)] overflow-y-auto p-6">
          <div className="flex items-center gap-4 pr-8">
            <AssetIcon a={asset} size={52} />
            <div className="min-w-0">
              <DialogTitle className="truncate text-xl font-extrabold">{asset.name}</DialogTitle>
              <DialogDescription>{asset.symbol} · {TYPE_LABEL[asset.type] ?? asset.type}</DialogDescription>
            </div>
            {favoritesId && (
              <button aria-label="Favorito" className="ml-auto rounded-full p-2 hover:bg-secondary"
                onClick={() => fav ? remove.mutate({ data: { deviceId, id: favoritesId, symbol: asset.symbol } }) : add.mutate({ data: { deviceId, id: favoritesId, ...asset } })}>
                <Star className={`h-5 w-5 ${fav ? "fill-warn text-warn" : "text-muted-foreground"}`} />
              </button>
            )}
          </div>
          <div className="mt-5 flex flex-wrap items-end gap-3">
            <span className="text-4xl font-extrabold tracking-tight">{info.price ? fmtMoney(info.price, info.currency, 2) : "—"}</span>
            <ChangePill pct={info.changePct} size="lg" />
            <StaleBadge info={info} />
          </div>
          <div className="mt-5 h-64">
            {hist.isLoading ? <div className="h-full animate-pulse rounded-2xl bg-secondary" /> :
              pts.length < 2 ? <div className="flex h-full items-center justify-center rounded-2xl bg-secondary text-sm text-muted-foreground">{hist.data?.error ?? "Sin datos históricos"}</div> : (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={pts} margin={{ top: 5, right: 0, left: 0, bottom: 0 }}>
                  <defs><linearGradient id="detailFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={color} stopOpacity={0.3} /><stop offset="100%" stopColor={color} stopOpacity={0} />
                  </linearGradient></defs>
                  <XAxis dataKey="t" hide type="number" domain={["dataMin", "dataMax"]} />
                  <YAxis hide domain={["auto", "auto"]} />
                  <Tooltip contentStyle={{ background: "var(--popover)", border: "none", borderRadius: 12, boxShadow: "var(--card-shadow)" }}
                    labelFormatter={(t) => new Date(t as number).toLocaleString("es-ES")} formatter={(v: number) => [fmtMoney(v, info.currency, 2), "Precio"]} />
                  <Area type="monotone" dataKey="v" stroke={color} strokeWidth={2.5} fill="url(#detailFill)" dot={false} />
                </AreaChart>
              </ResponsiveContainer>
            )}
          </div>
          <div className="mt-3 flex gap-1">
            {RANGES.map((r) => (
              <button key={r} onClick={() => setRange(r)} className={`rounded-full px-3 py-1 text-xs font-semibold ${range === r ? "bg-foreground text-background" : "text-muted-foreground hover:bg-secondary"}`}>{r}</button>
            ))}
            {rangePct != null && <span className={`ml-auto self-center text-xs font-semibold ${signClass(rangePct)}`}>{fmtPct(rangePct)} en el periodo</span>}
          </div>
          <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
            {[
              ["Precio", info.price ? fmtMoney(info.price, info.currency, 2) : "—"],
              ["Variación 24h", info.changePct != null ? fmtPct(info.changePct) : "—"],
              ["Tipo de activo", TYPE_LABEL[asset.type] ?? asset.type],
              ["Mercado", `${market} · ${info.currency}`],
            ].map(([k, v]) => (
              <div key={k} className="rounded-2xl bg-secondary p-3"><div className="text-xs text-muted-foreground">{k}</div><div className="mt-0.5 truncate font-semibold">{v}</div></div>
            ))}
          </div>
          {position && (
            <div className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-2xl bg-accent p-4 text-sm text-accent-foreground">
              <span>Tienes <b>{fmtNum(position.quantity)}</b> unidades · {fmtMoney(position.valueEur)}</span>
              <span className="font-semibold">{position.plEur >= 0 ? "+" : ""}{fmtMoney(position.plEur)} ({fmtPct(position.plPct)})</span>
            </div>
          )}
        </div>
        <div className="flex gap-3 border-t border-border/60 bg-card p-4">
          {position && <Button variant="secondary" className="h-12 flex-1 rounded-full text-base font-bold" onClick={() => onSell(position)}>Vender</Button>}
          <Button className="h-12 flex-1 rounded-full text-base font-bold" onClick={() => onBuy(asset)}>Comprar</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function EquityChart({ points, up, className = "" }: { points: { t: string; v: number }[]; up: boolean; className?: string }) {
  const data = points.map((p) => ({ t: new Date(p.t).getTime(), v: Math.round(p.v * 100) / 100 }));
  const color = up ? "var(--gain)" : "var(--loss)";
  return (
    <Card title="Evolución del patrimonio" id="evolucion" className={`flex flex-col ${className}`}>
      <div className="min-h-64 flex-1">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data} margin={{ top: 5, right: 5, left: 0, bottom: 0 }}>
            <defs><linearGradient id="equityFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={color} stopOpacity={0.3} /><stop offset="100%" stopColor={color} stopOpacity={0} />
            </linearGradient></defs>
            <XAxis dataKey="t" type="number" domain={["dataMin", "dataMax"]} scale="time" stroke="var(--muted-foreground)" fontSize={11} tickLine={false} axisLine={false}
              tickFormatter={(t) => new Date(t).toLocaleDateString("es-ES", { day: "2-digit", month: "short" })} />
            <YAxis stroke="var(--muted-foreground)" fontSize={11} domain={["auto", "auto"]} width={56} tickLine={false} axisLine={false} orientation="right"
              tickFormatter={(v) => new Intl.NumberFormat("es-ES", { notation: "compact" }).format(v)} />
            <Tooltip contentStyle={{ background: "var(--popover)", border: "none", borderRadius: 12, boxShadow: "var(--card-shadow)" }}
              labelFormatter={(t) => new Date(t as number).toLocaleString("es-ES")} formatter={(v: number) => [fmtMoney(v), "Patrimonio"]} />
            <Area type="monotone" dataKey="v" stroke={color} strokeWidth={2.5} fill="url(#equityFill)" dot={false} />
          </AreaChart>
        </ResponsiveContainer>
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
          <div key={r.symbol} className="flex flex-wrap items-center justify-between gap-2 rounded-2xl bg-secondary/60 p-3">
            <AssetIcon a={r} size={36} />
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2"><span className="text-sm font-semibold">{r.symbol}</span>
                <span className="rounded bg-secondary px-1.5 text-[10px] text-muted-foreground">{TYPE_LABEL[r.type] ?? r.type}</span>
                {r.market && <span className="text-[10px] text-muted-foreground">{r.market}</span>}</div>
              <div className="truncate text-xs text-muted-foreground">{r.name}</div>
            </div>
            <div className="text-right text-sm">
              {r.quote?.price ? fmtMoney(r.quote.price, r.quote.currency, 2) : <span className="text-xs text-warn">no disponible</span>}
              {r.quote?.changePct != null && <div className={`text-xs ${signClass(r.quote.changePct)}`}>{fmtPct(r.quote.changePct)}</div>}
            </div>
            <div className="flex gap-1.5">
              <Button size="sm" className="rounded-full" onClick={() => onBuy(r)}>Comprar</Button>
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

function Watchlists({ deviceId, lists, info, onBuy, onOpen }: {
  deviceId: string; lists: { id: string; name: string; items: AssetLite[] }[]; info: (s: string) => PriceInfo; onBuy: (a: AssetLite) => void; onOpen: (a: AssetLite) => void;
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
            className={`rounded-full px-3 py-1.5 text-sm font-semibold ${list?.id === l.id ? "bg-foreground text-background" : "bg-secondary text-muted-foreground"}`}>
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
                    <tr key={it.symbol} className="border-t border-border/60">
                      <td className="cursor-pointer py-3" onClick={() => onOpen(it)}><div className="flex items-center gap-3"><AssetIcon a={it} size={32} /><div className="min-w-0"><div className="font-semibold">{it.symbol}</div><div className="max-w-[140px] truncate text-xs text-muted-foreground">{it.name}</div></div></div></td>
                      <td className="text-right">{i.price ? fmtMoney(i.price, i.currency, 2) : "—"} <StaleBadge info={i} /></td>
                      <td className={`px-2 text-right text-xs ${signClass(i.changePct)}`}>{i.changePct != null ? fmtPct(i.changePct) : ""}</td>
                      <td className="whitespace-nowrap text-right">
                        <Button size="sm" className="rounded-full" onClick={() => onBuy(it)}>Comprar</Button>
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
            <a className="text-primary hover:underline" href="https://finnhub.io/register" target="_blank" rel="noreferrer">Finnhub</a>. Se guarda de forma privada en el servidor y nunca se vuelve a mostrar.
          </p>
          <p className="text-xs">Estado: {hasKey ? <span className="text-gain">clave configurada</span> : <span className="text-muted-foreground">sin clave</span>}</p>
          <div className="flex gap-2">
            <Input type="password" placeholder="Tu clave de Finnhub" value={key} onChange={(e) => setKey(e.target.value)} />
            <Button disabled={!key.trim() || save.isPending} onClick={() => save.mutate({ data: { deviceId, key: key.trim() } })}>Guardar</Button>
          </div>
          {hasKey && <Button variant="ghost" size="sm" onClick={() => save.mutate({ data: { deviceId, key: null } })}>Eliminar clave</Button>}
        </div>
        <div className="space-y-2">
          <h3 className="text-sm font-medium">Tu cuenta</h3>
          <p className="text-xs text-muted-foreground">Tu cartera se guarda en tu cuenta y la verás en cualquier dispositivo al iniciar sesión.</p>
          <Button variant="secondary" onClick={() => { void code; setDeviceId(""); }}>Cerrar sesión</Button>
        </div>
        <div className="space-y-2">
          <h3 className="text-sm font-medium">Reiniciar simulación</h3>
          <p className="text-xs text-muted-foreground">Vuelve a 100.000 € y borra posiciones e historial. Tus listas se conservan.</p>
          <AlertDialog>
            <AlertDialogTrigger asChild><Button variant="destructive" className="rounded-full">Reiniciar</Button></AlertDialogTrigger>
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
