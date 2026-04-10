const mongoose = require('mongoose');

const tradeSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true,
  },
  type: {
    type: String,
    enum: ['BUY', 'SELL', 'LONG', 'SHORT'],
    required: true,
  },
  coin: {
    type: String,
    required: true,
  },
  symbol: {
    type: String,
    required: true,
  },
  quantity: {
    type: Number,
    required: true,
    min: 0,
  },
  price: {
    type: Number,
    required: true,
    min: 0,
  },
  totalValue: {
    type: Number,
    required: true,
    min: 0,
  },
  profitLoss: {
    type: Number,
    default: 0,
  },
  leverage: { type: Number, default: 1 },
  stopLoss: { type: Number, default: null },
  takeProfit: { type: Number, default: null },
  reason: { type: String, default: null },
  timestamp: {
    type: Date,
    default: Date.now,
    index: true,
  },
});

module.exports = mongoose.models.Trade || mongoose.model('Trade', tradeSchema);
