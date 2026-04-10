const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/auth');
const store = require('../db/inMemoryStore');
const { getAllPrices } = require('../services/binanceService');

router.get('/', protect, async (req, res) => {
  try {
    const prices = getAllPrices();

    let user;
    if (process.env.USE_MEMORY === 'true') {
      user = store.findUserById(req.user._id || req.user.id);
    } else {
      const User = require('../models/User');
      user = await User.findById(req.user._id);
    }

    let holdingsValue = 0;
    const holdings = user.portfolio.map(holding => {
      const priceData = prices.find(p => p.symbol === holding.symbol);
      const currentPrice = priceData ? priceData.price : holding.avgBuyPrice;
      
      const isShort = holding.type === 'SHORT';
      let currentValue, profitLoss;
      
      if (isShort) {
        profitLoss = (holding.avgBuyPrice - currentPrice) * holding.quantity;
      } else {
        profitLoss = (currentPrice - holding.avgBuyPrice) * holding.quantity;
      }
      
      currentValue = holding.collateral + profitLoss;
      const investedValue = holding.collateral;
      const pnlPercent = investedValue > 0 ? ((profitLoss / investedValue) * 100).toFixed(2) : '0.00';
      
      holdingsValue += currentValue;
      return { 
        coin: holding.coin, 
        symbol: holding.symbol, 
        quantity: holding.quantity, 
        avgBuyPrice: holding.avgBuyPrice, 
        currentPrice, 
        currentValue, 
        investedValue, 
        pnl: profitLoss, 
        pnlPercent: parseFloat(pnlPercent), 
        change24h: priceData ? priceData.change24h : 0,
        leverage: holding.leverage || 1,
        type: holding.type || 'LONG',
        stopLoss: holding.stopLoss,
        takeProfit: holding.takeProfit,
        liquidationPrice: holding.liquidationPrice
      };
    });

    const totalPortfolioValue = user.cashBalance + holdingsValue;
    const totalInvested = user.totalDeposited || 10000;
    const totalPnL = totalPortfolioValue - totalInvested;
    const totalPnLPercent = ((totalPnL / totalInvested) * 100).toFixed(2);

    res.json({ cashBalance: user.cashBalance, holdingsValue, totalPortfolioValue, totalInvested, totalPnL, totalPnLPercent: parseFloat(totalPnLPercent), holdings });

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

router.get('/stats', protect, async (req, res) => {
  try {
    let trades;
    if (process.env.USE_MEMORY === 'true') {
      const userId = req.user._id || req.user.id;
      trades = store.getAllTradesByUser(userId);
    } else {
      const Trade = require('../models/Trade');
      trades = await Trade.find({ userId: req.user._id });
    }

    const totalTrades = trades.length;
    const buyTrades = trades.filter(t => t.type === 'BUY');
    const sellTrades = trades.filter(t => t.type === 'SELL');
    const totalProfitLoss = trades.reduce((sum, t) => sum + (t.profitLoss || 0), 0);
    const winningTrades = trades.filter(t => t.profitLoss > 0).length;
    const winRate = totalTrades > 0 ? ((winningTrades / totalTrades) * 100).toFixed(1) : 0;

    res.json({ totalTrades, buyTrades: buyTrades.length, sellTrades: sellTrades.length, totalProfitLoss, winningTrades, winRate: parseFloat(winRate) });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

router.post('/set-exit-price', protect, async (req, res) => {
  try {
    const { coin, price } = req.body;
    const targetPrice = parseFloat(price);
    if (isNaN(targetPrice)) return res.status(400).json({ error: 'Invalid price' });

    let user;
    if (process.env.USE_MEMORY === 'true') {
      user = store.findUserById(req.user._id || req.user.id);
    } else {
      const User = require('../models/User');
      user = await User.findById(req.user._id);
    }

    const posIndex = user.portfolio.findIndex(p => p.coin === coin);
    if (posIndex === -1) return res.status(404).json({ error: 'Position not found' });

    const pos = user.portfolio[posIndex];
    const prices = getAllPrices();
    const priceData = prices.find(p => p.symbol === pos.symbol);
    const currentPrice = priceData ? priceData.price : pos.avgBuyPrice;

    // Logic to decide if it's a TP or SL
    // For LONG: Price > Current -> TP, Price < Current -> SL
    // For SHORT: Price < Current -> TP, Price > Current -> SL
    if (pos.type === 'SHORT') {
      if (targetPrice < currentPrice) {
        pos.takeProfit = targetPrice;
      } else {
        pos.stopLoss = targetPrice;
      }
    } else {
      if (targetPrice > currentPrice) {
        pos.takeProfit = targetPrice;
      } else {
        pos.stopLoss = targetPrice;
      }
    }

    if (process.env.USE_MEMORY === 'true') {
      store.saveUser(user);
    } else {
      await user.save();
    }

    res.json({ message: `Exit order set at $${targetPrice}`, portfolio: user.portfolio });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

router.post('/cancel-exit-price', protect, async (req, res) => {
  try {
    const { coin } = req.body;
    
    let user;
    if (process.env.USE_MEMORY === 'true') {
      user = store.findUserById(req.user._id || req.user.id);
    } else {
      const User = require('../models/User');
      user = await User.findById(req.user._id);
    }

    const posIndex = user.portfolio.findIndex(p => p.coin === coin);
    if (posIndex === -1) return res.status(404).json({ error: 'Position not found' });

    user.portfolio[posIndex].takeProfit = null;
    user.portfolio[posIndex].stopLoss = null;

    if (process.env.USE_MEMORY === 'true') {
      store.saveUser(user);
    } else {
      await user.save();
    }

    res.json({ message: `Exit order for ${coin} cancelled`, portfolio: user.portfolio });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
