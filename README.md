# BolsaSim: Your Virtual Trading Hub

Crea una aplicación web de simulación de bolsa llamada "BolsaSim", en español, 
pensada como herramienta educativa con dinero virtual (sin riesgo real).

## Concepto general
El usuario empieza con 100.000 € de saldo virtual y puede comprar y vender 
acciones, ETFs, índices, criptomonedas y materias primas a precios reales de 
mercado (obtenidos por API), simulando una cartera de inversión. No hay 
registro de usuarios: todo el estado (saldo, posiciones, listas de seguimiento, 
historial) se guarda en Supabase asociado a un identificador de sesión/dispositivo, 
para que persista aunque cambie de navegador.

## Estructura de la app (una sola página, con tarjetas/secciones)

1. **Cabecera**: título "📈 BolsaSim", saldo en efectivo actual y tipo de cambio 
   USD→EUR visibles en todo momento. Debajo, un ticker horizontal animado 
   (scroll continuo) con las cotizaciones de los activos más relevantes, 
   pausable al pasar el ratón, clicable para ir al activo.

2. **Mercado**: pestañas por categoría — Índices, Acciones, Europa, ETFs, 
   Cripto, Materias primas — cada una con una rejilla de tarjetas de activo 
   (símbolo, nombre, precio, variación 24h en verde/rojo, icono de estrella 
   para añadir a favoritos). Al hacer clic en una tarjeta se abre el modal 
   de compra.

3. **Resumen de cartera**: valor total en € y en $, ganancia/pérdida absoluta 
   y en %, en tarjetas destacadas.

4. **Buscador de activos**: campo de texto que busca en tiempo real (con 
   debounce) acciones, ETFs, criptomonedas y materias primas en varios 
   mercados (EE. UU. y europeos). Resultados con símbolo, nombre, tipo, 
   mercado, precio y botones "Comprar" y "⭐ Añadir a lista".

5. **Listas de seguimiento (watchlists)**: el usuario puede crear varias 
   listas con nombre propio, añadir/quitar activos, renombrarlas o 
   eliminarlas. Cada lista muestra sus activos en una tabla con precio, 
   variación y botón de compra rápida.

6. **Mi cartera**: tabla de posiciones abiertas con cantidad, precio de 
   compra, precio actual, ganancia/pérdida en $, valor en €, y botón para 
   vender (total o parcial). Modal de compra/venta con importe o cantidad, 
   validando que hay saldo suficiente.

7. **Evolución del patrimonio**: gráfico de líneas (valor total de la 
   cartera en € a lo largo del tiempo) que se actualiza con cada operación 
   o refresco de precios.

8. **Ajustes**: panel para que el usuario introduzca su propia clave de API 
   de datos de mercado, sin depender de una clave compartida por defecto. 
   Botón para reiniciar la simulación (vuelve a 100.000 €, borra posiciones 
   e historial).

## Datos de mercado
Necesito obtener precios reales de mercado desde el cliente o mediante una 
edge function de Supabase que actúe de proxy (para evitar problemas de CORS 
y no exponer claves en el frontend). Fuentes a combinar:
- Acciones/ETFs/índices de EE. UU. y Europa
- Criptomonedas
- Materias primas (oro, plata, petróleo, gas, cobre)
Todos los precios deben poder mostrarse convertidos a € y $ (con el tipo de 
cambio actual), y cada activo debe indicar de forma clara si su cotización 
está desactualizada (usando el último precio conocido o el de compra, sin 
que eso cuente como pérdida).

## Diseño
Tema oscuro, estética tipo terminal financiero: fondo casi negro (#0d1117), 
tarjetas en gris oscuro (#161b22) con bordes sutiles, verde para ganancias 
(#22c55e), rojo para pérdidas (#ef4444), azul como color de acento (#3b82f6). 
Tipografía del sistema, interfaz limpia y responsive (funciona bien en móvil), 
con pestañas tipo "pill" y tarjetas de activo compactas en rejilla.

## Avisos legales
Footer fijo con: "⚠️ Simulador educativo con dinero virtual. No constituye 
asesoramiento financiero. Las cotizaciones pueden tener retraso respecto al 
mercado real." Enlaces de vuelta a pepbusquets.com y a las páginas de 
política de privacidad, aviso legal y política de cookies del sitio.

## Notas técnicas
- Usa Supabase para persistencia de estado (saldo, posiciones, listas, 
  historial) y para guardar de forma segura las claves de API que introduzca 
  cada usuario (nunca hardcodeadas en el código fuente).
- El historial de operaciones debe quedar registrado para poder reconstruir 
  el gráfico de evolución del patrimonio.
- Maneja con elegancia los errores de API (límites de peticiones alcanzados, 
  activos no disponibles en el plan gratuito, fallos de red) mostrando 
  mensajes claros al usuario en vez de romper la interfaz.

This project was built with [Lovable](https://lovable.dev).

**Live app**: https://bolsasimu.lovable.app

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/77fc77bd-a2d0-4ecf-af72-10f2b55273b4).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```
