export type AssetType = "index" | "stock" | "etf" | "crypto" | "commodity";
export type Asset = { symbol: string; name: string; type: AssetType };

export const CATEGORIES: { id: string; label: string; assets: Asset[] }[] = [
  {
    id: "indices",
    label: "Índices",
    assets: [
      { symbol: "^GSPC", name: "S&P 500", type: "index" },
      { symbol: "^IXIC", name: "Nasdaq Composite", type: "index" },
      { symbol: "^DJI", name: "Dow Jones", type: "index" },
      { symbol: "^IBEX", name: "IBEX 35", type: "index" },
      { symbol: "^STOXX50E", name: "Euro Stoxx 50", type: "index" },
      { symbol: "^GDAXI", name: "DAX", type: "index" },
      { symbol: "^FCHI", name: "CAC 40", type: "index" },
      { symbol: "^FTSE", name: "FTSE 100", type: "index" },
    ],
  },
  {
    id: "acciones",
    label: "Acciones",
    assets: [
      { symbol: "AAPL", name: "Apple", type: "stock" },
      { symbol: "MSFT", name: "Microsoft", type: "stock" },
      { symbol: "NVDA", name: "NVIDIA", type: "stock" },
      { symbol: "AMZN", name: "Amazon", type: "stock" },
      { symbol: "GOOGL", name: "Alphabet", type: "stock" },
      { symbol: "META", name: "Meta Platforms", type: "stock" },
      { symbol: "TSLA", name: "Tesla", type: "stock" },
      { symbol: "JPM", name: "JPMorgan Chase", type: "stock" },
    ],
  },
  {
    id: "europa",
    label: "Europa",
    assets: [
      { symbol: "SAN.MC", name: "Banco Santander", type: "stock" },
      { symbol: "ITX.MC", name: "Inditex", type: "stock" },
      { symbol: "IBE.MC", name: "Iberdrola", type: "stock" },
      { symbol: "BBVA.MC", name: "BBVA", type: "stock" },
      { symbol: "ASML.AS", name: "ASML", type: "stock" },
      { symbol: "SAP.DE", name: "SAP", type: "stock" },
      { symbol: "MC.PA", name: "LVMH", type: "stock" },
      { symbol: "NESN.SW", name: "Nestlé", type: "stock" },
    ],
  },
  {
    id: "etfs",
    label: "ETFs",
    assets: [
      { symbol: "SPY", name: "SPDR S&P 500", type: "etf" },
      { symbol: "QQQ", name: "Invesco QQQ", type: "etf" },
      { symbol: "VOO", name: "Vanguard S&P 500", type: "etf" },
      { symbol: "VTI", name: "Vanguard Total Market", type: "etf" },
      { symbol: "VWCE.DE", name: "Vanguard FTSE All-World", type: "etf" },
      { symbol: "IWDA.AS", name: "iShares MSCI World", type: "etf" },
      { symbol: "GLD", name: "SPDR Gold Shares", type: "etf" },
      { symbol: "EEM", name: "iShares MSCI Emerging", type: "etf" },
    ],
  },
  {
    id: "cripto",
    label: "Cripto",
    assets: [
      { symbol: "BTC-USD", name: "Bitcoin", type: "crypto" },
      { symbol: "ETH-USD", name: "Ethereum", type: "crypto" },
      { symbol: "SOL-USD", name: "Solana", type: "crypto" },
      { symbol: "XRP-USD", name: "XRP", type: "crypto" },
      { symbol: "BNB-USD", name: "BNB", type: "crypto" },
      { symbol: "ADA-USD", name: "Cardano", type: "crypto" },
      { symbol: "DOGE-USD", name: "Dogecoin", type: "crypto" },
      { symbol: "DOT-USD", name: "Polkadot", type: "crypto" },
    ],
  },
  {
    id: "materias",
    label: "Materias primas",
    assets: [
      { symbol: "GC=F", name: "Oro", type: "commodity" },
      { symbol: "SI=F", name: "Plata", type: "commodity" },
      { symbol: "CL=F", name: "Petróleo WTI", type: "commodity" },
      { symbol: "BZ=F", name: "Petróleo Brent", type: "commodity" },
      { symbol: "NG=F", name: "Gas natural", type: "commodity" },
      { symbol: "HG=F", name: "Cobre", type: "commodity" },
    ],
  },
];

export const ALL_ASSETS = CATEGORIES.flatMap((c) => c.assets);

export const TICKER_SYMBOLS = [
  "^GSPC", "^IXIC", "^IBEX", "^GDAXI", "AAPL", "NVDA", "MSFT", "SAN.MC", "ITX.MC",
  "BTC-USD", "ETH-USD", "GC=F", "CL=F",
];

export const TYPE_LABEL: Record<string, string> = {
  index: "Índice",
  stock: "Acción",
  etf: "ETF",
  crypto: "Cripto",
  commodity: "Materia prima",
};

export const START_CASH = 100000;
