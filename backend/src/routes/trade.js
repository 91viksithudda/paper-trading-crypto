const express = require('express');
const router = express.Router();
const Joi = require('joi');
const { protect } = require('../middleware/auth');
const store = require('../db/inMemoryStore');
const { getPrice, getAllPrices } = require('../services/binanceService');

const getMongoModels = () => {
  if (process.env.USE_MEMORY === 'true') return { User: null, Trade: null };
  try {
    return { User: require('../models/User'), Trade: require('../models/Trade') };
  } catch { return { User: null, Trade: null }; }
};

// Execute trade (BUY or SELL)
router.post('/execute', protect, async (req, res) => {
  try {
    const schema = Joi.object({
      type: Joi.string().valid('BUY', 'SELL').required(),
      symbol: Joi.string().required(),
      coin: Joi.string().required(),
      quantityInUSD: Joi.number().positive().max(1000000).optional(),
      quantityInCoin: Joi.number().positive().optional(),
    }).or('quantityInUSD', 'quantityInCoin');

    const { error, value } = schema.validate(req.body);
    if (error) return res.status(400).json({ error: error.details[0].message });

    const currentPrice = getPrice(value.symbol.toUpperCase());
    if (!currentPrice) return res.status(400).json({ error: 'Price not available for this symbol' });

    let quantity, totalValue;
    if (value.quantityInUSD) {
      quantity = value.quantityInUSD / currentPrice;
      totalValue = value.quantityInUSD;
    } else {
      quantity = value.quantityInCoin;
      totalValue = quantity * currentPrice;
    }

    if (process.env.USE_MEMORY === 'true') {
      const userId = req.user._id || req.user.id;
      const user = store.findUserById(userId);
      let profitLoss = 0;

      if (value.type === 'BUY') {
        if (user.cashBalance < totalValue) {
          return res.status(400).json({ error: 'Insufficient balance', available: user.cashBalance, required: totalValue });
        }
        user.cashBalance -= totalValue;
        const existing = user.portfolio.find(p => p.coin === value.coin);
        if (existing) {
          const totalQty = existing.quantity + quantity;
          existing.avgBuyPrice = (existing.avgBuyPrice * existing.quantity + currentPrice * quantity) / totalQty;
          existing.quantity = totalQty;
        } else {
          user.portfolio.push({ coin: value.coin, symbol: value.symbol.toUpperCase(), quantity, avgBuyPrice: currentPrice });
        }
      } else {
        const holding = user.portfolio.find(p => p.coin === value.coin);
        if (!holding || holding.quantity < quantity) {
          return res.status(400).json({ error: 'Insufficient coin balance', available: holding ? holding.quantity : 0, required: quantity });
        }
        profitLoss = (currentPrice - holding.avgBuyPrice) * quantity;
        user.cashBalance += totalValue;
        holding.quantity -= quantity;
        if (holding.quantity < 0.000001) {
          user.portfolio = user.portfolio.filter(p => p.coin !== value.coin);
        }
      }
      store.saveUser(user);

      const trade = store.createTrade({
        userId,
        type: value.type,
        coin: value.coin,
        symbol: value.symbol.toUpperCase(),
        quantity,
        price: currentPrice,
        totalValue,
        profitLoss,
      });

      return res.json({
        message: `${value.type} order executed successfully`,
        trade: { id: trade._id, type: trade.type, coin: trade.coin, quantity: trade.quantity, price: trade.price, totalValue: trade.totalValue, profitLoss: trade.profitLoss, timestamp: trade.timestamp },
        cashBalance: user.cashBalance,
      });
    }

    // MongoDB mode
    const { User, Trade } = getMongoModels();
    const user = await User.findById(req.user._id);
    let profitLoss = 0;

    if (value.type === 'BUY') {
      if (user.cashBalance < totalValue) return res.status(400).json({ error: 'Insufficient balance', available: user.cashBalance, required: totalValue });
      user.cashBalance -= totalValue;
      const existing = user.portfolio.find(p => p.coin === value.coin);
      if (existing) {
        const totalQty = existing.quantity + quantity;
        existing.avgBuyPrice = (existing.avgBuyPrice * existing.quantity + currentPrice * quantity) / totalQty;
        existing.quantity = totalQty;
      } else {
        user.portfolio.push({ coin: value.coin, symbol: value.symbol.toUpperCase(), quantity, avgBuyPrice: currentPrice });
      }
    } else {
      const holding = user.portfolio.find(p => p.coin === value.coin);
      if (!holding || holding.quantity < quantity) return res.status(400).json({ error: 'Insufficient coin balance', available: holding ? holding.quantity : 0, required: quantity });
      profitLoss = (currentPrice - holding.avgBuyPrice) * quantity;
      user.cashBalance += totalValue;
      holding.quantity -= quantity;
      if (holding.quantity < 0.000001) user.portfolio = user.portfolio.filter(p => p.coin !== value.coin);
    }
    await user.save();

    const trade = await Trade.create({ userId: user._id, type: value.type, coin: value.coin, symbol: value.symbol.toUpperCase(), quantity, price: currentPrice, totalValue, profitLoss });
    res.json({ message: `${value.type} order executed successfully`, trade: { id: trade._id, type: trade.type, coin: trade.coin, quantity: trade.quantity, price: trade.price, totalValue: trade.totalValue, profitLoss: trade.profitLoss, timestamp: trade.timestamp }, cashBalance: user.cashBalance });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Trade execution failed' });
  }
});

// Get trade history
router.get('/history', protect, async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = Math.min(parseInt(req.query.limit) || 20, 100);
    const skip = (page - 1) * limit;

    if (process.env.USE_MEMORY === 'true') {
      const userId = req.user._id || req.user.id;
      const { data, total } = store.getTradesByUser(userId, skip, limit);
      return res.json({ data, pagination: { page, limit, total, pages: Math.ceil(total / limit) } });
    }

    const { Trade } = getMongoModels();
    const [trades, total] = await Promise.all([
      Trade.find({ userId: req.user._id }).sort({ timestamp: -1 }).skip(skip).limit(limit),
      Trade.countDocuments({ userId: req.user._id }),
    ]);
    res.json({ data: trades, pagination: { page, limit, total, pages: Math.ceil(total / limit) } });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// AI mock suggestions
router.get('/suggestions', protect, (req, res) => {
  const suggestions = [
    { coin: 'BTC', action: 'BUY', reason: 'Strong bullish momentum on 4H chart. RSI showing oversold conditions.', confidence: 78 },
    { coin: 'ETH', action: 'HOLD', reason: 'Consolidating near key support. Wait for breakout confirmation.', confidence: 65 },
    { coin: 'SOL', action: 'BUY', reason: 'Breaking out of descending wedge pattern. Volume increasing.', confidence: 72 },
    { coin: 'DOGE', action: 'SELL', reason: 'Overbought on RSI. Resistance at current levels. Consider taking profit.', confidence: 61 },
    { coin: 'AVAX', action: 'BUY', reason: 'Strong ecosystem growth. Institutional buying detected.', confidence: 69 },
  ];
  res.json({ data: suggestions, disclaimer: 'AI suggestions are for educational purposes only. Not financial advice.' });
});

module.exports = router;
