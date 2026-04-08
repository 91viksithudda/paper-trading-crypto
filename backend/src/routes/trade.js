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
      type: Joi.string().valid('BUY', 'SELL', 'LONG', 'SHORT').required(),
      symbol: Joi.string().required(),
      coin: Joi.string().required(),
      quantityInUSD: Joi.number().positive().max(1000000).optional(),
      quantityInCoin: Joi.number().positive().optional(),
      leverage: Joi.number().min(1).max(100).default(1),
      stopLoss: Joi.number().positive().allow(null).optional(),
      takeProfit: Joi.number().positive().allow(null).optional(),
    }).or('quantityInUSD', 'quantityInCoin');

    const { error, value } = schema.validate(req.body);
    if (error) return res.status(400).json({ error: error.details[0].message });

    const currentPrice = getPrice(value.symbol.toUpperCase());
    if (!currentPrice) return res.status(400).json({ error: 'Price not available for this symbol' });

    let quantity, totalValue, costBasis;
    if (value.quantityInUSD) {
      totalValue = value.quantityInUSD;
      quantity = totalValue / currentPrice;
    } else {
      quantity = value.quantityInCoin;
      totalValue = quantity * currentPrice;
    }
    
    // Cost basis is total value divided by leverage
    costBasis = totalValue / value.leverage;

    // Handle LOCAL/IN-MEMORY Mode
    if (process.env.USE_MEMORY === 'true') {
      const userId = req.user._id || req.user.id;
      const user = store.findUserById(userId);
      let profitLoss = 0;

      if (value.type === 'BUY' || value.type === 'LONG' || value.type === 'SHORT') {
        if (user.cashBalance < costBasis) {
          return res.status(400).json({ error: 'Insufficient balance', available: user.cashBalance, required: costBasis });
        }
        user.cashBalance -= costBasis;
        
        // Calculate liquidation price
        let liqPrice = null;
        if (value.leverage > 1) {
          liqPrice = value.type === 'SHORT' 
            ? currentPrice * (1 + 0.9 / value.leverage)
            : currentPrice * (1 - 0.9 / value.leverage);
        }

        user.portfolio.push({ 
          coin: value.coin, 
          symbol: value.symbol.toUpperCase(), 
          quantity, 
          avgBuyPrice: currentPrice,
          leverage: value.leverage,
          stopLoss: value.stopLoss,
          takeProfit: value.takeProfit,
          liquidationPrice: liqPrice,
          type: value.type === 'SHORT' ? 'SHORT' : 'LONG',
          collateral: costBasis
        });
      } else {
        // Simple SELL (Closing a position)
        const holdingIndex = user.portfolio.findIndex(p => p.coin === value.coin);
        if (holdingIndex === -1) return res.status(400).json({ error: 'No position found for this coin' });
        
        const holding = user.portfolio[holdingIndex];
        const isShort = holding.type === 'SHORT';
        
        if (isShort) {
          profitLoss = (holding.avgBuyPrice - currentPrice) * holding.quantity;
        } else {
          profitLoss = (currentPrice - holding.avgBuyPrice) * holding.quantity;
        }
        
        user.cashBalance += (holding.collateral + profitLoss);
        user.portfolio.splice(holdingIndex, 1);
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
        leverage: value.leverage,
        stopLoss: value.stopLoss,
        takeProfit: value.takeProfit,
      });

      return res.json({
        message: `${value.type} order executed successfully`,
        trade,
        cashBalance: user.cashBalance,
      });
    }

    // Handle MONGODB Mode
    const { User, Trade } = getMongoModels();
    const user = await User.findById(req.user._id);
    let profitLoss = 0;

    if (value.type === 'BUY' || value.type === 'LONG' || value.type === 'SHORT') {
      if (user.cashBalance < costBasis) return res.status(400).json({ error: 'Insufficient balance', available: user.cashBalance, required: costBasis });
      
      user.cashBalance -= costBasis;
      
      let liqPrice = null;
      if (value.leverage > 1) {
        liqPrice = value.type === 'SHORT' 
          ? currentPrice * (1 + 0.9 / value.leverage)
          : currentPrice * (1 - 0.9 / value.leverage);
      }

      user.portfolio.push({ 
        coin: value.coin, 
        symbol: value.symbol.toUpperCase(), 
        quantity, 
        avgBuyPrice: currentPrice,
        leverage: value.leverage,
        stopLoss: value.stopLoss,
        takeProfit: value.takeProfit,
        liquidationPrice: liqPrice,
        type: value.type === 'SHORT' ? 'SHORT' : 'LONG',
        collateral: costBasis
      });
    } else {
      const holdingIndex = user.portfolio.findIndex(p => p.coin === value.coin);
      if (holdingIndex === -1) return res.status(400).json({ error: 'No position found' });
      
      const holding = user.portfolio[holdingIndex];
      const isShort = holding.type === 'SHORT';
      
      if (isShort) {
        profitLoss = (holding.avgBuyPrice - currentPrice) * holding.quantity;
      } else {
        profitLoss = (currentPrice - holding.avgBuyPrice) * holding.quantity;
      }
      
      user.cashBalance += (holding.collateral + profitLoss);
      user.portfolio.pull(holding._id);
    }
    
    await user.save();
    const trade = await Trade.create({ 
      userId: user._id, 
      type: value.type, 
      coin: value.coin, 
      symbol: value.symbol.toUpperCase(), 
      quantity, 
      price: currentPrice, 
      totalValue, 
      profitLoss,
      leverage: value.leverage,
      stopLoss: value.stopLoss,
      takeProfit: value.takeProfit
    });

    res.json({ message: `${value.type} order executed successfully`, trade, cashBalance: user.cashBalance });
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
