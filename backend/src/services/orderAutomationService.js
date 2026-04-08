const { getAllPrices } = require('./binanceService');
const store = require('../db/inMemoryStore');

const checkAutomatedOrders = async () => {
  const prices = getAllPrices();
  if (!prices || prices.length === 0) return;

  const mongoUri = process.env.MONGODB_URI;
  const isMemoryMode = process.env.USE_MEMORY === 'true';

  if (isMemoryMode) {
    const users = store.getAllUsers();
    for (const user of users) {
      let updated = false;
      const positionsToClose = [];

      user.portfolio.forEach((pos, index) => {
        const currentPriceData = prices.find(p => p.symbol === pos.symbol);
        if (!currentPriceData) return;
        const currentPrice = currentPriceData.price;

        let shouldClose = false;
        let reason = '';

        // Check Liquidation
        if (pos.liquidationPrice) {
          if ((pos.type === 'LONG' && currentPrice <= pos.liquidationPrice) ||
              (pos.type === 'SHORT' && currentPrice >= pos.liquidationPrice)) {
            shouldClose = true;
            reason = 'LIQUIDATION';
          }
        }

        // Check Stop Loss
        if (!shouldClose && pos.stopLoss) {
          if ((pos.type === 'LONG' && currentPrice <= pos.stopLoss) ||
              (pos.type === 'SHORT' && currentPrice >= pos.stopLoss)) {
            shouldClose = true;
            reason = 'STOP_LOSS';
          }
        }

        // Check Take Profit
        if (!shouldClose && pos.takeProfit) {
          if ((pos.type === 'LONG' && currentPrice >= pos.takeProfit) ||
              (pos.type === 'SHORT' && currentPrice <= pos.takeProfit)) {
            shouldClose = true;
            reason = 'TAKE_PROFIT';
          }
        }

        if (shouldClose) {
          positionsToClose.push({ index, reason, currentPrice });
        }
      });

      // Close them (reverse order to not mess up indices)
      for (const task of positionsToClose.reverse()) {
        const pos = user.portfolio[task.index];
        const isShort = pos.type === 'SHORT';
        let profitLoss;
        if (isShort) {
          profitLoss = (pos.avgBuyPrice - task.currentPrice) * pos.quantity;
        } else {
          profitLoss = (task.currentPrice - pos.avgBuyPrice) * pos.quantity;
        }

        // If liquidated, user loses all collateral
        const finalPayout = task.reason === 'LIQUIDATION' ? 0 : (pos.collateral + profitLoss);
        user.cashBalance += finalPayout;
        
        user.portfolio.splice(task.index, 1);
        
        store.createTrade({
          userId: user.id || user._id,
          type: 'SELL',
          coin: pos.coin,
          symbol: pos.symbol,
          quantity: pos.quantity,
          price: task.currentPrice,
          totalValue: pos.quantity * task.currentPrice,
          profitLoss: task.reason === 'LIQUIDATION' ? -pos.collateral : profitLoss,
          leverage: pos.leverage,
          reason: task.reason
        });
        updated = true;
      }

      if (updated) store.saveUser(user);
    }
  } else {
    // MongoDB Mode
    try {
      const User = require('../models/User');
      const Trade = require('../models/Trade');
      const users = await User.find({ 'portfolio.0': { $exists: true } });

      for (const user of users) {
        let updated = false;
        const toRemove = [];

        for (const pos of user.portfolio) {
          const currentPriceData = prices.find(p => p.symbol === pos.symbol);
          if (!currentPriceData) continue;
          const currentPrice = currentPriceData.price;

          let shouldClose = false;
          let reason = '';

          if (pos.liquidationPrice && ((pos.type === 'LONG' && currentPrice <= pos.liquidationPrice) || (pos.type === 'SHORT' && currentPrice >= pos.liquidationPrice))) {
            shouldClose = true; reason = 'LIQUIDATION';
          } else if (pos.stopLoss && ((pos.type === 'LONG' && currentPrice <= pos.stopLoss) || (pos.type === 'SHORT' && currentPrice >= pos.stopLoss))) {
            shouldClose = true; reason = 'STOP_LOSS';
          } else if (pos.takeProfit && ((pos.type === 'LONG' && currentPrice >= pos.takeProfit) || (pos.type === 'SHORT' && currentPrice <= pos.takeProfit))) {
            shouldClose = true; reason = 'TAKE_PROFIT';
          }

          if (shouldClose) {
            const isShort = pos.type === 'SHORT';
            let profitLoss = isShort ? (pos.avgBuyPrice - currentPrice) * pos.quantity : (currentPrice - pos.avgBuyPrice) * pos.quantity;
            const finalPayout = reason === 'LIQUIDATION' ? 0 : (pos.collateral + profitLoss);
            
            user.cashBalance += finalPayout;
            toRemove.push(pos._id);
            
            await Trade.create({
              userId: user._id,
              type: 'SELL',
              coin: pos.coin,
              symbol: pos.symbol,
              quantity: pos.quantity,
              price: currentPrice,
              totalValue: pos.quantity * currentPrice,
              profitLoss: reason === 'LIQUIDATION' ? -pos.collateral : profitLoss,
              leverage: pos.leverage,
              reason: reason
            });
            updated = true;
          }
        }

        if (updated) {
          for (const id of toRemove) {
            user.portfolio.pull(id);
          }
          await user.save();
        }
      }
    } catch (err) {
      console.error('Order Automation Error:', err);
    }
  }
};

module.exports = { checkAutomatedOrders };
