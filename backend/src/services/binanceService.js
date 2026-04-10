const axios = require('axios');

const BINANCE_BASE = process.env.BINANCE_BASE_URL || 'https://api.binance.com';

// Top 20 crypto symbols to track
const TOP_SYMBOLS = [
  { symbol: 'BTCUSDT', name: 'Bitcoin', coin: 'BTC' },
  { symbol: 'ETHUSDT', name: 'Ethereum', coin: 'ETH' },
  { symbol: 'SOLUSDT', name: 'Solana', coin: 'SOL' },
  { symbol: 'BNBUSDT', name: 'BNB', coin: 'BNB' },
  { symbol: 'XRPUSDT', name: 'XRP', coin: 'XRP' },
  { symbol: 'ADAUSDT', name: 'Cardano', coin: 'ADA' },
  { symbol: 'DOGEUSDT', name: 'Dogecoin', coin: 'DOGE' },
  { symbol: 'AVAXUSDT', name: 'Avalanche', coin: 'AVAX' },
  { symbol: 'DOTUSDT', name: 'Polkadot', coin: 'DOT' },
  { symbol: 'MATICUSDT', name: 'Polygon', coin: 'MATIC' },
  { symbol: 'LINKUSDT', name: 'Chainlink', coin: 'LINK' },
  { symbol: 'LTCUSDT', name: 'Litecoin', coin: 'LTC' },
  { symbol: 'UNIUSDT', name: 'Uniswap', coin: 'UNI' },
  { symbol: 'ATOMUSDT', name: 'Cosmos', coin: 'ATOM' },
  { symbol: 'XLMUSDT', name: 'Stellar', coin: 'XLM' },
  { symbol: 'ALGOUSDT', name: 'Algorand', coin: 'ALGO' },
  { symbol: 'VETUSDT', name: 'VeChain', coin: 'VET' },
  { symbol: 'FTMUSDT', name: 'Fantom', coin: 'FTM' },
  { symbol: 'NEARUSDT', name: 'NEAR Protocol', coin: 'NEAR' },
  { symbol: 'SANDUSDT', name: 'The Sandbox', coin: 'SAND' },
];

// In-memory cache
let priceCache = {};
let ticker24Cache = {};
let lastUpdate = null;
let isFirstLoad = true;

const updatePriceCache = async () => {
  try {
    const symbols = TOP_SYMBOLS.map((s) => s.symbol);
    
    // Strategy: Fetch ALL tickers and filter locally. 
    // This is MORE reliable than passing 'symbols' array which can have encoding issues on some platforms.
    console.log(`📡 Fetching market data from Binance API...`);
    const response = await axios.get(`${BINANCE_BASE}/api/v3/ticker/24hr`, {
      timeout: 10000,
      headers: { 'Accept': 'application/json' }
    });

    if (!Array.isArray(response.data)) {
      throw new Error(`Invalid response format from Binance: ${typeof response.data}`);
    }

    let updatedCount = 0;
    response.data.forEach((ticker) => {
      const meta = TOP_SYMBOLS.find((s) => s.symbol === ticker.symbol);
      if (meta) {
        ticker24Cache[ticker.symbol] = {
          symbol: ticker.symbol,
          coin: meta.coin,
          name: meta.name,
          price: parseFloat(ticker.lastPrice),
          change24h: parseFloat(ticker.priceChangePercent),
          high24h: parseFloat(ticker.highPrice),
          low24h: parseFloat(ticker.lowPrice),
          volume: parseFloat(ticker.volume),
          quoteVolume: parseFloat(ticker.quoteVolume),
        };
        priceCache[ticker.symbol] = parseFloat(ticker.lastPrice);
        updatedCount++;
      }
    });

    if (updatedCount === 0) {
      console.warn('⚠️ Binance symbols found. Check if Binance is restricted in your region.');
    } else {
      lastUpdate = new Date();
      isFirstLoad = false;
      console.log(`✅ Price cache updated: ${updatedCount} coins tracked at ${lastUpdate.toISOString()}`);
    }
  } catch (err) {
    console.error('❌ Failed to update price cache:', err.message);
    
    if (err.response) {
      console.error('Binance Response Error:', err.response.status, err.response.data);
    }
  }
};

const getPrice = (symbol) => {
  return priceCache[symbol] || null;
};

const getAllPrices = () => {
  return Object.values(ticker24Cache);
};

const getKlineData = async (symbol, interval = '1h', limit = 100) => {
  try {
    const response = await axios.get(`${BINANCE_BASE}/api/v3/klines`, {
      params: { symbol, interval, limit },
      timeout: 10000,
    });

    return response.data.map((kline) => ({
      openTime: kline[0],
      open: parseFloat(kline[1]),
      high: parseFloat(kline[2]),
      low: parseFloat(kline[3]),
      close: parseFloat(kline[4]),
      volume: parseFloat(kline[5]),
      closeTime: kline[6],
    }));
  } catch (err) {
    console.error('❌ Failed to fetch kline data:', err.message);
    throw new Error('Failed to fetch chart data');
  }
};

const getLastUpdate = () => lastUpdate;
const getTopSymbols = () => TOP_SYMBOLS;

module.exports = {
  updatePriceCache,
  getPrice,
  getAllPrices,
  getKlineData,
  getLastUpdate,
  getTopSymbols,
};
