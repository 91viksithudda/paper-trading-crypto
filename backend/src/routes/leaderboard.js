const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/auth');
const store = require('../db/inMemoryStore');
const { getAllPrices } = require('../services/binanceService');

router.get('/', protect, async (req, res) => {
  try {
    const prices = getAllPrices();
    let users;

    if (process.env.USE_MEMORY === 'true') {
      users = store.getAllUsers();
    } else {
      const User = require('../models/User');
      users = await User.find({}, 'username cashBalance portfolio totalDeposited createdAt');
    }

    const leaderboard = users.map(user => {
      let holdingsValue = 0;
      user.portfolio.forEach(holding => {
        const priceData = prices.find(p => p.symbol === holding.symbol);
        const currentPrice = priceData ? priceData.price : holding.avgBuyPrice;
        holdingsValue += currentPrice * holding.quantity;
      });
      const totalValue = user.cashBalance + holdingsValue;
      const totalDeposited = user.totalDeposited || 10000;
      const totalPnL = totalValue - totalDeposited;
      const totalPnLPercent = ((totalPnL / totalDeposited) * 100).toFixed(2);
      return { username: user.username, totalValue, totalPnL, totalPnLPercent: parseFloat(totalPnLPercent), joinedAt: user.createdAt };
    });

    leaderboard.sort((a, b) => b.totalValue - a.totalValue);
    const ranked = leaderboard.map((entry, index) => ({ rank: index + 1, ...entry }));

    const myUsername = req.user.username;
    const currentUserRank = ranked.findIndex(e => e.username === myUsername);

    res.json({ data: ranked.slice(0, 50), myRank: currentUserRank + 1, total: ranked.length });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
