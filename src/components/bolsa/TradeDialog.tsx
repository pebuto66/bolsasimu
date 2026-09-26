import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { trade } from "@/lib/bolsa.functions";
import { fmtMoney, fmtNum } from "./format";

export type TradeTarget = {
  symbol: string;
  name: string;
  type: string;
  side: "buy" | "sell";
  price: number | null;
  currency: string;
  stale: boolean;
  held?: number;
};

export function TradeDialog({
  target, onClose, deviceId, cash, fxRate,
}: { target: TradeTarget | null; onClose: () => void; deviceId: string; cash: number; fxRate: number }) {
  const [mode, setMode] = useState<"amount" | "qty">("amount");
  const [value, setValue] = useState("");
  const qc = useQueryClient();
  const tradeFn = useServerFn(trade);
  const m = useMutation({
    mutationFn: tradeFn,
    onSuccess: (r) => {
      toast.success(`${target?.side === "buy" ? "Compra" : "Venta"} realizada: ${fmtNum(r.quantity)} × ${fmtMoney(r.price, r.currency)}`);
      qc.invalidateQueries({ queryKey: ["state"] });
      setValue("");
      onClose();
    },
    onError: (e: Error) => toast.error(e.message || "No se pudo completar la operación"),
  });
  if (!target) return null;
  const num = parseFloat(value.replace(",", "."));
  const priceEur = target.price ? target.price / fxRate : null;
  const qty = !num || !priceEur ? 0 : mode === "qty" ? num : num / priceEur;
  const totalEur = priceEur ? qty * priceEur : 0;
  const insufficient = target.side === "buy" && totalEur > cash;
  const tooMany = target.side === "sell" && target.held != null && qty > target.held * 1.000001;

  const submit = () => {
    if (!qty || insufficient || tooMany) return;
    m.mutate({
      data: {
        deviceId, symbol: target.symbol, name: target.name, type: target.type, side: target.side,
        ...(mode === "qty" ? { quantity: num } : { amountEur: num }),
      },
    });
  };

  return (
    <Dialog open={!!target} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="bg-card">
        <DialogHeader>
          <DialogTitle>{target.side === "buy" ? "Comprar" : "Vender"} {target.symbol}</DialogTitle>
          <DialogDescription>{target.name}</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">Precio actual</span>
            <span className="font-mono">
              {target.price ? fmtMoney(target.price, target.currency) : "—"}
              {target.stale && <span className="ml-2 text-warn">(desactualizado)</span>}
            </span>
          </div>
          <div className="flex gap-2">
            {(["amount", "qty"] as const).map((k) => (
              <button key={k} onClick={() => setMode(k)}
                className={`rounded-full px-3 py-1 text-sm ${mode === k ? "bg-primary text-primary-foreground" : "bg-secondary text-muted-foreground"}`}>
                {k === "amount" ? "Importe (€)" : "Cantidad"}
              </button>
            ))}
            {target.side === "sell" && target.held != null && (
              <button className="ml-auto text-sm text-primary" onClick={() => { setMode("qty"); setValue(String(target.held)); }}>
                Vender todo
              </button>
            )}
          </div>
          <Input autoFocus inputMode="decimal" placeholder={mode === "amount" ? "Ej. 1000" : "Ej. 5"} value={value}
            onChange={(e) => setValue(e.target.value)} onKeyDown={(e) => e.key === "Enter" && submit()} />
          <div className="space-y-1 rounded-md bg-secondary p-3 text-sm">
            <div className="flex justify-between"><span className="text-muted-foreground">Cantidad estimada</span><span className="font-mono">{fmtNum(qty)}</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">Total estimado</span><span className="font-mono">{fmtMoney(totalEur)}</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">{target.side === "buy" ? "Saldo disponible" : "Unidades en cartera"}</span>
              <span className="font-mono">{target.side === "buy" ? fmtMoney(cash) : fmtNum(target.held ?? 0)}</span></div>
          </div>
          {insufficient && <p className="text-sm text-loss">Saldo insuficiente para esta compra.</p>}
          {tooMany && <p className="text-sm text-loss">No tienes tantas unidades.</p>}
          {!target.price && <p className="text-sm text-warn">Sin cotización disponible ahora; la operación se validará con el precio del servidor.</p>}
          <Button className="w-full" disabled={m.isPending || !num || insufficient || tooMany} onClick={submit}
            variant={target.side === "sell" ? "destructive" : "default"}>
            {m.isPending ? "Procesando…" : target.side === "buy" ? "Confirmar compra" : "Confirmar venta"}
          </Button>
          <p className="text-xs text-muted-foreground">El precio final se fija en el momento de ejecutar la orden.</p>
        </div>
      </DialogContent>
    </Dialog>
  );
}
