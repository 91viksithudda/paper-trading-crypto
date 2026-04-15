const mongoose = require('mongoose');

const referralEarningSchema = new mongoose.Schema({
  referrerId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  referredUserId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  commissionAmount: { type: Number, required: true, default: 25 },
  status: { type: String, enum: ['pending', 'paid'], default: 'paid' },
  createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.models.ReferralEarning || mongoose.model('ReferralEarning', referralEarningSchema);
