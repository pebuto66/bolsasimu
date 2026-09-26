import { createFileRoute } from "@tanstack/react-router";
import { BolsaApp } from "@/components/bolsa/BolsaApp";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "BolsaSim — Simulador de bolsa educativo" },
      { name: "description", content: "Practica inversión con 100.000 € virtuales: acciones, ETFs, índices, cripto y materias primas a precios reales." },
      { property: "og:title", content: "BolsaSim — Simulador de bolsa educativo" },
      { property: "og:description", content: "Practica inversión con 100.000 € virtuales a precios reales de mercado, sin riesgo." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: BolsaApp,
});
