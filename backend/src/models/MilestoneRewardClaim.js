const mongoose = require('mongoose');

const milestoneRewardClaimSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  paymentDetails: { type: String, required: true },
  amount: { type: Number, default: 10 },
  status: { type: String, enum: ['pending', 'paid'], default: 'pending' },
  createdAt: { type: Date, default: Date.now },
  processedAt: { type: Date }
});

module.exports = mongoose.models.MilestoneRewardClaim || mongoose.model('MilestoneRewardClaim', milestoneRewardClaimSchema);
