import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export const Route = createFileRoute("/reset-password")({
  head: () => ({
    meta: [
      { title: "Restablecer contraseña — BolsaSim" },
      { name: "description", content: "Elige una nueva contraseña para tu cuenta de BolsaSim." },
      { property: "og:title", content: "Restablecer contraseña — BolsaSim" },
      { property: "og:description", content: "Elige una nueva contraseña para tu cuenta de BolsaSim." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ResetPasswordPage,
});

function ResetPasswordPage() {
  const navigate = useNavigate();
  const [ready, setReady] = useState(false);
  const [invalid, setInvalid] = useState(false);
  const [pw, setPw] = useState("");
  const [pw2, setPw2] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    // El enlace del correo llega con type=recovery en el hash; Supabase lo
    // procesa y emite PASSWORD_RECOVERY con una sesión temporal.
    const { data: sub } = supabase.auth.onAuthStateChange((event) => {
      if (event === "PASSWORD_RECOVERY") setReady(true);
    });
    supabase.auth.getSession().then(({ data }) => {
      const hash = window.location.hash;
      if (data.session && hash.includes("type=recovery")) setReady(true);
      else if (!hash.includes("type=recovery") && !data.session) setInvalid(true);
      // Si hay hash de recovery, esperamos al evento PASSWORD_RECOVERY.
      else if (data.session) setReady(true);
      else setInvalid(true);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (pw !== pw2) {
      toast.error("Las contraseñas no coinciden");
      return;
    }
    setBusy(true);
    const { error } = await supabase.auth.updateUser({ password: pw });
    setBusy(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Contraseña actualizada. Ya puedes entrar.");
    navigate({ to: "/" });
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="w-full max-w-sm space-y-5 rounded-2xl border border-border bg-card p-6">
        <div className="text-center">
          <h1 className="text-2xl font-bold">📈 BolsaSim</h1>
          <p className="mt-1 text-sm text-muted-foreground">Elige una nueva contraseña para tu cuenta.</p>
        </div>
        {invalid && !ready ? (
          <div className="space-y-3 text-center">
            <p className="text-sm text-muted-foreground">
              Este enlace no es válido o ha caducado. Pide uno nuevo desde la pantalla de inicio de sesión.
            </p>
            <Button className="w-full" onClick={() => navigate({ to: "/" })}>Volver al inicio</Button>
          </div>
        ) : !ready ? (
          <p className="text-center text-sm text-muted-foreground">Comprobando el enlace…</p>
        ) : (
          <form className="space-y-3" onSubmit={submit}>
            <Input
              type="password"
              required
              minLength={6}
              placeholder="Nueva contraseña"
              value={pw}
              onChange={(e) => setPw(e.target.value)}
            />
            <Input
              type="password"
              required
              minLength={6}
              placeholder="Repite la contraseña"
              value={pw2}
              onChange={(e) => setPw2(e.target.value)}
            />
            <Button type="submit" className="w-full" disabled={busy}>
              Guardar nueva contraseña
            </Button>
          </form>
        )}
      </div>
    </div>
  );
}
