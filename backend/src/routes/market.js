const express = require('express');
const router = express.Router();
const axios = require('axios');
const { getAllPrices, getKlineData, getLastUpdate, getTopSymbols } = require('../services/binanceService');
const BINANCE_BASE = process.env.BINANCE_BASE_URL || 'https://api.binance.com';

// ====== PROXY RAW BINANCE ENDPOINTS ======
router.get('/proxy/klines', async (req, res) => {
  try {
    const { symbol, interval, limit } = req.query;
    const r = await axios.get(`${BINANCE_BASE}/api/v3/klines`, { params: { symbol, interval, limit } });
    res.json(r.data);
  } catch (e) { res.status(500).json({error: e.message}); }
});

router.get('/proxy/ticker/price', async (req, res) => {
  try {
    const { symbol } = req.query;
    const r = await axios.get(`${BINANCE_BASE}/api/v3/ticker/price`, { params: { symbol } });
    res.json(r.data);
  } catch (e) { res.status(500).json({error: e.message}); }
});

router.get('/proxy/depth', async (req, res) => {
  try {
    const { symbol, limit } = req.query;
    const r = await axios.get(`${BINANCE_BASE}/api/v3/depth`, { params: { symbol, limit } });
    res.json(r.data);
  } catch (e) { res.status(500).json({error: e.message}); }
});
// =========================================


// Get all market prices
router.get('/prices', (req, res) => {
  const prices = getAllPrices();
  res.json({
    data: prices,
    lastUpdate: getLastUpdate(),
  });
});

// Get single coin price
router.get('/price/:symbol', (req, res) => {
  const { symbol } = req.params;
  const prices = getAllPrices();
  const coin = prices.find((p) => p.symbol === symbol.toUpperCase() + 'USDT' || p.symbol === symbol.toUpperCase());

  if (!coin) {
    return res.status(404).json({ error: 'Symbol not found' });
  }
  res.json({ data: coin });
});

// Get kline/candlestick data
router.get('/klines/:symbol', async (req, res) => {
  try {
    const { symbol } = req.params;
    const { interval = '1h', limit = 100 } = req.query;

    const validIntervals = ['1m', '5m', '15m', '30m', '1h', '4h', '1d', '1w'];
    if (!validIntervals.includes(interval)) {
      return res.status(400).json({ error: 'Invalid interval' });
    }

    const binanceSymbol = symbol.toUpperCase().includes('USDT')
      ? symbol.toUpperCase()
      : `${symbol.toUpperCase()}USDT`;

    const klines = await getKlineData(binanceSymbol, interval, Math.min(parseInt(limit), 500));
    res.json({ data: klines, symbol: binanceSymbol });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get supported coins list
router.get('/coins', (req, res) => {
  res.json({ data: getTopSymbols() });
});

module.exports = router;
