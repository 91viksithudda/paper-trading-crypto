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
    console.log(`📡 Fetching market data (Primary: Binance)...`);
    const response = await axios.get(`${BINANCE_BASE}/api/v3/ticker/24hr`, {
      timeout: 8000,
      headers: { 'Accept': 'application/json' }
    });

    let updatedCount = 0;
    response.data.forEach((ticker) => {
      const meta = TOP_SYMBOLS.find((s) => s.symbol === ticker.symbol);
      if (meta) {
        ticker24Cache[ticker.symbol] = {
          symbol: ticker.symbol, coin: meta.coin, name: meta.name,
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

    if (updatedCount > 0) {
      lastUpdate = new Date();
      isFirstLoad = false;
      console.log(`✅ Price cache updated via Binance: ${updatedCount} coins`);
      return;
    }
  } catch (err) {
    const isRestricted = err.response && err.response.status === 451;
    console.warn(isRestricted ? '⚠️ Binance restricted this region (451). Switching to Fallback...' : `❌ Binance Error: ${err.message}`);
    
    // FALLBACK: Use CoinCap API (No region blocking for Render)
    try {
      console.log(`🔌 Fetching fallback data from CoinCap...`);
      const ccRes = await axios.get('https://api.coincap.io/v2/assets', { 
        params: { limit: 100 },
        timeout: 10000 
      });

      let updatedCount = 0;
      ccRes.data.data.forEach(asset => {
        const meta = TOP_SYMBOLS.find(s => s.coin === asset.symbol);
        if (meta) {
          const price = parseFloat(asset.priceUsd);
          const change = parseFloat(asset.changePercent24Hr);
          ticker24Cache[meta.symbol] = {
            symbol: meta.symbol, coin: meta.coin, name: meta.name,
            price: price,
            change24h: change,
            high24h: price * (1 + Math.abs(change)/100), // Est
            low24h: price * (1 - Math.abs(change)/100),  // Est
            volume: parseFloat(asset.volumeUsd24Hr),
            quoteVolume: parseFloat(asset.vwap24Hr)
          };
          priceCache[meta.symbol] = price;
          updatedCount++;
        }
      });

      if (updatedCount > 0) {
        lastUpdate = new Date();
        isFirstLoad = false;
        console.log(`✅ Price cache updated via Fallback (CoinCap): ${updatedCount} coins`);
      }
    } catch (ccErr) {
      console.error('❌ All price providers failed:', ccErr.message);
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
