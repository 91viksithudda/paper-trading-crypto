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
  const tryFetch = async (url, providerName, mapper) => {
    try {
      console.log(`📡 Fetching from ${providerName}...`);
      const res = await axios.get(url, { timeout: 12000 });
      const count = mapper(res.data);
      if (count > 0) {
        lastUpdate = new Date();
        isFirstLoad = false;
        console.log(`✅ Cache updated via ${providerName}: ${count} coins`);
        return true;
      }
    } catch (e) {
      console.warn(`⚠️ ${providerName} failed: ${e.message}`);
      return false;
    }
    return false;
  };

  // 1. Try Binance (Primary)
  const binanceSuccess = await tryFetch(`${BINANCE_BASE}/api/v3/ticker/24hr`, 'Binance', (data) => {
    let count = 0;
    if (!Array.isArray(data)) return 0;
    data.forEach(t => {
      const meta = TOP_SYMBOLS.find(s => s.symbol === t.symbol);
      if (meta) {
        ticker24Cache[t.symbol] = {
          symbol: t.symbol, coin: meta.coin, name: meta.name,
          price: parseFloat(t.lastPrice), change24h: parseFloat(t.priceChangePercent),
          high24h: parseFloat(t.highPrice), low24h: parseFloat(t.lowPrice),
          volume: parseFloat(t.volume), quoteVolume: parseFloat(t.quoteVolume)
        };
        priceCache[t.symbol] = parseFloat(t.lastPrice);
        count++;
      }
    });
    return count;
  });
  if (binanceSuccess) return;

  // 2. Try CoinGecko (Fallback 1 - Very Reliable)
  const coingeckoSuccess = await tryFetch('https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&order=market_cap_desc&per_page=100&sparkline=false', 'CoinGecko', (data) => {
    let count = 0;
    if (!Array.isArray(data)) return 0;
    data.forEach(coin => {
      const meta = TOP_SYMBOLS.find(s => s.coin === coin.symbol.toUpperCase());
      if (meta) {
        const price = coin.current_price;
        ticker24Cache[meta.symbol] = {
          symbol: meta.symbol, coin: meta.coin, name: meta.name,
          price: price, change24h: coin.price_change_percentage_24h || 0,
          high24h: coin.high_24h || price, low24h: coin.low_24h || price,
          volume: coin.total_volume, quoteVolume: coin.market_cap
        };
        priceCache[meta.symbol] = price;
        count++;
      }
    });
    return count;
  });
  if (coingeckoSuccess) return;

  // 3. Try CoinCap (Fallback 2)
  await tryFetch('https://api.coincap.io/v2/assets?limit=100', 'CoinCap', (data) => {
    let count = 0;
    if (!data || !data.data) return 0;
    data.data.forEach(asset => {
      const meta = TOP_SYMBOLS.find(s => s.coin === asset.symbol);
      if (meta) {
        const price = parseFloat(asset.priceUsd);
        ticker24Cache[meta.symbol] = {
          symbol: meta.symbol, coin: meta.coin, name: meta.name,
          price: price, change24h: parseFloat(asset.changePercent24Hr),
          high24h: price, low24h: price, volume: parseFloat(asset.volumeUsd24Hr), quoteVolume: 0
        };
        priceCache[meta.symbol] = price;
        count++;
      }
    });
    return count;
  });
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
